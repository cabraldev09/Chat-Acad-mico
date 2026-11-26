import { Op, QueryTypes } from "sequelize";

import sequelize from "../../database";
import { portable } from "../../helpers/sqlDialect";
import Lead from "../../models/Lead";
import LeadStage from "../../models/LeadStage";
import LeadCommercial from "../../models/LeadCommercial";
import Proposal from "../../models/Proposal";
import Contact from "../../models/Contact";
import ConversationReading from "../../models/ConversationReading";
import { logger } from "../../utils/logger";
import { ImportAnswer, findRgm, lostReasonFor } from "./Kinds";

// THE CONVERSATIONS COPIED FROM A CONSULTANT'S PHONE (WhatsApp by QR Code), read once each: who is a lead, who already enrolled, who stopped
// and why. What it becomes in the CRM (see applyImport) is silent: one notice at the end for the owner of the number and the management.
export const IMPORT_SOURCE = "WhatsApp do consultor";
const LOOKBACK_DAYS = Number(process.env.READING_IMPORT_LOOKBACK_DAYS || 120);
const CONFIRM_STAGE = "Matrícula a confirmar";

const rows = async (sql: string, replacements: Record<string, any>): Promise<any[]> =>
  (await sequelize.query(portable(sql), { replacements, type: QueryTypes.SELECT })) as any[];

// the private conversations of the numbers of a person (QR Code) that began before the number was connected here (copied from the phone, or
// brought by the catch-up of the first sync) and that are not read yet; recent ones only, one reading per conversation
export const importCandidates = async (whatsappId?: number | null, limit = 500): Promise<any[]> =>
  rows(`SELECT t.id AS ticketId, t.contactId, w.ownerId AS userId, l.id AS leadId, l.poloId FROM Tickets t
      JOIN Whatsapps w ON w.id = t.whatsappId JOIN Contacts c ON c.id = t.contactId LEFT JOIN Leads l ON l.contactId = t.contactId
    WHERE w.channel = 'whatsapp' AND w.ownerId IS NOT NULL ${whatsappId ? "AND w.id = :whatsappId" : ""}
      AND t.isGroup = false AND c.isGroup = false AND COALESCE(c.isStaff, false) = false AND COALESCE(c.isPersonal, false) = false
      AND t.lastMessageAt > :since
      AND EXISTS (SELECT 1 FROM Messages m WHERE m.ticketId = t.id AND m.fromMe = false)
      AND (t.isHistorical = true OR EXISTS (SELECT 1 FROM Messages m2 WHERE m2.ticketId = t.id AND m2.createdAt < COALESCE(w.historyImportedAt, w.createdAt)))
      AND NOT EXISTS (SELECT 1 FROM ConversationReadings r WHERE r.kind = 'importacao' AND r.ticketId = t.id)
    ORDER BY t.lastMessageAt DESC LIMIT :limit`,
  { whatsappId: whatsappId || 0, since: new Date(Date.now() - LOOKBACK_DAYS * 864e5), limit });

export const enqueueImported = async (whatsappId?: number | null): Promise<number> => {
  let added = 0;
  for (const c of await importCandidates(whatsappId)) {
    // eslint-disable-next-line no-await-in-loop
    const [, created] = await ConversationReading.findOrCreate({
      where: { kind: "importacao", ticketId: Number(c.ticketId), ref: "copia" },
      defaults: { kind: "importacao", ticketId: Number(c.ticketId), ref: "copia", leadId: c.leadId ? Number(c.leadId) : null, userId: Number(c.userId) || null, poloId: c.poloId ? Number(c.poloId) : null } as any
    });
    if (created) added += 1;
  }
  return added;
};

// the column of the enrollments the reading found but could not prove (no RGM in the conversation): right after "Matrícula em andamento"
const confirmStage = async (): Promise<LeadStage> => {
  const found = await LeadStage.findOne({ where: { name: CONFIRM_STAGE } });
  if (found) return found;
  const stages = await LeadStage.findAll({ order: [["position", "ASC"]] });
  const after = stages.find(s => /matr[ií]cula em andamento/i.test(s.name)) || stages.filter(s => s.type === "open").pop();
  const position = after ? after.position + 1 : stages.length + 1;
  await LeadStage.increment("position", { by: 1, where: { position: { [Op.gte]: position } } as any });
  return LeadStage.create({ name: CONFIRM_STAGE, type: "open", color: "#0f766e", position } as any);
};

export interface ImportOutcome { action: "nao_lead" | "andamento" | "matriculado" | "confirmar" | "recuperar" | "nada"; leadId: number | null }

// what a reading of a copied conversation does in the CRM
export const applyImport = async (reading: ConversationReading, answer: ImportAnswer): Promise<ImportOutcome> => {
  const { addActivity, changeStage, upsertLead } = await import("../CrmServices/LeadCore");
  const ticketId = reading.ticketId;
  const [t] = await rows(`SELECT t.id, t.contactId, w.ownerId FROM Tickets t JOIN Whatsapps w ON w.id = t.whatsappId WHERE t.id = :ticketId`, { ticketId });
  if (!t) return { action: "nada", leadId: null };
  const contact = await Contact.findByPk(t.contactId);
  if (!contact) return { action: "nada", leadId: null };
  const [times] = await rows(`SELECT MIN(m.createdAt) AS firstAt, MAX(m.createdAt) AS lastAt,
      MIN(CASE WHEN m.fromMe = true THEN m.createdAt END) AS firstMine FROM Messages m WHERE m.ticketId = :ticketId`, { ticketId });
  const firstAt = times?.firstAt ? new Date(times.firstAt) : new Date();
  const lastAt = times?.lastAt ? new Date(times.lastAt) : new Date();
  const firstMine = times?.firstMine ? new Date(times.firstMine) : null;
  let lead = await Lead.findOne({ where: { contactId: contact.id } });

  if (!answer.isLead) {
    // a lead the system made by itself for this conversation (still in the funnel, untouched: no proposal, no enrollment) leaves the CRM
    if (lead && !lead.isHistorical && !lead.enrolledAt) {
      const stage = await LeadStage.findByPk(lead.stageId);
      const proposals = await Proposal.count({ where: { leadId: lead.id } as any });
      if (stage && stage.type === "open" && !proposals) {
        await lead.update({ isHistorical: true });
        await addActivity(lead.id, null, "system", "A leitura do WhatsApp indicou que esta conversa não é de alguém interessado em estudar: saiu do funil.");
      }
    }
    return { action: "nao_lead", leadId: lead ? lead.id : null };
  }

  if (!lead) {
    ({ lead } = await upsertLead({ name: contact.name, phone: contact.number, source: IMPORT_SOURCE, channel: "whatsapp", contactId: contact.id, ownerId: Number(t.ownerId) || null }) as { lead: Lead });
  } else if (lead.isHistorical && !lead.enrolledAt) {
    await lead.update({ isHistorical: false });
  }
  // the lead came when the conversation began (an old conversation does not swell this month's numbers) and it was answered when the
  // consultant first wrote (it is not a "new lead to check")
  const patch: any = { lastContactAt: lastAt };
  if (lead.createdAt && new Date(lead.createdAt).getTime() > firstAt.getTime() + 864e5) patch.createdAt = firstAt;
  if (!lead.firstContactAt && firstMine) patch.firstContactAt = firstMine;
  if (!lead.ownerId && t.ownerId) patch.ownerId = Number(t.ownerId);
  if (!lead.courseId && answer.course) {
    const { findCourse } = await import("../CommercialServices/Academic");
    const course = await findCourse({ courseName: answer.course }).catch(() => null);
    if (course) patch.courseId = course.id;
  }
  await lead.update(patch);
  const [commercial] = await LeadCommercial.findOrCreate({ where: { leadId: lead.id }, defaults: { leadId: lead.id } as any });
  await commercial.update({ summary: answer.summary || commercial.summary, nextAction: answer.next || commercial.nextAction });
  await addActivity(lead.id, null, "system", `Leitura do WhatsApp: ${answer.summary || "conversa lida"}${answer.next ? ` Próximo passo: ${answer.next}` : ""}`.slice(0, 600));

  const current = await LeadStage.findByPk(lead.stageId);
  if (lead.enrolledAt || (current && current.type === "won")) return { action: "nada", leadId: lead.id };
  const { resolveStage } = await import("../CommercialServices/Pipeline");

  if (answer.situation === "em_andamento") {
    const target = answer.stage ? await resolveStage(answer.stage) : null;
    const to = target ? await LeadStage.findByPk(target) : null;
    // only forward (a stage the consultant already passed is kept)
    if (to && (!current || current.type !== "open" || to.position > current.position)) await changeStage(lead.id, to.id, null).catch(err => logger.warn(`Leitura: etapa do lead ${lead!.id}: ${err}`));
    return { action: "andamento", leadId: lead.id };
  }

  if (answer.situation === "matriculado") {
    const texts = (await rows(`SELECT m.body FROM Messages m WHERE m.ticketId = :ticketId AND m.body IS NOT NULL ORDER BY m.createdAt DESC LIMIT 200`, { ticketId })).map(m => String(m.body || ""));
    const rgm = findRgm(texts);
    const taken = rgm ? await Lead.findOne({ where: { rgm, id: { [Op.ne]: lead.id } } as any, attributes: ["id"] }) : null;
    const won = await LeadStage.findOne({ where: { type: "won" }, order: [["position", "ASC"]] });
    if (rgm && !taken && won) {
      // an enrollment of the past, recognised (not a new one): no notice, no tutoring onboarding, no fee tag; it counts on the day it happened
      await lead.update({ stageId: won.id, wonAt: lastAt, enrolledAt: lastAt, rgm, onboardingStatus: "done", lostAt: null, lostReason: null, lostNote: null, recoveryState: null } as any);
      await addActivity(lead.id, null, "stage", `${current ? current.name : "—"} → ${won.name} (matrícula reconhecida pela leitura do WhatsApp, RGM na conversa)`);
      return { action: "matriculado", leadId: lead.id };
    }
    const stage = await confirmStage();
    if (!current || current.id !== stage.id) await changeStage(lead.id, stage.id, null).catch(() => undefined);
    const owner = Number(lead.ownerId || t.ownerId) || null;
    if (owner) {
      const { ensureTask } = await import("../CrmServices/Tasks");
      await ensureTask({ key: `confirm-enroll-${lead.id}`, leadId: lead.id, userId: owner, title: "Confirmar a matrícula: informe o RGM", dueAt: new Date(Date.now() + 864e5), type: "documentos" });
    }
    return { action: "confirmar", leadId: lead.id };
  }

  // stopped answering, or gave up: the column of the funnel, and the lead goes to "Recuperação" with the reason
  const reason = lostReasonFor(answer.objection, answer.situation);
  if (answer.situation === "sem_resposta") {
    const target = await resolveStage("no_response");
    if (target && (!current || current.id !== target)) await changeStage(lead.id, target, null).catch(() => undefined);
  } else {
    const target = await resolveStage("no_interest");
    if (target && (!current || current.id !== target)) await changeStage(lead.id, target, null, { lostReason: reason, lostNote: answer.reason || undefined }).catch(() => undefined);
  }
  await lead.update({ recoveryState: "aberta", recoveryAt: new Date(), recoveryReason: (answer.reason || reason).slice(0, 160), recoveryObjection: answer.objection || null } as any);
  return { action: "recuperar", leadId: lead.id };
};
