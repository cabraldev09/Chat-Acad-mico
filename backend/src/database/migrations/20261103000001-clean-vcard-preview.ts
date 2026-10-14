import { QueryInterface } from "sequelize";

// The list showed the raw text of a contact card ("BEGIN:VCARD VERSION:3...") as the last message.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`
      UPDATE "Tickets"
      SET "lastMessage" = COALESCE(
        NULLIF('👤 ' || NULLIF(TRIM((regexp_match("lastMessage", '(?:^|\\n)FN[^:\\n]*:([^\\n\\r]+)', 'i'))[1]), ''), '👤 '),
        '👤 Contato'),
        "lastMessageType" = 'vcard'
      WHERE "lastMessage" ~* '^\\s*BEGIN:VCARD'
    `);
    await queryInterface.sequelize.query(`
      UPDATE "Messages" SET "mediaType" = 'vcard' WHERE "mediaType" = 'chat' AND "body" ~* '^\\s*BEGIN:VCARD'
    `);
  },
  down: async () => undefined
};
