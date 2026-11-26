import { Op, QueryTypes } from "sequelize";

import sequelize from "../../database";
import AppError from "../../errors/AppError";
import { getSetting, setSetting } from "../../helpers/AppSettings";
import { dayBounds, todayInAppTz } from "../../helpers/AppTime";
import { portable } from "../../helpers/sqlDialect";
import ConversationReading from "../../models/ConversationReading";
import { logger } from "../../utils/logger";
import { MAX_MESSAGES, reviewTranscript } from "../AnalyticsServices/ConsultantReview";
import { IMPORT_SYSTEM, OUTCOME_SYSTEM, ReadingKind, maskLongNumbers, parseImportAnswer, parseOutcomeAnswer } from "./Kinds";

// THE QUEUE OF READINGS. Each conversation to be read waits here. Who reads it is a setting:
//  - "sistema": the system's own AI, with the cheapest model of the key it has (300 tokens of answer), within the daily spending caps;
//  - "openbot": an outside worker takes the readings through the API v1 (GET /api/v1/leituras), answers them (POST /api/v1/leituras/:id) and
//    the system's AI reads only what is left waiting for more than N hours. The text leaves masked: no name, phone, CPF, e-mail or number.
// The conversation text is built when the reading is taken; only the codes of the answer are kept (in `result`).
const rows = async (sql: string, replacements: Record<string, any>): Promise<any[]> =>
  (await sequelize.query(portable(sql), { replacements, type: QueryTypes.SELECT })) as any[];

const CLAIM_MINUTES = 30;
const MAX_ATTEMPTS = 3;

export interface ReadingSettings { provider: "sistema" | "openbot"; waitHours: number; maxPerDay: number }
export const readingSettings = async (): Promise<ReadingSettings> => ({
  provider: (await getSetting("readings_provider", "sistema")) === "openbot" ? "openbot" : "sistema",
  waitHours: Math.min(72, Math.max(1, Number(await getSetting("readings_openbot_wait_hours", "6")) || 6)),
  maxPerDay: Math.min(2000, Math.max(0, Number(await getSetting("readings_max_per_day", "300")) || 0))
});
export const saveReadingSettings = async (input: Partial<ReadingSettings>): Promise<ReadingSettings> => {
  if (input.provider !== undefined) await setSetting("readings_provider", input.provider === "openbot" ? "openbot" : "sistema");
  if (input.waitHours !== undefined) await setSetting("readings_openbot_wait_hours", String(Math.min(72, Math.max(1, Math.round(Number(input.waitHours) || 6)))));
  if (input.maxPerDay !== undefined) await setSetting("readings_max_per_day", String(Math.min(2000, Math.max(0, Math.round(Number(input.maxPerDay) || 0)))));
  return readingSettings();
};

// the steps of the sales process (for the daily review of the consultants)
const reviewSteps = async (): Promise<Array<{ key: string; label: string }>> => {
  const { configOf } = await import("../CopilotServices/Settings");
  return (await configOf()).steps.map((s: any) => ({ key: s.key, label: s.label }));
};

export interface ReadingInput { system: string; text: string }

// what the reader receives for one reading: the instructions and the masked conversation (null = nothing worth reading)
export const inputOf = async (reading: ConversationReading): Promise<ReadingInput | null> => {
  const end = reading.kind === "revisao" ? dayBounds(reading.ref).end : new Date();
  const msgs = (await rows(`SELECT m.body, m.fromMe, m.mediaType, m.mediaUrl, m.transcript FROM Messages m WHERE m.ticketId = :ticketId AND m.isDeleted = false AND m.createdAt <= :end
      AND ((m.body IS NOT NULL AND m.body <> '' AND (m.mediaType IS NULL OR m.mediaType IN ('chat', 'text', 'conversation', 'extendedTextMessage')))
        OR m.mediaType IN ('audio', 'ptt') OR m.transcript IS NOT NULL)
      ORDER BY m.createdAt DESC LIMIT ${MAX_MESSAGES}`, { ticketId: reading.ticketId, end })).reverse();
  if (msgs.length < 2 || !msgs.some(m => !m.fromMe)) return null;
  const [who] = await rows(`SELECT ct.name AS contact, u.name AS consultant, l.name AS lead FROM Tickets t JOIN Contacts ct ON ct.id = t.contactId
      LEFT JOIN Users u ON u.id = COALESCE(:userId, t.userId) LEFT JOIN Leads l ON l.contactId = t.contactId WHERE t.id = :ticketId LIMIT 1`, { ticketId: reading.ticketId, userId: reading.userId || null });
  const names = [who?.contact, who?.consultant, who?.lead].filter(Boolean);
  // besides what the review masks (CPF, phones, e-mails, runs of 8 digits, the names), any number of 6 digits or more (an RGM, a protocol)
  const text = maskLongNumbers(reviewTranscript(msgs, names));
  if (reading.kind === "importacao") return { system: IMPORT_SYSTEM, text };
  if (reading.kind === "resultado") return { system: OUTCOME_SYSTEM, text };
  const { reviewSystem } = await import("../AnalyticsServices/ConsultantReview");
  return { system: reviewSystem(await reviewSteps()), text };
};

// the owner of a number hears once, when the copy of their phone is all read, what came out of it (no notice per lead)
const tellOwner = async (userId: number | null): Promise<void> => {
  if (!userId) return;
  const left = await ConversationReading.count({ where: { kind: "importacao", userId, status: { [Op.in]: ["pendente", "reservada"] } } as any });
  if (left) return;
  const since = new Date(Number(await getSetting(`readings_notice_${userId}`, "0")) || 0);
  const done = await ConversationReading.findAll({ where: { kind: "importacao", userId, status: "feita", doneAt: { [Op.gt]: since } } as any, attributes: ["result"] });
  if (!done.length) return;
  await setSetting(`readings_notice_${userId}`, String(Date.now()));
  const count = (a: string) => done.filter(r => { try { return JSON.parse(r.result || "{}").action === a; } catch { return false; } }).length;
  const leads = done.length - count("nao_lead");
  const enrolled = count("matriculado");
  const confirm = count("confirmar");
  const recover = count("recuperar");
  const { notify, managerIdsOfUser } = await import("../NotificationServices/Notify");
  await notify([userId, ...(await managerIdsOfUser(userId))], {
    kind: "reading",
    level: recover ? "warning" : "info",
    title: `Leitura do WhatsApp: ${leads} ${leads === 1 ? "lead" : "leads"}, ${enrolled + confirm} matriculados${confirm ? ` (${confirm} a confirmar)` : ""}, ${recover} para recuperar`,
    body: recover ? "Os que pararam ou desistiram estão em CRM, Recuperação, com o motivo de cada um." : "Os leads estão no funil, cada um com o resumo da conversa.",
    link: recover ? "/crm/recuperacao" : "/crm",
    dedupeKey: `reading:${userId}:${Date.now()}`
  });
};

// the answer of a reading (from the system's AI or from the outside worker): checked, applied, kept as codes
export const completeReading = async (id: number, answerText: string, by: { who: "sistema" | "openbot"; claimKey?: string; model?: string | null; tokens?: number | null }): Promise<any> => {
  const reading = await ConversationReading.findByPk(id);
  if (!reading) throw new AppError("ERR_READING_NOT_FOUND", 404);
  if (reading.status === "feita" || reading.status === "falhou") throw new AppError("ERR_READING_DONE", 409);
  if (by.who === "openbot" && (reading.claimedBy !== by.claimKey || !reading.claimedUntil || reading.claimedUntil < new Date())) throw new AppError("ERR_READING_NOT_CLAIMED", 409);
  let result: any;
  try {
    if (reading.kind === "importacao") {
      const answer = parseImportAnswer(answerText);
      const { applyImport } = await import("./ImportedLeads");
      const done = await applyImport(reading, answer);
      result = { ...answer, action: done.action };
      if (done.leadId && !reading.leadId) reading.set({ leadId: done.leadId });
    } else if (reading.kind === "resultado") {
      const { knownOutcome } = await import("./Outcome");
      result = parseOutcomeAnswer(answerText, await knownOutcome(reading.leadId));
    } else {
      const { parseReviewAnswer } = await import("../AnalyticsServices/ConsultantReview");
      const steps = await reviewSteps();
      result = parseReviewAnswer(answerText, steps.map(s => s.key));
      const ConsultantReview = (await import("../../models/ConsultantReview")).default;
      await ConsultantReview.create({ userId: reading.userId, ticketId: reading.ticketId, leadId: reading.leadId, day: reading.ref, ...result, model: by.model || by.who, tokens: by.tokens || null } as any);
    }
  } catch (err) {
    const code = String((err as Error)?.message || "ERR_AI_BAD_ANSWER").slice(0, 200);
    const attempts = reading.attempts + 1;
    reading.set({ attempts, error: code, status: attempts >= MAX_ATTEMPTS ? "falhou" : "pendente", claimedBy: null, claimedUntil: null } as any);
    await reading.save();
    if (code === "ERR_AI_BAD_ANSWER") throw new AppError("ERR_READING_BAD_ANSWER", 422);
    throw err;
  }
  reading.set({ status: "feita", doneBy: by.who, doneAt: new Date(), result: JSON.stringify(result), model: by.model || null, tokens: by.tokens || null, claimedBy: null, claimedUntil: null, error: null } as any);
  await reading.save();
  if (reading.kind === "importacao") await tellOwner(reading.userId).catch(err => logger.warn(`Aviso da leitura: ${err}`));
  return result;
};

// what an outside worker takes: pending readings (or ones whose reservation expired), only of its polos when the token is of some polos
export const claimReadings = async (claimKey: string, limit: number, polos: number[] | null): Promise<Array<{ id: number; tipo: ReadingKind; instrucoes: string; conversa: string; reservadaAte: Date }>> => {
  const now = new Date();
  const until = new Date(now.getTime() + CLAIM_MINUTES * 60000);
  const where: any = {
    [Op.or]: [{ status: "pendente" }, { status: "reservada", claimedUntil: { [Op.lt]: now } }],
    ...(polos ? { poloId: { [Op.in]: polos.length ? polos : [0] } } : {})
  };
  const list = await ConversationReading.findAll({ where, order: [["createdAt", "ASC"]], limit: Math.min(50, Math.max(1, limit)) });
  const out: Array<{ id: number; tipo: ReadingKind; instrucoes: string; conversa: string; reservadaAte: Date }> = [];
  for (const r of list) {
    // reserved only if nobody took it meanwhile
    // eslint-disable-next-line no-await-in-loop
    const [taken] = await ConversationReading.update({ status: "reservada", claimedBy: claimKey, claimedUntil: until } as any, { where: { id: r.id, updatedAt: r.updatedAt } as any });
    if (!taken) continue;
    // eslint-disable-next-line no-await-in-loop
    const input = await inputOf(r);
    if (!input) {
      // eslint-disable-next-line no-await-in-loop
      await ConversationReading.update({ status: "feita", doneBy: "regra", doneAt: new Date(), result: JSON.stringify({ action: "nada", curta: true }), claimedBy: null, claimedUntil: null } as any, { where: { id: r.id } });
      continue;
    }
    out.push({ id: r.id, tipo: r.kind as ReadingKind, instrucoes: input.system, conversa: input.text, reservadaAte: until });
  }
  return out;
};

export interface LocalRun { read: number; skipped: number; failed: number; stoppedByBudget: boolean; reason?: string }

// The system's own reading: what is pending (with "openbot", only what waited longer than the setting), up to the daily limit, with the
// cheapest model of the key it has; stops at the first spending-cap refusal (the rest waits for the next round)
export const runLocalReadings = async (opts: { limit?: number; only?: ReadingKind } = {}): Promise<LocalRun> => {
  const run: LocalRun = { read: 0, skipped: 0, failed: 0, stoppedByBudget: false };
  const cfg = await readingSettings();
  const today = todayInAppTz();
  const used = (await getSetting("readings_day", "")) === today ? Number(await getSetting("readings_count", "0")) || 0 : 0;
  const left = Math.max(0, Math.min(opts.limit ?? cfg.maxPerDay, cfg.maxPerDay - used));
  if (!left) return { ...run, reason: "daily_limit" };
  const waited = cfg.provider === "openbot" ? new Date(Date.now() - cfg.waitHours * 3600000) : new Date();
  const now = new Date();
  const list = await ConversationReading.findAll({
    where: {
      [Op.or]: [{ status: "pendente" }, { status: "reservada", claimedUntil: { [Op.lt]: now } }],
      createdAt: { [Op.lte]: waited },
      ...(opts.only ? { kind: opts.only } : {})
    } as any,
    order: [["createdAt", "ASC"]],
    limit: left
  });
  if (!list.length) return run;
  const { auditorAccess } = await import("../TutoriaServices/Issues");
  const access = await auditorAccess();
  if (!access) return { ...run, reason: "no_api_key" };
  const { askOnce } = await import("../AiServices/RunAiAgent");
  let spent = 0;
  for (const r of list) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const input = await inputOf(r);
      if (!input) {
        r.set({ status: "feita", doneBy: "regra", doneAt: new Date(), result: JSON.stringify({ action: "nada", curta: true }) } as any);
        // eslint-disable-next-line no-await-in-loop
        await r.save();
        run.skipped += 1;
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const answer = await askOnce(access.agent, access.apiKey, input.system, input.text, 400, { kind: "reading", ticketId: r.ticketId });
      const tokens = Number(answer.usage?.total_tokens || (answer.usage?.input_tokens || 0) + (answer.usage?.output_tokens || 0) || 0);
      spent += 1;
      // eslint-disable-next-line no-await-in-loop
      await completeReading(r.id, answer.text, { who: "sistema", model: access.agent.model, tokens });
      run.read += 1;
    } catch (err) {
      const code = String((err as Error)?.message || "");
      if (/ERR_AI_TOKEN_CAP|ERR_AI_USD_CAP|ERR_AI_BUDGET|ERR_AI_RATE_REQUIRED/.test(code)) { run.stoppedByBudget = true; break; }
      run.failed += 1;
      logger.warn(`Leitura #${r.id} (${r.kind}): ${code}`);
    }
  }
  await setSetting("readings_day", today);
  await setSetting("readings_count", String(used + spent));
  return run;
};

// what the screen of the integrations shows: how many readings each one did, and the tokens the outside worker saved (the average of the
// system's own readings times what the worker read)
export const readingsSummary = async (): Promise<{ pending: number; byWho: Record<string, number>; avgTokens: number; tokensSaved: number }> => {
  const [counts] = await rows(`SELECT ${["sistema", "openbot", "regra"].map(w => `SUM(CASE WHEN doneBy = '${w}' THEN 1 ELSE 0 END) AS ${w}`).join(", ")},
      SUM(CASE WHEN status IN ('pendente', 'reservada') THEN 1 ELSE 0 END) AS pending, AVG(CASE WHEN doneBy = 'sistema' THEN tokens END) AS avgTokens FROM ConversationReadings`, {});
  const avgTokens = Math.round(Number(counts?.avgTokens) || 0);
  const openbot = Number(counts?.openbot) || 0;
  return {
    pending: Number(counts?.pending) || 0,
    byWho: { sistema: Number(counts?.sistema) || 0, openbot, regra: Number(counts?.regra) || 0 },
    avgTokens,
    tokensSaved: avgTokens * openbot
  };
};
