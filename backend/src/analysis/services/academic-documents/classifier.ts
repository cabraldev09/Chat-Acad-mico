import type { LocalExtraction } from "../pdf/parser";
export type AcademicDocumentType =
  | "OFFICIAL_ACADEMIC_HISTORY"
  | "SIMPLE_ACADEMIC_HISTORY"
  | "CURRICULAR_EXTRACT"
  | "UNKNOWN_ACADEMIC_DOCUMENT";
export const documentLabels: Record<AcademicDocumentType, string> = {
  OFFICIAL_ACADEMIC_HISTORY: "Histórico Oficial",
  SIMPLE_ACADEMIC_HISTORY: "Simples Conferência",
  CURRICULAR_EXTRACT: "Extrato Curricular",
  UNKNOWN_ACADEMIC_DOCUMENT: "Documento não identificado",
};
export const foldDocument = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
export function classifyAcademicDocument(
  local: LocalExtraction,
): AcademicDocumentType {
  const text = foldDocument(local.textByPage.join("\n"));
  const history =
    /HISTORICO ESCOLAR/.test(text) &&
    /RGM/.test(text) &&
    /DISCIPLINA/.test(text) &&
    /SITUACAO/.test(text) &&
    /(?:C\s*\/\s*HORARIA|CARGA HORARIA)/.test(text);
  if (history) {
    if (
      /SIMPLES\s+CONFERENCIA|(?:APENAS|SOMENTE)\s+PARA\s+CONFERENCIA|VISUALIZACAO\s+PREVIA/.test(
        text,
      ) ||
      local.visualPreviewWatermark
    )
      return "SIMPLE_ACADEMIC_HISTORY";
    const signature =
      /ASSINATURA ELETRONICA|CERTIFICADO DIGITAL|CERTIFICACAO DIGITAL/.test(
        text,
      );
    const verification =
      /HTTPS:\/\/(?:[A-Z0-9.-]+\.EDU\.BR\/|VALIDAR\.ITI\.GOV\.BR)|VALIDACAO DIGITAL|QR\s*CODE/.test(
        text,
      );
    if (signature && verification) return "OFFICIAL_ACADEMIC_HISTORY";
    return "UNKNOWN_ACADEMIC_DOCUMENT";
  }
  const rows = /A\s+CURSAR|CURSANDO|\bAE\*?\b/.test(text);
  const structure =
    /GRADE CURRICULAR|EXTRATO|\bS\s*\/\s*T\b|PERIODO ATUAL/.test(text);
  if (rows && structure && /RGM|ALUNO\s*:/.test(text) && /CURSO\s*:/.test(text))
    return "CURRICULAR_EXTRACT";
  return "UNKNOWN_ACADEMIC_DOCUMENT";
}
export const sourcePriority: Record<AcademicDocumentType, number> = {
  UNKNOWN_ACADEMIC_DOCUMENT: 0,
  CURRICULAR_EXTRACT: 1,
  SIMPLE_ACADEMIC_HISTORY: 2,
  OFFICIAL_ACADEMIC_HISTORY: 3,
};
export function sourceReportText(type: AcademicDocumentType) {
  return type === "SIMPLE_ACADEMIC_HISTORY"
    ? "Análise elaborada a partir de Histórico Escolar simples para conferência."
    : type === "OFFICIAL_ACADEMIC_HISTORY"
      ? "Análise elaborada a partir do Histórico Escolar oficial anexado."
      : "Análise elaborada a partir do Extrato Curricular anexado.";
}
