import { rows, computeMetrics, consultantWhere, Period } from "./AnalyticsService";

// "Meu desempenho": what the consultant has to do and their commercial results, read only from what the system already counts,
// plus short tips that compare the person with the average of the team (never a number that is not in the data).

// the person's own leads now: how many in each open stage, and the ones that need something
export const myLeads = async (userId: number) => {
  const now = Date.now();
  const stages = await rows(
    `SELECT s.id, s.name, s.color, s.type, s.position, COUNT(l.id) AS n FROM LeadStages s
     LEFT JOIN Leads l ON l.stageId = s.id AND l.ownerId = :id AND l.isHistorical = false
     GROUP BY s.id, s.name, s.color, s.type, s.position ORDER BY s.position`, { id: userId });
  const [r] = await rows(
    `SELECT COUNT(*) AS open,
       SUM(CASE WHEN l.firstContactAt IS NULL AND l.createdAt < :hourAgo THEN 1 ELSE 0 END) AS waiting,
       SUM(CASE WHEN COALESCE(l.lastContactAt, l.createdAt) < :threeDays THEN 1 ELSE 0 END) AS stale
     FROM Leads l JOIN LeadStages s ON s.id = l.stageId WHERE s.type = 'open' AND l.ownerId = :id AND l.isHistorical = false`,
    { id: userId, hourAgo: new Date(now - 3600000), threeDays: new Date(now - 3 * 86400000) });
  return {
    stages: stages.filter(s => s.type === "open").map(s => ({ id: Number(s.id), name: s.name, color: s.color, n: Number(s.n) })),
    won: stages.filter(s => s.type === "won").reduce((t, s) => t + Number(s.n), 0),
    lost: stages.filter(s => s.type === "lost").reduce((t, s) => t + Number(s.n), 0),
    open: Number(r?.open || 0), waiting: Number(r?.waiting || 0), stale: Number(r?.stale || 0),
  };
};

export const allConsultantIds = async (): Promise<number[]> =>
  (await rows(`SELECT u.id FROM Users u WHERE ${consultantWhere} ORDER BY u.id`, {})).map(r => Number(r.id));

// the average of the team in the period, to compare (first contact, share of conversations with the grade, conversion)
export const teamAverages = async (period: Period) => {
  const ids = await allConsultantIds();
  if (!ids.length) return { firstContact: null, gradeShare: null, conversion: null };
  const metrics = [...(await computeMetrics(ids, period)).values()] as any[];
  const samples = metrics.reduce((t, m) => t + (m.firstContactMinutes === null ? 0 : m.firstContactSamples), 0);
  const firstContact = samples ? metrics.reduce((t, m) => t + (m.firstContactMinutes === null ? 0 : m.firstContactMinutes * m.firstContactSamples), 0) / samples : null;
  const attendances = metrics.reduce((t, m) => t + Number(m.attendances || 0), 0);
  const [g] = await rows(`SELECT COUNT(*) AS n FROM LeadActivities WHERE type = 'grade_sent' AND userId IN (:ids) AND createdAt BETWEEN :from AND :to`, { ids, from: period.start, to: period.end });
  const leads = metrics.reduce((t, m) => t + Number(m.leadsWorked || 0), 0);
  const won = metrics.reduce((t, m) => t + Number(m.enrollments || 0), 0);
  return { firstContact, gradeShare: attendances ? Math.round((Number(g?.n || 0) / attendances) * 100) : null, conversion: leads ? Math.round((won / leads) * 1000) / 10 : null };
};

export const gradesSentBy = async (userId: number, period: Period): Promise<number> =>
  Number((await rows(`SELECT COUNT(*) AS n FROM LeadActivities WHERE type = 'grade_sent' AND userId = :id AND createdAt BETWEEN :from AND :to`, { id: userId, from: period.start, to: period.end }))[0]?.n || 0);

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

// a few plain tips from the numbers: only when there is enough to compare, and never a number that is not in the data
export const tipsFor = (me: { metrics: any; grades: number }, team: { firstContact: number | null; gradeShare: number | null; conversion: number | null }): string[] => {
  const out: string[] = [];
  const m = me.metrics || {};
  if (m.firstContactMinutes !== null && m.firstContactMinutes !== undefined && team.firstContact && m.firstContactSamples >= 3 && m.firstContactMinutes > team.firstContact * 1.5) {
    out.push(`O seu primeiro contato leva em média ${Math.round(m.firstContactMinutes)} min; a equipe leva ${Math.round(team.firstContact)} min. Responder antes aumenta a chance de matrícula.`);
  }
  const share = pct(me.grades, Number(m.attendances || 0));
  if (share !== null && team.gradeShare !== null && Number(m.attendances || 0) >= 5 && share + 15 < team.gradeShare) {
    out.push(`Você enviou a grade em ${share}% das conversas; a equipe envia em ${team.gradeShare}%. A grade ajuda o lead a decidir.`);
  }
  if (m.conversion !== null && m.conversion !== undefined && team.conversion !== null && Number(m.leadsWorked || 0) >= 10 && m.conversion < team.conversion / 2) {
    out.push(`A sua conversão está em ${String(m.conversion).replace(".", ",")}%; a da equipe, em ${String(team.conversion).replace(".", ",")}%. Vale rever o roteiro com a coordenação.`);
  }
  if (Number(m.pendingReply || 0) >= 3) out.push(`Há ${m.pendingReply} conversas suas em que o cliente falou por último. Comece o dia por elas.`);
  return out.slice(0, 3);
};
