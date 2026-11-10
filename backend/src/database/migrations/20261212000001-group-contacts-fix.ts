import { QueryInterface } from "sequelize";

// A WhatsApp group id (120363… with 18 digits or more, or the old number-timestamp form) is never a phone number: contacts saved with one as
// a person become groups, and the conversation of a group says so too (the lists and the chooser of contacts read these two columns).
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`UPDATE "Contacts" SET "isGroup" = true WHERE "isGroup" = false AND ("number" ~ '^120363[0-9]{12,}$' OR "number" ~ '^[0-9]{8,}-[0-9]{8,}$')`);
    await queryInterface.sequelize.query(`UPDATE "Tickets" t SET "isGroup" = true FROM "Contacts" c WHERE c."id" = t."contactId" AND c."isGroup" = true AND t."isGroup" = false`);
  },
  down: async () => undefined
};
