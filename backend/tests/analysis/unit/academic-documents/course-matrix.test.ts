import { describe, it, expect, vi, beforeEach } from "vitest";
import { digitalHistoryPdf } from "../../fixtures/academic-pdf";

// the catalog of grades lives in the database: here the matrix of the course is given by the test
const matrix = vi.hoisted(() => ({ value: null as null | Array<{ semester: number; code: string | null; name: string; workload: number | null; type: string | null }> }));
vi.mock("@/services/commercial-grades/matrix-lookup", () => ({ matrixFor: async () => matrix.value }));

import { readAcademicPdf } from "../../../../src/analysis/Engine";

// Synthetic matrix of the course of the fixture. The student entered in the middle of the cycle: what was taken in the
// first term is partly of the 5th série, and what is still to come (no term in the history) has a série only here.
const component = (semester: number, code: string | null, name: string) => ({ semester, code, name, workload: null, type: "Normal" });
const COURSE = [
  component(1, "101", "AMBIENTAÇÃO DIGITAL"),
  component(5, "102", "FUNDAMENTOS DO SERVIÇO SOCIAL: ASPECTOS HISTÓRICOS DA PROFISSÃO"),
  component(1, "103", "PLANO DE ACOMPANHAMENTO DE CARREIRA EM SERVIÇO SOCIAL"),
  component(2, "201", "PLANO DE ACOMPANHAMENTO DE CARREIRA EM SERVIÇO SOCIAL I"),
  component(2, "202", "TEORIA DO ESTADO"),
  component(2, "203", "TEORIA SOCIOLÓGICA"),
  component(3, "301", "LÍNGUA BRASILEIRA DE SINAIS"),
  component(3, "302", "PLANO DE ACOMPANHAMENTO DE CARREIRA EM SERVIÇO SOCIAL II"),
  // without the code, found by the name (accents do not matter)
  component(4, null, "LEGISLAÇÃO SOCIAL"),
  component(4, "402", "PLANO DE ACOMPANHAMENTO DE CARREIRA EM SERVIÇO SOCIAL III"),
  component(5, "403", "PLANO DE ACOMPANHAMENTO DE CARREIRA EM SERVIÇO SOCIAL IV"),
];

describe("histórico digital com a matriz do curso", () => {
  beforeEach(() => {
    matrix.value = null;
  });

  it("without the matrix, what is still to come has no period and the tutor maps it", async () => {
    const { snapshot } = await readAcademicPdf(digitalHistoryPdf("77010", false), "Historico_Simples.pdf");
    expect(snapshot.disciplines.find((row) => row.code === "401")?.period).toBeNull();
    expect(snapshot.mappingRequired).toBe(true);
  });

  it("takes the série of every discipline from the matrix, and the current period from the latest term", async () => {
    matrix.value = COURSE;
    const { snapshot } = await readAcademicPdf(digitalHistoryPdf("77011", false), "Historico_Simples.pdf");
    const period = (code: string) => snapshot.disciplines.find((row) => row.code === code)?.period;
    expect(snapshot.disciplines.filter((row) => row.inMainCurriculum && row.period === null)).toEqual([]);
    expect(period("102")).toBe(5);
    expect(period("401")).toBe(4);
    expect(period("403")).toBe(5);
    expect(snapshot.disciplines.find((row) => row.code === "401")?.curricularPeriodProvenance).toEqual({ source: "COURSE_MATRIX", confirmed: true });
    // the latest term (2026/2) is the 3rd série; the earlier 5th-série subject does not push it, and the workload agrees
    expect(snapshot.result.currentPeriod).toBe(3);
    expect(snapshot.result.currentPeriodConfirmed).toBe(true);
    expect(snapshot.mappingRequired).toBe(false);
    expect(snapshot.extractionWarnings.some((w) => /MAPEAMENTO CURRICULAR/.test(w))).toBe(false);
  });

  it("does not use a matrix of another version of the course", async () => {
    matrix.value = COURSE.filter((row) => !["401", "402", "403"].includes(row.code ?? "401"));
    const { snapshot } = await readAcademicPdf(digitalHistoryPdf("77012", false), "Historico_Simples.pdf");
    expect(snapshot.disciplines.find((row) => row.code === "401")?.period).toBeNull();
    expect(snapshot.disciplines.find((row) => row.code === "101")?.curricularPeriodProvenance?.source).toBe("HISTORY_TERM_ORDER");
    expect(snapshot.mappingRequired).toBe(true);
  });
});
