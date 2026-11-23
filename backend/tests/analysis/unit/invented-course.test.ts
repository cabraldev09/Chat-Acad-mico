import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/models/ChatbotNode", () => ({ default: {} }));

import { inventedCourse, notOfferedWords } from "../../../src/services/CommercialServices/InventedCourse";

// What the agent said to a real lead: two health courses the institution does not offer, with a format made up.
const catalog = [
  { id: 1, name: "Análise e Desenvolvimento de Sistemas", level: "Graduação", modality: "EAD" },
  { id: 2, name: "Gestão Hospitalar", level: "Graduação", modality: "EAD" },
  { id: 3, name: "Administração", level: "Graduação", modality: "SEMIPRESENCIAL" },
  { id: 4, name: "Pedagogia", level: "Graduação", modality: "EAD" }
];

describe("a course the institution does not offer never reaches the person", () => {
  it("catches the answer of the print", () => {
    const reply = "Os cursos de saúde, como Enfermagem e Medicina, são semipresenciais. Você gostaria de saber sobre algum outro curso?";
    expect(inventedCourse(reply, catalog)).toBe("Medicina");
  });
  it("a denial is not an invention", () => {
    expect(inventedCourse("Hoje a instituição não oferece Medicina nem Enfermagem. Temos Gestão Hospitalar.", catalog)).toBeNull();
    expect(inventedCourse("Infelizmente não temos Direito.", catalog)).toBeNull();
  });
  it("an offered course is fine, with or without accents", () => {
    expect(inventedCourse("Administração é semipresencial e Pedagogia é EAD.", catalog)).toBeNull();
    expect(inventedCourse("Temos Gestao Hospitalar a distancia.", catalog)).toBeNull();
  });
  it("one word inside another is not a course", () => {
    expect(inventedCourse("A medicação e a enfermaria não fazem parte do curso.", catalog)).toBeNull();
  });
  it("no catalogue, no check", () => {
    expect(inventedCourse("Temos Medicina.", [])).toBeNull();
  });
  it("the replacement says it plainly and offers what exists, with no value", () => {
    const t = notOfferedWords("Enfermagem", ["Gestão Hospitalar", "Administração"], true);
    expect(t).toMatch(/^Hoje a instituição não oferece o curso de Enfermagem\./);
    expect(t).toMatch(/Gestão Hospitalar|Administração/);
    expect(t).not.toMatch(/R\$|\d/);
    expect((t.match(/\?/g) || []).length).toBe(1);
  });
});

import { areaAsked, areaText, courseLabel } from "../../../src/services/CommercialServices/InventedCourse";
import { courseMention, modalityMention } from "../../../src/services/CommercialServices/Rules";

describe("the course asked for is found in the catalogue, in the words of the person", () => {
  it("the format is not part of the name of the course", () => {
    expect(courseMention("Tem o curso de radiologia semi presencial?")).toBe("radiologia");
    expect(courseMention("vocês têm curso de pedagogia ead?")).toBe("pedagogia");
    expect(modalityMention("Tem o curso de radiologia semi presencial?")).toBe("SEMIPRESENCIAL");
    expect(modalityMention("quero pedagogia a distância")).toBe("EAD");
    expect(modalityMention("quero pedagogia")).toBeNull();
  });
  it("the name as registered becomes a name a person reads", () => {
    expect(courseLabel("Cst Em Radiologia")).toBe("Radiologia (tecnólogo)");
    expect(courseLabel("Cst Em Sistemas Para Internet")).toBe("Sistemas para Internet (tecnólogo)");
    expect(courseLabel("Administração")).toBe("Administração");
    expect(courseLabel("Letras - Libras")).toBe("Letras - Libras");
  });
  it("an area asked for lists only what the catalogue has, with the format, and one question", () => {
    expect(areaAsked("Gostaria de saber sobre os cursos na área da saúde")).toBe("saude");
    expect(areaAsked("tem algo na área de tecnologia?")).toBe("tecnologia");
    expect(areaAsked("quero Administração")).toBeNull();
    const list = [...catalog, { id: 5, name: "Cst Em Radiologia", level: "Graduação", modality: "SEMIPRESENCIAL" }];
    const t = areaText("saude", list);
    expect(t).toMatch(/Radiologia \(tecnólogo\): semipresencial/);
    expect(t).toMatch(/Gestão Hospitalar: EAD/);
    expect(t).not.toMatch(/Medicina|Enfermagem|Administração|R\$/);
    expect((t.match(/\?/g) || []).length).toBe(1);
    expect(areaText("saude", [catalog[0]])).toMatch(/não tem cursos cadastrados na área de saúde/);
  });
});
