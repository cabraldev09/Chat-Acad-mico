import { getSetting } from "../../helpers/AppSettings";
import AiAgent from "../../models/AiAgent";

// The key and the model used for the things the system asks the AI to do by itself (draw a flow, create an agent): the key of the
// company in the settings, else the one of the first Anthropic agent.
export const anthropicAccess = async (): Promise<{ apiKey: string; model: string }> => {
  const agent = await AiAgent.findOne({ where: { provider: "anthropic" } as any, order: [["id", "ASC"]] });
  const apiKey = (await getSetting("ai_anthropic_key", "")) || agent?.apiKey || "";
  return { apiKey, model: agent?.model || "claude-sonnet-5-5" };
};
