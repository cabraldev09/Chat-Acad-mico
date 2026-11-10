import { QueryTypes } from "sequelize";

import sequelize from "../../database";
import { portable } from "../../helpers/sqlDialect";
import { touchAnalytics } from "../AnalyticsServices/Realtime";

// An open task of a lead belongs to whoever ANSWERS that lead now (the owner of its open conversation, or the lead's owner while nobody has it),
// not to whoever was picked when the task was created: when the conversation or the lead changes hands, its open tasks move with it.
// A task given on purpose to a third person (not the lead's owner, not the previous one) stays where it was put.
// The conversation is linked to the lead by the CONTACT (tickets do not carry the lead id).
// the tasks the system itself creates for a lead (the robot's handoff, the first days of a new student) always belong to whoever answers the lead
const SYSTEM_TASK = `(k.title LIKE 'Atender lead encaminhado%' OR k.title LIKE 'Ambientar o aluno%')`;

export const syncHandoffTasks = async (contactId?: number, previousUserId?: number | null): Promise<number> => {
  const rows = (await sequelize.query(
    portable(`
    SELECT k.id, k.userId, COALESCE(t.userId, l.ownerId) AS owner
    FROM LeadTasks k JOIN Leads l ON l.id = k.leadId
    LEFT JOIN Tickets t ON t.id = (SELECT t2.id FROM Tickets t2 WHERE t2.contactId = l.contactId AND t2.status <> 'closed' ORDER BY t2.id DESC LIMIT 1)
    WHERE k.doneAt IS NULL AND (k.userId IS NOT NULL OR :contactId IS NOT NULL) AND (:contactId IS NULL OR l.contactId = :contactId)
      AND (${SYSTEM_TASK} OR (:contactId IS NOT NULL AND k.userId IS NULL) OR k.userId = l.ownerId OR k.userId = :previous)`),
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

// A consultant who never connected a WhatsApp cannot work the leads the system gave them: their open tasks (the ones the system created for the lead's owner,
// not the ones someone gave them on purpose) go to whoever answers the lead's conversation, and when nobody does they stay WITHOUT an owner,
// where the management sees them and hands them out (instead of hiding behind a person who cannot act).
export const releaseUnreachableTasks = async (): Promise<{ moved: number; released: number }> => {
  const found = (await sequelize.query(
    portable(`
    SELECT k.id, k.leadId, k.userId, COALESCE(t.userId, CASE WHEN l.ownerId <> k.userId THEN l.ownerId END) AS answerer
    FROM LeadTasks k
    JOIN Leads l ON l.id = k.leadId
    JOIN Users u ON u.id = k.userId AND u.profile <> 'admin' AND (u.role = 'consultor' OR u.role IS NULL OR u.role = '')
    LEFT JOIN Tickets t ON t.id = (SELECT t2.id FROM Tickets t2 WHERE t2.contactId = l.contactId AND t2.status <> 'closed' ORDER BY t2.id DESC LIMIT 1)
    WHERE k.doneAt IS NULL AND (k.userId = l.ownerId OR ${SYSTEM_TASK})
      AND NOT EXISTS (SELECT 1 FROM Whatsapps w WHERE w.channel = 'whatsapp' AND w.ownerId = k.userId)`),
    { type: QueryTypes.SELECT }
  )) as any[];
  let moved = 0;
  let released = 0;
  const touched = new Set<number>();
  for (const r of found) {
    touched.add(Number(r.userId));
    const answerer = r.answerer ? Number(r.answerer) : null;
    // the conversation is still with the same person who cannot act (nobody with a number could take it): the task waits without an owner, where the management sees it
    if (answerer && answerer !== Number(r.userId)) {
      await sequelize.query(`UPDATE "LeadTasks" SET "userId" = :to, "updatedAt" = NOW() WHERE id = :id`, { replacements: { to: answerer, id: r.id } });
      moved += 1;
      touched.add(answerer);
    } else {
      await sequelize.query(`UPDATE "LeadTasks" SET "userId" = NULL, "updatedAt" = NOW() WHERE id = :id`, { replacements: { id: r.id } });
      released += 1;
    }
  }
  touched.forEach(id => touchAnalytics(id));
  return { moved, released };
};
