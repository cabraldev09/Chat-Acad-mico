import type { AcademicDiscipline, EnrollmentSituation, EnrollmentSituationCode, PeriodSuggestion } from "./types";
import { academicStatusOutcome } from "./rules";

export const ENROLLMENT_LABEL: Record<EnrollmentSituationCode, string> = {
  ACTIVE: "Ativa",
  CANCELLED: "Cancelada",
  LOCKED: "Trancada",
  GRADUATED: "Concluída (formado)",
  TRANSFERRED: "Transferida",
};

const fold = (text: string): string => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

export const enrollmentFromCode = (code: string | null | undefined, source: EnrollmentSituation["source"]): EnrollmentSituation | null => {
  const key = String(code || "").toUpperCase() as EnrollmentSituationCode;
  return ENROLLMENT_LABEL[key] ? { code: key, label: ENROLLMENT_LABEL[key], source } : null;
};

/** The word the academic system prints for the situation ("Cancelado", "Trancada", "Em curso"...) as a code. */
export const classifyEnrollmentWord = (word: string): EnrollmentSituationCode | null => {
  const w = fold(word);
  if (/^CANCELAD/.test(w) || /^DESISTENT/.test(w) || /^JUBILAD/.test(w) || /^EVADID/.test(w)) return "CANCELLED";
  if (/^TRANCAD/.test(w)) return "LOCKED";
  if (/^FORMAD/.test(w) || /^CONCLUID/.test(w) || /^EGRESS/.test(w)) return "GRADUATED";
  if (/^TRANSFERID/.test(w)) return "TRANSFERRED";
  if (/^(ATIV|REGULAR|CURSANDO|EM CURSO|MATRICULAD)/.test(w)) return "ACTIVE";
  return null;
};

/** Reads "Situação da matrícula / do aluno: Cancelado" from the text of a document, when the document prints it. */
export const enrollmentFromText = (text: string): EnrollmentSituation | null => {
  const found = fold(text).match(/SITUACAO\s+(?:DA\s+MATRICULA|DO\s+ALUNO|ACADEMICA|DO\s+VINCULO)\s*[:\-]\s*(?:\d+\s*[-–]\s*)?([A-Z ]{3,24})/);
  if (!found) return null;
  const code = classifyEnrollmentWord(found[1]);
  return code ? { code, label: ENROLLMENT_LABEL[code], source: "DOCUMENT" } : null;
};

export const enrollmentBlocks = (s: EnrollmentSituation | null | undefined): boolean => !!s && s.code !== "ACTIVE";

export const enrollmentWarning = (s: EnrollmentSituation): string => {
  switch (s.code) {
    case "CANCELLED": return "Matrícula cancelada no SIAA: não é possível incluir disciplinas nem projetar a formatura enquanto ela não for reativada.";
    case "LOCKED": return "Matrícula trancada no SIAA: as disciplinas só podem ser incluídas depois do destrancamento.";
    case "GRADUATED": return "O curso consta como concluído no SIAA: não há disciplinas a incluir.";
    default: return "A matrícula consta como transferida no SIAA: não há disciplinas a incluir neste curso.";
  }
};

export const enrollmentMessage = (s: EnrollmentSituation): string => {
  const next =
    s.code === "CANCELLED" ? "Para voltar a estudar, procure o polo ou a secretaria para verificar a reativação da matrícula."
    : s.code === "LOCKED" ? "Para voltar a estudar, procure o polo ou a secretaria para pedir o destrancamento."
    : "Não há pendências para tratar neste curso.";
  return ["Resumo da situação acadêmica:", "", `• Situação da matrícula: ${s.label}.`, `• ${enrollmentWarning(s)}`, next].join("\n");
};

const isDone = (d: AcademicDiscipline): boolean => ["COMPLETED", "EXEMPT"].includes(academicStatusOutcome(d.normalizedStatus));

/**
 * The period the student is in. The history does not print it: the latest period with an enrollment record is taken
 * (the rule of the original system: exemptions are granted in the current period) and then checked against how much of
 * the course is already done (hours, or subjects) over the number of periods of the grid. A big gap between the two means
 * the blocks of the history were probably cut in the wrong places, so the period is only suggested, never confirmed.
 */
export const estimatePeriod = (rows: AcademicDiscipline[], latestTermPeriod: number | null): PeriodSuggestion => {
  const grid = rows.filter((d) => d.inMainCurriculum && d.period !== null && d.period >= 1);
  const last = grid.reduce((max, d) => Math.max(max, d.period as number), 0);
  const inferred = latestTermPeriod;

  let byWorkload: number | null = null;
  if (last > 0) {
    const hours = grid.reduce((n, d) => n + (d.workload || 0), 0);
    const doneHours = grid.filter(isDone).reduce((n, d) => n + (d.workload || 0), 0);
    const ratio = hours > 0 ? doneHours / hours : grid.filter(isDone).length / grid.length;
    byWorkload = Math.min(last, Math.floor(ratio * last) + 1);
  }

  const tolerance = Math.max(1, Math.round(last * 0.15));
  const agrees = inferred !== null && byWorkload !== null && Math.abs(inferred - byWorkload) <= tolerance;
  let note: string;
  if (inferred === null) note = "O histórico não permite deduzir o período atual.";
  else if (byWorkload === null) note = `O histórico indica o ${inferred}º período, mas não foi possível conferir pela carga integralizada.`;
  else if (agrees) note = `O histórico indica o ${inferred}º período e a carga já integralizada confere (cerca do ${byWorkload}º).`;
  else note = `O histórico indica o ${inferred}º período, mas a carga já integralizada corresponde a cerca do ${byWorkload}º. Confira a série do aluno no SIAA (Matrícula › Série) e confirme o período.`;
  return { inferred, byWorkload, method: inferred === null ? null : "LATEST_TERM", agrees, note };
};
