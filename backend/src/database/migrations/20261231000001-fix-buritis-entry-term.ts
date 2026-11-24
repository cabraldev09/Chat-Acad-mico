import { QueryInterface, QueryTypes } from "sequelize";

// One data correction asked by the management (24/11/2026): the enrollment of Buritis on 23/11 (lead 2) is of the 2nd semester of 2026,
// but it was saved with the entry term 2027/1. It counted twice: in the number typed for Buritis in 2026.2 (15) and, from the CRM, in
// 2027.1. Now the lead has 2026/2, so the CRM counts it in 2026.2, and the number typed for Buritis there goes to 14: Buritis keeps 15
// (1 from the CRM + 14 typed), the network keeps 456 in 2026.2, and 2027.1 drops it.
// It only changes anything when the data is exactly that one (any other database, the tests included, is left as it is). Not undone.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const db = queryInterface.sequelize;
    if (db.getDialect() !== "postgres") return;
    await db.transaction(async transaction => {
      const lead = await db.query(
        `SELECT id FROM "Leads" WHERE id = 2 AND "poloId" = 1 AND "entryTerm" = '2027/1'
           AND to_char("wonAt" AT TIME ZONE 'America/Porto_Velho', 'YYYY-MM-DD') = '2026-11-23' FOR UPDATE`,
        { type: QueryTypes.SELECT, transaction }
      );
      if (!lead.length) return;
      const row = await db.query(
        `SELECT gp.id FROM "GoalPolos" gp JOIN "Goals" g ON g.id = gp."goalId"
          WHERE gp."goalId" = 1 AND gp."poloId" = 1 AND gp."manualCount" = 15 AND g.kind = 'polo' AND g."entryTerm" = '2026/2' FOR UPDATE OF gp`,
        { type: QueryTypes.SELECT, transaction }
      );
      // both together or neither: changing only the lead would count her twice in 2026.2 (457)
      if (!row.length) return;
      await db.query(`UPDATE "Leads" SET "entryTerm" = '2026/2', "updatedAt" = NOW() WHERE id = 2`, { transaction });
      await db.query(
        `INSERT INTO "LeadActivities" (type, body, "leadId", "userId", "createdAt", "updatedAt")
         VALUES ('system', 'Período de ingresso corrigido de 2027/1 para 2026/2: a matrícula é do 2º semestre de 2026.', 2, NULL, NOW(), NOW())`,
        { transaction }
      );
      await db.query(`UPDATE "GoalPolos" SET "manualCount" = 14, "updatedAt" = NOW() WHERE id = :id`, { replacements: { id: (row[0] as any).id }, transaction });
      // eslint-disable-next-line no-console
      console.log(`fix-buritis-entry-term: lead 2 -> 2026/2; GoalPolos ${(row[0] as any).id} manualCount 15 -> 14`);
    });
  },
  down: async () => undefined
};
