import { describe, expect, it } from "vitest";

import { cityKeyOf, stateOf } from "../../../src/services/PoloServices/ResolvePolo";
import { readyForConsultantOf, isQualified } from "../../../src/services/CommercialServices/Rules";

describe("state and city keys", () => {
  it("a state alone, by name or by acronym", () => {
    expect(stateOf("Rondônia")).toBe("RO");
    expect(stateOf("ro")).toBe("RO");
    expect(stateOf("Mato Grosso do Sul")).toBe("MS");
    expect(stateOf("Mato Grosso")).toBe("MT");
  });

  it("the state at the end of a city answer", () => {
    expect(stateOf("Porto Velho - RO")).toBe("RO");
    expect(stateOf("Ji-Paraná, RO")).toBe("RO");
    expect(stateOf("moro em Vilhena/RO")).toBe("RO");
  });

  it("not a state: ordinary words that look like acronyms", () => {
    expect(stateOf("moro em Porto Velho")).toBeNull();
    expect(stateOf("to aqui")).toBeNull();
    expect(stateOf("")).toBeNull();
  });

  it("the key ignores accents and punctuation", () => {
    expect(cityKeyOf("Ji-Paraná")).toBe("ji parana");
    expect(cityKeyOf("  Candeias do Jamari ")).toBe("candeias do jamari");
  });
});

describe("a qualified lead goes to the consultant after a couple of answers", () => {
  const slots = { courseName: "Pedagogia", city: "Vilhena", entryType: "first_degree", courseExplained: true };

  it("qualified = course, city, kind of entry and the course presented", () => {
    expect(isQualified(slots)).toBe(true);
    expect(isQualified({ ...slots, courseExplained: false })).toBe(false);
    expect(isQualified({ ...slots, entryType: "unknown" })).toBe(false);
    expect(isQualified({ ...slots, city: null, poloId: 3 })).toBe(true);
  });

  it("needs the answers first", () => {
    expect(readyForConsultantOf(slots, 1)).toBe(false);
    expect(readyForConsultantOf(slots, 2)).toBe(true);
  });

  it("a transfer lead waits for the analysis to be explained", () => {
    const transfer = { ...slots, entryType: "transfer" };
    expect(readyForConsultantOf(transfer, 5)).toBe(false);
    expect(readyForConsultantOf({ ...transfer, analysisStatus: "completed", analysisExplained: true }, 5)).toBe(true);
  });

  it("zero turns the rule off", () => {
    expect(readyForConsultantOf(slots, 99, 0)).toBe(false);
  });
});
