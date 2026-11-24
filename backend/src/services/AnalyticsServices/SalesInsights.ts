import { logger } from "../../utils/logger";
import { Period, rows, VALID_TICKET, LEAD_IN_INSTITUTION } from "./AnalyticsService";

// one block that fails (an old row with broken JSON) leaves that block empty and is logged; the rest of the picture still comes
const safe = (p: Promise<any[]>, what: string): Promise<any[]> => p.catch(err => { logger.warn(`Estatísticas do comercial (${what}): ${(err as Error).message}`); return []; });

// The commercial picture the management asked for, from data the system already keeps (nothing here is typed by a screen):
// where the leads stop in the funnel, the objections each consultant meets, who sold most and where (city and course),
// who sends the course grade and who does not, who sends audio, and what of the sales process each one follows or skips.
// The same period rules and the same "real customers only" filter as the rest of the commercial analytics.

export interface StepDef { key: string; label: string; optional?: boolean }

const AUDIO = `('audio', 'ptt')`;
// a lead open in the same column for longer than this is "stopped" there
export const STALL_DAYS = 7;

const n = (v: any): number => Number(v || 0);
const round1 = (v: number): number => Math.round(v * 10) / 10;
const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

// which required steps a conversation skipped: a step not done while a later step of the process is done
export const skippedSteps = (order: StepDef[], doneKeys: string[]): string[] => {
  const done = new Set(doneKeys);
  const required = order.filter(s => !s.optional);
  let lastDone = -1;
  required.forEach((s, i) => { if (done.has(s.key)) lastDone = i; });
  return required.slice(0, Math.max(0, lastDone)).filter(s => !done.has(s.key)).map(s => s.key);
};

// Who skipped one step, with which lead and when: the conversations behind one line of "the steps most often skipped". "When" is
// the last time the process of that conversation changed (what the system records), the most recent first. Only names: no phone.
export interface SkippedRow { userId: number; consultant: string; leadId: number | null; leadName: string; ticketId: number; at: string }
export const skippedDetail = async (users: Array<{ id: number; name: string }>, period: Period, steps: StepDef[], stepKey: string): Promise<SkippedRow[]> => {
  const ids = users.map(u => u.id);
  if (!ids.length || !steps.some(s => s.key === stepKey && !s.optional)) return [];
  const nameOf = new Map(users.map(u => [u.id, u.name]));
  const snaps = await rows(
    `SELECT c.ticketId, c.leadId, c.userId, c.doneKeys, c.updatedAt, COALESCE(l.name, ct.name) AS leadName
     FROM CopilotSnapshots c
     LEFT JOIN Leads l ON l.id = c.leadId
     LEFT JOIN Tickets t ON t.id = c.ticketId
     LEFT JOIN Contacts ct ON ct.id = t.contactId
     WHERE c.userId IN (:ids) AND c.updatedAt BETWEEN :from AND :to AND (c.leadId IS NULL OR l.id IS NULL OR ${LEAD_IN_INSTITUTION})
     ORDER BY c.updatedAt DESC LIMIT 20000`, { ids, from: period.start, to: period.end });
  return skippedRowsOf(snaps, steps, stepKey, nameOf);
};

// the conversations (already the most recent first) in which `stepKey` was skipped, at most 200
export const skippedRowsOf = (snaps: any[], steps: StepDef[], stepKey: string, nameOf: Map<number, string>): SkippedRow[] => {
  const out: SkippedRow[] = [];
  for (const s of snaps) {
    const done: string[] = Array.isArray(s.doneKeys) ? s.doneKeys : (() => { try { return JSON.parse(s.doneKeys || "[]"); } catch (_) { return []; } })();
    if (!skippedSteps(steps, done).includes(stepKey)) continue;
    out.push({ userId: Number(s.userId), consultant: nameOf.get(Number(s.userId)) || `#${s.userId}`, leadId: s.leadId ? Number(s.leadId) : null, leadName: s.leadName || "Sem nome", ticketId: Number(s.ticketId), at: new Date(s.updatedAt).toISOString() });
    if (out.length >= 200) break;
  }
  return out;
};

export const salesInsights = async (users: Array<{ id: number; name: string }>, period: Period, steps: StepDef[]) => {
  const ids = users.map(u => u.id);
  const nameOf = new Map(users.map(u => [u.id, u.name]));
  const labelOf = new Map(steps.map(s => [s.key, s.label]));
  const empty = { consultants: [], stages: [], objections: { byType: [], byConsultant: [] }, lostReasons: [], sales: { byConsultant: [], byCity: [], byCourse: [], top: [] }, process: { skipped: [], samples: 0, steps: [], previousSamples: 0 }, volume: { conversations: 0, peopleContacted: 0, newContacts: 0 } };
  if (!ids.length) return empty;
  const rep = { ids, from: period.start, to: period.end, stalledBefore: new Date(Date.now() - STALL_DAYS * 86400000) };

  const per = new Map<number, any>(ids.map(id => [id, {
    userId: id, name: nameOf.get(id) || `#${id}`,
    conversations: 0, peopleContacted: 0, newContacts: 0, audiosSent: 0, conversationsWithAudio: 0, audioShare: null as number | null,
    gradesSent: 0, gradeLeads: 0, gradeMissing: 0, gradeCoverage: null as number | null, analyses: 0,
    enrollments: 0, enrolledWithoutProposal: 0, enrolledWithoutGrade: 0, stalled: 0, lost: 0,
    enrolledChecked: 0, enrolledSkipping: 0, missingAtEnroll: new Map<string, number>() as any,
    processAvg: null as number | null, processSamples: 0, skipped: [] as Array<{ step: string; label: string; n: number; share: number }>,
    objections: [] as Array<{ type: string; n: number; unhandled: number }>, reviewed: 0
  }]));
  const at = (id: any) => per.get(Number(id));

  // ---- volume: conversations (each ticket once), people (each contact once) and people reached for the first time
  const sends = `FROM OutboundMessages o JOIN Tickets t ON t.id = o.ticketId WHERE o.status = 'sent' AND o.userId IN (:ids) AND o.sentAt BETWEEN :from AND :to AND ${VALID_TICKET}`;
  (await rows(`SELECT o.userId, COUNT(DISTINCT o.ticketId) AS c, COUNT(DISTINCT t.contactId) AS p ${sends} GROUP BY o.userId`, rep)).forEach(r => {
    const m = at(r.userId); if (m) { m.conversations = n(r.c); m.peopleContacted = n(r.p); }
  });
  (await rows(`SELECT o.userId, COUNT(DISTINCT t.contactId) AS n ${sends}
    AND NOT EXISTS (SELECT 1 FROM OutboundMessages o2 JOIN Tickets t2 ON t2.id = o2.ticketId WHERE t2.contactId = t.contactId AND o2.status = 'sent' AND o2.sentAt < :from)
    GROUP BY o.userId`, rep)).forEach(r => { const m = at(r.userId); if (m) m.newContacts = n(r.n); });

  // ---- audio: how many audios the person sent and in how many of their conversations
  (await rows(`SELECT o.userId, COUNT(*) AS n, COUNT(DISTINCT o.ticketId) AS c FROM OutboundMessages o JOIN Tickets t ON t.id = o.ticketId JOIN Messages m ON m.id = o.providerMsgId
    WHERE o.status = 'sent' AND o.userId IN (:ids) AND o.sentAt BETWEEN :from AND :to AND m.mediaType IN ${AUDIO} AND ${VALID_TICKET} GROUP BY o.userId`, rep)).forEach(r => {
    const m = at(r.userId); if (m) { m.audiosSent = n(r.n); m.conversationsWithAudio = n(r.c); }
  });

  // ---- grades: sent by the person; leads of the person that reached the grade step (or later) with no grade sent at all
  (await rows(`SELECT userId, COUNT(*) AS n FROM LeadActivities WHERE type = 'grade_sent' AND userId IN (:ids) AND createdAt BETWEEN :from AND :to GROUP BY userId`, rep))
    .forEach(r => { const m = at(r.userId); if (m) m.gradesSent = n(r.n); });
  const gradeIdx = steps.findIndex(s => s.key === "grade");
  if (gradeIdx >= 0) {
    const after = steps.slice(gradeIdx).map(s => s.key);
    const snaps = await rows(`SELECT c.userId, c.leadId, c.doneKeys FROM CopilotSnapshots c WHERE c.userId IN (:ids) AND c.updatedAt BETWEEN :from AND :to AND c.leadId IS NOT NULL`, rep);
    const sentTo = new Set((await rows(`SELECT DISTINCT leadId FROM LeadActivities WHERE type = 'grade_sent' AND leadId IN (SELECT c.leadId FROM CopilotSnapshots c WHERE c.userId IN (:ids) AND c.updatedAt BETWEEN :from AND :to)`, rep)).map(r => Number(r.leadId)));
    snaps.forEach(s => {
      const m = at(s.userId); if (!m) return;
      const done: string[] = Array.isArray(s.doneKeys) ? s.doneKeys : (() => { try { return JSON.parse(s.doneKeys || "[]"); } catch (_) { return []; } })();
      if (!done.some(k => after.includes(k))) return;
      m.gradeLeads += 1;
      if (!sentTo.has(Number(s.leadId)) && !done.includes("grade")) m.gradeMissing += 1;
    });
  }
  (await rows(`SELECT userId, COUNT(*) AS n FROM CurricularAnalyses WHERE userId IN (:ids) AND createdAt BETWEEN :from AND :to GROUP BY userId`, rep))
    .forEach(r => { const m = at(r.userId); if (m) m.analyses = n(r.n); });

  // ---- sales: by the owner, the city (of the polo, else what the lead said) and the course; first enrollments and extra courses
  const won = await rows(`SELECT w.userId, w.city, w.course, COUNT(*) AS n FROM (
      SELECT l.ownerId AS userId, COALESCE(NULLIF(p.city, ''), NULLIF(l.city, ''), 'Sem cidade') AS city, COALESCE(c.name, 'Sem curso') AS course
        FROM Leads l LEFT JOIN Polos p ON p.id = l.poloId LEFT JOIN Courses c ON c.id = l.courseId
        WHERE l.ownerId IN (:ids) AND l.wonAt BETWEEN :from AND :to AND l.isHistorical = false AND ${LEAD_IN_INSTITUTION}
      UNION ALL
      SELECT e.ownerId AS userId, COALESCE(NULLIF(p.city, ''), 'Sem cidade') AS city, COALESCE(c.name, NULLIF(e.courseName, ''), 'Sem curso') AS course
        FROM LeadEnrollments e LEFT JOIN Polos p ON p.id = e.poloId LEFT JOIN Courses c ON c.id = e.courseId
        WHERE e.ownerId IN (:ids) AND e.enrolledAt BETWEEN :from AND :to
    ) w GROUP BY w.userId, w.city, w.course`, rep);
  const sum = (key: "city" | "course") => {
    const acc = new Map<string, number>();
    won.forEach(r => acc.set(String(r[key]), (acc.get(String(r[key])) || 0) + n(r.n)));
    return [...acc.entries()].map(([name, total]) => ({ name, n: total })).sort((a, b) => b.n - a.n);
  };
  won.forEach(r => { const m = at(r.userId); if (m) m.enrollments += n(r.n); });
  const pairs = new Map<string, { userId: number; name: string; course: string; n: number }>();
  won.forEach(r => {
    const k = `${r.userId}|${r.course}`;
    const cur = pairs.get(k) || { userId: Number(r.userId), name: nameOf.get(Number(r.userId)) || "", course: String(r.course), n: 0 };
    cur.n += n(r.n);
    pairs.set(k, cur);
  });
  const citiesOf = new Map<number, Map<string, number>>();
  won.forEach(r => {
    const m = citiesOf.get(Number(r.userId)) || new Map<string, number>();
    m.set(String(r.city), (m.get(String(r.city)) || 0) + n(r.n));
    citiesOf.set(Number(r.userId), m);
  });

  // enrolled in the period without a proposal sent, or without the course grade sent (the steps that should come first)
  (await rows(`SELECT l.ownerId AS userId,
      SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM Proposals pr WHERE pr.leadId = l.id AND pr.sentAt IS NOT NULL) THEN 1 ELSE 0 END) AS np,
      SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM LeadActivities a WHERE a.leadId = l.id AND a.type = 'grade_sent') THEN 1 ELSE 0 END) AS ng
    FROM Leads l WHERE l.ownerId IN (:ids) AND l.wonAt BETWEEN :from AND :to AND l.isHistorical = false AND ${LEAD_IN_INSTITUTION} GROUP BY l.ownerId`, rep)).forEach(r => {
    const m = at(r.userId); if (m) { m.enrolledWithoutProposal = n(r.np); m.enrolledWithoutGrade = n(r.ng); }
  });

  // what was still missing in the sales process at the moment of each enrollment (the picture taken by EnrollLead)
  const atEnroll = await safe(rows(`SELECT l.ownerId AS userId, a.meta FROM LeadActivities a JOIN Leads l ON l.id = a.leadId
    WHERE ${LEAD_IN_INSTITUTION} AND a.type = 'process_at_enroll' AND l.ownerId IN (:ids) AND a.createdAt BETWEEN :from AND :to`, rep), "processo na matrícula");
  atEnroll.forEach(r => {
    const m = at(r.userId); if (!m) return;
    let missing: string[] = [];
    try { missing = (JSON.parse(r.meta || "{}").missing || []).filter((k: any) => typeof k === "string" && k !== "enroll"); } catch (_) { missing = []; }
    m.enrolledChecked += 1;
    if (missing.length) m.enrolledSkipping += 1;
    missing.forEach(k => m.missingAtEnroll.set(k, (m.missingAtEnroll.get(k) || 0) + 1));
  });

  // ---- the funnel: how long leads stay in each column (each stage move closes the time in the column it left: from the
  //      previous move, or from the creation of the lead), and the open leads stopped now
  const moves = await safe(rows(`SELECT x.fromStage, COUNT(*) AS n, AVG(x.days) AS avg FROM (
      SELECT CAST(CAST(a.meta AS json)->>'from' AS text) AS fromStage,
             ${"EXTRACT(EPOCH FROM (a.createdAt - COALESCE(LAG(a.createdAt) OVER (PARTITION BY a.leadId ORDER BY a.createdAt), l.createdAt))) / 86400"} AS days
        FROM LeadActivities a JOIN Leads l ON l.id = a.leadId
        WHERE a.type = 'stage' AND l.ownerId IN (:ids) AND l.isHistorical = false AND ${LEAD_IN_INSTITUTION} AND a.meta IS NOT NULL AND a.meta LIKE '{%'
    ) x WHERE x.fromStage IS NOT NULL AND x.days >= 0 GROUP BY x.fromStage`, rep), "tempo nas etapas");
  const stageRows = await rows(`SELECT s.id, s.name, s.color, s.position, s.type FROM LeadStages s ORDER BY s.position`, rep);
  const open = await rows(`SELECT l.stageId, l.ownerId AS userId,
      COUNT(*) AS total,
      SUM(CASE WHEN COALESCE((SELECT MAX(a.createdAt) FROM LeadActivities a WHERE a.leadId = l.id AND a.type = 'stage'), l.createdAt) < :stalledBefore THEN 1 ELSE 0 END) AS stalled
    FROM Leads l JOIN LeadStages s ON s.id = l.stageId
    WHERE l.ownerId IN (:ids) AND l.isHistorical = false AND ${LEAD_IN_INSTITUTION} AND s.type = 'open' GROUP BY l.stageId, l.ownerId`, rep);
  open.forEach(r => { const m = at(r.userId); if (m) m.stalled += n(r.stalled); });
  const stages = stageRows.filter(s => s.type === "open").map(s => {
    const mine = open.filter(r => String(r.stageId) === String(s.id));
    const mv = moves.find(r => String(r.fromStage) === String(s.id));
    const byConsultant = mine.map(r => ({ userId: Number(r.userId), name: nameOf.get(Number(r.userId)) || "", open: n(r.total), stalled: n(r.stalled) }))
      .filter(r => r.open > 0).sort((a, b) => b.stalled - a.stalled || b.open - a.open);
    return {
      stageId: Number(s.id), name: String(s.name), color: s.color || null,
      open: mine.reduce((t, r) => t + n(r.total), 0), stalled: mine.reduce((t, r) => t + n(r.stalled), 0),
      avgDays: mv && mv.avg !== null ? round1(Number(mv.avg)) : null, passed: mv ? n(mv.n) : 0, byConsultant
    };
  });

  // ---- lost leads: why, per owner
  const lost = await rows(`SELECT l.ownerId AS userId, COALESCE(NULLIF(l.lostReason, ''), 'Sem motivo') AS reason, COUNT(*) AS n
    FROM Leads l WHERE l.ownerId IN (:ids) AND l.lostAt BETWEEN :from AND :to AND l.isHistorical = false AND ${LEAD_IN_INSTITUTION} GROUP BY l.ownerId, reason`, rep);
  lost.forEach(r => { const m = at(r.userId); if (m) m.lost += n(r.n); });
  const reasons = new Map<string, number>();
  lost.forEach(r => reasons.set(String(r.reason), (reasons.get(String(r.reason)) || 0) + n(r.n)));

  // ---- objections: what the daily review read in each consultant's conversations, plus what the AI agent heard before the handover
  const reviewed = await safe(rows(`SELECT r.userId, COUNT(*) AS n FROM ConsultantReviews r WHERE r.userId IN (:ids) AND r.createdAt BETWEEN :from AND :to GROUP BY r.userId`, rep), "revisões");
  reviewed.forEach(r => { const m = at(r.userId); if (m) m.reviewed = n(r.n); });
  const obj = await safe(rows(`SELECT r.userId, o->>'type' AS type, COUNT(*) AS n, SUM(CASE WHEN (o->>'handled') = 'false' THEN 1 ELSE 0 END) AS unhandled
    FROM ConsultantReviews r, jsonb_array_elements(r.objections) o WHERE r.userId IN (:ids) AND r.createdAt BETWEEN :from AND :to GROUP BY r.userId, type`, rep), "objeções");
  obj.forEach(r => { const m = at(r.userId); if (m) m.objections.push({ type: String(r.type), n: n(r.n), unhandled: n(r.unhandled) }); });
  const agentObj = await safe(rows(`SELECT CAST(lc.slots AS json)->>'objectionType' AS type, COUNT(*) AS n FROM LeadCommercials lc JOIN Leads l ON l.id = lc.leadId
    WHERE ${LEAD_IN_INSTITUTION} AND l.ownerId IN (:ids) AND lc.updatedAt BETWEEN :from AND :to AND lc.slots LIKE '{%' GROUP BY type`, rep), "objeções do agente");
  const types = new Map<string, { type: string; n: number; unhandled: number; agent: number }>();
  obj.forEach(r => { const t = types.get(String(r.type)) || { type: String(r.type), n: 0, unhandled: 0, agent: 0 }; t.n += n(r.n); t.unhandled += n(r.unhandled); types.set(t.type, t); });
  agentObj.filter(r => r.type).forEach(r => { const t = types.get(String(r.type)) || { type: String(r.type), n: 0, unhandled: 0, agent: 0 }; t.agent += n(r.n); types.set(t.type, t); });

  // ---- the process: average progress and the steps most often skipped (a later step done, this one not)
  const snaps = await rows(`SELECT userId, doneKeys, doneCount, requiredTotal FROM CopilotSnapshots WHERE userId IN (:ids) AND updatedAt BETWEEN :from AND :to LIMIT 20000`, rep);
  const skippedAll = new Map<string, number>();
  const prog = new Map<number, { sum: number; n: number; skipped: Map<string, number> }>();
  snaps.forEach(s => {
    const id = Number(s.userId);
    const done: string[] = Array.isArray(s.doneKeys) ? s.doneKeys : (() => { try { return JSON.parse(s.doneKeys || "[]"); } catch (_) { return []; } })();
    const p = prog.get(id) || { sum: 0, n: 0, skipped: new Map<string, number>() };
    if (n(s.requiredTotal) > 0) { p.sum += (n(s.doneCount) * 100) / n(s.requiredTotal); p.n += 1; }
    skippedSteps(steps, done).forEach(k => { p.skipped.set(k, (p.skipped.get(k) || 0) + 1); skippedAll.set(k, (skippedAll.get(k) || 0) + 1); });
    prog.set(id, p);
  });
  // every required step of the process, in order: how many conversations did it, how many skipped it, who skipped it most, and the
  // share of the previous period of the same length (to see whether it is getting better)
  const doneAll = new Map<string, number>();
  snaps.forEach(s => {
    const done: string[] = Array.isArray(s.doneKeys) ? s.doneKeys : (() => { try { return JSON.parse(s.doneKeys || "[]"); } catch (_) { return []; } })();
    done.forEach(k => doneAll.set(k, (doneAll.get(k) || 0) + 1));
  });
  const span = new Date(period.end).getTime() - new Date(period.start).getTime();
  const prevSnaps = await safe(rows(`SELECT doneKeys FROM CopilotSnapshots WHERE userId IN (:ids) AND updatedAt BETWEEN :pfrom AND :pto LIMIT 20000`, { ids, pfrom: new Date(new Date(period.start).getTime() - span), pto: new Date(period.start) }), "processo do período anterior");
  const prevSkipped = new Map<string, number>();
  prevSnaps.forEach(s => {
    const done: string[] = Array.isArray(s.doneKeys) ? s.doneKeys : (() => { try { return JSON.parse(s.doneKeys || "[]"); } catch (_) { return []; } })();
    skippedSteps(steps, done).forEach(k => prevSkipped.set(k, (prevSkipped.get(k) || 0) + 1));
  });
  const nameOfUser = new Map(users.map(u => [u.id, u.name]));
  const processSteps = steps.filter(st => !st.optional).map(st => {
    let top: { userId: number; name: string; n: number } | null = null;
    prog.forEach((p, id) => {
      const c = p.skipped.get(st.key) || 0;
      if (c > 0 && (!top || c > top.n)) top = { userId: id, name: nameOfUser.get(id) || `#${id}`, n: c };
    });
    const skippedN = skippedAll.get(st.key) || 0;
    return {
      step: st.key,
      label: st.label,
      done: doneAll.get(st.key) || 0,
      skipped: skippedN,
      share: pct(skippedN, snaps.length),
      previousShare: prevSnaps.length ? pct(prevSkipped.get(st.key) || 0, prevSnaps.length) : null,
      top
    };
  });

  prog.forEach((p, id) => {
    const m = at(id); if (!m) return;
    m.processSamples = p.n;
    m.processAvg = p.n ? Math.round(p.sum / p.n) : null;
    m.skipped = [...p.skipped.entries()].map(([k, c]) => ({ step: k, label: labelOf.get(k) || k, n: c, share: pct(c, p.n) || 0 })).sort((a, b) => b.n - a.n).slice(0, 5);
  });

  per.forEach(m => {
    m.audioShare = pct(m.conversationsWithAudio, m.conversations);
    m.gradeCoverage = m.gradeLeads ? pct(m.gradeLeads - m.gradeMissing, m.gradeLeads) : null;
    m.objections.sort((a: any, b: any) => b.n - a.n);
    m.missingAtEnroll = [...(m.missingAtEnroll as Map<string, number>).entries()].map(([k, c]) => ({ step: k, label: labelOf.get(k) || k, n: c })).sort((a, b) => b.n - a.n);
    m.cities = [...(citiesOf.get(m.userId) || new Map()).entries()].map(([name, c]) => ({ name, n: c })).sort((a, b) => b.n - a.n).slice(0, 5);
  });
  const consultants = [...per.values()];
  const totalOf = (k: string) => consultants.reduce((t, m) => t + n(m[k]), 0);

  return {
    consultants: consultants.sort((a, b) => b.enrollments - a.enrollments || b.conversations - a.conversations),
    stages,
    stalledDays: STALL_DAYS,
    objections: {
      byType: [...types.values()].sort((a, b) => b.n + b.agent - (a.n + a.agent)),
      byConsultant: consultants.filter(m => m.objections.length).map(m => ({ userId: m.userId, name: m.name, reviewed: m.reviewed, objections: m.objections }))
    },
    lostReasons: [...reasons.entries()].map(([reason, c]) => ({ reason, n: c })).sort((a, b) => b.n - a.n),
    sales: {
      byConsultant: consultants.filter(m => m.enrollments > 0).map(m => ({ userId: m.userId, name: m.name, n: m.enrollments })).sort((a, b) => b.n - a.n),
      byCity: sum("city"),
      byCourse: sum("course"),
      top: [...pairs.values()].sort((a, b) => b.n - a.n).slice(0, 5)
    },
    // samples: the conversations with a process in the period, so a skipped step reads as "n of samples"
    process: { skipped: [...skippedAll.entries()].map(([k, c]) => ({ step: k, label: labelOf.get(k) || k, n: c })).sort((a, b) => b.n - a.n), samples: snaps.length, steps: processSteps, previousSamples: prevSnaps.length },
    volume: { conversations: totalOf("conversations"), peopleContacted: totalOf("peopleContacted"), newContacts: totalOf("newContacts") }
  };
};
