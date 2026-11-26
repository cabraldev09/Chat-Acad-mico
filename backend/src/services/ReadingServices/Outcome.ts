import { QueryTypes } from "sequelize";

import sequelize from "../../database";
import { portable } from "../../helpers/sqlDialect";
import ConversationReading from "../../models/ConversationReading";
import { OutcomeAnswer, WORKED, outcomeIdeas } from "./Kinds";

// WHY IT SOLD AND WHY IT WAS LOST: the conversation of each lead that enrolled or was lost in the last days is read once (cheaply) and leaves
// only codes (the reason, the objections, what helped, what was missing). The statistics count the codes; the ideas come from the counts.
const rows = async (sql: string, replacements: Record<string, any>): Promise<any[]> =>
  (await sequelize.query(portable(sql), { replacements, type: QueryTypes.SELECT })) as any[];

const DAYS = Number(process.env.READING_OUTCOME_DAYS || 30);

// the leads that ended (enrolled or lost) in the last days, with their latest private conversation that has a real exchange
export const outcomeCandidates = async (limit = 300): Promise<any[]> =>
  rows(`SELECT l.id AS leadId, l.ownerId AS userId, l.poloId, (SELECT t.id FROM Tickets t WHERE t.contactId = l.contactId AND t.isGroup = false
        AND (SELECT COUNT(*) FROM Messages m WHERE m.ticketId = t.id) >= 4 ORDER BY t.lastMessageAt DESC LIMIT 1) AS ticketId
      FROM Leads l WHERE l.isHistorical = false AND l.contactId IS NOT NULL
        AND ((l.wonAt IS NOT NULL AND l.wonAt > :since) OR (l.lostAt IS NOT NULL AND l.lostAt > :since))
        AND NOT EXISTS (SELECT 1 FROM ConversationReadings r WHERE r.kind = 'resultado' AND r.leadId = l.id)
      ORDER BY COALESCE(l.wonAt, l.lostAt) DESC LIMIT :limit`,
  { since: new Date(Date.now() - DAYS * 864e5), limit });

export const enqueueOutcomes = async (): Promise<number> => {
  let added = 0;
  for (const c of await outcomeCandidates()) {
    if (!c.ticketId) continue;
    // eslint-disable-next-line no-await-in-loop
    const [, created] = await ConversationReading.findOrCreate({
      where: { kind: "resultado", ticketId: Number(c.ticketId), ref: `lead-${c.leadId}` },
      defaults: { kind: "resultado", ticketId: Number(c.ticketId), ref: `lead-${c.leadId}`, leadId: Number(c.leadId), userId: Number(c.userId) || null, poloId: c.poloId ? Number(c.poloId) : null } as any
    });
    if (created) added += 1;
  }
  return added;
};

// the result the CRM knows for the lead of a reading
export const knownOutcome = async (leadId: number | null): Promise<"matriculou" | "perdeu" | "parou" | undefined> => {
  if (!leadId) return undefined;
  const [l] = await rows(`SELECT l.wonAt, l.lostAt, l.lostReason FROM Leads l WHERE l.id = :leadId`, { leadId });
  if (!l) return undefined;
  if (l.wonAt) return "matriculou";
  if (l.lostAt) return l.lostReason === "Sem resposta" ? "parou" : "perdeu";
  return undefined;
};

export interface OutcomeSummary {
  read: number;
  enrolled: number;
  lost: number;
  reasons: Array<{ reason: string; n: number }>;
  objections: Array<{ type: string; won: number; lost: number }>;
  worked: Array<{ key: string; label: string; won: number; lost: number }>;
  missed: Array<{ key: string; label: string; n: number }>;
  ideas: string[];
}

// the counts of the period, for Estatísticas → Comercial (only the leads the person may see: leadIds = null means every one)
export const outcomeSummary = async (from: Date, to: Date, leadIds: number[] | null): Promise<OutcomeSummary> => {
  const list = await ConversationReading.findAll({ where: { kind: "resultado", status: "feita" } as any, attributes: ["leadId", "result", "doneAt"] });
  const allowed = leadIds ? new Set(leadIds) : null;
  const items = list
    .filter(r => r.doneAt && r.doneAt >= from && r.doneAt <= to && (!allowed || (r.leadId && allowed.has(r.leadId))))
    .map(r => { try { return JSON.parse(r.result || "{}") as OutcomeAnswer; } catch { return null; } })
    .filter(Boolean) as OutcomeAnswer[];
  const won = items.filter(i => i.outcome === "matriculou");
  const lost = items.filter(i => i.outcome !== "matriculou");
  const count = <T>(arr: T[], key: (x: T) => string[]) => arr.reduce((m, x) => { key(x).forEach(k => m.set(k, (m.get(k) || 0) + 1)); return m; }, new Map<string, number>());
  const reasons = count(lost, i => (i.reason ? [i.reason] : []));
  const objWon = count(won, i => i.objections);
  const objLost = count(lost, i => i.objections);
  const workWon = count(won, i => i.worked);
  const workLost = count(lost, i => i.worked);
  const missed = count(lost, i => i.missed);
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
  return {
    read: items.length,
    enrolled: won.length,
    lost: lost.length,
    reasons: [...reasons].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n),
    objections: [...new Set([...objWon.keys(), ...objLost.keys()])].map(type => ({ type, won: objWon.get(type) || 0, lost: objLost.get(type) || 0 })).sort((a, b) => b.lost - a.lost),
    worked: Object.keys(WORKED).map(key => ({ key, label: WORKED[key], won: pct(workWon.get(key) || 0, won.length), lost: pct(workLost.get(key) || 0, lost.length) }))
      .filter(w => w.won || w.lost).sort((a, b) => b.won - b.lost - (a.won - a.lost)),
    missed: [...missed].map(([key, n]) => ({ key, label: WORKED[key] || key, n })).sort((a, b) => b.n - a.n).slice(0, 6),
    ideas: outcomeIdeas(items.map(i => ({ outcome: i.outcome, worked: i.worked, missed: i.missed })))
  };
};
