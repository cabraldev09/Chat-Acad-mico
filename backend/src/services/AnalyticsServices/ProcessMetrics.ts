import CopilotSnapshot from "../../models/CopilotSnapshot";
import Ticket from "../../models/Ticket";
import { logger } from "../../utils/logger";
import { Period, rows, VALID_TICKET } from "./AnalyticsService";

// How each consultant works the sales process, for the management: conversations, messages, audios and grades, how much of the
// process the conversations went through and where the leads stopped, the leads by stage and the stage moves. Same period rules
// and same "real customers only" filter as the rest of the commercial analytics.

export interface ProcessRow {
  userId: number;
  name: string;
  conversations: number;
  messagesSent: number;
  messagesReceived: number;
  audiosSent: number;
  audiosReceived: number;
  gradesSent: number;
  stageMoves: number;
  processAvg: number | null; // % of the required steps done, averaged over the conversations looked at
  processSamples: number;
  stoppedAt: Array<{ step: string; n: number }>; // the step the conversations are waiting on, most common first
  replyMedianMin: number | null; // typical wait of the lead for the consultant's answer (working minutes, median)
  replyWithinSlaPct: number | null; // share answered within the target (Configurações → response_sla_minutes)
  byStage: Array<{ stage: string; color: string | null; n: number }>; // the consultant's open leads by funnel column
}

// the copilot's picture of a conversation, kept for the reports (the step labels come from the process itself)
export const saveSnapshot = async (ticket: Ticket, copilot: { leadId?: number | null; steps: Array<{ key: string; done: boolean; optional?: boolean }>; current: string | null }): Promise<void> => {
  try {
    const required = copilot.steps.filter(s => !s.optional);
    const doneKeys = copilot.steps.filter(s => s.done).map(s => s.key);
    await CopilotSnapshot.upsert({
      ticketId: ticket.id, leadId: copilot.leadId || null, userId: ticket.userId || null, doneKeys, current: copilot.current,
      doneCount: required.filter(s => s.done).length, requiredTotal: required.length
    } as any);
  } catch (err) {
    logger.warn(`Retrato do processo da conversa ${ticket.id} não salvo: ${(err as Error).message}`);
  }
};

const AUDIO = `('audio', 'ptt')`;

export const processMetrics = async (users: Array<{ id: number; name: string }>, period: Period, stepLabel: (key: string) => string): Promise<ProcessRow[]> => {
  const ids = users.map(u => u.id);
  const out = new Map<number, ProcessRow>(users.map(u => [u.id, {
    userId: u.id, name: u.name, conversations: 0, messagesSent: 0, messagesReceived: 0, audiosSent: 0, audiosReceived: 0, gradesSent: 0,
    stageMoves: 0, processAvg: null, processSamples: 0, stoppedAt: [], byStage: [], replyMedianMin: null, replyWithinSlaPct: null
  }]));
  if (!ids.length) return [];
  const rep = { ids, from: period.start, to: period.end };
  const set = (key: keyof ProcessRow) => (r: any) => { const m = out.get(Number(r.userId)); if (m) (m as any)[key] = Number(r.n || 0); };

  // what the person sent (the outbox holds the real author), and the audios among them
  const sends = `FROM OutboundMessages o JOIN Tickets t ON t.id = o.ticketId WHERE o.status = 'sent' AND o.userId IN (:ids) AND o.sentAt BETWEEN :from AND :to AND ${VALID_TICKET}`;
  (await rows(`SELECT o.userId, COUNT(*) AS n ${sends} GROUP BY o.userId`, rep)).forEach(set("messagesSent"));
  (await rows(`SELECT o.userId, COUNT(DISTINCT o.ticketId) AS n ${sends} GROUP BY o.userId`, rep)).forEach(set("conversations"));
  (await rows(`SELECT o.userId, COUNT(*) AS n FROM OutboundMessages o JOIN Tickets t ON t.id = o.ticketId JOIN Messages m ON m.id = o.providerMsgId
    WHERE o.status = 'sent' AND o.userId IN (:ids) AND o.sentAt BETWEEN :from AND :to AND m.mediaType IN ${AUDIO} AND ${VALID_TICKET} GROUP BY o.userId`, rep)).forEach(set("audiosSent"));
  // what the leads sent in the conversations the person holds
  const received = `FROM Messages m JOIN Tickets t ON t.id = m.ticketId WHERE m.fromMe = false AND t.userId IN (:ids) AND m.createdAt BETWEEN :from AND :to AND ${VALID_TICKET}`;
  (await rows(`SELECT t.userId, COUNT(*) AS n ${received} GROUP BY t.userId`, rep)).forEach(set("messagesReceived"));
  (await rows(`SELECT t.userId, COUNT(*) AS n ${received} AND m.mediaType IN ${AUDIO} GROUP BY t.userId`, rep)).forEach(set("audiosReceived"));
  // grades sent by the person, and stage moves made by the person
  (await rows(`SELECT userId, COUNT(*) AS n FROM LeadActivities WHERE type = 'grade_sent' AND userId IN (:ids) AND createdAt BETWEEN :from AND :to GROUP BY userId`, rep)).forEach(set("gradesSent"));
  (await rows(`SELECT userId, COUNT(*) AS n FROM LeadActivities WHERE type = 'stage' AND userId IN (:ids) AND createdAt BETWEEN :from AND :to GROUP BY userId`, rep)).forEach(set("stageMoves"));

  // the process: the conversations of the person looked at in the period
  (await rows(`SELECT userId, AVG(CASE WHEN requiredTotal > 0 THEN doneCount * 100.0 / requiredTotal END) AS avg, COUNT(*) AS n
    FROM CopilotSnapshots WHERE userId IN (:ids) AND updatedAt BETWEEN :from AND :to GROUP BY userId`, rep)).forEach(r => {
    const m = out.get(Number(r.userId));
    if (m) { m.processAvg = r.avg === null ? null : Math.round(Number(r.avg)); m.processSamples = Number(r.n || 0); }
  });
  (await rows(`SELECT userId, current, COUNT(*) AS n FROM CopilotSnapshots WHERE userId IN (:ids) AND updatedAt BETWEEN :from AND :to AND current IS NOT NULL
    GROUP BY userId, current ORDER BY n DESC`, rep)).forEach(r => {
    const m = out.get(Number(r.userId));
    if (m) m.stoppedAt.push({ step: stepLabel(String(r.current)), n: Number(r.n) });
  });

  // response time: each run of lead messages waits for the next answer in the conversations the person holds (same rule as "Equipe")
  try {
    const { getBusinessConfig } = await import("../../helpers/BusinessTime");
    const { pairGaps, summarize } = await import("../../helpers/ResponseTimes");
    const { getSetting } = await import("../../helpers/AppSettings");
    const sla = Math.min(1440, Math.max(1, Number(await getSetting("response_sla_minutes", "15")) || 15));
    const msgs = await rows(`SELECT m.ticketId, m.fromMe, m.createdAt, t.userId FROM Messages m JOIN Tickets t ON t.id = m.ticketId
      WHERE t.userId IN (:ids) AND m.createdAt BETWEEN :from AND :to AND m.isDeleted = false AND ${VALID_TICKET} ORDER BY m.ticketId, m.createdAt LIMIT 60000`, rep);
    const ownerOf = new Map(msgs.map(m => [Number(m.ticketId), Number(m.userId)]));
    const byUser = new Map<number, number[]>();
    pairGaps(msgs as any, await getBusinessConfig()).forEach(g => {
      const u = ownerOf.get(Number(g.ticketId));
      if (u) byUser.set(u, [...(byUser.get(u) || []), g.minutes]);
    });
    byUser.forEach((minutes, u) => {
      const m = out.get(u);
      if (!m) return;
      const sum = summarize(minutes, sla);
      m.replyMedianMin = sum.median;
      m.replyWithinSlaPct = sum.withinSlaPct;
    });
  } catch (err) {
    logger.warn(`Tempo de resposta por consultor: ${(err as Error).message}`);
  }

  // the person's open leads, by funnel column (the picture now, not the period)
  (await rows(`SELECT l.ownerId AS userId, s.name AS stage, s.color, s.position, COUNT(*) AS n FROM Leads l JOIN LeadStages s ON s.id = l.stageId
    WHERE l.ownerId IN (:ids) AND l.isHistorical = false AND s.type = 'open' GROUP BY l.ownerId, s.name, s.color, s.position ORDER BY s.position`, rep)).forEach(r => {
    const m = out.get(Number(r.userId));
    if (m) m.byStage.push({ stage: String(r.stage), color: r.color || null, n: Number(r.n) });
  });
  return [...out.values()];
};

// one consultant's leads in conversation: where each one stopped in the process, the funnel column and the situation written by the follow-up
export const consultantLeads = async (userId: number, period: Period, stepLabel: (key: string) => string): Promise<any[]> => {
  const list = await rows(`SELECT c.ticketId, c.leadId, c.current, c.doneCount, c.requiredTotal, c.updatedAt, l.name, s.name AS stage, s.color AS stageColor,
      lc.summary, lc.temperature
    FROM CopilotSnapshots c LEFT JOIN Leads l ON l.id = c.leadId LEFT JOIN LeadStages s ON s.id = l.stageId LEFT JOIN LeadCommercials lc ON lc.leadId = c.leadId
    WHERE c.userId = :userId AND c.updatedAt BETWEEN :from AND :to ORDER BY c.updatedAt DESC LIMIT 300`, { userId, from: period.start, to: period.end });
  return list.map(r => ({
    ticketId: Number(r.ticketId), leadId: r.leadId ? Number(r.leadId) : null, name: r.name || "Contato sem lead", stage: r.stage || null, stageColor: r.stageColor || null,
    stoppedAt: r.current ? stepLabel(String(r.current)) : "Processo completo", progress: Number(r.requiredTotal) ? Math.round(Number(r.doneCount) * 100 / Number(r.requiredTotal)) : null,
    summary: r.summary || null, temperature: r.temperature || null, updatedAt: r.updatedAt
  }));
};
