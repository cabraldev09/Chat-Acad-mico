import { canTutorPolo } from "../PoloServices/TutorsOfPolo";
import UserQueue from "../../models/UserQueue";
import { roleOf } from "../../helpers/Roles";
import sequelize from "../../database";
import { Op } from "sequelize";

import AppError from "../../errors/AppError";
import { getSetting } from "../../helpers/AppSettings";
import { getIO } from "../../libs/socket";
import Lead from "../../models/Lead";
import LeadStage from "../../models/LeadStage";
import LeadTask from "../../models/LeadTask";
import LeadEnrollment from "../../models/LeadEnrollment";
import Course from "../../models/Course";
import { touchAnalytics } from "../AnalyticsServices/Realtime";
import Polo from "../../models/Polo";
import PoloMember from "../../models/PoloMember";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import TicketEvent from "../../models/TicketEvent";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import { pickUserForQueue } from "../AutomationServices/AutoAssignTicket";
import syncPoloQueues from "../PoloServices/SyncPoloQueues";
import { createEnrollmentCharge } from "../PaymentServices/EnrollmentPayments";
import { markFeeExempt, markFeePaid, markFeePending } from "../PaymentServices/FeeTags";
import { startDocuments } from "./Documents";
import ShowTicketService from "../TicketServices/ShowTicketService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import dispatchWebhook from "../WebhookServices/DispatchWebhook";
import { addActivity, changeStage, loadLead, resolveLeadTarget } from "./LeadCore";
import { markMilestone } from "../CommercialServices/Milestones";

export interface EnrollInput {
  poloId: number;
  tutorId?: number | "auto" | null;
  note?: string;
  // "exempt": the consultant informs that there is no fee to charge (no charge, label "Matrícula isenta")
  fee?: "paid" | "now" | "later" | "exempt";
  feeDueDate?: string | null;
  // ignored: kept only so older screens that still send it do not break
  introMessage?: string | null;
  whatsappId?: number | null; // connection of the tutoring chat (default: the sales conversation's)
  // another enrollment of a student who is already enrolled (another course): it counts again and the tutor gets a new task
  additional?: boolean;
  courseId?: number | null;
  courseName?: string | null;
}

// Confirms the enrollment and hands the student to the polo's tutoring team:
// the sales conversation is closed (the consultant keeps the lead, not the chat) and a
// separate "onboarding" conversation opens for the tutor.
const enrollLeadCore = async (lead: Lead, actorId: number, input: EnrollInput) => {
  const warnings: string[] = [];

  const polo = await Polo.findByPk(input.poloId);
  if (!polo) throw new AppError("ERR_NO_POLO_FOUND", 404);
  let queue = await Queue.findOne({
    where: { poloId: polo.id, role: "tutoria" },
    include: [{ model: User, as: "users", attributes: ["id", "name"] }]
  });
  if (!queue) {
    await syncPoloQueues(polo);
    queue = await Queue.findOne({
      where: { poloId: polo.id, role: "tutoria" },
      include: [{ model: User, as: "users", attributes: ["id", "name"] }]
    });
  }
  if (!queue) throw new AppError("ERR_POLO_NO_TUTORING_QUEUE", 400);

  // the tutor: chosen by hand (must work in the polo's tutoring) or picked by the queue rule
  let tutor: User | null = null;
  if (input.tutorId && input.tutorId !== "auto") {
    if (!(await canTutorPolo(polo.id, Number(input.tutorId)))) throw new AppError("ERR_USER_NOT_IN_QUEUE", 422);
    tutor = await User.findByPk(Number(input.tutorId));
  } else {
    tutor = await pickUserForQueue(queue, true);
    if (!tutor) warnings.push("O polo não tem tutor cadastrado: a conversa ficou aguardando na fila de tutoria.");
  }

  const won = await LeadStage.findOne({ where: { type: "won" }, order: [["position", "ASC"]] });
  if (!won) throw new AppError("ERR_STAGE_NOT_FOUND", 400);

  const { contact, whatsapp: salesConn } = await resolveLeadTarget(lead, actorId, input.whatsappId || null);
  // the student's tutoring conversation lives on the TUTOR's number (their own connection, else the tutoring number set by
  // the administration, else a shared number). It is never the consultant's personal number.
  let whatsapp: Whatsapp | null = null;
  if (input.whatsappId) whatsapp = await Whatsapp.findByPk(input.whatsappId);
  if (!whatsapp && tutor) whatsapp = await Whatsapp.findOne({ where: { ownerId: tutor.id, channel: "whatsapp" }, order: [["id", "ASC"]] });
  if (!whatsapp) {
    const tutoriaConnId = Number(await getSetting("tutoria_whatsapp_id", "0")) || 0;
    whatsapp = tutoriaConnId ? await Whatsapp.findByPk(tutoriaConnId) : null;
  }
  if (!whatsapp) whatsapp = await Whatsapp.findOne({ where: { ownerId: null as any, channel: salesConn.channel }, order: [["isDefault", "DESC"], ["id", "ASC"]] });
  if (!whatsapp) whatsapp = salesConn;

  // 1) the sales conversations end here
  const sales = await Ticket.findAll({
    where: { contactId: contact.id, status: { [Op.in]: ["open", "pending"] }, segment: { [Op.ne]: "onboarding" } }
  });
  for (const t of sales) {
    // eslint-disable-next-line no-await-in-loop
    await UpdateTicketService({ ticketData: { status: "closed" }, ticketId: t.id });
    // eslint-disable-next-line no-await-in-loop
    await TicketEvent.create({
      ticketId: t.id,
      type: "handoff",
      actorId,
      toQueueId: queue.id,
      toUserId: tutor?.id || null,
      note: "Matrícula confirmada: atendimento passou para a tutoria."
    });
  }

  // 2) the lead
  await lead.update({
    poloId: polo.id,
    onboardingStatus: "pending",
    onboardingTutorId: tutor?.id || null,
    enrolledAt: new Date(),
    onboardingStartedAt: null,
    onboardingDoneAt: null,
    onboardingAlertAt: null
  });
  await changeStage(lead.id, won.id, actorId);
  // the only way to the "Matriculado" column is this one (the AI agent cannot do it); the agent only records the milestone
  void markMilestone(lead.id, "enrolled");

  // 3) the tutor's own conversation
  let ticket = await Ticket.findOne({
    where: { contactId: contact.id, whatsappId: whatsapp.id, status: { [Op.in]: ["open", "pending"] }, segment: "onboarding" }
  });
  if (!ticket) {
    ticket = await Ticket.create({
      contactId: contact.id,
      whatsappId: whatsapp.id,
      status: tutor ? "open" : "pending",
      userId: tutor?.id || null,
      queueId: queue.id,
      segment: "onboarding",
      leadId: lead.id,
      isGroup: false,
      unreadMessages: 0,
      aiActive: false,
      chatbotNodeId: -1
    } as any);
  }
  await TicketEvent.create({
    ticketId: ticket.id,
    type: "handoff",
    actorId,
    toQueueId: queue.id,
    toUserId: tutor?.id || null,
    note: input.note ? String(input.note).slice(0, 1000) : "Início da ambientação."
  });
  const fresh = await ShowTicketService(ticket.id);
  getIO().to(fresh.status).to("notification").emit("ticket", { action: "update", ticket: fresh });

  // No greeting is sent here. The tutor sees the text the administration wrote ready in the message box ("Enviar
  // boas-vindas") and sends it, or not, when they decide to.

  // 4) the tutor's task
  if (tutor) {
    await LeadTask.create({
      leadId: lead.id,
      userId: tutor.id,
      type: "outro",
      title: "Ambientar o aluno na plataforma (1º acesso, AVA e contatos do polo)",
      dueAt: new Date(Date.now() + 4 * 3600000)
    } as any);
  }


  await addActivity(
    lead.id,
    actorId,
    "system",
    `Matrícula confirmada. Polo ${polo.name}; tutor: ${tutor ? tutor.name : "aguardando na fila"}.${input.note ? ` Obs.: ${input.note}` : ""}`
  );
  const out = (await loadLead(lead.id)) as Lead;
  getIO().emit("lead", { action: "update", lead: out });
  await dispatchWebhook("lead.enrolled", { leadId: lead.id, lead: lead.name, poloId: polo.id, tutorId: tutor?.id || null });
  return { lead: out, ticketId: ticket.id, tutor: tutor ? { id: tutor.id, name: tutor.name } : null, warnings };
};


// A student who is already enrolled enrolls again (another course, maybe another polo): the first enrollment stays as it is, this one is
// recorded on its own, counts for the consultant who owns the lead and for the polo, and the tutor receives a task for it.
const enrollAdditional = async (lead: Lead, actorId: number, input: EnrollInput) => {
  const warnings: string[] = [];
  const polo = await Polo.findByPk(input.poloId);
  if (!polo) throw new AppError("ERR_NO_POLO_FOUND", 404);
  let queue = await Queue.findOne({ where: { poloId: polo.id, role: "tutoria" }, include: [{ model: User, as: "users", attributes: ["id", "name"] }] });
  if (!queue) {
    await syncPoloQueues(polo);
    queue = await Queue.findOne({ where: { poloId: polo.id, role: "tutoria" }, include: [{ model: User, as: "users", attributes: ["id", "name"] }] });
  }
  if (!queue) throw new AppError("ERR_POLO_NO_TUTORING_QUEUE", 400);
  let tutor: User | null = null;
  if (input.tutorId && input.tutorId !== "auto") {
    if (!(await canTutorPolo(polo.id, Number(input.tutorId)))) throw new AppError("ERR_USER_NOT_IN_QUEUE", 422);
    tutor = await User.findByPk(Number(input.tutorId));
  } else {
    tutor = await pickUserForQueue(queue, true);
    if (!tutor) warnings.push("O polo não tem tutor cadastrado: a tarefa da ambientação ficou sem responsável.");
  }
  let courseName = input.courseName ? String(input.courseName).slice(0, 200) : null;
  let courseId: number | null = input.courseId ? Number(input.courseId) : null;
  if (courseId) {
    const course = await Course.findByPk(courseId);
    if (course) courseName = courseName || course.name;
    else courseId = null;
  }
  const row = await LeadEnrollment.create({
    leadId: lead.id,
    ownerId: lead.ownerId || null,
    poloId: polo.id,
    tutorId: tutor?.id || null,
    actorId,
    courseId,
    courseName,
    note: input.note ? String(input.note).slice(0, 1000) : null,
    enrolledAt: new Date()
  } as any);
  const total = 1 + (await LeadEnrollment.count({ where: { leadId: lead.id } }));
  const label = courseName ? ` em ${courseName}` : "";
  await LeadTask.create({
    leadId: lead.id,
    userId: tutor?.id || null,
    type: "outro",
    title: `Ambientar o aluno na nova matrícula${label}`,
    dueAt: new Date(Date.now() + 4 * 3600000)
  } as any);
  await addActivity(lead.id, actorId, "system", `Nova matrícula (${total}ª)${label}. Polo ${polo.name}; tutor: ${tutor ? tutor.name : "aguardando"}.${input.note ? ` Obs.: ${input.note}` : ""}`);
  const out = (await loadLead(lead.id)) as Lead;
  getIO().emit("lead", { action: "update", lead: out });
  if (lead.ownerId) touchAnalytics(lead.ownerId);
  await dispatchWebhook("lead.enrolled", { leadId: lead.id, lead: lead.name, poloId: polo.id, tutorId: tutor?.id || null, additional: true, enrollmentId: row.id, course: courseName });
  const ticket = await Ticket.findOne({ where: { leadId: lead.id, segment: "onboarding" }, order: [["id", "DESC"]], attributes: ["id"] });
  return { lead: out, ticketId: ticket ? ticket.id : null, tutor: tutor ? { id: tutor.id, name: tutor.name } : null, warnings, repeated: false, enrollment: row, number: total };
};

const enrollLead = async (lead: Lead, actorId: number, input: EnrollInput) => {
  if (input.additional) {
    const current = await Lead.findByPk(lead.id);
    if (!current) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
    if (!current.enrolledAt) throw new AppError("ERR_LEAD_NOT_ENROLLED_YET", 400);
    return enrollAdditional(current, actorId, input);
  }
  const result = await sequelize.transaction(async transaction => {
    const locked = await Lead.findByPk(lead.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!locked) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
    // A retried confirmation must not duplicate the tutor's task or the payment.
    if (locked.onboardingStatus && locked.onboardingStatus !== "none") {
      const ticket = await Ticket.findOne({ where: { leadId: locked.id, segment: "onboarding", status: { [Op.in]: ["open", "pending"] } } });
      if (ticket) return { lead: locked, ticketId: ticket.id, tutor: null, warnings: [] as string[], repeated: true };
    }
    return { ...(await enrollLeadCore(locked, actorId, input)), repeated: false };
  });
  // the documents the student has to deliver (the list of the administration), with the label while something is missing
  if (!result.repeated) await startDocuments(result.lead).catch(() => undefined);
  // the label of the fee: paid when it was declared paid, otherwise "Taxa pendente" until the payment is confirmed
  if (!result.repeated && input.fee) {
    if (input.fee === "exempt") {
      await markFeeExempt(result.lead);
      await addActivity(result.lead.id, actorId, "system", "Matrícula isenta: informado na confirmação que o aluno não paga a taxa (nenhuma cobrança foi gerada).");
    } else await (input.fee === "paid" ? markFeePaid : markFeePending)(result.lead);
  }
  // Network calls happen after the atomic local enrollment, never while holding the row lock.
  if (!result.repeated && input.fee && input.fee !== "paid" && input.fee !== "exempt") {
    try {
      await createEnrollmentCharge(result.lead, actorId, { method: "bolix", dueDate: input.fee === "later" ? input.feeDueDate || null : null });
    } catch (err) { result.warnings.push(`A cobrança da taxa não foi gerada (${err.message}). Gere pela aba Matrícula.`); }
  }
  return result;
};
export default enrollLead;

// A tutor who starts (or finishes) a student nobody had taken becomes that student's tutor: the conversation is theirs, open, in their list.
// Administration and coordination never take it over by accident (the tutor is the one who talks to the student).
const takeAsTutor = async (lead: Lead, actorId: number): Promise<void> => {
  if (lead.onboardingTutorId) return;
  const actor = await User.findByPk(actorId, { attributes: ["id", "name", "role", "profile"] });
  if (!actor || roleOf(actor) !== "tutor") return;
  await lead.update({ onboardingTutorId: actor.id });
  const tickets = lead.contactId ? await Ticket.findAll({ where: { contactId: lead.contactId, segment: "onboarding", status: { [Op.in]: ["open", "pending"] } } }) : [];
  for (const t of tickets) {
    // the tutor works the queue of the conversation they now hold
    // eslint-disable-next-line no-await-in-loop
    if (t.queueId) await UserQueue.findOrCreate({ where: { userId: actor.id, queueId: t.queueId } });
    // eslint-disable-next-line no-await-in-loop
    await t.update({ userId: actor.id, status: "open" });
    // eslint-disable-next-line no-await-in-loop
    await TicketEvent.create({ ticketId: t.id, type: "handoff", actorId, toQueueId: t.queueId || null, toUserId: actor.id, note: `${actor.name} assumiu a ambientação do aluno.` });
    // eslint-disable-next-line no-await-in-loop
    const fresh = await ShowTicketService(t.id);
    getIO().to("pending").to(fresh.status).to("notification").emit("ticket", { action: "update", ticket: fresh });
  }
  await LeadTask.update({ userId: actor.id } as any, { where: { leadId: lead.id, doneAt: null, title: { [Op.like]: "Ambientar o aluno%" } } as any });
  await addActivity(lead.id, actorId, "system", `${actor.name} assumiu a ambientação como tutor.`);
};

// The steps the tutor ticks while getting the student started. Informational: concluding the onboarding is still the tutor's decision.
export const CHECKLIST = [
  { key: "first_access", label: "Primeiro acesso à plataforma" },
  { key: "ava", label: "Ambiente virtual (AVA) apresentado" },
  { key: "polo_contacts", label: "Contatos do polo e da tutoria passados" },
  { key: "documents", label: "Documentos da matrícula conferidos" }
] as const;

export const parseChecklist = (raw: string | null | undefined): Record<string, string> => {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" ? v : {};
  } catch (_) {
    return {};
  }
};

export const setChecklist = async (lead: Lead, actorId: number, key: string, done: boolean) => {
  if (lead.onboardingStatus === "none") throw new AppError("ERR_ONBOARDING_NOT_STARTED", 400);
  const step = CHECKLIST.find(c => c.key === key);
  if (!step) throw new AppError("ERR_NOT_FOUND", 404);
  const now = parseChecklist(lead.onboardingChecklist);
  if (done) now[key] = new Date().toISOString();
  else delete now[key];
  await lead.update({ onboardingChecklist: JSON.stringify(now) });
  await addActivity(lead.id, actorId, "system", `Ambientação: "${step.label}" ${done ? "concluído" : "desmarcado"}.`);
  const out = (await loadLead(lead.id)) as Lead;
  getIO().emit("lead", { action: "update", lead: out });
  return { checklist: now };
};

// start / done of the onboarding (tutor side). Done schedules the follow-ups of the consultant.
export const setOnboarding = async (lead: Lead, actorId: number, action: "start" | "done") => {
  if (lead.onboardingStatus === "none") throw new AppError("ERR_ONBOARDING_NOT_STARTED", 400);
  await takeAsTutor(lead, actorId);
  if (action === "start") {
    if (lead.onboardingStatus === "done") throw new AppError("ERR_ONBOARDING_ALREADY_DONE", 400);
    await lead.update({ onboardingStatus: "started", onboardingStartedAt: lead.onboardingStartedAt || new Date() });
    await addActivity(lead.id, actorId, "system", "Ambientação iniciada pelo tutor.");
  } else {
    await lead.update({
      onboardingStatus: "done",
      onboardingDoneAt: new Date(),
      onboardingStartedAt: lead.onboardingStartedAt || new Date()
    });
    await addActivity(lead.id, actorId, "system", "Ambientação concluída: o aluno foi atendido pelo tutor.");
    // the consultant gets the student back for referrals and new sales
    if (lead.ownerId) {
      const day = 86400000;
      await LeadTask.bulkCreate([
        { leadId: lead.id, userId: lead.ownerId, type: "whatsapp", title: "Pedir indicação a este aluno", dueAt: new Date(Date.now() + 30 * day) },
        { leadId: lead.id, userId: lead.ownerId, type: "whatsapp", title: "Oferecer nova graduação ou pós a este aluno", dueAt: new Date(Date.now() + 90 * day) }
      ] as any);
    }
    await dispatchWebhook("onboarding.done", { leadId: lead.id, lead: lead.name, tutorId: lead.onboardingTutorId });
  }
  const out = (await loadLead(lead.id)) as Lead;
  getIO().emit("lead", { action: "update", lead: out });
  return out;
};

// Editing an enrollment after it was confirmed: swap the tutor, move the student to another polo, or put the onboarding
// back to an earlier step. The tutor's conversation follows (queue and attendant); nothing is sent to the student.
export interface EditOnboardingInput {
  status?: "pending" | "started" | "done";
  tutorId?: number | "auto" | null;
  poloId?: number | null;
}

export const editOnboarding = async (lead: Lead, actorId: number, input: EditOnboardingInput) => {
  if (lead.onboardingStatus === "none") throw new AppError("ERR_ONBOARDING_NOT_STARTED", 400);
  const notes: string[] = [];

  const previousTutorId = lead.onboardingTutorId;
  const changesPolo = !!input.poloId && input.poloId !== lead.poloId;
  const changesTutor = input.tutorId !== undefined && (input.tutorId === "auto" || Number(input.tutorId) !== lead.onboardingTutorId);
  if (changesPolo || changesTutor) {
    const poloId = changesPolo ? Number(input.poloId) : lead.poloId;
    const polo = poloId ? await Polo.findByPk(poloId) : null;
    if (!polo) throw new AppError("ERR_NO_POLO_FOUND", 404);
    let queue = await Queue.findOne({ where: { poloId: polo.id, role: "tutoria" } });
    if (!queue) {
      await syncPoloQueues(polo);
      queue = await Queue.findOne({ where: { poloId: polo.id, role: "tutoria" } });
    }
    if (!queue) throw new AppError("ERR_POLO_NO_TUTORING_QUEUE", 400);
    let tutor: User | null = null;
    if (input.tutorId && input.tutorId !== "auto") {
      if (!(await canTutorPolo(polo.id, Number(input.tutorId)))) throw new AppError("ERR_USER_NOT_IN_QUEUE", 422);
      tutor = await User.findByPk(Number(input.tutorId));
    } else if (input.tutorId === null) {
      tutor = null; // back to the polo's waiting line
    } else {
      // a new polo without a chosen tutor: the queue rule picks one; the same polo keeps the tutor
      tutor = changesPolo || input.tutorId === "auto" ? await pickUserForQueue(queue, true) : await User.findByPk(lead.onboardingTutorId);
    }
    const before = lead.onboardingTutorId ? (await User.findByPk(lead.onboardingTutorId))?.name : null;
    await lead.update({ poloId: polo.id, onboardingTutorId: tutor?.id || null });
    notes.push(changesPolo ? `Polo alterado para ${polo.name}` : "");
    notes.push(`Tutor: ${before || "fila"} → ${tutor ? tutor.name : "fila"}`);

    const tickets = lead.contactId
      ? await Ticket.findAll({ where: { contactId: lead.contactId, segment: "onboarding", status: { [Op.in]: ["open", "pending"] } } })
      : [];
    // whoever receives the conversation works the queue it is in
    if (tutor) await UserQueue.findOrCreate({ where: { userId: tutor.id, queueId: queue.id } });
    for (const t of tickets) {
      // eslint-disable-next-line no-await-in-loop
      await t.update({ queueId: queue.id, userId: tutor?.id || null, status: tutor ? "open" : "pending" });
      // eslint-disable-next-line no-await-in-loop
      await TicketEvent.create({ ticketId: t.id, type: "handoff", actorId, toQueueId: queue.id, toUserId: tutor?.id || null, note: notes.filter(Boolean).join(". ") });
      // eslint-disable-next-line no-await-in-loop
      const fresh = await ShowTicketService(t.id);
      getIO().to(fresh.status).to("notification").emit("ticket", { action: "update", ticket: fresh });
    }
    // open tutor task goes with the new tutor
    if (tutor) await LeadTask.update({ userId: tutor.id } as any, { where: { leadId: lead.id, userId: previousTutorId || tutor.id, doneAt: null, title: { [Op.like]: "Ambientar o aluno%" } } as any });
  }

  if (input.status && input.status !== lead.onboardingStatus) {
    if (input.status === "done") {
      await setOnboarding(lead, actorId, "done");
    } else if (input.status === "started") {
      await takeAsTutor(lead, actorId);
      await lead.update({ onboardingStatus: "started", onboardingStartedAt: lead.onboardingStartedAt || new Date(), onboardingDoneAt: null });
      notes.push("Ambientação em andamento");
    } else {
      await lead.update({ onboardingStatus: "pending", onboardingStartedAt: null, onboardingDoneAt: null, onboardingAlertAt: null });
      notes.push("Ambientação voltou para pendente");
    }
  }

  const summary = notes.filter(Boolean).join(". ");
  if (summary) await addActivity(lead.id, actorId, "system", `Matrícula editada: ${summary}.`);
  const out = (await loadLead(lead.id)) as Lead;
  getIO().emit("lead", { action: "update", lead: out });
  return out;
};
