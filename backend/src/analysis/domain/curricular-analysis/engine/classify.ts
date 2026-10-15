import type { Readability, SubjectStatus } from "../types";

const EMPTY_MARKERS = new Set(["", "-", "—", "–", "--", "n/a", "nao", "não", "nenhuma", "sem aproveitamento"]);

/** Normaliza o texto da Disciplina Utilizada para decidir se há conteúdo válido. */
export function hasValidUsedSubject(usedSubject: string | null | undefined): boolean {
  if (usedSubject === null || usedSubject === undefined) return false;
  const normalized = usedSubject
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  if (EMPTY_MARKERS.has(normalized)) return false;
  // apenas pontuação/traços
  if (/^[\s\-–—_.·*]+$/.test(normalized)) return false;
  return normalized.length > 0;
}

/**
 * classifySubject — regra operacional §6.
 * Disciplina Utilizada com conteúdo → DISPENSADA; vazia/"-"/null → PENDENTE;
 * leitura duvidosa (UNCLEAR/UNREADABLE) → REVISAR.
 */
export function classifySubject(input: { usedSubject: string | null | undefined; readability?: Readability }): SubjectStatus {
  if (input.readability && input.readability !== "CLEAR") return "REVIEW";
  return hasValidUsedSubject(input.usedSubject) ? "EXEMPTED" : "PENDING";
}
