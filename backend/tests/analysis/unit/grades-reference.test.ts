import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { readCommercialGrade } from "../../../src/analysis/services/commercial-grades/reader";

// The folder with every commercial matrix (SIAA "Matriz Curricular" PDFs). It is the data of the real courses, so the
// test runs only where the folder exists: GRADES_DIR=/path/to/pdfs npx vitest run tests/analysis/unit/grades-reference.test.ts
const dir = process.env.GRADES_DIR || path.join(__dirname, "../../../data/grades");
const files = existsSync(dir) ? readdirSync(dir).filter(f => /\.pdf$/i.test(f)) : [];

describe.skipIf(files.length === 0)("every commercial matrix is read from its PDF columns", () => {
  it("reads course, modality, term, hours and duration of every file without failing", async () => {
    const problems: string[] = [];
    const rows: string[] = [];
    for (const file of files) {
      const r = await readCommercialGrade(readFileSync(path.join(dir, file)), file);
      rows.push(`${file} | ${r.courseName} | ${r.modality} | ${r.curriculumTerm} | ${r.degree} | ${r.durationSemesters} sem | ${r.totalCourseHours}h | est ${r.totalInternshipHours} | tcc ${r.hasTcc}`);
      if (!r.courseName) problems.push(`${file}: sem curso`);
      if (r.totalCourseHours === null) problems.push(`${file}: sem carga horária total`);
      if (r.durationSemesters === null) problems.push(`${file}: sem duração`);
      if (!r.modality) problems.push(`${file}: sem modalidade`);
      if (!r.curriculumTerm) problems.push(`${file}: sem vigência`);
    }
    if (process.env.GRADES_VERBOSE) writeFileSync(process.env.GRADES_VERBOSE, rows.join("\n") + "\n\nPROBLEMAS:\n" + problems.join("\n"));
    if (problems.length) console.log("PROBLEMAS:\n" + problems.join("\n"));
    expect(files.length).toBeGreaterThan(0);
    expect(problems.length).toBeLessThanOrEqual(Math.ceil(files.length * 0.05));
  });
});

import { readableName } from "../../../src/analysis/services/commercial-grades/reader";

describe("the text told to the student about the grade", () => {
  it("names read well: capitals, small words and roman numerals", () => {
    expect(readableName("ESTÁGIO CURRICULAR SUPERVISIONADO EM ARTE III")).toBe("Estágio Curricular Supervisionado em Arte III");
    expect(readableName("TERAPIA OCUPACIONAL ÁREA VIII")).toBe("Terapia Ocupacional Área VIII");
    expect(readableName("Letras - Português")).toBe("Letras - Português");
  });

  it("Pedagogia: only the supervised internships are internships (not Ambientação Digital, Plano de Carreira or Seminários)", async () => {
    const dir = path.join(__dirname, "../../../data/grades");
    const r = await readCommercialGrade(readFileSync(path.join(dir, "PEDAGOGIA (LICENCIATURA).PDF")), "PEDAGOGIA (LICENCIATURA).PDF");
    expect(r.totalInternshipHours).toBe(400);
    expect(r.whatsappSummary).not.toMatch(/Ambienta|Plano de Acompanhamento|Semin/i);
    expect(r.whatsappSummary).toMatch(/5º semestre: Educação Infantil \(150 h\)/);
    expect(r.whatsappSummary).toMatch(/400 horas no total/);
    expect(r.whatsappSummary).toMatch(/Carga horária total: 3\.200 horas/);
  });

  it("every shipped matrix fits a PDF caption and lists internships consistent with its total", async () => {
    const dir = path.join(__dirname, "../../../data/grades");
    for (const file of readdirSync(dir).filter(f => /\.pdf$/i.test(f))) {
      // eslint-disable-next-line no-await-in-loop
      const r = await readCommercialGrade(readFileSync(path.join(dir, file)), file);
      expect(r.whatsappSummary.length, file).toBeLessThanOrEqual(1000);
      const hours = [...r.whatsappSummary.matchAll(/\((\d+) h\)/g)].map(m => Number(m[1]));
      if (r.internshipInfo && hours.length && r.totalInternshipHours) expect(hours.reduce((a, b) => a + b, 0), file).toBe(r.totalInternshipHours);
    }
  }, 120000);
});
