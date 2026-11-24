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
  digitalHistoryPdf,
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
  it("reads the digital history: label above the value, term as a separator, teacher under the name", async () => {
    const local = await parsePdf(digitalHistoryPdf("77001"));
    expect(classifyAcademicDocument(local)).toBe("OFFICIAL_ACADEMIC_HISTORY");
    const snapshot = extractAcademicDocument(local, "qualquer.pdf");
    expect(snapshot.studentName).toBe("Aluno Teste Digital");
    expect(snapshot.rgm).toBe("77001");
    expect(snapshot.courseName).toBe("Servico Social (Bacharelado)");
    // the workload of the course, never the "Temas Transversais" footer
    expect(snapshot.plannedWorkload).toBe(300);
    expect(snapshot.integralizedWorkload).toBe(120);
    expect(snapshot.enrollmentSituation?.code).toBe("ACTIVE");
    const byCode = (code: string) => snapshot.disciplines.filter((row) => row.code === code);
    // the repeated subject enters once
    expect(snapshot.disciplines.map((row) => row.code)).toEqual(["101", "102", "103", "201", "202", "203", "301", "302", "401", "402", "403"]);
    expect(snapshot.sourceDisciplineCount).toBe(11);
    expect(byCode("102")[0].name).toBe("Fundamentos do Servico Social: Aspectos Historicos da Profissao");
    expect(snapshot.disciplines.some((row) => /Professor|Informado|Mestrado/.test(row.name))).toBe(false);
    expect(byCode("101")[0]).toMatchObject({ academicTerm: "2025/2", grade: "S", normalizedStatus: "APROVADO", workload: 10 });
    expect(byCode("202")[0]).toMatchObject({ academicTerm: "2026/1", normalizedStatus: "8.0" });
    // the term stays open across the page break
    expect(byCode("203")[0]).toMatchObject({ academicTerm: "2026/1", normalizedStatus: "REPROVADO" });
    expect(byCode("301")[0]).toMatchObject({ academicTerm: "2026/2", grade: null, normalizedStatus: "CURSANDO" });
    expect(byCode("401")[0]).toMatchObject({ academicTerm: null, grade: null, normalizedStatus: "A CURSAR", period: null });
    // period: suggested by the order of the terms, never confirmed; ahead, only the numbered once-per-period components
    expect(byCode("101")[0].period).toBe(1);
    expect(byCode("202")[0].period).toBe(2);
    expect(byCode("302")[0].period).toBe(3);
    expect(byCode("402")[0].period).toBe(4);
    expect(byCode("403")[0].period).toBe(5);
    expect(byCode("101")[0].curricularPeriodProvenance).toEqual({ source: "HISTORY_TERM_ORDER", confirmed: false });
    expect(snapshot.mappingRequired).toBe(true);
    expect(snapshot.extractionWarnings.some((w) => /tabela de disciplinas/.test(w))).toBe(false);
  });
  it("takes the digital history without validation as the copy for checking", async () => {
    const local = await parsePdf(digitalHistoryPdf("77002", false));
    expect(classifyAcademicDocument(local)).toBe("SIMPLE_ACADEMIC_HISTORY");
    const snapshot = extractAcademicDocument(local, "Historico_Oficial.pdf");
    expect(snapshot.documentType).toBe("SIMPLE_ACADEMIC_HISTORY");
    expect(snapshot.disciplines).toHaveLength(11);
  });
  it("keeps what the tutor mapped before when the digital history arrives", async () => {
    const first = extractAcademicDocument(await parsePdf(digitalHistoryPdf("77003")), "a.pdf");
    const mapped = { ...first, disciplines: first.disciplines.map((row) => row.code === "401" ? { ...row, period: 4, manualEdited: true, curricularPeriodProvenance: { source: "TUTOR_CONFIRMED", confirmed: true } } : row) };
    const again = extractAcademicDocument(await parsePdf(digitalHistoryPdf("77003")), "b.pdf", mapped);
    expect(again.disciplines.find((row) => row.code === "401")?.period).toBe(4);
    expect(again.disciplines).toHaveLength(11);
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
