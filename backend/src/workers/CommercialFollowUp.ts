import { Op } from "sequelize";
import Proposal from "../models/Proposal";
import Payment from "../models/Payment";
import Lead from "../models/Lead";
import Contact from "../models/Contact";
import LeadTask from "../models/LeadTask";
import { ensureTask } from "../services/CrmServices/Tasks";
import { getSetting } from "../helpers/AppSettings";
import { logger } from "../utils/logger";

let running = false;
let proposalCursor = 0;
let paymentCursor = 0;
// Tasks only: commercial follow-up never authorizes a paid message by itself.
export const tickCommercialFollowUp = async (): Promise<void> => {
  if (running) return;
  running = true;
  try {
    if (await getSetting("crm_followup_enabled", "true") !== "true") return;
    const now = new Date();
    const [proposals, payments] = await Promise.all([
      Proposal.findAll({ where: { id: { [Op.gt]: proposalCursor }, status: "sent", leadId: { [Op.ne]: null } }, order: [["id", "ASC"]], limit: 100 }),
      Payment.findAll({ where: { id: { [Op.gt]: paymentCursor }, status: "pending" }, order: [["id", "ASC"]], limit: 100 })
    ]);
    proposalCursor = proposals.length === 100 ? proposals[99].id : 0;
    paymentCursor = payments.length === 100 ? payments[99].id : 0;
    const configs = await Promise.all([getSetting("crm_proposal_unopened_minutes", "120"), getSetting("crm_proposal_viewed_minutes", "60"), getSetting("crm_payment_followup_minutes", "120")]);
    const leadIds = [...new Set([...proposals.map(p => p.leadId), ...payments.map(p => p.leadId)])];
    for (const leadId of leadIds) {
      const lead = await Lead.findByPk(leadId);
      if (!lead) continue;
      const contact = lead.contactId ? await Contact.findByPk(lead.contactId) : null;
      const stopped = !!(lead.wonAt || lead.lostAt || contact?.optOut);
      const leadProposals = proposals.filter(p => p.leadId === leadId);
      const leadPayments = payments.filter(p => p.leadId === leadId);
      for (const proposal of leadProposals) {
        if (!proposal.sentAt) continue;
        const stage = proposal.viewedAt ? "viewed" : "unopened";
        const base = proposal.viewedAt || proposal.sentAt;
        const minutes = Number(configs[proposal.viewedAt ? 1 : 0]);
        const replied = lead.lastInboundAt && new Date(lead.lastInboundAt) > new Date(proposal.sentAt);
        const key = `proposal:${proposal.id}:${new Date(proposal.sentAt).getTime()}:${stage}`;
        if (!stopped && !replied && minutes > 0 && lead.ownerId) await ensureTask({
          key, leadId, userId: lead.ownerId, type: "proposta", dueAt: new Date(new Date(base).getTime() + minutes * 60000),
          title: `${proposal.viewedAt ? "Proposta aberta sem retorno" : "Proposta ainda não aberta"}: ${proposal.courseName || `#${proposal.id}`}`.slice(0, 200)
        });
        const obsolete = await LeadTask.findAll({ where: { automationKey: { [Op.like]: `proposal:${proposal.id}:%` }, doneAt: null as any } });
        for (const task of obsolete) if (stopped || replied || task.automationKey !== key) await task.update({ doneAt: now });
      }
      for (const payment of leadPayments) {
        const replied = lead.lastInboundAt && new Date(lead.lastInboundAt) > new Date(payment.createdAt);
        if (!stopped && !replied && Number(configs[2]) > 0 && lead.ownerId) await ensureTask({
          key: `payment:${payment.id}`, leadId, userId: lead.ownerId, type: "whatsapp",
          dueAt: new Date(new Date(payment.createdAt).getTime() + Number(configs[2]) * 60000),
          title: `Acompanhar taxa de matrícula pendente (#${payment.id})`
        });
      }
    }
    // Close obsolete automatic tasks even when their proposal/payment left the candidate query.
    const tasks = await LeadTask.findAll({ where: { automationKey: { [Op.ne]: null }, doneAt: null as any }, order: [["id", "ASC"]], limit: 500 });
    for (const task of tasks) {
      const lead = await Lead.findByPk(task.leadId);
      const contact = lead?.contactId ? await Contact.findByPk(lead.contactId) : null;
      let stop = !lead || !!(lead.wonAt || lead.lostAt || contact?.optOut);
      if (task.automationKey.startsWith("payment:")) {
        const payment = await Payment.findByPk(Number(task.automationKey.split(":")[1]));
        stop = stop || !payment || payment.status !== "pending" || !!(lead?.lastInboundAt && new Date(lead.lastInboundAt) > new Date(payment.createdAt));
      }
      if (task.automationKey.startsWith("proposal:")) {
        const proposal = await Proposal.findByPk(Number(task.automationKey.split(":")[1]));
        stop = stop || !proposal || proposal.status !== "sent";
      }
      if (stop) await task.update({ doneAt: now });
    }
  } catch (err) { logger.warn(`Commercial follow-up: ${err}`); }
  finally { running = false; }
};
export const startCommercialFollowUp = (): void => { setInterval(tickCommercialFollowUp, 60000); };
