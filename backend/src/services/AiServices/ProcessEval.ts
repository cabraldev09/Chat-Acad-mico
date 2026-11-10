import { Op } from "sequelize";

import AiAgent from "../../models/AiAgent";
import ChatFlow from "../../models/ChatFlow";
import Polo from "../../models/Polo";
import { getSetting, setSetting } from "../../helpers/AppSettings";
import { parseGraph } from "../FlowServices/Graph";
import { RunState, StepResult, advance, firstNode, resume } from "../FlowServices/Engine";
import { simEffects } from "../FlowServices/Effects";
import { offeredCourses } from "../CommercialServices/Academic";
import { logger } from "../../utils/logger";

// The weekly check of the commercial process with the REAL model of the agent: a few scripted leads talk to the published script in the
// simulator (nothing is sent or saved) and plain rules say whether the agent still presented itself, asked in order, never said a price,
// explained the format of a semipresencial course before the consultant and handed over. The report is kept per agent.
export interface ScenarioResult {
  name: string;
  ok: boolean;
  problems: string[];
  transcript: Array<{ from: "lead" | "agente"; text: string }>;
  handedOver: boolean;
}
export interface ProcessReport {
  at: string;
  agentId: number;
  ok: boolean;
  error?: string;
  results: ScenarioResult[];
}

const keyOf = (agentId: number): string => `ai_process_eval_${agentId}`;
const MONEY = /R\$\s?\d|\d+[.,]?\d*\s?%\s*(de\s+)?(desconto|bolsa)|mensalidade\s+(de|é|e)\s+\d/i;

interface Scenario {
  name: string;
  say: string[];
  check: (r: { replies: string[][]; all: string; handedOver: boolean }) => string[];
}

const run = async (graph: ReturnType<typeof parseGraph>, agent: AiAgent, flowId: number, say: string[], polos: Array<{ id: number; name: string; city: string }>): Promise<{ replies: string[][]; transcript: ScenarioResult["transcript"]; handedOver: boolean }> => {
  const { fx, messages, actions, routes } = simEffects({ name: "Lead de teste", polos }, { agent, flowId });
  const start = firstNode(graph);
  let state: RunState | null = null;
  let step: StepResult | null = null;
  const replies: string[][] = [];
  const transcript: ScenarioResult["transcript"] = [];
  for (const input of say) {
    const mark = messages.length;
    transcript.push({ from: "lead", text: input.slice(0, 600) });
    // eslint-disable-next-line no-await-in-loop
    step = state ? await resume(graph, state, input, fx) : await advance(graph, start ? start.id : null, { nodeId: null, vars: {}, tries: 0, pending: input }, fx);
    state = step.state;
    const got = messages.slice(mark);
    replies.push(got);
    got.forEach(t => transcript.push({ from: "agente", text: String(t).slice(0, 600) }));
    if (step.status === "done" || step.status === "handoff") break;
  }
  const handedOver = !!step && step.status === "handoff" || routes.length > 0 || actions.some(a => /^(Encaminha|Transfere)/.test(a));
  return { replies, transcript, handedOver };
};

export const runProcessEval = async (agent: AiAgent): Promise<ProcessReport> => {
  const report: ProcessReport = { at: new Date().toISOString(), agentId: agent.id, ok: false, results: [] };
  const flow = await ChatFlow.findOne({ where: { kind: "agent", agentId: agent.id, status: "published" }, order: [["id", "DESC"]] });
  if (!flow) {
    report.error = "O agente não tem roteiro publicado: publique o roteiro para a avaliação rodar.";
    await setSetting(keyOf(agent.id), JSON.stringify(report));
    return report;
  }
  const graph = parseGraph(flow.published);
  const courses = await offeredCourses();
  const course = courses.find(c => !/semi/i.test(String(c.modality || ""))) || courses[0];
  const semi = courses.find(c => /semi/i.test(String(c.modality || "")));
  const poloRows = await Polo.findAll({ where: { active: true, city: { [Op.ne]: null } } as any, attributes: ["id", "name", "city"], limit: 50 });
  const polos = poloRows.map(p => ({ id: p.id, name: p.name, city: String(p.city || "") })).filter(p => p.city);
  const city = polos[0] ? polos[0].city : "Porto Velho";
  if (!course) {
    report.error = "Não há cursos ativos no cadastro: a avaliação precisa de pelo menos um.";
    await setSetting(keyOf(agent.id), JSON.stringify(report));
    return report;
  }
  const presents = (t: string) => /assistente virtual|sou (a|o) /i.test(t);
  const scenarios: Scenario[] = [
    {
      name: "Abertura: se apresenta e pergunta",
      say: ["oi"],
      check: r => [...(!presents((r.replies[0] || []).join(" ")) ? ["A primeira resposta não apresenta a assistente virtual."] : []), ...(!/\?/.test((r.replies[0] || []).join(" ")) ? ["A primeira resposta não termina com uma pergunta."] : [])]
    },
    {
      name: "Oi repetido: não se apresenta de novo",
      say: ["oi", "oi"],
      check: r => [...(presents((r.replies[1] || []).join(" ")) ? ["Na segunda saudação ela se apresentou de novo."] : []), ...(!(r.replies[1] || []).length ? ["A segunda saudação ficou sem resposta."] : [])]
    },
    {
      name: "Preço: nunca diz valor, passa para o consultor",
      say: ["oi", `quanto custa a mensalidade de ${course.name}?`],
      check: r => [...(MONEY.test(r.all) ? ["Falou um valor ou desconto."] : []), ...(!r.handedOver ? ["Não passou a conversa para o consultor depois da pergunta de preço."] : [])]
    },
    {
      name: "Jornada completa até o consultor",
      say: ["oi", `quero fazer ${course.name}`, `moro em ${city}`, "nunca fiz faculdade", "como funciona o curso?", "entendi, tudo certo", "quero seguir com a matrícula"],
      check: r => [...(MONEY.test(r.all) ? ["Falou um valor ou desconto."] : []), ...(!r.handedOver ? ["Chegou ao fim sem passar para o consultor."] : []), ...(r.replies.some(x => !x.length) ? ["Alguma mensagem ficou sem resposta."] : [])]
    },
    ...(semi
      ? [{
          name: `Semipresencial (${semi.name}): explica o formato e o MEC antes do consultor`,
          say: ["oi", `quero fazer ${semi.name}`, `moro em ${city}`, "primeira graduação", "certo", "pode me passar para o consultor"],
          check: (r: { replies: string[][]; all: string; handedOver: boolean }) => (/MEC|presencia|síncron/i.test(r.all) ? [] : ["Não explicou o formato e a regra do MEC do curso semipresencial."])
        }]
      : [])
  ];
  for (const sc of scenarios) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const out = await run(graph, agent, flow.id, sc.say, polos);
      const all = out.replies.flat().join("\n");
      const problems = sc.check({ replies: out.replies, all, handedOver: out.handedOver });
      report.results.push({ name: sc.name, ok: !problems.length, problems, transcript: out.transcript, handedOver: out.handedOver });
    } catch (err) {
      const msg = String((err as any)?.response?.data?.error?.message || (err as any)?.message || err).slice(0, 200);
      report.results.push({ name: sc.name, ok: false, problems: [`O agente não respondeu: ${msg}`], transcript: [], handedOver: false });
    }
  }
  report.ok = report.results.every(r => r.ok);
  await setSetting(keyOf(agent.id), JSON.stringify(report));
  return report;
};

export const lastProcessEval = async (agentId: number): Promise<ProcessReport | null> => {
  try {
    const raw = await getSetting(keyOf(agentId), "");
    return raw ? (JSON.parse(raw) as ProcessReport) : null;
  } catch (e) {
    return null;
  }
};

// once a week for every active agent with a published script (Setting ai_process_eval = "0" turns it off)
const WEEK = 7 * 86400000;
const tick = async (): Promise<void> => {
  try {
    if ((await getSetting("ai_process_eval", "1")) === "0") return;
    const agents = await AiAgent.findAll({ where: { active: true } as any });
    for (const agent of agents) {
      // eslint-disable-next-line no-await-in-loop
      const last = await lastProcessEval(agent.id);
      if (last && Date.now() - new Date(last.at).getTime() < WEEK) continue;
      // eslint-disable-next-line no-await-in-loop
      if (!(await ChatFlow.count({ where: { kind: "agent", agentId: agent.id, status: "published" } }))) continue;
      // eslint-disable-next-line no-await-in-loop
      const r = await runProcessEval(agent);
      logger.info(`Avaliação semanal do agente ${agent.name}: ${r.ok ? "tudo certo" : `${r.results.filter(x => !x.ok).length} problema(s)`}`);
    }
  } catch (err) {
    logger.warn(`process eval tick failed: ${err}`);
  }
};

export const startProcessEval = (): void => {
  setInterval(tick, Number(process.env.PROCESS_EVAL_MS) || 6 * 3600000).unref?.();
};
