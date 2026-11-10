import fs from "fs";
import CommercialGrade from "../../../models/CommercialGrade";
import { gradePath } from "../../Grades";
import { logger } from "../../../utils/logger";
import { parsePdf } from "../pdf/parser";
import { readMatrixLayout } from "./matrix-layout";
import type { MatrixComponent } from "../pipeline/reconcile";

// The official matrix of a course, from the catalog of grades: the disciplines of every série, as the SIAA prints them. Read once per file.
const compact = (s: string | null | undefined): string => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
const cache = new Map<string, MatrixComponent[]>();

export const matrixFor = async (courseName: string | null | undefined, modality?: string | null): Promise<MatrixComponent[] | null> => {
  const key = compact(courseName);
  if (!key) return null;
  try {
    const grades = await CommercialGrade.findAll({ order: [["updatedAt", "DESC"]] });
    const same = grades.filter(g => compact(g.courseName) === key);
    if (!same.length) return null;
    const wanted = compact(modality);
    const grade = (wanted ? same.find(g => compact(g.modality).includes(wanted) || wanted.includes(compact(g.modality))) : null) || same.find(g => /EAD/i.test(g.modality || "")) || same[0];
    const hit = cache.get(grade.contentHash);
    if (hit) return hit;
    const file = gradePath(grade);
    if (!fs.existsSync(file)) return null;
    const local = await parsePdf(fs.readFileSync(file), { maxPages: 80 });
    const read = readMatrixLayout(local.pages);
    const components = (read?.components || []).filter(c => c.name && c.semester > 0);
    if (components.length < 5) return null;
    cache.set(grade.contentHash, components);
    return components;
  } catch (err) {
    logger.warn(`Análise curricular: matriz do curso não lida (${String((err as any)?.message || err).slice(0, 120)})`);
    return null;
  }
};
