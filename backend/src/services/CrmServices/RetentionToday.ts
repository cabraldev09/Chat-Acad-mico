import { QueryTypes } from "sequelize";

import AppError from "../../errors/AppError";
import sequelize from "../../database";
import Lead from "../../models/Lead";
import RetentionContact from "../../models/RetentionContact";
import { addActivity } from "./LeadCore";
import { Scope, readRetentionConfig, rematriculaList, riskStudents } from "./Retention";

export const OUTCOMES: Record<string, string> = {
  respondeu: "Falei com o aluno",
  sem_resposta: "Tentei e não respondeu",
  agendado: "Combinei de falar depois",
  resolvido: "Resolvido",
  outro: "Outro"
};

export interface TodayItem {
  leadId: number;
  name: string;
  priority: number;
  level: "high" | "medium" | "low";
  reasons: Array<{ kind: "detractor" | "risk" | "rematricula"; text: string }>;
  tutor: string | null;
  tutorId: number | null;
  polo: string | null;
  ticketId: number | null;
  score: number | null;
  comment: string | null;
  days: number | null;
  last: { outcome: string; label: string; note: string | null; at: Date; by: string | null } | null;
}

// The people the team should contact TODAY, most urgent first: unhappy students of the survey (not yet handled), students with no news for days
// and, while the window of the re-enrollment is open, the ones who have not renewed. One line per student, with every reason.
export const todayList = async (scope: Scope = {}): Promise<{ total: number; items: TodayItem[] }> => {
  const items = new Map<number, TodayItem>();
  const touch = (leadId: number, name: string, base: Partial<TodayItem>): TodayItem => {
    const cur = items.get(leadId) || { leadId, name, priority: 0, level: "low", reasons: [], tutor: null, tutorId: null, polo: null, ticketId: null, score: null, comment: null, days: null, last: null };
    Object.assign(cur, Object.fromEntries(Object.entries(base).filter(([, v]) => v !== undefined && v !== null)));
    items.set(leadId, cur);
    return cur;
  };

  // unhappy students: the last answer is 6 or less and nobody contacted them after it
  const detractors = (await sequelize.query(
    `SELECT DISTINCT ON (s."leadId") s."leadId" AS id, l.name, s.score, s.comment, s."answeredAt", l."onboardingTutorId" AS "tutorId", u.name AS tutor, p.name AS polo,
            (SELECT t.id FROM "Tickets" t WHERE t."contactId" = l."contactId" ORDER BY t."updatedAt" DESC LIMIT 1) AS "ticketId"
       FROM "NpsSurveys" s JOIN "Leads" l ON l.id = s."leadId"
       LEFT JOIN "Users" u ON u.id = l."onboardingTutorId" LEFT JOIN "Polos" p ON p.id = l."poloId"
      WHERE s.status = 'answered' AND s.score <= 6 AND s."answeredAt" > now() - interval '60 days' AND l."isHistorical" = false
        AND NOT EXISTS (SELECT 1 FROM "RetentionContacts" c WHERE c."leadId" = s."leadId" AND c."createdAt" >= s."answeredAt")
        AND NOT EXISTS (SELECT 1 FROM "LeadTasks" t WHERE t."leadId" = s."leadId" AND t.title LIKE 'Falar com o aluno que deu nota%' AND t."doneAt" IS NOT NULL AND t."doneAt" >= s."answeredAt")
        ${scope.tutorId ? `AND l."onboardingTutorId" = :tutor` : ""}
      ORDER BY s."leadId", s."answeredAt" DESC`,
    { replacements: { tutor: scope.tutorId || 0 }, type: QueryTypes.SELECT }
  )) as any[];
  for (const d of detractors) {
    const waited = Math.max(0, Math.floor((Date.now() - new Date(d.answeredAt).getTime()) / 86400000));
    const item = touch(d.id, d.name, { tutor: d.tutor, tutorId: d.tutorId, polo: d.polo, ticketId: d.ticketId, score: Number(d.score), comment: d.comment || null });
    item.priority = Math.max(item.priority, 90 + (6 - Number(d.score)) + Math.min(5, waited));
    item.reasons.push({ kind: "detractor", text: `Deu nota ${d.score} na pesquisa${waited > 0 ? ` há ${waited} ${waited === 1 ? "dia" : "dias"}` : " hoje"}` });
  }

  const risk = await riskStudents(scope, 2000);
  for (const s of risk.students) {
    const item = touch(s.id, s.name, { tutor: s.tutor, tutorId: s.tutorId, polo: s.polo, ticketId: s.ticketId, days: s.days });
    item.priority = Math.max(item.priority, (s.level === "high" ? 60 : 45) + Math.min(20, Math.floor(s.days / 5)));
    item.reasons.push({ kind: "risk", text: `${s.days} dias sem notícias${s.messagedAt ? " (já recebeu mensagem)" : ""}` });
  }

  const remat = await rematriculaList(scope, true);
  if (remat.window === "open") {
    const urgent = remat.daysLeft !== null && remat.daysLeft <= 7;
    for (const s of remat.pendingStudents) {
      const item = touch(s.id, s.name, { tutor: s.tutor, tutorId: s.tutorId, polo: s.polo, ticketId: s.ticketId });
      item.priority = Math.max(item.priority, urgent ? 70 : 35);
      item.reasons.push({ kind: "rematricula", text: remat.daysLeft !== null ? `Falta renovar a matrícula (${remat.daysLeft} ${remat.daysLeft === 1 ? "dia" : "dias"} para fechar)` : "Falta renovar a matrícula" });
    }
  }

  // the last contact of each, and the ones put aside for later
  const ids = [...items.keys()];
  const hidden = new Set<number>();
  if (ids.length) {
    const contacts = (await sequelize.query(
      `SELECT DISTINCT ON (c."leadId") c."leadId" AS id, c.outcome, c.note, c."createdAt" AS at, c."snoozeUntil", u.name AS by
         FROM "RetentionContacts" c LEFT JOIN "Users" u ON u.id = c."userId" WHERE c."leadId" IN (:ids) ORDER BY c."leadId", c."createdAt" DESC`,
      { replacements: { ids }, type: QueryTypes.SELECT }
    )) as any[];
    for (const c of contacts) {
      const item = items.get(c.id);
      if (!item) continue;
      item.last = { outcome: c.outcome, label: OUTCOMES[c.outcome] || c.outcome, note: c.note, at: c.at, by: c.by };
      const snoozed = c.snoozeUntil && new Date(c.snoozeUntil).getTime() > Date.now();
      const closedRecently = c.outcome === "resolvido" && Date.now() - new Date(c.at).getTime() < 7 * 86400000;
      if (snoozed || closedRecently) hidden.add(c.id);
    }
  }
  const list = [...items.values()].filter(i => !hidden.has(i.leadId)).sort((a, b) => b.priority - a.priority || (b.days || 0) - (a.days || 0));
  list.forEach(i => { i.level = i.priority >= 85 ? "high" : i.priority >= 55 ? "medium" : "low"; });
  return { total: list.length, items: list.slice(0, 300) };
};

// What the team did about the student (a call, a visit, a message): it is registered, the student leaves the list for the days chosen, and the unhappy
// student of the survey counts as handled.
export const registerContact = async (lead: Lead, userId: number, input: { outcome: string; note?: string | null; snoozeDays?: number | null }): Promise<RetentionContact> => {
  if (!OUTCOMES[input.outcome]) throw new AppError("ERR_INVALID_OUTCOME", 400);
  const cfg = await readRetentionConfig();
  const days = input.outcome === "resolvido" ? 7 : input.snoozeDays !== undefined && input.snoozeDays !== null ? Math.max(0, Math.min(60, Math.round(Number(input.snoozeDays)))) : input.outcome === "sem_resposta" ? 2 : Math.min(7, Math.max(1, Math.round(cfg.riskDays / 6)));
  const row = await RetentionContact.create({
    leadId: lead.id,
    userId,
    outcome: input.outcome,
    note: input.note ? String(input.note).slice(0, 1000) : null,
    snoozeUntil: days > 0 ? new Date(Date.now() + days * 86400000) : null
  } as any);
  await addActivity(lead.id, userId, "system", `Contato de retenção: ${OUTCOMES[input.outcome]}${input.note ? `. ${String(input.note).slice(0, 300)}` : ""}.`);
  return row;
};
