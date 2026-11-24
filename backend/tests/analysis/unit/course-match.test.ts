import { describe, it, expect } from "vitest";
import { coreOf, matchCourses, sameCourseName } from "../../../src/services/CommercialServices/CourseMatch";
import { affirms, oneQuestion, openingText, RESUME_QUESTION, wantsAnotherCourse } from "../../../src/services/CommercialServices/Rules";
import { splitIntoBlocks } from "../../../src/services/CommercialServices/Blocks";

// the names are written the way the catalogue writes them: "Cst Em …", a "2.0", a course repeated with and without the degree in front
const names = [
  "Administração", "Administração 2.0", "Administração Pública", "Análise e desenvolvimento de sistemas", "Cst Em Análise E Desenvolvimento De Sistemas", "Biomedicina",
  "Ciências Contábeis", "Criminologia", "Cst Em Criminologia", "Cst Em Gestão De Recursos Humanos", "Cst Em Gestão Pública", "Cst Em Gestão Hospitalar", "Cst Em Logística",
  "Cst Em Marketing", "Cst Em Marketing Digital", "Cst Em Internet Das Coisas", "Cst Em Segurança Pública", "Cst Em Segurança No Trabalho", "Educação Física", "Educação Física 2.0",
  "Educação Física (Área Básica De Ingresso)", "Física", "Fisioterapia", "Nutrição", "Pedagogia", "Letras - Libras", "Letras - Português E Inglês", "Sistemas De Informação"
];
const list = names.map((name, i) => ({ id: i + 1, name, aliases: name === "Pedagogia" ? "pedag, magistério" : null }));
const found = (text: string) => matchCourses(text, list).map(h => h.course.name);

describe("the course a person names, as people write it", () => {
  it("knows a course by its short form and by another way of saying it", () => {
    expect(found("RH")).toEqual(["Cst Em Gestão De Recursos Humanos"]);
    expect(found("tem rh?")).toEqual(["Cst Em Gestão De Recursos Humanos"]);
    expect(found("gestão de pessoas")).toEqual(["Cst Em Gestão De Recursos Humanos"]);
    expect(found("recursos humanos")).toEqual(["Cst Em Gestão De Recursos Humanos"]);
    expect(found("quero fazer ADS")).toEqual(["Análise e desenvolvimento de sistemas"]);
    expect(found("quero adm")).toEqual(["Administração"]);
    expect(found("contábeis")).toEqual(["Ciências Contábeis"]);
    expect(found("ed. física")).toEqual(["Educação Física"]);
  });
  it("needs no \"curso de\" and reads a long voice note", () => {
    expect(found("quero saber de educação física")).toEqual(["Educação Física"]);
    expect(found("Oi, boa tarde, tudo bem? Eu queria saber mais informações de como funciona a educação física aí com vocês, se tem que ir no polo e como que eu faço para começar a estudar ainda esse ano")).toEqual(["Educação Física"]);
  });
  it("a 2.0 is another course: chosen only when the person says so", () => {
    expect(found("educação física")).toEqual(["Educação Física"]);
    expect(found("quero educação física 2.0")).toEqual(["Educação Física 2.0"]);
    expect(found("tem a educação física dois ponto zero?")).toEqual(["Educação Física 2.0"]);
    expect(found("adm 2.0")).toEqual(["Administração 2.0"]);
    expect(found("quero adm")).toEqual(["Administração"]);
    expect(sameCourseName("Educação Física 2.0", "Educação Física")).toBe(false);
    expect(sameCourseName("Administração 2.0", "Administração")).toBe(false);
  });
  it("takes the plain course of a family, never the one in brackets, and the longer name over the one inside it", () => {
    expect(found("educação física")).toEqual(["Educação Física"]);
    expect(found("criminologia")).toEqual(["Criminologia"]);
    expect(found("administração pública")).toEqual(["Administração Pública"]);
    expect(found("física")).toEqual(["Física"]);
    expect(sameCourseName("Cst Em Criminologia", "Criminologia")).toBe(true);
    expect(sameCourseName("Educação Física", "Educação Física (Área Básica De Ingresso)")).toBe(true);
    expect(coreOf("Cst Em Gestão De Recursos Humanos")).toBe("gestao de recursos humanos");
  });
  it("forgives a typo and uses the names the team wrote for the course", () => {
    expect(found("biomedisina")).toEqual(["Biomedicina"]);
    expect(found("quero magistério")).toEqual(["Pedagogia"]);
  });
  it("offers the few courses a part of a name fits, and decides nothing on a word that says too little", () => {
    expect(found("letras")).toEqual(["Letras - Libras", "Letras - Português E Inglês"]);
    expect(found("nutri ou fisio")).toEqual(["Nutrição", "Fisioterapia"]);
    expect(found("gestão")).toEqual([]);
    expect(found("segurança")).toEqual([]);
    expect(found("quero saber umas coisas")).toEqual([]);
  });
  it("does not take a word of everyday talk for a course", () => {
    for (const t of ["quero falar com o comercial", "qual a qualidade do curso?", "preciso de ajuda financeira", "tem algo especial pra mim?", "trabalho com marketing o dia todo e não tenho tempo"]) expect(found(t).filter(n => !/Marketing/.test(n))).toEqual([]);
    expect(found("quero fazer logística")).toEqual(["Cst Em Logística"]);
    expect(found("curso de coisas")).toEqual([]);
  });
  it("finds nothing where no course is named", () => {
    for (const t of ["sim", "boa tarde tudo bem", "qual o valor", "primeira graduação", "quero me matricular", "moro em fortaleza e trabalho o dia todo", "tem direito?", "enfermagem"]) expect(found(t)).toEqual([]);
  });
});

describe("who comes back, and one question per message", () => {
  it("confirms the interest before the script goes on", () => {
    const text = openingText({ courseName: "Cst Em Gestão De Recursos Humanos", courseId: 10, city: "Porto Velho", entryType: "first_degree" }, "Vitor", true, null);
    expect(text).toContain("Da última vez conversamos sobre *Gestão de Recursos Humanos (tecnólogo)*");
    expect(text.trim().endsWith(RESUME_QUESTION)).toBe(true);
    expect((text.match(/\?/g) || []).length).toBe(1);
    expect(affirms("continuo sim", RESUME_QUESTION)).toBe(true);
    expect(affirms("sim", RESUME_QUESTION)).toBe(true);
    expect(wantsAnotherCourse("quero ver outro")).toBe(true);
    expect(wantsAnotherCourse("não")).toBe(true);
    expect(wantsAnotherCourse("continuo")).toBe(false);
  });
  it("keeps only the last question of an answer", () => {
    expect(oneQuestion("Temos sim. Você já conhece o curso?\n\nEle é semipresencial.\n\nQuer que eu explique como funciona?")).toBe("Temos sim.\n\nEle é semipresencial.\n\nQuer que eu explique como funciona?");
    expect(oneQuestion("Sem pergunta nenhuma.")).toBe("Sem pergunta nenhuma.");
    expect(oneQuestion("Podemos ver isso? Qual curso te interessa?")).toBe("Qual curso te interessa?");
  });
  it("an answer to a question goes in two bubbles and the question", () => {
    const long = Array.from({ length: 7 }, (_, i) => `Este é o parágrafo ${i + 1} da resposta, com o tamanho de uma frase comum de explicação do curso para a pessoa que perguntou sobre ele agora.`).join("\n\n") + "\n\nFicou claro?";
    expect(splitIntoBlocks(long, 3).length).toBeLessThanOrEqual(3);
    expect(splitIntoBlocks(long, 3).pop()).toBe("Ficou claro?");
    expect(splitIntoBlocks(long).length).toBeLessThanOrEqual(5);
  });
});
