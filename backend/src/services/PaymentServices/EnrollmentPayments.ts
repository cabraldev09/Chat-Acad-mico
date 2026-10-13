import fs from "fs";
import { PUBLIC_DIR } from "../../config/paths";
import { fmtDateTime } from "../../helpers/AppTime";
import path from "path";
import { randomBytes } from "crypto";
import { Op } from "sequelize";

import Lead from "../../models/Lead";
import LeadStage from "../../models/LeadStage";
import Payment from "../../models/Payment";
import Proposal from "../../models/Proposal";
import ProposalTemplate from "../../models/ProposalTemplate";
import AppError from "../../errors/AppError";
import { getIO } from "../../libs/socket";
import { getSetting } from "../../helpers/AppSettings";
import { isValidCpf, normalizeCpf } from "../../helpers/Cpf";
import { logger } from "../../utils/logger";
import dispatchWebhook from "../WebhookServices/DispatchWebhook";
import SendToContact from "../ChannelServices/SendToContact";
import { addActivity, changeStage, loadLead, resolveLeadTarget } from "../CrmServices/LeadCore";
import * as Efi from "./EfiClient";


const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const present = (p: Payment, withQr = false) => {
  const json: any = p.toJSON();
  if (!withQr) delete json.qrImage;
  return json;
};

const requireConfig = async (): Promise<Efi.EfiConfig> => {
  const cfg = await Efi.loadConfig();
  if (!Efi.isConfigured(cfg)) throw new AppError("ERR_EFI_NOT_CONFIGURED");
  return cfg;
};

// Enrollment fee that the proposal promised, else the default template's fee
const defaultAmount = async (leadId: number): Promise<{ amount: number; proposalId: number | null }> => {
  const proposal = await Proposal.findOne({ where: { leadId }, order: [["id", "DESC"]] });
  if (proposal) {
    try {
      const fee = Number(JSON.parse(proposal.params).params.enrollmentFee);
      if (fee > 0) return { amount: fee, proposalId: proposal.id };
    } catch (e) { /* fall through */ }
  }
  const tpl = (await ProposalTemplate.findOne({ where: { isDefault: true } })) || (await ProposalTemplate.findOne());
  return { amount: tpl ? Number(tpl.enrollmentFee) : 0, proposalId: null };
};

export const createEnrollmentCharge = async (
  lead: Lead,
  userId: number,
  opts: { amount?: number; force?: boolean } = {}
): Promise<Payment> => {
  if (!lead.cpf || !isValidCpf(lead.cpf)) throw new AppError("ERR_LEAD_NEEDS_CPF");
  const cfg = await requireConfig();

  if (!opts.force) {
    const open = await Payment.findOne({
      where: { leadId: lead.id, kind: "matricula", status: "pending", expiresAt: { [Op.gt]: new Date() } },
      order: [["id", "DESC"]]
    });
    if (open) return open;
  }

  const def = await defaultAmount(lead.id);
  const amount = opts.amount && opts.amount > 0 ? Math.round(opts.amount * 100) / 100 : def.amount;
  if (!(amount > 0)) throw new AppError("ERR_PAYMENT_AMOUNT");

  const minutes = Math.max(5, Number(await getSetting("efi_expiry_min", "1440")) || 1440);
  const txid = `MAT${randomBytes(14).toString("hex")}`;
  const description = `Taxa de matrícula - ${lead.name}`;

  const charge = await Efi.createCharge(cfg, {
    txid,
    amount,
    cpf: normalizeCpf(lead.cpf) as string,
    name: lead.name,
    expirationSeconds: minutes * 60,
    description
  });

  let code = charge.pixCopiaECola || "";
  let image = "";
  if (charge.loc?.id) {
    const qr = await Efi.getQrCode(cfg, charge.loc.id);
    code = code || qr.qrcode;
    image = qr.imagemQrcode;
  }

  const payment = await Payment.create({
    leadId: lead.id,
    proposalId: def.proposalId,
    provider: "efi",
    kind: "matricula",
    txid,
    amount,
    status: "pending",
    description,
    pixCopiaECola: code,
    qrImage: image,
    locationUrl: charge.loc?.location,
    expiresAt: new Date(Date.now() + minutes * 60000),
    createdBy: userId
  } as any);

  await addActivity(lead.id, userId, "system", `Cobrança PIX da taxa de matrícula gerada (${brl(amount)})`);
  getIO().emit("lead", { action: "update", lead: await loadLead(lead.id) });
  return payment;
};

// Where the lead goes once the fee is in (configurable, default: first stage called "matrícula")
const targetStage = async (): Promise<LeadStage | null> => {
  const configured = Number(await getSetting("efi_move_stage", "0"));
  if (configured) return LeadStage.findByPk(configured);
  const stages = await LeadStage.findAll({ order: [["position", "ASC"]] });
  return stages.find(s => s.type === "open" && /matr[ií]cula/i.test(s.name)) || null;
};

export const markPaid = async (
  payment: Payment,
  info: { valor?: string | number; horario?: string; endToEndId?: string }
): Promise<boolean> => {
  if (payment.status === "paid") return false; // idempotent: webhook + poller can both arrive
  const paidValue = info.valor !== undefined ? Number(info.valor) : Number(payment.amount);
  const lead = await Lead.findByPk(payment.leadId);

  if (paidValue + 0.001 < Number(payment.amount)) {
    await payment.update({ lastError: `Pagamento parcial recebido: ${brl(paidValue)} de ${brl(Number(payment.amount))}` });
    if (lead) await addActivity(lead.id, null, "system", `Pagamento parcial da taxa de matrícula: ${brl(paidValue)} de ${brl(Number(payment.amount))}`);
    return false;
  }

  await payment.update({
    status: "paid",
    paidAt: info.horario ? new Date(info.horario) : new Date(),
    paidAmount: paidValue,
    endToEndId: info.endToEndId || null,
    lastError: null
  });
  if (!lead) return true;

  await addActivity(lead.id, null, "system", `Taxa de matrícula paga: ${brl(paidValue)} via PIX (Efí)`, { paymentId: payment.id });

  const target = await targetStage();
  const current = await LeadStage.findByPk(lead.stageId);
  if (target && current && current.type === "open" && (target.type !== "open" || target.position > current.position)) {
    await changeStage(lead.id, target.id, null);
  }
  await lead.update({ lastContactAt: new Date() });

  const fresh = await loadLead(lead.id);
  getIO().emit("lead", { action: "update", lead: fresh });
  getIO().emit("payment", { paymentId: payment.id, leadId: lead.id, leadName: lead.name, amount: paidValue });
  dispatchWebhook("payment.paid", { paymentId: payment.id, leadId: lead.id, lead: lead.name, amount: paidValue, txid: payment.txid });
  return true;
};

// Asks Efí for the truth about a charge and applies it
export const refreshPayment = async (payment: Payment): Promise<Payment> => {
  if (payment.status !== "pending") return payment;
  const cfg = await requireConfig();
  const charge = await Efi.getCharge(cfg, payment.txid);
  if (charge.status === "CONCLUIDA") {
    const pix = (charge.pix || [])[0];
    await markPaid(payment, { valor: pix?.valor, horario: pix?.horario, endToEndId: pix?.endToEndId });
  } else if (charge.status.startsWith("REMOVIDA")) {
    const expired = payment.expiresAt && payment.expiresAt.getTime() < Date.now();
    await payment.update({ status: expired ? "expired" : "cancelled" });
    getIO().emit("lead", { action: "update", lead: await loadLead(payment.leadId) });
  }
  return payment.reload();
};

export const cancelPayment = async (payment: Payment, userId: number): Promise<Payment> => {
  if (payment.status !== "pending") throw new AppError("ERR_PAYMENT_NOT_PENDING");
  const cfg = await requireConfig();
  try {
    await Efi.cancelCharge(cfg, payment.txid);
  } catch (err) {
    // already gone on Efí's side: just reflect it locally
    logger.warn(`Efí cancel failed (${err.message}), marking locally`);
  }
  await payment.update({ status: "cancelled" });
  await addActivity(payment.leadId, userId, "system", `Cobrança PIX cancelada (${brl(Number(payment.amount))})`);
  getIO().emit("lead", { action: "update", lead: await loadLead(payment.leadId) });
  return payment;
};

export const sendPaymentToLead = async (payment: Payment, userId: number, whatsappId?: number | null): Promise<void> => {
  if (payment.status !== "pending") throw new AppError("ERR_PAYMENT_NOT_PENDING");
  const lead = (await Lead.findByPk(payment.leadId)) as Lead;
  const { contact, whatsapp } = await resolveLeadTarget(lead, userId, whatsappId);

  let file: string | undefined;
  const m = String(payment.qrImage || "").match(/^data:image\/(png|jpeg);base64,(.+)$/);
  if (m) {
    file = `pix-${payment.id}-${Date.now()}.${m[1] === "jpeg" ? "jpg" : "png"}`;
    fs.writeFileSync(path.join(PUBLIC_DIR, file), Buffer.from(m[2], "base64"));
  }
  const until = payment.expiresAt
    ? ` Válido até ${fmtDateTime(payment.expiresAt)}.`
    : "";
  const body =
    `Olá, ${lead.name.split(" ")[0]}! Segue o PIX da taxa de matrícula (${brl(Number(payment.amount))}).${until}\n\n` +
    `PIX copia e cola:\n${payment.pixCopiaECola}\n\nAssim que o pagamento for confirmado avisamos você por aqui.`;

  await SendToContact({ contact, whatsapp, body, mediaUrl: file || null, keepOpen: { userId } });
  await addActivity(lead.id, userId, "whatsapp", `PIX da taxa de matrícula enviado ao candidato (${brl(Number(payment.amount))})`);
};

// Safety net for localhost / missed webhooks: poll open charges
export const pollPendingPayments = async (): Promise<void> => {
  const cfg = await Efi.loadConfig();
  if (!Efi.isConfigured(cfg)) return;
  const open = await Payment.findAll({
    where: { status: "pending", createdAt: { [Op.gt]: new Date(Date.now() - 7 * 86400000) } },
    limit: 50
  });
  for (const p of open) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await refreshPayment(p);
    } catch (err) {
      logger.warn(`Payment ${p.id} refresh failed: ${err.message}`);
    }
  }
};
