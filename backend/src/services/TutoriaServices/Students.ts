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
      (SELECT SUM(u.unreadMessages) FROM Tickets u WHERE u.contactId = t.contactId AND u.segment IN (:segments) AND u.isGroup = false) AS unread,
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
  // a tutor's id, or "none" for the students nobody took yet
  tutorId?: number | "none" | null;
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
      ...(q.tutorId === "none" ? { onboardingTutorId: null } : q.tutorId ? { onboardingTutorId: q.tutorId } : {}),
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


// the filters of the screen: every tutor (not only the ones in the list loaded) and every polo
export const tutorsAndPolos = async () => {
  const tutors = await User.findAll({ where: { role: ["tutor", "academico"] } as any, attributes: ["id", "name"], order: [["name", "ASC"]] });
  const polos = await Polo.findAll({ attributes: ["id", "name"], order: [["name", "ASC"]] });
  return { tutors: tutors.map(t => ({ id: t.id, name: t.name })), polos: polos.map(p => ({ id: p.id, name: p.name })) };
};

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// The manager's panel, per tutor, in a period: the students in the tutor's care, the students actually contacted (a message of the
// tutoring sent to them), the onboarding finished over the onboarding started in the period, the real time to the first contact (the
// first message of the tutoring after the enrollment, not the "Iniciar" click) and what is overdue now.
export const tutorPanel = async (from: Date, to: Date) => {
  const { students } = await listStudents({});
  const q = async (sql: string, replacements: any) => (await sequelize.query(portable(sql), { replacements, type: QueryTypes.SELECT })) as any[];
  const contacted = await q(`SELECT l.onboardingTutorId AS tutorId, COUNT(DISTINCT l.id) AS n FROM Leads l JOIN Tickets t ON t.contactId = l.contactId
    JOIN Messages m ON m.ticketId = t.id WHERE l.onboardingTutorId IS NOT NULL AND t.segment IN (:segments) AND m.fromMe = true AND m.body NOT LIKE :mark
    AND m.createdAt BETWEEN :from AND :to GROUP BY l.onboardingTutorId`, { segments: TUTORIA_SEGMENTS, mark: `${MARK}%`, from, to });
  const enrolled = await q(`SELECT l.id, l.onboardingTutorId AS tutorId, l.enrolledAt, l.onboardingDoneAt,
      (SELECT MIN(m.createdAt) FROM Tickets t JOIN Messages m ON m.ticketId = t.id WHERE t.contactId = l.contactId AND t.segment IN (:segments)
        AND m.fromMe = true AND m.body NOT LIKE :mark AND m.createdAt >= l.enrolledAt) AS firstOut
    FROM Leads l WHERE l.enrolledAt BETWEEN :from AND :to AND l.lostAt IS NULL`, { segments: TUTORIA_SEGMENTS, mark: `${MARK}%`, from, to });
  const names = new Map((await tutorsAndPolos()).tutors.map(t => [t.id, t.name]));
  const rows = new Map<number | null, any>();
  const row = (id: number | null, name: string) => {
    if (!rows.has(id)) rows.set(id, { tutorId: id, name, students: 0, contacted: 0, enrolled: 0, done: 0, firstContactHours: [] as number[], noContactYet: 0, late: 0, idle: 0, calls: 0, unread: 0 });
    return rows.get(id);
  };
  students.forEach(s => {
    const r = row(s.tutorId, s.tutorName || "Sem tutor");
    r.students++;
    if (s.late) r.late++;
    if (s.idle) r.idle++;
    if (s.callPending) r.calls++;
    if (s.unread > 0) r.unread++;
  });
  contacted.forEach(c => { const r = rows.get(Number(c.tutorId)); if (r) r.contacted = Number(c.n); });
  enrolled.forEach(e => {
    const id = e.tutorId ? Number(e.tutorId) : null;
    const r = rows.get(id) || row(id, id ? names.get(id) || "Tutor" : "Sem tutor");
    r.enrolled++;
    if (e.onboardingDoneAt) r.done++;
    if (e.firstOut) r.firstContactHours.push((+new Date(e.firstOut) - +new Date(e.enrolledAt)) / H);
    else r.noContactYet++;
  });
  const tutors = [...rows.values()].map(r => ({
    ...r,
    doneRate: r.enrolled ? Math.round((r.done / r.enrolled) * 100) : null,
    firstContactMedianHours: (() => { const m = median(r.firstContactHours); return m === null ? null : Math.round(m * 10) / 10; })(),
    firstContactHours: undefined
  })).sort((a, b) => (a.tutorId === null ? 1 : b.tutorId === null ? -1 : String(a.name).localeCompare(String(b.name))));
  return { from, to, tutors };
};
