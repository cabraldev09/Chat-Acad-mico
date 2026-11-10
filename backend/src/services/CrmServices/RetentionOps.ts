import { Op, QueryTypes } from "sequelize";

import sequelize from "../../database";
import { getAppTz } from "../../helpers/AppTime";
import { brPhoneVariants } from "../../helpers/PhoneVariants";
import Contact from "../../models/Contact";
import ContactListItem from "../../models/ContactListItem";
import Lead from "../../models/Lead";
import { contactsSearchWhere } from "../ContactServices/ListContactsService";
import { Scope, riskStudents } from "./Retention";

// What the retention area did and how it went: the log of the messages and the numbers of the operation.
const q = async (sql: string, replacements: Record<string, any>): Promise<any[]> =>
  (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT })) as any[];

const num = (v: any): number => Number(v || 0);
const tutorSql = (scope: Scope, col = 'l."onboardingTutorId"'): string => (scope.tutorId ? `AND ${col} = :tutor` : "");

export interface LogFilter {
  from: Date;
  to: Date;
  kind?: string;
  search?: string;
  limit: number;
  offset: number;
}

// each message: what it said, to whom (student, polo, tutor), who sent it and, for the survey, how the student answered
export const retentionLog = async (scope: Scope, f: LogFilter) => {
  const where = `m."createdAt" BETWEEN :from AND :to ${tutorSql(scope)}
    ${["nps", "risk", "remat", "custom"].includes(String(f.kind)) ? "AND m.kind = :kind" : ""}
    ${f.search ? 'AND COALESCE(l.name, m.name, \'\') ILIKE :search' : ""}`;
  const rep = { from: f.from, to: f.to, tutor: scope.tutorId || 0, kind: f.kind, search: `%${String(f.search || "").trim()}%`, limit: f.limit, offset: f.offset };
  const rows = await q(
    `SELECT m.id, m.kind, m.body, m.status, m.error, m."withButtons", m."createdAt", m."leadId", COALESCE(l.name, m.name, 'Sem cadastro') AS lead,
            COALESCE(l.phone, m.number) AS phone, p.name AS polo,
            tu.name AS tutor, su.name AS "sentBy", s.status AS "surveyStatus", s.score, s."answeredAt", s.comment
       FROM "RetentionMessages" m LEFT JOIN "Leads" l ON l.id = m."leadId"
       LEFT JOIN "Polos" p ON p.id = l."poloId" LEFT JOIN "Users" tu ON tu.id = l."onboardingTutorId" LEFT JOIN "Users" su ON su.id = m."userId"
       LEFT JOIN "NpsSurveys" s ON s.id = m."surveyId"
      WHERE ${where} ORDER BY m."createdAt" DESC LIMIT :limit OFFSET :offset`,
    rep
  );
  const [{ total }] = await q(`SELECT COUNT(*) AS total FROM "RetentionMessages" m LEFT JOIN "Leads" l ON l.id = m."leadId" WHERE ${where}`, rep);
  return { total: num(total), rows };
};

export const retentionOperations = async (scope: Scope, from: Date, to: Date) => {
  const rep = { from, to, tutor: scope.tutorId || 0 };
  const tz = getAppTz();
  const base = `FROM "RetentionMessages" m LEFT JOIN "Leads" l ON l.id = m."leadId" WHERE m."createdAt" BETWEEN :from AND :to ${tutorSql(scope)}`;

  const byKind = await q(`SELECT m.kind, m.status, COUNT(*) AS n ${base} GROUP BY m.kind, m.status`, rep);
  const perDay = await q(
    `SELECT to_char(m."createdAt" AT TIME ZONE '${tz}', 'YYYY-MM-DD') AS day, COUNT(*) AS sent ${base} GROUP BY 1 ORDER BY 1`,
    rep
  );
  const answeredPerDay = await q(
    `SELECT to_char(s."answeredAt" AT TIME ZONE '${tz}', 'YYYY-MM-DD') AS day, COUNT(*) AS answered
       FROM "NpsSurveys" s JOIN "Leads" l ON l.id = s."leadId"
      WHERE s.status = 'answered' AND s."answeredAt" BETWEEN :from AND :to ${tutorSql(scope)} GROUP BY 1 ORDER BY 1`,
    rep
  );

  // the survey: how many went, how many came back, how fast, and what happened to the detractors
  const surveys = await q(
    `SELECT s.id, s.status, s.score, s."sentAt", s."answeredAt", s."leadId", l."onboardingTutorId" AS "tutorId", l."poloId" AS "poloId",
            (SELECT MIN(t."doneAt") FROM "LeadTasks" t
              WHERE t."leadId" = s."leadId" AND t.title LIKE 'Falar com o aluno que deu nota%' AND t."doneAt" IS NOT NULL AND t."doneAt" >= s."answeredAt") AS "handledAt"
       FROM "NpsSurveys" s JOIN "Leads" l ON l.id = s."leadId"
      WHERE s."sentAt" BETWEEN :from AND :to AND s.status <> 'expired' ${tutorSql(scope)}`,
    rep
  );
  const answered = surveys.filter(s => s.status === "answered");
  const waited = answered.map(s => (new Date(s.answeredAt).getTime() - new Date(s.sentAt).getTime()) / 60000).filter(m => m >= 0);
  const detractors = answered.filter(s => Number(s.score) <= 6);
  const handled = detractors.filter(s => s.handledAt);
  const handleHours = handled.map(s => (new Date(s.handledAt).getTime() - new Date(s.answeredAt).getTime()) / 3600000).filter(h => h >= 0);
  const avg = (list: number[]): number | null => (list.length ? Math.round((list.reduce((t, n) => t + n, 0) / list.length) * 10) / 10 : null);
  const median = (list: number[]): number | null => {
    if (!list.length) return null;
    const sorted = [...list].sort((a, b) => a - b);
    return Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10;
  };

  const risk = await riskStudents(scope, 1000);
  const messages = (kind: string) => byKind.filter(r => r.kind === kind && r.status === "sent").reduce((t, r) => t + num(r.n), 0);
  const failed = byKind.filter(r => r.status === "failed").reduce((t, r) => t + num(r.n), 0);

  // by tutor and by polo: what each one sent, got back and still owes
  const people = await q(
    `SELECT l."onboardingTutorId" AS id, u.name AS name, COUNT(*) AS sent ${base.replace('WHERE', 'LEFT JOIN "Users" u ON u.id = l."onboardingTutorId" WHERE')} GROUP BY 1, 2 ORDER BY sent DESC LIMIT 50`,
    rep
  );
  const byTutor = people.map(p => {
    const mine = surveys.filter(s => (s.tutorId ?? null) === (p.id ?? null));
    const ans = mine.filter(s => s.status === "answered");
    const det = ans.filter(s => Number(s.score) <= 6);
    return {
      id: p.id,
      name: p.name || "Sem tutor",
      sent: num(p.sent),
      surveys: mine.length,
      answered: ans.length,
      responseRate: mine.length ? Math.round((ans.length / mine.length) * 100) : null,
      detractors: det.length,
      pending: det.filter(s => !s.handledAt).length,
      atRisk: risk.students.filter(s => (s.tutorId ?? null) === (p.id ?? null)).length
    };
  });

  return {
    sent: { total: messages("nps") + messages("risk") + messages("remat") + messages("custom"), nps: messages("nps"), risk: messages("risk"), remat: messages("remat"), custom: messages("custom"), failed },
    survey: {
      sent: surveys.length,
      answered: answered.length,
      responseRate: surveys.length ? Math.round((answered.length / surveys.length) * 100) : null,
      medianAnswerMin: median(waited),
      detractors: detractors.length,
      handled: handled.length,
      pending: detractors.length - handled.length,
      avgHandleHours: avg(handleHours)
    },
    atRisk: risk.total,
    perDay: perDay.map(r => ({ day: r.day, sent: num(r.sent), answered: num(answeredPerDay.find(a => a.day === r.day)?.answered) })),
    answeredOnlyDays: answeredPerDay.filter(a => !perDay.some(r => r.day === a.day)).map(a => ({ day: a.day, sent: 0, answered: num(a.answered) })),
    byTutor
  };
};

// the students a person may choose to write to (the tutor sees only the ones they follow)
export const searchStudents = async (scope: Scope, search: string, limit = 30) => {
  const term = String(search || "").trim();
  const digits = term.replace(/\D/g, "");
  return q(
    `SELECT l.id, l.name, l.phone, p.name AS polo, u.name AS tutor, l."onboardingTutorId" AS "tutorId",
            (SELECT MAX(m."createdAt") FROM "RetentionMessages" m WHERE m."leadId" = l.id) AS "lastSentAt"
       FROM "Leads" l JOIN "LeadStages" s ON s.id = l."stageId"
       LEFT JOIN "Polos" p ON p.id = l."poloId" LEFT JOIN "Users" u ON u.id = l."onboardingTutorId"
      WHERE l."enrolledAt" IS NOT NULL AND l."isHistorical" = false AND s.type <> 'lost'
        ${tutorSql(scope)}
        ${term ? `AND (l.name ILIKE :like ${digits.length >= 4 ? 'OR l.phone LIKE :digits' : ""})` : ""}
      ORDER BY l.name LIMIT :limit`,
    { tutor: scope.tutorId || 0, like: `%${term}%`, digits: `%${digits}%`, limit }
  );
};

// ------------------------------------------------------------------ who can be chosen to receive a message
export interface AudienceItem {
  key: string;
  kind: "lead" | "contact" | "number";
  leadId?: number;
  contactId?: number;
  number?: string;
  name: string;
  sub: string;
  // enrolled (a student) or not yet
  enrolled?: boolean;
}

export interface AudienceQuery {
  source: "students" | "crm" | "list" | "contacts";
  search?: string;
  stageId?: number;
  courseId?: number;
  poloId?: number;
  leadSource?: string;
  tagId?: number;
  enrolled?: "yes" | "no" | "";
  listId?: number;
  limit: number;
}

const leadItem = (r: any): AudienceItem => ({
  key: `l${r.id}`,
  kind: "lead",
  leadId: Number(r.id),
  name: r.name,
  number: r.phone || undefined,
  sub: [r.enrolled === false ? "ainda não matriculado" : null, r.stage, r.polo, r.tutor ? `tutor ${r.tutor}` : null].filter(Boolean).join(" · "),
  enrolled: r.enrolled !== false
});

// leads that have one of these phones (a phone is the same with or without the ninth digit)
const leadsByPhones = async (numbers: string[]): Promise<Map<string, any>> => {
  const found = new Map<string, any>();
  const variants = [...new Set(numbers.flatMap(n => brPhoneVariants(n)))];
  for (let i = 0; i < variants.length; i += 800) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await Lead.findAll({ where: { phone: { [Op.in]: variants.slice(i, i + 800) }, isHistorical: false }, attributes: ["id", "name", "phone", "enrolledAt"], raw: true });
    rows.forEach((r: any) => brPhoneVariants(r.phone).forEach(v => { if (!found.has(v)) found.set(v, r); }));
  }
  return found;
};

export const retentionAudience = async (scope: Scope, p: AudienceQuery): Promise<{ items: AudienceItem[]; total: number; unmatched?: number }> => {
  const limit = Math.min(500, Math.max(1, p.limit || 50));
  const term = String(p.search || "").trim();
  if (p.source === "students") {
    const rows = await searchStudents(scope, term, limit);
    return { items: rows.map(leadItem), total: rows.length };
  }
  if (p.source === "crm") {
    const rows = await q(
      `SELECT l.id, l.name, l.phone, (l."enrolledAt" IS NOT NULL) AS enrolled, st.name AS stage, p.name AS polo, u.name AS tutor, COUNT(*) OVER() AS total
         FROM "Leads" l JOIN "LeadStages" st ON st.id = l."stageId"
         LEFT JOIN "Polos" p ON p.id = l."poloId" LEFT JOIN "Users" u ON u.id = l."onboardingTutorId"
        WHERE l."isHistorical" = false AND l.phone IS NOT NULL AND st.type <> 'lost'
          ${scope.tutorId ? 'AND l."onboardingTutorId" = :tutor AND l."enrolledAt" IS NOT NULL' : ""}
          ${p.stageId ? 'AND l."stageId" = :stageId' : ""}
          ${p.courseId ? 'AND l."courseId" = :courseId' : ""}
          ${p.poloId ? 'AND l."poloId" = :poloId' : ""}
          ${p.leadSource ? "AND l.source = :leadSource" : ""}
          ${p.tagId ? 'AND EXISTS (SELECT 1 FROM "LeadTags" lt WHERE lt."leadId" = l.id AND lt."tagId" = :tagId)' : ""}
          ${p.enrolled === "yes" ? 'AND l."enrolledAt" IS NOT NULL' : p.enrolled === "no" ? 'AND l."enrolledAt" IS NULL' : ""}
          ${term ? "AND l.name ILIKE :like" : ""}
        ORDER BY l.name LIMIT :limit`,
      { tutor: scope.tutorId || 0, stageId: p.stageId, courseId: p.courseId, poloId: p.poloId, leadSource: p.leadSource, tagId: p.tagId, like: `%${term}%`, limit }
    );
    return { items: rows.map(leadItem), total: rows.length ? num(rows[0].total) : 0 };
  }
  if (scope.tutorId) return { items: [], total: 0 };
  if (p.source === "list") {
    const all = await ContactListItem.findAll({ where: { contactListId: p.listId || 0 }, order: [["id", "ASC"]], limit: 5000 });
    const byPhone = await leadsByPhones(all.map(i => i.number));
    const seen = new Set<string>();
    const items: AudienceItem[] = [];
    all.forEach(i => {
      const lead = brPhoneVariants(i.number).map(v => byPhone.get(v)).find(Boolean);
      const key = lead ? `l${lead.id}` : `n${i.number}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push(lead ? { key, kind: "lead", leadId: Number(lead.id), name: lead.name, number: lead.phone, sub: "no CRM", enrolled: !!lead.enrolledAt } : { key, kind: "number", number: i.number, name: i.name || i.number, sub: "só na lista" });
    });
    return { items: items.slice(0, limit), total: items.length, unmatched: items.filter(i => i.kind === "number").length };
  }
  // contacts of the system (people, not groups; friends and the team are left out)
  const contacts = await Contact.findAll({
    where: { [Op.and]: [contactsSearchWhere(term), { isGroup: false, isStaff: false, isPersonal: false, kind: { [Op.in]: ["person", "business"] } }] } as any,
    order: [["name", "ASC"]],
    limit,
    attributes: ["id", "name", "number"]
  });
  const leads = contacts.length ? await Lead.findAll({ where: { contactId: { [Op.in]: contacts.map(c => c.id) }, isHistorical: false }, attributes: ["id", "contactId", "enrolledAt"], raw: true }) : [];
  const leadOf = new Map<number, number>((leads as any[]).map(l => [Number(l.contactId), Number(l.id)]));
  const enrolledOf = new Map<number, boolean>((leads as any[]).map(l => [Number(l.id), !!l.enrolledAt]));
  const items: AudienceItem[] = contacts.map(c => {
    const leadId = leadOf.get(c.id);
    return leadId
      ? { key: `l${leadId}`, kind: "lead" as const, leadId, name: c.name || c.number, number: c.number, sub: "no CRM", enrolled: enrolledOf.get(leadId) }
      : { key: `c${c.id}`, kind: "contact" as const, contactId: c.id, name: c.name || c.number, number: c.number, sub: "contato do sistema" };
  });
  return { items, total: items.length };
};
