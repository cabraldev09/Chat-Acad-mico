import type { CurriculumExtraction, ExtractedSubject } from "../openai/schemas";
import type { LocalExtraction } from "../pdf/parser";
import { buildRowHash } from "../../domain/curricular-analysis/engine/row-hash";
import { classifySubject, hasValidUsedSubject } from "../../domain/curricular-analysis/engine/classify";
import type { Readability, SubjectStatus } from "../../domain/curricular-analysis/types";

export interface NormalizedSubject {
  rowHash: string;
  code: string | null;
  name: string;
  workload: number;
  period: number;
  usedSubject: string | null;
  status: SubjectStatus;
  readability: Readability;
  sourcePage: number;
  sourceRow: number;
  bbox: { page: number; x: number; y: number; w: number; h: number; pageWidth: number; pageHeight: number } | null;
  note: string | null;
  sortIndex: number;
  periodKnown: boolean;
}

function cleanName(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, " ").trim().toUpperCase();
}

function cleanUsedSubject(s: string | null): string | null {
  if (s === null) return null;
  const t = s.normalize("NFKC").replace(/\s+/g, " ").trim();
  // marcadores de "sem aproveitamento" ("-", vazio, "não") viram null (§6)
  return hasValidUsedSubject(t) ? t.toUpperCase() : null;
}

function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** A lista de dispensadas do resultado unificado não tem coluna Série por projeto.
 * Se o parser local confirmou a linha, isso não é incerteza de leitura. */
function isConfirmedUnifiedExemption(local: LocalExtraction | null, subject: ExtractedSubject, name: string): boolean {
  const table = local?.table;
  if (!table) return false;
  const isUnified = Object.values(table.freeText).flat().some((line) => line.startsWith("Total de disciplinas dispensadas:"));
  if (!isUnified) return false;
  const row = table.rows.find((candidate) => !candidate.pageBreakDuplicate && candidate.page === subject.sourcePage && candidate.rowIndex === subject.sourceRow);
  return !!row && row.usedSubject !== null && normalizeForMatch(row.name) === normalizeForMatch(name);
}

/** Procura a linha lógica (tabela) ou visual do parser local que corresponde à disciplina. */
function findBoundingBox(local: LocalExtraction | null, subject: ExtractedSubject, name: string, code: string | null): NormalizedSubject["bbox"] {
  if (!local) return null;
  const page = local.pages.find((p) => p.page === subject.sourcePage);
  if (!page) return null;
  // 1) linha lógica reconstruída: por código (mais confiável) ou por nome
  const rows = local.table?.rows.filter((r) => !r.pageBreakDuplicate) ?? [];
  const byCode = code ? rows.find((r) => r.code === code) : undefined;
  const target0 = normalizeForMatch(name);
  const byName = byCode ?? rows.find((r) => r.page === subject.sourcePage && normalizeForMatch(r.name) === target0) ?? rows.find((r) => normalizeForMatch(r.name) === target0);
  if (byName) {
    const rowPage = local.pages.find((p) => p.page === byName.page) ?? page;
    return { page: byName.page, x: byName.bbox.x, y: byName.bbox.y, w: byName.bbox.w, h: byName.bbox.h, pageWidth: rowPage.width, pageHeight: rowPage.height };
  }
  // 2) fallback: linha visual com melhor cobertura de tokens
  const target = normalizeForMatch(name);
  if (!target) return null;
  const tokens = target.split(" ").filter((t) => t.length > 2);
  let best: { score: number; line: (typeof page.lines)[number] } | null = null;
  for (const line of page.lines) {
    const lt = normalizeForMatch(line.text);
    if (!lt) continue;
    let score = 0;
    if (lt.includes(target)) score = 1;
    else if (tokens.length) {
      const hits = tokens.filter((t) => lt.includes(t)).length;
      score = hits / tokens.length;
    }
    if (score >= 0.6 && (!best || score > best.score)) best = { score, line };
  }
  if (!best) return null;
  return {
    page: page.page,
    x: best.line.x,
    y: best.line.y,
    w: best.line.w,
    h: best.line.h,
    pageWidth: page.width,
    pageHeight: page.height,
  };
}

/**
 * Normalização (camada 4): limpa textos, converte números, gera rowHash, classifica e
 * associa a linha do PDF. Não remove nenhuma linha (§8, §9).
 */
export function normalizeExtraction(
  extraction: CurriculumExtraction,
  documentId: string,
  local: LocalExtraction | null,
): NormalizedSubject[] {
  const seen = new Map<string, number>();
  return extraction.subjects.map((s, index) => {
    const name = cleanName(s.name);
    const usedSubject = cleanUsedSubject(s.usedSubject);
    const period = Number.isFinite(s.period) ? Math.trunc(s.period) : 0;
    const workload = Number.isFinite(s.workload) && s.workload >= 0 ? Math.round(s.workload) : 0;
    let rowHash = buildRowHash({ documentId, page: s.sourcePage, rowIndex: s.sourceRow, subjectName: name, period });
    // Proteção contra colisão (mesma página/linha/nome/período repetidos pela IA): sufixo determinístico.
    const count = seen.get(rowHash) ?? 0;
    seen.set(rowHash, count + 1);
    if (count > 0) rowHash = `${rowHash.slice(0, 20)}-${count}`;

    const confirmedUnifiedExemption = isConfirmedUnifiedExemption(local, s, name);
    const readability: Readability = confirmedUnifiedExemption ? "CLEAR" : s.readability;
    const code = s.code && /^\d+$/.test(s.code.trim()) ? s.code.trim() : null;
    return {
      rowHash,
      code,
      name,
      workload,
      period,
      usedSubject,
      status: classifySubject({ usedSubject, readability }),
      readability,
      sourcePage: s.sourcePage,
      sourceRow: s.sourceRow,
      bbox: findBoundingBox(local, s, name, code),
      note: confirmedUnifiedExemption ? null : s.note,
      sortIndex: index,
      periodKnown: !confirmedUnifiedExemption,
    };
  });
}
