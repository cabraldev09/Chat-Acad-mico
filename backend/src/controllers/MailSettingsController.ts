import { isEmail } from "../helpers/Email";
import { Request, Response } from "express";

import AppError from "../errors/AppError";
import { getSetting, setSetting } from "../helpers/AppSettings";
import { isMasked, sealSecret } from "../helpers/Secrets";
import { readMailConfig, sendMail } from "../services/MailServices/SendMail";
import { MAIL_CATALOG, testMail } from "../services/MailServices/Templates";
import { inlineLogoForScreen } from "../services/MailServices/Logo";
import User from "../models/User";
import { domainOf, loadAliasTable } from "../services/MailServices/Aliases";

const view = async () => {
  const c = await readMailConfig();
  // the password never goes back to the browser
  return {
    provider: c.provider, host: c.host, port: c.port, secure: c.secure, user: c.user, fromName: c.fromName, hasPassword: !!c.pass, pass: c.pass ? "••••••••" : "",
    fromEmail: c.fromEmail, replyTo: c.replyTo, hasResendKey: !!c.resendKey, resendKey: c.resendKey ? "••••••••" : "",
    forwardTo: await getSetting("mail_forward_to", ""), hasInboundSecret: !!(await getSetting("mail_inbound_secret", "")),
    // the address of each person on the receiving domain and where it goes (a name shared by two people goes to the management)
    aliases: c.fromEmail
      ? (await loadAliasTable()).map(a => ({ name: a.name, address: `${a.alias}@${domainOf(c.fromEmail)}`, forwardsTo: a.shared ? "" : a.email, shared: a.shared }))
      : []
  };
};

export const show = async (_req: Request, res: Response): Promise<Response> => res.json(await view());

export const update = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body || {};
  const host = String(b.host ?? "").trim();
  const user = String(b.user ?? "").trim();
  const port = Number(b.port);
  if (b.host !== undefined && !/^[a-z0-9.-]+$/i.test(host)) throw new AppError("ERR_MAIL_HOST_INVALID", 400);
  if (b.user !== undefined && !isEmail(user)) throw new AppError("ERR_MAIL_USER_INVALID", 400);
  if (b.port !== undefined && !(port > 0 && port < 65536)) throw new AppError("ERR_MAIL_PORT_INVALID", 400);
  if (b.host !== undefined) await setSetting("mail_host", host);
  if (b.user !== undefined) await setSetting("mail_user", user);
  if (b.port !== undefined) await setSetting("mail_port", String(port));
  if (b.secure !== undefined) await setSetting("mail_secure", b.secure ? "true" : "false");
  if (b.fromName !== undefined) await setSetting("mail_from_name", String(b.fromName).trim().slice(0, 60));
  // Resend: the provider, the sender on the verified domain, where the answers go, and the sending key (sealed like the password)
  if (b.provider !== undefined) {
    if (b.provider !== "smtp" && b.provider !== "resend") throw new AppError("ERR_MAIL_PROVIDER_INVALID", 400);
    await setSetting("mail_provider", b.provider);
  }
  const fromEmail = String(b.fromEmail ?? "").trim().toLowerCase();
  const replyTo = String(b.replyTo ?? "").trim().toLowerCase();
  if (b.fromEmail !== undefined && fromEmail && !isEmail(fromEmail)) throw new AppError("ERR_MAIL_FROM_INVALID", 400);
  if (b.replyTo !== undefined && replyTo && !isEmail(replyTo)) throw new AppError("ERR_MAIL_REPLY_TO_INVALID", 400);
  if (b.fromEmail !== undefined) await setSetting("mail_from_email", fromEmail);
  if (b.replyTo !== undefined) await setSetting("mail_reply_to", replyTo);
  // receiving: where the e-mails that arrive at the domain go, and the signing secret of the Resend webhook (sealed)
  const forwardTo = String(b.forwardTo ?? "").trim().toLowerCase();
  if (b.forwardTo !== undefined && forwardTo && !isEmail(forwardTo)) throw new AppError("ERR_MAIL_FORWARD_INVALID", 400);
  // the management address cannot be on the receiving domain: what arrives there would be forwarded to itself, forever
  const receiving = domainOf(b.fromEmail !== undefined ? fromEmail : (await readMailConfig()).fromEmail);
  if (b.forwardTo !== undefined && forwardTo && receiving && domainOf(forwardTo) === receiving) throw new AppError("ERR_MAIL_FORWARD_SAME_DOMAIN", 400);
  if (b.forwardTo !== undefined) await setSetting("mail_forward_to", forwardTo);
  if (typeof b.inboundSecret === "string" && !isMasked(b.inboundSecret)) {
    const secret = b.inboundSecret.trim();
    if (secret && !/^whsec_[A-Za-z0-9+/=]{16,}$/.test(secret)) throw new AppError("ERR_MAIL_INBOUND_SECRET_INVALID", 400);
    await setSetting("mail_inbound_secret", secret ? sealSecret(secret) : "");
  }
  if (typeof b.resendKey === "string" && !isMasked(b.resendKey)) {
    const key = b.resendKey.trim();
    if (key && !/^re_[A-Za-z0-9_]{8,}$/.test(key)) throw new AppError("ERR_MAIL_RESEND_KEY_INVALID", 400);
    await setSetting("mail_resend_key", key ? sealSecret(key) : "");
  }
  // typed again: replaced; left as the mask: kept; emptied on purpose: removed
  if (typeof b.pass === "string" && !isMasked(b.pass)) await setSetting("mail_pass", b.pass.trim() ? sealSecret(b.pass.replace(/\s+/g, "")) : "");
  return res.json(await view());
};

// sends a test message to the address of the person who is logged in
export const test = async (req: Request, res: Response): Promise<Response> => {
  const me = await User.findByPk(req.user.id, { attributes: ["email"] });
  if (!me) throw new AppError("ERR_NO_USER_FOUND", 404);
  await sendMail({ to: me.email, ...testMail() });
  return res.json({ ok: true, to: me.email });
};

// the catalog of e-mails the system sends: what each one is for, when it goes out and how it looks
export const templates = async (_req: Request, res: Response): Promise<Response> =>
  res.json(MAIL_CATALOG.map(t => ({ key: t.key, title: t.title, audience: t.audience, trigger: t.trigger, automatic: t.automatic, subject: t.build().subject })));

const findTemplate = (key: string) => {
  const t = MAIL_CATALOG.find(x => x.key === key);
  if (!t) throw new AppError("Modelo de e-mail não encontrado.", 404);
  return t;
};

export const preview = async (req: Request, res: Response): Promise<Response> => {
  const mail = findTemplate(req.params.key).build();
  return res.json({ subject: mail.subject, html: inlineLogoForScreen(mail.html), text: mail.text });
};

// sends the model, filled with example data, to the address of the person who is logged in
export const testTemplate = async (req: Request, res: Response): Promise<Response> => {
  const t = findTemplate(req.params.key);
  const me = await User.findByPk(req.user.id, { attributes: ["email"] });
  if (!me) throw new AppError("ERR_NO_USER_FOUND", 404);
  const mail = t.build();
  await sendMail({ to: me.email, ...mail, subject: `[Exemplo] ${mail.subject}` });
  return res.json({ ok: true, to: me.email });
};
