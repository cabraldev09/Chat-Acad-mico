import nodemailer from "nodemailer";

import AppError from "../../errors/AppError";
import { getSetting } from "../../helpers/AppSettings";
import { openSecret } from "../../helpers/Secrets";
import { logger } from "../../utils/logger";
import { logoAttachments } from "./Logo";

// The e-mail account the system sends from (password recovery). Everything is set by the administration on the
// Configurações screen; the defaults are the company Gmail account, which needs an "app password" typed there.
export interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
}

export const DEFAULT_MAIL = { host: "smtp.gmail.com", port: 465, secure: true, user: "cruzeirogpt@gmail.com", fromName: "Cruzeiro do Sul Virtual" };

export const readMailConfig = async (): Promise<MailConfig> => {
  const port = Number(await getSetting("mail_port", String(DEFAULT_MAIL.port))) || DEFAULT_MAIL.port;
  const secureRaw = await getSetting("mail_secure", "");
  return {
    host: (await getSetting("mail_host", DEFAULT_MAIL.host)) || DEFAULT_MAIL.host,
    port,
    // port 465 is TLS from the start; the others upgrade to TLS when the server offers it
    secure: secureRaw === "" ? port === 465 : secureRaw === "true",
    user: (await getSetting("mail_user", DEFAULT_MAIL.user)) || DEFAULT_MAIL.user,
    pass: openSecret(await getSetting("mail_pass", "")),
    fromName: (await getSetting("mail_from_name", DEFAULT_MAIL.fromName)) || DEFAULT_MAIL.fromName
  };
};

export const mailConfigured = async (): Promise<boolean> => !!(await readMailConfig()).pass;

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export const sendMail = async (mail: Mail): Promise<void> => {
  const cfg = await readMailConfig();
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
    await transport.sendMail({ from: `"${cfg.fromName.replace(/"/g, "")}" <${cfg.user}>`, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html, attachments: logoAttachments(mail.html) });
  } catch (err) {
    logger.warn(`mail to ${mail.to.replace(/(.).+(@.+)/, "$1***$2")} failed: ${(err as Error).message}`);
    throw new AppError("ERR_MAIL_SEND_FAILED", 502);
  } finally {
    transport.close();
  }
};
