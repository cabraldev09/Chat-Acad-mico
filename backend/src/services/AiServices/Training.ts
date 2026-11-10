import axios from "axios";

import AiAgent from "../../models/AiAgent";
import AiRule from "../../models/AiRule";
import { getSecretSetting } from "../../helpers/SecretSettings";
import { logUsage } from "./Usage";
import { withRetry } from "./Provider";
import { KINDS, Proposal, RuleKind, formatTraining, parseProposals } from "./TrainingText";

export { KINDS, MAX_EXAMPLES, MAX_RULES, formatTraining, parseJson, parseProposals } from "./TrainingText";
export type { Proposal, RuleKind } from "./TrainingText";

// What the owner taught the agent (by talking to it or from a file) and how it reaches the prompt: the rules of the trainer are in EVERY answer.

const cache = new Map<number, { at: number; text: string }>();
const TTL = 20000;

export const invalidateTraining = (agentId: number): void => {
  cache.delete(agentId);
};

export const trainingBlock = async (agentId: number): Promise<string> => {
  const hit = cache.get(agentId);
  if (hit && Date.now() - hit.at < TTL) return hit.text;
  const rows = await AiRule.findAll({ where: { agentId, active: true }, order: [["position", "ASC"], ["id", "ASC"]] });
  const text = formatTraining(rows);
  cache.set(agentId, { at: Date.now(), text });
  return text;
};

// ---------------------------------------------------------------- the model, for the trainer's own calls (not for answering customers)

const ANTHROPIC_URL = () => process.env.ANTHROPIC_API_URL || "https://api.anthropic.com";
const OPENAI_URL = () => process.env.OPENAI_API_URL || "https://api.openai.com";

export const askModel = async (agent: AiAgent, system: string, messages: Array<{ role: "user" | "assistant"; content: string }>, maxTokens = 1200): Promise<string> => {
  const apiKey = agent.apiKey || (await getSecretSetting(`ai_${agent.provider}_key`));
  if (!apiKey) throw new Error("ERR_AI_NO_API_KEY");
  if (agent.provider === "openai") {
    const data = await withRetry(async compat => (await axios.post(
      `${OPENAI_URL()}/v1/chat/completions`,
      { model: agent.model, ...(compat ? { max_tokens: maxTokens } : { max_completion_tokens: maxTokens }), messages: [{ role: "system", content: system }, ...messages] },
      { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 90000 }
    )).data);
    await logUsage({ agentId: agent.id, model: agent.model, kind: "test", usage: data.usage });
    return String(data.choices?.[0]?.message?.content || "").trim();
  }
  const data = await withRetry(async () => (await axios.post(
    `${ANTHROPIC_URL()}/v1/messages`,
    { model: agent.model, max_tokens: maxTokens, system, messages },
    { headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" }, timeout: 90000 }
  )).data);
  await logUsage({ agentId: agent.id, model: agent.model, kind: "test", usage: data.usage });
  return (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
};

// ---------------------------------------------------------------- the trainer chat

const COACH_FORMAT = [
  "Responda SEMPRE com um único objeto JSON, sem texto fora dele:",
  '{"reply":"o que você diz ao dono","propose":[{"kind":"regra|exemplo|estilo","text":"..."}]}',
  "- reply: se o dono pediu para você simular um atendimento, responda como atenderia o cliente (no seu jeito de WhatsApp); se ele deu uma ordem, confirme em UMA frase curta o que entendeu.",
  "- propose: só o que o dono ENSINOU de forma explícita nesta mensagem. kind=regra é uma ordem curta e clara no imperativo (\"Nunca fale preço antes de saber o curso\"); kind=estilo é o jeito de falar (tom, tamanho, saudação); kind=exemplo é uma pergunta de cliente com a resposta ideal, no formato \"Cliente: ...\\nResposta: ...\". Uma ideia por item, sem repetir o que já está nas regras atuais. Se ele só conversou ou pediu uma simulação, propose = []."
].join("\n");

export const coachTurn = async (agent: AiAgent, messages: Array<{ role: "user" | "assistant"; content: string }>): Promise<{ reply: string; proposed: Proposal[] }> => {
  const current = await trainingBlock(agent.id);
  const system = [
    agent.systemPrompt || "Você é um assistente de atendimento de uma instituição de ensino.",
    `Você é o agente "${agent.name}" em MODO TREINAMENTO: quem conversa com você agora é o DONO, que está te ensinando como atender. Não é um cliente.`,
    current ? `Regras que você já aprendeu:\n${current}` : "Você ainda não aprendeu nenhuma regra.",
    COACH_FORMAT
  ].join("\n\n");
  const history = messages.slice(-20).map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
  const raw = await askModel(agent, system, history, 900);
  return parseProposals(raw);
};

// The tester conversation turned into lessons: what the owner corrected becomes rules, a good answer becomes an example.
export const fromConversation = async (agent: AiAgent, messages: Array<{ role: "user" | "assistant"; content: string }>): Promise<Proposal[]> => {
  const transcript = messages
    .slice(-40)
    .map(m => `${m.role === "user" ? "Cliente/dono" : "Agente"}: ${String(m.content).slice(0, 1200)}`)
    .join("\n");
  const system = [
    "Você analisa uma conversa de teste entre o dono de um atendimento e o agente e extrai o que o agente deve aprender.",
    "Responda SOMENTE com um objeto JSON: {\"propose\":[{\"kind\":\"regra|exemplo|estilo\",\"text\":\"...\"}]}",
    "- regra: ordem curta no imperativo derivada do que o dono pediu ou corrigiu.",
    "- estilo: jeito de falar (tom, tamanho, saudação) que aparece nas boas respostas ou pedidos do dono.",
    "- exemplo: \"Cliente: ...\\nResposta: ...\" só para respostas que o dono aprovou ou ditou.",
    "Máximo de 8 itens, sem repetir, sem dados pessoais."
  ].join("\n");
  const raw = await askModel(agent, system, [{ role: "user", content: transcript }], 1000);
  return parseProposals(raw).proposed;
};
