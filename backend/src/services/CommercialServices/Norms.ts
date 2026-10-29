import { Op } from "sequelize";

import CourseCohort from "../../models/CourseCohort";
import RegulatoryNorm from "../../models/RegulatoryNorm";
import { CohortView, NORMS } from "./MecKnowledge";

// The register of the national norms the agents rely on. The texts shipped by the system were read from the official publication; the team records
// here when a norm is amended and when someone last checked it, and the agents are told the status (an amended norm is never quoted as current).

export const STALE_DAYS = 90;

export const seedNorms = async (): Promise<number> => {
  let changed = 0;
  for (const n of NORMS) {
    // eslint-disable-next-line no-await-in-loop
    const row = await RegulatoryNorm.findOne({ where: { key: n.key } });
    if (!row) {
      // eslint-disable-next-line no-await-in-loop
      await RegulatoryNorm.create({ key: n.key, title: n.title, number: n.number, kind: n.kind, publishedAt: n.publishedAt, sourceUrl: n.sourceUrl, summary: n.summary, status: "vigente", fromSystem: true } as any);
      changed += 1;
    } else if (row.fromSystem && (row.summary !== n.summary || row.title !== n.title)) {
      // the text of the system improved and nobody wrote over it
      // eslint-disable-next-line no-await-in-loop
      await row.update({ summary: n.summary, title: n.title, sourceUrl: row.sourceUrl || n.sourceUrl } as any);
      changed += 1;
    }
  }
  return changed;
};

export const isStale = (row: { reviewedAt?: Date | null }, now = Date.now()): boolean => !row.reviewedAt || now - new Date(row.reviewedAt).getTime() > STALE_DAYS * 86400000;

const STATUS_NOTE: Record<string, string> = {
  vigente: "Situação: vigente.",
  alterada: "Situação: ALTERADA por norma posterior. Afirme apenas o que está confirmado neste texto e nas alterações registradas abaixo; para o restante, diga que o consultor confirma.",
  revogada: "Situação: REVOGADA. Não cite esta norma como regra atual."
};

// the text that goes to the knowledge base of the agents
export const normDocContent = (n: RegulatoryNorm): string => {
  const lines = [n.summary, STATUS_NOTE[n.status] || STATUS_NOTE.vigente];
  if (n.amendments && n.amendments.trim()) lines.push(`Alterações posteriores registradas pela instituição: ${n.amendments.trim()}`);
  lines.push(n.reviewedAt ? `Última conferência com a fonte oficial: ${new Date(n.reviewedAt).toISOString().slice(0, 10)}.` : "Ainda não foi conferida com o Diário Oficial por uma pessoa da equipe: se a pergunta exigir exatidão, o consultor confirma.");
  if (n.sourceUrl) lines.push(`Fonte: ${n.sourceUrl}`);
  return lines.join("\n");
};

export const normsList = async (): Promise<Array<Record<string, any>>> => {
  const rows = await RegulatoryNorm.findAll({ order: [["publishedAt", "ASC"], ["id", "ASC"]] });
  return rows.map(r => ({ ...r.toJSON(), stale: isStale(r) }));
};

// ------------------------------------------------------------------ the classes (turmas)
const view = (c: CourseCohort): CohortView => ({
  id: c.id, label: c.label, intakeTerm: c.intakeTerm || null, intakeDate: c.intakeDate || null, contractedModality: c.contractedModality || null,
  transitionRegime: c.transitionRegime || null, transitionNote: c.transitionNote || null, expectedCalendar: c.expectedCalendar || null, presencialStart: c.presencialStart || null,
  syncRules: c.syncRules || null, practiceSchedule: c.practiceSchedule || null, practiceDefined: c.practiceDefined ?? null, assessmentsStatus: c.assessmentsStatus || null,
  assessmentsNote: c.assessmentsNote || null, activityLocation: c.activityLocation || null
});

// the published class of the course for the intake period (and the polo, when the lead has one): the one of the polo wins over the general one
export const cohortFor = async (courseId: number, intake: string | null, poloId?: number | null): Promise<CohortView | null> => {
  const rows = await CourseCohort.findAll({ where: { courseId, published: true } as any, order: [["updatedAt", "DESC"]] });
  if (!rows.length) return null;
  const term = intake ? intake.replace(".", "/") : null;
  const byTerm = rows.filter(r => !r.intakeTerm || (term && r.intakeTerm === term));
  // no intake known: only when the course has a single published class is it safe to talk about it
  const pool = term ? byTerm : rows.length === 1 ? rows : [];
  if (!pool.length) return null;
  const ranked = [...pool].sort((a, b) => {
    const score = (r: CourseCohort) => (poloId && r.poloId === poloId ? 4 : r.poloId ? -10 : 0) + (term && r.intakeTerm === term ? 2 : 0);
    return score(b) - score(a);
  });
  const best = ranked[0];
  // a class of another polo is never told to this lead
  if (best.poloId && (!poloId || best.poloId !== poloId)) return null;
  return view(best);
};

export const cohortsOfCourse = (courseId: number): Promise<CourseCohort[]> => CourseCohort.findAll({ where: { courseId } as any, order: [["intakeDate", "DESC"], ["id", "DESC"]] });

// how many published classes are missing the facts the lead usually asks about (for the health panel)
export const cohortGaps = async (): Promise<{ published: number; incomplete: number }> => {
  const rows = await CourseCohort.findAll({ where: { published: true, [Op.or]: [{ expectedCalendar: null }, { presencialStart: null }, { syncRules: null }, { activityLocation: null }] } as any });
  const published = await CourseCohort.count({ where: { published: true } as any });
  return { published, incomplete: rows.length };
};
