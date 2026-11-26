import { QueryTypes } from "sequelize";

import sequelize from "../../database";
import { dayBounds, todayInAppTz } from "../../helpers/AppTime";
import { portable } from "../../helpers/sqlDialect";
import { AnalyticsInstitutionScope } from "./InstitutionScope";
import { AWAITING_REPLY } from "./AnalyticsService";

// What the consultant should do next (always about one person): the lists behind the shortcuts of the personal screen.
const rows = async (sql: string, replacements: Record<string, any>): Promise<any[]> =>
  (await sequelize.query(portable(sql), { replacements, type: QueryTypes.SELECT })) as any[];

export const focusFor = async (userId: number, institution: AnalyticsInstitutionScope | null = null) => {
  const now = new Date();
  const endOfToday = dayBounds(todayInAppTz()).end;
  const scopedLead = "(:institutionId IS NULL OR l.institutionId = :institutionId OR (:includeLegacy AND l.institutionId IS NULL))";
  const scopedTicket = "(:institutionId IS NULL OR t.institutionId = :institutionId OR (:includeLegacy AND t.institutionId IS NULL))";
  const scopeParams = { institutionId: institution?.id ?? null, includeLegacy: !!institution?.isLegacy };
  const [tasks, followUps, conversations] = await Promise.all([
    rows(
      `SELECT k.id, k.title, k.type, k.dueAt, k.leadId, l.name AS leadName FROM LeadTasks k LEFT JOIN Leads l ON l.id = k.leadId
       WHERE k.userId = :userId AND k.doneAt IS NULL AND k.dueAt <= :endOfToday AND ${scopedLead} ORDER BY k.dueAt ASC LIMIT 8`,
      { userId, endOfToday, ...scopeParams }
    ),
    rows(
      `SELECT l.id, l.name, l.nextFollowUpAt FROM Leads l JOIN LeadStages s ON s.id = l.stageId
       WHERE l.ownerId = :userId AND s.type = 'open' AND l.nextFollowUpAt IS NOT NULL AND l.nextFollowUpAt <= :endOfToday AND ${scopedLead} ORDER BY l.nextFollowUpAt ASC LIMIT 8`,
      { userId, endOfToday, ...scopeParams }
    ),
    rows(
      `SELECT t.id, c.name AS contactName, t.lastMessage, t.lastMessageAt FROM Tickets t JOIN Contacts c ON c.id = t.contactId
       WHERE t.userId = :userId AND ${AWAITING_REPLY} AND ${scopedTicket} ORDER BY t.lastMessageAt ASC LIMIT 8`,
      // the same rule of "esperando resposta" of Estatísticas (AWAITING_REPLY reads the university as :inst_id / :inst_legacy)
      { userId, ...scopeParams, inst_id: scopeParams.institutionId, inst_legacy: scopeParams.includeLegacy }
    )
  ]);
  return {
    generatedAt: now.toISOString(),
    tasks: tasks.map(t => ({ id: t.id, title: t.title, type: t.type, dueAt: t.dueAt, overdue: new Date(t.dueAt) < now, leadId: t.leadId, leadName: t.leadName, link: t.leadId ? `/crm?lead=${t.leadId}` : "/crm/tarefas" })),
    followUps: followUps.map(l => ({ leadId: l.id, name: l.name, at: l.nextFollowUpAt, link: `/crm?lead=${l.id}` })),
    conversations: conversations.map(c => ({ ticketId: c.id, name: c.contactName, lastMessage: c.lastMessage, at: c.lastMessageAt, link: `/tickets/${c.id}` }))
  };
};
