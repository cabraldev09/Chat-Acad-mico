import { describe, expect, it } from "vitest";

import { modalityTotals } from "../../src/helpers/CourseModality";

describe("matrículas por formato do curso", () => {
  it("mostra só os formatos do sistema: junta as grafias e o que não é formato vira Não informado, por último", () => {
    const out = modalityTotals([
      { name: "EAD", total: 20 }, { name: "ead digital", total: "5" }, { name: "Semi presencial", total: 7 }, { name: "Semipresencial", total: 3 },
      { name: "Ao vivo", total: 4 }, { name: "Não informado", total: 2 }, { name: "Presencial", total: 1 }
    ]);
    expect(out).toEqual([{ name: "EAD", total: 25 }, { name: "Semipresencial", total: 10 }, { name: "Presencial", total: 1 }, { name: "Não informado", total: 6 }]);
    expect(out.some(r => /ao vivo/i.test(r.name))).toBe(false);
  });
});
