import Lead from "../../models/Lead";
import LeadStage from "../../models/LeadStage";

const SOURCE_WEIGHT: Record<string, number> = {
  "Indicação": 12,
  "Visita presencial": 12,
  "Evento / feira": 8,
  "Site / formulário": 6,
  Google: 6,
  WhatsApp: 6,
  Instagram: 4,
  Facebook: 4
};

const daysAgo = (d?: Date | null) =>
  d ? (Date.now() - new Date(d).getTime()) / 86400000 : Infinity;

// 0-100: how ready this lead looks. Deterministic and explainable:
//   profile completeness (max 40) + source (max 12) + engagement (max 20)
//   + progress through the funnel (max 28); won = 100, lost = 0.
export const computeScore = (
  lead: Partial<Lead>,
  stage: LeadStage | null,
  openStagePosition = 0,
  openStageCount = 1
): number => {
  if (stage?.type === "won") return 100;
  if (stage?.type === "lost") return 0;

  let score = 0;
  if (lead.phone) score += 10;
  if (lead.email) score += 8;
  if (lead.courseId) score += 10;
  if (lead.entryTerm) score += 4;
  // how close to enrolling: the strongest buying signal a consultant can record
  score += ({ "Quer matricular agora": 12, "Decide esta semana": 8, "Decide este mês": 4 } as Record<string, number>)[
    lead.decisionTimeline || ""
  ] || 0;
  if (lead.city) score += 2;
  if (lead.educationLevel) score += 2;

  score += SOURCE_WEIGHT[lead.source || ""] || 3;

  const inbound = daysAgo(lead.lastInboundAt);
  if (inbound <= 2) score += 15;
  else if (inbound <= 7) score += 8;
  if (lead.firstContactAt) score += 5;

  if (openStageCount > 1) {
    score += Math.round((openStagePosition / (openStageCount - 1)) * 28);
  }
  return Math.max(0, Math.min(100, score));
};
