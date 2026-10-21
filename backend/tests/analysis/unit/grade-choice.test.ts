import { describe, expect, it } from "vitest";
import { chooseGrade, gradeCaption } from "../../../src/services/CommercialServices/GradeChoice";

const grade = (id: number, courseName: string, modality: string, curriculumTerm: string) => ({ id, courseName, modality, curriculumTerm });

describe("which grade belongs to the course", () => {
  it("a semipresencial course finds the matrix on file even when it was read as EAD, and the name wins over the modality", () => {
    const all = [grade(97, "PEDAGOGIA (LICENCIATURA)", "EAD", "2023.2"), grade(98, "PSICOPEDAGOGIA (BACHARELADO)", "EAD", "2022.2")];
    const r = chooseGrade(all, { name: "Pedagogia", modality: "Semipresencial" }, "2026.2");
    expect(r.grade?.id).toBe(97);
    expect(chooseGrade(all, { name: "Psicopedagogia", modality: "Semipresencial" }, null).grade?.id).toBe(98);
  });

  it("prefers the matrix of the same modality and the newest one already in effect at the intake", () => {
    const all = [grade(1, "Administração", "EAD", "2024.1"), grade(2, "Administração", "Semipresencial", "2024.1"), grade(3, "Administração", "Semipresencial", "2026.2")];
    expect(chooseGrade(all, { name: "Administração", modality: "Semipresencial" }, "2025.1").grade?.id).toBe(2);
    expect(chooseGrade(all, { name: "Administração", modality: "Semipresencial" }, "2026.2")).toMatchObject({ grade: { id: 3 }, current: true });
  });

  it("no grade for a course that is not in the catalogue", () => {
    expect(chooseGrade([grade(1, "Direito", "Presencial", "2024.1")], { name: "Pedagogia" }, null).grade).toBeNull();
  });
});

describe("the text under the PDF", () => {
  const stages = [
    { semester: 5, discipline: "Educação Infantil", hours: 150 },
    { semester: 6, discipline: "Anos Iniciais do Ensino Fundamental", hours: 150 }
  ];

  it("keeps the summary written for WhatsApp, which already lists the internships", () => {
    const summary = "📚 *Pedagogia*\n🏫 *Estágio supervisionado*: 300 horas\n• 5º semestre: Educação Infantil (150 h)";
    expect(gradeCaption({ courseName: "Pedagogia", whatsappSummary: summary }, stages)).toBe(summary);
  });

  it("adds the internships when the summary does not mention them, and builds one when there is no summary", () => {
    const text = gradeCaption({ courseName: "PEDAGOGIA (LICENCIATURA)", whatsappSummary: "", totalInternshipHours: 300 }, stages);
    expect(text).toContain("*PEDAGOGIA*");
    expect(text).toMatch(/Estágio supervisionado\*: 300 horas/);
    expect(text).toContain("5º semestre: Educação Infantil (150 h)");
    expect(gradeCaption({ courseName: "X", whatsappSummary: "Resumo sem a palavra" }, stages)).toMatch(/Educação Infantil/);
  });

  it("never passes the 1000 characters of a caption, cutting whole lines", () => {
    const long = Array.from({ length: 80 }, (_, i) => `• linha ${i} com bastante texto para encher a legenda`).join("\n");
    const out = gradeCaption({ courseName: "X", whatsappSummary: `Estágio\n${long}` }, []);
    expect(out.length).toBeLessThanOrEqual(1000);
    expect(out.endsWith("encher a legenda")).toBe(true);
  });
});

import { canonicalName } from "../../../src/services/CommercialServices/GradeChoice";
describe("the name of the course on the matrix", () => {
  it("is the same course with or without CST, articles and the degree in parentheses", () => {
    expect(canonicalName("CST EM ANÁLISE E DESENVOLVIMENTO DE SISTEMAS")).toBe(canonicalName("Análise e desenvolvimento de sistemas"));
    expect(canonicalName("CST EM COMPUTAÇÃO EM NUVEM")).toBe(canonicalName("Computação nuvem"));
    expect(canonicalName("PEDAGOGIA (LICENCIATURA)")).toBe("pedagogia");
    expect(canonicalName("CIÊNCIAS CONTÁBEIS (PARA BACH ADM, ECON, ATUARIAIS")).toBe("ciencias contabeis");
  });

  it("finds the matrix whose file name differs from the catalogue", () => {
    const all = [grade(1, "CST EM CIÊNCIA DE DADOS", "EAD", "2026.2"), grade(2, "CST EM CRIMINOLOGIA", "EAD", "2026.2")];
    expect(chooseGrade(all, { name: "Ciencia de dados" }, null).grade?.id).toBe(1);
    expect(chooseGrade(all, { name: "Criminologia" }, null).grade?.id).toBe(2);
  });

  it("takes the first degree, not the matrix made for graduates, unless it is a second degree", () => {
    const all = [grade(1, "ADMINISTRAÇÃO (BACH P EGRESSO CONTAB GESTAO GTI SEG TR)", "EAD", "2026.2"), grade(2, "ADMINISTRAÇÃO (BACHARELADO)", "EAD", "2026.2")];
    expect(chooseGrade(all, { name: "Administração" }, null).grade?.id).toBe(2);
    expect(chooseGrade(all, { name: "Administração" }, null, { egress: true }).grade?.id).toBe(1);
  });

  it("a course 2.0 uses only a matrix for graduates (never the 8-semester one)", () => {
    const first = [grade(2, "ADMINISTRAÇÃO (BACHARELADO)", "EAD", "2026.2")];
    expect(chooseGrade(first, { name: "Administração 2.0" }, null).grade).toBeNull();
    const both = [...first, grade(1, "ADMINISTRAÇÃO (BACH P EGRESSO CONTAB GESTAO GTI SEG TR)", "EAD", "2026.2")];
    expect(chooseGrade(both, { name: "Administração 2.0" }, null).grade?.id).toBe(1);
  });

  it("two matrices of the same name: the words of the person decide, else the teaching degree, always the same one", () => {
    const all = [grade(5, "MATEMÁTICA (BACHARELADO)", "EAD", "2026.2"), grade(3, "MATEMÁTICA (LICENCIATURA)", "EAD", "2026.2"), grade(4, "MATEMÁTICA (LIC. EM FÍSICA E QUÍMICA)", "EAD", "2026.2")];
    expect(chooseGrade(all, { name: "Matemática" }, null).grade?.id).toBe(3);
    expect(chooseGrade(all, { name: "Matemática" }, null, { hint: "bacharelado em matemática" }).grade?.id).toBe(5);
    expect(chooseGrade([...all].reverse(), { name: "Matemática" }, null).grade?.id).toBe(3);
  });
});
