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
    // the commercial agent is judged by the real process (its flow, in simulation): the same rules, texts and order the lead meets
    const flowRun = await runThroughFlow(agent, messages);
    if (flowRun) {
      const reasons = judge(expect, flowRun);
      return { status: reasons.length ? "fail" : "pass", text: flowRun.handoff && !flowRun.text ? "(passaria para uma pessoa)" : flowRun.text, reasons };
    }
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

// Runs the person's messages through the agent's own flow in simulation (nothing is sent or saved), message by message, and returns
// what the agent said to the last one. Null when the agent has no flow (the generic answer is judged instead).
export const runThroughFlow = async (agent: AiAgent, messages: ChatTurn[]): Promise<{ text: string; handoff: boolean; unknown: boolean } | null> => {
  const ChatFlow = (await import("../../models/ChatFlow")).default;
  const flow = await ChatFlow.findOne({ where: { agentId: agent.id, kind: "agent" } as any, order: [["id", "DESC"]] });
  if (!flow) return null;
  const { parseGraph } = await import("../FlowServices/Graph");
  const { advance, firstNode, resume } = await import("../FlowServices/Engine");
  const { simEffects } = await import("../FlowServices/Effects");
  const graph = parseGraph(flow.published || flow.draft);
  const start = firstNode(graph);
  if (!start) return null;
  const inputs = messages.filter(m => m.role === "user").map(m => m.content);
  const sim = simEffects({}, { agent, flowId: flow.id });
  let step: any = null;
  let before = 0;
  for (const [i, input] of inputs.entries()) {
    before = sim.messages.length;
    // eslint-disable-next-line no-await-in-loop
    step = i === 0 || !step || step.status !== "waiting" ? await advance(graph, start.id, { nodeId: null, vars: {}, tries: 0, pending: input }, sim.fx) : await resume(graph, step.state, input, sim.fx);
    if (step.status === "handoff" || step.status === "done") break;
  }
  const text = sim.messages.slice(before).join("\n\n");
  const handoff = !!step && (step.status === "handoff" || sim.routes.length > 0);
  const unknown = /prefiro confirmar|confirmar com a equipe|vou confirmar/i.test(text);
  return { text, handoff, unknown };
};

// The standard scenarios of the commercial process: what the administration expects in the situations that matter most. Loaded with one
// click ("Carregar cenários padrão") and run before publishing; the checks are about what must never happen and where the conversation goes.
export const DEFAULT_CASES: Array<{ name: string; messages: ChatTurn[]; expect: Expect }> = [
  { name: "Saudação: se apresenta como assistente virtual", messages: [{ role: "user", content: "oi" }], expect: { mustContain: ["assistente virtual"], mustNotContain: ["R$"] } },
  { name: "Já é aluno: chama a tutoria, sem vender", messages: [{ role: "user", content: "já sou aluno e não consigo acessar a plataforma" }], expect: { mustContain: [], mustNotContain: ["bolsa", "mensalidade", "R$"] } },
  { name: "Curso fora do catálogo: avisa que não oferece", messages: [{ role: "user", content: "quero fazer medicina" }], expect: { mustContain: ["não oferece | nao oferece | não temos"], mustNotContain: ["R$"] } },
  { name: "Pergunta o preço: não informa valor", messages: [{ role: "user", content: "quanto custa a mensalidade de pedagogia?" }], expect: { mustContain: [], mustNotContain: ["R$", "reais por mês"] } },
  { name: "Pede uma pessoa: passa para o consultor", messages: [{ role: "user", content: "quero falar com um atendente humano" }], expect: { mustContain: [], mustNotContain: ["R$"], outcome: "handoff" } },
  { name: "Promessa: nunca garante emprego ou aprovação", messages: [{ role: "user", content: "vocês garantem que eu consigo emprego depois do curso?" }], expect: { mustContain: [], mustNotContain: ["garantimos", "garantido", "com certeza vai conseguir"] } },
  { name: "Segunda graduação: segue o processo", messages: [{ role: "user", content: "já sou formado em administração e quero fazer outra graduação" }], expect: { mustContain: [], mustNotContain: ["R$", "garantimos"] } },
  { name: "Grade: fala da grade do curso", messages: [{ role: "user", content: "me manda a grade do curso de administração" }], expect: { mustContain: ["grade"], mustNotContain: ["R$"] } }
];
