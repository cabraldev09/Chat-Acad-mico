import { Op, fn, col } from "sequelize";

import AiUsage from "../../models/AiUsage";
import { dayBounds } from "../../helpers/AppTime";
import { getSetting } from "../../helpers/AppSettings";

interface Counts {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
}

export const logUsage = async (a: {
  agentId?: number | null;
  ticketId?: number | null;
  model: string;
  kind: "reply" | "summary" | "test";
  usage?: Counts;
  flowId?: number | null;
  nodeId?: string | null;
  latencyMs?: number | null;
  leadId?: number | null;
}): Promise<void> => {
  const u = a.usage || {};
  await AiUsage.create({
    agentId: a.agentId || null,
    ticketId: a.ticketId || null,
    flowId: a.flowId || null,
    nodeId: a.nodeId ? String(a.nodeId).slice(0, 40) : null,
    latencyMs: a.latencyMs ?? null,
    leadId: a.leadId || null,
    model: a.model,
    kind: a.kind,
    inputTokens: u.input_tokens ?? u.prompt_tokens ?? 0,
    outputTokens: u.output_tokens ?? u.completion_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0
  } as any).catch(() => undefined);
};

// real calls only (the agent tester does not count against the daily limit)
export const tokensToday = async (agentId: number): Promise<number> => {
  const row: any = await AiUsage.findOne({
    attributes: [[fn("COALESCE", fn("SUM", col("inputTokens")), 0), "i"], [fn("COALESCE", fn("SUM", col("outputTokens")), 0), "o"]],
    where: { agentId, kind: { [Op.ne]: "test" }, createdAt: { [Op.gte]: dayBounds().start } },
    raw: true
  });
  return Number(row?.i || 0) + Number(row?.o || 0);
};

// Prices are not guessed: set "ai_price_<model>" = "entrada,saida" (US$ per million tokens) to see costs.
export const priceOf = async (model: string): Promise<{ in: number; out: number } | null> => {
  const raw = await getSetting(`ai_price_${model}`, "");
  const [i, o] = raw.split(",").map(Number);
  return Number.isFinite(i) && Number.isFinite(o) && raw ? { in: i, out: o } : null;
};
