import sequelize from "../../database";
import { fire } from "../../helpers/Fire";
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
import { markFeePaid, syncPendingFeeTags } from "./FeeTags";
import dispatchWebhook from "../WebhookServices/DispatchWebhook";
import SendToContact from "../ChannelServices/SendToContact";
import { addActivity, changeStage, loadLead, resolveLeadTarget } from "../CrmServices/LeadCore";
import * as Efi from "./EfiClient";
import * as Billet from "./EfiBilletClient";
import LeadTask from "../../models/LeadTask";
import User from "../../models/User";
import { getPublicUrl } from "../../helpers/PublicUrl";
import { dayBounds, shiftDays } from "../../helpers/AppTime";


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

const requireBilletConfig = async (): Promise<Efi.EfiConfig> => {
  const cfg = await Efi.loadConfig();
  if (!cfg.clientId || !cfg.clientSecret) throw new AppError("ERR_EFI_NOT_CONFIGURED");
  return cfg;
};

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

// Who receives the money: the lead's consultant when they registered their Efí account,
// otherwise the company account (the one that owns the credentials)
const resolveRecipient = async (lead: Lead, fallbackUserId: number) => {
  const userId = lead.ownerId || fallbackUserId;
  const user = userId ? await User.findByPk(userId, { attributes: ["id", "name", "efiPayeeCode"] }) : null;
  const pct = Math.min(100, Math.max(1, Number(await getSetting("efi_consultant_pct", "100")) || 100));
  if (user?.efiPayeeCode && /^[A-Za-z0-9]{6,64}$/.test(user.efiPayeeCode.trim())) {
    return { userId: user.id, code: user.efiPayeeCode.trim(), pct };
  }
  return { userId: user?.id || null, code: null as string | null, pct: 0 };
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
  opts: { amount?: number; force?: boolean; method?: "pix" | "bolix"; dueDate?: string | null } = {}
): Promise<Payment> => {
  if (!lead.cpf || !isValidCpf(lead.cpf)) throw new AppError("ERR_LEAD_NEEDS_CPF");
  // The fee is always charged as a Bolix: a boleto with a Pix QR Code. The student pays by Pix or by boleto, the charge has a due
  // date, and it is the only form that Efí can split by the Wallet ID of the seller. Plain Pix is only made when a caller asks for
  // it by name (nothing on the screens does).
  const method: "pix" | "bolix" = opts.method === "pix" ? "pix" : "bolix";
  const cfg = method === "bolix" ? await requireBilletConfig() : await requireConfig();

  if (!opts.force) {
    const open = await Payment.findOne({
      where: {
        leadId: lead.id,
        kind: "matricula",
        method,
        [Op.or]: [
          { status: "pending", expiresAt: { [Op.gt]: new Date() } },
          { status: "scheduled" }
        ]
      },
      order: [["id", "DESC"]]
    });
    if (open) return open;
  }

  const def = await defaultAmount(lead.id);
  const amount = opts.amount && opts.amount > 0 ? Math.round(opts.amount * 100) / 100 : def.amount;
  if (!(amount > 0)) throw new AppError("ERR_PAYMENT_AMOUNT");

  if (method === "bolix") return createBolixPayment(lead, userId, amount, def.proposalId, opts.dueDate || null);

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

// Boleto + Pix with a due date the consultant negotiated. When the due date is far away the
// charge is only created N days before it ("scheduled"): the consultant gets a task then.
const createBolixPayment = async (
  lead: Lead,
  userId: number,
  amount: number,
  proposalId: number | null,
  dueDateRaw: string | null
): Promise<Payment> => {
  const today = dayBounds().start;
  // without a date chosen, the due date is the company's default (days from today)
  const dueDays = Math.min(30, Math.max(1, Math.round(Number(await getSetting("efi_due_days", "3")) || 3)));
  const due = dueDateRaw ? new Date(`${dueDateRaw}T12:00:00Z`) : shiftDays(today, dueDays);
  if (Number.isNaN(due.getTime())) throw new AppError("ERR_INVALID_DATE");
  const dueDate = ymd(due);
  if (dueDate < ymd(shiftDays(today, 0))) throw new AppError("ERR_PAYMENT_DUE_IN_PAST");

  const before = Math.max(0, Number(await getSetting("efi_charge_days_before", "3")) || 3);
  const generateAt = shiftDays(new Date(`${dueDate}T11:00:00Z`), -before); // ~07:00 local (RO)
  const recipient = await resolveRecipient(lead, userId);
  const now = Date.now();
  const payment = await Payment.create({
    leadId: lead.id,
    proposalId,
    provider: "efi",
    method: "bolix",
    kind: "matricula",
    txid: `MAT${randomBytes(14).toString("hex")}`,
    amount,
    status: generateAt.getTime() > now ? "scheduled" : "pending",
    description: `Taxa de matrícula - ${lead.name}`,
    dueDate,
    generateAt,
    expiresAt: new Date(`${dueDate}T23:59:59Z`),
    recipientUserId: recipient.userId,
    recipientCode: recipient.code,
    splitPct: recipient.code ? recipient.pct : 0,
    createdBy: userId
  } as any);

  if (payment.status === "scheduled") {
    await addActivity(
      lead.id,
      userId,
      "system",
      `Cobrança da taxa de matrícula (${brl(amount)}) agendada: será gerada em ${generateAt.toLocaleDateString("pt-BR")} para vencer em ${due.toLocaleDateString("pt-BR", { timeZone: "UTC" })}`
    );
    getIO().emit("lead", { action: "update", lead: await loadLead(lead.id) });
    return payment;
  }
  try {
    return await issueBolix(payment, lead);
  } catch (err) {
    await payment.update({ status: "cancelled", lastError: String((err as Error).message).slice(0, 400) });
    throw err;
  }
};

// Creates the charge at Efí for a bolix payment row (immediately or when its schedule is due)
const issueBolix = async (payment: Payment, lead: Lead): Promise<Payment> => {
  const cfg = await requireBilletConfig();
  const secret = await getSetting("efi_webhook_secret", "");
  // who pays the Efí fee when the charge is split: 2 = each account in proportion (the default of Efí), 1 = only the company
  const feeMode: 1 | 2 = (await getSetting("efi_fee_mode", "2")) === "1" ? 1 : 2;
  const params = (repass: { payeeCode: string; percentage: number; feeMode: 1 | 2 } | null) => ({
    customId: payment.txid,
    name: lead.name,
    cpf: normalizeCpf(lead.cpf) as string,
    phone: lead.phone ? String(lead.phone).replace(/\D/g, "") : null,
    amountCents: Math.round(Number(payment.amount) * 100),
    dueDate: payment.dueDate as string,
    description: payment.description || "Taxa de matrícula",
    notificationUrl: secret && getPublicUrl().startsWith("https://") ? `${getPublicUrl()}/webhooks/efi/${secret}/billet` : undefined,
    repass
  });
  const split = payment.recipientCode ? { payeeCode: payment.recipientCode, percentage: Number(payment.splitPct || 100) * 100, feeMode } : null;
  let charge: Awaited<ReturnType<typeof Billet.createBolix>>;
  try {
    charge = await Billet.createBolix(cfg, params(split));
  } catch (err) {
    // Efí refused the data (4xx): when the seller's Wallet ID is the problem (not an Efí account, or the company's own), the
    // student must still receive the charge. It is issued in the company account and the commission is paid back by hand.
    // A failure of the network (no status) is not retried: the charge may exist at Efí.
    const status = Number((err as any)?.data?.efiStatus || 0);
    if (!split || !(status >= 400 && status < 500)) throw err;
    logger.warn(`Efí refused the split of payment ${payment.id}, issuing without it: ${(err as Error).message}`);
    charge = await Billet.createBolix(cfg, params(null));
    await payment.update({ recipientCode: null, splitPct: 0 });
    await addActivity(lead.id, payment.createdBy || null, "system", `A Efí não aceitou o Wallet ID do consultor (${String((err as Error).message).slice(0, 160)}). A cobrança foi gerada na conta da empresa e a comissão fica para repasse manual; confira o Wallet ID em Comissões.`);
  }
  await payment.update({
    status: "pending",
    chargeId: String(charge.charge_id),
    barcode: charge.barcode || null,
    billetLink: charge.billet_link || charge.link || null,
    pdfLink: charge.pdf?.charge || null,
    pixCopiaECola: charge.pix?.qrcode || null,
    qrImage: charge.pix?.qrcode_image || null,
    lastError: null
  });
  await addActivity(
    lead.id,
    payment.createdBy || null,
    "system",
    `Boleto com Pix da taxa de matrícula gerado (${brl(Number(payment.amount))}, vence em ${new Date(`${payment.dueDate}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })})${payment.recipientCode ? " · repasse ao consultor" : " · recebe na conta da empresa"}`
  );
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

const markPaidCore = async (
  payment: Payment,
  info: { valor?: string | number; horario?: string; endToEndId?: string }
): Promise<boolean> => {
  if (payment.status === "paid") return false; // idempotent: webhook + poller can both arrive
  const paidValue = info.valor !== undefined ? Number(info.valor) : Number(payment.amount);
  const lead = await Lead.findByPk(payment.leadId);

  if (!Number.isFinite(paidValue) || paidValue <= 0) throw new AppError("ERR_PAYMENT_AMOUNT", 400);
  if (paidValue + 0.001 < Number(payment.amount)) {
    await payment.update({ lastError: `Pagamento parcial recebido: ${brl(paidValue)} de ${brl(Number(payment.amount))}` });
    if (lead) await addActivity(lead.id, null, "system", `Pagamento parcial da taxa de matrícula: ${brl(paidValue)} de ${brl(Number(payment.amount))}`);
    return false;
  }

  // atomic: the webhook and the poller can arrive at the same moment, and only one of them may log the payment
  const [changed] = await Payment.update(
    {
      status: "paid",
      paidAt: info.horario ? new Date(info.horario) : new Date(),
      paidAmount: paidValue,
      endToEndId: info.endToEndId || null,
      lastError: null
    },
    { where: { id: payment.id, status: { [Op.ne]: "paid" } } }
  );
  if (!changed) return false;
  await payment.reload();
  if (!lead) return true;

  await addActivity(
    lead.id,
    null,
    "system",
    `Taxa de matrícula paga: ${brl(paidValue)} via ${payment.method === "bolix" ? "boleto/Pix" : "PIX"} (Efí)`,
    { paymentId: payment.id }
  );

  const target = await targetStage();
  const current = await LeadStage.findByPk(lead.stageId);
  if (target && current && current.type === "open" && (target.type !== "open" || target.position > current.position)) {
    await changeStage(lead.id, target.id, null);
  }
  await lead.update({ lastContactAt: new Date() });

  // when the maintainer only pays affiliates after the fee is paid
  if (lead.affiliateId) {
    const { recordBonus } = await import("../AffiliateServices/Bonus");
    await recordBonus(lead.id, "fee_paid").catch(err => logger.error(`Affiliate bonus (fee_paid) of lead ${lead.id} was not recorded: ${err}`));
  }

  // "Taxa pendente" becomes "Taxa paga" right now, on the lead, the contact and the conversations
  await markFeePaid(lead);

  const fresh = await loadLead(lead.id);
  getIO().emit("lead", { action: "update", lead: fresh });
  getIO().emit("payment", { paymentId: payment.id, leadId: lead.id, leadName: lead.name, amount: paidValue });
  fire("fee.paid", { leadId: lead.id, contactId: lead.contactId });
  await dispatchWebhook("payment.paid", { paymentId: payment.id, leadId: lead.id, lead: lead.name, amount: paidValue, txid: payment.txid });
  return true;
};

export const markPaid = async (payment: Payment, info: { valor?: string | number; horario?: string; endToEndId?: string }): Promise<boolean> =>
  sequelize.transaction(async transaction => {
    const locked = await Payment.findByPk(payment.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!locked || locked.status === "paid") return false;
    const changed = await markPaidCore(locked, info);
    await payment.reload();
    return changed;
  });

// Asks Efí for the truth about a charge and applies it
export const refreshPayment = async (payment: Payment): Promise<Payment> => {
  if (payment.status !== "pending") return payment;

  if (payment.method === "bolix") {
    if (!payment.chargeId) return payment;
    const bcfg = await requireBilletConfig();
    const bc = await Billet.getBilletCharge(bcfg, payment.chargeId);
    if (["paid", "settled"].includes(bc.status)) {
      await markPaid(payment, { valor: bc.total ? Number(bc.total) / 100 : Number(payment.amount), horario: new Date().toISOString() });
    } else if (["canceled", "expired", "unpaid"].includes(bc.status)) {
      await payment.update({ status: bc.status === "canceled" ? "cancelled" : "expired" });
      getIO().emit("lead", { action: "update", lead: await loadLead(payment.leadId) });
    }
    return payment.reload();
  }

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
  if (!["pending", "scheduled"].includes(payment.status)) throw new AppError("ERR_PAYMENT_NOT_PENDING");
  try {
    if (payment.method === "bolix") {
      if (payment.chargeId) await Billet.cancelBilletCharge(await requireBilletConfig(), payment.chargeId);
    } else {
      await Efi.cancelCharge(await requireConfig(), payment.txid);
    }
  } catch (err) {
    // A timeout does not prove cancellation. Keep polling the authoritative provider.
    await payment.update({ lastError: `Não foi possível confirmar o cancelamento: ${String(err.message).slice(0, 300)}` });
    throw new AppError("ERR_PAYMENT_CANCEL_FAILED", 502);
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
    payment.method === "bolix"
      ? `Olá, ${lead.name.split(" ")[0]}! Segue o boleto da taxa de matrícula (${brl(Number(payment.amount))}), com vencimento em ${new Date(`${payment.dueDate}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })}.\n\n` +
        `${payment.pixCopiaECola ? `Pix copia e cola:\n${payment.pixCopiaECola}\n\n` : ""}` +
        `${payment.barcode ? `Linha digitável:\n${payment.barcode}\n\n` : ""}` +
        `${payment.billetLink ? `Boleto: ${payment.billetLink}\n\n` : ""}Assim que o pagamento for confirmado avisamos você por aqui.`
      : `Olá, ${lead.name.split(" ")[0]}! Segue o PIX da taxa de matrícula (${brl(Number(payment.amount))}).${until}\n\n` +
        `PIX copia e cola:\n${payment.pixCopiaECola}\n\nAssim que o pagamento for confirmado avisamos você por aqui.`;

  await SendToContact({ contact, whatsapp, body, mediaUrl: file || null, keepOpen: { userId } });
  await addActivity(lead.id, userId, "whatsapp", `PIX da taxa de matrícula enviado ao candidato (${brl(Number(payment.amount))})`);
};

// Safety net for localhost / missed webhooks: poll open charges
export const pollPendingPayments = async (): Promise<void> => {
  await syncPendingFeeTags();
  const cfg = await Efi.loadConfig();
  if (!cfg.clientId || !cfg.clientSecret) return;
  await generateScheduledCharges();
  const open = await Payment.findAll({
    where: { status: "pending" },
    order: [["updatedAt", "ASC"]],
    limit: 50
  });
  for (const p of open) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await refreshPayment(p);
      await p.changed("updatedAt", true);
      await p.save();
    } catch (err) {
      logger.warn(`Payment ${p.id} refresh failed: ${err.message}`);
      await p.update({ lastError: String(err.message).slice(0, 400) });
    }
  }
};

// Scheduled boletos are created at Efí N days before they are due; the consultant gets a task to send it
export const generateScheduledCharges = async (): Promise<void> => {
  const due = await Payment.findAll({
    where: { status: "scheduled", generateAt: { [Op.lte]: new Date() } },
    limit: 20
  });
  for (const payment of due) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const lead = await Lead.findByPk(payment.leadId);
      if (!lead) continue;
      // eslint-disable-next-line no-await-in-loop
      await issueBolix(payment, lead);
      const owner = payment.recipientUserId || lead.ownerId || payment.createdBy;
      // eslint-disable-next-line no-await-in-loop
      const task = await LeadTask.create({
        leadId: lead.id,
        userId: owner,
        type: "whatsapp",
        title: `Enviar o boleto da taxa de matrícula (${brl(Number(payment.amount))}, vence em ${new Date(`${payment.dueDate}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })})`,
        dueAt: new Date()
      } as any);
      // eslint-disable-next-line no-await-in-loop
      await payment.update({ reminderTaskId: task.id });
    } catch (err) {
      logger.warn(`Scheduled charge ${payment.id} failed: ${err.message}`);
      // eslint-disable-next-line no-await-in-loop
      await payment.update({ lastError: String(err.message).slice(0, 400), generateAt: new Date(Date.now() + 30 * 60000) });
    }
  }
};
