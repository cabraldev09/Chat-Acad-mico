import { Op } from "sequelize";

import AppError from "../../errors/AppError";
import { getSetting } from "../../helpers/AppSettings";
import { getIO } from "../../libs/socket";
import Lead from "../../models/Lead";
import LeadDocument from "../../models/LeadDocument";
import LeadReminderLog from "../../models/LeadReminderLog";
import { logger } from "../../utils/logger";
import { emitEvent } from "../FlowServices/Events";
import SendToContact from "../ChannelServices/SendToContact";
import { setLabel } from "./Labels";
import { addActivity, loadLead, resolveLeadTarget } from "./LeadCore";

// The documents a student has to deliver after the enrollment is confirmed. The list is set by the administration; each
// student gets one row per document. While something is missing the lead carries "Documentos pendentes"; when all of it is
// in (or waived) the label goes away and the "Documentos completos" event runs the flows that listen to it.
export const DOCS_PENDING_LABEL = { name: "Documentos pendentes", color: "#F59E0B" };
export const DEFAULT_DOCS = ["RG ou CNH", "CPF", "Comprovante de residência", "Histórico escolar", "Certificado de conclusão do ensino médio"];

export const requiredDocs = async (): Promise<string[]> => {
  try {
    const list = JSON.parse(await getSetting("crm_required_docs", "null"));
    if (Array.isArray(list)) return list.map((d: any) => String(d).trim().slice(0, 120)).filter(Boolean).slice(0, 30);
  } catch (e) {
    /* the default list */
  }
  return DEFAULT_DOCS;
};

// one row for each required document the student does not have yet (a document taken off the list later stays where it is)
export const ensureDocuments = async (leadId: number): Promise<void> => {
  const names = await requiredDocs();
  const have = new Set((await LeadDocument.findAll({ where: { leadId }, attributes: ["name"] })).map(d => d.name));
  let position = have.size;
  for (const name of names) {
    if (have.has(name)) continue;
    // eslint-disable-next-line no-await-in-loop
    await LeadDocument.findOrCreate({ where: { leadId, name }, defaults: { leadId, name, status: "pending", position: (position += 1) } as any });
  }
};

export interface DocSummary {
  total: number;
  received: number;
  waived: number;
  pending: number;
  complete: boolean;
}

export const summaryOf = (docs: LeadDocument[]): DocSummary => {
  const received = docs.filter(d => d.status === "received").length;
  const waived = docs.filter(d => d.status === "waived").length;
  const pending = docs.filter(d => d.status === "pending").length;
  return { total: docs.length, received, waived, pending, complete: docs.length > 0 && pending === 0 };
};

export const listDocuments = async (leadId: number) => {
  await ensureDocuments(leadId);
  const docs = await LeadDocument.findAll({ where: { leadId }, order: [["position", "ASC"], ["id", "ASC"]] });
  return {
    documents: docs.map(d => ({ id: d.id, name: d.name, status: d.status, receivedAt: d.receivedAt, note: d.note })),
    summary: summaryOf(docs)
  };
};

// the label follows the state: pending documents on an enrolled student
const syncLabel = async (lead: Lead): Promise<DocSummary> => {
  const docs = await LeadDocument.findAll({ where: { leadId: lead.id } });
  const s = summaryOf(docs);
  await setLabel(lead, DOCS_PENDING_LABEL, !!lead.enrolledAt && s.pending > 0);
  return s;
};

export const startDocuments = async (lead: Lead): Promise<void> => {
  await ensureDocuments(lead.id);
  await syncLabel(lead);
};

export const setDocumentStatus = async (lead: Lead, docId: number, status: string, userId: number, note?: string) => {
  if (!["pending", "received", "waived"].includes(status)) throw new AppError("ERR_INVALID_PARAMETER", 400);
  const doc = await LeadDocument.findOne({ where: { id: docId, leadId: lead.id } });
  if (!doc) throw new AppError("ERR_NOT_FOUND", 404);
  const before = summaryOf(await LeadDocument.findAll({ where: { leadId: lead.id } }));
  await doc.update({
    status,
    receivedAt: status === "received" ? new Date() : null,
    receivedBy: status === "pending" ? null : userId,
    note: note !== undefined ? String(note).trim().slice(0, 300) || null : doc.note
  } as any);
  const label = status === "received" ? "recebido" : status === "waived" ? "dispensado" : "pendente de novo";
  await addActivity(lead.id, userId, "system", `Documento ${label}: ${doc.name}`);
  const after = await syncLabel(lead);
  if (after.complete && !before.complete) {
    await addActivity(lead.id, userId, "system", "Documentos completos.");
    await emitEvent("documents.complete", { leadId: lead.id, contactId: lead.contactId });
  }
  getIO().emit("lead", { action: "update", lead: await loadLead(lead.id) });
  return after;
};

const reminderText = (name: string, missing: string[]): string =>
  `Olá, ${name.split(" ")[0]}! Para concluir a sua matrícula ainda faltam estes documentos:\n\n${missing.map(m => `• ${m}`).join("\n")}\n\nPode enviar a foto ou o PDF por aqui mesmo. Qualquer dúvida é só falar com a gente.`;

// asks the student, by WhatsApp, for the documents that are still missing
export const remindDocuments = async (lead: Lead, userId: number, automatic = false): Promise<number> => {
  await ensureDocuments(lead.id);
  const missing = (await LeadDocument.findAll({ where: { leadId: lead.id, status: "pending" }, order: [["position", "ASC"]] })).map(d => d.name);
  if (!missing.length) throw new AppError("ERR_NO_PENDING_DOCUMENTS", 400);
  const { contact, whatsapp } = await resolveLeadTarget(lead, userId, null);
  await SendToContact({ contact, whatsapp, body: reminderText(lead.name, missing), keepOpen: automatic ? undefined : { userId } });
  await LeadReminderLog.create({ leadId: lead.id, key: "docs" } as any);
  await addActivity(lead.id, automatic ? null : userId, "whatsapp", `${automatic ? "Lembrete automático" : "Cobrança"} de documentos enviado (${missing.length} pendente${missing.length > 1 ? "s" : ""})`);
  return missing.length;
};

// Reminders by themselves (off until the administration turns them on): every N days, at most M times, for enrolled
// students with documents missing.
export const runDocumentReminders = async (): Promise<number> => {
  if ((await getSetting("docs_auto_reminder", "false")) !== "true") return 0;
  const every = Math.max(1, Number(await getSetting("docs_reminder_days", "3")) || 3);
  const max = Math.max(1, Number(await getSetting("docs_reminder_max", "3")) || 3);
  const leads = await Lead.findAll({ where: { enrolledAt: { [Op.ne]: null }, isHistorical: false } as any, limit: 400, order: [["id", "ASC"]] });
  let sent = 0;
  for (const lead of leads) {
    // eslint-disable-next-line no-await-in-loop
    const pending = await LeadDocument.count({ where: { leadId: lead.id, status: "pending" } });
    if (!pending) continue;
    // eslint-disable-next-line no-await-in-loop
    const logs = await LeadReminderLog.findAll({ where: { leadId: lead.id, key: "docs" }, order: [["createdAt", "DESC"]] });
    if (logs.length >= max) continue;
    if (logs[0] && Date.now() - logs[0].createdAt.getTime() < every * 86400000) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await remindDocuments(lead, lead.onboardingTutorId || lead.ownerId || 0, true);
      sent += 1;
    } catch (err) {
      logger.warn(`document reminder not sent to lead ${lead.id}: ${(err as Error).message}`);
      // eslint-disable-next-line no-await-in-loop
      await LeadReminderLog.create({ leadId: lead.id, key: "docs" } as any);
    }
  }
  return sent;
};
