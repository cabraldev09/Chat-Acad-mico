import { QueryInterface } from "sequelize";

// Conversations created before the ticks were stored (and the ones copied from the phone's history)
// get the state of their last message, so the list shows the same ✓✓ as WhatsApp.
// The index makes "last message of a ticket" and paging a conversation cheap.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`
      UPDATE "Tickets" t
      SET "lastMessageId" = m."id",
          "lastMessageFromMe" = m."fromMe",
          "lastMessageAck" = COALESCE(m."ack", 0)
      FROM (
        SELECT DISTINCT ON ("ticketId") "id", "ticketId", "fromMe", "ack"
        FROM "Messages"
        ORDER BY "ticketId", "createdAt" DESC
      ) m
      WHERE m."ticketId" = t."id" AND t."lastMessageId" IS NULL
    `);
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS "messages_ticket_created_idx" ON "Messages" ("ticketId", "createdAt")`
    );
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "messages_ticket_created_idx"`);
  }
};
