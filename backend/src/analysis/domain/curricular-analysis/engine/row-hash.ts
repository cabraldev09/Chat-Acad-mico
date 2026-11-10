import { createHash } from "node:crypto";

/** Identidade única da linha (§10): documento + página + linha + nome + período. */
export function buildRowHash(input: {
  documentId: string;
  page: number;
  rowIndex: number;
  subjectName: string;
  period: number;
}): string {
  const name = input.subjectName.normalize("NFKC").trim().toUpperCase().replace(/\s+/g, " ");
  const material = `${input.documentId}|${input.page}|${input.rowIndex}|${name}|${input.period}`;
  return createHash("sha256").update(material).digest("hex").slice(0, 24);
}
