export const POLO_SUPERVISOR_MIN_SAMPLE = 5;

export interface PoloSupervisorMetric {
  poloId: number;
  attendances: number;
  receivedMessages: number;
  sentMessages: number;
  openNow: number;
  waitingNow: number;
  unansweredNow: number;
  enrollments: number;
  replies: {
    count: number;
    medianMinutes: number | null;
    p90Minutes: number | null;
    withinSlaPct: number | null;
  };
}

export interface PoloSupervisorRisk {
  poloId: number;
  issue: string;
  action: string;
}

export interface PoloSupervisorFeedback {
  summary: string;
  strengths: string[];
  risks: PoloSupervisorRisk[];
  nextActions: string[];
  caveats: string[];
}

// The model receives only metrics for polos with enough activity. Names and labels stay local.
export const buildPoloSupervisorInput = (rows: PoloSupervisorMetric[]) => ({
  eligible: rows
    .filter(row => row.attendances >= POLO_SUPERVISOR_MIN_SAMPLE)
    .map(({ poloId, attendances, receivedMessages, sentMessages, openNow, waitingNow, unansweredNow, enrollments, replies }) => ({
      poloId,
      attendances,
      receivedMessages,
      sentMessages,
      openNow,
      waitingNow,
      unansweredNow,
      enrollments,
      replies
    }))
});

export const poloSupervisorEvidence = (metrics: PoloSupervisorMetric): string =>
  `${metrics.attendances} atendimentos; ${metrics.receivedMessages} mensagens recebidas; ${metrics.sentMessages} enviadas; ${metrics.unansweredNow} sem resposta; ${metrics.enrollments} matrículas; resposta mediana ${formatMetric(metrics.replies.medianMinutes, " min")}, P90 ${formatMetric(metrics.replies.p90Minutes, " min")}; ${formatMetric(metrics.replies.withinSlaPct, "%")} dentro do SLA.`;

const formatMetric = (value: number | null, suffix = ""): string =>
  value === null || !Number.isFinite(value) ? "não disponível" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${suffix}`;

export const parsePoloSupervisorAnswer = (text: string, eligibleIds: number[]): PoloSupervisorFeedback => {
  let parsed: any;
  try {
    parsed = JSON.parse(String(text || ""));
  } catch {
    throw new Error("ERR_AI_BAD_ANSWER");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("ERR_AI_BAD_ANSWER");
  }
  const allowed = new Set(eligibleIds);
  const seen = new Set<number>();
  const summary = shortText(parsed.summary);
  if (!summary || !Array.isArray(parsed.strengths) || !Array.isArray(parsed.risks) || !Array.isArray(parsed.nextActions) || !Array.isArray(parsed.caveats)) {
    throw new Error("ERR_AI_BAD_ANSWER");
  }
  const strengths = stringList(parsed.strengths, 5);
  const nextActions = stringList(parsed.nextActions, 5);
  const caveats = stringList(parsed.caveats, 5);
  if (!strengths || !nextActions || !caveats || parsed.risks.length > 8) throw new Error("ERR_AI_BAD_ANSWER");
  const risks: PoloSupervisorRisk[] = [];
  for (const row of parsed.risks) {
    if (!row || typeof row !== "object" || !Number.isInteger(row.poloId) || !allowed.has(row.poloId) || seen.has(row.poloId)) {
      throw new Error("ERR_AI_BAD_ANSWER");
    }
    const issue = shortText(row.issue);
    const action = shortText(row.action);
    if (!issue || !action) throw new Error("ERR_AI_BAD_ANSWER");
    seen.add(row.poloId);
    risks.push({ poloId: row.poloId, issue, action });
  }
  return { summary, strengths, risks, nextActions, caveats };
};

const shortText = (value: unknown): string => typeof value === "string" ? value.trim().slice(0, 400) : "";

const stringList = (value: unknown[], max: number): string[] | null => {
  if (value.length > max) return null;
  const out = value.map(shortText);
  return out.some(item => !item) ? null : out;
};
