import { Request, Response } from "express";

import AppError from "../errors/AppError";
import { setSetting } from "../helpers/AppSettings";
import { isMasked, sealSecret } from "../helpers/Secrets";
import { readMailConfig, sendMail } from "../services/MailServices/SendMail";
import { MAIL_CATALOG, testMail } from "../services/MailServices/Templates";
import { inlineLogoForScreen } from "../services/MailServices/Logo";
import User from "../models/User";

const view = async () => {
  const c = await readMailConfig();
  // the password never goes back to the browser
  return { host: c.host, port: c.port, secure: c.secure, user: c.user, fromName: c.fromName, hasPassword: !!c.pass, pass: c.pass ? "••••••••" : "" };
};

export const show = async (_req: Request, res: Response): Promise<Response> => res.json(await view());

export const update = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body || {};
  const host = String(b.host ?? "").trim();
  const user = String(b.user ?? "").trim();
  const port = Number(b.port);
  if (b.host !== undefined && !/^[a-z0-9.-]+$/i.test(host)) throw new AppError("ERR_MAIL_HOST_INVALID", 400);
  if (b.user !== undefined && !/^\S+@\S+\.\S+$/.test(user)) throw new AppError("ERR_MAIL_USER_INVALID", 400);
  if (b.port !== undefined && !(port > 0 && port < 65536)) throw new AppError("ERR_MAIL_PORT_INVALID", 400);
  if (b.host !== undefined) await setSetting("mail_host", host);
  if (b.user !== undefined) await setSetting("mail_user", user);
  if (b.port !== undefined) await setSetting("mail_port", String(port));
  if (b.secure !== undefined) await setSetting("mail_secure", b.secure ? "true" : "false");
  if (b.fromName !== undefined) await setSetting("mail_from_name", String(b.fromName).trim().slice(0, 60));
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
