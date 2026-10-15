import { academicStatusOutcome } from "../../domain/academic-analysis/rules";
import { createHash } from "node:crypto";
import type { AcademicGridSnapshot } from "../../domain/academic-analysis/types";

export const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export const canonicalText = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
export const canonicalCourse = (value: string | null | undefined) =>
  canonicalText(value).replace(
    /^(?:CURSO )?(?:SUPERIOR DE TECNOLOGIA EM |TECNOLOGIA EM |BACHARELADO EM |LICENCIATURA EM )/,
    "",
  );
export const canonicalRgm = (value: string) => value.normalize("NFKC").trim();

/** Ignore only explicitly labelled printing metadata, never academic dates or grades. */
export function contentFingerprint(text: string): string | null {
  const normalized = text
    .normalize("NFKC")
    .split(/\r?\n/)
    .filter(
      (line) =>
        !/^\s*(?:Documento (?:gerado|impresso) em|Data (?:de geração|de impressão)|Página \d+ de \d+)\s*[:\d/ .-]*$/iu.test(
          line,
        ),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length >= 80 ? sha256(normalized) : null;
}

function canonicalStatus(value: string) {
  const normalized = canonicalText(value);
  const grade = normalized.match(/^(?:NOTA\s+)?(\d+(?:[.,]\d+)?)$/);
  return grade ? `NOTA ${Number(grade[1].replace(",", "."))}` : normalized;
}

export function academicFingerprint(snapshot: AcademicGridSnapshot): string {
  const rows = snapshot.disciplines
    .map((row) => ({
      code: canonicalText(row.code),
      name: canonicalText(row.name),
      period: row.period,
      status: canonicalStatus(row.normalizedStatus),
      workload: row.workload,
      ...(row.grade &&
      /^\d+(?:[.,]\d+)?$/.test(row.grade) &&
      !/^(?:NOTA )?\d+(?:[.,]\d+)?$/.test(row.normalizedStatus)
        ? { grade: canonicalStatus(row.grade) }
        : {}),
      inMainCurriculum: row.inMainCurriculum,
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return sha256(
    JSON.stringify({
      rgm: canonicalRgm(snapshot.rgm ?? ""),
      course: canonicalCourse(snapshot.courseName),
      plannedWorkload:
        snapshot.plannedWorkload ??
        snapshot.disciplines
          .filter((r) => r.inMainCurriculum)
          .reduce((n, r) => n + (r.workload ?? 0), 0),
      integralizedWorkload:
        snapshot.integralizedWorkload ??
        snapshot.disciplines
          .filter(
            (r) =>
              r.inMainCurriculum &&
              ["COMPLETED", "EXEMPT"].includes(
                academicStatusOutcome(r.normalizedStatus),
              ),
          )
          .reduce((n, r) => n + (r.workload ?? 0), 0),
      period: snapshot.result.currentPeriod,
      confirmed: snapshot.result.currentPeriodConfirmed,
      rows,
    }),
  );
}

export function academicDiff(
  before: AcademicGridSnapshot | null,
  after: AcademicGridSnapshot,
): string[] {
  if (!before) return ["Primeira análise acadêmica disponível."];
  const changes: string[] = [];
  if (
    before.integralizedWorkload !== after.integralizedWorkload &&
    after.integralizedWorkload != null
  )
    changes.push(
      `Carga horária integralizada: ${before.integralizedWorkload ?? "não informada"} → ${after.integralizedWorkload}h.`,
    );
  if (
    before.plannedWorkload !== after.plannedWorkload &&
    after.plannedWorkload != null
  )
    changes.push(
      `Carga horária prevista: ${before.plannedWorkload ?? "não informada"} → ${after.plannedWorkload}h.`,
    );
  const facts: Array<[string, number | null, number | null]> = [
    ["Período atual", before.result.currentPeriod, after.result.currentPeriod],
    [
      "Pendências anteriores",
      before.result.previousPending,
      after.result.previousPending,
    ],
    [
      "Disciplinas anteriores em andamento",
      before.result.previousAlreadyAdded,
      after.result.previousAlreadyAdded,
    ],
    [
      "Aproveitamentos no período",
      before.result.currentPeriodAE,
      after.result.currentPeriodAE,
    ],
  ];
  for (const [label, from, to] of facts)
    if (from !== to)
      changes.push(
        `${label}: ${from ?? "não identificado"} → ${to ?? "não identificado"}.`,
      );
  const key = (row: AcademicGridSnapshot["disciplines"][number]) =>
    `${canonicalText(row.code) || canonicalText(row.name)}:${row.period}:${row.inMainCurriculum}`;
  const statusLabel = (row: AcademicGridSnapshot["disciplines"][number]) =>
    row.grade &&
    /^\d+(?:[.,]\d+)?$/.test(row.grade) &&
    !/^(?:NOTA )?\d+(?:[.,]\d+)?$/.test(row.originalStatus)
      ? `${row.originalStatus} (nota ${row.grade})`
      : row.originalStatus;
  const old = new Map(before.disciplines.map((row) => [key(row), row]));
  for (const row of after.disciplines) {
    const previous = old.get(key(row));
    if (!previous) changes.push(`${row.name}: disciplina adicionada.`);
    else {
      if (
        canonicalStatus(previous.normalizedStatus) !==
          canonicalStatus(row.normalizedStatus) ||
        (previous.grade != null &&
          row.grade != null &&
          canonicalStatus(previous.grade) !== canonicalStatus(row.grade))
      )
        changes.push(
          `${row.name}: ${statusLabel(previous)} → ${statusLabel(row)}.`,
        );
      if (previous.workload !== row.workload)
        changes.push(
          `${row.name}: carga horária ${previous.workload ?? "—"} → ${row.workload ?? "—"}h.`,
        );
      old.delete(key(row));
    }
  }
  for (const row of old.values())
    changes.push(`${row.name}: disciplina removida da grade.`);
  if (canonicalText(before.courseName) !== canonicalText(after.courseName))
    changes.push("Curso atualizado na identificação do extrato.");
  return changes.length ? changes : ["Dados acadêmicos atualizados."];
}
