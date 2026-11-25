import { describe, expect, it } from "vitest";
import { DEFAULT_STEPS, FIFTEEN_STEP_ORDER, OLD_DEFAULT_ORDER, upgradeSteps } from "../../../src/services/CopilotServices/Policy";

describe("ordem do processo do copiloto", () => {
  it("começa pelo que a pessoa procura, depois se já tem graduação, depois a cidade", () => {
    expect(DEFAULT_STEPS.slice(0, 3).map(s => s.key)).toEqual(["course", "entry", "city"]);
  });
  it("processo salvo na ordem antiga passa para a nova; o mudado pelo gestor fica como está", () => {
    const old = OLD_DEFAULT_ORDER.map(key => ({ key, label: key, instruction: "", message: key === "city" ? "texto do gestor" : "", optional: false }));
    const up = upgradeSteps(old);
    expect(up.slice(0, 3).map(s => s.key)).toEqual(["course", "entry", "city"]);
    expect(up.find(s => s.key === "city")!.message).toBe("texto do gestor");
    const custom = [old[2], old[0], ...old.slice(3), old[1]];
    expect(upgradeSteps(custom)).toBe(custom);
  });
  it("o processo simples tem 11 etapas, termina na matrícula, e o de 15 etapas salvo passa para ele", () => {
    expect(DEFAULT_STEPS.map(s => s.key)).toEqual(["course", "entry", "city", "format", "tutoria", "grade", "docentes", "bolsa", "proposal", "ficha", "enroll"]);
    const fifteen = FIFTEEN_STEP_ORDER.map(key => ({ key, label: key, instruction: "", message: key === "bolsa" ? "mensagem do gestor" : "", optional: false }));
    const up = upgradeSteps(fifteen);
    expect(up.map(s => s.key)).toEqual(DEFAULT_STEPS.map(s => s.key));
    expect(up.find(s => s.key === "bolsa")!.message).toBe("mensagem do gestor");
    expect(up.some(s => ["objective", "doubts", "taxa", "comprovante", "comunidade", "afiliado"].includes(s.key))).toBe(false);
  });
});
