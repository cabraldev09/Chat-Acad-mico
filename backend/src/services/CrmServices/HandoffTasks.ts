import { QueryTypes } from "sequelize";

import sequelize from "../../database";
import { portable } from "../../helpers/sqlDialect";

// An open task of a lead belongs to whoever ANSWERS that lead now (the owner of its open conversation, or the lead's owner while nobody has it),
// not to whoever was picked when the task was created: when the conversation or the lead changes hands, its open tasks move with it.
// A task given on purpose to a third person (not the lead's owner, not the previous one) stays where it was put.
// The conversation is linked to the lead by the CONTACT (tickets do not carry the lead id).
export const syncHandoffTasks = async (contactId?: number, previousUserId?: number | null): Promise<number> => {
  const rows = (await sequelize.query(
    portable(`
    SELECT k.id, k.userId, COALESCE(t.userId, l.ownerId) AS owner
    FROM LeadTasks k JOIN Leads l ON l.id = k.leadId
    LEFT JOIN Tickets t ON t.id = (SELECT t2.id FROM Tickets t2 WHERE t2.contactId = l.contactId AND t2.status <> 'closed' ORDER BY t2.id DESC LIMIT 1)
    WHERE k.doneAt IS NULL AND (:contactId IS NULL OR l.contactId = :contactId)
      AND (k.userId IS NULL OR k.userId = l.ownerId OR k.userId = :previous)`),
    { replacements: { contactId: contactId || null, previous: previousUserId || 0 }, type: QueryTypes.SELECT }
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
