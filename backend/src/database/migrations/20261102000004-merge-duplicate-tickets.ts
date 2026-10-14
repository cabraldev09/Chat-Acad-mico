import { QueryInterface } from "sequelize";

// A person must have ONE conversation per connection (and per stage: sales, onboarding...). Older versions opened a new
// ticket every time someone wrote after a closed attendance, so the same person appeared twice: one closed with the
// old messages, one open. Here they are joined: the open one (or else the most recent) stays, receives all the messages
// and events of the others, and the empty shells are removed. Groups are not touched.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.transaction(async transaction => {
      const q = (sql: string) => queryInterface.sequelize.query(sql, { transaction });

      await q(`
        CREATE TEMP TABLE "_ticket_merge" ON COMMIT DROP AS
        SELECT id, keep_id FROM (
          SELECT id,
                 FIRST_VALUE(id) OVER w AS keep_id,
                 ROW_NUMBER() OVER w AS rn
          FROM "Tickets"
          WHERE "isGroup" = false
          WINDOW w AS (
            PARTITION BY "contactId", "whatsappId", COALESCE("segment", 'sales')
            ORDER BY ("status" IN ('open','pending')) DESC, ("isHistorical" = false) DESC,
                     COALESCE("lastMessageAt", "updatedAt") DESC, id DESC
          )
        ) x WHERE rn > 1
      `);
      await q(`UPDATE "Messages" m SET "ticketId" = t.keep_id FROM "_ticket_merge" t WHERE m."ticketId" = t.id`);
      await q(`UPDATE "TicketEvents" e SET "ticketId" = t.keep_id FROM "_ticket_merge" t WHERE e."ticketId" = t.id`);
      await q(`UPDATE "Schedules" s SET "ticketId" = t.keep_id FROM "_ticket_merge" t WHERE s."ticketId" = t.id`);
      // the thread that stays is a live one if any of the joined ones was
      await q(`
        UPDATE "Tickets" k SET "isHistorical" = false
        WHERE k."id" IN (SELECT keep_id FROM "_ticket_merge")
          AND EXISTS (SELECT 1 FROM "_ticket_merge" t JOIN "Tickets" o ON o."id" = t."id" WHERE t.keep_id = k."id" AND o."isHistorical" = false)
      `);
      await q(`DELETE FROM "Tickets" WHERE "id" IN (SELECT id FROM "_ticket_merge")`);

      // the preview and the clock of the kept conversations follow their (now complete) thread
      await q(`
        UPDATE "Tickets" t
        SET "lastMessageAt" = m."createdAt", "lastMessageId" = m."id", "lastMessageFromMe" = m."fromMe",
            "lastMessageAck" = COALESCE(m."ack", 0), "lastMessageType" = m."mediaType",
            "lastMessage" = LEFT(m."body", 1000)
        FROM (
          SELECT DISTINCT ON ("ticketId") "id", "ticketId", "fromMe", "ack", "mediaType", "createdAt", "body"
          FROM "Messages" WHERE "ticketId" IN (SELECT DISTINCT keep_id FROM "_ticket_merge")
          ORDER BY "ticketId", "createdAt" DESC
        ) m
        WHERE m."ticketId" = t."id"
      `);
    });
  },
  down: async () => undefined
};
