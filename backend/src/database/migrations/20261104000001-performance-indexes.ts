import { QueryInterface } from "sequelize";

// Every inbox list, "find the conversation of this person on this number", unread counters and the funnel filter by
// these columns, and the tables only had indexes on lastMessageAt and leadId: each request scanned them whole.
// With dozens of people working at once those scans pile up. IF NOT EXISTS keeps the migration safe to repeat.
const INDEXES: string[] = [
  `CREATE INDEX IF NOT EXISTS "tickets_status_last_message_idx" ON "Tickets" ("status", "lastMessageAt" DESC)`,
  `CREATE INDEX IF NOT EXISTS "tickets_whatsapp_contact_idx" ON "Tickets" ("whatsappId", "contactId")`,
  `CREATE INDEX IF NOT EXISTS "tickets_user_status_idx" ON "Tickets" ("userId", "status")`,
  `CREATE INDEX IF NOT EXISTS "tickets_queue_idx" ON "Tickets" ("queueId")`,
  `CREATE INDEX IF NOT EXISTS "tickets_contact_idx" ON "Tickets" ("contactId")`,
  `CREATE INDEX IF NOT EXISTS "messages_ticket_unread_idx" ON "Messages" ("ticketId") WHERE "read" = false AND "fromMe" = false`,
  `CREATE INDEX IF NOT EXISTS "messages_contact_idx" ON "Messages" ("contactId") WHERE "contactId" IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS "leads_won_at_idx" ON "Leads" ("wonAt") WHERE "wonAt" IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS "leads_contact_idx" ON "Leads" ("contactId")`,
  `CREATE INDEX IF NOT EXISTS "ticket_events_ticket_created_idx" ON "TicketEvents" ("ticketId", "createdAt")`
];

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    for (const sql of INDEXES) await queryInterface.sequelize.query(sql);
    // fresh statistics so the planner uses the new indexes right away
    for (const table of ["Tickets", "Messages", "Leads", "TicketEvents"]) {
      await queryInterface.sequelize.query(`ANALYZE "${table}"`);
    }
  },
  down: async (queryInterface: QueryInterface) => {
    for (const name of [
      "tickets_status_last_message_idx", "tickets_whatsapp_contact_idx", "tickets_user_status_idx", "tickets_queue_idx",
      "tickets_contact_idx", "messages_ticket_unread_idx", "messages_contact_idx", "leads_won_at_idx", "leads_contact_idx",
      "ticket_events_ticket_created_idx"
    ]) {
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${name}"`);
    }
  }
};
