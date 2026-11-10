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
