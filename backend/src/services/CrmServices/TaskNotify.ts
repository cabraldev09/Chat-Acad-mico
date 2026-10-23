import { getIO } from "../../libs/socket";
import Lead from "../../models/Lead";
import LeadTask from "../../models/LeadTask";
import User from "../../models/User";

// The person a task was given to hears about it at once (the screen of the tasks refreshes and a notice appears), unless they gave it to themselves.
export const notifyTaskAssigned = async (task: LeadTask, byUserId: number | null): Promise<void> => {
  try {
    if (!task.userId || Number(task.userId) === Number(byUserId || 0)) return;
    const lead = await Lead.findByPk(task.leadId, { attributes: ["id", "name"] });
    const by = byUserId ? await User.findByPk(byUserId, { attributes: ["id", "name"] }) : null;
    getIO().to(`user:${task.userId}`).emit("taskAssigned", {
      userId: task.userId,
      taskId: task.id,
      leadId: task.leadId,
      leadName: lead ? lead.name : "",
      title: task.title,
      dueAt: task.dueAt,
      by: by ? by.name : null
    });
  } catch (err) {
    // a notice that cannot be sent never breaks the action that caused it
  }
};

// A student sent to the ambientação: the tutor who follows them and the consultant who sold the enrollment.
export const notifyOnboarding = async (lead: Lead, kind: "assigned" | "done" | "tutor", polo?: string | null): Promise<void> => {
  try {
    const io = getIO();
    const payload = { leadId: lead.id, leadName: lead.name, tutorId: lead.onboardingTutorId || null, ownerId: lead.ownerId || null, poloName: polo || null, kind };
    if (lead.onboardingTutorId && kind !== "done") io.to(`user:${lead.onboardingTutorId}`).emit("onboardingAssigned", { ...payload, userId: lead.onboardingTutorId });
    if (lead.ownerId && lead.ownerId !== lead.onboardingTutorId && kind !== "tutor") io.to(`user:${lead.ownerId}`).emit("onboardingAssigned", { ...payload, userId: lead.ownerId });
  } catch (err) {
    // same: only a notice
  }
};
