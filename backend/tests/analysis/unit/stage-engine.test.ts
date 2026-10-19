import { describe, expect, it } from "vitest";

import { Effects, StageTurn, advance, resume } from "../../../src/services/FlowServices/Engine";
import { Graph, validateGraph } from "../../../src/services/FlowServices/Graph";
import { checkField, cleanStage } from "../../../src/services/FlowServices/StageSpec";

// An AI stage inside a flow: the AI talks until a goal is reached, then the flow follows the exit it chose.
const stage = (data: any = {}) => ({ id: "s", type: "stage", data: { title: "Conversa", objective: "Descobrir o curso", ...data } });
const graph = (stageData: any = {}, extra: any[] = [], edges: any[] = []): Graph => ({
  nodes: [{ id: "st", type: "start", data: {} }, stage(stageData), { id: "ok", type: "message", data: { text: "Pronto!" } }, { id: "fim", type: "end", data: {} }, ...extra],
  edges: [
    { id: "e1", source: "st", target: "s" },
    { id: "e2", source: "s", sourceHandle: "done", target: "ok" },
    { id: "e3", source: "ok", target: "fim" },
    ...edges
  ]
});

const fake = (turns: StageTurn[]) => {
  const said: string[] = [];
  const calls: any[] = [];
  const handoffs: string[] = [];
  const saved: Record<string, string> = {};
  const fx: Effects = {
    say: async t => { said.push(t); },
    readField: async () => "",
    saveField: async (k, v) => { saved[k] = v; },
    crm: async () => "",
    transfer: async () => undefined,
    handToAi: async () => undefined,
    close: async () => undefined,
    webhook: async () => true,
    who: () => ({ name: "Maria Souza", first: "Maria" }),
    listPolos: async () => [],
    setPolo: async () => "",
    aiTurn: async a => { calls.push(a); return turns.shift() || { text: "" }; },
    humanHandoff: async (_n, exit) => { handoffs.push(exit); },
    startFlow: async () => true
  };
  return { fx, said, calls, handoffs, saved };
};

describe("AI stage in the flow engine", () => {
  it("answers the message that started the run and waits for the next one", async () => {
    const t = fake([{ text: "Oi, Maria! Qual curso você quer?" }]);
    const state = { nodeId: null, vars: {}, tries: 0, pending: "oi, quero estudar" };
    const step = await advance(graph(), "st", state, t.fx);
    expect(step.status).toBe("waiting");
    expect(step.state.nodeId).toBe("s");
    expect(t.calls[0].input).toBe("oi, quero estudar");
    expect(t.said).toEqual(["Oi, Maria! Qual curso você quer?"]);
    expect(step.path).toContain("s");
  });

  it("speaks first with the fixed opening and does not spend a turn of the AI", async () => {
    const t = fake([]);
    const step = await advance(graph({ opening: "Olá! Posso ajudar a escolher o curso?" }), "st", { nodeId: null, vars: {}, tries: 0 }, t.fx);
    expect(step.status).toBe("waiting");
    expect(t.calls).toHaveLength(0);
    expect(t.said).toEqual(["Olá! Posso ajudar a escolher o curso?"]);
  });

  it("asks the AI to open when there is no opening text and nobody wrote yet", async () => {
    const t = fake([{ text: "Olá! Sou o assistente." }]);
    await advance(graph(), "st", { nodeId: null, vars: {}, tries: 0 }, t.fx);
    expect(t.calls[0].input).toBeNull();
  });

  it("keeps the fields it found and follows the exit 'done'", async () => {
    const t = fake([{ text: "Anotei: Pedagogia.", collected: { curso: "Pedagogia" }, exit: "done" }]);
    const state = { nodeId: "s", vars: {}, tries: 0 };
    const step = await resume(graph(), state, "Pedagogia", t.fx);
    expect(step.status).toBe("done");
    expect(step.state.vars.curso).toBe("Pedagogia");
    expect(t.saved.curso).toBe("Pedagogia");
    expect(t.said).toEqual(["Anotei: Pedagogia.", "Pronto!"]);
    expect(step.path).toEqual(["s", "ok", "fim"]);
  });

  it("takes the exit by intention the AI chose", async () => {
    const g = graph({ outcomes: [{ id: "precos", label: "Quer preços", when: "quando perguntar o valor" }] }, [{ id: "p", type: "message", data: { text: "Vou falar de valores." } }], [{ id: "e9", source: "s", sourceHandle: "precos", target: "p" }, { id: "e10", source: "p", target: "fim" }]);
    const t = fake([{ text: "", exit: "precos" }]);
    const step = await resume(g, { nodeId: "s", vars: {}, tries: 0 }, "quanto custa?", t.fx);
    expect(t.said).toEqual(["Vou falar de valores."]);
    expect(step.status).toBe("done");
  });

  it("hands over to the team when the exit chosen is not connected", async () => {
    const t = fake([{ text: "", exit: "human" }]);
    const step = await resume(graph(), { nodeId: "s", vars: {}, tries: 0 }, "quero falar com alguém", t.fx);
    expect(step.status).toBe("handoff");
    expect(t.handoffs).toEqual(["human"]);
  });

  it("stops at the turn limit without calling the AI again", async () => {
    const t = fake([]);
    const state = { nodeId: "s", vars: { __turns_s: 2 }, tries: 0 };
    const step = await resume(graph({ maxTurns: 2 }), state, "mais uma", t.fx);
    expect(t.calls).toHaveLength(0);
    expect(step.status).toBe("handoff");
    expect(t.handoffs).toEqual(["limit"]);
  });

  it("counts the turns of each stage", async () => {
    const t = fake([{ text: "a" }, { text: "b" }]);
    const state = { nodeId: "s", vars: {}, tries: 0 };
    await resume(graph(), state, "1", t.fx);
    await resume(graph(), state, "2", t.fx);
    expect(state.vars.__turns_s).toBe(2);
  });

  it("starts another flow with the block 'Chamar fluxo'", async () => {
    const g: Graph = { nodes: [{ id: "st", type: "start", data: {} }, { id: "f", type: "flow", data: { flowId: 7 } }], edges: [{ id: "e", source: "st", target: "f" }] };
    const t = fake([]);
    let started = 0;
    t.fx.startFlow = async id => { started = id; return true; };
    const step = await advance(g, "st", { nodeId: null, vars: {}, tries: 0 }, t.fx);
    expect(started).toBe(7);
    expect(step.status).toBe("done");
  });
});

describe("validation of an AI stage", () => {
  const issues = (g: Graph, kind = "agent") => validateGraph(g, { hasAiAgent: true, kind }).filter(i => i.level === "error").map(i => i.text);

  it("accepts a stage with a goal and its exit connected", () => {
    expect(issues(graph())).toEqual([]);
  });
  it("asks for the goal of the stage", () => {
    expect(issues(graph({ objective: "" })).some(t => /objetivo/.test(t))).toBe(true);
  });
  it("an agent needs at least one AI stage", () => {
    const g: Graph = { nodes: [{ id: "st", type: "start", data: {} }, { id: "m", type: "message", data: { text: "oi" } }], edges: [{ id: "e", source: "st", target: "m" }] };
    expect(issues(g)).toContain("O agente precisa de pelo menos uma Etapa com IA.");
    expect(issues(g, "flow")).not.toContain("O agente precisa de pelo menos uma Etapa com IA.");
  });
  it("refuses repeated fields, a choice without options and an outcome named like a fixed exit", () => {
    expect(issues(graph({ fields: [{ key: "a", label: "A" }, { key: "a", label: "A" }] })).length).toBeGreaterThan(0);
    expect(issues(graph({ fields: [{ key: "c", label: "C", type: "choice", options: [] }] })).some(t => /opções/.test(t))).toBe(true);
    expect(issues(graph({ outcomes: [{ id: "done", label: "x", when: "y" }] })).length).toBeGreaterThan(0);
  });
  it("an external tool needs an address and an explanation", () => {
    expect(issues(graph({ http: [{ name: "agenda", description: "", url: "ftp://x" }] })).length).toBeGreaterThanOrEqual(2);
  });
  it("the outcomes by intention must be connected", () => {
    expect(issues(graph({ outcomes: [{ id: "precos", label: "Preços", when: "quando perguntar o valor" }] })).some(t => /saída/.test(t))).toBe(true);
  });
  it("the block 'Chamar fluxo' needs a flow", () => {
    const g: Graph = { nodes: [{ id: "st", type: "start", data: {} }, { id: "f", type: "flow", data: {} }], edges: [{ id: "e", source: "st", target: "f" }] };
    expect(issues(g, "flow").some(t => /fluxo/.test(t))).toBe(true);
  });
});

describe("cleaning the data of a stage", () => {
  it("keeps only what is known, with sane sizes", () => {
    const c = cleanStage({
      objective: "x".repeat(900),
      fields: [{ label: "Cidade onde mora", required: true }, { key: "tel", type: "phone" }, { key: "tel", type: "text" }, { label: "" }],
      tools: ["buscar_curso", "apagar_tudo"],
      http: [{ name: "Agenda Hoje!", url: "https://x.test", method: "post", params: [{ name: "Data Do Dia", type: "number" }] }],
      outcomes: [{ label: "Quer Preços", when: "valor" }, { id: "done", label: "x" }],
      maxTurns: 999
    });
    expect(c.objective).toHaveLength(600);
    expect(c.fields.map(f => f.key)).toEqual(["cidade_onde_mora", "tel"]);
    expect(c.tools).toEqual(["buscar_curso"]);
    expect(c.http[0]).toMatchObject({ name: "agenda_hoje", method: "POST" });
    expect(c.http[0].params[0]).toMatchObject({ name: "data_do_dia", type: "number" });
    expect(c.outcomes.map(o => o.id)).toEqual(["quer_precos"]);
    expect(c.maxTurns).toBe(50);
  });
  it("checks the value of a field by its type", () => {
    expect(checkField({ key: "e", label: "E", type: "email", required: true }, "Maria@X.com")).toBe("maria@x.com");
    expect(checkField({ key: "e", label: "E", type: "email", required: true }, "maria")).toBeNull();
    expect(checkField({ key: "t", label: "T", type: "phone", required: true }, "(69) 99999-0000")).toBe("69999990000");
    expect(checkField({ key: "c", label: "C", type: "choice", required: true, options: ["EAD", "Semipresencial"] }, "ead")).toBe("EAD");
    expect(checkField({ key: "c", label: "C", type: "choice", required: true, options: ["EAD"] }, "presencial")).toBeNull();
  });
});
