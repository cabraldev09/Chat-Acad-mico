import { Op } from "sequelize";

import Lead from "../../models/Lead";
import LeadTask from "../../models/LeadTask";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";

// The automatic tasks close by themselves when what they ask for happens: nobody has to tick "Atender lead encaminhado pelo agente de IA"
// after answering, nor "Pedir o histórico" after the PDF arrived. A closed task keeps the reason (closedReason).
const ONBOARDING = ["onboarding", "onboarding_late", "upsell", "nps", "retention", "referral", "tutoria_pendencia"];

export const closeTasksFor = async (leadId: number, kinds: string[] | null, reason: string, opts: { exceptKinds?: string[] } = {}): Promise<number> => {
  try {
    const where: any = { leadId, doneAt: null };
    if (kinds) where.kind = { [Op.in]: kinds };
    else if (opts.exceptKinds?.length) where.kind = { [Op.notIn]: opts.exceptKinds };
    const open = await LeadTask.findAll({ where, attributes: ["id", "userId"] });
    if (!open.length) return 0;
    await LeadTask.update({ doneAt: new Date(), closedReason: reason } as any, { where: { id: open.map(t => t.id), doneAt: null } as any });
    const { syncLeadFollowUp } = await import("./Tasks");
    await syncLeadFollowUp(leadId);
    [...new Set(open.map(t => t.userId).filter(Boolean))].forEach(userId => getIO().emit("taskChanged", { userId, leadId }));
    return open.length;
  } catch (err) {
    logger.warn(`Tarefas do lead #${leadId} não fechadas (${reason}): ${(err as Error).message}`);
    return 0;
  }
};

// the lead won or lost: what was open for the sale closes (the tasks of the onboarding of a new student stay)
export const closeOnStage = (leadId: number, type: "won" | "lost"): Promise<number> =>
  type === "won" ? closeTasksFor(leadId, null, "lead_won", { exceptKinds: ONBOARDING }) : closeTasksFor(leadId, null, "lead_lost");

// the academic transcript arrived (a PDF in the conversation, or an analysis created for the lead): the task that asked for it closes and
// a lead still in "Aguardando histórico" goes to "Análise curricular", also after the AI handed it to a person
export const transcriptArrived = async (leadId: number, actorId: number | null = null): Promise<void> => {
  try {
    await closeTasksFor(leadId, ["transcript"], "transcript_received");
    const { resolveStage } = await import("../CommercialServices/Pipeline");
    const [waiting, analysis] = await Promise.all([resolveStage("waiting_transcript"), resolveStage("curricular_analysis")]);
    if (!waiting || !analysis) return;
    const lead = await Lead.findByPk(leadId, { attributes: ["id", "stageId"] });
    if (!lead || Number(lead.stageId) !== Number(waiting)) return;
    const { changeStage } = await import("./LeadCore");
    await changeStage(lead.id, analysis, actorId);
  } catch (err) {
    logger.warn(`Histórico recebido do lead #${leadId}: ${(err as Error).message}`);
  }
};
