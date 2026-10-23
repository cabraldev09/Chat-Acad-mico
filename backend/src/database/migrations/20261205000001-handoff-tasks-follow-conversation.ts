import { QueryInterface, QueryTypes } from "sequelize";

// The open "Atender lead encaminhado pelo agente de IA" tasks move to whoever answers the conversation now (they stayed with the person the robot picked).
// The conversation is linked to the lead by the contact (tickets do not carry the lead id).
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const sq = queryInterface.sequelize;
    const rows = (await sq.query(
      `SELECT k.id, k."userId", COALESCE(t."userId", l."ownerId") AS owner
       FROM "LeadTasks" k JOIN "Leads" l ON l.id = k."leadId"
       LEFT JOIN "Tickets" t ON t.id = (SELECT t2.id FROM "Tickets" t2 WHERE t2."contactId" = l."contactId" AND t2.status <> 'closed' ORDER BY t2.id DESC LIMIT 1)
       WHERE k."doneAt" IS NULL AND k.title LIKE 'Atender lead encaminhado%'`,
      { type: QueryTypes.SELECT }
    )) as any[];
    for (const r of rows) {
      const owner = r.owner ? Number(r.owner) : null;
      if (owner && owner !== Number(r.userId)) await sq.query(`UPDATE "LeadTasks" SET "userId" = :owner WHERE id = :id`, { replacements: { owner, id: r.id } });
    }
  },
  down: async () => undefined
};
