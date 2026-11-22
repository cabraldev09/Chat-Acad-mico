import { QueryInterface } from "sequelize";

// Speed (22/11): the indexes the background routines and the searches were missing, and three duplicated ones that only made every
// write slower. Built CONCURRENTLY (no lock on the busy tables while they are built), so this migration runs outside a transaction.
// (No trigram index for the search: the nightly backup copies only the public schema, without the pg_trgm extension, and a restore
// would stop at such an index.)
const run = (q: QueryInterface, sql: string) => q.sequelize.query(sql);

module.exports = {
  up: async (q: QueryInterface) => {
    // reminders of follow-up tasks (every 30 s): the open tasks not yet reminded, by due time
    await run(q, `CREATE INDEX CONCURRENTLY IF NOT EXISTS lead_tasks_due_unnotified ON "LeadTasks" ("dueAt") WHERE "doneAt" IS NULL AND "notifiedAt" IS NULL`);
    // sends stuck in "sending" (every 15 s) and the nightly trim of this table
    await run(q, `CREATE INDEX CONCURRENTLY IF NOT EXISTS outbound_deliveries_status_updated ON "OutboundDeliveries" (status, "updatedAt")`);
    // the ticks of sent messages still to confirm (every 30 s)
    await run(q, `CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_unconfirmed_ack ON "Messages" ("createdAt") WHERE "fromMe" = true AND ack < 3`);
    // spending of the day of all the AI (budget alerts, costs screen) and the nightly trim
    await run(q, `CREATE INDEX CONCURRENTLY IF NOT EXISTS ai_usage_created_at ON "AiUsage" ("createdAt")`);
    // profile pictures still to check
    await run(q, `CREATE INDEX CONCURRENTLY IF NOT EXISTS contacts_pic_checked_at ON "Contacts" ("picCheckedAt")`);
    // the delivery log of webhooks, trimmed at night
    await run(q, `CREATE INDEX CONCURRENTLY IF NOT EXISTS webhook_deliveries_created_at ON "WebhookDeliveries" ("createdAt")`);
    // duplicates: leads_owner_id, leads_won_at_idx and ticket_events_ticket_created_idx already cover them
    await run(q, `DROP INDEX CONCURRENTLY IF EXISTS leads_owner`);
    await run(q, `DROP INDEX CONCURRENTLY IF EXISTS leads_won_at`);
    await run(q, `DROP INDEX CONCURRENTLY IF EXISTS ticket_events_ticket_id`);
  },
  down: async (q: QueryInterface) => {
    for (const name of ["lead_tasks_due_unnotified", "outbound_deliveries_status_updated", "messages_unconfirmed_ack", "ai_usage_created_at", "contacts_pic_checked_at", "webhook_deliveries_created_at"]) {
      // eslint-disable-next-line no-await-in-loop
      await run(q, `DROP INDEX CONCURRENTLY IF EXISTS ${name}`);
    }
    await run(q, `CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_owner ON "Leads" ("ownerId")`);
    await run(q, `CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_won_at ON "Leads" ("wonAt")`);
    await run(q, `CREATE INDEX CONCURRENTLY IF NOT EXISTS ticket_events_ticket_id ON "TicketEvents" ("ticketId")`);
  }
};
