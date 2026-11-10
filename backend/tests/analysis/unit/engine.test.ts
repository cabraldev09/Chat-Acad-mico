import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { AnalysisError, computeCurricular, evaluateAcademic, readAcademicPdf, readCurricularPdf } from "../../../src/analysis/Engine";
import { academicHistoryPdf, academicPdf, selectablePdf } from "../fixtures/academic-pdf";

const sample = readFileSync(path.join(__dirname, "../fixtures/sample-analise.pdf"));

describe("the analysis engine end to end (PDF in, forecast out, no AI)", () => {
  it("reads the curricular PDF table and keeps every row", async () => {
    const read = await readCurricularPdf(sample);
    expect(read.subjects.length).toBeGreaterThan(5);
    expect(read.subjects.every(s => s.name && s.period >= 1)).toBe(true);
    // "-" in the used-subject column means pending, anything else means exempted
    expect(read.subjects.some(s => s.status === "EXEMPTED")).toBe(true);
    expect(read.subjects.some(s => s.status === "PENDING")).toBe(true);
  });

  it("computes the entry forecast: totals add up and the simulation obeys the capacity", async () => {
    const read = await readCurricularPdf(sample);
    const out = computeCurricular({ subjects: read.subjects, claims: read.claims, entryPeriod: 2, startTerm: "2026.2" });
    expect(out.totals.total).toBe(read.subjects.length);
    expect(out.totals.exempted + out.totals.pending + out.totals.review).toBe(out.totals.total);
    expect(out.simulation).not.toBeNull();
    for (const s of out.simulation!.semesters) expect(s.semesterLoad).toBeLessThanOrEqual(s.maximumCapacity);
    expect(out.simulation!.estimatedCompletionTerm).toMatch(/^\d{4}\.[12]$/);
    expect(out.narrative!.text).toContain("Ingresso: *2º semestre*");
    expect(out.warnings.filter(w => w.code.startsWith("INVARIANT_"))).toEqual([]);
  });

  it("without the entry period there is no forecast, only a warning that asks for it", async () => {
    const read = await readCurricularPdf(sample);
    const out = computeCurricular({ subjects: read.subjects, claims: read.claims, entryPeriod: null, startTerm: "2026.2" });
    expect(out.simulation).toBeNull();
    expect(out.warnings.some(w => w.code === "ENTRY_PERIOD_REQUIRED")).toBe(true);
  });

  it("refuses a PDF with no table and a bad semester", async () => {
    await expect(readCurricularPdf(selectablePdf([[40, 700, "Texto qualquer sem tabela"]]))).rejects.toBeInstanceOf(AnalysisError);
    const read = await readCurricularPdf(sample);
    expect(() => computeCurricular({ subjects: read.subjects, claims: [], entryPeriod: 1, startTerm: "xx" })).toThrow(AnalysisError);
  });

  it("reads an academic extract and recomputes when the tutor confirms the current period", async () => {
    const read = await readAcademicPdf(academicPdf("123456"), "extrato.pdf");
    expect(read.documentType).toBe("CURRICULAR_EXTRACT");
    expect(read.snapshot.rgm).toBe("123456");
    const evaluated = evaluateAcademic(read.snapshot, { currentPeriod: 3 });
    expect(evaluated.snapshot.result.currentPeriod).toBe(3);
    expect(evaluated.snapshot.result.currentPeriodConfirmed).toBe(true);
    expect(evaluated.message).toContain("Resumo da análise do extrato escolar");
    // 1 discipline from period 1 is still "A CURSAR": it is previous backlog
    expect(evaluated.snapshot.result.previousPending).toBe(1);
  });

  it("reads a simple history and keeps it as a draft without a curricular structure", async () => {
    const read = await readAcademicPdf(academicHistoryPdf("123456"), "historico.pdf");
    expect(read.documentType).toBe("SIMPLE_ACADEMIC_HISTORY");
    expect(read.snapshot.plannedWorkload).toBe(140);
    const evaluated = evaluateAcademic(read.snapshot);
    // 2026/2 is the term of the course, not the 2nd period: nothing is invented
    expect(evaluated.snapshot.disciplines.every(d => d.period === null)).toBe(true);
    expect(evaluated.forecast).toBeNull();
  });

  it("an unknown document is refused with guidance", async () => {
    await expect(readAcademicPdf(selectablePdf([[40, 700, "Receita de bolo"]]), "bolo.pdf")).rejects.toBeInstanceOf(AnalysisError);
  });
});
