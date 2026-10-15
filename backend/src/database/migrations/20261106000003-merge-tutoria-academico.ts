import { QueryInterface } from "sequelize";

// "Tutor" and "Setor acadêmico" are the same function: the tutor follows the student from the first access to the academic
// life. Users, polo members and the polo queues of the academic sector move to the tutoring ones.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const q = (sql: string) => queryInterface.sequelize.query(sql);
    await q(`UPDATE "Users" SET role = 'tutor' WHERE role = 'academico'`);
    await q(`DELETE FROM "PoloMembers" a WHERE a.role = 'academico' AND EXISTS (SELECT 1 FROM "PoloMembers" b WHERE b."poloId" = a."poloId" AND b."userId" = a."userId" AND b.role = 'tutoria')`);
    await q(`UPDATE "PoloMembers" SET role = 'tutoria' WHERE role = 'academico'`);
    // conversations of the academic queue of a polo go to its tutoring queue, then the empty queue is removed
    await q(`UPDATE "Tickets" t SET "queueId" = tq.id FROM "Queues" aq JOIN "Queues" tq ON tq."poloId" = aq."poloId" AND tq.role = 'tutoria' WHERE t."queueId" = aq.id AND aq.role = 'academico'`);
    await q(`DELETE FROM "UserQueues" WHERE "queueId" IN (SELECT id FROM "Queues" WHERE role = 'academico')`);
    await q(`DELETE FROM "WhatsappQueues" WHERE "queueId" IN (SELECT id FROM "Queues" WHERE role = 'academico')`);
    await q(`DELETE FROM "Queues" WHERE role = 'academico' AND NOT EXISTS (SELECT 1 FROM "Tickets" t WHERE t."queueId" = "Queues".id)`);
    // a conversation of the old support segment is now followed by the tutor
    await q(`UPDATE "Tickets" SET segment = 'onboarding' WHERE segment = 'support'`);
  },
  down: async () => undefined
};
