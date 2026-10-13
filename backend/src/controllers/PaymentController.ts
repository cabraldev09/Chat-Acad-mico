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
  Efi.clearTokens();
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
  if (!Efi.isConfigured(cfg)) throw new AppError("ERR_EFI_NOT_CONFIGURED");
  await Efi.testConnection(cfg);
  return res.json({ ok: true });
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
    force: !!req.body.force
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
