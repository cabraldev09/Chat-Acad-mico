import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";

import Lead from "../models/Lead";
import LeadStage from "../models/LeadStage";
import Payment from "../models/Payment";
import AppError from "../errors/AppError";
import { getPublicUrl } from "../helpers/PublicUrl";
import { getSetting, setSetting } from "../helpers/AppSettings";
import { isMasked, maskSecret } from "../helpers/Secrets";
import { logger } from "../utils/logger";
import * as Efi from "../services/PaymentServices/EfiClient";
import * as Billet from "../services/PaymentServices/EfiBilletClient";
import User from "../models/User";
import {
  cancelPayment,
  createEnrollmentCharge,
  markPaid,
  present,
  refreshPayment,
  sendPaymentToLead
} from "../services/PaymentServices/EnrollmentPayments";

const uid = (req: Request) => Number(req.user.id);

const webhookSecret = async (): Promise<string> => {
  let s = await getSetting("efi_webhook_secret", "");
  if (!s) {
    s = randomBytes(20).toString("hex");
    await setSetting("efi_webhook_secret", s);
  }
  return s;
};

// ------------------------------------------------------------------ settings
const settingsView = async () => {
  const cfg = await Efi.loadConfig();
  return {
    env: cfg.env,
    clientId: cfg.clientId,
    clientSecret: maskSecret(cfg.clientSecret) || "",
    pixKey: cfg.pixKey,
    expiryMinutes: Number(await getSetting("efi_expiry_min", "1440")),
    moveStageId: Number(await getSetting("efi_move_stage", "0")) || null,
    certificate: fs.existsSync(Efi.CERT_PATH),
    configured: Efi.isConfigured(cfg),
    // Bolix (boleto with Pix) only needs the credentials, no certificate or Pix key
    bolixReady: !!(cfg.clientId && cfg.clientSecret),
    companyPayeeCode: await getSetting("efi_company_payee_code", ""),
    consultantPct: Number(await getSetting("efi_consultant_pct", "100")),
    chargeDaysBefore: Number(await getSetting("efi_charge_days_before", "3")),
    defaultMethod: (await getSetting("efi_default_method", "pix")) === "bolix" ? "bolix" : "pix",
    // who pays the Efí fee on a split charge: "proportional" (each account, the default of Efí) or "company"
    feeMode: (await getSetting("efi_fee_mode", "2")) === "1" ? "company" : "proportional",
    webhookUrl: `${getPublicUrl()}/webhooks/efi/${await webhookSecret()}`,
    publicUrlIsHttps: getPublicUrl().startsWith("https://")
  };
};

export const getSettings = async (_req: Request, res: Response): Promise<Response> =>
  res.json(await settingsView());

export const putSettings = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body;
  if (b.env) await setSetting("efi_env", b.env === "production" ? "production" : "sandbox");
  if (typeof b.clientId === "string") await setSetting("efi_client_id", b.clientId.trim());
  if (typeof b.clientSecret === "string" && !isMasked(b.clientSecret)) await setSetting("efi_client_secret", b.clientSecret.trim());
  if (typeof b.pixKey === "string") await setSetting("efi_pix_key", b.pixKey.trim());
  if (b.expiryMinutes !== undefined) await setSetting("efi_expiry_min", String(Math.max(5, Math.min(10080, Number(b.expiryMinutes) || 1440))));
  if (b.moveStageId !== undefined) {
    const stage = b.moveStageId ? await LeadStage.findByPk(Number(b.moveStageId)) : null;
    await setSetting("efi_move_stage", stage ? String(stage.id) : "0");
  }
  if (typeof b.companyPayeeCode === "string") await setSetting("efi_company_payee_code", b.companyPayeeCode.trim());
  if (b.consultantPct !== undefined) await setSetting("efi_consultant_pct", String(Math.min(100, Math.max(1, Math.round(Number(b.consultantPct) || 100)))));
  if (b.chargeDaysBefore !== undefined) await setSetting("efi_charge_days_before", String(Math.min(30, Math.max(0, Math.round(Number(b.chargeDaysBefore) || 0)))));
  if (b.defaultMethod) await setSetting("efi_default_method", b.defaultMethod === "bolix" ? "bolix" : "pix");
  if (b.feeMode) await setSetting("efi_fee_mode", b.feeMode === "company" ? "1" : "2");
  Efi.clearTokens();
  Billet.clearBilletTokens();
  return res.json(await settingsView());
};

export const uploadCertificate = async (req: Request, res: Response): Promise<Response> => {
  const file = req.file;
  if (!file) throw new AppError("ERR_NO_FILE");
  if (!/\.(p12|pfx)$/i.test(file.originalname)) throw new AppError("ERR_EFI_CERT_FORMAT");
  fs.mkdirSync(path.dirname(Efi.CERT_PATH), { recursive: true });
  fs.writeFileSync(Efi.CERT_PATH, file.buffer, { mode: 0o600 });
  Efi.clearTokens();
  return res.json(await settingsView());
};

export const testConnection = async (_req: Request, res: Response): Promise<Response> => {
  const cfg = await Efi.loadConfig();
  if (!cfg.clientId || !cfg.clientSecret) throw new AppError("ERR_EFI_NOT_CONFIGURED");
  // Pix needs the certificate + key, Bolix only the credentials: report each one
  const out: { pix: string | null; bolix: string | null } = { pix: null, bolix: null };
  try {
    if (!Efi.isConfigured(cfg)) throw new AppError("ERR_EFI_NOT_CONFIGURED");
    await Efi.testConnection(cfg);
    out.pix = "ok";
  } catch (err) {
    out.pix = String(err.message || err);
  }
  try {
    await Billet.testBilletConnection(cfg);
    out.bolix = "ok";
  } catch (err) {
    out.bolix = String(err.message || err);
  }
  if (out.pix !== "ok" && out.bolix !== "ok") throw new AppError(out.bolix || out.pix || "ERR_EFI_NOT_CONFIGURED");
  return res.json({ ok: true, ...out });
};

export const registerWebhook = async (_req: Request, res: Response): Promise<Response> => {
  const cfg = await Efi.loadConfig();
  if (!Efi.isConfigured(cfg)) throw new AppError("ERR_EFI_NOT_CONFIGURED");
  const url = `${getPublicUrl()}/webhooks/efi/${await webhookSecret()}`;
  // Efí only delivers to public HTTPS (a tunnel works in localhost)
  if (!url.startsWith("https://") && !process.env.EFI_API_URL) throw new AppError("ERR_EFI_WEBHOOK_NEEDS_HTTPS");
  await Efi.registerWebhook(cfg, url);
  return res.json({ ok: true, url });
};

// ------------------------------------------------------------- lead payments
export const listForLead = async (req: Request, res: Response): Promise<Response> => {
  const rows = await Payment.findAll({ where: { leadId: Number(req.params.id) }, order: [["id", "DESC"]], limit: 50 });
  // the freshest open charge carries its QR so the UI can show it right away
  const open = rows.find(r => r.status === "pending");
  return res.json(rows.map(r => present(r, !!open && r.id === open.id)));
};

export const createForLead = async (req: Request, res: Response): Promise<Response> => {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  const payment = await createEnrollmentCharge(lead, uid(req), {
    amount: req.body.amount ? Number(String(req.body.amount).replace(",", ".")) : undefined,
    force: !!req.body.force,
    // not chosen: the default of the company; with Pix as the default, a seller with a Wallet ID gets a Bolix (it splits by Wallet ID)
    method: req.body.method === "bolix" ? "bolix" : req.body.method === "pix" ? "pix" : ((await getSetting("efi_default_method", "pix")) === "bolix" ? "bolix" : undefined),
    dueDate: req.body.dueDate || null
  });
  return res.status(201).json(present(payment, true));
};

const loadPayment = async (id: string) => {
  const p = await Payment.findByPk(id);
  if (!p) throw new AppError("ERR_NOT_FOUND", 404);
  return p;
};

export const show = async (req: Request, res: Response): Promise<Response> =>
  res.json(present(await loadPayment(req.params.id), true));

export const refresh = async (req: Request, res: Response): Promise<Response> =>
  res.json(present(await refreshPayment(await loadPayment(req.params.id)), true));

export const cancel = async (req: Request, res: Response): Promise<Response> =>
  res.json(present(await cancelPayment(await loadPayment(req.params.id), uid(req))));

export const send = async (req: Request, res: Response): Promise<Response> => {
  await sendPaymentToLead(await loadPayment(req.params.id), uid(req), req.body.whatsappId);
  return res.json({ ok: true });
};

// ------------------------------------------------------------------- webhook
export const efiWebhook = async (req: Request, res: Response): Promise<Response> => {
  if (req.params.secret !== (await getSetting("efi_webhook_secret", ""))) return res.sendStatus(404);
  res.sendStatus(200); // Efí retries on slow answers; process after acknowledging

  const items: any[] = Array.isArray(req.body?.pix) ? req.body.pix : [];
  for (const item of items) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const payment = await Payment.findOne({ where: { txid: String(item.txid || "") } });
      if (!payment || payment.status === "paid") continue;
      // never trust the payload alone: confirm the charge with Efí itself
      // eslint-disable-next-line no-await-in-loop
      await refreshPayment(payment);
    } catch (err) {
      logger.warn(`Efí webhook item failed: ${err.message}`);
    }
  }
  return res;
};

// Efí Cobranças (boleto/Bolix) posts `notification=<token>`; the token only says "something changed":
// the charges it names are re-read from Efí before anything is marked as paid
export const efiBilletWebhook = async (req: Request, res: Response): Promise<Response> => {
  if (req.params.secret !== (await getSetting("efi_webhook_secret", ""))) return res.sendStatus(404);
  res.sendStatus(200);
  try {
    const token = String(req.body?.notification || "");
    if (!token) return res;
    const cfg = await Efi.loadConfig();
    const ids = await Billet.notificationCharges(cfg, token);
    for (const chargeId of ids) {
      // eslint-disable-next-line no-await-in-loop
      const payment = await Payment.findOne({ where: { chargeId } });
      // eslint-disable-next-line no-await-in-loop
      if (payment && payment.status === "pending") await refreshPayment(payment);
    }
  } catch (err) {
    logger.warn(`Efí billet webhook failed: ${err.message}`);
  }
  return res;
};

// ------------------------------------------------- "my receiving account" (any user)
const maskCode = (code: string) => `••••${code.slice(-4)}`;

export const myEfi = async (req: Request, res: Response): Promise<Response> => {
  const user = await User.findByPk(uid(req), { attributes: ["id", "efiPayeeCode"] });
  const code = user?.efiPayeeCode || "";
  return res.json({ informed: !!code, masked: code ? maskCode(code) : null });
};

// the seller informs ONLY the Wallet ID of the Efí account (what the Efí app calls "identificador da conta"): spaces
// pasted along with it are dropped; the company account cannot be its own seller
const cleanWallet = async (raw: unknown): Promise<string> => {
  const code = String(raw || "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9]{6,64}$/.test(code)) throw new AppError("ERR_EFI_PAYEE_INVALID", 400);
  const company = (await getSetting("efi_company_payee_code", "")).trim();
  if (company && company.toLowerCase() === code.toLowerCase()) throw new AppError("ERR_EFI_PAYEE_IS_COMPANY", 400);
  return code;
};

export const saveMyEfi = async (req: Request, res: Response): Promise<Response> => {
  const code = await cleanWallet(req.body.payeeCode);
  await User.update({ efiPayeeCode: code } as any, { where: { id: uid(req) } });
  return res.json({ informed: true, masked: maskCode(code) });
};

export const clearMyEfi = async (req: Request, res: Response): Promise<Response> => {
  await User.update({ efiPayeeCode: null } as any, { where: { id: uid(req) } });
  return res.json({ informed: false, masked: null });
};

// ------------------------------------------- receiving accounts of the team (admin and coordination)
// The administration can inform the Wallet ID of a seller on their behalf; the code never goes back whole.
export const listWallets = async (_req: Request, res: Response): Promise<Response> => {
  const users = await User.findAll({ attributes: ["id", "name", "profile", "efiPayeeCode"], order: [["name", "ASC"]] });
  return res.json(
    users
      .filter(u => u.profile !== "academico")
      .map(u => ({ id: u.id, name: u.name, profile: u.profile, informed: !!u.efiPayeeCode, masked: u.efiPayeeCode ? maskCode(u.efiPayeeCode) : null }))
  );
};

export const saveUserWallet = async (req: Request, res: Response): Promise<Response> => {
  const user = await User.findByPk(Number(req.params.userId), { attributes: ["id"] });
  if (!user) throw new AppError("ERR_NO_USER_FOUND", 404);
  const code = await cleanWallet(req.body.payeeCode);
  await User.update({ efiPayeeCode: code } as any, { where: { id: user.id } });
  return res.json({ id: user.id, informed: true, masked: maskCode(code) });
};

export const clearUserWallet = async (req: Request, res: Response): Promise<Response> => {
  const user = await User.findByPk(Number(req.params.userId), { attributes: ["id"] });
  if (!user) throw new AppError("ERR_NO_USER_FOUND", 404);
  await User.update({ efiPayeeCode: null } as any, { where: { id: user.id } });
  return res.json({ id: user.id, informed: false, masked: null });
};
