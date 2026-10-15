import { describe, expect, it } from "vitest";
import {
  academicFingerprint,
  contentFingerprint,
  academicDiff,
} from "@/services/student-portal/fingerprints";
import { extractAcademicGrid } from "@/services/academic-analysis/extract";
import { parsePdf } from "@/services/pdf/parser";
import { academicPdf } from "../../fixtures/academic-pdf";

async function snapshot(status = "A CURSAR") {
  return extractAcademicGrid(
    await parsePdf(academicPdf("987654321", status), { maxPages: 5 }),
    "extrato.pdf",
  );
}
describe("fingerprints acadêmicos", () => {
  it("extrai o PDF real e ignora ordem, posição e marcas editoriais no snapshot", async () => {
    const first = await snapshot();
    expect(first.rgm).toBe("987654321");
    expect(first.disciplines).toHaveLength(3);
    const second = structuredClone(first);
    second.disciplines.reverse();
    second.manuallyEdited = true;
    second.disciplines.forEach((row) => {
      row.sourcePage = 9;
      row.manualEdited = true;
    });
    expect(academicFingerprint(first)).toBe(academicFingerprint(second));
  });
  it("detecta mudança acadêmica e calcula diferenças sem IA", async () => {
    const first = await snapshot();
    const second = await snapshot("CURSANDO");
    expect(academicFingerprint(first)).not.toBe(academicFingerprint(second));
    expect(academicDiff(first, second)).toContain(
      "Pendências anteriores: 1 → 0.",
    );
    expect(academicDiff(first, second)).toContain(
      "Matematica: A CURSAR → CURSANDO.",
    );
  });
  it("normaliza notas equivalentes sem perder mudanças de valor", async () => {
    const first = await snapshot();
    const second = structuredClone(first);
    first.disciplines[0].normalizedStatus = "NOTA 8,50";
    second.disciplines[0].normalizedStatus = "8.5";
    expect(academicFingerprint(first)).toBe(academicFingerprint(second));
    second.disciplines[0].normalizedStatus = "8.6";
    expect(academicFingerprint(first)).not.toBe(academicFingerprint(second));
  });
  it("preserva notas, carga, inclusão na grade, período, RGM e curso", async () => {
    const original = await snapshot();
    for (const change of [
      (s: typeof original) => {
        s.disciplines[0].normalizedStatus = "NOTA 8.5";
      },
      (s: typeof original) => {
        s.disciplines[0].workload = 80;
      },
      (s: typeof original) => {
        s.disciplines[0].inMainCurriculum = false;
      },
      (s: typeof original) => {
        s.result.currentPeriod = 4;
      },
      (s: typeof original) => {
        s.rgm = "000000001";
      },
      (s: typeof original) => {
        s.courseName = "Pedagogia";
      },
    ]) {
      const copy = structuredClone(original);
      change(copy);
      expect(academicFingerprint(copy)).not.toBe(academicFingerprint(original));
    }
  });
  it("ignora espaços e metadata de impressão, mas mantém datas acadêmicas", () => {
    const text =
      "RGM: 12345678 Curso: Administracao Matematica periodo 1 A CURSAR 40 horas Economia periodo 2 CURSANDO 60 horas";
    expect(
      contentFingerprint(`${text}\nDocumento impresso em: 25/09/2026`),
    ).toBe(contentFingerprint(text.replace(/ /g, "  \n")));
    expect(
      contentFingerprint(text + " Inicio do semestre: 01/02/2026"),
    ).not.toBe(contentFingerprint(text + " Inicio do semestre: 01/08/2026"));
    expect(contentFingerprint(" ")).toBeNull();
  });
});
