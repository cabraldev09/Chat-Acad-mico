import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/models/EnrollmentProof", () => ({ default: {} }));
vi.mock("../../src/services/AiServices/Keys", () => ({ anthropicAccess: async () => ({}), openaiAccess: async () => ({}) }));
vi.mock("../../src/config/paths", () => ({ PUBLIC_DIR: "/tmp/test-public" }));

import { cleanProofReading } from "../../src/services/CommercialServices/EnrollmentProof";

describe("leitura do print da matrícula", () => {
  it("limpa o RGM lido (rótulo, espaços e caracteres estranhos) e descarta o que não parece um RGM", () => {
    expect(cleanProofReading({ rgm: "RGM: 12 345 678", nome: "  Maria  da Silva ", curso: "Pedagogia" })).toEqual({ rgm: "12345678", name: "Maria da Silva", course: "Pedagogia", polo: null });
    expect(cleanProofReading({ rgm: "Matrícula - 2026.1-0099/RO" }).rgm).toBe("2026.1-0099/RO");
    expect(cleanProofReading({ rgm: "1" }).rgm).toBeNull();
    expect(cleanProofReading(null)).toEqual({ rgm: null, name: null, course: null, polo: null });
  });
});
