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
import { ImportAnswer, findRgm, lostReasonFor, teamByName } from "./Kinds";

// THE CONVERSATIONS COPIED FROM A CONSULTANT'S PHONE (WhatsApp by QR Code), read once each: who is a lead, who already enrolled, who stopped
// and why. What it becomes in the CRM (see applyImport) is silent: one notice at the end for the owner of the number and the management.
export const IMPORT_SOURCE = "WhatsApp do consultor";
// the same 90 days of the copy (whatsapp_copy_days): older sales are not worth a reading
const LOOKBACK_DAYS = Number(process.env.READING_IMPORT_LOOKBACK_DAYS || 90);
// a lead still deciding whose last message was the consultant's, with no answer for these days, goes to Recuperação as stalled
export const STALLED_DAYS = Number(process.env.READING_STALLED_DAYS || 7);
const CONFIRM_STAGE = "Matrícula a confirmar";
// the reason of "Parados" in Recuperação: the person stopped answering
export const STALLED_REASON = "Parou de responder";

const rows = async (sql: string, replacements: Record<string, any>): Promise<any[]> =>
  (await sequelize.query(portable(sql), { replacements, type: QueryTypes.SELECT })) as any[];

// the private conversations of the numbers of a person (QR Code) that began before the number was connected here (copied from the phone, or
// brought by the catch-up of the first sync) and that are not read yet; recent ones only, one reading per conversation
export const importCandidates = async (whatsappId?: number | null, limit = 500): Promise<any[]> =>
  rows(`SELECT t.id AS ticketId, t.contactId, w.ownerId AS userId, l.id AS leadId, l.poloId FROM Tickets t
      JOIN Whatsapps w ON w.id = t.whatsappId JOIN Contacts c ON c.id = t.contactId LEFT JOIN Leads l ON l.contactId = t.contactId
    WHERE w.channel = 'whatsapp' AND w.ownerId IS NOT NULL ${whatsappId ? "AND w.id = :whatsappId" : ""}
      AND t.isGroup = false AND c.isGroup = false AND COALESCE(c.isStaff, false) = false AND COALESCE(c.isPersonal, false) = false
      AND COALESCE(c.kind, 'person') = 'person'
      AND NOT EXISTS (SELECT 1 FROM Users u2 WHERE u2.phone IS NOT NULL AND LENGTH(u2.phone) >= 8 AND RIGHT(REGEXP_REPLACE(u2.phone, '[^0-9]', '', 'g'), 8) = RIGHT(REGEXP_REPLACE(c.number, '[^0-9]', '', 'g'), 8))
      AND NOT EXISTS (SELECT 1 FROM Affiliates a2 WHERE a2.phone IS NOT NULL AND LENGTH(a2.phone) >= 8 AND RIGHT(REGEXP_REPLACE(a2.phone, '[^0-9]', '', 'g'), 8) = RIGHT(REGEXP_REPLACE(c.number, '[^0-9]', '', 'g'), 8))
      AND t.lastMessageAt > :since
      AND EXISTS (SELECT 1 FROM Messages m WHERE m.ticketId = t.id AND m.fromMe = false)
      AND (t.isHistorical = true OR EXISTS (SELECT 1 FROM Messages m2 WHERE m2.ticketId = t.id AND m2.createdAt < COALESCE(w.historyImportedAt, w.createdAt)))
      AND NOT EXISTS (SELECT 1 FROM ConversationReadings r WHERE r.kind = 'importacao' AND r.ticketId = t.id)
    ORDER BY t.lastMessageAt ASC LIMIT :limit`,
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

// the column of the enrollments the reading found (always to be confirmed by a person): right after "Matrícula em andamento"
const confirmStage = async (): Promise<LeadStage> => {
  const found = await LeadStage.findOne({ where: { name: CONFIRM_STAGE } });
  if (found) return found;
  const stages = await LeadStage.findAll({ order: [["position", "ASC"]] });
  const after = stages.find(s => /matr[ií]cula em andamento/i.test(s.name)) || stages.filter(s => s.type === "open").pop();
  const position = after ? after.position + 1 : stages.length + 1;
  await LeadStage.increment("position", { by: 1, where: { position: { [Op.gte]: position } } as any });
  return LeadStage.create({ name: CONFIRM_STAGE, type: "open", color: "#0f766e", position } as any);
};

export interface ImportOutcome { action: "nao_lead" | "andamento" | "confirmar" | "recuperar" | "nada"; leadId: number | null }

// what a reading of a copied conversation does in the CRM
export const applyImport = async (reading: ConversationReading, answer: ImportAnswer): Promise<ImportOutcome> => {
  const { addActivity, changeStage, upsertLead } = await import("../CrmServices/LeadCore");
  const ticketId = reading.ticketId;
  const [t] = await rows(`SELECT t.id, t.contactId, w.ownerId FROM Tickets t JOIN Whatsapps w ON w.id = t.whatsappId WHERE t.id = :ticketId`, { ticketId });
  if (!t) return { action: "nada", leadId: null };
  const contact = await Contact.findByPk(t.contactId);
  if (!contact) return { action: "nada", leadId: null };
  const [times] = await rows(`SELECT MAX(m.createdAt) AS lastAt,
      MIN(CASE WHEN m.fromMe = true THEN m.createdAt END) AS firstMine FROM Messages m WHERE m.ticketId = :ticketId`, { ticketId });
  const lastAt = times?.lastAt ? new Date(times.lastAt) : new Date();
  const firstMine = times?.firstMine ? new Date(times.firstMine) : null;
  let lead = await Lead.findOne({ where: { contactId: contact.id } });

  if (!answer.isLead) {
    // a colleague saved with a job of the team, and the model also says "equipe": the contact becomes "Equipe" (reversible in Contatos), so
    // their conversations leave the funnel, the statistics and the next readings
    if (answer.contactType === "equipe" && teamByName(contact.name) && !contact.isStaff) {
      const { applyRelation } = await import("../CrmServices/Relation");
      await applyRelation(contact, "staff").catch(err => logger.warn(`Leitura: equipe do contato ${contact.id}: ${err}`));
    }
    // a lead the system made by itself for this conversation (still in the funnel, untouched: no proposal, no enrollment) leaves the CRM
    if (lead && !lead.enrolledAt) {
      const stage = await LeadStage.findByPk(lead.stageId);
      const proposals = await Proposal.count({ where: { leadId: lead.id } as any });
      if (!lead.isHistorical && stage && stage.type === "open" && !proposals) {
        await lead.update({ isHistorical: true });
        await addActivity(lead.id, null, "system", answer.contactType === "equipe" || answer.contactType === "parceiro"
          ? "A leitura do WhatsApp indicou que esta conversa é com alguém da equipe ou parceiro (fala de outra pessoa): saiu do funil."
          : "A leitura do WhatsApp indicou que esta conversa não é de alguém interessado em estudar: saiu do funil.");
      }
      // what an earlier reading made for it goes away: the enrollment to confirm, its task, the place in Recuperação
      await undoReadingTraces(lead);
    }
    return { action: "nao_lead", leadId: lead ? lead.id : null };
  }

  if (!lead) {
    ({ lead } = await upsertLead({ name: contact.name, phone: contact.number, source: IMPORT_SOURCE, channel: "whatsapp", contactId: contact.id, ownerId: Number(t.ownerId) || null }) as { lead: Lead });
  } else if (lead.isHistorical && !lead.enrolledAt) {
    await lead.update({ isHistorical: false });
  }
  // the reading never rewrites the dates the lead already has (createdAt, the enrollment, the loss): it only fills what is empty. The lead
  // was answered when the consultant first wrote, so it is not a "new lead to check".
  const patch: any = { lastContactAt: lastAt };
  if (!lead.firstContactAt && firstMine) patch.firstContactAt = firstMine;
  if (!lead.ownerId && t.ownerId) patch.ownerId = Number(t.ownerId);
  if (!lead.courseId && answer.course) {
    const { findCourse } = await import("../CommercialServices/Academic");
    const course = await findCourse({ courseName: answer.course }).catch(() => null);
    if (course) patch.courseId = course.id;
  }
  await lead.update(patch);
  const [commercial] = await LeadCommercial.findOrCreate({ where: { leadId: lead.id }, defaults: { leadId: lead.id } as any });
  // the summary of the sale; the next step the reading suggests is free text (LeadCommercials.nextAction is a code of 40 characters: a long
  // "next step" there made every reading of a lead fail), so it goes, with what was left pending, into the lead
  await commercial.update({ summary: answer.summary || commercial.summary });
  const pending = [answer.pending, answer.next && answer.next !== answer.pending ? `Próximo passo: ${answer.next}` : ""].filter(Boolean).join(" ").slice(0, 400);
  await lead.update({
    recoveryStage: answer.stalledAt || lead.recoveryStage || null,
    recoveryPending: pending || lead.recoveryPending || null,
    serviceTip: answer.improve || lead.serviceTip || null
  } as any);
  await addActivity(lead.id, null, "system", `Leitura do WhatsApp: ${answer.summary || "conversa lida"}${answer.next ? ` Próximo passo: ${answer.next}` : ""}`.slice(0, 600));

  const current = await LeadStage.findByPk(lead.stageId);
  if (lead.enrolledAt || (current && current.type === "won")) return { action: "nada", leadId: lead.id };
  const { resolveStage } = await import("../CommercialServices/Pipeline");

  if (answer.situation === "em_andamento") {
    const target = answer.stage ? await resolveStage(answer.stage) : null;
    const to = target ? await LeadStage.findByPk(target) : null;
    // only forward (a stage the consultant already passed is kept)
    if (to && (!current || current.type !== "open" || to.position > current.position)) await changeStage(lead.id, to.id, null).catch(err => logger.warn(`Leitura: etapa do lead ${lead!.id}: ${err}`));
    // still deciding, but the last word was the consultant's and nobody answered for days: it goes to Recuperação as stalled
    const [last] = await rows(`SELECT m.fromMe, m.createdAt FROM Messages m WHERE m.ticketId = :ticketId ORDER BY m.createdAt DESC, m.id DESC LIMIT 1`, { ticketId });
    const quietDays = last ? (Date.now() - new Date(last.createdAt).getTime()) / 864e5 : 0;
    if (last && (last.fromMe === true || last.fromMe === 1 || last.fromMe === "1" || last.fromMe === "t") && quietDays >= STALLED_DAYS && !lead.recoveryState) {
      await lead.update({ recoveryState: "aberta", recoveryAt: new Date(), recoveryReason: STALLED_REASON, recoveryObjection: answer.objection || null } as any);
      return { action: "recuperar", leadId: lead.id };
    }
    return { action: "andamento", leadId: lead.id };
  }

  if (answer.situation === "matriculado") {
    // The reading NEVER enrolls anyone: a conversation (where anyone can write "RGM 123") is not proof. The lead goes to "Matrícula a
    // confirmar" with the RGM it found as a suggestion; a person confirms it on the enrollment screen, with the proof. No wonAt, no
    // enrolledAt, no RGM saved, nothing counted in Matrículas or Metas until then.
    const messages = await rows(`SELECT m.body, m.createdAt FROM Messages m WHERE m.ticketId = :ticketId AND m.body IS NOT NULL ORDER BY m.createdAt DESC LIMIT 200`, { ticketId });
    const texts = messages.map(m => String(m.body || ""));
    const rgm = findRgm(texts);
    // the day of the enrollment: the message that shows the RGM, else the last one that talks about the enrollment
    const said = messages.find(m => (rgm && findRgm([String(m.body || "")]) === rgm)) || messages.find(m => /matr[ií]cula (feita|realizada|confirmada|efetuada)|matriculad[oa]|fiz (a|minha) matr[ií]cula/i.test(String(m.body || "")));
    const suggested: any = { rgmSuggested: rgm || lead.rgmSuggested || null, enrolledAtSuggested: said ? new Date(said.createdAt) : lead.enrolledAtSuggested || null };
    // the polo the conversation names, when the lead has none: compared with the polos registered (name or city)
    if (!lead.poloId && answer.polo) {
      const { default: Polo } = await import("../../models/Polo");
      const norm = (v: string) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
      const wanted = norm(answer.polo);
      const polos = await Polo.findAll({ where: { active: true } as any, attributes: ["id", "name"] });
      const hit = wanted.length >= 3 ? polos.find(p => { const n = norm(p.name); return n === wanted || n.includes(wanted) || wanted.includes(n.replace(/ polo$| - [a-z]{2}$/g, "")); }) : null;
      if (hit) suggested.poloId = hit.id;
    }
    await lead.update(suggested);
    const stage = await confirmStage();
    if (!current || current.id !== stage.id) await changeStage(lead.id, stage.id, null).catch(() => undefined);
    await addActivity(lead.id, null, "system", rgm
      ? `A leitura do WhatsApp indica que a matrícula foi feita. RGM sugerido pela conversa: ${rgm}. Confirme na tela de matrícula, com o comprovante.`
      : "A leitura do WhatsApp indica que a matrícula foi feita, sem RGM na conversa. Confirme na tela de matrícula, com o comprovante.");
    const owner = Number(lead.ownerId || t.ownerId) || null;
    if (owner) {
      const { ensureTask } = await import("../CrmServices/Tasks");
      await ensureTask({ key: `confirm-enroll-${lead.id}`, leadId: lead.id, userId: owner, title: rgm ? `Confirmar a matrícula (RGM sugerido: ${rgm})` : "Confirmar a matrícula: informe o RGM", dueAt: new Date(Date.now() + 864e5), type: "documentos" });
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
  // who stopped answering is in "Parados" (the reason the model wrote goes with what was left pending); who gave up keeps the reason
  const stalled = answer.situation === "sem_resposta";
  await lead.update({
    recoveryState: "aberta", recoveryAt: new Date(),
    recoveryReason: stalled ? STALLED_REASON : (answer.reason || reason).slice(0, 160),
    ...(stalled && answer.reason ? { recoveryPending: [answer.reason, lead.recoveryPending].filter(Boolean).join(" ").slice(0, 400) } : {}),
    recoveryObjection: answer.objection || null
  } as any);
  return { action: "recuperar", leadId: lead.id };
};

// what a reading left on a lead that turned out not to be one (or not enrolled): the suggested enrollment, the task to confirm it, the place
// in "Recuperação" and the column "Matrícula a confirmar" (back to the first open column)
export const undoReadingTraces = async (lead: Lead): Promise<void> => {
  // the lead may have moved already (Não é matrícula moves it first): read what it is now
  await lead.reload();
  const LeadTask = (await import("../../models/LeadTask")).default;
  await LeadTask.update({ doneAt: new Date() } as any, { where: { leadId: lead.id, automationKey: `confirm-enroll-${lead.id}`, doneAt: null } as any });
  const patch: any = {};
  if ((lead as any).rgmSuggested || (lead as any).enrolledAtSuggested) Object.assign(patch, { rgmSuggested: null, enrolledAtSuggested: null });
  if ((lead as any).recoveryState === "aberta") Object.assign(patch, { recoveryState: null, recoveryReason: null, recoveryAt: null });
  if (Object.keys(patch).length) await lead.update(patch);
  const stage = await LeadStage.findByPk(lead.stageId);
  if (stage && stage.name === CONFIRM_STAGE) {
    const first = await LeadStage.findOne({ where: { type: "open", id: { [Op.ne]: stage.id } } as any, order: [["position", "ASC"]] });
    if (first) {
      const { changeStage } = await import("../CrmServices/LeadCore");
      await changeStage(lead.id, first.id, null).catch(err => logger.warn(`Leitura: etapa do lead ${lead.id}: ${err}`));
    }
  }
};
