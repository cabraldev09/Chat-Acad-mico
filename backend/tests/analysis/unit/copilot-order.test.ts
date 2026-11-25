import { describe, expect, it } from "vitest";
import { DEFAULT_STEPS, FIFTEEN_STEP_ORDER, OLD_DEFAULT_ORDER, upgradeSteps } from "../../../src/services/CopilotServices/Policy";

describe("ordem do processo do copiloto", () => {
  it("começa pelo que a pessoa procura, depois se já tem graduação, depois a cidade", () => {
    expect(DEFAULT_STEPS.slice(0, 3).map(s => s.key)).toEqual(["course", "entry", "city"]);
  });
  it("processo salvo na ordem antiga (ou reordenado, só com etapas antigas) passa para o simples, mantendo a mensagem do gestor", () => {
    const old = OLD_DEFAULT_ORDER.map(key => ({ key, label: key, instruction: "", message: key === "city" ? "texto do gestor" : "", optional: false }));
    const up = upgradeSteps(old);
    expect(up.slice(0, 3).map(s => s.key)).toEqual(["course", "entry", "city"]);
    expect(up.find(s => s.key === "city")!.message).toBe("texto do gestor");
    // (25/11/2026: the team asked for the simple process; only a process with a step of its own is kept as it is)
    const reordered = [old[2], old[0], ...old.slice(3), old[1]];
    expect(upgradeSteps(reordered).map(s => s.key)).toEqual(DEFAULT_STEPS.map(s => s.key));
  });
  it("o processo simples tem 11 etapas, termina na matrícula, e o de 15 etapas salvo passa para ele", () => {
    expect(DEFAULT_STEPS.map(s => s.key)).toEqual(["course", "entry", "city", "format", "tutoria", "grade", "docentes", "bolsa", "proposal", "ficha", "enroll"]);
    const fifteen = FIFTEEN_STEP_ORDER.map(key => ({ key, label: key, instruction: "", message: key === "bolsa" ? "mensagem do gestor" : "", optional: false }));
    const up = upgradeSteps(fifteen);
    expect(up.map(s => s.key)).toEqual(DEFAULT_STEPS.map(s => s.key));
    expect(up.find(s => s.key === "bolsa")!.message).toBe("mensagem do gestor");
    expect(up.some(s => ["objective", "doubts", "taxa", "comprovante", "comunidade", "afiliado"].includes(s.key))).toBe(false);
  });
  it("um processo de 13 etapas antigas (a equipe tirou duas) também passa para o simples; um com etapa nova do gestor não", () => {
    const thirteen = FIFTEEN_STEP_ORDER.filter(k => k !== "objective" && k !== "afiliado").map(key => ({ key, label: key, instruction: "", message: "", optional: false }));
    expect(upgradeSteps(thirteen).map(s => s.key)).toEqual(DEFAULT_STEPS.map(s => s.key));
    const mine = [...thirteen.slice(0, 3), { key: "custom_step", label: "Minha etapa", instruction: "", message: "", optional: false }, ...thirteen.slice(3)];
    expect(upgradeSteps(mine)).toBe(mine);
    const simple = DEFAULT_STEPS.map(s => ({ ...s }));
    expect(upgradeSteps(simple)).toBe(simple);
  });
});
