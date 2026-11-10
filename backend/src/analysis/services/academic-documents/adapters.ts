import type { LocalExtraction } from "../pdf/parser";
import type { AcademicGridSnapshot } from "../../domain/academic-analysis/types";
import {
  extractAcademicGrid,
  validateAcademicTranscript,
} from "../academic-analysis/extract";
import { classifyAcademicDocument } from "./classifier";
import { extractAcademicHistory } from "./history";
import { PortalInputError } from "../student-portal/input-error";
export function extractAcademicDocument(
  local: LocalExtraction,
  filename: string,
  previous?: AcademicGridSnapshot | null,
) {
  const documentType = classifyAcademicDocument(local);
  if (documentType === "UNKNOWN_ACADEMIC_DOCUMENT")
    throw new PortalInputError(
      "Não conseguimos identificar este documento. Envie um Histórico Escolar Oficial, Histórico Simples para Conferência ou Extrato/Grade Curricular.",
    );
  if (documentType === "CURRICULAR_EXTRACT") {
    const snapshot = extractAcademicGrid(local, filename);
    const issue = validateAcademicTranscript(
      snapshot,
      local.textByPage.join("\n"),
    );
    if (issue) throw new PortalInputError(issue);
    snapshot.documentType = documentType;
    snapshot.disciplines = snapshot.disciplines.map((row) => ({
      ...row,
      curricularPeriodProvenance: {
        source: documentType,
        confirmed: row.period !== null,
      },
    }));
    // Do not erase official totals with a document that does not contain them.
    snapshot.plannedWorkload = previous?.plannedWorkload;
    snapshot.integralizedWorkload = previous?.integralizedWorkload;
    return snapshot;
  }
  const snapshot = extractAcademicHistory(local, documentType, previous);
  if (
    !snapshot.rgm ||
    !snapshot.studentName ||
    !snapshot.courseName ||
    !snapshot.disciplines.length ||
    !snapshot.sourceParsedDisciplineCount
  )
    throw new PortalInputError(
      "O histórico precisa apresentar nome, RGM, curso e disciplinas legíveis. Envie um novo PDF válido.",
    );
  if (
    snapshot.plannedWorkload != null &&
    snapshot.integralizedWorkload != null &&
    (snapshot.plannedWorkload <= 0 ||
      snapshot.integralizedWorkload < 0 ||
      snapshot.integralizedWorkload > snapshot.plannedWorkload)
  )
    throw new PortalInputError(
      "As cargas horárias do histórico precisam de conferência. Envie um novo PDF válido.",
    );
  return snapshot;
}
