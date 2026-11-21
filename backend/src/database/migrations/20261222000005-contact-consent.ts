import { QueryInterface, DataTypes } from "sequelize";

// the consent of each contact to receive messages (registered, not required): when and how it was given (form, the person wrote first,
// an imported list marked as consented, by hand). Filled for who already wrote to the system and for the leads of the forms.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Contacts", "consentAt", { type: DataTypes.DATE, allowNull: true });
    await queryInterface.addColumn("Contacts", "consentSource", { type: DataTypes.STRING(20), allowNull: true });
    await queryInterface.sequelize.query(`
      UPDATE "Contacts" c SET "consentAt" = f.first, "consentSource" = 'inbound'
        FROM (SELECT t."contactId" AS id, MIN(m."createdAt") AS first FROM "Messages" m JOIN "Tickets" t ON t.id = m."ticketId" WHERE m."fromMe" = false GROUP BY t."contactId") f
       WHERE c.id = f.id AND c."consentAt" IS NULL`);
    await queryInterface.sequelize.query(`
      UPDATE "Contacts" c SET "consentAt" = l."consentAt", "consentSource" = 'form'
        FROM "Leads" l WHERE l."contactId" = c.id AND l."consentAt" IS NOT NULL AND c."consentAt" IS NULL`);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Contacts", "consentSource");
    await queryInterface.removeColumn("Contacts", "consentAt");
  }
};
