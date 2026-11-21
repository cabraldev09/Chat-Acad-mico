import { Op, fn, col } from "sequelize";

import { usageCounts } from "./Policy";
import AiUsage from "../../models/AiUsage";
import { dayBounds } from "../../helpers/AppTime";
import { priceInfoOf } from "./Prices";

interface Counts {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  prompt_tokens?: number;
  completion_tokens?: number;
}

export const logUsage = async (a: {
  agentId?: number | null;
  ticketId?: number | null;
  model: string;
  kind: "reply" | "summary" | "test" | "copilot" | "reading";
  usage?: Counts;
  flowId?: number | null;
  nodeId?: string | null;
  latencyMs?: number | null;
  leadId?: number | null;
}): Promise<void> => {
  const u = usageCounts(a.usage);
  const price = await priceOf(a.model);

  const regularInput = Math.max(0, u.input - u.cacheRead - u.cacheWrite);
  const [readX, writeX] = a.model.startsWith("claude") ? [0.1, 1.25] : [0.5, 1];
  await AiUsage.create({
    agentId: a.agentId || null,
    ticketId: a.ticketId || null,
    flowId: a.flowId || null,
    nodeId: a.nodeId ? String(a.nodeId).slice(0, 40) : null,
    latencyMs: a.latencyMs ?? null,
    leadId: a.leadId || null,
    model: a.model,
    kind: a.kind,
    inputTokens: regularInput,
    outputTokens: u.output,
    cacheReadTokens: u.cacheRead,
    cacheWriteTokens: u.cacheWrite,
    estimatedUsd: price ? ((regularInput + u.cacheRead * readX + u.cacheWrite * writeX) * price.in + u.output * price.out) / 1e6 : null
  } as any);

};

// real calls only (the agent tester does not count against the daily limit)
export const tokensToday = async (agentId: number): Promise<number> => {
  const row: any = await AiUsage.findOne({
    attributes: [[fn("COALESCE", fn("SUM", col("inputTokens")), 0), "i"], [fn("COALESCE", fn("SUM", col("outputTokens")), 0), "o"], [fn("COALESCE", fn("SUM", col("cacheReadTokens")), 0), "r"], [fn("COALESCE", fn("SUM", col("cacheWriteTokens")), 0), "w"]],
    where: { agentId, kind: { [Op.ne]: "test" }, createdAt: { [Op.gte]: dayBounds().start } },
    raw: true
  });
  return Number(row?.i || 0) + Number(row?.o || 0) + Number(row?.r || 0) + Number(row?.w || 0);
};

// The price saved for the model (Agentes de IA → Uso) or, without one, the reference price of the known models (Prices.ts)
export const priceOf = async (model: string): Promise<{ in: number; out: number } | null> => {
  const info = await priceInfoOf(model);
  return info ? { in: info.in, out: info.out } : null;
};
