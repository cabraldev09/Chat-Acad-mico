import { randomUUID } from "crypto";
import nodemailer from "nodemailer";
import { Resend, type CreateEmailOptions } from "resend";

import AppError from "../../errors/AppError";
import { getSetting } from "../../helpers/AppSettings";
import { openSecret } from "../../helpers/Secrets";
import { logger } from "../../utils/logger";
import { logoAttachments } from "./Logo";

// The e-mail the system sends from (password recovery, the team, the affiliates, the student portal). The administration picks the provider on the
// Configurações screen: an SMTP account (the server, the account and its "app password") or Resend (an API key and a sender on a verified domain).
// Every e-mail of the system goes through sendMail, whatever the provider.
export type MailProvider = "smtp" | "resend";

export interface MailConfig {
  provider: MailProvider;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  // Resend: the sending key (restricted to sending) and the address on the verified domain
  resendKey: string;
  fromEmail: string;
  // where the answers of the people go (a "nao-responda@" sender still lets them write back somewhere)
  replyTo: string;
}

export const DEFAULT_MAIL = { host: "smtp.gmail.com", port: 465, secure: true, user: "", fromName: "Cruzeiro do Sul Virtual" };

export const readMailConfig = async (): Promise<MailConfig> => {
  const port = Number(await getSetting("mail_port", String(DEFAULT_MAIL.port))) || DEFAULT_MAIL.port;
  const secureRaw = await getSetting("mail_secure", "");
  return {
    provider: (await getSetting("mail_provider", "smtp")) === "resend" ? "resend" : "smtp",
    host: (await getSetting("mail_host", DEFAULT_MAIL.host)) || DEFAULT_MAIL.host,
    port,
    // port 465 is TLS from the start; the others upgrade to TLS when the server offers it
    secure: secureRaw === "" ? port === 465 : secureRaw === "true",
    user: (await getSetting("mail_user", DEFAULT_MAIL.user)) || DEFAULT_MAIL.user,
    pass: openSecret(await getSetting("mail_pass", "")),
    fromName: (await getSetting("mail_from_name", DEFAULT_MAIL.fromName)) || DEFAULT_MAIL.fromName,
    resendKey: openSecret(await getSetting("mail_resend_key", "")),
    fromEmail: await getSetting("mail_from_email", ""),
    replyTo: await getSetting("mail_reply_to", "")
  };
};

export const mailConfigured = async (): Promise<boolean> => {
  const c = await readMailConfig();
  return c.provider === "resend" ? !!(c.resendKey && c.fromEmail) : !!(c.pass && c.user);
};

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  // the same send repeated (a click twice, a retry of the caller) is delivered once by Resend; one per attempt or event
  idempotencyKey?: string;
  replyTo?: string;
}

const masked = (to: string): string => to.replace(/(.).+(@.+)/, "$1***$2");
const senderName = (cfg: MailConfig): string => cfg.fromName.replace(/["<>]/g, "");

// ---------------------------------------------------------------- SMTP
const sendSmtp = async (cfg: MailConfig, mail: Mail): Promise<void> => {
  if (!cfg.pass) throw new AppError("ERR_MAIL_NOT_CONFIGURED", 400);
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  });
  try {
    await transport.sendMail({
      from: `"${senderName(cfg)}" <${cfg.user}>`, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html,
      ...(mail.replyTo || cfg.replyTo ? { replyTo: mail.replyTo || cfg.replyTo } : {}),
      attachments: logoAttachments(mail.html)
    });
  } catch (err) {
    logger.warn(`mail to ${masked(mail.to)} failed: ${(err as Error).message}`);
    throw new AppError("ERR_MAIL_SEND_FAILED", 502);
  } finally {
    transport.close();
  }
};

// ---------------------------------------------------------------- Resend (official SDK)
const RESEND_TRIES = 3;
const pause = (ms: number): Promise<void> => new Promise<void>(resolve => { setTimeout(resolve, ms); });

// one client per key (the key can change on the Configurações screen)
let client: { key: string; resend: Resend } | null = null;
export const resendClient = (key: string): Resend => {
  if (!client || client.key !== key) client = { key, resend: new Resend(key) };
  return client.resend;
};

// the e-mail for the SDK: the logo goes inline (contentId = the "cid:" of the html), the reply-to when there is one
export const resendPayload = (cfg: MailConfig, mail: Mail): CreateEmailOptions => ({
  from: `${senderName(cfg)} <${cfg.fromEmail}>`,
  to: [mail.to],
  subject: mail.subject,
  html: mail.html,
  text: mail.text,
  ...(mail.replyTo || cfg.replyTo ? { replyTo: mail.replyTo || cfg.replyTo } : {}),
  attachments: logoAttachments(mail.html).map(a => ({ filename: a.filename, content: a.content.toString("base64"), contentType: a.contentType, contentId: a.cid }))
});

// The SDK answers { data, error } and does not throw: a 429 or a 5xx (or no answer at all) is tried again, any other error is a mistake of the request.
const retryable = (status: number | null | undefined, name?: string): boolean =>
  !status || status === 429 || status >= 500 || name === "rate_limit_exceeded" || name === "application_error" || name === "internal_server_error";

export const sendResend = async (cfg: MailConfig, mail: Mail, wait: (ms: number) => Promise<void> = pause): Promise<string> => {
  if (!cfg.resendKey || !cfg.fromEmail) throw new AppError("ERR_MAIL_NOT_CONFIGURED", 400);
  const resend = resendClient(cfg.resendKey);
  // the same key on every try: Resend delivers the e-mail once even if a try that "failed" had reached it
  const idempotencyKey = (mail.idempotencyKey || randomUUID()).slice(0, 256);
  let last = "";
  for (let attempt = 1; attempt <= RESEND_TRIES; attempt += 1) {
    let status: number | null = null;
    let name: string | undefined;
    try {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await resend.emails.send(resendPayload(cfg, mail), { idempotencyKey });
      if (!error && data) {
        logger.info(`mail to ${masked(mail.to)} sent by Resend (${data.id})`);
        return data.id;
      }
      status = error ? error.statusCode : null;
      name = error?.name;
      last = `${status ?? ""} ${error?.name || ""} ${error?.message || ""}`.trim();
    } catch (err) {
      last = (err as Error).message;
    }
    if (!retryable(status, name)) break;
    // eslint-disable-next-line no-await-in-loop
    if (attempt < RESEND_TRIES) await wait(1000 * 2 ** (attempt - 1));
  }
  logger.warn(`mail to ${masked(mail.to)} failed on Resend: ${last}`);
  throw new AppError("ERR_MAIL_SEND_FAILED", 502);
};

export const sendMail = async (mail: Mail): Promise<void> => {
  const cfg = await readMailConfig();
  if (cfg.provider === "resend") {
    await sendResend(cfg, mail);
    return;
  }
  await sendSmtp(cfg, mail);
};
