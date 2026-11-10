import { Op } from "sequelize";

import { getSetting } from "../helpers/AppSettings";
import ChatFlow from "../models/ChatFlow";
import ChatFlowRun from "../models/ChatFlowRun";
import Lead from "../models/Lead";
import LeadCommercial from "../models/LeadCommercial";
import Ticket from "../models/Ticket";
import { dbPorts } from "../services/CommercialServices/Ports";
import { canAutoMove } from "../services/CommercialServices/Rules";
import { hydrate, loadState } from "../services/CommercialServices/Slots";
import { logger } from "../utils/logger";

// An AI agent conversation that nobody continues does not stay open forever: after a few days (Setting `ai_stale_run_days`, default 7)
// the run is closed. If the lead was still being attended by the agent it goes to "Sem resposta" with a task to retake the contact; when
// the person writes again a new run starts from where the lead stopped (the state of the lead is kept).
const tick = async (): Promise<void> => {
  try {
    const days = Number(await getSetting("ai_stale_run_days", "7"));
    if (!days) return;
    const cutoff = new Date(Date.now() - days * 86400000);
    const runs = await ChatFlowRun.findAll({ where: { status: "waiting", updatedAt: { [Op.lt]: cutoff } }, limit: 50 });
    for (const run of runs) {
      // eslint-disable-next-line no-await-in-loop
      const flow = await ChatFlow.findByPk(run.flowId);
      // the menus of the chatbot keep waiting as they always did: only the agents' runs expire
      if (!flow || flow.kind !== "agent") continue;
      // eslint-disable-next-line no-await-in-loop
      await run.update({ status: "done", resumeAt: null } as any);
      // eslint-disable-next-line no-await-in-loop
      const ticket = await Ticket.findByPk(run.ticketId);
      if (!ticket || ticket.status === "closed" || ticket.userId || !ticket.aiActive) continue;
      // eslint-disable-next-line no-await-in-loop
      const lead = await Lead.findOne({ where: { contactId: ticket.contactId } });
      // eslint-disable-next-line no-await-in-loop
      if (!lead || !(await LeadCommercial.findOne({ where: { leadId: lead.id }, attributes: ["id"] }))) continue;
      // eslint-disable-next-line no-await-in-loop
      const state = await hydrate(await loadState(lead.id), lead);
      const ports = dbPorts(lead, state, { agentId: state.agentId, flowId: state.flowId });
      // eslint-disable-next-line no-await-in-loop
      if (canAutoMove(await ports.stageKeyNow(), "no_response")) await ports.moveStage("no_response", `sem resposta há ${days} dias`);
      // eslint-disable-next-line no-await-in-loop
      await ports.task(`no_response:${run.id}`, "Retomar contato: o lead parou de responder ao agente", new Date(Date.now() + 3600000), "whatsapp");
      // eslint-disable-next-line no-await-in-loop
      await ports.event("no_response");
      // eslint-disable-next-line no-await-in-loop
      await ports.save();
    }
  } catch (err) {
    logger.warn(`Stale runs tick failed: ${err}`);
  }
};

export const startStaleRuns = (): void => {
  setInterval(tick, Number(process.env.STALE_RUNS_MS) || 10 * 60000);
};

export { tick as runStaleRunsOnce };
