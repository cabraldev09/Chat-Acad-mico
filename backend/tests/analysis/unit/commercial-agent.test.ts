import { describe, expect, it, vi } from "vitest";

// the block builder imports the model of the old chatbot only to convert it; here no database is needed
vi.mock("../../../src/models/ChatbotNode", () => ({ default: {} }));

import { validateGraph } from "../../../src/services/FlowServices/Graph";
import { cleanStage } from "../../../src/services/FlowServices/StageSpec";
import { COMMERCIAL_KB, COMMERCIAL_PERSONA, COMMERCIAL_TEMPLATE_KEY, commercialGraph } from "../../../src/services/CommercialServices/Template";
import { isGreeting, openingText, stageFieldsDone } from "../../../src/services/CommercialServices/Rules";

// The ready agent "Comercial — Graduação" (the run in the simulator, with the funnel moving, is in the end-to-end checks).

describe("the template Comercial — Graduação", () => {
  it("has the key and a persona that forbids inventing", () => {
    expect(COMMERCIAL_TEMPLATE_KEY).toBe("graduacao_comercial_cruzeiro");
    expect(COMMERCIAL_PERSONA.systemPrompt).toMatch(/Nunca invente/);
    expect(COMMERCIAL_PERSONA.forbidden).toMatch(/valor de mensalidade, bolsa/);
  });

  it("has a valid graph: every exit connected, no errors, human names on the blocks", () => {
    const g = commercialGraph();
    const issues = validateGraph(g, { hasAiAgent: true, kind: "agent" });
    expect(issues.filter(i => i.level === "error")).toEqual([]);
    expect(issues.filter(i => i.level === "warning")).toEqual([]);
    g.nodes.filter(n => n.type !== "start").forEach(n => expect(String(n.data?.title || ""), n.id).not.toMatch(/stage_|condition_/));
    expect(g.nodes.filter(n => n.type === "stage").every(n => cleanStage(n.data).hooks.includes("commercial"))).toBe(true);
  });

  it("is laid out: no two blocks on the same place", () => {
    const g = commercialGraph();
    const spots = new Set(g.nodes.map(n => `${(n as any).x}:${(n as any).y}`));
    expect(spots.size).toBe(g.nodes.length);
  });

  it("only seeds the texts that the institution dictated", () => {
    const titles = COMMERCIAL_KB.map(k => k.topic);
    expect(titles).toEqual(expect.arrayContaining(["institutional/tutoring", "institutional/platform", "institutional/internship", "institutional/mec"]));
    // faculty and recognition are filled by the team: nothing invented
    expect(titles).not.toContain("institutional/faculty");
    expect(titles).not.toContain("institutional/recognition");
    COMMERCIAL_KB.forEach(k => expect(k.content).not.toMatch(/Harvard|\d+ ?%/));
  });
});

describe("the opening is written by the system", () => {
  it("a greeting is recognised, a real question is not", () => {
    ["oi", "Olá, bom dia", "quero mais informações", "tenho interesse"].forEach(t => expect(isGreeting(t), t).toBe(true));
    ["qual o valor?", "quanto tempo dura Administração?", "quero falar com uma pessoa", "vocês têm Pedagogia em Porto Velho e como funciona a prova?"].forEach(t => expect(isGreeting(t), t).toBe(false));
  });

  it("asks only the next thing that is missing and never what is known", () => {
    expect(openingText({}, "Maria", false)).toMatch(/Qual curso/);
    expect(openingText({ courseName: "Administração" }, "Maria", false)).toMatch(/Vi que você tem interesse em Administração/);
    expect(openingText({ courseName: "Administração" }, "Maria", false)).toMatch(/cidade/);
    expect(openingText({ courseName: "Administração", city: "Porto Velho" }, "Maria", false)).toMatch(/primeira graduação/);
    expect(openingText({ courseName: "Administração", city: "Porto Velho", entryType: "transfer" }, "Maria", true)).toMatch(/de novo/);
  });

  it("a stage ends when what it asks for is known", () => {
    const fields = [{ key: "courseName", required: true }, { key: "city", required: true }, { key: "entryType", required: true }];
    expect(stageFieldsDone(fields, { courseName: "Direito", city: "Vilhena" })).toBe(false);
    expect(stageFieldsDone(fields, { courseName: "Direito", city: "Vilhena", entryType: "unknown" })).toBe(false);
    expect(stageFieldsDone(fields, { courseName: "Direito", city: "Vilhena", entryType: "first_degree" })).toBe(true);
  });
});
