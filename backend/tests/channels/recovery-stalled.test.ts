import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/database", () => ({ default: {} }));
vi.mock("../../src/models/Lead", () => ({ default: {} }));

import { answeredAfter, isStalled } from "../../src/services/ReadingServices/Stalled";

const now = Date.UTC(2026, 10, 26, 15);
const ago = (d: number) => new Date(now - d * 864e5);

describe("Recuperação: parados há 7 dias sem nova leitura", () => {
  it("última mensagem da equipe há 7 dias ou mais (até 90) é parado", () => {
    expect(isStalled(true, ago(8), now)).toBe(true);
    expect(isStalled("t", ago(7), now)).toBe(true);
    expect(isStalled(true, ago(6), now)).toBe(false);
    expect(isStalled(true, ago(120), now)).toBe(false);
  });
  it("se a última foi da pessoa (ou não se sabe), não é parado", () => {
    expect(isStalled(false, ago(20), now)).toBe(false);
    expect(isStalled(null, ago(20), now)).toBe(false);
    expect(isStalled(true, null, now)).toBe(false);
  });
  it("sai de Parados quando a pessoa responde depois de marcado", () => {
    expect(answeredAfter(false, ago(1), ago(2))).toBe(true);
    expect(answeredAfter(false, ago(3), ago(2))).toBe(false);
    expect(answeredAfter(true, ago(1), ago(2))).toBe(false);
    expect(answeredAfter(null, ago(1), ago(2))).toBe(false);
  });
});
