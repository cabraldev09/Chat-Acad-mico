import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeExtraction } from "@/services/pipeline/normalize";
import { parsePdf } from "@/services/pdf/parser";
import type { CurriculumExtraction } from "@/services/openai/schemas";

const extraction: CurriculumExtraction = {
  document: { course: "Direito", matrix: "2024.1", campus: null, modality: null, candidateLabel: null, detectedEntryPeriod: null, detectedEntryPeriodEvidence: null },
  subjects: [
    { code: null, name: "  Acompanhamento de   Carreira ", workload: 0, period: 2, usedSubject: "Contabilidade Básica", sourcePage: 1, sourceRow: 8, readability: "CLEAR", note: null },
    { code: "10", name: "Ética Profissional", workload: 40, period: 2, usedSubject: " - ", sourcePage: 1, sourceRow: 9, readability: "CLEAR", note: null },
    { code: "11", name: "Ética Profissional", workload: 40, period: 2, usedSubject: null, sourcePage: 1, sourceRow: 9, readability: "UNCLEAR", note: "linha borrada" },
  ],
  documentClaims: [],
  ambiguities: [],
};

describe("normalizeExtraction", () => {
  it("limpa textos, classifica e gera hashes únicos sem descartar linhas", async () => {
    const local = await parsePdf(readFileSync(path.join(__dirname, "../../fixtures/sample-analise.pdf")));
    const rows = normalizeExtraction(extraction, "doc-1", local);
    expect(rows).toHaveLength(3);
    expect(rows[0].name).toBe("ACOMPANHAMENTO DE CARREIRA");
    expect(rows[0].usedSubject).toBe("CONTABILIDADE BÁSICA");
    expect(rows[0].status).toBe("EXEMPTED");
    expect(rows[0].bbox?.page).toBe(1);
    expect(rows[1].usedSubject).toBeNull();
    expect(rows[1].status).toBe("PENDING");
    expect(rows[2].status).toBe("REVIEW");
    expect(new Set(rows.map((r) => r.rowHash)).size).toBe(3);
  });
});
