import { QueryInterface, DataTypes } from "sequelize";

// The list previews the last message like WhatsApp: a camera for a photo, a microphone for a voice note,
// and "Maria: texto" in groups. Needs the type and the author of that message.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Tickets", "lastMessageType", { type: DataTypes.STRING, allowNull: true });
    await queryInterface.addColumn("Tickets", "lastMessageAuthor", { type: DataTypes.STRING, allowNull: true });
    await queryInterface.sequelize.query(`
      UPDATE "Tickets" t
      SET "lastMessageType" = m."mediaType"
      FROM "Messages" m
      WHERE m."id" = t."lastMessageId"
    `);
    await queryInterface.sequelize.query(`
      UPDATE "Tickets" t
      SET "lastMessageAuthor" = c."name"
      FROM "Messages" m JOIN "Contacts" c ON c."id" = m."contactId"
      WHERE m."id" = t."lastMessageId" AND t."isGroup" = true AND m."fromMe" = false
    `);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Tickets", "lastMessageAuthor");
    await queryInterface.removeColumn("Tickets", "lastMessageType");
  }
};
