import { QueryInterface } from "sequelize";

// Indexes for the queries that read by period or by owner on the tables that grow every day (messages, activities, surveys, leads).
// Created without locking the table (CONCURRENTLY: writes keep flowing while they build) and only if they are not there yet.
const INDEXES: Array<[string, string]> = [
  ["messages_created_at_idx", `"Messages" ("createdAt")`],
  ["lead_activities_user_created_idx", `"LeadActivities" ("userId", "createdAt")`],
  ["lead_activities_created_idx", `"LeadActivities" ("createdAt")`],
  ["nps_surveys_sent_at_idx", `"NpsSurveys" ("sentAt")`],
  ["leads_polo_id_idx", `"Leads" ("poloId") WHERE "poloId" IS NOT NULL`],
  ["leads_next_follow_up_idx", `"Leads" ("nextFollowUpAt") WHERE "nextFollowUpAt" IS NOT NULL`],
  ["leads_onboarding_enrolled_idx", `"Leads" ("onboardingStatus", "enrolledAt") WHERE "enrolledAt" IS NOT NULL`],
  ["lead_enrollments_enrolled_idx", `"LeadEnrollments" ("enrolledAt")`]
];

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== "postgres") return;
    for (const [name, def] of INDEXES) {
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${name} ON ${def}`);
    }
    // (userId, doneAt) is the start of lead_tasks_user_open (userId, doneAt, dueAt): the second index only costs writes
    await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS lead_tasks_user_id_done_at`);
  },
  down: async (queryInterface: QueryInterface) => {
    if (queryInterface.sequelize.getDialect() !== "postgres") return;
    for (const [name] of INDEXES) {
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS ${name}`);
    }
    await queryInterface.sequelize.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS lead_tasks_user_id_done_at ON "LeadTasks" ("userId", "doneAt")`);
  }
};
