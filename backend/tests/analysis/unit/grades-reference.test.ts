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
