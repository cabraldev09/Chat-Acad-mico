import Course from "../../models/Course";
import Lead from "../../models/Lead";
import LeadStage from "../../models/LeadStage";
import { Slots } from "./Slots";

// A contact who is already a student asks about a course: the agent must know it before it explains anything. It asks (once, naturally) whether the
// question is for the person or for someone they know, and it does not explain again what a student of a semipresencial course already lives
// (how it works, the platform, the tutoring). Read once per conversation state, from the lead.
const isSemipresencial = (modality?: string | null): boolean => /semi/i.test(String(modality || ""));

export const studentFacts = async (lead: Lead, slots: Slots): Promise<void> => {
  if (slots.enrolledChecked) return;
  slots.enrolledChecked = true;
  const stage = lead.stageId ? await LeadStage.findByPk(lead.stageId, { attributes: ["type"] }) : null;
  if (!(stage?.type === "won" || lead.wonAt)) return;
  slots.enrolledStudent = true;
  const course = lead.courseId ? await Course.findByPk(lead.courseId, { attributes: ["name", "modality"] }) : null;
  if (course) {
    slots.enrolledCourse = course.name;
    if (isSemipresencial(course.modality)) {
      // already lives it: no explanation of how the semipresencial works, of the platform or of the tutoring
      slots.studentSemipresencial = true;
      slots.modalityExplained = true;
      slots.mecExplained = true;
      slots.platformExplained = true;
      slots.tutoringExplained = true;
    }
  }
  // what the CRM already has for the scholarship simulation
  if (lead.cpf) slots.cpfGiven = true;
  if (lead.name && String(lead.name).trim().split(/\s+/).length >= 2 && !slots.fullName) slots.fullName = String(lead.name).trim();
};
