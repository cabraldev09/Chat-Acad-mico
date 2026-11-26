import { QueryInterface } from "sequelize";
import { mergeTicketRows } from "../../helpers/mergeTickets";

// One conversation per person and per number, like WhatsApp itself. A second live conversation of the same person on the same number
// (the enrollment opened one while the old one was closed, and "Chamar o consultor" brought it back to the commercial side) showed two
// cards of the same person, one of them "Sem mensagens". Here they are joined: the one with the newest message stays (the most messages,
// then the oldest, on a tie); the messages, the history, the tasks, the schedules, the deliveries, the tags, the pins, the flows and the
// protocols of the others move into it; the others are removed. Then a unique index keeps it so for good (live conversations only:
// the copied history, isHistorical, and the groups stay out of the rule). The joining itself is mergeTicketRows, shared with the service.
module.exports = {
  up: async (q: QueryInterface) => {
    const s = q.sequelize;
    await s.transaction(async transaction => {
      const run = (sql: string, replacements: Record<string, unknown> = {}) => s.query(sql, { transaction, replacements });
      const [groups] = (await run(`
        SELECT "contactId", "whatsappId", array_agg(id ORDER BY id) AS ids FROM "Tickets"
        WHERE "isGroup" = false AND "isHistorical" = false GROUP BY "contactId", "whatsappId" HAVING COUNT(*) > 1`)) as any[];
      for (const g of groups) {
        const ids: number[] = (g.ids || []).map(Number);
        // eslint-disable-next-line no-await-in-loop
        const [ranked] = (await run(`
          SELECT t.id, t.status, t."userId", t."queueId", t.segment, t."leadId", t."updatedAt",
            (SELECT MAX(m."createdAt") FROM "Messages" m WHERE m."ticketId" = t.id) AS last_at,
            (SELECT COUNT(*) FROM "Messages" m WHERE m."ticketId" = t.id) AS n
          FROM "Tickets" t WHERE t.id IN (:ids)
          ORDER BY last_at DESC NULLS LAST, n DESC, t.id ASC`, { ids })) as any[];
        const keep = ranked[0];
        const others = ranked.slice(1).map((r: any) => Number(r.id));
        if (!others.length) continue;
        // the state that is current: the open one (with its attendant), else a waiting one, else the one kept
        const live = ranked.find((r: any) => r.status === "open") || ranked.find((r: any) => r.status === "pending") || keep;
        const leadId = ranked.map((r: any) => r.leadId).find((v: any) => v) || null;
        // eslint-disable-next-line no-await-in-loop
        await run(`UPDATE "Tickets" SET status = :status, "userId" = :userId, "queueId" = COALESCE(:queueId, "queueId"), segment = COALESCE(:segment, segment),
            "leadId" = COALESCE("leadId", :leadId), "closedAt" = CASE WHEN :status = 'closed' THEN "closedAt" ELSE NULL END
          WHERE id = :keep`, { keep: keep.id, status: live.status, userId: live.userId || null, queueId: live.queueId || null, segment: live.segment || null, leadId });
        // everything of the others comes into the kept one, and the others are removed
        // eslint-disable-next-line no-await-in-loop
        await mergeTicketRows(run, Number(keep.id), others);
      }
      await run(`CREATE UNIQUE INDEX IF NOT EXISTS tickets_one_live_per_number ON "Tickets" ("contactId", "whatsappId") WHERE "isGroup" = false AND "isHistorical" = false`);
    });
  },
  down: async (q: QueryInterface) => {
    await q.sequelize.query(`DROP INDEX IF EXISTS tickets_one_live_per_number`);
  }
};
