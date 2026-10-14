import { QueryInterface, DataTypes } from "sequelize";

// The conversation list is ordered by the time of the LAST MESSAGE, like WhatsApp, not by when the row was touched
// (copying the phone's history stamped every conversation with the import time).
// Also removes the WhatsApp system lines the import used to copy as "(notification_template)", "(gp2)"...:
// they are not messages and were taking the place of the real last message in the list.
const SYSTEM_TYPES =
  "notification_template|gp2|protocol|e2e_notification|call_log|ciphertext|revoked|broadcast_notification|notification|oversized|unknown|template_button_reply|buttons_response|list_response|interactive|payment|order|product|reaction|poll_vote|groups_v4_invite";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const q = (sql: string) => queryInterface.sequelize.query(sql);
    await queryInterface.addColumn("Tickets", "lastMessageAt", { type: DataTypes.DATE(6), allowNull: true });

    // contacts and polls were stored as "(multi_vcard)" / "(poll_creation)": give them a readable label
    await q(`UPDATE "Messages" SET "body" = '👤 Contatos' WHERE "mediaType" = 'chat' AND "body" = '(multi_vcard)'`);
    await q(`UPDATE "Messages" SET "body" = '📊 Enquete' WHERE "mediaType" = 'chat' AND "body" = '(poll_creation)'`);

    // system lines out (a quote pointing at one loses the quote, nothing else)
    const junk = `"mediaType" = 'chat' AND "body" ~ '^\\((${SYSTEM_TYPES})\\)$'`;
    await q(`UPDATE "Messages" SET "quotedMsgId" = NULL WHERE "quotedMsgId" IN (SELECT "id" FROM "Messages" WHERE ${junk})`);
    await q(`DELETE FROM "Messages" WHERE ${junk}`);

    // every ticket takes its last message state from what is really there
    await q(`
      UPDATE "Tickets" t
      SET "lastMessageAt" = m."createdAt",
          "lastMessageId" = m."id",
          "lastMessageFromMe" = m."fromMe",
          "lastMessageAck" = COALESCE(m."ack", 0),
          "lastMessageType" = m."mediaType",
          "lastMessageAuthor" = CASE WHEN t."isGroup" = true AND m."fromMe" = false THEN c."name" ELSE NULL END,
          "lastMessage" = CASE WHEN t."lastMessage" IS NULL OR t."lastMessage" ~ '^\\(.*\\)$' THEN LEFT(m."body", 1000) ELSE t."lastMessage" END
      FROM (
        SELECT DISTINCT ON ("ticketId") "id", "ticketId", "fromMe", "ack", "mediaType", "createdAt", "body", "contactId"
        FROM "Messages"
        ORDER BY "ticketId", "createdAt" DESC
      ) m
      LEFT JOIN "Contacts" c ON c."id" = m."contactId"
      WHERE m."ticketId" = t."id"
    `);
    // conversations that were only system lines: empty preview, placed by when they were created
    await q(`UPDATE "Tickets" SET "lastMessage" = NULL WHERE "lastMessage" ~ '^\\(.*\\)$' AND "lastMessageId" IS NULL`);
    await q(`UPDATE "Tickets" SET "lastMessageAt" = "createdAt" WHERE "lastMessageAt" IS NULL`);
    await q(`CREATE INDEX IF NOT EXISTS "tickets_last_message_at_idx" ON "Tickets" ("lastMessageAt")`);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "tickets_last_message_at_idx"`);
    await queryInterface.removeColumn("Tickets", "lastMessageAt");
  }
};
