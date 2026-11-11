import { getSetting } from "../../helpers/AppSettings";
import { isEmail } from "../../helpers/Email";
import { openSecret } from "../../helpers/Secrets";
import { logger } from "../../utils/logger";
import type { CreateEmailOptions, GetReceivingEmailResponseSuccess } from "resend";
import { readMailConfig, resendClient } from "./SendMail";
import { domainOf, forwardTargets, loadAliasTable } from "./Aliases";
import User from "../../models/User";

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

// The receiving domain of Resend (mail.<domain>): whatever arrives there is forwarded, as it came (attachments included), to the e-mail of the
// person who owns the address (joao.silva@ → João Silva, see Aliases.ts); an address without an owner goes to the management address set on the
// Configurações screen (or to the administrators). Resend calls the webhook with only the metadata of the e-mail; the forward fetches the content itself.
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

  const emailId = String(event?.data?.email_id || "");
  if (!emailId) return { status: 400, body: { error: "no email id" } };
  if (!cfg.fromEmail) {
    logger.warn(`inbound e-mail ${emailId} not forwarded: no sender set`);
    return { status: 200, body: { forwarded: false } };
  }
  // each address of the domain goes to its owner (the person whose name made it); without an owner, to the management address
  // set on the Configurações screen, or else to the administrators
  const management = String(await getSetting("mail_forward_to", "")).trim();
  const fallback = isEmail(management)
    ? [management]
    : (await User.findAll({ where: { profile: "admin" }, attributes: ["email"], raw: true }) as any[]).map(u => String(u.email || ""));
  const targets = forwardTargets(event?.data?.to || [], domainOf(cfg.fromEmail), await loadAliasTable(), fallback);
  if (!targets.length) {
    logger.warn(`inbound e-mail ${emailId} not forwarded: nobody to forward it to`);
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
  // the id of the e-mail and the destination make the idempotency key: Resend retries a webhook that failed, and each person gets the e-mail once.
  // The answer goes to whoever wrote (reply-to), not back to the domain.
  const from = `${cfg.fromName.replace(/["<>]/g, "")} <${cfg.fromEmail}>`;
  let failed = false;
  for (const to of targets) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await resend.emails.send(forwardOf(original, to, from, eml), { idempotencyKey: `inbound-forward/${emailId}/${to}` });
    if (error) {
      failed = true;
      logger.warn(`inbound e-mail ${emailId} not forwarded: ${error.statusCode ?? ""} ${error.name} ${error.message}`);
    } else logger.info(`inbound e-mail ${emailId} forwarded (${data?.id})`);
  }
  // a 5xx makes Resend try the webhook again later; the ones already sent are not repeated (same keys)
  if (failed) return { status: 502, body: { forwarded: false } };
  return { status: 200, body: { forwarded: true, count: targets.length } };
};
