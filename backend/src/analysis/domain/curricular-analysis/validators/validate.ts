import type { CurriculumTotals, SimulationResult, SubjectRow } from "../types";

export interface ValidationViolation {
  code:
    | "TOTALS_DO_NOT_ADD_UP"
    | "ROW_LOST"
    | "SUBJECT_SCHEDULED_TWICE"
    | "SUBJECT_SCHEDULED_AND_IN_BACKLOG"
    | "CAPACITY_EXCEEDED"
    | "EXEMPTED_SUBJECT_SCHEDULED"
    | "BACKLOG_NOT_ACCOUNTED";
  message: string;
  subjectId?: string;
  semesterIndex?: number;
}

/**
 * validateAnalysis — invariantes do §40. Retorna violações; nunca corrige.
 */
export function validateAnalysis(input: {
  extractedCount: number;
  subjects: SubjectRow[];
  totals: CurriculumTotals;
  simulation: SimulationResult | null;
}): ValidationViolation[] {
  const v: ValidationViolation[] = [];
  const { subjects, totals, simulation } = input;

  if (totals.total !== totals.exempted + totals.pending + totals.review) {
    v.push({ code: "TOTALS_DO_NOT_ADD_UP", message: `Total ${totals.total} ≠ ${totals.exempted} + ${totals.pending} + ${totals.review}.` });
  }
  if (subjects.length !== input.extractedCount) {
    v.push({ code: "ROW_LOST", message: `Extraídas ${input.extractedCount} linhas, mas ${subjects.length} foram preservadas.` });
  }

  if (simulation) {
    const byId = new Map(subjects.map((s) => [s.id, s]));
    const scheduled = new Map<string, number>();
    for (const sem of simulation.semesters) {
      if (sem.semesterLoad > sem.maximumCapacity) {
        v.push({ code: "CAPACITY_EXCEEDED", message: `Semestre ${sem.term}: carga ${sem.semesterLoad} > capacidade ${sem.maximumCapacity}.`, semesterIndex: sem.index });
      }
      for (const id of [...sem.regularSubjectIds, ...sem.backlogSubjectIds]) {
        if (scheduled.has(id)) {
          v.push({ code: "SUBJECT_SCHEDULED_TWICE", message: `Disciplina ${byId.get(id)?.name ?? id} programada em dois semestres.`, subjectId: id, semesterIndex: sem.index });
        }
        scheduled.set(id, sem.index);
        const subj = byId.get(id);
        if (subj?.status === "EXEMPTED") {
          v.push({ code: "EXEMPTED_SUBJECT_SCHEDULED", message: `Disciplina dispensada "${subj.name}" foi programada para cursar.`, subjectId: id, semesterIndex: sem.index });
        }
      }
    }
    const remaining = new Set(simulation.remainingBacklogIds);
    for (const id of scheduled.keys()) {
      if (remaining.has(id)) {
        v.push({ code: "SUBJECT_SCHEDULED_AND_IN_BACKLOG", message: `Disciplina ${byId.get(id)?.name ?? id} está programada e também no backlog.`, subjectId: id });
      }
    }
    for (const id of simulation.initialBacklogIds) {
      if (!scheduled.has(id) && !remaining.has(id)) {
        v.push({ code: "BACKLOG_NOT_ACCOUNTED", message: `Pendência ${byId.get(id)?.name ?? id} desapareceu da simulação.`, subjectId: id });
      }
    }
  }
  return v;
}
