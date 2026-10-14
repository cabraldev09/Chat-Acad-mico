import { QueryInterface } from "sequelize";

// Tickets whose "last message" was one of the system lines removed by the previous migration still pointed at it:
// they keep an empty preview instead of "(notification_template)".
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const q = (sql: string) => queryInterface.sequelize.query(sql);
    await q(`
      UPDATE "Tickets"
      SET "lastMessageId" = NULL, "lastMessageFromMe" = false, "lastMessageAck" = 0, "lastMessageType" = NULL, "lastMessageAuthor" = NULL
      WHERE "lastMessageId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Messages" m WHERE m."id" = "Tickets"."lastMessageId")
    `);
    await q(`UPDATE "Tickets" SET "lastMessage" = NULL WHERE "lastMessageId" IS NULL AND "lastMessage" ~ '^\\(.*\\)$'`);
  },
  down: async () => undefined
};
