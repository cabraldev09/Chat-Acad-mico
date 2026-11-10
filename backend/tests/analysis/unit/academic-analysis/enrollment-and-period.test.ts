import { describe, expect, it } from "vitest";
import { applyHistoryPeriodInference } from "@/domain/academic-analysis/history-period-inference";
import { analyzeAcademicGrid } from "@/domain/academic-analysis/analyze";
import { classifyEnrollmentWord, enrollmentFromText, estimatePeriod } from "@/domain/academic-analysis/enrollment";
import { evaluateAcademic } from "../../../../src/analysis/Engine";
import type { AcademicDiscipline, AcademicGridSnapshot } from "@/domain/academic-analysis/types";

// 14 blocks of 10 subjects; the student has 4 periods done (29% of the hours) but one exempted subject was recorded
// in a far block with an enrollment term, so "the highest period with a record" says 10 while the student is in the 5th.
const blocks = 14;
const make = (): AcademicDiscipline[] => {
  const rows: AcademicDiscipline[] = [];
  for (let b = 1; b <= blocks; b++) {
    for (let i = 0; i < 10; i++) {
      const done = b <= 4 || (b === 10 && i === 0);
      rows.push({
        code: `${b}-${i}`, name: `${String.fromCharCode(65 + i)} DISCIPLINA ${b}`, rawPeriod: String(b), period: b,
        originalStatus: done ? "APROVADO" : "PENDENTE", normalizedStatus: done ? "APROVADO" : "A CURSAR", workload: 80, inMainCurriculum: true,
        sourcePage: 1, sourceRow: rows.length + 1, manualEdited: false, academicTerm: done ? "2025/1" : null
      });
    }
  }
  return rows;
};

const snap = (rows: AcademicDiscipline[], extra: Partial<AcademicGridSnapshot> = {}): AcademicGridSnapshot => ({
  documentType: "OFFICIAL_ACADEMIC_HISTORY", disciplines: rows, result: analyzeAcademicGrid({ disciplines: rows, currentPeriod: null, currentPeriodConfirmed: false }),
  studentName: "Aluno de Teste", rgm: "1", courseName: "Pedagogia", extractionWarnings: [], manuallyEdited: false, ...extra
});

describe("período atual: conferência pela carga integralizada", () => {
  it("não confirma sozinho quando o histórico diz 10º e a carga corresponde ao 5º", () => {
    const s = estimatePeriod(make(), 10);
    expect(s.inferred).toBe(10);
    expect(s.byWorkload).toBe(5);
    expect(s.agrees).toBe(false);
    expect(s.note).toMatch(/Confira a série do aluno no SIAA/);
  });

  it("confirma quando os dois caminhos concordam", () => {
    const rows = make().map((d) => (d.period === 5 ? { ...d, academicTerm: "2025/2" } : d));
    expect(estimatePeriod(rows, 5).agrees).toBe(true);
  });

  it("o mapeamento do histórico deixa o período como sugestão e pede confirmação", () => {
    const s = snap(make().map((d) => ({ ...d, period: null })));
    // the blocks must be recoverable from the order: reuse the real periods through "assigned"
    const assigned = make().map((d) => d.period as number);
    const applied = applyHistoryPeriodInference(s, assigned);
    expect(applied.applied).toBe(true);
    expect(applied.snapshot.result.currentPeriodConfirmed).toBe(false);
    expect(applied.snapshot.result.status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(applied.snapshot.periodSuggestion?.byWorkload).toBe(5);
  });
});

describe("situação da matrícula", () => {
  it("reconhece as palavras do SIAA", () => {
    expect(classifyEnrollmentWord("5 - Cancelado")).toBeNull();
    expect(classifyEnrollmentWord("Cancelado")).toBe("CANCELLED");
    expect(classifyEnrollmentWord("TRANCADA")).toBe("LOCKED");
    expect(classifyEnrollmentWord("Formado")).toBe("GRADUATED");
    expect(classifyEnrollmentWord("Em curso")).toBe("ACTIVE");
  });

  it("lê a situação do texto do documento", () => {
    expect(enrollmentFromText("Nome: X\nSituação da matrícula: 5 - Cancelado\nCurso: Y")?.code).toBe("CANCELLED");
    expect(enrollmentFromText("Nome: X\nCurso: Y")).toBeNull();
  });

  it("matrícula cancelada: não pode incluir disciplinas e não promete previsão de formatura", () => {
    const rows = make();
    const base = snap(rows, { enrollmentSituation: { code: "CANCELLED", label: "Cancelada", source: "STAFF" } });
    const out = evaluateAcademic(base, { currentPeriod: 5 });
    expect(out.snapshot.result.status).toBe("ENROLLMENT_INACTIVE");
    expect(out.snapshot.result.canAddNow).toBe(0);
    expect(out.forecast).toBeNull();
    expect(out.message).toMatch(/Situação da matrícula: Cancelada/);
    expect(out.message).not.toMatch(/Previsão estimada/);
  });

  it("matrícula ativa segue o cálculo normal", () => {
    const out = evaluateAcademic(snap(make(), { enrollmentSituation: { code: "ACTIVE", label: "Ativa", source: "STAFF" } }), { currentPeriod: 5 });
    expect(out.snapshot.result.status).not.toBe("ENROLLMENT_INACTIVE");
  });
});
