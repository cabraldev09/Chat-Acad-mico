import { QueryTypes } from "sequelize";

import sequelize from "../../database";
import AppError from "../../errors/AppError";
import { todayInAppTz } from "../../helpers/AppTime";
import { getSetting } from "../../helpers/AppSettings";
import Lead from "../../models/Lead";
import LeadReminderLog from "../../models/LeadReminderLog";
import LeadTask from "../../models/LeadTask";
import { logger } from "../../utils/logger";
import SendToContact from "../ChannelServices/SendToContact";
import { setLabel } from "./Labels";
import { addActivity, resolveLeadTarget } from "./LeadCore";

// Keeping the students: who went quiet (risk of dropping out) and the re-enrollment of the next period.
export const RISK_LABEL = { name: "Risco de evasão", color: "#EA580C" };
export const REMAT_LABEL = { name: "Rematrícula pendente", color: "#0EA5E9" };
export const DEFAULT_RISK_MESSAGE = "Olá, {{nome}}! Faz um tempo que não temos notícias suas. Está tudo bem com os estudos? Se precisar de ajuda, é só falar com a gente. 😊";
export const DEFAULT_REMAT_MESSAGE = "Olá, {{nome}}! Está aberto o período de rematrícula para {{periodo}}. Fale com a tutoria para garantir a sua vaga no próximo semestre.";

const render = (text: string, name: string, extra: Record<string, string> = {}): string =>
  Object.entries({ nome: (name || "").trim().split(/\s+/)[0] || "", ...extra }).reduce((t, [k, v]) => t.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), v), text);

export interface RematConfig {
  term: string;
  startsAt: string;
  endsAt: string;
  auto: boolean;
  message: string;
}

export interface RetentionConfig {
  riskDays: number;
  riskMessage: string;
  rematricula: RematConfig;
}

export const readRetentionConfig = async (): Promise<RetentionConfig> => {
  let remat: Partial<RematConfig> = {};
  try {
    remat = JSON.parse(await getSetting("retention_rematricula", "{}")) || {};
  } catch (e) {
    remat = {};
  }
  const date = (v: any) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "");
  return {
    riskDays: Math.min(365, Math.max(7, Number(await getSetting("retention_risk_days", "30")) || 30)),
    riskMessage: (await getSetting("retention_risk_message", DEFAULT_RISK_MESSAGE)) || DEFAULT_RISK_MESSAGE,
    rematricula: {
      term: /^20\d{2}\/[12]$/.test(String(remat.term || "")) ? String(remat.term) : "",
      startsAt: date(remat.startsAt),
      endsAt: date(remat.endsAt),
      auto: !!remat.auto,
      message: String(remat.message || "").trim() || DEFAULT_REMAT_MESSAGE
    }
  };
};

export interface Scope {
  // a tutor sees only the students they follow; the management sees everyone
  tutorId?: number | null;
}

const addDays = (ymd: string, days: number): string => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// ------------------------------------------------------------------ risk of dropping out
// An enrolled student with no news (no message from them, no onboarding step) for `riskDays` days or more.
export const riskStudents = async (scope: Scope = {}, limit = 200) => {
  const { riskDays } = await readRetentionConfig();
  const rows = (await sequelize.query(
    `SELECT l.id, l.name, l."onboardingTutorId" AS "tutorId", u.name AS tutor, l."poloId" AS "poloId", p.name AS polo,
            (SELECT t.id FROM "Tickets" t WHERE t."contactId" = l."contactId" ORDER BY t."updatedAt" DESC LIMIT 1) AS "ticketId",
            (SELECT MAX(a."createdAt") FROM "LeadActivities" a WHERE a."leadId" = l.id AND a.body LIKE 'Mensagem de retenção enviada%') AS "messagedAt",
            COUNT(*) OVER() AS "total",
            GREATEST(COALESCE(l."lastInboundAt", 'epoch'), COALESCE(l."onboardingDoneAt", 'epoch'), l."enrolledAt") AS last,
            floor(extract(epoch FROM (now() - GREATEST(COALESCE(l."lastInboundAt", 'epoch'), COALESCE(l."onboardingDoneAt", 'epoch'), l."enrolledAt"))) / 86400)::int AS days
       FROM "Leads" l JOIN "LeadStages" s ON s.id = l."stageId"
       LEFT JOIN "Users" u ON u.id = l."onboardingTutorId" LEFT JOIN "Polos" p ON p.id = l."poloId"
      WHERE l."enrolledAt" IS NOT NULL AND l."isHistorical" = false AND s.type <> 'lost' AND COALESCE(l."onboardingStatus", 'none') <> 'none'
        AND GREATEST(COALESCE(l."lastInboundAt", 'epoch'), COALESCE(l."onboardingDoneAt", 'epoch'), l."enrolledAt") < now() - make_interval(days => :days)
        ${scope.tutorId ? `AND l."onboardingTutorId" = :tutor` : ""}
      ORDER BY days DESC LIMIT :limit`,
    { replacements: { days: riskDays, tutor: scope.tutorId || 0, limit }, type: QueryTypes.SELECT }
  )) as Array<{ id: number; name: string; tutorId: number | null; tutor: string | null; poloId: number | null; polo: string | null; ticketId: number | null; messagedAt: Date | null; total: string | number; last: Date; days: number }>;
  return { riskDays, total: rows.length ? Number(rows[0].total) : 0, students: rows.map(({ total, ...r }) => ({ ...r, level: r.days >= riskDays * 2 ? "high" : "attention" })) };
};

// labels the students at risk (and takes it off those who wrote again), one task for the tutor per silence
export const runRiskScan = async (): Promise<number> => {
  const { students } = await riskStudents({}, 100);
  const atRisk = new Set(students.map(s => s.id));
  let marked = 0;
  for (const s of students) {
    // eslint-disable-next-line no-await-in-loop
    const lead = await Lead.findByPk(s.id);
    if (!lead) continue;
    // eslint-disable-next-line no-await-in-loop
    if (await setLabel(lead, RISK_LABEL, true)) {
      marked += 1;
      const tutor = lead.onboardingTutorId || lead.ownerId;
      if (tutor) {
        // eslint-disable-next-line no-await-in-loop
        await LeadTask.create({ leadId: lead.id, userId: tutor, type: "whatsapp", title: `Retenção: aluno sem contato há ${s.days} dias. Perguntar como estão os estudos`, dueAt: new Date(Date.now() + 86400000) } as any);
      }
      // eslint-disable-next-line no-await-in-loop
      await addActivity(lead.id, null, "system", `Risco de evasão: ${s.days} dias sem notícias do aluno.`);
    }
  }
  // the ones who came back: the label goes away
  const labeled = (await sequelize.query(
    `SELECT lt."leadId" AS id FROM "LeadTags" lt JOIN "Tags" t ON t.id = lt."tagId" WHERE t.name = :name LIMIT 300`,
    { replacements: { name: RISK_LABEL.name }, type: QueryTypes.SELECT }
  )) as Array<{ id: number }>;
  for (const l of labeled) {
    if (atRisk.has(l.id)) continue;
    // eslint-disable-next-line no-await-in-loop
    const lead = await Lead.findByPk(l.id);
    // eslint-disable-next-line no-await-in-loop
    if (lead) await setLabel(lead, RISK_LABEL, false);
  }
  return marked;
};

// a message of the team to a student at risk
export const sendRetentionMessage = async (lead: Lead, userId: number): Promise<void> => {
  const { riskMessage } = await readRetentionConfig();
  const { contact, whatsapp } = await resolveLeadTarget(lead, userId, null);
  await SendToContact({ contact, whatsapp, body: render(riskMessage, lead.name), keepOpen: { userId } });
  await addActivity(lead.id, userId, "whatsapp", "Mensagem de retenção enviada ao aluno.");
};

// ------------------------------------------------------------------ re-enrollment
export const rematriculaWindow = (c: RematConfig, today = todayInAppTz()): "off" | "before" | "open" | "closed" =>
  !c.term || !c.startsAt || !c.endsAt ? "off" : today < c.startsAt ? "before" : today > c.endsAt ? "closed" : "open";

export const rematriculaList = async (scope: Scope = {}, full = false) => {
  const { rematricula: c } = await readRetentionConfig();
  const rows = (await sequelize.query(
    `SELECT l.id, l.name, l."reenrolledTerm" AS "doneTerm", l."reenrolledAt" AS "doneAt", u.name AS tutor, p.name AS polo,
            l."onboardingTutorId" AS "tutorId", l."poloId" AS "poloId",
            (SELECT t.id FROM "Tickets" t WHERE t."contactId" = l."contactId" ORDER BY t."updatedAt" DESC LIMIT 1) AS "ticketId"
       FROM "Leads" l JOIN "LeadStages" s ON s.id = l."stageId"
       LEFT JOIN "Users" u ON u.id = l."onboardingTutorId" LEFT JOIN "Polos" p ON p.id = l."poloId"
      WHERE l."enrolledAt" IS NOT NULL AND l."isHistorical" = false AND s.type <> 'lost' AND COALESCE(l."onboardingStatus", 'none') <> 'none'
        ${scope.tutorId ? `AND l."onboardingTutorId" = :tutor` : ""}
      ORDER BY l.name LIMIT 1000`,
    { replacements: { tutor: scope.tutorId || 0 }, type: QueryTypes.SELECT }
  )) as Array<{ id: number; name: string; doneTerm: string | null; doneAt: Date | null; tutor: string | null; polo: string | null; tutorId: number | null; poloId: number | null; ticketId: number | null }>;
  const done = rows.filter(r => c.term && r.doneTerm === c.term);
  const pending = rows.filter(r => !(c.term && r.doneTerm === c.term));
  return {
    config: c,
    window: rematriculaWindow(c),
    daysLeft: c.endsAt ? Math.round((new Date(`${c.endsAt}T12:00:00Z`).getTime() - new Date(`${todayInAppTz()}T12:00:00Z`).getTime()) / 86400000) : null,
    total: rows.length,
    done: done.length,
    pending: pending.length,
    rate: rows.length ? Math.round((done.length / rows.length) * 100) : null,
    // the lists are cut at 300 each; `pending` and `done` above are the real counts
    pendingStudents: (full ? pending : pending.slice(0, 300)).map(r => ({ id: r.id, name: r.name, tutor: r.tutor, tutorId: r.tutorId, polo: r.polo, poloId: r.poloId, ticketId: r.ticketId })),
    doneStudents: (full ? done : done.slice(0, 300)).map(r => ({ id: r.id, name: r.name, tutor: r.tutor, tutorId: r.tutorId, polo: r.polo, poloId: r.poloId, ticketId: r.ticketId, at: r.doneAt }))
  };
};

export const markReenrolled = async (lead: Lead, userId: number, undo = false): Promise<void> => {
  const { rematricula: c } = await readRetentionConfig();
  if (!c.term) throw new AppError("ERR_REMATRICULA_NOT_CONFIGURED", 400);
  if (!lead.enrolledAt) throw new AppError("ERR_LEAD_NOT_ENROLLED", 400);
  if (undo) {
    await lead.update({ reenrolledTerm: null, reenrolledAt: null } as any);
    await addActivity(lead.id, userId, "system", `Rematrícula de ${c.term} desfeita.`);
    if (rematriculaWindow(c) === "open") await setLabel(lead, REMAT_LABEL, true);
    return;
  }
  await lead.update({ reenrolledTerm: c.term, reenrolledAt: new Date() } as any);
  await addActivity(lead.id, userId, "system", `Rematrícula confirmada para ${c.term}.`);
  await setLabel(lead, REMAT_LABEL, false);
};

// While the window is open: the label on who did not re-enroll yet, one task for the tutor, and (if the administration
// wants) a message to the student when it opens, 7 days before it closes and the day before. After it closes the label goes.
export const runRematricula = async (): Promise<number> => {
  const { rematricula: c } = await readRetentionConfig();
  const state = rematriculaWindow(c);
  const labeled = (await sequelize.query(
    `SELECT lt."leadId" AS id FROM "LeadTags" lt JOIN "Tags" t ON t.id = lt."tagId" WHERE t.name = :name LIMIT 500`,
    { replacements: { name: REMAT_LABEL.name }, type: QueryTypes.SELECT }
  )) as Array<{ id: number }>;
  if (state !== "open") {
    for (const l of labeled) {
      // eslint-disable-next-line no-await-in-loop
      const lead = await Lead.findByPk(l.id);
      // eslint-disable-next-line no-await-in-loop
      if (lead) await setLabel(lead, REMAT_LABEL, false);
    }
    return 0;
  }
  const today = todayInAppTz();
  const steps: string[] = [];
  if (today >= c.startsAt) steps.push("start");
  if (today >= addDays(c.endsAt, -7) && addDays(c.endsAt, -7) > c.startsAt) steps.push("d7");
  if (today >= addDays(c.endsAt, -1) && addDays(c.endsAt, -1) > c.startsAt) steps.push("d1");
  const { pendingStudents } = await rematriculaList();
  let sent = 0;
  for (const st of pendingStudents.slice(0, 200)) {
    // eslint-disable-next-line no-await-in-loop
    const lead = await Lead.findByPk(st.id);
    if (!lead) continue;
    // eslint-disable-next-line no-await-in-loop
    if (await setLabel(lead, REMAT_LABEL, true)) {
      const tutor = lead.onboardingTutorId || lead.ownerId;
      if (tutor) {
        // eslint-disable-next-line no-await-in-loop
        await LeadTask.create({ leadId: lead.id, userId: tutor, type: "whatsapp", title: `Rematrícula ${c.term}: confirmar com o aluno até ${c.endsAt.split("-").reverse().join("/")}`, dueAt: new Date(Date.now() + 2 * 86400000) } as any);
      }
    }
    if (!c.auto) continue;
    for (const step of steps) {
      const key = `remat:${c.term}:${step}`;
      // eslint-disable-next-line no-await-in-loop
      if (await LeadReminderLog.findOne({ where: { leadId: lead.id, key } })) continue;
      // eslint-disable-next-line no-await-in-loop
      await LeadReminderLog.create({ leadId: lead.id, key } as any);
      try {
        // eslint-disable-next-line no-await-in-loop
        const { contact, whatsapp } = await resolveLeadTarget(lead, lead.onboardingTutorId || lead.ownerId || 0, null);
        // eslint-disable-next-line no-await-in-loop
        await SendToContact({ contact, whatsapp, body: render(c.message, lead.name, { periodo: c.term }) });
        // eslint-disable-next-line no-await-in-loop
        await addActivity(lead.id, null, "whatsapp", `Lembrete de rematrícula enviado (${step === "start" ? "abertura" : step === "d7" ? "7 dias antes do fim" : "véspera do fim"}).`);
        sent += 1;
      } catch (err) {
        logger.warn(`re-enrollment reminder not sent to lead ${lead.id}: ${(err as Error).message}`);
      }
      // one message per student per run
      break;
    }
  }
  return sent;
};
