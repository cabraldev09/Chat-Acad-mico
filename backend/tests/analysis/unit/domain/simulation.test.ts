import { beforeEach, describe, expect, it } from "vitest";
import { simulateCurriculum, explainProjection } from "@/domain/curricular-analysis/simulation/simulate";
import { validateAnalysis } from "@/domain/curricular-analysis/validators/validate";
import { calculateCurriculumTotals } from "@/domain/curricular-analysis/engine/totals";
import { calculateAnalysisStatus } from "@/domain/curricular-analysis/validators/status";
import { detectInconsistencies } from "@/domain/curricular-analysis/validators/inconsistencies";
import { termSequence, suggestStartTerm } from "@/domain/curricular-analysis/simulation/terms";
import { buildAcademicCalendar, DEFAULT_ACADEMIC_CALENDAR } from "@/domain/academic-calendar/calendar";
import { makePeriod, makeSubject, resetCounter, rules } from "../../fixtures/subjects";

beforeEach(() => resetCounter());

/** Grade de 8 períodos × 8 disciplinas. Ingresso no 4º. */
function buildCurriculum(opts: { exemptedBefore: number; exemptedInEntry: number }) {
  const subjects = [];
  for (let p = 1; p <= 8; p++) {
    const exempted = p < 4 ? opts.exemptedBefore : p === 4 ? opts.exemptedInEntry : 0;
    subjects.push(...makePeriod(p, 8, exempted));
  }
  return subjects;
}

describe("simulateCurriculum", () => {
  it("cenário da especificação (§12): 4º período com 2 dispensas e backlog de 15", () => {
    // 3 períodos anteriores × 8 = 24, com 3 dispensadas cada → 15 pendências
    const subjects = buildCurriculum({ exemptedBefore: 3, exemptedInEntry: 2 });
    const result = simulateCurriculum({ subjects, entryPeriod: 4, startTerm: "2026.1", rules: rules() });

    expect(result.initialBacklogIds).toHaveLength(15);
    const first = result.semesters[0];
    expect(first.term).toBe("2026.1");
    expect(first.periodNumber).toBe(4);
    expect(first.regularSubjectsToTake).toBe(6);
    expect(first.backlogCapacity).toBe(5);
    expect(first.subjectsFromBacklog).toBe(5);
    expect(first.semesterLoad).toBe(11);
    expect(first.remainingBacklog).toBe(10);

    // períodos 5..8: 8 regulares + 3 de backlog cada → 10 → 7 → 4 → 1 → 0
    expect(result.semesters.map((s) => s.remainingBacklog)).toEqual([10, 7, 4, 1, 0]);
    expect(result.semesters.every((s) => !s.isAdditional)).toBe(true);
    for (const s of result.semesters) expect(s.semesterLoad).toBeLessThanOrEqual(s.maximumCapacity);
    expect(result.incomplete).toBe(false);
    expect(result.estimatedCompletionTerm).toBe("2028.1");
    expect(result.semestersRemaining).toBe(5);
    expect(result.remainingBacklogIds).toHaveLength(0);
  });

  it("backlog maior que a capacidade oficial com regra adicional UNCONFIGURED → incompleto", () => {
    // 2 dispensadas por período anterior → 18 pendências: 18→13→10→7→4→1 sobra 1
    const subjects = buildCurriculum({ exemptedBefore: 2, exemptedInEntry: 2 });
    const result = simulateCurriculum({ subjects, entryPeriod: 4, startTerm: "2026.1", rules: rules({ additionalSemesterCapacityRule: { type: "UNCONFIGURED" } }) });
    expect(result.initialBacklogIds).toHaveLength(18);
    expect(result.semesters.map((s) => s.remainingBacklog)).toEqual([13, 10, 7, 4, 1]);
    expect(result.incomplete).toBe(true);
    expect(result.incompleteReason).toBe("ADDITIONAL_SEMESTER_RULE_UNCONFIGURED");
    expect(result.estimatedCompletionTerm).toBeNull();
    expect(result.remainingBacklogIds).toHaveLength(1);
  });

  it("regra adicional SAME_AS_LAST_PERIOD cria semestres adicionais até zerar", () => {
    const subjects = buildCurriculum({ exemptedBefore: 2, exemptedInEntry: 2 });
    const result = simulateCurriculum({
      subjects,
      entryPeriod: 4,
      startTerm: "2026.1",
      rules: rules({ additionalSemesterCapacityRule: { type: "SAME_AS_LAST_PERIOD" } }),
    });
    expect(result.incomplete).toBe(false);
    expect(result.semesters).toHaveLength(6);
    const extra = result.semesters[5];
    expect(extra.isAdditional).toBe(true);
    expect(extra.maximumCapacity).toBe(11);
    expect(extra.subjectsFromBacklog).toBe(1);
    expect(result.estimatedCompletionTerm).toBe("2028.2");
    expect(result.semestersRemaining).toBe(6);
  });

  it("regra FIXED_VALUE respeita a capacidade fixa", () => {
    const subjects = [...makePeriod(1, 6), ...makePeriod(2, 4, 4)];
    const result = simulateCurriculum({
      subjects,
      entryPeriod: 2,
      startTerm: "2026.2",
      rules: rules({ additionalSemesterCapacityRule: { type: "FIXED_VALUE", value: 2 } }),
    });
    // 2º período: 4 disciplinas, 4 dispensadas → regulares 0, capacidade 7 → 6 do backlog cabem → 0 restante
    expect(result.semesters[0].subjectsFromBacklog).toBe(6);
    expect(result.incomplete).toBe(false);
    expect(result.semesters).toHaveLength(1);
  });

  it("limite de semestres adicionais evita loop infinito", () => {
    const subjects = [...makePeriod(1, 30), ...makePeriod(2, 1, 1)];
    const result = simulateCurriculum({
      subjects,
      entryPeriod: 2,
      startTerm: "2026.1",
      rules: rules({ additionalSemesterCapacityRule: { type: "FIXED_VALUE", value: 1 }, maxAdditionalSemesters: 3 }),
    });
    expect(result.incomplete).toBe(true);
    expect(result.incompleteReason).toBe("MAX_ADDITIONAL_SEMESTERS");
    expect(result.semesters.filter((s) => s.isAdditional)).toHaveLength(3);
  });

  it("pendentes de períodos ≥ ingresso são regulares, não backlog (§17)", () => {
    const subjects = [...makePeriod(1, 2, 1), ...makePeriod(4, 3, 0), ...makePeriod(5, 3, 0)];
    const result = simulateCurriculum({ subjects, entryPeriod: 4, startTerm: "2026.1", rules: rules() });
    expect(result.initialBacklogIds).toHaveLength(1);
    expect(result.semesters[0].regularSubjectsToTake).toBe(3);
    expect(result.semesters[1].regularSubjectsToTake).toBe(3);
  });

  it("tudo dispensado → nenhum semestre", () => {
    const subjects = [...makePeriod(1, 3, 3)];
    const result = simulateCurriculum({ subjects, entryPeriod: 2, startTerm: "2026.1", rules: rules() });
    expect(result.semesters).toHaveLength(0);
    expect(result.incomplete).toBe(false);
  });
});

describe("validateAnalysis (§40)", () => {
  it("aprova uma simulação consistente", () => {
    const subjects = buildCurriculum({ exemptedBefore: 3, exemptedInEntry: 2 });
    const sim = simulateCurriculum({ subjects, entryPeriod: 4, startTerm: "2026.1", rules: rules({ additionalSemesterCapacityRule: { type: "SAME_AS_LAST_PERIOD" } }) });
    const totals = calculateCurriculumTotals(subjects);
    expect(validateAnalysis({ extractedCount: subjects.length, subjects, totals, simulation: sim })).toEqual([]);
  });
  it("detecta linha perdida, duplicidade e capacidade excedida", () => {
    const subjects = makePeriod(1, 3);
    const totals = calculateCurriculumTotals(subjects);
    const sim = simulateCurriculum({ subjects, entryPeriod: 1, startTerm: "2026.1", rules: rules() });
    sim.semesters[0].backlogSubjectIds.push(subjects[0].id); // programada duas vezes
    sim.semesters[0].semesterLoad = 99; // excede
    const v = validateAnalysis({ extractedCount: subjects.length + 1, subjects, totals, simulation: sim });
    const codes = v.map((x) => x.code);
    expect(codes).toContain("ROW_LOST");
    expect(codes).toContain("SUBJECT_SCHEDULED_TWICE");
    expect(codes).toContain("CAPACITY_EXCEEDED");
  });
  it("detecta dispensada programada e conflito programada+backlog", () => {
    const subjects = [makeSubject({ period: 1, usedSubject: "X" }), makeSubject({ period: 1 })];
    const totals = calculateCurriculumTotals(subjects);
    const sim = simulateCurriculum({ subjects, entryPeriod: 1, startTerm: "2026.1", rules: rules() });
    sim.semesters[0].regularSubjectIds.push(subjects[0].id);
    sim.remainingBacklogIds.push(subjects[1].id);
    const codes = validateAnalysis({ extractedCount: 2, subjects, totals, simulation: sim }).map((x) => x.code);
    expect(codes).toContain("EXEMPTED_SUBJECT_SCHEDULED");
    expect(codes).toContain("SUBJECT_SCHEDULED_AND_IN_BACKLOG");
  });
});

describe("calculateAnalysisStatus (§41)", () => {
  const base = { warnings: [], violations: [], entryPeriodConfirmed: true, simulationIncomplete: false, auditorStatus: "OK" as const, auditorCriticalIssues: 0, auditorMinorIssues: 0 };
  it("ALTA quando tudo fecha", () => {
    const r = calculateAnalysisStatus({ ...base, subjects: makePeriod(1, 3) });
    expect(r.reliability).toBe("HIGH");
    expect(r.reviewItemsCount).toBe(0);
  });
  it("REVISÃO OBRIGATÓRIA sem período de ingresso", () => {
    const r = calculateAnalysisStatus({ ...base, subjects: makePeriod(1, 3), entryPeriodConfirmed: false });
    expect(r.reliability).toBe("REVIEW_REQUIRED");
    expect(r.reviewItemsCount).toBe(1);
  });
  it("REVISÃO OBRIGATÓRIA com linha ilegível ou divergência crítica", () => {
    const subjects = [makeSubject({ period: 1, readability: "UNREADABLE" })];
    expect(calculateAnalysisStatus({ ...base, subjects }).reliability).toBe("REVIEW_REQUIRED");
    const r = calculateAnalysisStatus({ ...base, subjects: makePeriod(1, 2), warnings: [{ code: "DOCUMENT_TOTAL_MISMATCH", severity: "CRITICAL", source: "VALIDATOR", message: "x" }] });
    expect(r.reliability).toBe("REVIEW_REQUIRED");
  });
  it("REVISÃO RECOMENDADA com alertas não críticos", () => {
    const r = calculateAnalysisStatus({ ...base, subjects: makePeriod(1, 2), warnings: [{ code: "MISSING_PERIOD", severity: "WARNING", source: "VALIDATOR", message: "x" }] });
    expect(r.reliability).toBe("REVIEW_RECOMMENDED");
    expect(r.reviewItemsCount).toBe(1);
  });
  it("auditor com problema importante → obrigatória; observação → recomendada", () => {
    expect(calculateAnalysisStatus({ ...base, subjects: makePeriod(1, 2), auditorStatus: "REVIEW", auditorCriticalIssues: 1 }).reliability).toBe("REVIEW_REQUIRED");
    expect(calculateAnalysisStatus({ ...base, subjects: makePeriod(1, 2), auditorStatus: "REVIEW", auditorMinorIssues: 2 }).reliability).toBe("REVIEW_RECOMMENDED");
  });
});

describe("detectInconsistencies", () => {
  it("reporta período ausente e linhas ilegíveis/duvidosas", () => {
    const subjects = [...makePeriod(1, 2), ...makePeriod(3, 2), makeSubject({ period: 3, readability: "UNREADABLE" }), makeSubject({ period: 3, readability: "UNCLEAR" })];
    const w = detectInconsistencies(subjects, calculateCurriculumTotals(subjects));
    const codes = w.map((x) => x.code);
    expect(codes).toContain("MISSING_PERIOD");
    expect(codes).toContain("UNREADABLE_ROW");
    expect(codes).toContain("UNCLEAR_ROW");
  });
  it("sem disciplinas → NO_SUBJECTS_FOUND", () => {
    expect(detectInconsistencies([], calculateCurriculumTotals([]))[0].code).toBe("NO_SUBJECTS_FOUND");
  });
});

describe("termos letivos e explicação", () => {
  it("termSequence avança corretamente", () => {
    expect(termSequence("2026.1", 4)).toEqual(["2026.1", "2026.2", "2027.1", "2027.2"]);
  });
  it("suggestStartTerm sugere o próximo semestre", () => {
    expect(suggestStartTerm(new Date("2026-09-21"))).toBe("2027.1");
    expect(suggestStartTerm(new Date("2026-03-01"))).toBe("2026.2");
  });
  it("explainProjection reproduz o exemplo da §53", () => {
    const subjects = [...makePeriod(1, 5), ...makePeriod(4, 8, 2)];
    const sim = simulateCurriculum({ subjects, entryPeriod: 4, startTerm: "2026.1", rules: rules() });
    const ex = explainProjection(sim.semesters[0], rules());
    expect(ex.summary).toBe("6 regulares + 5 adaptações = 11 disciplinas (capacidade 11).");
    expect(ex.lines.find((l) => l.label === "Vagas para adaptação")?.value).toBe(5);
  });
});

describe("buildProjectionNarrative", () => {
  it("gera o texto no formato da equipe", async () => {
    const { buildProjectionNarrative } = await import("@/domain/curricular-analysis/simulation/narrative");
    const subjects = buildCurriculum({ exemptedBefore: 3, exemptedInEntry: 2 });
    const sim = simulateCurriculum({ subjects, entryPeriod: 4, startTerm: "2026.2", rules: rules() });
    const n = buildProjectionNarrative({
      semesters: sim.semesters,
      entryPeriod: 4,
      backlogTotal: sim.initialBacklogIds.length,
      backlogPeriodRange: { from: 1, to: 3 },
      maximumCapacity: 11,
      incomplete: sim.incomplete,
      remainingBacklog: sim.remainingBacklogIds.length,
    });
    expect(n.headerLines).toContain("⚠️ Total de 15 matéria(s) a adaptar (do 1º ao 3º semestre)");
    expect(n.headerLines).toContain("⚠️ Máximo 11 matérias por semestre");
    expect(n.bulletLines[0]).toBe("• *2026.2:* 4º semestre + 5 adaptações (11 matérias)");
    expect(n.bulletLines[3]).toBe("• *2028.1:* 7º semestre + 3 adaptações (11 matérias)");
    expect(n.bulletLines[4]).toBe("• *2028.2:* 8º semestre + última adaptação (9 matérias) e conclusão");
    expect(n.conclusionLine).toContain("*o final de 2028*");
    expect(n.text).toContain("A previsão fica assim:");
  });
  it("usa a data e a confiança do calendário na conclusão compartilhável", async () => {
    const { buildProjectionNarrative } = await import("@/domain/curricular-analysis/simulation/narrative");
    const terms = buildAcademicCalendar(DEFAULT_ACADEMIC_CALENDAR, 2030);
    const n = buildProjectionNarrative({
      semesters: [{
        index: 0, term: "2027.1", periodNumber: 4, isAdditional: false,
        subjectsInPeriod: 8, exemptedInPeriod: 0, regularSubjectsToTake: 8,
        maximumCapacity: 11, backlogCapacity: 3, subjectsFromBacklog: 0,
        semesterLoad: 8, remainingBacklog: 0, regularSubjectIds: [], backlogSubjectIds: [],
      }],
      entryPeriod: 4, backlogTotal: 0, backlogPeriodRange: null, maximumCapacity: 11,
      incomplete: false, remainingBacklog: 0, calendarTerms: terms,
    });
    expect(n.conclusionLine).toContain("até 30 de junho de 2027");
    expect(n.conclusionLine).toContain("calendário projetado");
  });
  it("cenário de ingresso no 8º com semestres adicionais (mesma capacidade do último período)", async () => {
    const { buildProjectionNarrative } = await import("@/domain/curricular-analysis/simulation/narrative");
    const subjects = [];
    for (let p = 1; p <= 7; p++) subjects.push(...makePeriod(p, 8, 1)); // 49 pendências... 7×7 = 49
    subjects.push(...makePeriod(8, 8, 0));
    const sim = simulateCurriculum({ subjects, entryPeriod: 8, startTerm: "2026.1", rules: rules({ additionalSemesterCapacityRule: { type: "SAME_AS_LAST_PERIOD" } }) });
    // 8º: 8 regulares + 3 adaptações = 11 → restam 46 → 11, 11, 11, 11, 2
    expect(sim.semesters[0].semesterLoad).toBe(11);
    expect(sim.semesters.filter((s) => s.isAdditional)).toHaveLength(5);
    const n = buildProjectionNarrative({ semesters: sim.semesters, entryPeriod: 8, backlogTotal: 49, backlogPeriodRange: { from: 1, to: 7 }, maximumCapacity: 11, incomplete: false, remainingBacklog: 0 });
    expect(n.bulletLines[1]).toBe("• *2026.2:* semestre adicional c/ 11 matéria(s)");
    expect(n.bulletLines[5]).toBe("• *2028.2:* semestre adicional c/ 2 matéria(s) e conclusão");
    expect(n.conclusionLine).toContain("dezembro de 2028");
  });
});

describe("periodUnit = YEAR (cursos anuais)", () => {
  it("avança um ano por período e formata o termo como AAAA", () => {
    expect(termSequence("2026", 3, "YEAR")).toEqual(["2026", "2027", "2028"]);
    const subjects = [...makePeriod(1, 8, 2), ...makePeriod(2, 8, 0)];
    const sim = simulateCurriculum({ subjects, entryPeriod: 1, startTerm: "2026", rules: rules({ periodUnit: "YEAR" }) });
    expect(sim.semesters.map((s) => s.term)).toEqual(["2026", "2027"]);
  });
  it("associa uma previsão anual às datas do segundo semestre daquele ano", async () => {
    const { buildProjectionNarrative } = await import("@/domain/curricular-analysis/simulation/narrative");
    const sim = simulateCurriculum({ subjects: makePeriod(1, 8, 0), entryPeriod: 1, startTerm: "2027", rules: rules({ periodUnit: "YEAR" }) });
    const n = buildProjectionNarrative({ semesters: sim.semesters, entryPeriod: 1, backlogTotal: 0, backlogPeriodRange: null, maximumCapacity: 11, incomplete: false, remainingBacklog: 0, periodUnit: "YEAR", calendarTerms: buildAcademicCalendar(DEFAULT_ACADEMIC_CALENDAR, 2029) });
    expect(n.conclusionLine).toContain("2027.2");
    expect(n.conclusionLine).toContain("calendário projetado");
  });
});
