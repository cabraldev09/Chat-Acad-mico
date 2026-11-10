import { QueryInterface } from "sequelize";

// A sticker is stored as an image (a .webp picture) and the list showed it as "Foto". The kind of the last message now says
// "sticker"; this one fixes the conversations whose last message already is a sticker.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`
      UPDATE "Tickets" t SET "lastMessageType" = 'sticker'
      FROM "Messages" m
      WHERE m."id" = t."lastMessageId" AND m."mediaType" = 'image' AND m."mediaUrl" ~* '\\.webp(\\?|$)'
        AND t."lastMessageType" = 'image'
    `);
  },
  down: async () => undefined
};
