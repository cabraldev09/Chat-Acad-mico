import { readFileSync } from "fs";
import { join } from "path";
import Course from "../../models/Course";
import Institution from "../../models/Institution";

// Default catalogue of the operation (graduation courses, format and monthly fee WITHOUT scholarship).
// Lives in backend/data so every environment gets the same list.
const CSV = join(__dirname, "..", "..", "..", "data", "catalogo-cursos-graduacao.csv");
const INSTITUTION = { name: "Universidade Cruzeiro do Sul Virtual", cnpj: "07.158.229/0007-93" };

export const normalizeModalityName = (v: any): string | null => {
  const t = String(v || "").trim();
  if (!t) return null;
  if (/semi/i.test(t)) return "Semipresencial";
  if (/dist|ead|online/i.test(t)) return "EAD";
  if (/flex/i.test(t)) return "Flex";
  if (/presen/i.test(t)) return "Presencial";
  return t;
};

const parseFee = (v: string): number | null => {
  const n = Number(String(v).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
};

export interface CatalogResult {
  created: number;
  updated: number;
  skipped: number;
  total: number;
}

// Idempotent. Courses already registered (same name + category + format) are left as they are, so a price the
// admin changed is never overwritten, unless force is used.
export const loadDefaultCatalog = async (opts: { force?: boolean } = {}): Promise<CatalogResult> => {
  const lines = readFileSync(CSV, "utf8").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  lines.shift();

  let inst = await Institution.findOne({ where: { name: INSTITUTION.name } });
  if (!inst) inst = await Institution.create({ ...INSTITUTION, active: true } as any);

  const result: CatalogResult = { created: 0, updated: 0, skipped: 0, total: 0 };
  for (const line of lines) {
    const [name, category, modality, fee, semesters] = line.split(";").map(c => c.trim());
    if (!name) continue;
    result.total += 1;
    const data: any = {
      name,
      category: category || null,
      modality: normalizeModalityName(modality),
      monthlyFee: parseFee(fee || ""),
      semesters: Number(semesters) >= 1 && Number(semesters) <= 20 ? Number(semesters) : 8,
      institutionId: inst.id,
      active: true
    };
    // eslint-disable-next-line no-await-in-loop
    const existing = await Course.findOne({ where: { name, category: data.category, modality: data.modality } });
    if (!existing) {
      // eslint-disable-next-line no-await-in-loop
      await Course.create(data);
      result.created += 1;
    } else if (opts.force) {
      // eslint-disable-next-line no-await-in-loop
      await existing.update(data);
      result.updated += 1;
    } else {
      result.skipped += 1;
    }
  }
  return result;
};

// First start of an environment: only fills an empty catalogue
export const loadCatalogIfEmpty = async (): Promise<CatalogResult | null> => {
  if (await Course.count()) return null;
  return loadDefaultCatalog();
};
