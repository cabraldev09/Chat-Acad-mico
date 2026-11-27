import { IMPROVE, NOTE_KEYS, NoteKey, lostReasonFor } from "./Kinds";

// HOW EACH CONSULTANT ATTENDS, from the readings of the conversations copied from their phone (kind "importacao"): the evaluation the
// reading writes with the rest of its answer (Kinds.parseEvaluation), added up per consultant. No model here: only counts of what is kept
// in ConversationReadings.result. The pure part (coachingOf) is tested alone; the query is below it.

export interface ReadRow {
  userId: number;
  leadId: number | null;
  // the reading said the person enrolled, or the lead was enrolled after
  enrolled: boolean;
  situation: string;
  objection: string | null;
  evaluation: any | null;
}

export interface NoteSummary { avg: number | null; n: number }
export interface Rate { pct: number | null; yes: number; n: number }
export interface ImproveItem { code: string; label: string; how: string; n: number; leadIds: number[] }
export interface WhyItem { reason: string; n: number; leadIds: number[]; examples: string[] }
export interface ReadingCoaching {
  userId: number;
  name: string;
  read: number;
  evaluated: number;
  enrolled: number;
  conversion: number | null;
  notes: Record<NoteKey, NoteSummary>;
  sentGrade: Rate;
  sentProposal: Rate;
  followUp: Rate;
  transfers: number;
  showedCompletion: Rate;
  showedSubjects: Rate;
  improve: ImproveItem[];
  whyNot: WhyItem[];
}

const EXAMPLES = 3;
const pctOf = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const rate = (values: Array<boolean | null | undefined>): Rate => {
  const known = values.filter(v => v === true || v === false) as boolean[];
  const yes = known.filter(Boolean).length;
  return { pct: pctOf(yes, known.length), yes, n: known.length };
};
const pushId = (list: number[], id: number | null) => { if (id && list.length < EXAMPLES && !list.includes(id)) list.push(id); };

// the reason a sale did not happen, in the words of the lost reasons of the CRM (the same grouping as Recuperação); still deciding is its own group
export const whyGroupOf = (r: { situation: string; objection: string | null }): string =>
  r.situation === "em_andamento" ? (r.objection ? lostReasonFor(r.objection, "desistiu") : "Ainda em negociação") : lostReasonFor(r.objection, r.situation);

export const coachingOf = (userId: number, name: string, rows: ReadRow[]): ReadingCoaching => {
  const evaluated = rows.filter(r => r.evaluation && typeof r.evaluation === "object");
  const enrolled = rows.filter(r => r.enrolled).length;
  const notes = Object.fromEntries(NOTE_KEYS.map(k => {
    const values = evaluated.map(r => r.evaluation.notes?.[k]).filter(v => typeof v === "number" && Number.isFinite(v)) as number[];
    return [k, { avg: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null, n: values.length }];
  })) as Record<NoteKey, NoteSummary>;
  const transfers = evaluated.filter(r => r.evaluation.transfer === true);
  // the points to improve: how many conversations had each one, and some of their leads (to open and see)
  const improve = new Map<string, ImproveItem>();
  evaluated.forEach(r => (Array.isArray(r.evaluation.improve) ? r.evaluation.improve : []).forEach((code: string) => {
    if (!IMPROVE[code]) return;
    const item = improve.get(code) || { code, label: IMPROVE[code].label, how: IMPROVE[code].how, n: 0, leadIds: [] };
    item.n += 1;
    pushId(item.leadIds, r.leadId);
    improve.set(code, item);
  }));
  // why it did not convert: every lead that did not enroll, grouped by the reason; the sentences of the evaluation as examples
  const why = new Map<string, WhyItem>();
  rows.filter(r => !r.enrolled).forEach(r => {
    const reason = whyGroupOf(r);
    const item = why.get(reason) || { reason, n: 0, leadIds: [], examples: [] };
    item.n += 1;
    pushId(item.leadIds, r.leadId);
    const text = r.evaluation && typeof r.evaluation.whyNot === "string" ? r.evaluation.whyNot.trim() : "";
    if (text && item.examples.length < 2 && !item.examples.includes(text)) item.examples.push(text);
    why.set(reason, item);
  });
  const byCount = <T extends { n: number }>(a: T, b: T) => b.n - a.n;
  return {
    userId,
    name,
    read: rows.length,
    evaluated: evaluated.length,
    enrolled,
    conversion: pctOf(enrolled, rows.length),
    notes,
    sentGrade: rate(evaluated.map(r => r.evaluation.sentGrade)),
    sentProposal: rate(evaluated.map(r => r.evaluation.sentProposal)),
    followUp: rate(evaluated.map(r => r.evaluation.followUp)),
    transfers: transfers.length,
    showedCompletion: rate(transfers.map(r => r.evaluation.showedCompletion)),
    showedSubjects: rate(transfers.map(r => r.evaluation.showedSubjects)),
    improve: [...improve.values()].sort((a, b) => byCount(a, b) || a.code.localeCompare(b.code)).slice(0, 5),
    whyNot: [...why.values()].sort((a, b) => byCount(a, b) || a.reason.localeCompare(b.reason)).slice(0, 5)
  };
};

// one reading as kept in ConversationReadings.result: only the leads (colleagues, friends and short conversations stay out)
export const readRowOf = (userId: number, leadId: number | null, resultText: string | null, leadEnrolled: boolean): ReadRow | null => {
  let r: any;
  try { r = JSON.parse(resultText || "null"); } catch { return null; }
  if (!r || typeof r !== "object" || r.isLead !== true) return null;
  return {
    userId,
    leadId: leadId ? Number(leadId) : null,
    enrolled: leadEnrolled || r.situation === "matriculado",
    situation: String(r.situation || "em_andamento"),
    objection: typeof r.objection === "string" ? r.objection : null,
    evaluation: r.evaluation && typeof r.evaluation === "object" ? r.evaluation : null
  };
};

// the readings of the conversations of these consultants (the owner of the number the copy came from) whose last message is in the period;
// "team" is everyone of the list together (what the management compares each one with)
export const readingCoaching = async (users: Array<{ id: number; name: string }>, from: Date, to: Date): Promise<{ consultants: ReadingCoaching[]; team: ReadingCoaching }> => {
  const byUser = new Map<number, ReadRow[]>();
  if (users.length) {
    const { rows, LEAD_IN_INSTITUTION } = await import("../AnalyticsServices/AnalyticsService");
    const found = await rows(`SELECT r.userId, r.leadId, r.result, CASE WHEN l.enrolledAt IS NULL THEN 0 ELSE 1 END AS enrolled
        FROM ConversationReadings r JOIN Tickets t ON t.id = r.ticketId JOIN Leads l ON l.id = r.leadId
      WHERE r.kind = 'importacao' AND r.status = 'feita' AND r.userId IN (:ids) AND ${LEAD_IN_INSTITUTION}
        AND COALESCE(t.lastMessageAt, r.doneAt) >= :from AND COALESCE(t.lastMessageAt, r.doneAt) <= :to
      ORDER BY r.id DESC LIMIT 20000`, { ids: users.map(u => u.id), from, to });
    // one lead with two conversations (two tickets) counts once, by its latest reading (the newest come first)
    const seen = new Set<string>();
    found.forEach(f => {
      const row = readRowOf(Number(f.userId), f.leadId, f.result, Number(f.enrolled) === 1);
      if (!row || seen.has(`${row.userId}:${row.leadId}`)) return;
      seen.add(`${row.userId}:${row.leadId}`);
      byUser.set(row.userId, [...(byUser.get(row.userId) || []), row]);
    });
  }
  return {
    consultants: users.map(u => coachingOf(u.id, u.name, byUser.get(u.id) || [])),
    team: coachingOf(0, "Equipe", [...byUser.values()].flat())
  };
};

// the points to improve the last reading found in each lead (the small labels of Recuperação), by lead
export const improveLabelsOf = async (leadIds: number[]): Promise<Map<number, string[]>> => {
  const out = new Map<number, string[]>();
  if (!leadIds.length) return out;
  const { rows } = await import("../AnalyticsServices/AnalyticsService");
  const found = await rows(`SELECT r.leadId, r.result FROM ConversationReadings r
    WHERE r.kind = 'importacao' AND r.status = 'feita' AND r.leadId IN (:ids) ORDER BY r.id ASC`, { ids: leadIds });
  found.forEach(f => {
    try {
      const codes = JSON.parse(f.result || "{}")?.evaluation?.improve;
      // the last reading of the lead wins
      if (Array.isArray(codes)) out.set(Number(f.leadId), codes.filter((c: string) => IMPROVE[c]).map((c: string) => IMPROVE[c].label));
    } catch { /* an old or broken result has no labels */ }
  });
  return out;
};
