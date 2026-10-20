import { QueryInterface } from "sequelize";

// Indexes for the lookups the screens and workers run all the time (campaign progress, a lead's tasks and history,
// the agenda, list items) plus the copy of the unique constraint on Contacts.number that an old migration left behind.
const INDEXES: Array<[string, string, string]> = [
  ["campaign_shippings_campaign_status", "CampaignShippings", `"campaignId", "status"`],
  ["lead_tasks_lead", "LeadTasks", `"leadId"`],
  ["lead_tasks_user_open", "LeadTasks", `"userId", "doneAt", "dueAt"`],
  ["lead_activities_lead", "LeadActivities", `"leadId"`],
  ["schedules_status_send", "Schedules", `"status", "sendAt"`],
  ["contact_list_items_list", "ContactListItems", `"contactListId"`]
];

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== "postgres") return;
    for (const [name, table, columns] of INDEXES) {
      await sequelize.query(`CREATE INDEX IF NOT EXISTS "${name}" ON "${table}" (${columns})`);
    }
    // two identical unique constraints on the number: every insert paid for both
    await sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Contacts_number_key')
           AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Contacts_number_key1') THEN
          ALTER TABLE "Contacts" DROP CONSTRAINT "Contacts_number_key1";
        END IF;
      END $$;
    `);
  },
  down: async (queryInterface: QueryInterface) => {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== "postgres") return;
    for (const [name] of INDEXES) await sequelize.query(`DROP INDEX IF EXISTS "${name}"`);
  }
};
