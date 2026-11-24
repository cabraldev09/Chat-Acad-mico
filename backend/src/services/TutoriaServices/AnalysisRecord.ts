// An analysis (academic or curricular) belongs to the person it is about: it goes into the history of the lead/student, the tutor of the
// student is told (or, for a candidate without a tutor yet, the consultant who owns the lead), and the management may set the tutor when
// the analysis is sent. Nothing here stops the analysis: a failure is only logged.
import Lead from "../../models/Lead";
import Student from "../../models/Student";
import AppError from "../../errors/AppError";
import { addActivity } from "../CrmServices/LeadCore";
import { editOnboarding } from "../CrmServices/EnrollLead";
import { notify } from "../NotificationServices/Notify";
import { logger } from "../../utils/logger";

export type AnalysisKind = "academic" | "curricular";
const LABEL: Record<AnalysisKind, string> = { academic: "Análise acadêmica", curricular: "Análise curricular" };
export const analysisLink = (kind: AnalysisKind, id: number): string => (kind === "academic" ? `/analise-academica/${id}` : `/analise-curricular/${id}`);

// the lead an analysis is about: the one given, or the one of the portal student
export const leadOfAnalysis = async (leadId?: number | null, studentId?: number | null): Promise<Lead | null> => {
  let id = Number(leadId) || 0;
  if (!id && studentId) id = Number((await Student.findByPk(studentId, { attributes: ["leadId"] }))?.leadId) || 0;
  return id ? Lead.findByPk(id) : null;
};

/** The management sets the tutor of the student while sending the analysis (the same change the Ambientação screen makes). */
export const assignTutor = async (actorId: number, input: { leadId?: number | null; studentId?: number | null; tutorId: number | "auto" | null }): Promise<void> => {
  const lead = await leadOfAnalysis(input.leadId, input.studentId);
  if (lead && lead.onboardingStatus !== "none") {
    await editOnboarding(lead, actorId, { tutorId: input.tutorId });
    return;
  }
  // a portal student without an enrollment in the CRM: the tutor of the portal is set directly
  if (input.studentId && typeof input.tutorId === "number") {
    await Student.update({ responsibleUserId: input.tutorId } as any, { where: { id: input.studentId } as any });
    return;
  }
  throw new AppError("ERR_TUTOR_NEEDS_ENROLLMENT", 400);
};

/** The analysis goes into the history of the person and the tutor (or, for a candidate, the consultant) is told. */
export const recordAnalysis = async (input: {
  kind: AnalysisKind; id: number; actorId: number | null; leadId?: number | null; studentId?: number | null; who?: string | null; course?: string | null;
}): Promise<{ leadId: number | null; toldUserId: number | null }> => {
  try {
    const student = input.studentId ? await Student.findByPk(input.studentId, { attributes: ["id", "leadId", "responsibleUserId", "name"] }) : null;
    const lead = await leadOfAnalysis(input.leadId, input.studentId);
    const label = LABEL[input.kind];
    const link = analysisLink(input.kind, input.id);
    const course = String(input.course || "").trim();
    if (lead) await addActivity(lead.id, input.actorId, "system", `${label} registrada${course ? ` (${course})` : ""}.`, { analysisKind: input.kind, analysisId: input.id, link });
    const tutor = lead?.onboardingTutorId || student?.responsibleUserId || null;
    const to = tutor || (input.kind === "curricular" && lead && !lead.enrolledAt ? lead.ownerId : null);
    if (to && to !== input.actorId) {
      const name = String(input.who || lead?.name || student?.name || "").trim();
      const first = name.split(/\s+/)[0] || "o aluno";
      await notify([to], {
        kind: "analysis_done", level: "info", link, dedupeKey: `analysis:${input.kind}:${input.id}:${to}`,
        title: `${label} de ${first}`,
        body: `${tutor ? "Um aluno que você acompanha" : "Um lead seu"} teve a ${label.toLowerCase()} registrada${course ? ` (${course})` : ""}. Ela já está no registro dele.`
      });
      return { leadId: lead?.id || null, toldUserId: to };
    }
    return { leadId: lead?.id || null, toldUserId: null };
  } catch (err: any) {
    logger.warn(`analysis record: ${input.kind} ${input.id}: ${err?.message}`);
    return { leadId: null, toldUserId: null };
  }
};
