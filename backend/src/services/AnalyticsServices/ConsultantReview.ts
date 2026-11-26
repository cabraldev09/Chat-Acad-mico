import { Op } from "sequelize";

import AiAgent from "../../models/AiAgent";
import ConsultantReview from "../../models/ConsultantReview";
import { getSetting } from "../../helpers/AppSettings";
import { dayBounds } from "../../helpers/AppTime";
import { OBJECTION_TYPES } from "../CommercialServices/Rules";
import { logger } from "../../utils/logger";
import { consultantWhere, rows, VALID_TICKET } from "./AnalyticsService";

// Once a day the AI reads the conversations the consultants had that day and writes down, for each one, the objections the lead raised
// (and whether the consultant answered them), the steps of the sales process where the consultant had trouble and the ones skipped.
// What goes to the model: only the text of the last messages (a voice note goes as its transcript, see AiServices/HumanTranscription),
// with CPF, RG, phones, e-mails, CEP, long numbers and the names of the lead and of the consultant replaced by tags. What is kept: only codes and a short note. The daily caps of spending (Budget) apply to it.

export const OBJECTION_LABEL: Record<string, string> = {
  preco: "preço", tempo: "falta de tempo", confianca: "confiança na faculdade", concorrente: "concorrente", familia: "família",
  distancia: "distância do polo", duvida_ead: "dúvidas sobre EAD", outra: "outras"
};

export const MAX_MESSAGES = 40;
export const MIN_MESSAGES = 4;

export { scrub } from "./Scrub";
import { scrub } from "./Scrub";

export interface ReviewAnswer { objections: Array<{ type: string; handled: boolean }>; difficulties: string[]; skipped: string[]; note: string }

// strict: anything outside the known objection types and process steps is dropped; a broken answer is an error (nothing is saved)
export const parseReviewAnswer = (text: string, stepKeys: string[]): ReviewAnswer => {
  let parsed: any;
  const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try { parsed = JSON.parse(raw); } catch { throw new Error("ERR_AI_BAD_ANSWER"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("ERR_AI_BAD_ANSWER");
  const steps = new Set(stepKeys);
  const types = new Set<string>(OBJECTION_TYPES as readonly string[]);
  const seen = new Set<string>();
  const objections = (Array.isArray(parsed.objections) ? parsed.objections : [])
    .filter((o: any) => o && types.has(String(o.type)) && !seen.has(String(o.type)) && seen.add(String(o.type)))
    .slice(0, 8)
    .map((o: any) => ({ type: String(o.type), handled: o.handled === true }));
  const keys = (v: any) => [...new Set((Array.isArray(v) ? v : []).map(String).filter(k => steps.has(k)))].slice(0, 10);
  const note = scrub(typeof parsed.note === "string" ? parsed.note : "").trim().slice(0, 200);
  return { objections, difficulties: keys(parsed.difficulties), skipped: keys(parsed.skipped), note };
};

export const reviewSystem = (steps: Array<{ key: string; label: string }>) => [
  "Você ajuda a gestão comercial de uma faculdade a entender onde cada consultor precisa de treinamento.",
  "Leia a conversa entre um consultor e um interessado em estudar. Dados pessoais foram trocados por marcadores como [NOME] e [TEL].",
  "Mensagens de voz aparecem como [áudio] seguido do texto transcrito; [áudio sem transcrição] é um áudio que não pôde ser lido: não deduza o que foi dito nele.",
  `Tipos de objeção válidos: ${OBJECTION_TYPES.join(", ")}.`,
  `Etapas do processo de vendas (chave: descrição): ${steps.map(s => `${s.key}: ${s.label}`).join("; ")}.`,
  "Responda só com JSON válido, sem markdown, exatamente no formato",
  "{\"objections\":[{\"type\":string,\"handled\":boolean}],\"difficulties\":string[],\"skipped\":string[],\"note\":string}.",
  "objections: cada objeção que o interessado levantou e se o consultor respondeu de forma adequada (handled).",
  "difficulties: chaves das etapas em que o consultor teve dificuldade (respondeu errado, não soube explicar, demorou ou se perdeu).",
  "skipped: chaves das etapas que o consultor pulou antes de avançar para uma etapa posterior.",
  "note: uma frase curta, sem nomes nem dados pessoais, sobre o principal ponto a melhorar. Não invente nada que não esteja na conversa."
].join(" ");

// a voice note (the same rule of AiServices/Media.mediaKindOf; one whose file is still missing counts by its type)
export const isAudioRow = (m: { mediaType?: string | null; mediaUrl?: string | null }): boolean => {
  const file = String(m.mediaUrl || "").toLowerCase();
  if (/\.(pdf|webp)$/.test(file)) return false;
  return m.mediaType === "audio" || m.mediaType === "ptt" || /\.(ogg|opus|mp3|m4a|wav|oga|aac)$/.test(file);
};

// the conversation as the model reads it: a voice note is its transcript, with the same removal of personal data
export const reviewTranscript = (msgs: any[], names: string[]): string =>
  msgs.map(m => {
    const who = m.fromMe ? "Consultor" : "Interessado";
    if (isAudioRow(m)) return `${who}: ${m.transcript ? `[áudio] ${scrub(String(m.transcript).slice(0, 600), names)}` : "[áudio sem transcrição]"}`;
    return `${who}: ${scrub(String(m.body || "").slice(0, 600), names)}`;
  }).join("\n");

// the conversations of the consultants with a human message on that day, not reviewed yet (most messages first)
export const reviewCandidates = async (day: string, limit: number) => {
  const { start, end } = dayBounds(day);
  return rows(`SELECT o.ticketId, MAX(o.userId) AS userId, COUNT(*) AS n FROM OutboundMessages o JOIN Tickets t ON t.id = o.ticketId JOIN Users u ON u.id = o.userId
    WHERE o.status = 'sent' AND o.sentAt BETWEEN :start AND :end AND ${VALID_TICKET} AND ${consultantWhere}
      AND NOT EXISTS (SELECT 1 FROM ConsultantReviews r WHERE r.ticketId = o.ticketId AND r.day = :day)
    GROUP BY o.ticketId ORDER BY n DESC LIMIT :limit`, { start, end, day, limit });
};

export interface ReviewRun { reviewed: number; skipped: number; failed: number; stoppedByBudget: boolean; reason?: string }

// reads one day; stops at the spending cap (what is left is read the next time it runs)
export const reviewDay = async (day: string, steps: Array<{ key: string; label: string }>, opts: { limit?: number } = {}): Promise<ReviewRun> => {
  const run: ReviewRun = { reviewed: 0, skipped: 0, failed: 0, stoppedByBudget: false };
  const agent = await AiAgent.findOne({ where: { provider: "openai", active: true } as any, order: [["id", "ASC"]] });
  if (!agent) return { ...run, reason: "no_openai_agent" };
  const { resolveKey, askOnce } = await import("../AiServices/RunAiAgent");
  const apiKey = await resolveKey(agent);
  if (!apiKey) return { ...run, reason: "no_api_key" };
  const limit = Math.min(500, Math.max(1, opts.limit ?? (Number(await getSetting("consultant_review_max_tickets", "60")) || 60)));
  const stepKeys = steps.map(s => s.key);
  const system = reviewSystem(steps);
  const { end } = dayBounds(day);
  for (const c of await reviewCandidates(day, limit)) {
    const ticketId = Number(c.ticketId);
    // eslint-disable-next-line no-await-in-loop
    // the text messages and the voice notes (with their transcript, when there is one)
    const msgs = (await rows(`SELECT m.body, m.fromMe, m.mediaType, m.mediaUrl, m.transcript FROM Messages m WHERE m.ticketId = :ticketId AND m.isDeleted = false AND m.createdAt <= :end
      AND ((m.body IS NOT NULL AND m.body <> '' AND (m.mediaType IS NULL OR m.mediaType IN ('chat', 'text', 'conversation', 'extendedTextMessage')))
        OR m.mediaType IN ('audio', 'ptt') OR m.transcript IS NOT NULL)
      ORDER BY m.createdAt DESC LIMIT ${MAX_MESSAGES}`, { ticketId, end })).reverse();
    if (msgs.length < MIN_MESSAGES || !msgs.some(m => m.fromMe) || !msgs.some(m => !m.fromMe)) { run.skipped += 1; continue; }
    // eslint-disable-next-line no-await-in-loop
    const [who] = await rows(`SELECT ct.name AS contact, u.name AS consultant, l.id AS leadId, l.name AS lead FROM Tickets t JOIN Contacts ct ON ct.id = t.contactId
      LEFT JOIN Users u ON u.id = :userId LEFT JOIN Leads l ON l.contactId = t.contactId WHERE t.id = :ticketId LIMIT 1`, { ticketId, userId: Number(c.userId) });
    const names = [who?.contact, who?.consultant, who?.lead].filter(Boolean);
    try {
      // eslint-disable-next-line no-await-in-loop
      const answer = await askOnce(agent, apiKey, system, reviewTranscript(msgs, names), 300, { kind: "reading", ticketId });
      const parsed = parseReviewAnswer(answer.text, stepKeys);
      const tokens = Number(answer.usage?.total_tokens || (answer.usage?.input_tokens || 0) + (answer.usage?.output_tokens || 0) || 0);
      // eslint-disable-next-line no-await-in-loop
      await ConsultantReview.create({ userId: Number(c.userId), ticketId, leadId: who?.leadId ? Number(who.leadId) : null, day, ...parsed, model: agent.model, tokens } as any);
      run.reviewed += 1;
    } catch (err) {
      const code = String((err as Error)?.message || "");
      if (/ERR_AI_TOKEN_CAP|ERR_AI_USD_CAP|ERR_AI_BUDGET|ERR_AI_RATE_REQUIRED/.test(code)) { run.stoppedByBudget = true; break; }
      run.failed += 1;
      logger.warn(`Revisão da conversa #${ticketId}: ${code}`);
    }
  }
  return run;
};

// ---------------------------------------------------------------- what to train: only what repeats, and only with enough conversations
export const COACHING_MIN_REVIEWS = 5;
export const COACHING_MIN_HITS = 3;
export const COACHING_MIN_SHARE = 0.3;

export interface CoachingItem { kind: "objection" | "difficulty" | "skipped"; key: string; label: string; hits: number; of: number; text: string }
export interface Coaching { userId: number; name: string; reviewed: number; items: CoachingItem[]; strengths: string[] }

// pure: the reviews of one person -> the training they need (most frequent first)
export const coachingFrom = (reviews: Array<{ objections: any[]; difficulties: string[]; skipped: string[] }>, stepLabel: (k: string) => string): { items: CoachingItem[]; strengths: string[] } => {
  const of = reviews.length;
  if (of < COACHING_MIN_REVIEWS) return { items: [], strengths: [] };
  const objections = new Map<string, { n: number; unhandled: number }>();
  const diff = new Map<string, number>();
  const skip = new Map<string, number>();
  reviews.forEach(r => {
    (r.objections || []).forEach((o: any) => { const cur = objections.get(o.type) || { n: 0, unhandled: 0 }; cur.n += 1; if (!o.handled) cur.unhandled += 1; objections.set(o.type, cur); });
    (r.difficulties || []).forEach(k => diff.set(k, (diff.get(k) || 0) + 1));
    (r.skipped || []).forEach(k => skip.set(k, (skip.get(k) || 0) + 1));
  });
  const items: CoachingItem[] = [];
  const strengths: string[] = [];
  objections.forEach((v, type) => {
    const label = OBJECTION_LABEL[type] || type;
    if (v.unhandled >= COACHING_MIN_HITS && v.unhandled / v.n >= 0.5) items.push({ kind: "objection", key: type, label, hits: v.unhandled, of: v.n, text: `Objeção de ${label} sem resposta adequada em ${v.unhandled} de ${v.n} vezes` });
    else if (v.n >= COACHING_MIN_HITS && v.unhandled === 0) strengths.push(`Responde bem à objeção de ${label} (${v.n} de ${v.n})`);
  });
  diff.forEach((n, k) => { if (n >= COACHING_MIN_HITS && n / of >= COACHING_MIN_SHARE) items.push({ kind: "difficulty", key: k, label: stepLabel(k), hits: n, of, text: `Dificuldade na etapa "${stepLabel(k)}" em ${n} de ${of} conversas` }); });
  skip.forEach((n, k) => { if (n >= COACHING_MIN_HITS && n / of >= COACHING_MIN_SHARE) items.push({ kind: "skipped", key: k, label: stepLabel(k), hits: n, of, text: `Pula a etapa "${stepLabel(k)}" em ${n} de ${of} conversas` }); });
  return { items: items.sort((a, b) => b.hits / b.of - a.hits / a.of), strengths };
};

export const coachingFor = async (users: Array<{ id: number; name: string }>, from: Date, to: Date, stepLabel: (k: string) => string): Promise<Coaching[]> => {
  if (!users.length) return [];
  const reviews = await ConsultantReview.findAll({ where: { userId: users.map(u => u.id), createdAt: { [Op.between]: [from, to] } } as any, attributes: ["userId", "objections", "difficulties", "skipped"] });
  return users.map(u => {
    const mine = reviews.filter(r => r.userId === u.id).map(r => ({ objections: r.objections || [], difficulties: r.difficulties || [], skipped: r.skipped || [] }));
    return { userId: u.id, name: u.name, reviewed: mine.length, ...coachingFrom(mine, stepLabel) };
  }).sort((a, b) => b.items.length - a.items.length || b.reviewed - a.reviewed);
};

// the training needs of the last 14 days, as lines of "Alertas e oportunidades" and of the daily e-mail of pending items
export const COACHING_WINDOW_DAYS = 14;
export const recentCoaching = async (users: Array<{ id: number; name: string }>, stepLabel: (k: string) => string): Promise<Coaching[]> => {
  const to = new Date();
  const from = new Date(to.getTime() - COACHING_WINDOW_DAYS * 86400000);
  return (await coachingFor(users, from, to, stepLabel)).filter(c => c.items.length);
};
export const coachingAlerts = (list: Coaching[]) => list.map(c => ({
  level: (c.items.length >= 2 ? "medium" : "low") as "medium" | "low",
  userId: c.userId,
  name: c.name,
  code: "training_needed",
  text: `precisa de treinamento: ${c.items.slice(0, 2).map(i => i.text.charAt(0).toLowerCase() + i.text.slice(1)).join("; ")} (últimos ${COACHING_WINDOW_DAYS} dias)`,
  link: "/estatisticas"
}));
