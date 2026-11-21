import { CHECKLIST, parseChecklist } from "../CrmServices/OnboardingChecklist";
import { rows } from "./AnalyticsService";

// What the tutoring needs to see beyond the onboarding numbers: students the tutor has not talked to for a week, where the onboarding
// stops (the checklist step not ticked), students at risk of leaving (no conversation for 15 days, and with a fee still open when there is
// one), re-enrollments and the NPS answered, per tutor. tutorIds = null means everybody (the management); a tutor passes only their own id.
export const NO_CONTACT_DAYS = 7;
export const RISK_DAYS = 15;

export const tutoriaInsights = async (tutorIds: number[] | null, from: Date, to: Date) => {
  const scope = tutorIds ? "AND l.onboardingTutorId IN (:tutors)" : "AND l.onboardingTutorId IS NOT NULL";
  const rep = { tutors: tutorIds && tutorIds.length ? tutorIds : [0], from, to, now: new Date(), noContact: NO_CONTACT_DAYS, risk: RISK_DAYS };
  // the students in care: enrolled, not lost; the last message of anybody of the team to them, and the last message they sent
  const students = await rows(`SELECT l.id, l.onboardingTutorId AS tutorId, l.onboardingStatus AS status, l.onboardingChecklist AS checklist, l.reenrolledAt,
      (SELECT MAX(m.createdAt) FROM Tickets t JOIN Messages m ON m.ticketId = t.id WHERE t.contactId = l.contactId AND m.fromMe = true) AS lastOut,
      (SELECT MAX(m.createdAt) FROM Tickets t JOIN Messages m ON m.ticketId = t.id WHERE t.contactId = l.contactId AND m.fromMe = false) AS lastIn,
      EXISTS (SELECT 1 FROM Payments p WHERE p.leadId = l.id AND p.status IN ('pending', 'expired')) AS feeOpen
    FROM Leads l WHERE l.enrolledAt IS NOT NULL AND l.lostAt IS NULL AND l.isHistorical = false ${scope} LIMIT 20000`, rep);
  const names = new Map((await rows(`SELECT id, name FROM Users WHERE id IN (SELECT DISTINCT onboardingTutorId FROM Leads l WHERE l.enrolledAt IS NOT NULL ${scope})`, rep)).map(u => [Number(u.id), String(u.name)]));
  const nps = await rows(`SELECT l.onboardingTutorId AS tutorId, COUNT(*) AS n, AVG(s.score) AS avg,
      SUM(CASE WHEN s.score >= 9 THEN 1 ELSE 0 END) AS promoters, SUM(CASE WHEN s.score <= 6 THEN 1 ELSE 0 END) AS detractors
    FROM NpsSurveys s JOIN Leads l ON l.id = s.leadId WHERE s.score IS NOT NULL AND s.answeredAt BETWEEN :from AND :to ${scope} GROUP BY l.onboardingTutorId`, rep);

  const day = 86400000;
  const now = Date.now();
  const per = new Map<number, any>();
  const row = (id: number) => {
    if (!per.has(id)) per.set(id, { tutorId: id, name: names.get(id) || `#${id}`, students: 0, noContact: 0, atRisk: 0, atRiskWithFee: 0, reenrolled: 0, onboardingOpen: 0, nps: null as any });
    return per.get(id);
  };
  const stalled = new Map<string, number>(CHECKLIST.map(s => [s.key, 0]));
  students.forEach(s => {
    const r = row(Number(s.tutorId));
    r.students += 1;
    const lastOut = s.lastOut ? +new Date(s.lastOut) : 0;
    const lastAny = Math.max(lastOut, s.lastIn ? +new Date(s.lastIn) : 0);
    if (!lastOut || now - lastOut > NO_CONTACT_DAYS * day) r.noContact += 1;
    if (!lastAny || now - lastAny > RISK_DAYS * day) {
      r.atRisk += 1;
      if (s.feeOpen === true || s.feeOpen === "t" || Number(s.feeOpen) === 1) r.atRiskWithFee += 1;
    }
    if (s.reenrolledAt && +new Date(s.reenrolledAt) >= +from && +new Date(s.reenrolledAt) <= +to) r.reenrolled += 1;
    if (s.status && s.status !== "done" && s.status !== "none") {
      r.onboardingOpen += 1;
      // the first step not ticked is where this onboarding stopped
      const done = parseChecklist(s.checklist);
      const first = CHECKLIST.find(st => !done[st.key]);
      if (first) stalled.set(first.key, (stalled.get(first.key) || 0) + 1);
    }
  });
  nps.forEach(x => {
    const r = row(Number(x.tutorId));
    const n = Number(x.n || 0);
    r.nps = { answers: n, average: x.avg === null ? null : Math.round(Number(x.avg) * 10) / 10, score: n ? Math.round(((Number(x.promoters || 0) - Number(x.detractors || 0)) / n) * 100) : null };
  });
  const tutors = [...per.values()].sort((a, b) => b.atRisk - a.atRisk || b.noContact - a.noContact);
  const sum = (k: string) => tutors.reduce((t, r) => t + Number(r[k] || 0), 0);
  return {
    noContactDays: NO_CONTACT_DAYS,
    riskDays: RISK_DAYS,
    totals: { students: sum("students"), noContact: sum("noContact"), atRisk: sum("atRisk"), atRiskWithFee: sum("atRiskWithFee"), reenrolled: sum("reenrolled"), onboardingOpen: sum("onboardingOpen") },
    onboardingStalled: CHECKLIST.map(s => ({ key: s.key, label: s.label, n: stalled.get(s.key) || 0 })),
    tutors
  };
};
