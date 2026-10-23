import { QueryTypes } from "sequelize";

import sequelize from "../../database";
import { portable } from "../../helpers/sqlDialect";

// The task "Atender lead encaminhado pelo agente de IA" belongs to whoever ANSWERS the conversation now (the owner of its open ticket, or of the lead while nobody has it),
// not to whoever the robot picked at the moment of the handoff: when the conversation moves, the task moves with it.
// The conversation is linked to the lead by the CONTACT (tickets do not carry the lead id).
export const syncHandoffTasks = async (contactId?: number): Promise<number> => {
  const rows = (await sequelize.query(
    portable(`
    SELECT k.id, k.userId, COALESCE(t.userId, l.ownerId) AS owner
    FROM LeadTasks k JOIN Leads l ON l.id = k.leadId
    LEFT JOIN Tickets t ON t.id = (SELECT t2.id FROM Tickets t2 WHERE t2.contactId = l.contactId AND t2.status <> 'closed' ORDER BY t2.id DESC LIMIT 1)
    WHERE k.doneAt IS NULL AND k.title LIKE 'Atender lead encaminhado%' AND (:contactId IS NULL OR l.contactId = :contactId)`),
    { replacements: { contactId: contactId || null }, type: QueryTypes.SELECT }
  )) as any[];
  let moved = 0;
  for (const r of rows) {
    const owner = r.owner ? Number(r.owner) : null;
    if (owner && owner !== Number(r.userId)) {
      await sequelize.query(`UPDATE "LeadTasks" SET "userId" = :owner, "updatedAt" = NOW() WHERE id = :id`, { replacements: { owner, id: r.id } });
      moved += 1;
    }
  }
  return moved;
};
