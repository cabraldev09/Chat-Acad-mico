import { Op } from "sequelize";
import sequelize from "../../database";
import Setting from "../../models/Setting";
import AiAgent from "../../models/AiAgent";
import Whatsapp from "../../models/Whatsapp";
import Ticket from "../../models/Ticket";
import CopilotRequest from "../../models/CopilotRequest";
import AppError from "../../errors/AppError";
import { dayBounds, getAppTz } from "../../helpers/AppTime";
import { institutionFor, legacyInstitutionId } from "../../helpers/Institution";
import { CONFIG_KEY, CopilotConfig, defaultConfig, policyFor, upgradeSteps, validateConfig } from "./Policy";

// the agent asks in the order of this process (one order for the agent and the copilot)
const shareOrder = async (config: CopilotConfig): Promise<void> => {
  const { setQuestionOrder } = await import("../CommercialServices/Rules");
  setQuestionOrder(config.steps.map(s => s.key));
};
export const configOf = async (): Promise<CopilotConfig> => {
  const setting = await Setting.findByPk(CONFIG_KEY);
  if (!setting) return defaultConfig();
  const config = validateConfig(JSON.parse(setting.value));
  return { ...config, steps: upgradeSteps(config.steps) };
};
export const loadQuestionOrder = async (): Promise<void> => shareOrder(await configOf());
export const saveConfig = async (input: any): Promise<CopilotConfig> => {
  const config = validateConfig(input);
  if (config.agentId && !(await AiAgent.findByPk(config.agentId))) throw new AppError("ERR_COPILOT_AGENT", 400);
  const ids = Object.keys(config.connections).map(Number);
  if (ids.length && await Whatsapp.count({ where: { id: { [Op.in]: ids } } }) !== ids.length) throw new AppError("ERR_COPILOT_CONFIG", 400);
  return sequelize.transaction(async transaction => {
    await sequelize.query("SELECT pg_advisory_xact_lock(918274)", { transaction });
    const existing = await Setting.findByPk(CONFIG_KEY, { transaction });
    const previous = existing ? validateConfig(JSON.parse(existing.value)) : defaultConfig();
    if (previous.version !== config.version) throw new AppError("ERR_COPILOT_VERSION", 409);
    config.version++;
    await Setting.upsert({ key: CONFIG_KEY, value: JSON.stringify(config) }, { transaction });
    return config;
  }).then(async saved => { await shareOrder({ ...saved, steps: upgradeSteps(saved.steps) }); return saved; });
};
export const suggestionAgent = async (config: CopilotConfig, ticket: Ticket): Promise<AiAgent | null> => {
  if (config.agentId) {
    const [agent, institution, legacyId] = await Promise.all([
      AiAgent.findByPk(config.agentId),
      institutionFor({ ticket }),
      legacyInstitutionId()
    ]);
    if (!agent) return null;
    const ticketInstitutionId = institution?.id || legacyId;
    const sameInstitution = agent.institutionId
      ? agent.institutionId === ticketInstitutionId
      : ticketInstitutionId === legacyId;
    return sameInstitution ? agent : null; // a manual copilot must never cross university ownership
  }
  const { agentToQualify } = await import("../AiServices/RunAiAgent");
  return agentToQualify(ticket);
};
export const quotaOf = async (config: CopilotConfig, userId: number, connectionId: number) => {
  const where = { createdAt: { [Op.gte]: dayBounds().start, [Op.lte]: dayBounds().end } };
  const [total, user, connection] = await Promise.all([
    CopilotRequest.count({ where }), CopilotRequest.count({ where: { ...where, userId } }),
    CopilotRequest.count({ where: { ...where, whatsappId: connectionId } })
  ]);
  const rule = policyFor(config, connectionId);
  return { total: { used: total, limit: config.dailyLimit }, user: { used: user, limit: config.userDailyLimit },
    connection: { used: connection, limit: rule.dailyLimit }, timezone: getAppTz(), resetsAt: dayBounds().end };
};
export const quotaExceeded = (quota: Awaited<ReturnType<typeof quotaOf>>): boolean => [quota.total, quota.user, quota.connection].some(x => x.limit > 0 && x.used >= x.limit);
// Durable reservation under a database lock: parallel tabs, users and API workers share the same daily allowance.
export const reserveSuggestion = async (config: CopilotConfig, ticket: Ticket, userId: number, contextKey: string, extra: { kind?: string; mode?: string | null } = {}): Promise<{ request: CopilotRequest; cached: boolean }> => sequelize.transaction(async transaction => {
  await sequelize.query("SELECT pg_advisory_xact_lock(918275)", { transaction });
  const previous = await CopilotRequest.findOne({ where: { ticketId: ticket.id, contextKey, configVersion: config.version }, transaction });
  if (previous) return { request: previous, cached: true };
  if (quotaExceeded(await quotaOf(config, userId, ticket.whatsappId))) throw new AppError("ERR_COPILOT_DAILY_LIMIT", 429);
  const recent = await CopilotRequest.findOne({ where: { userId, createdAt: { [Op.gt]: new Date(Date.now() - 4000) } }, transaction });
  if (recent) throw new AppError("ERR_TOO_MANY_REQUESTS", 429);
  const request = await CopilotRequest.create({ userId, ticketId: ticket.id, whatsappId: ticket.whatsappId, contextKey, configVersion: config.version, status: "pending", kind: extra.kind || "suggestion", mode: extra.mode || null }, { transaction });
  return { request, cached: false };
});
