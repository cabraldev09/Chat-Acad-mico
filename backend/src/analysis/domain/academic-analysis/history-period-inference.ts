import type { AcademicDiscipline, AcademicGridSnapshot } from "./types";
import { analyzeAcademicGrid } from "./analyze";
import { estimatePeriod } from "./enrollment";

/**
 * O Histórico Escolar lista as disciplinas período a período e, dentro de cada
 * período, em ordem alfabética. Uma "volta" na ordem alfabética marca o início
 * do período seguinte. Componentes que existem uma única vez por período
 * (Plano de Acompanhamento, Projeto Integrador, Avaliação Integrada, Atividades
 * de Extensão) confirmam os cortes e separam períodos que não "voltaram".
 */
export const HISTORY_ORDER_SOURCE = "HISTORY_ORDER_INFERENCE";

const ANCHOR_FAMILIES: RegExp[] = [
  /^PLANO DE ACOMPANHAMENTO/,
  /^PROJETOS? INTEGRADOR/,
  /^AVALIACAO INTEGRADA/,
  /^ATIVIDADES DE EXTENSAO/,
];

export function sortKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface HistoryPeriodInference {
  /** Período inferido para cada disciplina recebida, na mesma ordem. */
  periods: number[];
  periodCount: number;
  currentPeriod: number | null;
  confident: boolean;
  reasons: string[];
}

/** Recebe as disciplinas na ordem em que aparecem no documento. */
export function inferHistoryPeriods(
  rows: Array<Pick<AcademicDiscipline, "name" | "academicTerm">>,
): HistoryPeriodInference {
  const keys = rows.map((row) => sortKey(row.name));
  const runs: number[][] = [];
  keys.forEach((key, index) => {
    const current = runs.at(-1);
    if (!current || key < keys[index - 1]) runs.push([index]);
    else current.push(index);
  });

  const split: number[][] = [];
  for (const run of runs) {
    let part: number[] = [];
    const seen = new Set<number>();
    for (const index of run) {
      const family = ANCHOR_FAMILIES.findIndex((pattern) => pattern.test(keys[index]));
      if (family >= 0 && seen.has(family)) {
        split.push(part);
        part = [];
        seen.clear();
      }
      if (family >= 0) seen.add(family);
      part.push(index);
    }
    if (part.length) split.push(part);
  }

  const periods = new Array<number>(rows.length).fill(0);
  split.forEach((run, period) => run.forEach((index) => (periods[index] = period + 1)));

  const reasons: string[] = [];
  const anchored = split.filter((run) =>
    run.some((index) => ANCHOR_FAMILIES.some((pattern) => pattern.test(keys[index]))),
  ).length;
  const singles = split.filter((run) => run.length === 1).length;
  const averageSize = rows.length / Math.max(split.length, 1);
  const anchorCoverage = split.length ? anchored / split.length : 0;
  if (split.length < 2) reasons.push("Apenas um bloco de disciplinas foi identificado.");
  if (split.length > 20) reasons.push("Mais de 20 blocos identificados.");
  if (averageSize < 3) reasons.push("Blocos pequenos demais para indicar períodos.");
  if (singles > Math.max(1, split.length * 0.2)) reasons.push("Muitos blocos com uma única disciplina.");
  if (anchorCoverage < 0.6 && averageSize < 5) reasons.push("Poucos componentes-âncora por período.");
  const confident = reasons.length === 0;

  // Período mais avançado com matrícula registrada (cursada, aproveitada ou em curso).
  const withTerm = periods.filter((_, index) => isAcademicTerm(rows[index].academicTerm));
  const currentPeriod = withTerm.length ? Math.max(...withTerm) : null;

  return { periods, periodCount: split.length, currentPeriod, confident, reasons };
}

function isAcademicTerm(term: string | null | undefined): term is string {
  return Boolean(term && /^\d{4}\/[12]$/.test(term));
}

export function latestAcademicTerm(rows: Array<Pick<AcademicDiscipline, "academicTerm">>): string | null {
  return rows.map((row) => row.academicTerm).filter(isAcademicTerm).sort().at(-1) ?? null;
}

export const MAPPING_WARNING_PATTERN = /^MAPEAMENTO CURRICULAR NECESS/;

export interface AppliedHistoryMapping {
  snapshot: AcademicGridSnapshot;
  applied: boolean;
  mappedRows: number;
  inference: HistoryPeriodInference;
}

/**
 * Preenche períodos curriculares ainda vazios a partir da ordem do histórico.
 * Nunca sobrescreve período já mapeado (tutor, extrato ou análise anterior) e
 * não aplica nada quando os cortes não são confiáveis.
 */
export function applyHistoryPeriodInference(
  input: AcademicGridSnapshot,
  assigned?: number[],
): AppliedHistoryMapping {
  const snapshot = structuredClone(input);
  const sourceIndexes = snapshot.disciplines
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.sourcePage > 0)
    .sort((a, b) => a.row.sourcePage - b.row.sourcePage || a.row.sourceRow - b.row.sourceRow)
    .map(({ index }) => index);
  const ordered = sourceIndexes.map((index) => snapshot.disciplines[index]);
  const inference = inferHistoryPeriods(ordered);
  const periods = assigned ?? inference.periods;
  const trusted = Boolean(assigned) || inference.confident;
  const needsMapping = ordered.some((row) => row.inMainCurriculum && row.period === null);
  if (!trusted || !needsMapping || periods.length !== ordered.length)
    return { snapshot: input, applied: false, mappedRows: 0, inference };

  // Se a análise já tinha períodos, a inferência precisa concordar com eles.
  const known = ordered.filter((row, i) => row.period !== null && periods[i] > 0);
  const disagreements = known.filter((row) => row.period !== periods[ordered.indexOf(row)]).length;
  if (known.length >= 5 && disagreements / known.length > 0.2)
    return { snapshot: input, applied: false, mappedRows: 0, inference };

  const latestTerm = latestAcademicTerm(ordered);
  const source = assigned ? "AI_ASSISTED_HISTORY_MAPPING" : HISTORY_ORDER_SOURCE;
  let mappedRows = 0;
  ordered.forEach((row, i) => {
    if (row.period !== null || !(periods[i] >= 1 && periods[i] <= 20)) return;
    row.period = periods[i];
    row.rawPeriod = `${periods[i]}º período (identificado automaticamente)`;
    row.curricularPeriodProvenance = { source, confirmed: true };
    if (
      row.normalizedStatus === "A CURSAR" &&
      /PENDENTE/.test(row.originalStatus) &&
      latestTerm &&
      row.academicTerm === latestTerm
    )
      row.normalizedStatus = "CURSANDO";
    mappedRows++;
  });

  const latestTermPeriod = assigned
    ? Math.max(0, ...ordered.filter((row) => isAcademicTerm(row.academicTerm)).map((row) => row.period ?? 0)) || null
    : inference.currentPeriod;
  // never trust the order of the history alone: the period is deduced two ways and only confirmed when they agree
  const suggestion = estimatePeriod(snapshot.disciplines, latestTermPeriod);
  snapshot.periodSuggestion = suggestion;
  const keepCurrent = snapshot.result.currentPeriodConfirmed && snapshot.result.currentPeriod !== null;
  const currentPeriod = keepCurrent ? snapshot.result.currentPeriod : suggestion.inferred;
  const currentPeriodConfirmed = keepCurrent || (suggestion.inferred !== null && suggestion.agrees);
  snapshot.result = analyzeAcademicGrid({
    disciplines: snapshot.disciplines,
    currentPeriod,
    currentPeriodConfirmed,
  });
  snapshot.mappingRequired =
    !currentPeriodConfirmed || snapshot.disciplines.some((row) => row.inMainCurriculum && row.period === null);
  snapshot.extractionWarnings = snapshot.extractionWarnings.filter((warning) => !MAPPING_WARNING_PATTERN.test(warning));
  if (snapshot.mappingRequired)
    snapshot.extractionWarnings.push(
      "MAPEAMENTO CURRICULAR NECESSÁRIO: o tutor deve confirmar a posição curricular e o período atual. Semestre letivo não é período curricular.",
    );
  if (!currentPeriodConfirmed && suggestion.inferred !== null) snapshot.extractionWarnings.push(suggestion.note);
  return { snapshot, applied: mappedRows > 0, mappedRows, inference };
}
