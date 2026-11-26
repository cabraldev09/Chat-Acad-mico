import Proposal from "../../models/Proposal";
import { logger } from "../../utils/logger";

// AN "AVULSA" BECOMES A LEAD WHEN IT IS GENERATED (the link, the PDF or the send in a conversation): the person goes to the CRM in the
// "Proposta" column, with the proposal in their history, so the enrollment follows from there (enrollment form, confirmation).
// - The lead is of the consultant chosen in the avulsa (recipientOwnerId), else of who made it.
// - The same person already in the CRM (same CPF or phone) is not doubled: the proposal goes to that lead and its owner stays.
// - Once linked, nothing happens again (the second PDF of the same proposal changes nothing).
export const ownerOfStandalone = (p: { recipientOwnerId?: number | null; createdBy?: number | null }): number | null =>
  Number(p.recipientOwnerId) || Number(p.createdBy) || null;

export const standaloneToCrm = async (p: Proposal, actorId: number, opts: { contactId?: number | null; sent?: boolean } = {}): Promise<{ leadId: number; created: boolean } | null> => {
  if (p.leadId || !p.recipientName) return null;
  const { upsertLead, addActivity, changeStage, loadLead } = await import("../CrmServices/LeadCore");
  const { resolveStage } = await import("../CommercialServices/Pipeline");
  const { markMilestone } = await import("../CommercialServices/Milestones");
  const LeadStage = (await import("../../models/LeadStage")).default;
  const { getIO } = await import("../../libs/socket");
  const ownerId = ownerOfStandalone(p);
  const { lead, created } = await upsertLead({
    name: p.recipientName,
    phone: p.recipientPhone || null,
    cpf: p.recipientCpf || null,
    courseId: p.courseId || null,
    institutionId: p.institutionId || null,
    ownerId,
    contactId: opts.contactId || null,
    source: "Proposta avulsa",
    channel: "proposta"
  } as any, actorId);
  // a lead that already existed keeps its owner; one with nobody gets the chosen one
  if (!created && !lead.ownerId && ownerId) await lead.update({ ownerId });
  await p.update({ leadId: lead.id });
  await addActivity(lead.id, actorId, "system", `Proposta avulsa #${p.id} gerada (${p.courseName || "curso"})${created ? ": lead criado a partir dela" : ""}`);
  if (opts.sent) void markMilestone(lead.id, "proposal_sent");
  // to the column of the proposal when the lead is earlier in the funnel (the same rule as a proposal sent from the CRM)
  const stages = await LeadStage.findAll({ order: [["position", "ASC"]] });
  const proposalStageId = await resolveStage("proposal");
  const target = stages.find(s => s.id === proposalStageId && s.type === "open")
    || stages.find(s => s.type === "open" && /proposta/i.test(s.name) && !/pronto/i.test(s.name));
  const fresh = await lead.reload();
  const current = stages.find(s => s.id === fresh.stageId);
  if (target && current && current.type === "open" && current.position < target.position) await changeStage(lead.id, target.id, actorId);
  try {
    getIO().emit("lead", { action: created ? "create" : "update", lead: await loadLead(lead.id) });
  } catch (err) {
    logger.warn(`lead ${lead.id} event: ${err}`);
  }
  return { leadId: lead.id, created };
};
