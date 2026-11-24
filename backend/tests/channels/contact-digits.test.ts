import { describe, expect, it } from "vitest";
import { contactDigits } from "../../src/helpers/Phone";

describe("número do contato digitado de qualquer jeito", () => {
  it("fica só com os algarismos: todos os espaços, traços, pontos, parênteses e o + saem", () => {
    expect(contactDigits("55 69 99297-9581")).toBe("5569992979581");
    expect(contactDigits("+55 (69) 9 9297-9581")).toBe("5569992979581");
    expect(contactDigits("69.99297.9581")).toBe("69992979581");
    expect(contactDigits(5569992979581)).toBe("5569992979581");
    expect(contactDigits("")).toBe("");
    expect(contactDigits(null)).toBe("");
  });
});
