import AiAgent from "../../models/AiAgent";
import AiEvalCase from "../../models/AiEvalCase";
import { norm } from "./Kb";
import { respond, ChatTurn } from "./RunAiAgent";

export type Outcome = "answer" | "handoff" | "unknown";

export interface Expect {
  // each item is a phrase; "a | b" accepts either
  mustContain: string[];
  mustNotContain: string[];
  outcome?: Outcome;
}

const phrases = (raw: any): string[] =>
  (Array.isArray(raw) ? raw : String(raw || "").split("\n"))
    .map((p: any) => String(p).trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 12);

export const cleanExpect = (raw: any): Expect => ({
  mustContain: phrases(raw?.mustContain),
  mustNotContain: phrases(raw?.mustNotContain),
  ...(["answer", "handoff", "unknown"].includes(raw?.outcome) ? { outcome: raw.outcome as Outcome } : {})
});

export const cleanMessages = (raw: any): ChatTurn[] => {
  const turns: ChatTurn[] = (Array.isArray(raw) ? raw : [])
    .filter((m: any) => m && ["user", "assistant"].includes(m.role) && String(m.content || "").trim())
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
    .slice(-20);
  // the case ends with the person's message: the answer to it is what is judged
  while (turns.length && turns[turns.length - 1].role !== "user") turns.pop();
  return turns;
};

const has = (haystack: string, phrase: string): boolean => phrase.split("|").map(p => norm(p)).filter(Boolean).some(p => haystack.includes(p));

// Plain checks, no model as a judge: the same case gives the same verdict until the agent changes
export const judge = (expect: Expect, answer: { text: string; handoff: boolean; unknown: boolean }): string[] => {
  const reasons: string[] = [];
  const outcome: Outcome = answer.handoff ? "handoff" : answer.unknown ? "unknown" : "answer";
  if (expect.outcome && expect.outcome !== outcome) reasons.push(`Era esperado ${LABEL[expect.outcome]}, mas o agente ${LABEL_DID[outcome]}.`);
  const text = norm(answer.text);
  for (const p of expect.mustContain) if (!has(text, p)) reasons.push(`A resposta deveria conter “${p}”.`);
  for (const p of expect.mustNotContain) if (has(text, p)) reasons.push(`A resposta não podia conter “${p}”.`);
  return reasons;
};

const LABEL: Record<Outcome, string> = { answer: "uma resposta", handoff: "passar para uma pessoa", unknown: "confirmar com a equipe" };
const LABEL_DID: Record<Outcome, string> = { answer: "respondeu", handoff: "passou para uma pessoa", unknown: "disse que vai confirmar com a equipe" };

export const runCase = async (agent: AiAgent, row: AiEvalCase): Promise<{ status: "pass" | "fail"; text: string; reasons: string[] }> => {
  let messages: ChatTurn[] = [];
  let expect: Expect = { mustContain: [], mustNotContain: [] };
  try {
    messages = cleanMessages(JSON.parse(row.messages));
    expect = cleanExpect(JSON.parse(row.expect));
  } catch (e) {
    return { status: "fail", text: "", reasons: ["O caso salvo está inválido."] };
  }
  if (!messages.length) return { status: "fail", text: "", reasons: ["O caso não tem mensagem da pessoa."] };
  try {
    const result = await respond(agent, { ticket: null, history: messages, collected: {}, summary: null, sandbox: true });
    const text = result.handoff ? "(passaria para uma pessoa)" : result.unknown ? "(confirmaria com a equipe)" : result.text;
    const reasons = judge(expect, { text: result.text, handoff: result.handoff, unknown: result.unknown });
    return { status: reasons.length ? "fail" : "pass", text, reasons };
  } catch (err) {
    // the provider refused (key, balance, model): the whole run says so, it is not a verdict on the case
    if ((err as any)?.response || (err as any)?.message === "ERR_AI_NO_API_KEY") throw err;
    return { status: "fail", text: "", reasons: [`O agente não respondeu: ${String((err as any)?.message || err).slice(0, 120)}`] };
  }
};
