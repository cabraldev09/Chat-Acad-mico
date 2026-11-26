import { subHours } from "date-fns";
import { Op } from "sequelize";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import { createLiveTicket, liveTicketOf } from "./LiveTicket";
import dispatchWebhook from "../WebhookServices/DispatchWebhook";
import Whatsapp from "../../models/Whatsapp";
import { hookTicketCreated } from "../CrmServices/LeadCore";
import ShowTicketService from "./ShowTicketService";
import emitTicketUpdate from "./EmitTicketUpdate";
import { RELATIONSHIP_SEGMENT } from "../../helpers/Roles";
import { ensureRelationshipQueue, isRelationshipConnection } from "../RelationshipServices/Relationship";
import { noticeIfOwnerAway, returnToOwner } from "../CrmServices/ReturningClient";
import { TUTORIA_SEGMENTS, teamOfConnection } from "../ChannelServices/ConnectionTeam";
import Lead from "../../models/Lead";
import Queue from "../../models/Queue";
import User from "../../models/User";
import TicketEvent from "../../models/TicketEvent";
import { foldTutoringTwins } from "./TutoringTwin";

// the affiliate of this number (if any) and where their conversation goes: their consultant, or the queue without the robot
const routeAffiliate = async (ticket: Ticket, contact: Contact): Promise<{ owner: User | null } | null> => {
  const { findAffiliateByPhone } = await import("../AffiliateServices/AffiliateLane");
  const affiliate = contact.number ? await findAffiliateByPhone(contact.number) : null;
  if (!affiliate) return null;
  const owner = affiliate.ownerId ? await User.findByPk(affiliate.ownerId, { attributes: ["id", "name"] }) : null;
  if (owner) {
    if (ticket.userId === owner.id && ticket.status === "open" && !ticket.aiActive) return { owner };
    // a conversation another person took meanwhile is not taken from them
    const [taken] = await Ticket.update(
      { status: "open", userId: owner.id, aiActive: false, chatbotNodeId: -1 } as any,
      { where: { id: ticket.id, [Op.or]: [{ userId: null }, { userId: owner.id }] } as any }
    );
    if (!taken) return null;
    await TicketEvent.create({ ticketId: ticket.id, type: "returned_to_owner", actorId: null, toUserId: owner.id, note: `Afiliado(a) ${affiliate.name}: a conversa foi direto para ${owner.name}, que acompanha este afiliado.` } as any);
  } else {
    if (!ticket.aiActive && ticket.chatbotNodeId === -1) return { owner: null };
    await Ticket.update({ aiActive: false, chatbotNodeId: -1 } as any, { where: { id: ticket.id } });
    await TicketEvent.create({ ticketId: ticket.id, type: "affiliate_without_owner", actorId: null, note: `Afiliado(a) ${affiliate.name} sem consultor responsável: a conversa ficou na fila para a coordenação distribuir.` } as any);
  }
  await ticket.reload();
  return { owner };
};

const FindOrCreateTicketService = async (
  contact: Contact,
  whatsappId: number,
  unreadMessages: number,
  groupContact?: Contact,
  // the text of the message that arrived (an answer "SAIR" to a recovery campaign is never followed by the offer)
  inboundBody?: string
): Promise<Ticket> => {
  let ticket = await Ticket.findOne({
    where: {
      status: {
        [Op.or]: ["open", "pending"]
      },
      contactId: groupContact ? groupContact.id : contact.id,
      whatsappId: whatsappId
    }
  });

  // set when the conversation changes hands or state here: the open chat and the lists are told at the end (a new ticket tells itself)
  let changed = false;
  // the conversation is coming back (a closed one reopened or a new one born): it may go straight to the client's consultant
  let returning = false;
  let previousUserId: number | null = null;

  if (ticket) {
    await ticket.update({ unreadMessages });
  }

  if (!ticket && groupContact) {
    ticket = await Ticket.findOne({
      where: {
        contactId: groupContact.id,
        whatsappId: whatsappId
      },
      order: [["updatedAt", "DESC"]]
    });

    if (ticket) {
      const wasHistory = ticket.isHistorical;
      // only a closed (or copied) conversation comes back to the queue: one a person took in the meantime keeps its attendant
      const [reopened] = await Ticket.update(
        {
          status: "pending",
          userId: null,
          // who attended before: the client goes back to them when there is no owner in the CRM
          ...(previousUserId ? { lastUserId: previousUserId } : {}),
          unreadMessages,
          chatbotNodeId: null,
          aiActive: true,
          closedAt: null,
          ...(wasHistory ? { isHistorical: false, firstResponseAt: null } : {})
        } as any,
        { where: { id: ticket.id, [Op.or]: [{ status: "closed" }, { isHistorical: true }] } as any }
      );
      await ticket.reload();
      changed = true;
      if (reopened && wasHistory) await Ticket.update({ createdAt: new Date() } as any, { where: { id: ticket.id }, silent: true } as any);
    }
  }

  // someone from the copied history wrote again: that conversation comes back to life (same thread, counted from now), only when the
  // person has no live conversation on this number (that one comes back below: never two live ones on the same number)
  if (!ticket && (groupContact || !(await liveTicketOf(contact.id, whatsappId)))) {
    const history = await Ticket.findOne({
      where: { contactId: groupContact ? groupContact.id : contact.id, whatsappId, isHistorical: true },
      order: [["updatedAt", "DESC"]]
    });
    if (history) {
      await history.update({
        isHistorical: false,
        status: "pending",
        userId: null,
        unreadMessages,
        chatbotNodeId: null,
        aiActive: true,
        closedAt: null,
        firstResponseAt: null
      });
      changed = true;
      await Ticket.update({ createdAt: new Date() } as any, { where: { id: history.id }, silent: true } as any);
      ticket = history;
      if (!groupContact) hookTicketCreated(contact, (await Whatsapp.findByPk(whatsappId))?.channel || "whatsapp");
    }
  }

  // One conversation per person, like WhatsApp: when someone writes again after the attendance was closed, the same
  // conversation comes back (instead of a second one beside it). Within 2 hours it is the same attendance; later it
  // starts again from zero (counted from now), keeping all the messages in one thread.
  if (!ticket && !groupContact) {
    ticket = await Ticket.findOne({
      where: { contactId: contact.id, whatsappId, isHistorical: false },
      order: [["updatedAt", "DESC"]]
    });

    if (ticket) {
      const recent = new Date(ticket.updatedAt).getTime() > Date.now() - 2 * 3600 * 1000;
      previousUserId = ticket.status === "closed" ? ticket.userId || ticket.lastUserId || null : null;
      // conditional on "still closed": a person who accepted it a moment ago is not sent back to Aguardando, and the robot is not switched on again
      const [reopened] = await Ticket.update(
        {
          status: "pending",
          userId: null,
          // who attended before: the client goes back to them when there is no owner in the CRM
          ...(previousUserId ? { lastUserId: previousUserId } : {}),
          unreadMessages,
          chatbotNodeId: null,
          aiActive: true,
          closedAt: null,
          // a new attendance (more than 2 hours later) starts the count of answers of the AI again; what it learned (the data
          // collected, the summary) stays as the memory of the conversation
          ...(recent ? {} : { firstResponseAt: null, aiTurns: 0 })
        } as any,
        { where: { id: ticket.id, status: "closed" } as any }
      );
      await ticket.reload();
      changed = true;
      returning = !!reopened;
      if (reopened && !recent) await Ticket.update({ createdAt: new Date() } as any, { where: { id: ticket.id }, silent: true } as any);
    }
  }

  if (!ticket) {
    ticket = await createLiveTicket({
      contactId: groupContact ? groupContact.id : contact.id,
      status: "pending",
      isGroup: !!groupContact,
      unreadMessages,
      whatsappId
    });
    returning = !groupContact;
    hookTicketCreated(contact, (await Whatsapp.findByPk(whatsappId))?.channel || "whatsapp");
    await dispatchWebhook("ticket.created", {
      ticketId: ticket.id,
      contactId: ticket.contactId,
      whatsappId
    });
  }

  // the institution's own number: its conversations are the relationship department's (own segment, own queue)
  if (!groupContact && ticket.segment !== RELATIONSHIP_SEGMENT && (await isRelationshipConnection(whatsappId))) {
    const queue = await ensureRelationshipQueue();
    await ticket.update({ segment: RELATIONSHIP_SEGMENT, queueId: queue.id });
  }

  // the tutoring number: its conversations are the tutors' (the tutoring of the student's polo); consultants never see them
  if (!groupContact && !TUTORIA_SEGMENTS.includes(String(ticket.segment || "")) && (await teamOfConnection(whatsappId)) === "tutoria") {
    const lead = await Lead.findOne({ where: { contactId: contact.id }, attributes: ["id", "poloId"], order: [["updatedAt", "DESC"]] });
    const queue = lead?.poloId ? await Queue.findOne({ where: { poloId: lead.poloId, role: "tutoria" } as any, attributes: ["id"] }) : null;
    await ticket.update({ segment: "onboarding", ...(queue ? { queueId: queue.id } : {}) });
    changed = true;
  }
  // the enrollment may have opened the tutoring conversation on another number, still empty: it is folded into this one
  if (!groupContact && TUTORIA_SEGMENTS.includes(String(ticket.segment || "")) && (await foldTutoringTwins(ticket)).length) changed = true;

  // a personal number: the conversation belongs to the person who connected it (the bots stay out).
  // Groups too: nobody "accepts" a group, whoever is in it already took part
  // unless the number also works as an attendance number ("aiFirst"): then the AI agent answers first and the owner follows like everyone else
  const connection = await Whatsapp.findByPk(whatsappId, { attributes: ["id", "ownerId", "aiFirst"] });
  if (connection?.ownerId && !connection.aiFirst && ticket.status === "pending" && !ticket.userId) {
    await ticket.update({ status: "open", userId: connection.ownerId });
    changed = true;
  }

  // an affiliate writing to the official number of the attendance goes straight to the consultant who follows them (their "carteira"):
  // no robot, no rotation. Without a consultant (deactivated), the conversation waits in the queue, still without the robot.
  if (!groupContact && !connection?.ownerId && ticket.segment !== RELATIONSHIP_SEGMENT && !TUTORIA_SEGMENTS.includes(String(ticket.segment || ""))) {
    const routed = await routeAffiliate(ticket, contact);
    if (routed) {
      changed = true;
      returning = false;
      if (routed.owner) {
        const routedId = ticket.id;
        const ownerId = routed.owner.id;
        setTimeout(() => { noticeIfOwnerAway(routedId, ownerId).catch(() => undefined); }, 2500).unref?.();
      }
    }
  }

  // the answer to a recovery campaign follows the approach the management chose (the AI with the offer, the proposal, the consultant).
  // Only a message the person sent counts (unread > 0): a message the system sends to them (another campaign, a notice) opens the
  // conversation here too and is not an answer. The conversation may already be open (the campaign itself opened it), so this does
  // not wait for a "returning" one; once per campaign and person (RecoveryReply keeps that).
  if (unreadMessages > 0 && !groupContact) {
    const { onRecoveryReply } = await import("../CampaignServices/RecoveryReply");
    const approach = await onRecoveryReply(ticket, contact, inboundBody).catch(() => null);
    if (approach === "ia") returning = false;
  }

  // a shared number (the official API of the polos): the client who already has a consultant goes back to them, robots and rotation stay out
  if (returning && !groupContact) {
    const owner = await returnToOwner(ticket, previousUserId);
    if (owner) {
      changed = true;
      // after the client's message is stored: if the consultant is away, the client is told when the answer comes
      const returnedId = ticket.id;
      setTimeout(() => { noticeIfOwnerAway(returnedId, owner.id).catch(() => undefined); }, 2500).unref?.();
    }
  }

  ticket = await ShowTicketService(ticket.id);
  if (changed) await emitTicketUpdate(ticket.id);

  return ticket;
};

export default FindOrCreateTicketService;
