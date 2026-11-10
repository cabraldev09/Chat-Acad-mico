import { Op } from "sequelize";
import sequelize from "../../database";
import AiAgent from "../../models/AiAgent";
import AiUsage from "../../models/AiUsage";
import Reservation from "../../models/AiBudgetReservation";
import { dayBounds } from "../../helpers/AppTime";
import { getSetting } from "../../helpers/AppSettings";
import { logUsage, priceOf } from "./Usage";

// Reserve before calling; persist usage and release in one short transaction after the call.
// The input bound uses UTF-8 bytes + framing (more conservative than a token estimate).
export const callWithBudget = async (agent: AiAgent, kind: "reply" | "summary" | "test", ticketId: number | undefined, body: any, call: (body: any) => Promise<any>): Promise<any> => {
  const inputBound = Buffer.byteLength(JSON.stringify(body), "utf8") + 2048;
  const outputBound = Number(body.max_completion_tokens || body.max_tokens || 350);
  const tokens = inputBound + outputBound;
  const price = await priceOf(agent.model);
  // Reserve extra headroom for cache writes; UI prices remain an estimate, not an invoice.
  const estimatedUsd = price ? (inputBound * price.in * 2 + outputBound * price.out) / 1e6 : 0;
  const [globalTokens, globalUsd] = await Promise.all([getSetting("ai_daily_token_cap", "0"), getSetting("ai_daily_usd_cap", "0")]);
  const reservation = await sequelize.transaction(async transaction => {
    if (sequelize.getDialect() === "postgres") await sequelize.query("SELECT pg_advisory_xact_lock(918273)", { transaction });
    const since = dayBounds().start;
    const active = { expiresAt: { [Op.gt]: new Date() } };
    const globalUsed = Number(await AiUsage.sum("inputTokens", { where: { createdAt: { [Op.gte]: since } }, transaction }) || 0) + Number(await AiUsage.sum("outputTokens", { where: { createdAt: { [Op.gte]: since } }, transaction }) || 0);
    const reserved = Number(await Reservation.sum("tokens", { where: active, transaction }) || 0);
    if (Number(globalTokens) > 0 && globalUsed + reserved + tokens > Number(globalTokens)) throw new Error("ERR_AI_TOKEN_CAP");
    if (kind !== "test" && agent.dailyTokenCap > 0) {
      const where = { agentId: agent.id, kind: { [Op.ne]: "test" }, createdAt: { [Op.gte]: since } };
      const used = Number(await AiUsage.sum("inputTokens", { where, transaction }) || 0) + Number(await AiUsage.sum("outputTokens", { where, transaction }) || 0);
      const held = Number(await Reservation.sum("tokens", { where: { ...active, agentId: agent.id }, transaction }) || 0);
      if (used + held + tokens > agent.dailyTokenCap) throw new Error("ERR_AI_TOKEN_CAP");
    }
    if (Number(globalUsd) > 0) {
      const unknown = await AiUsage.count({ where: { createdAt: { [Op.gte]: since }, estimatedUsd: { [Op.is]: null } }, transaction });
      if (!price || unknown) throw new Error("ERR_AI_RATE_REQUIRED");
      const spent = Number(await AiUsage.sum("estimatedUsd", { where: { createdAt: { [Op.gte]: since } }, transaction }) || 0);
      const held = Number(await Reservation.sum("estimatedUsd", { where: active, transaction }) || 0);
      if (spent + held + estimatedUsd > Number(globalUsd)) throw new Error("ERR_AI_TOKEN_CAP");
    }
    return Reservation.create({ agentId: agent.id, tokens, estimatedUsd, expiresAt: dayBounds().end }, { transaction });
  });
  let response: any;
  try {
    response = await call(body);
  } catch (err) {
    // The provider may have processed a timeout; keep the reservation until the end of the budget day.
    throw err;
  }
  await sequelize.transaction(async transaction => {
    await logUsage({ agentId: agent.id, ticketId, model: agent.model, kind, usage: response.usage });
    await reservation.destroy({ transaction });
  });
  return response;
};
