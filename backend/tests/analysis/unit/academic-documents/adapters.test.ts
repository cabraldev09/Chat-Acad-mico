import { describe, it, expect } from "vitest";
import { parsePdf } from "@/services/pdf/parser";
import {
  classifyAcademicDocument,
  sourceReportText,
} from "@/services/academic-documents/classifier";
import { extractAcademicDocument } from "@/services/academic-documents/adapters";
import { academicFingerprint } from "@/services/student-portal/fingerprints";
import {
  academicPdf,
  academicHistoryPdf,
  selectablePdf,
} from "../../fixtures/academic-pdf";

describe("academic document pipeline", () => {
  it("classifies the three formats by content, independently of filename", async () => {
    for (const [pdf, type] of [
      [academicPdf("12345"), "CURRICULAR_EXTRACT"],
      [academicHistoryPdf("12345"), "SIMPLE_ACADEMIC_HISTORY"],
      [academicHistoryPdf("12345", true), "OFFICIAL_ACADEMIC_HISTORY"],
    ] as const) {
      expect(classifyAcademicDocument(await parsePdf(pdf))).toBe(type);
      expect(
        extractAcademicDocument(await parsePdf(pdf), "arquivo.pdf")
          .documentType,
      ).toBe(type);
    }
  });
  it("rejects unknown documents and does not infer official from lack of simple text", async () => {
    const unknown = await parsePdf(
      selectablePdf([[30, 780, "Um documento qualquer"]]),
    );
    expect(classifyAcademicDocument(unknown)).toBe("UNKNOWN_ACADEMIC_DOCUMENT");
    expect(() =>
      extractAcademicDocument(unknown, "Historico_Oficial.pdf"),
    ).toThrow("Não conseguimos identificar");
    const history = await parsePdf(academicHistoryPdf("12345"));
    history.textByPage = history.textByPage.map((t) =>
      t.replace(/SIMPLES CONFERENCIA|Somente para conferencia/g, ""),
    );
    expect(classifyAcademicDocument(history)).toBe("UNKNOWN_ACADEMIC_DOCUMENT");
  });
  it("tolerates accents and line breaks in simple designation, which takes priority over official cues", async () => {
    const history = await parsePdf(academicHistoryPdf("12345", true));
    history.textByPage.push("SIMPLES\nCONFERÊNCIA");
    expect(classifyAcademicDocument(history)).toBe("SIMPLE_ACADEMIC_HISTORY");
  });
  it("keeps academicTerm 2026/2 separate and never invents curricular periods", async () => {
    const snapshot = extractAcademicDocument(
      await parsePdf(academicHistoryPdf("12345")),
      "simple.pdf",
    );
    expect(
      snapshot.disciplines.every(
        (row) => row.period === null && row.academicTerm === "2026/2",
      ),
    ).toBe(true);
    expect(snapshot.result.currentPeriod).toBeNull();
    expect(snapshot.mappingRequired).toBe(true);
    expect(snapshot.result.status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(snapshot.plannedWorkload).toBe(140);
    expect(snapshot.integralizedWorkload).toBe(40);
  });
  it("reuses mapping and ongoing status by exact code and equates extract with history", async () => {
    const old = extractAcademicDocument(
      await parsePdf(academicPdf("12345")),
      "extract.pdf",
    );
    const history = extractAcademicDocument(
      await parsePdf(academicHistoryPdf("12345")),
      "simple.pdf",
      old,
    );
    expect(history.disciplines.map((r) => r.period)).toEqual([1, 3, 2]);
    expect(history.disciplines[1].normalizedStatus).toBe("CURSANDO");
    expect(
      history.disciplines.every((r) => r.curricularPeriodProvenance?.confirmed),
    ).toBe(true);
    expect(academicFingerprint(history)).toBe(academicFingerprint(old));
  });
  it("ignores official metadata but detects grades, approvals and workload changes", async () => {
    const old = extractAcademicDocument(
      await parsePdf(academicPdf("12345")),
      "extract.pdf",
    );
    const simple = extractAcademicDocument(
      await parsePdf(academicHistoryPdf("12345")),
      "simple.pdf",
      old,
    );
    const official = extractAcademicDocument(
      await parsePdf(academicHistoryPdf("12345", true)),
      "official.pdf",
      simple,
    );
    const changed = extractAcademicDocument(
      await parsePdf(academicHistoryPdf("12345", true, true)),
      "official.pdf",
      simple,
    );
    expect(academicFingerprint(official)).toBe(academicFingerprint(simple));
    expect(academicFingerprint(changed)).not.toBe(academicFingerprint(simple));
    expect(changed.disciplines[0].normalizedStatus).toBe("8.5");
    expect(
      academicFingerprint({ ...simple, integralizedWorkload: 80 }),
    ).not.toBe(academicFingerprint(simple));
  });
  it("labels generated reports by their source, with no conference label for official", () => {
    expect(sourceReportText("SIMPLE_ACADEMIC_HISTORY")).toContain(
      "simples para conferência",
    );
    expect(sourceReportText("OFFICIAL_ACADEMIC_HISTORY")).not.toContain(
      "conferência",
    );
    expect(sourceReportText("CURRICULAR_EXTRACT")).toContain(
      "Extrato Curricular",
    );
  });
});
