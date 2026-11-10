import { getIO } from "../../libs/socket";
import Lead from "../../models/Lead";
import LeadTask from "../../models/LeadTask";
import { loadLead } from "./LeadCore";

// the "next contact" of a lead is the earliest task that is still open (the card shows it)
export const syncNextFollowUp = async (leadId: number): Promise<void> => {
  const next = await LeadTask.findOne({ where: { leadId, doneAt: null as any }, order: [["dueAt", "ASC"]] });
  await Lead.update({ nextFollowUpAt: next ? next.dueAt : null }, { where: { id: leadId } });
  const lead = await loadLead(leadId);
  if (lead) getIO().emit("lead", { action: "update", lead });
};
