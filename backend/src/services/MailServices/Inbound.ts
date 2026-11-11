import { getSetting } from "../../helpers/AppSettings";
import { isEmail } from "../../helpers/Email";
import { openSecret } from "../../helpers/Secrets";
import { logger } from "../../utils/logger";
import type { CreateEmailOptions, GetReceivingEmailResponseSuccess } from "resend";
import { readMailConfig, resendClient } from "./SendMail";

const escape = (v: string): string => String(v || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

// The forwarded e-mail: who wrote, to which address, when, and the message as it came; the original .eml attached when it could be downloaded.
export const forwardOf = (e: GetReceivingEmailResponseSuccess, to: string, from: string, eml: Buffer | null): CreateEmailOptions => {
  const subject = String(e.subject || "(sem assunto)");
  const head = [`De: ${e.from}`, `Para: ${(e.to || []).join(", ")}`, `Data: ${e.created_at}`, `Assunto: ${subject}`];
  const replyTo = (e.reply_to && e.reply_to.length ? e.reply_to : [e.from]).filter(Boolean);
  return {
    from,
    to: [to],
    subject: subject.startsWith("Fwd:") ? subject : `Fwd: ${subject}`,
    ...(replyTo.length ? { replyTo } : {}),
    text: `---------- Mensagem encaminhada ----------\n${head.join("\n")}\n\n${e.text || "(veja a mensagem original em anexo)"}`,
    html: `<p style="color:#555">---------- Mensagem encaminhada ----------<br>${head.map(escape).join("<br>")}</p><hr>${e.html || `<pre style="white-space:pre-wrap">${escape(e.text || "(veja a mensagem original em anexo)")}</pre>`}`,
    ...(eml ? { attachments: [{ filename: "mensagem-original.eml", content: eml.toString("base64"), contentType: "message/rfc822" }] } : {})
  };
};

// The receiving domain of Resend (mail.<domain>): whatever arrives there is forwarded, as it came (attachments included), to the address of the
// team set on the Configurações screen. Resend calls the webhook with only the metadata of the e-mail; the forward fetches the content itself.
// The request is checked against the signing secret of the webhook before anything is done.
export interface InboundHeaders {
  id: string;
  timestamp: string;
  signature: string;
}

export type InboundResult = { status: number; body: Record<string, any> };

export const handleInbound = async (rawBody: string, headers: InboundHeaders): Promise<InboundResult> => {
  const secret = openSecret(await getSetting("mail_inbound_secret", ""));
  const cfg = await readMailConfig();
  if (!secret || !cfg.resendKey) return { status: 503, body: { error: "receiving not configured" } };
  if (!headers.id || !headers.timestamp || !headers.signature) return { status: 400, body: { error: "invalid webhook" } };
  const resend = resendClient(cfg.resendKey);
  let event: any;
  try {
    // throws when the signature does not match the raw body (or the timestamp is too old)
    event = resend.webhooks.verify({ payload: rawBody, headers, webhookSecret: secret });
  } catch (err) {
    return { status: 400, body: { error: "invalid webhook" } };
  }
  if (event?.type !== "email.received") return { status: 200, body: { ignored: event?.type || null } };

  const forwardTo = String(await getSetting("mail_forward_to", "")).trim();
  const emailId = String(event?.data?.email_id || "");
  if (!emailId) return { status: 400, body: { error: "no email id" } };
  if (!isEmail(forwardTo) || !cfg.fromEmail) {
    logger.warn(`inbound e-mail ${emailId} not forwarded: no forwarding address or sender set`);
    return { status: 200, body: { forwarded: false } };
  }
  const got = await resend.emails.receiving.get(emailId);
  if (got.error || !got.data) {
    logger.warn(`inbound e-mail ${emailId} not read: ${got.error?.statusCode ?? ""} ${got.error?.name} ${got.error?.message}`);
    return { status: 502, body: { forwarded: false } };
  }
  const original = got.data;
  // the whole e-mail as it came (attachments included) goes along as a .eml, so nothing is lost even when the body is long or odd
  let eml: Buffer | null = null;
  if (original.raw?.download_url) {
    try {
      const r = await fetch(original.raw.download_url);
      if (r.ok) eml = Buffer.from(await r.arrayBuffer());
    } catch (err) {
      logger.warn(`inbound e-mail ${emailId}: raw content not downloaded: ${(err as Error).message}`);
    }
  }
  // the id of the e-mail is the idempotency key: Resend retries a webhook that failed, and the team gets the e-mail once.
  // The answer of the team goes to whoever wrote (reply-to), not back to the domain.
  const { data, error } = await resend.emails.send(forwardOf(original, forwardTo, `${cfg.fromName.replace(/["<>]/g, "")} <${cfg.fromEmail}>`, eml), { idempotencyKey: `inbound-forward/${emailId}` });
  if (error) {
    logger.warn(`inbound e-mail ${emailId} not forwarded: ${error.statusCode ?? ""} ${error.name} ${error.message}`);
    // a 5xx makes Resend try the webhook again later
    return { status: 502, body: { forwarded: false } };
  }
  logger.info(`inbound e-mail ${emailId} forwarded (${data?.id})`);
  return { status: 200, body: { forwarded: true } };
};
