import { Op } from "sequelize";

import { normalizeEmail, normalizePhone } from "../../helpers/Phone";
import { brPhoneVariants } from "../../helpers/PhoneVariants";
import Contact from "../../models/Contact";
import Course from "../../models/Course";
import Lead from "../../models/Lead";
import LeadStage from "../../models/LeadStage";
import Polo from "../../models/Polo";
import Student from "../../models/Student";
import User from "../../models/User";
import { addActivity } from "../CrmServices/LeadCore";

// The tutor (or the management for a tutor) brings the students they already follow: each one becomes a student of that tutor in the
// whole system (Alunos da tutoria, the portal and the next mass messages). A student already of another tutor is not taken without
// the management. Imported students are "historical": they do not count as new leads or new enrollments in the reports.
export interface ImportRow { line: number; status: "new" | "update" | "error"; name: string; error?: string }

const plain = (s: unknown): string => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const dateOf = (raw: unknown): Date | null => {
  const s = String(raw ?? "").trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const d = br ? new Date(`${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}T12:00:00`) : /^\d{4}-\d{2}-\d{2}/.test(s) ? new Date(`${s.slice(0, 10)}T12:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

export const importTutorStudents = async (
  items: any[], opts: { actorId: number; tutorId: number | null; manager: boolean; dryRun: boolean }
): Promise<{ created: number; updated: number; errors: number; rows: ImportRow[] }> => {
  const [courses, polos, tutors, won] = await Promise.all([
    Course.findAll({ attributes: ["id", "name"] }),
    Polo.findAll({ attributes: ["id", "name", "code", "city"] }),
    User.findAll({ where: { role: { [Op.in]: ["tutor", "academico"] } } as any, attributes: ["id", "name", "email"] }),
    LeadStage.findOne({ where: { type: "won" }, order: [["position", "ASC"]] })
  ]);
  const courseOf = (v: unknown) => { const k = plain(v); return k ? courses.find(c => plain(c.name) === k) || courses.find(c => plain(c.name).startsWith(k)) || null : null; };
  const poloOf = (v: unknown) => { const k = plain(v); return k ? polos.find(p => plain(p.code) === k || plain(p.name) === k) || polos.find(p => plain(p.name).includes(k) || plain(p.city) === k) || null : null; };
  const tutorOf = (v: unknown) => { const k = plain(v); return k ? tutors.find(t => plain(t.email) === k || plain(t.name) === k) || tutors.find(t => plain(t.name).startsWith(k)) || null : null; };
  const rows: ImportRow[] = [];
  for (const [i, it] of items.entries()) {
    const line = i + 1;
    const name = String(it.name || "").replace(/\s+/g, " ").trim().slice(0, 200);
    const phone = normalizePhone(it.phone);
    const email = normalizeEmail(it.email);
    const rgm = String(it.rgm || "").replace(/\s+/g, "").replace(/[^A-Za-z0-9.\-/]/g, "").slice(0, 40) || null;
    const fail = (error: string) => rows.push({ line, status: "error", name, error });
    if (!name) { fail("Falta o nome"); continue; }
    if (!phone && !rgm) { fail("Informe o telefone ou o RGM"); continue; }
    // whose student: the tutor importing, or the tutor named in the line (management)
    let tutorId = opts.tutorId;
    if (opts.manager && it.tutor) {
      const t = tutorOf(it.tutor);
      if (!t) { fail(`Tutor "${it.tutor}" não encontrado`); continue; }
      tutorId = t.id;
    }
    if (!tutorId) { fail("Escolha o tutor"); continue; }
    const course = courseOf(it.course);
    const polo = poloOf(it.polo);
    if (it.polo && !polo) { fail(`Polo "${it.polo}" não encontrado`); continue; }
    // eslint-disable-next-line no-await-in-loop
    const existing = (rgm && (await Lead.findOne({ where: { rgm } }))) ||
      // eslint-disable-next-line no-await-in-loop
      (phone && (await Lead.findOne({ where: { phone: { [Op.in]: brPhoneVariants(phone) } }, order: [["enrolledAt", "DESC NULLS LAST"], ["id", "DESC"]] } as any))) ||
      // eslint-disable-next-line no-await-in-loop
      (email && (await Lead.findOne({ where: { email } }))) || null;
    if (existing && existing.onboardingTutorId && existing.onboardingTutorId !== tutorId && !opts.manager) {
      fail("Já é aluno de outro tutor: peça à coordenação para trocar"); continue;
    }
    rows.push({ line, status: existing ? "update" : "new", name });
    if (opts.dryRun) continue;
    const enrolledAt = dateOf(it.enrolledAt) || new Date();
    if (existing) {
      const patch: any = { onboardingTutorId: tutorId };
      if (!existing.enrolledAt) patch.enrolledAt = enrolledAt;
      if (!existing.onboardingStatus || existing.onboardingStatus === "none") patch.onboardingStatus = "done";
      if (!existing.rgm && rgm) patch.rgm = rgm;
      if (!existing.poloId && polo) patch.poloId = polo.id;
      if (!existing.courseId && course) patch.courseId = course.id;
      if (!existing.phone && phone) patch.phone = phone;
      if (!existing.email && email) patch.email = email;
      // eslint-disable-next-line no-await-in-loop
      await existing.update(patch);
      // eslint-disable-next-line no-await-in-loop
      await addActivity(existing.id, opts.actorId, "system", "Aluno incluído na carteira do tutor pela importação de alunos");
    } else {
      // eslint-disable-next-line no-await-in-loop
      const contact = phone ? await Contact.findOne({ where: { number: { [Op.in]: brPhoneVariants(phone) } }, order: [["id", "ASC"]] }) : null;
      // eslint-disable-next-line no-await-in-loop
      const lead = await Lead.create({
        name, phone, email, rgm, courseId: course?.id || null, poloId: polo?.id || null, stageId: won ? won.id : null, ownerId: null, contactId: contact?.id || null,
        source: "Tutoria (importação)", enrolledAt, onboardingStatus: "done", onboardingTutorId: tutorId, isHistorical: true
      } as any);
      // eslint-disable-next-line no-await-in-loop
      await addActivity(lead.id, opts.actorId, "system", "Aluno importado pela tutoria");
    }
    // the portal: the student of this tutor (by the RGM)
    if (rgm) {
      // eslint-disable-next-line no-await-in-loop
      const lead = await Lead.findOne({ where: { rgm }, attributes: ["id"] });
      // eslint-disable-next-line no-await-in-loop
      const student = await Student.findOne({ where: { rgm } });
      const data: any = { name, responsibleUserId: tutorId, leadId: lead?.id || null, ...(phone ? { phone } : {}), ...(course ? { courseName: course.name } : it.course ? { courseName: String(it.course).slice(0, 200) } : {}), ...(polo ? { poloId: polo.id } : {}) };
      try {
        // eslint-disable-next-line no-await-in-loop
        if (student) await student.update(data);
        // eslint-disable-next-line no-await-in-loop
        else await Student.create({ rgm, ...data, ...(email ? { email } : {}) } as any);
      } catch (err) { /* an e-mail already used by another student: the lead is in, the portal is done by hand */ }
    }
  }
  return { created: rows.filter(r => r.status === "new").length, updated: rows.filter(r => r.status === "update").length, errors: rows.filter(r => r.status === "error").length, rows };
};
