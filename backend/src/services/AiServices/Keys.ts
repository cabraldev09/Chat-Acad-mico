import { getSecretSetting } from "../../helpers/SecretSettings";
import AiAgent from "../../models/AiAgent";

// The key and the model used for the things the system asks the AI to do by itself (draw a flow, create an agent): the key of the
// company in the settings, else the one of the first Anthropic agent.
// The provider and model of a new agent: the company that has a key connected gets an agent that works (Anthropic when both exist,
// because it is the one with prompt cache here). Without any key it starts on Anthropic and the team connects it in the settings.
export const defaultProvider = async (): Promise<{ provider: "anthropic" | "openai"; model: string }> => {
  const anthropic = (await getSecretSetting("ai_anthropic_key")) || (await AiAgent.findOne({ where: { provider: "anthropic" } as any }))?.apiKey || "";
  if (anthropic) return { provider: "anthropic", model: "claude-haiku-5-5" };
  const openai = (await getSecretSetting("ai_openai_key")) || (await AiAgent.findOne({ where: { provider: "openai" } as any }))?.apiKey || "";
  if (openai) return { provider: "openai", model: "gpt-4o-mini" };
  return { provider: "anthropic", model: "claude-haiku-5-5" };
};

export const anthropicAccess = async (): Promise<{ apiKey: string; model: string }> => {
  const agent = await AiAgent.findOne({ where: { provider: "anthropic" } as any, order: [["id", "ASC"]] });
  const apiKey = (await getSecretSetting("ai_anthropic_key")) || agent?.apiKey || "";
  return { apiKey, model: agent?.model || "claude-sonnet-5-5" };
};
