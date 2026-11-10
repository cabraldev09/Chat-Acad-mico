import { describe, expect, it, vi } from "vitest";
import { academicDisciplineNeedsReview, academicGridCompletionBlockers, academicGridHasUnresolvedRowCount, analyzeAcademicGrid, buildStudentMessage, normalizeAcademicStatus, parseAcademicPeriod } from "@/domain/academic-analysis/analyze";
import { estimateGraduation, formatGraduationForecast } from "@/domain/academic-analysis/graduation-forecast";
import type { AcademicDiscipline, AcademicGridSnapshot } from "@/domain/academic-analysis/types";
import { buildAcademicCalendar, DEFAULT_ACADEMIC_CALENDAR } from "@/domain/academic-calendar/calendar";
import { extractAcademicGrid, validateAcademicTranscript } from "@/services/academic-analysis/extract";
import type { LocalExtraction, TextLine, TextPart } from "@/services/pdf/parser";

function discipline(period: number, status: string, name = `Disciplina ${period} ${status}`, overrides: Partial<AcademicDiscipline> = {}): AcademicDiscipline {
  return {
    code: null,
    name,
    rawPeriod: String(period),
    period,
    originalStatus: status,
    normalizedStatus: normalizeAcademicStatus(status),
    workload: 60,
    inMainCurriculum: true,
    sourcePage: 1,
    sourceRow: 1,
    manualEdited: false,
    ...overrides,
  };
}

function line(y: number, cells: Array<[number, string]>): TextLine {
  const parts: TextPart[] = cells.map(([x, text]) => ({ x, w: Math.max(8, text.length * 5), text }));
  return { x: 10, y, w: 500, h: 10, text: parts.map((part) => part.text).join("\t"), parts };
}

describe("academic grid rules", () => {
  it("normalizes accents and spacing but only counts exact A CURSAR", () => {
    expect(normalizeAcademicStatus("  a   cursar\n")).toBe("A CURSAR");
    const result = analyzeAcademicGrid({
      currentPeriod: 4,
      disciplines: [
        discipline(4, "APROVADO"), discipline(4, "AE"), discipline(4, "AE*"),
        discipline(3, "A CURSAR"), discipline(2, "CURSANDO"), discipline(1, "REPROVADO"),
        discipline(3, "A CURSAR EXTRA"), discipline(3, "CURSANDO"),
      ],
    });
    expect(result.previousPending).toBe(1);
    expect(result.previousAlreadyAdded).toBe(2);
    expect(result.currentPeriodAE).toBe(2);
  });

  it("uses numeric SIAA grades as outcomes instead of treating them as unknown statuses", () => {
    const disciplines = [
      discipline(1, "NOTA 10.0", "Nota aprovada"),
      discipline(2, "NOTA 5.5", "Nota abaixo da média"),
      discipline(3, "S", "Satisfatório"),
    ];
    const result = analyzeAcademicGrid({ currentPeriod: 4, disciplines });
    const forecast = estimateGraduation({ currentPeriod: 4, disciplines });
    expect(result.previousPending).toBe(0);
    expect(forecast).toMatchObject({ knownBacklog: 1, uncertainRows: 0 });
  });

  it("blocks confirmation for unknown statuses, missing names, and placeholder rows", () => {
    const base = discipline(2, "A CURSAR", "Componente atual");
    const unknownStatus = discipline(1, "SITUAÇÃO NOVA", "Situação desconhecida");
    const missingName = discipline(1, "A CURSAR", "   ");
    const placeholder = discipline(1, "A CURSAR", "COMPONENTE NÃO IDENTIFICADO (página 1, linha 3)");

    expect(academicDisciplineNeedsReview(unknownStatus)).toBe(true);
    expect(academicDisciplineNeedsReview(missingName)).toBe(true);
    expect(academicDisciplineNeedsReview(placeholder)).toBe(true);
    expect(analyzeAcademicGrid({ currentPeriod: 2, disciplines: [base, unknownStatus] })).toMatchObject({
      status: "MANUAL_REVIEW_REQUIRED",
      warnings: expect.arrayContaining([expect.stringContaining("situação sem confirmação")]),
    });
  });

  it("ignores empty tutor-added rows until they contain actual discipline data", () => {
    const emptyDraft = discipline(1, "A CURSAR", "", {
      rawPeriod: "",
      period: null,
      workload: null,
      sourcePage: 0,
      sourceRow: 4,
      manualEdited: true,
    });

    expect(academicDisciplineNeedsReview(emptyDraft)).toBe(false);
    expect(academicGridHasUnresolvedRowCount([emptyDraft], 1, 0)).toBe(true);
    expect(analyzeAcademicGrid({ currentPeriod: 2, disciplines: [emptyDraft] }).previousPending).toBe(0);
    expect(estimateGraduation({ currentPeriod: 2, disciplines: [emptyDraft] })).toBeNull();
  });

  it("requires manual additions only for source rows missing at extraction", () => {
    const extracted = discipline(1, "A CURSAR", "Extraída", { sourcePage: 1, sourceRow: 1 });
    const tutorAdded = discipline(1, "A CURSAR", "Incluída pelo tutor", { sourcePage: 0, sourceRow: 2 });

    expect(academicGridHasUnresolvedRowCount([extracted], 2, 1)).toBe(true);
    expect(academicGridHasUnresolvedRowCount([extracted, tutorAdded], 2, 1)).toBe(false);
    expect(academicGridHasUnresolvedRowCount([extracted, tutorAdded], 1, 1)).toBe(false);
  });

  it("applies +3 plus one slot per AE in the current period only", () => {
    const result = analyzeAcademicGrid({ currentPeriod: 5, disciplines: [
      discipline(5, "APROVADO"), discipline(5, "AE"), discipline(5, "AE*"),
      discipline(2, "AE"), discipline(3, "A CURSAR"),
    ] });
    expect(result.currentPeriodComponents).toBe(3);
    expect(result.extraAllowance).toBe(5);
    expect(result.semesterMaximum).toBe(8);
    expect(result.canAddNow).toBe(1);
    expect(result.pendingAfterPossibleInclusion).toBe(0);
  });

  it("subtracts previous-period CURSANDO from additional slots and reports saturated/near limits", () => {
    const disciplines = [discipline(6, "APROVADO"), ...Array.from({ length: 2 }, (_, i) => discipline(i + 1, "CURSANDO")), discipline(1, "A CURSAR")];
    expect(analyzeAcademicGrid({ currentPeriod: 6, disciplines }).status).toBe("NEAR_LIMIT");
    const full = analyzeAcademicGrid({ currentPeriod: 6, disciplines: [...disciplines, discipline(3, "CURSANDO")] });
    expect(full.status).toBe("LIMIT_REACHED");
    expect(full.canAddNow).toBe(0);
  });

  it("requires manual review for missing/unconfirmed period and overbooked CURSANDO", () => {
    expect(analyzeAcademicGrid({ currentPeriod: null, disciplines: [discipline(1, "A CURSAR")] }).status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(analyzeAcademicGrid({ currentPeriod: 2, currentPeriodConfirmed: false, disciplines: [discipline(2, "APROVADO")] }).status).toBe("MANUAL_REVIEW_REQUIRED");
    const overbooked = analyzeAcademicGrid({ currentPeriod: 2, disciplines: [discipline(2, "APROVADO"), ...Array.from({ length: 4 }, (_, i) => discipline(1, "CURSANDO", `Cursando ${i}`))] });
    expect(overbooked.status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(overbooked.warnings.join(" ")).toContain("REVISÃO NECESSÁRIA");
  });

  it("allows completion when the period and extracted rows are confirmed", () => {
    const blockers = academicGridCompletionBlockers({
      currentPeriod: 2,
      currentPeriodConfirmed: true,
      disciplines: [discipline(2, "APROVADO"), discipline(1, "A CURSAR")],
    });
    expect(blockers).toEqual([]);
  });

  it("explains why completion is blocked when confirmation or rows are missing", () => {
    const blockers = academicGridCompletionBlockers({
      currentPeriod: null,
      currentPeriodConfirmed: false,
      disciplines: [discipline(1, "A CURSAR")],
      sourceDisciplineCount: 4,
      sourceParsedDisciplineCount: 1,
    });
    expect(blockers).toContain("Confirme o período atual do aluno.");
    expect(blockers).toContain("Confira as linhas faltantes do extrato e complete a grade.");
  });

  it("distinguishes current period and excludes courses outside the main curriculum", () => {
    const result = analyzeAcademicGrid({ currentPeriod: 3, disciplines: [
      discipline(3, "APROVADO"), discipline(2, "A CURSAR", "Eletiva extra", { inMainCurriculum: false }),
      discipline(1, "A CURSAR", "Pendente grade principal"),
    ] });
    expect(result.currentPeriodComponents).toBe(1);
    expect(result.previousPending).toBe(1);
  });

  it("parses legacy period labels including S/T forms", () => {
    expect(parseAcademicPeriod("7/A")).toBe(7);
    expect(parseAcademicPeriod("3º Período")).toBe(3);
    expect(parseAcademicPeriod("Etapa 12")).toBe(12);
    expect(parseAcademicPeriod("sem período")).toBeNull();
  });

  it("builds a direct, concise message to accompany the attached transcript", () => {
    const result = analyzeAcademicGrid({ currentPeriod: 2, disciplines: [discipline(2, "APROVADO"), discipline(1, "A CURSAR")] });
    const forecast = estimateGraduation({ currentPeriod: 2, disciplines: [discipline(2, "APROVADO"), discipline(1, "A CURSAR")] });
    const message = buildStudentMessage({ result, forecast });
    expect(message).not.toContain("Olá");
    expect(message).not.toContain("Ana");
    expect(message).toContain("Resumo da análise do extrato escolar");
    expect(message).toContain("Período atual identificado: 2º");
    expect(message).toContain("Previsão estimada de conclusão");
    expect(message).toContain("pré-requisitos");
  });

  it("shares the automatic graduation estimate without waiting for tutor review", () => {
    const disciplines = [discipline(1, "A CURSAR")];
    const result = analyzeAcademicGrid({ currentPeriod: 1, disciplines });
    const forecast = estimateGraduation({ currentPeriod: 1, disciplines, extractionWarnings: ["Uma linha do PDF não foi lida com segurança."] });
    const message = buildStudentMessage({ result, forecast });

    expect(message).toContain("Previsão estimada de conclusão");
    expect(message).toContain("no período 2026.2");
    expect(message).not.toContain("será informada após a conferência");
    expect(message).not.toContain("pela tutoria");
  });

  it("rejects a curricular-analysis request instead of treating it as a school transcript", () => {
    const snapshot = {
      studentName: "João da Silva",
      rgm: "12345678",
      courseName: null,
      disciplines: [],
      extractionWarnings: [],
    } as unknown as AcademicGridSnapshot;
    const issue = validateAcademicTranscript(snapshot, "Solicitação de Transferência — Análise Curricular");
    expect(issue).toContain("não um extrato escolar");
    expect(issue).toContain("A análise não foi iniciada");
  });

  it("requires identifying data and a usable course grid before creating an analysis", () => {
    const snapshot = {
      studentName: null,
      rgm: null,
      courseName: null,
      disciplines: [],
      extractionWarnings: [],
    } as unknown as AcademicGridSnapshot;
    const issue = validateAcademicTranscript(snapshot, "Histórico escolar");
    expect(issue).toContain("identificação do aluno");
    expect(issue).toContain("curso");
    expect(issue).toContain("disciplinas e situações acadêmicas");
    expect(issue).toContain("confirmação");
  });

  it("simulates each curriculum semester and widens the automatic completion window for uncertain rows", () => {
    const disciplines = [
      ...Array.from({ length: 12 }, (_, index) => discipline(7, index === 0 ? "APROVADO" : "CURSANDO", `Atual ${index}`)),
      ...Array.from({ length: 23 }, (_, index) => discipline(index % 6 + 1, "A CURSAR", `Pendente ${index}`)),
      ...Array.from({ length: 8 }, (_, index) => discipline(8, "AE*", `Equivalência ${index}`)),
      discipline(0, "A CURSAR", "Linha não classificada", { period: null }),
      discipline(0, "CURSANDO", "Outra linha não classificada", { period: null }),
    ];
    const forecast = estimateGraduation({ currentPeriod: 7, disciplines });
    expect(forecast).toMatchObject({ semestersMin: 3, knownBacklog: 23, uncertainRows: 2, remainingPeriods: 1, incomplete: true });
    expect(forecast?.plan.map((step) => step.curriculumPeriod)).toEqual([7, 8, 9]);
    expect(forecast?.plan[0]).toMatchObject({ curriculumSubjects: 12, exemptions: 1, regularSubjects: 11, inProgressFromPrevious: 0, previousSubjects: expect.any(Array) });
    expect(forecast?.plan[0].regularSubjectNames).toContain("Atual 1");
    expect(forecast?.reasons.join(" ")).toContain("situação acadêmica não identificada");
    expect(forecast?.completionTermMin).toBeTruthy();
    expect(forecast?.completionTermMax).not.toBe(forecast?.completionTermMin);
    expect(formatGraduationForecast(forecast!)).toMatchObject({ calendarLabel: "calendário não identificado" });
    expect(formatGraduationForecast(forecast!).completion).toContain("–");
  });

  it("adds an automatic uncertainty margin for source rows the parser did not identify", () => {
    const disciplines = [discipline(2, "APROVADO"), discipline(1, "A CURSAR")];
    const forecast = estimateGraduation({
      currentPeriod: 2,
      disciplines,
      sourceDisciplineCount: 5,
      sourceParsedDisciplineCount: 2,
      extractionWarnings: ["A conferência encontrou linhas ausentes."],
    });

    expect(forecast).toMatchObject({ uncertainRows: 3, incomplete: true });
    expect(forecast?.completionTermMin).toBeTruthy();
    expect(forecast?.completionTermMax).not.toBe(forecast?.completionTermMin);
  });

  it("uses a tutor-confirmable academic plan and marks dates as projected when future calendar data is estimated", () => {
    const forecast = estimateGraduation({
      currentPeriod: 2,
      analysisDate: "2026-09-24",
      calendarTerms: buildAcademicCalendar(DEFAULT_ACADEMIC_CALENDAR, 2030),
      disciplines: [
        discipline(2, "APROVADO"),
        discipline(1, "A CURSAR", "Pendente 1"),
        discipline(1, "A CURSAR", "Pendente 2"),
        discipline(1, "A CURSAR", "Pendente 3"),
      ],
    });
    expect(forecast).toMatchObject({
      semestersMin: 1,
      semestersMax: 1,
      currentCalendarTerm: "2026.2",
      completionTermMin: "2026.2",
      completionTermMax: "2026.2",
      completionDateMin: "2026-12-19",
      completionDateMax: "2026-12-19",
      calendarConfidence: "OFFICIAL",
      incomplete: false,
    });
    expect(formatGraduationForecast(forecast!)).toMatchObject({ completion: "2026.2 · dezembro de 2026", calendarLabel: "datas oficiais" });
  });

  it("infers the current semester from the institution's local date when no analysis date is supplied", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2028-03-15T12:00:00.000Z"));
    try {
      const forecast = estimateGraduation({ currentPeriod: 1, disciplines: [discipline(1, "A CURSAR")] });
      expect(forecast?.currentCalendarTerm).toBe("2028.1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not extend the forecast through later periods that contain only exemptions", () => {
    const disciplines = [
      ...Array.from({ length: 13 }, (_, index) => discipline(1, "CURSANDO", `Em curso ${index + 1}`)),
      ...Array.from({ length: 3 }, (_, index) => discipline(1, "A CURSAR", `Pendente atual ${index + 1}`)),
      ...Array.from({ length: 14 }, (_, index) => discipline(2, "A CURSAR", `Regular 2-${index + 1}`)),
      ...[9, 10, 5, 5, 5, 5].flatMap((count, periodIndex) =>
        Array.from({ length: count }, (_, index) => discipline(periodIndex + 3, "AE*", `Dispensa ${periodIndex + 1}-${index + 1}`)),
      ),
    ];
    const forecast = estimateGraduation({
      currentPeriod: 1,
      analysisDate: "2026-09-24",
      calendarTerms: buildAcademicCalendar(DEFAULT_ACADEMIC_CALENDAR, 2030),
      disciplines,
    });

    expect(forecast).toMatchObject({
      knownBacklog: 0,
      remainingPeriods: 1,
      completionTermMin: "2027.1",
      completionTermMax: "2027.1",
      incomplete: false,
    });
    expect(forecast?.plan.map(({ curriculumPeriod, term, regularSubjects, exemptions }) => [curriculumPeriod, term, regularSubjects, exemptions])).toEqual([
      [1, "2026.2", 16, 0],
      [2, "2027.1", 14, 0],
    ]);
  });

  it("does not create a semester for an exemption-only gap between periods with coursework", () => {
    const forecast = estimateGraduation({
      currentPeriod: 1,
      analysisDate: "2026-09-24",
      disciplines: [
        discipline(1, "A CURSAR", "Atual"),
        discipline(2, "AE*", "Dispensa intermediária"),
        discipline(3, "A CURSAR", "Próximo período com carga"),
      ],
    });

    expect(forecast?.completionTermMin).toBe("2027.1");
    expect(forecast?.plan.map((step) => [step.curriculumPeriod, step.term])).toEqual([[1, "2026.2"], [3, "2027.1"]]);
  });

  it("keeps an automatic estimate available when extraction reports omitted rows", () => {
    const forecast = estimateGraduation({
      currentPeriod: 1,
      disciplines: [discipline(1, "A CURSAR")],
      extractionWarnings: ["2 linha(s) com situação acadêmica foram preservadas para revisão, mas excluídas dos cálculos por falta de período legível."],
    });

    expect(forecast).toMatchObject({ completionTermMin: "2026.2", completionTermMax: "2026.2", incomplete: true });
    expect(forecast?.reasons.join(" ")).toContain("excluídas dos cálculos");
  });

  it("applies the +3 and AE bonus sequentially without claiming more courses than allowed", () => {
    const disciplines = [
      ...Array.from({ length: 3 }, (_, index) => discipline(7, "CURSANDO", `Em curso ${index + 1}`)),
      ...Array.from({ length: 8 }, (_, index) => discipline(8, "A CURSAR", `Regular 8-${index + 1}`)),
      ...Array.from({ length: 5 }, (_, index) => discipline(8, "AE*", `Dispensa 8-${index + 1}`)),
      ...Array.from({ length: 8 }, (_, index) => discipline(9, "A CURSAR", `Regular 9-${index + 1}`)),
      ...Array.from({ length: 16 }, (_, index) => discipline(index < 8 ? 1 : 2, "A CURSAR", `Antiga ${index + 1}`)),
    ];
    const forecast = estimateGraduation({ currentPeriod: 7, disciplines, maximumSubjectsPerSemester: 16, additionalSemesterCapacityRule: "SAME_AS_LAST_PERIOD" });
    expect(forecast?.plan.slice(0, 3).map(({ curriculumPeriod, regularSubjects, bonusSlots, previousSubjects }) => ({ curriculumPeriod, regularSubjects, bonusSlots, previousCount: previousSubjects.length }))).toEqual([
      { curriculumPeriod: 7, regularSubjects: 3, bonusSlots: 3, previousCount: 3 },
      { curriculumPeriod: 8, regularSubjects: 8, bonusSlots: 8, previousCount: 8 },
      { curriculumPeriod: 9, regularSubjects: 8, bonusSlots: 3, previousCount: 3 },
    ]);
    expect(forecast?.plan.every((step) => step.totalLoad <= step.capacity)).toBe(true);
    expect(forecast?.incomplete).toBe(false);
  });

  it("projects current enrollments and remaining backlog using the same configured semester capacities", () => {
    const disciplines = [
      ...Array.from({ length: 24 }, (_, index) => discipline(index % 6 + 1, "A CURSAR", `Pendente ${index + 1}`)),
      ...Array.from({ length: 3 }, (_, index) => discipline(6, "CURSANDO", `Já em curso ${index + 1}`)),
      ...Array.from({ length: 13 }, (_, index) => discipline(7, "A CURSAR", `Regular 7-${index + 1}`)),
      ...Array.from({ length: 8 }, (_, index) => discipline(8, "AE*", `Dispensa 8-${index + 1}`)),
    ];
    const forecast = estimateGraduation({
      currentPeriod: 7,
      analysisDate: "2026-09-24",
      calendarTerms: buildAcademicCalendar(DEFAULT_ACADEMIC_CALENDAR, 2030),
      disciplines,
    });
    expect(forecast).toMatchObject({ knownBacklog: 24, completionTermMin: "2027.2", incomplete: false });
    expect(forecast?.plan.map((step) => [step.term, step.inProgressFromPrevious, step.previousSubjects.length, step.capacity, step.totalLoad, step.isAdditional])).toEqual([
      ["2026.2", 3, 0, 16, 16, false],
      ["2027.1", 0, 16, 16, 16, false],
      ["2027.2", 0, 8, 11, 8, true],
    ]);
    expect(forecast?.plan[2]).toMatchObject({ adaptationSemesterNumber: 1, curriculumPeriod: 9 });
    expect(forecast?.plan[1].previousSubjects).toContain("Pendente 1");
    expect(forecast?.plan[0].inProgressSubjectNames).toContain("Já em curso 1");
  });

  it("honors an institutional semester ceiling and leaves overflow visible", () => {
    const disciplines = [
      ...Array.from({ length: 10 }, (_, index) => discipline(4, "A CURSAR", `Regular ${index + 1}`)),
      ...Array.from({ length: 4 }, (_, index) => discipline(1, "A CURSAR", `Backlog ${index + 1}`)),
    ];
    const forecast = estimateGraduation({ currentPeriod: 4, disciplines, maximumSubjectsPerSemester: 11, additionalSemesterCapacityRule: "UNCONFIGURED" });
    expect(forecast?.plan[0]).toMatchObject({ capacity: 11, regularSubjects: 10, bonusSlots: 1, previousSubjects: ["Backlog 1"] });
    expect(forecast?.plan[0].totalLoad).toBeLessThanOrEqual(11);
    expect(forecast?.incomplete).toBe(true);
    expect(forecast?.reasons.join(" ")).toContain("capacidade do semestre adicional não está configurada");
  });

  it("does not create a graduation estimate without a confirmed current period", () => {
    expect(estimateGraduation({ currentPeriod: null, disciplines: [discipline(1, "A CURSAR")] })).toBeNull();
  });
});

describe("academic transcript extraction", () => {
  it("extracts S/T, rows and statuses across multiple pages", () => {
    const header = line(700, [[20, "Código"], [90, "Disciplina"], [300, "S/T"], [370, "C.H."], [450, "Situação"]]);
    const page1 = [header, line(670, [[20, "BIO101"], [90, "Biologia I"], [300, "1/A"], [370, "60"], [450, "A CURSAR"]]), line(640, [[20, "MAT201"], [90, "Matemática II"], [300, "3/A"], [370, "60"], [450, "APROVADO"]])];
    const page2 = [line(700, [[20, "Código"], [90, "Disciplina"], [300, "S/T"], [370, "C.H."], [450, "Situação"]]), line(670, [[20, "HIS101"], [90, "História I"], [300, "2/A"], [370, "60"], [450, "CURSANDO"]])];
    const local: LocalExtraction = {
      pageCount: 2,
      pages: [{ page: 1, width: 600, height: 800, lines: page1 }, { page: 2, width: 600, height: 800, lines: page2 }],
      textByPage: ["S/T: 3/A", ""],
      parserVersion: "test",
    };
    const snapshot = extractAcademicGrid(local, "historico.pdf");
    expect(snapshot.result.currentPeriod).toBe(3);
    expect(snapshot.disciplines.map((item) => item.name)).toEqual(["Biologia I", "Matemática II", "História I"]);
    expect(snapshot.result.previousPending).toBe(1);
    expect(snapshot.result.previousAlreadyAdded).toBe(1);
    expect(snapshot.disciplines[2].sourcePage).toBe(2);
  });

  it("returns clear warnings instead of treating unreadable PDFs as zero-pending success", () => {
    const snapshot = extractAcademicGrid({ pageCount: 1, pages: [], textByPage: [""], parserVersion: "test" }, "scan.pdf");
    expect(snapshot.result.status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(snapshot.extractionWarnings.length).toBeGreaterThan(0);
    expect(snapshot.extractionWarnings.join(" ")).toContain("não executa OCR");
  });

  it("recognizes the headerless SIAA layout and excludes imported courses from the main grid", () => {
    const siaaLine = (y: number, code: string, name: string, period: string, status: string, workload = "60") => line(y, [
      [29, `${code} - ${name}`], [370, period], [424, "***"], [528 - status.length * 5, status], [558, workload],
    ]);
    const page1 = [
      line(808, [[30, "INFORMAÇÕES ACADÊMICAS DO ALUNO"]]),
      line(779, [[29, "ALUNO: 16 - 12345678"], [151, "Ana da Silva"]]),
      line(766, [[29, "CURSO: 40- Ciências Biológicas"], [421, "S/T: 7/A"], [484, "GRADE: 202221"]]),
      siaaLine(736, "00001", "Disciplina pendente", "1ª", "A CURSAR"),
      siaaLine(723, "00002", "Disciplina cursando", "2ª A", "CURSANDO"),
      siaaLine(710, "00003", "Componente atual", "7ª A", "APROVADO"),
      siaaLine(697, "00004", "Aproveitamento atual", "7ª A", "AE*"),
      siaaLine(684, "00007", "Projeto curricular longo que termina no meio da coluna do", "5ª", "APROVADO"),
      line(671, [[29, "002410 - Estágio curricular supervisionado em biologia no ensino médio I 6ª A"], [428, "****"], [488, "APROVADO"], [558, "100"]]),
      line(658, [[29, "011898 - Avaliação integrada de competências docentes em ciências"], [370, "1ª"], [424, "2025/2"], [505, "10.0"], [560, "0"]]),
      line(340, [[29, "00006 - Disciplina sem período"], [424, "2026/2"], [488, "CURSANDO"], [558, "60"]]),
      line(329, [[34, "DISCIPLINAS IMPORTADAS QUE NÃO PERTENCEM A GRADE"]]),
      siaaLine(316, "00005", "Disciplina importada", "7", "A CURSAR"),
    ];
    const local: LocalExtraction = {
      pageCount: 1,
      pages: [{ page: 1, width: 600, height: 842, lines: page1 }],
      textByPage: [page1.map((item) => item.text).join("\n")],
      parserVersion: "test",
    };
    const snapshot = extractAcademicGrid(local, "extrato-siaa.pdf");
    expect(snapshot.studentName).toBe("Ana da Silva");
    expect(snapshot.rgm).toBe("12345678");
    expect(snapshot.courseName).toBe("Ciências Biológicas");
    expect(snapshot.disciplines).toHaveLength(9);
    expect(snapshot.sourceDisciplineCount).toBe(9);
    expect(snapshot.disciplines.find((item) => item.name === "Disciplina importada")?.inMainCurriculum).toBe(false);
    expect(snapshot.result.currentPeriod).toBe(7);
    expect(snapshot.result.currentPeriodComponents).toBe(2);
    expect(snapshot.result.currentPeriodAE).toBe(1);
    expect(snapshot.result.previousPending).toBe(1);
    expect(snapshot.result.previousAlreadyAdded).toBe(1);
    expect(snapshot.disciplines.find((item) => item.name === "Disciplina sem período")?.period).toBeNull();
    expect(snapshot.disciplines.find((item) => item.code === "002410")).toMatchObject({ name: "Estágio curricular supervisionado em biologia no ensino médio I", period: 6 });
    expect(snapshot.disciplines.find((item) => item.code === "011898")).toMatchObject({ originalStatus: "10.0", normalizedStatus: "NOTA 10.0", period: 1 });
    expect(snapshot.result.status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(snapshot.extractionWarnings.join(" ")).toContain("As linhas foram mantidas na grade");
    expect(snapshot.extractionWarnings.join(" ")).toContain("não entram nos cálculos");
    expect(snapshot.extractionWarnings.join(" ")).not.toContain("A conferência automática encontrou");
    expect(snapshot.extractionWarnings.join(" ")).not.toContain("terminam no meio de uma expressão");
    expect(snapshot.extractionWarnings.join(" ")).not.toContain("truncados");
  });

  it("recognizes Satisfactory (S) rows as completed and includes them in the completeness count", () => {
    const rows = [
      line(808, [[30, "INFORMAÇÕES ACADÊMICAS DO ALUNO"]]),
      line(766, [[29, "CURSO: 40- Ciências Biológicas"], [421, "S/T: 2/A"]]),
      line(736, [[29, "00001 - Componente satisfatório"], [370, "1ª"], [424, "2024/1"], [513, "S"], [558, "10"]]),
      line(723, [[29, "00002 - Componente atual"], [370, "2ª A"], [424, "2026/2"], [488, "A CURSAR"], [558, "60"]]),
    ];
    const snapshot = extractAcademicGrid({
      pageCount: 1,
      pages: [{ page: 1, width: 600, height: 800, lines: rows }],
      textByPage: [rows.map((item) => item.text).join("\n")],
      parserVersion: "test",
    }, "extrato.pdf");

    expect(snapshot.disciplines).toHaveLength(2);
    expect(snapshot.disciplines.find((item) => item.code === "00001")?.normalizedStatus).toBe("S");
    expect(snapshot.sourceDisciplineCount).toBe(2);
    expect(snapshot.extractionWarnings.join(" ")).not.toContain("A conferência automática encontrou");
  });

  it("keeps a row with an unreadable name and blocks the projection instead of dropping it", () => {
    const rows = [
      line(808, [[30, "INFORMAÇÕES ACADÊMICAS DO ALUNO"]]),
      line(766, [[29, "CURSO: 40- Ciências Biológicas"], [421, "S/T: 2/A"]]),
      line(736, [[29, "00001 -"], [370, "1ª"], [424, "****"], [488, "A CURSAR"], [558, "60"]]),
      line(723, [[29, "00002 - Disciplina legível"], [370, "2ª"], [424, "****"], [488, "A CURSAR"], [558, "60"]]),
    ];
    const snapshot = extractAcademicGrid({
      pageCount: 1,
      pages: [{ page: 1, width: 600, height: 800, lines: rows }],
      textByPage: [rows.map((item) => item.text).join("\n")],
      parserVersion: "test",
    }, "extrato.pdf");

    expect(snapshot.disciplines).toHaveLength(2);
    expect(snapshot.disciplines[0].name).toContain("COMPONENTE NÃO IDENTIFICADO");
    expect(snapshot.result.status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(snapshot.extractionWarnings.join(" ")).toContain("As linhas foram mantidas na grade");
  });

  it("blocks projection when positioned extraction and linear SIAA row counts disagree", () => {
    const rows = [
      line(808, [[30, "INFORMAÇÕES ACADÊMICAS DO ALUNO"]]),
      line(766, [[29, "CURSO: 40- Ciências Biológicas"], [421, "S/T: 2/A"]]),
      line(736, [[29, "00001 - Disciplina legível"], [370, "1ª"], [424, "****"], [488, "A CURSAR"], [558, "60"]]),
      // A situação deslocada para fora da coluna é visível no texto, mas não
      // pode ser associada com segurança à linha pelo parser posicional.
      line(723, [[29, "00002 - Disciplina deslocada"], [370, "1ª"], [424, "****"], [590, "A CURSAR"], [620, "60"]]),
    ];
    const snapshot = extractAcademicGrid({
      pageCount: 1,
      pages: [{ page: 1, width: 700, height: 800, lines: rows }],
      textByPage: [rows.map((item) => item.text).join("\n")],
      parserVersion: "test",
    }, "extrato.pdf");

    expect(snapshot.extractionWarnings.join(" ")).toContain("A conferência automática encontrou");
    expect(snapshot.result.status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(academicGridHasUnresolvedRowCount(snapshot.disciplines, snapshot.sourceDisciplineCount)).toBe(true);
  });

  it("warns about a title only when the PDF contains an explicit ellipsis", () => {
    const siaaLine = line(700, [[29, "005010 - Título que o próprio PDF interrompe…"], [370, "1ª"], [424, "****"], [488, "A CURSAR"], [558, "40"]]);
    const snapshot = extractAcademicGrid({ pageCount: 1, pages: [{ page: 1, width: 600, height: 800, lines: [siaaLine] }], textByPage: ["INFORMAÇÕES ACADÊMICAS DO ALUNO\nS/T: 1/A"], parserVersion: "test" }, "extrato.pdf");
    expect(snapshot.extractionWarnings.join(" ")).toContain("contêm reticências");
  });
});
