import { describe, expect, it } from "vitest";
import {
  applyHistoryPeriodInference,
  inferHistoryPeriods,
} from "@/domain/academic-analysis/history-period-inference";
import { analyzeAcademicGrid } from "@/domain/academic-analysis/analyze";
import type { AcademicDiscipline, AcademicGridSnapshot } from "@/domain/academic-analysis/types";

type Row = [name: string, term: string | null, status: string];

const GTI: Row[][] = [
  [
    ["AMBIENTAÇÃO DIGITAL", "2026/2", "AE*"],
    ["ATIVIDADES DE EXTENSÃO: TRANSFORMAR O EU", "2026/2", "PENDENTE"],
    ["AVALIAÇÃO INTEGRADA DE COMPETÊNCIAS EM GESTÃO DA TI", "2026/2", "AE*"],
    ["FUNDAMENTOS DE TECNOLOGIA DA INFORMAÇÃO", null, "PENDENTE"],
    ["LÍNGUA PORTUGUESA", null, "PENDENTE"],
    ["PLANO DE ACOMPANHAMENTO DE CARREIRA EM GESTÃO DA TI", "2026/2", "AE*"],
    ["REDES DE COMPUTADORES", "2026/2", "AE*"],
  ],
  [
    ["ANÁLISE E PROJETOS DE SISTEMAS", "2026/2", "PENDENTE"],
    ["AVALIAÇÃO INTEGRADA DE COMPETÊNCIAS EM GESTÃO DA TI I", "2026/2", "AE*"],
    ["MODELAGEM DE DADOS", "2026/2", "AE*"],
    ["PLANO DE ACOMPANHAMENTO DE CARREIRA EM GESTÃO DA TI I", "2026/2", "AE*"],
  ],
  [
    ["AUDITORIA DE SISTEMAS", null, "PENDENTE"],
    ["AVALIAÇÃO INTEGRADA DE COMPETÊNCIAS EM GESTÃO DA TI II", "2026/2", "AE*"],
    ["BANCOS DE DADOS", null, "PENDENTE"],
    ["PLANO DE ACOMPANHAMENTO DE CARREIRA EM GESTÃO DA TI II", "2026/2", "AE*"],
  ],
];

function rows(groups: Row[][]): AcademicDiscipline[] {
  return groups.flat().map(([name, term, status], index) => ({
    code: String(index + 1),
    name,
    rawPeriod: "",
    period: null,
    academicTerm: term,
    grade: status === "AE*" ? "AE*" : null,
    originalStatus: status === "AE*" ? "APROVADO" : status,
    normalizedStatus: status === "AE*" ? "AE*" : "A CURSAR",
    workload: 40,
    inMainCurriculum: true,
    sourcePage: 1,
    sourceRow: index + 1,
    manualEdited: false,
  }));
}

function snapshot(disciplines: AcademicDiscipline[]): AcademicGridSnapshot {
  return {
    documentType: "SIMPLE_ACADEMIC_HISTORY",
    disciplines,
    result: analyzeAcademicGrid({ disciplines, currentPeriod: null, currentPeriodConfirmed: false }),
    studentName: null,
    rgm: null,
    courseName: null,
    extractionWarnings: ["MAPEAMENTO CURRICULAR NECESSÁRIO: teste"],
    manuallyEdited: false,
  };
}

describe("inferência de período pelo histórico", () => {
  it("corta períodos quando a ordem alfabética reinicia", () => {
    const inference = inferHistoryPeriods(rows(GTI));
    expect(inference.confident).toBe(true);
    expect(inference.periodCount).toBe(3);
    expect(inference.periods).toEqual(GTI.flatMap((group, period) => group.map(() => period + 1)));
    expect(inference.currentPeriod).toBe(3);
  });

  it("separa períodos que não reiniciam a ordem usando componentes-âncora", () => {
    const merged = rows([
      [
        ["ANÁLISE", "2025/1", "AE*"],
        ["BANCO DE DADOS", "2025/1", "AE*"],
        ["PLANO DE ACOMPANHAMENTO I", "2025/1", "AE*"],
      ],
      [
        ["PLANO DE ACOMPANHAMENTO II", "2025/2", "AE*"],
        ["REDES", "2025/2", "AE*"],
        ["SISTEMAS", "2025/2", "AE*"],
      ],
    ]);
    expect(inferHistoryPeriods(merged).periods).toEqual([1, 1, 1, 2, 2, 2]);
  });

  it("não inventa períodos quando os blocos não são confiáveis", () => {
    const inference = inferHistoryPeriods(rows([[["MATEMÁTICA", "2026/2", "PENDENTE"]], [["GESTÃO", "2026/2", "PENDENTE"]], [["ECONOMIA", "2026/2", "AE*"]]]));
    expect(inference.confident).toBe(false);
    const applied = applyHistoryPeriodInference(snapshot(rows([[["MATEMÁTICA", "2026/2", "PENDENTE"]], [["GESTÃO", "2026/2", "PENDENTE"]]])));
    expect(applied.applied).toBe(false);
    expect(applied.snapshot.disciplines.every((row) => row.period === null)).toBe(true);
  });

  it("aplica o mapeamento, identifica o período atual e marca disciplinas em curso", () => {
    const applied = applyHistoryPeriodInference(snapshot(rows(GTI)));
    expect(applied.applied).toBe(true);
    expect(applied.snapshot.mappingRequired).toBe(false);
    expect(applied.snapshot.result.currentPeriod).toBe(3);
    expect(applied.snapshot.result.currentPeriodConfirmed).toBe(true);
    const analysis = applied.snapshot.disciplines.find((row) => row.name.startsWith("ANÁLISE"));
    expect(analysis?.normalizedStatus).toBe("CURSANDO");
    const fundamentals = applied.snapshot.disciplines.find((row) => row.name.startsWith("FUNDAMENTOS"));
    expect(fundamentals?.normalizedStatus).toBe("A CURSAR");
    expect(applied.snapshot.disciplines.every((row) => row.curricularPeriodProvenance?.source === "HISTORY_ORDER_INFERENCE")).toBe(true);
    expect(applied.snapshot.extractionWarnings.some((w) => w.startsWith("MAPEAMENTO"))).toBe(false);
  });

  it("preserva períodos e período atual já confirmados pelo tutor", () => {
    const base = snapshot(rows(GTI));
    base.disciplines[0].period = 1;
    base.result = analyzeAcademicGrid({ disciplines: base.disciplines, currentPeriod: 2, currentPeriodConfirmed: true });
    const applied = applyHistoryPeriodInference(base);
    expect(applied.snapshot.result.currentPeriod).toBe(2);
    expect(applied.mappedRows).toBe(base.disciplines.length - 1);
  });
});
