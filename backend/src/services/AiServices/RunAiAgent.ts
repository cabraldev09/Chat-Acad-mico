import axios from "axios";
import { Op } from "sequelize";

import AiAgent from "../../models/AiAgent";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import { getSetting } from "../../helpers/AppSettings";

export const HANDOFF_MARKER = "[HANDOFF]";

export const findAgentForTicket = async (
  ticket: Ticket
): Promise<AiAgent | null> => {
  const agents = await AiAgent.findAll({
    where: { active: true },
    order: [["id", "ASC"]]
  });
  // most specific match first: queue, then connection, then global
  const byQueue = agents.find(
    a => a.queueId && ticket.queueId && a.queueId === ticket.queueId
  );
  const byConn = agents.find(
    a => !a.queueId && a.whatsappId && a.whatsappId === ticket.whatsappId
  );
  const global = agents.find(a => !a.queueId && !a.whatsappId);
  return byQueue || byConn || global || null;
};

const buildSystemPrompt = (agent: AiAgent): string => {
  const parts = [
    agent.systemPrompt ||
      "Você é um assistente de atendimento ao cliente. Responda de forma curta, educada e objetiva, no mesmo idioma do cliente.",
    "Se você não souber a resposta, se o cliente pedir para falar com uma pessoa/atendente, ou se o assunto exigir um humano, responda APENAS com " +
      HANDOFF_MARKER +
      " e nada mais."
  ];
  if (agent.knowledgeBase) {
    parts.push(
      "Use somente a base de conhecimento abaixo para responder fatos sobre a empresa. Não invente informações.\n\n<base_de_conhecimento>\n" +
        agent.knowledgeBase +
        "\n</base_de_conhecimento>"
    );
  }
  return parts.join("\n\n");
};

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const loadHistory = async (ticket: Ticket, limit: number): Promise<ChatTurn[]> => {
  const rows = await Message.findAll({
    where: { ticketId: ticket.id, isDeleted: false, body: { [Op.ne]: "" } },
    order: [["createdAt", "DESC"]],
    limit
  });
  const turns: ChatTurn[] = [];
  for (const m of rows.reverse()) {
    const role = m.fromMe ? "assistant" : "user";
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n${m.body}`;
    else turns.push({ role, content: m.body });
  }
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns;
};

const resolveKey = async (agent: AiAgent): Promise<string> => {
  if (agent.apiKey) return agent.apiKey;
  return getSetting(`ai_${agent.provider}_key`, "");
};

export const generateReply = async (
  agent: AiAgent,
  ticket: Ticket
): Promise<string> => {
  const apiKey = await resolveKey(agent);
  if (!apiKey) throw new Error("ERR_AI_NO_API_KEY");

  const history = await loadHistory(ticket, agent.maxHistory || 12);
  if (!history.length) throw new Error("ERR_AI_NO_HISTORY");
  const system = buildSystemPrompt(agent);

  if (agent.provider === "openai") {
    const { data } = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: agent.model,
        messages: [{ role: "system", content: system }, ...history]
      },
      { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 60000 }
    );
    return (data.choices?.[0]?.message?.content || "").trim();
  }

  const { data } = await axios.post(
    "https://api.anthropic.com/v1/messages",
    { model: agent.model, max_tokens: 1024, system, messages: history },
    {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      timeout: 60000
    }
  );
  return (data.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();
};
