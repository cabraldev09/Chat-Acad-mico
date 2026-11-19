import { describe, expect, it } from "vitest";
import { DEFAULT_STEPS, OLD_DEFAULT_ORDER, upgradeSteps } from "../../../src/services/CopilotServices/Policy";

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
});
