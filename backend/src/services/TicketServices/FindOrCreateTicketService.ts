import { subHours } from "date-fns";
import { Op } from "sequelize";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import dispatchWebhook from "../WebhookServices/DispatchWebhook";
import Whatsapp from "../../models/Whatsapp";
import { hookTicketCreated } from "../CrmServices/LeadCore";
import ShowTicketService from "./ShowTicketService";
import emitTicketUpdate from "./EmitTicketUpdate";
import { RELATIONSHIP_SEGMENT } from "../../helpers/Roles";
import { ensureRelationshipQueue, isRelationshipConnection } from "../RelationshipServices/Relationship";

const FindOrCreateTicketService = async (
  contact: Contact,
  whatsappId: number,
  unreadMessages: number,
  groupContact?: Contact
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
      await ticket.update({
        status: "pending",
        userId: null,
        unreadMessages,
        chatbotNodeId: null,
        aiActive: true,
        closedAt: null,
        ...(wasHistory ? { isHistorical: false, firstResponseAt: null } : {})
      });
      changed = true;
      if (wasHistory) await Ticket.update({ createdAt: new Date() } as any, { where: { id: ticket.id }, silent: true } as any);
    }
  }

  // someone from the copied history wrote again: that conversation comes back to life (same thread, counted from now)
  if (!ticket) {
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
      await ticket.update({
        status: "pending",
        userId: null,
        unreadMessages,
        chatbotNodeId: null,
        aiActive: true,
        closedAt: null,
        ...(recent ? {} : { firstResponseAt: null })
      });
      changed = true;
      if (!recent) await Ticket.update({ createdAt: new Date() } as any, { where: { id: ticket.id }, silent: true } as any);
    }
  }

  if (!ticket) {
    ticket = await Ticket.create({
      contactId: groupContact ? groupContact.id : contact.id,
      status: "pending",
      isGroup: !!groupContact,
      unreadMessages,
      whatsappId
    });
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

  // a personal number: the conversation belongs to the person who connected it (the bots stay out).
  // Groups too: nobody "accepts" a group, whoever is in it already took part
  // unless the number also works as an attendance number ("aiFirst"): then the AI agent answers first and the owner follows like everyone else
  const connection = await Whatsapp.findByPk(whatsappId, { attributes: ["id", "ownerId", "aiFirst"] });
  if (connection?.ownerId && !connection.aiFirst && ticket.status === "pending" && !ticket.userId) {
    await ticket.update({ status: "open", userId: connection.ownerId });
    changed = true;
  }

  ticket = await ShowTicketService(ticket.id);
  if (changed) await emitTicketUpdate(ticket.id);

  return ticket;
};

export default FindOrCreateTicketService;
