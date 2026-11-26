import { Op } from "sequelize";

import { brPhoneVariants } from "../../helpers/PhoneVariants";
import Campaign from "../../models/Campaign";
import CampaignShipping from "../../models/CampaignShipping";
import ChatFlow from "../../models/ChatFlow";
import ChatFlowRun from "../../models/ChatFlowRun";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import { logger } from "../../utils/logger";

// The bot of a campaign: who answers a campaign (in the 7 days after it reached them) goes into the flow chosen for that campaign, which
// qualifies them (buttons, the questions, the consultant). Only once per send, never over a flow already going on, and never when a person of
// the team already wrote to them after the campaign.
export const CAMPAIGN_FLOW_DAYS = 7;

export const campaignFlowFor = async (ticket: Ticket): Promise<{ flowId: number; campaignId: number } | null> => {
  if (ticket.isGroup) return null;
  const going = await ChatFlowRun.count({ where: { ticketId: ticket.id, status: { [Op.in]: ["waiting", "delayed"] } } });
  if (going) return null;
  const contact = await Contact.findByPk(ticket.contactId, { attributes: ["id", "number"] });
  if (!contact?.number) return null;
  const since = new Date(Date.now() - CAMPAIGN_FLOW_DAYS * 86400000);
  const shipping = await CampaignShipping.findOne({
    where: { number: { [Op.in]: brPhoneVariants(contact.number) }, status: "sent", sentAt: { [Op.gte]: since } } as any,
    include: [{ model: Campaign, as: "campaign", attributes: ["id", "flowId", "whatsappId"], where: { flowId: { [Op.ne]: null } }, required: true }],
    order: [["sentAt", "DESC"]]
  });
  const campaign: any = shipping && (shipping as any).campaign;
  if (!shipping || !campaign?.flowId) return null;
  // the answer has to come on the number the campaign went out from
  if (campaign.whatsappId && Number(campaign.whatsappId) !== Number(ticket.whatsappId)) return null;
  const flow = await ChatFlow.findByPk(campaign.flowId, { attributes: ["id", "status"] });
  if (!flow || flow.status !== "published") return null;
  // once per send: a flow of this campaign already ran for this conversation after the message
  const ran = await ChatFlowRun.count({ where: { ticketId: ticket.id, flowId: flow.id, createdAt: { [Op.gte]: shipping.sentAt } } as any });
  if (ran) return null;
  // a person of the team already talks with them: the bot stays out (the campaign messages themselves went out in the first minute)
  const human = await Message.count({ where: { ticketId: ticket.id, fromMe: true, createdAt: { [Op.gte]: new Date(new Date(shipping.sentAt).getTime() + 60000) } } as any });
  if (human) return null;
  return { flowId: flow.id, campaignId: campaign.id };
};

// starts the bot of the campaign this person answered; true when it did
export const runCampaignFlow = async (ticket: Ticket): Promise<boolean> => {
  try {
    const found = await campaignFlowFor(ticket);
    if (!found) return false;
    const { startFlowForTicket } = await import("./Runner");
    return await startFlowForTicket(found.flowId, ticket.id);
  } catch (err) {
    logger.warn(`campaign flow: ${err}`);
    return false;
  }
};
