import { Op, QueryTypes } from "sequelize";

import sequelize from "../../database";
import { getSetting } from "../../helpers/AppSettings";
import { portable } from "../../helpers/sqlDialect";
import Course from "../../models/Course";
import Lead from "../../models/Lead";
import Polo from "../../models/Polo";
import User from "../../models/User";
import { connectionOfTeam, TUTORIA_SEGMENTS } from "../ChannelServices/ConnectionTeam";
import { openingTemplateOf } from "../TicketServices/OpeningTemplate";

const MARK = "‎";
const H = 3600000;
const DAY = 24 * H;

export interface ContactFacts {
  ticketId: number | null;
  status: string | null;
  unread: number;
  lastIn: Date | null;
  lastOut: Date | null;
  // the last call from the consultants and whether the tutoring answered after it
  callAt: Date | null;
  callNote: string | null;
}

export interface StudentRules {
  slaHours: number;
  idleDays: number;
  official: boolean;
}

export interface StudentState {
  daysWithoutContact: number | null;
  late: boolean;
  idle: boolean;
  callPending: boolean;
  windowOpen: boolean;
}

// The state of one student for the tutor: late on the first contact (onboarding past the deadline), without contact for too long,
// a call of the consultants not answered yet, and whether the 24 hours of the official tutoring number are open.
export const studentState = (lead: { onboardingStatus: string; enrolledAt: Date | null }, f: ContactFacts, rules: StudentRules, now = Date.now()): StudentState => {
  const lastContact = Math.max(f.lastIn ? +new Date(f.lastIn) : 0, f.lastOut ? +new Date(f.lastOut) : 0);
  const since = lastContact || (lead.enrolledAt ? +new Date(lead.enrolledAt) : 0);
  const daysWithoutContact = since ? Math.floor((now - since) / DAY) : null;
  const late = lead.onboardingStatus === "pending" && !!lead.enrolledAt && now - +new Date(lead.enrolledAt) > rules.slaHours * H;
  // only after the onboarding: a student never contacted is "late", not "idle"
  const idle = lead.onboardingStatus !== "pending" && daysWithoutContact !== null && daysWithoutContact >= rules.idleDays;
  const callPending = !!f.callAt && (!f.lastOut || +new Date(f.lastOut) < +new Date(f.callAt));
  const windowOpen = !rules.official || (!!f.lastIn && now - +new Date(f.lastIn) < DAY);
  return { daysWithoutContact, late, idle, callPending, windowOpen };
};

// what the conversations of the tutoring side say about each contact (one query for all of them)
const factsOf = async (contactIds: number[]): Promise<Map<number, ContactFacts>> => {
  const out = new Map<number, ContactFacts>();
  if (!contactIds.length) return out;
  const rows = (await sequelize.query(
    portable(`
    SELECT t.contactId AS contactId,
      MAX(t.id) AS ticketId,
      SUM(t.unreadMessages) AS unread,
      MAX(CASE WHEN m.fromMe = false THEN m.createdAt END) AS lastIn,
      MAX(CASE WHEN m.fromMe = true AND m.body NOT LIKE :mark THEN m.createdAt END) AS lastOut
    FROM Tickets t LEFT JOIN Messages m ON m.ticketId = t.id
    WHERE t.contactId IN (:ids) AND t.segment IN (:segments) AND t.isGroup = false
    GROUP BY t.contactId`),
    { replacements: { ids: contactIds, segments: TUTORIA_SEGMENTS, mark: `${MARK}%` }, type: QueryTypes.SELECT }
  )) as any[];
  const calls = (await sequelize.query(
    portable(`
    SELECT t.contactId AS contactId, e.createdAt AS callAt, e.note AS callNote
    FROM TicketEvents e JOIN Tickets t ON t.id = e.ticketId
    WHERE t.contactId IN (:ids) AND e.type = 'team_handoff_in' AND t.segment IN (:segments)
    ORDER BY e.createdAt ASC`),
    { replacements: { ids: contactIds, segments: TUTORIA_SEGMENTS }, type: QueryTypes.SELECT }
  )) as any[];
  const status = (await sequelize.query(
    portable(`SELECT id, status FROM Tickets WHERE id IN (:ids)`),
    { replacements: { ids: rows.map(r => Number(r.ticketId)).concat([0]) }, type: QueryTypes.SELECT }
  )) as any[];
  const statusOf = new Map(status.map(s => [Number(s.id), String(s.status)]));
  rows.forEach(r => out.set(Number(r.contactId), {
    ticketId: r.ticketId ? Number(r.ticketId) : null,
    status: r.ticketId ? statusOf.get(Number(r.ticketId)) || null : null,
    unread: Number(r.unread || 0),
    lastIn: r.lastIn ? new Date(r.lastIn) : null,
    lastOut: r.lastOut ? new Date(r.lastOut) : null,
    callAt: null,
    callNote: null
  }));
  // the last call of each contact (the query is ordered: the newest wins)
  calls.forEach(c => {
    const f = out.get(Number(c.contactId)) || { ticketId: null, status: null, unread: 0, lastIn: null, lastOut: null, callAt: null, callNote: null };
    out.set(Number(c.contactId), { ...f, callAt: new Date(c.callAt), callNote: c.callNote || null });
  });
  return out;
};

export interface StudentsQuery {
  tutorId?: number | null;
  poloId?: number | null;
}

// The tutor's students ("Meus alunos"): the enrolled students given to the tutor (the management sees everybody, by tutor and polo),
// with the conversation of the tutoring, the last contact, and what needs the tutor now.
export const listStudents = async (q: StudentsQuery) => {
  const [slaHours, idleDays, number, template] = await Promise.all([
    getSetting("onboarding_sla_hours", "24").then(v => Math.max(1, Number(v) || 24)),
    getSetting("tutoria_idle_days", "15").then(v => Math.max(1, Number(v) || 15)),
    connectionOfTeam("tutoria"),
    openingTemplateOf("tutoria")
  ]);
  const rules: StudentRules = { slaHours, idleDays, official: number?.channel === "whatsapp_cloud" };
  const leads = await Lead.findAll({
    where: {
      enrolledAt: { [Op.ne]: null },
      lostAt: null,
      ...(q.tutorId ? { onboardingTutorId: q.tutorId } : {}),
      ...(q.poloId ? { poloId: q.poloId } : {})
    } as any,
    attributes: ["id", "name", "phone", "contactId", "poloId", "courseId", "onboardingTutorId", "onboardingStatus", "onboardingChecklist", "enrolledAt"],
    include: [
      { model: Polo, attributes: ["id", "name"] },
      { model: Course, attributes: ["id", "name"] }
    ],
    order: [["enrolledAt", "DESC"]],
    limit: 2000
  });
  const tutors = new Map((await User.findAll({ where: { id: [...new Set(leads.map(l => l.onboardingTutorId).filter(Boolean))] } as any, attributes: ["id", "name"] })).map(u => [u.id, u.name]));
  const facts = await factsOf([...new Set(leads.map(l => l.contactId).filter(Boolean))] as number[]);
  const blank: ContactFacts = { ticketId: null, status: null, unread: 0, lastIn: null, lastOut: null, callAt: null, callNote: null };
  const now = Date.now();
  const students = leads.map(l => {
    const f = (l.contactId && facts.get(l.contactId)) || blank;
    const checklist = (() => { try { return typeof l.onboardingChecklist === "string" ? JSON.parse(l.onboardingChecklist as any) : l.onboardingChecklist || {}; } catch { return {}; } })();
    const steps = Object.values(checklist || {});
    return {
      leadId: l.id,
      name: l.name,
      phone: l.phone,
      contactId: l.contactId,
      polo: (l as any).polo ? (l as any).polo.name : null,
      course: (l as any).course ? (l as any).course.name : null,
      tutorId: l.onboardingTutorId || null,
      tutorName: l.onboardingTutorId ? tutors.get(l.onboardingTutorId) || null : null,
      onboardingStatus: l.onboardingStatus,
      checklist: { done: steps.filter(Boolean).length, total: Math.max(5, steps.length) },
      enrolledAt: l.enrolledAt,
      ticketId: f.ticketId,
      ticketStatus: f.status,
      unread: f.unread,
      lastIn: f.lastIn,
      lastOut: f.lastOut,
      callNote: f.callNote,
      ...studentState({ onboardingStatus: l.onboardingStatus, enrolledAt: l.enrolledAt }, f, rules, now)
    };
  });
  const counters = {
    total: students.length,
    pending: students.filter(s => s.onboardingStatus === "pending").length,
    late: students.filter(s => s.late).length,
    idle: students.filter(s => s.idle).length,
    calls: students.filter(s => s.callPending).length,
    closedWindow: students.filter(s => rules.official && !s.windowOpen).length,
    unread: students.filter(s => s.unread > 0).length
  };
  return { rules: { slaHours, idleDays, official: rules.official, numberName: number ? number.name : null, template: !!template }, counters, students };
};
