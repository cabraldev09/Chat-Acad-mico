import { Op, QueryTypes } from "sequelize";

import sequelize from "../../database";
import { getSetting } from "../../helpers/AppSettings";
import { getAppTz } from "../../helpers/AppTime";
import Lead from "../../models/Lead";
import LeadTask from "../../models/LeadTask";
import NpsSurvey from "../../models/NpsSurvey";
import { logger } from "../../utils/logger";
import SendToContact from "../ChannelServices/SendToContact";
import { emitEvent } from "../FlowServices/Events";
import { setLabel } from "./Labels";
import { addActivity, resolveLeadTarget } from "./LeadCore";

// Satisfaction survey (NPS) by WhatsApp: "from 0 to 10, how much would you recommend us?". The student answers with the
// number; right after, the next message is taken as the reason. Nine and ten are promoters, seven and eight are neutral, zero to
// six are detractors: a detractor becomes a task for the tutor and the label "Detrator NPS". It starts off: the administration
// turns it on and chooses the moments (right after the onboarding, and 30 and 90 days after the enrollment).
export const DETRACTOR_LABEL = { name: "Detrator NPS", color: "#DC2626" };
export const NPS_KINDS = ["onboarding", "d30", "d90"] as const;
export const DEFAULT_QUESTION = "Olá, {{nome}}! De 0 a 10, o quanto você recomendaria a Cruzeiro do Sul Virtual para um amigo? Responda só com o número.";
const THANKS = "Obrigado pela nota! Se quiser, conte em uma frase o motivo: isso nos ajuda a melhorar.";

// NPS of a list of answered surveys: % of promoters minus % of detractors
const npsOf = (list: NpsSurvey[]): number | null => {
  if (!list.length) return null;
  const p = list.filter(r => categoryOf(Number(r.score)) === "promoter").length;
  const d = list.filter(r => categoryOf(Number(r.score)) === "detractor").length;
  return Math.round(((p - d) / list.length) * 100);
};

export const categoryOf = (score: number): "promoter" | "neutral" | "detractor" => (score >= 9 ? "promoter" : score >= 7 ? "neutral" : "detractor");

export interface NpsConfig {
  enabled: boolean;
  moments: string[];
  question: string;
}

export const readNpsConfig = async (): Promise<NpsConfig> => {
  let moments: string[] = [...NPS_KINDS];
  try {
    const raw = JSON.parse(await getSetting("nps_moments", "null"));
    if (Array.isArray(raw)) moments = raw.filter((m: any) => (NPS_KINDS as readonly string[]).includes(m));
  } catch (e) {
    /* all of them */
  }
  return {
    enabled: (await getSetting("nps_enabled", "false")) === "true",
    moments,
    question: (await getSetting("nps_question", DEFAULT_QUESTION)) || DEFAULT_QUESTION
  };
};

const render = (text: string, name: string): string => text.replace(/\{\{\s*nome\s*\}\}/g, (name || "").trim().split(/\s+/)[0] || "");

// sends the survey to a student now
export const sendSurvey = async (lead: Lead, kind: string, userId: number | null): Promise<NpsSurvey> => {
  const { question } = await readNpsConfig();
  const { contact, whatsapp } = await resolveLeadTarget(lead, userId || lead.onboardingTutorId || lead.ownerId || 0, null);
  await SendToContact({ contact, whatsapp, body: render(question, lead.name) });
  const survey = await NpsSurvey.create({ leadId: lead.id, contactId: contact.id, kind, status: "sent", sentAt: new Date() } as any);
  await addActivity(lead.id, userId, "whatsapp", `Pesquisa de satisfação enviada (${kind === "onboarding" ? "após a ambientação" : kind === "d30" ? "30 dias de matrícula" : kind === "d90" ? "90 dias de matrícula" : "manual"})`);
  return survey;
};

// the moments that came: after the onboarding is done, and 30 and 90 days after the enrollment. One survey per student per
// moment, and never two within 20 days.
export const runNpsSurveys = async (): Promise<number> => {
  const cfg = await readNpsConfig();
  if (!cfg.enabled) return 0;
  const due: Array<{ kind: string; sql: string }> = [
    { kind: "onboarding", sql: `l."onboardingDoneAt" IS NOT NULL AND l."onboardingDoneAt" < now() - interval '1 day'` },
    { kind: "d30", sql: `l."enrolledAt" < now() - interval '30 days'` },
    { kind: "d90", sql: `l."enrolledAt" < now() - interval '90 days'` }
  ].filter(d => cfg.moments.includes(d.kind));
  let sent = 0;
  for (const d of due) {
    // eslint-disable-next-line no-await-in-loop
    const rows: Array<{ id: number }> = (await sequelize.query(
      `SELECT l.id FROM "Leads" l JOIN "LeadStages" s ON s.id = l."stageId"
        WHERE l."enrolledAt" IS NOT NULL AND l."isHistorical" = false AND s.type <> 'lost' AND ${d.sql}
          AND NOT EXISTS (SELECT 1 FROM "NpsSurveys" n WHERE n."leadId" = l.id AND (n.kind = :kind OR n."sentAt" > now() - interval '20 days'))
        ORDER BY l.id LIMIT 30`,
      { replacements: { kind: d.kind }, type: QueryTypes.SELECT }
    )) as any;
    for (const r of rows) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const lead = await Lead.findByPk(r.id);
        // eslint-disable-next-line no-await-in-loop
        if (lead) { await sendSurvey(lead, d.kind, null); sent += 1; }
      } catch (err) {
        logger.warn(`NPS not sent to lead ${r.id}: ${(err as Error).message}`);
        // a lead that cannot be written to does not block the queue forever: it is marked as answered-less
        // eslint-disable-next-line no-await-in-loop
        await NpsSurvey.create({ leadId: r.id, kind: d.kind, status: "expired", sentAt: new Date() } as any);
      }
    }
  }
  return sent;
};

// Called for every message a person sends us. A bare number from 0 to 10 answers the open survey of that person (sent in the
// last five days); the message after it, within a day, is the reason. Anything else is just a conversation.
export const captureNpsAnswer = async (contactId: number, body: string): Promise<void> => {
  const text = String(body || "").trim();
  if (!text) return;
  const bare = text.match(/^(10|[0-9])\s*[.!]?$/);

  if (bare) {
    const survey = await NpsSurvey.findOne({ where: { contactId, status: "sent", sentAt: { [Op.gt]: new Date(Date.now() - 5 * 86400000) } }, order: [["sentAt", "DESC"]] });
    if (!survey) return;
    const score = Number(bare[1]);
    await survey.update({ score, status: "answered", answeredAt: new Date(), awaitingComment: true });
    const lead = await Lead.findByPk(survey.leadId);
    if (!lead) return;
    const category = categoryOf(score);
    await addActivity(lead.id, null, "system", `Nota na pesquisa de satisfação: ${score} (${category === "promoter" ? "promotor" : category === "neutral" ? "neutro" : "detrator"})`);
    try {
      const { contact, whatsapp } = await resolveLeadTarget(lead, lead.onboardingTutorId || lead.ownerId || 0, null);
      await SendToContact({ contact, whatsapp, body: THANKS });
    } catch (err) {
      logger.warn(`NPS thanks not sent: ${(err as Error).message}`);
    }
    if (category === "detractor") {
      await setLabel(lead, DETRACTOR_LABEL, true);
      const owner = lead.onboardingTutorId || lead.ownerId;
      if (owner) {
        await LeadTask.create({ leadId: lead.id, userId: owner, type: "whatsapp", title: `Falar com o aluno que deu nota ${score} na pesquisa de satisfação`, dueAt: new Date(Date.now() + 86400000) } as any);
      }
    } else {
      await setLabel(lead, DETRACTOR_LABEL, false);
    }
    await emitEvent("nps.answered", { leadId: lead.id, contactId, score, category });
    return;
  }

  // the reason, in the next message
  const waiting = await NpsSurvey.findOne({ where: { contactId, awaitingComment: true, answeredAt: { [Op.gt]: new Date(Date.now() - 86400000) } }, order: [["answeredAt", "DESC"]] });
  if (waiting && text.length >= 3) {
    await waiting.update({ comment: text.slice(0, 1000), awaitingComment: false });
    await addActivity(waiting.leadId, null, "system", `Motivo da nota na pesquisa de satisfação: ${text.slice(0, 200)}`);
  }
};

// ------------------------------------------------------------------ the numbers
// every answer of the period, one per line (for the spreadsheet)
export const npsAnswers = async (from: Date, to: Date, tutorId?: number | null) => {
  const where: any = { sentAt: { [Op.between]: [from, to] }, status: "answered" };
  if (tutorId) where.leadId = { [Op.in]: sequelize.literal(`(SELECT id FROM "Leads" WHERE "onboardingTutorId" = ${Number(tutorId)})`) };
  const rows = await NpsSurvey.findAll({ where, order: [["answeredAt", "DESC"]], limit: 5000 });
  const leads = await Lead.findAll({ where: { id: { [Op.in]: [...new Set(rows.map(r => r.leadId))] } }, attributes: ["id", "name"] });
  return rows.map(r => ({ at: r.answeredAt, lead: leads.find(l => l.id === r.leadId)?.name || "—", kind: r.kind, score: r.score, category: categoryOf(Number(r.score)), comment: r.comment || "" }));
};

// `tutorId`: a tutor sees only the surveys of the students they follow
export const npsSummary = async (from: Date, to: Date, tutorId?: number | null) => {
  const where: any = { sentAt: { [Op.between]: [from, to] } };
  if (tutorId) where.leadId = { [Op.in]: sequelize.literal(`(SELECT id FROM "Leads" WHERE "onboardingTutorId" = ${Number(tutorId)})`) };
  const rows = await NpsSurvey.findAll({ where, order: [["sentAt", "DESC"]] });
  const answered = rows.filter(r => r.status === "answered" && r.score !== null);
  const count = (c: string) => answered.filter(r => categoryOf(Number(r.score)) === c).length;
  const promoters = count("promoter");
  const neutrals = count("neutral");
  const detractors = count("detractor");
  const sent = rows.filter(r => r.status !== "expired").length;
  const byKind = (NPS_KINDS as readonly string[]).map(kind => {
    const a = answered.filter(r => r.kind === kind);
    return { kind, answered: a.length, avg: a.length ? Math.round((a.reduce((t, r) => t + Number(r.score), 0) / a.length) * 10) / 10 : null, nps: npsOf(a) };
  });
  // by week (Monday of the week, in the company timezone): the trend of the score
  const tz = getAppTz();
  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  const weekOf = (d: Date): string => {
    const day = dayFmt.format(d);
    const t = new Date(`${day}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
    return t.toISOString().slice(0, 10);
  };
  const weeks = new Map<string, NpsSurvey[]>();
  answered.forEach(r => {
    const w = weekOf(new Date(r.answeredAt || r.sentAt));
    weeks.set(w, [...(weeks.get(w) || []), r]);
  });
  const series = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, list]) => ({ week, answered: list.length, nps: npsOf(list) }));
  const comments = answered.filter(r => r.comment).slice(0, 20);
  const leads = await Lead.findAll({ where: { id: { [Op.in]: [...new Set(comments.map(c => c.leadId))] } }, attributes: ["id", "name"] });
  return {
    sent,
    answered: answered.length,
    responseRate: sent > 0 ? Math.round((answered.length / sent) * 100) : null,
    promoters,
    neutrals,
    detractors,
    // NPS = % of promoters - % of detractors
    nps: npsOf(answered),
    byKind,
    series,
    commentsTotal: answered.filter(r => r.comment).length,
    comments: comments.map(c => ({ id: c.id, lead: leads.find(l => l.id === c.leadId)?.name || "—", leadId: c.leadId, score: c.score, comment: c.comment, at: c.answeredAt }))
  };
};
