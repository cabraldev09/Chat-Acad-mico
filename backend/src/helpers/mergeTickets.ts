// Joins conversations of the same person on the same number into one: the kept one gets everything that belongs to the others, which
// are then removed. Plain SQL over a runner (inside the caller's transaction), so the migration that cleaned the old duplicates and the
// service that joins two contacts of the same person do exactly the same thing.

export type Run = (sql: string, replacements: Record<string, unknown>) => Promise<unknown>;

// rows that simply move: messages, history, tasks, schedules, deliveries, protocols, flows, and the records of the AI's work
export const MOVED_TABLES = [
  "Messages", "TicketEvents", "LeadTasks", "OutboundDeliveries", "OutboundMessages", "Schedules", "TutoringIssues", "ChatFlowRuns",
  "AgentTurnLogs", "AiLearnings", "AiUsage", "AutomationTraces"
];

export const mergeTicketRows = async (run: Run, keep: number, others: number[]): Promise<void> => {
  const ids = others.filter(id => id && id !== keep);
  if (!ids.length) return;
  const r = { keep, others: ids };
  for (const table of MOVED_TABLES) {
    // eslint-disable-next-line no-await-in-loop
    await run(`UPDATE "${table}" SET "ticketId" = :keep WHERE "ticketId" IN (:others)`, r);
  }
  // one per conversation: what the kept one lacks comes over, the rest goes with the removed ones
  await run(`INSERT INTO "TicketTags" ("ticketId", "tagId", "createdAt", "updatedAt")
    SELECT DISTINCT :keep, "tagId", NOW(), NOW() FROM "TicketTags" WHERE "ticketId" IN (:others) ON CONFLICT DO NOTHING`, r);
  await run(`INSERT INTO "TicketPins" ("userId", "ticketId", "createdAt", "updatedAt")
    SELECT DISTINCT "userId", :keep, NOW(), NOW() FROM "TicketPins" WHERE "ticketId" IN (:others) ON CONFLICT DO NOTHING`, r);
  // the consultant's review of each day: the days the kept one has no review of come over (the newest of that day)
  await run(`UPDATE "ConsultantReviews" SET "ticketId" = :keep WHERE id IN (
      SELECT DISTINCT ON (day) id FROM "ConsultantReviews" o WHERE o."ticketId" IN (:others)
        AND NOT EXISTS (SELECT 1 FROM "ConsultantReviews" k WHERE k."ticketId" = :keep AND k.day = o.day)
      ORDER BY day, "updatedAt" DESC)`, r);
  // the copilot's progress and snapshot (one per conversation): the newest of the others when the kept one has none
  for (const table of ["CopilotProgress", "CopilotSnapshots"]) {
    // eslint-disable-next-line no-await-in-loop
    await run(`UPDATE "${table}" SET "ticketId" = :keep WHERE "ticketId" = (
        SELECT "ticketId" FROM "${table}" WHERE "ticketId" IN (:others) ORDER BY "updatedAt" DESC LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM "${table}" WHERE "ticketId" = :keep)`, r);
  }
  // the snapshots have no link to the conversation: the leftovers are removed by hand (the rest goes with the conversation)
  await run(`DELETE FROM "CopilotSnapshots" WHERE "ticketId" IN (:others)`, r);
  await run(`DELETE FROM "Tickets" WHERE id IN (:others)`, r);
};
