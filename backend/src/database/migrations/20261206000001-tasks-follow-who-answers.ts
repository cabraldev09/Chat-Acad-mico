import { QueryInterface, QueryTypes } from "sequelize";

// Every open task of a lead goes to whoever answers the lead now (the owner of its open conversation, or the lead's owner while nobody has it).
// Tasks stayed with the person picked when they were created. Only tasks that sat with the lead's owner (or with nobody) move:
// what was given to a third person on purpose stays. The conversation is linked to the lead by the contact.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const sq = queryInterface.sequelize;
    const rows = (await sq.query(
      `SELECT k.id, k."userId", COALESCE(t."userId", l."ownerId") AS owner
       FROM "LeadTasks" k JOIN "Leads" l ON l.id = k."leadId"
       LEFT JOIN "Tickets" t ON t.id = (SELECT t2.id FROM "Tickets" t2 WHERE t2."contactId" = l."contactId" AND t2.status <> 'closed' ORDER BY t2.id DESC LIMIT 1)
       WHERE k."doneAt" IS NULL AND (k."userId" IS NULL OR k."userId" = l."ownerId")`,
      { type: QueryTypes.SELECT }
    )) as any[];
    for (const r of rows) {
      const owner = r.owner ? Number(r.owner) : null;
      if (owner && owner !== Number(r.userId)) await sq.query(`UPDATE "LeadTasks" SET "userId" = :owner WHERE id = :id`, { replacements: { owner, id: r.id } });
    }
  },
  down: async () => undefined
};
