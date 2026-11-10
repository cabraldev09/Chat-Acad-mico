import { describe, expect, it } from "vitest";

import { Effects, StageTurn, advance, resume } from "../../../src/services/FlowServices/Engine";
import { Graph } from "../../../src/services/FlowServices/Graph";
import { cleanStage } from "../../../src/services/FlowServices/StageSpec";
import { doneSteps, isHeldExit, lockExit, markSteps, pendingSteps, pendingText, takeSteps } from "../../../src/services/FlowServices/StepLock";

const STEPS = ["Cumprimentar", "Perguntar o curso", "Perguntar a cidade"];
const stageData = { title: "Conversa", objective: "Qualificar", steps: STEPS, maxTurns: 3 };

describe("the checklist of a stage (pure rules)", () => {
  it("keeps the steps of the stage and drops empty ones", () => {
    expect(cleanStage({ ...stageData, steps: ["a", "", "  b  "] }).steps).toEqual(["a", "b"]);
    expect(cleanStage({ title: "x", objective: "y" }).steps).toEqual([]);
  });

  it("lists what is pending and accepts only real step numbers", () => {
    expect(pendingSteps({ steps: STEPS }, [])).toEqual([1, 2, 3]);
    expect(markSteps({ steps: STEPS }, [1], [2, 2, 9, 0, "x", 3.2])).toEqual([1, 2, 3]);
    expect(pendingSteps({ steps: STEPS }, [1, 3])).toEqual([2]);
    expect(pendingText({ steps: STEPS }, [2, 3])).toBe("2. Perguntar o curso | 3. Perguntar a cidade");
  });

  it("holds only the exits that end the stage on the happy path", () => {
    expect(isHeldExit("done")).toBe(true);
    expect(isHeldExit("proposta")).toBe(true);
    expect(isHeldExit("human", "qualified")).toBe(true);
    // a person asked for a person, the limit, switched off, no interest, tutoring: always pass
    ["human", "limit", "off", "sem_interesse", "tutoria", "secretaria", "follow_up"].forEach(e => expect(isHeldExit(e)).toBe(false));
    expect(lockExit({ steps: STEPS }, [1], "done").held).toBe(true);
    expect(lockExit({ steps: STEPS }, [1, 2, 3], "done").held).toBe(false);
    expect(lockExit({ steps: [] }, [], "done").held).toBe(false);
    expect(lockExit({ steps: STEPS }, [], "limit").held).toBe(false);
  });

  it("hands the note of the lock to the next turn once", () => {
    const vars: Record<string, any> = { __stepsHeld: "2. x", __steps_s: [1] };
    expect(takeSteps(vars, "s")).toEqual({ stepsDone: [1], stepsHeld: "2. x" });
    expect(takeSteps(vars, "s")).toEqual({ stepsDone: [1] });
    expect(doneSteps({}, "s")).toEqual([]);
  });
});

const graph = (): Graph => ({
  nodes: [
    { id: "st", type: "start", data: {} },
    { id: "s", type: "stage", data: stageData },
    { id: "ok", type: "message", data: { text: "Pronto!" } },
    { id: "fim", type: "end", data: {} }
  ],
  edges: [
    { id: "e1", source: "st", target: "s" },
    { id: "e2", source: "s", sourceHandle: "done", target: "ok" },
    { id: "e3", source: "ok", target: "fim" }
  ]
});

const fake = (turns: StageTurn[]) => {
  const said: string[] = [];
  const handoffs: string[] = [];
  const fx: Effects = {
    say: async t => { said.push(t); },
    readField: async () => "",
    saveField: async () => undefined,
    crm: async () => "",
    transfer: async () => undefined,
    handToAi: async () => undefined,
    close: async () => undefined,
    webhook: async () => true,
    who: () => ({ name: "Maria", first: "Maria" }),
    listPolos: async () => [],
    setPolo: async () => "",
    aiTurn: async () => turns.shift() || { text: "" },
    humanHandoff: async (_n, exit) => { handoffs.push(exit); },
    startFlow: async () => true,
    commercial: async () => undefined
  };
  return { fx, said, handoffs };
};

describe("the lock in the flow engine", () => {
  it("refuses to end the stage while a step is pending, and tells the next turn what is missing", async () => {
    const t = fake([{ text: "Que bom!", exit: "done", stepsDone: [1] }]);
    const step = await advance(graph(), "st", { nodeId: null, vars: {}, tries: 0, pending: "oi" }, t.fx);
    expect(step.status).toBe("waiting");
    expect(step.state.nodeId).toBe("s");
    expect(step.state.vars.__steps_s).toEqual([1]);
    expect(String(step.state.vars.__stepsHeld)).toContain("2. Perguntar o curso");
    expect(t.said).toEqual(["Que bom!"]);
  });

  it("lets the stage end when every step is done", async () => {
    const t = fake([{ text: "Tudo certo!", exit: "done", stepsDone: [1, 2, 3] }]);
    const step = await advance(graph(), "st", { nodeId: null, vars: {}, tries: 0, pending: "oi" }, t.fx);
    expect(step.path).toContain("ok");
    expect(t.said).toEqual(["Tudo certo!", "Pronto!"]);
  });

  it("accumulates the steps across turns", async () => {
    const t = fake([{ text: "a", stepsDone: [1] }, { text: "b", stepsDone: [1, 2] }, { text: "c", exit: "done", stepsDone: [1, 2, 3] }]);
    let step = await advance(graph(), "st", { nodeId: null, vars: {}, tries: 0, pending: "oi" }, t.fx);
    step = await resume(graph(), step.state, "curso", t.fx);
    expect(step.state.vars.__steps_s).toEqual([1, 2]);
    step = await resume(graph(), step.state, "cidade", t.fx);
    expect(step.path).toContain("ok");
  });

  it("never traps the person: a request for a person and the limit of turns pass with steps pending, and the team is told what was left", async () => {
    const t = fake([{ text: "Vou chamar alguém.", exit: "human" }]);
    const step = await advance(graph(), "st", { nodeId: null, vars: {}, tries: 0, pending: "quero falar com uma pessoa" }, t.fx);
    expect(step.status).toBe("handoff");
    expect(t.handoffs).toEqual(["human"]);
    expect(String(step.state.vars.__stepsMissing)).toContain("1. Cumprimentar");

    const t2 = fake([{ text: "1" }, { text: "2" }, { text: "3" }]);
    let s2 = await advance(graph(), "st", { nodeId: null, vars: {}, tries: 0, pending: "oi" }, t2.fx);
    s2 = await resume(graph(), s2.state, "a", t2.fx);
    s2 = await resume(graph(), s2.state, "b", t2.fx);
    s2 = await resume(graph(), s2.state, "c", t2.fx);
    expect(s2.status).toBe("handoff");
    expect(t2.handoffs).toEqual(["limit"]);
  });

  it("holds a qualified handover but not a human exit of another cause", async () => {
    const held = await advance(graph(), "st", { nodeId: null, vars: {}, tries: 0, pending: "oi" }, fake([{ text: "x", exit: "human", why: "qualified" }]).fx);
    expect(held.status).toBe("waiting");
    const free = await advance(graph(), "st", { nodeId: null, vars: {}, tries: 0, pending: "oi" }, fake([{ text: "x", exit: "human", why: "loop" }]).fx);
    expect(free.status).toBe("handoff");
  });

  it("a stage without steps works as before", async () => {
    const g = graph();
    g.nodes[1] = { id: "s", type: "stage", data: { title: "Conversa", objective: "Qualificar" } };
    const step = await advance(g, "st", { nodeId: null, vars: {}, tries: 0, pending: "oi" }, fake([{ text: "ok", exit: "done" }]).fx);
    expect(step.path).toContain("ok");
  });
});
