import { Op } from "sequelize";

import { brPhoneVariants } from "../../helpers/PhoneVariants";
import Campaign from "../../models/Campaign";
import CampaignShipping from "../../models/CampaignShipping";
import Contact from "../../models/Contact";
import Lead from "../../models/Lead";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import { logger } from "../../utils/logger";

// A STUDENT ANSWERS A CAMPAIGN OF THE TUTORING (the official number of the Tutoria): the answer goes to THEIR tutor, at once.
// - the conversation is the tutor's (assigned), and the tutor hears it in the bell;
// - when the tutor has their own WhatsApp by QR Code, the conversation continues there (the history goes along), and the student is told on the
//   official number that the next message comes from another number. Without it, it stays on the official number, with the tutor.
// Only an answer of the student counts (never the system reopening the conversation to send), and only in the days after the campaign reached them.
export const TUTOR_REPLY_DAYS = 7;

const firstName = (name: string | null | undefined): string => String(name || "").trim().split(/\s+/)[0] || "";

// what the student reads on the official number before the conversation moves (the same words of the tutoring handoff)
export const movedNotice = (tutorName: string | null | undefined): string => {
  const first = firstName(tutorName);
  return `${first ? `${first}, da tutoria,` : "A tutoria do seu polo"} continua o seu atendimento pelo WhatsApp da tutoria. Fique de olho: a mensagem chega de outro número.`;
};

// the student of the contact: by the conversation's contact, else by the phone (a student imported or put in a list may have no contact yet)
export const studentOfContact = async (contact: Pick<Contact, "id" | "number">): Promise<Lead | null> => {
  const byContact = await Lead.findOne({ where: { contactId: contact.id, enrolledAt: { [Op.ne]: null } } as any, order: [["updatedAt", "DESC"]] });
  if (byContact || !contact.number) return byContact;
  const byPhone = await Lead.findOne({ where: { phone: { [Op.in]: brPhoneVariants(contact.number) }, enrolledAt: { [Op.ne]: null } } as any, order: [["updatedAt", "DESC"]] });
  // the student is found by the phone: from now on the contact is theirs (the next answer finds them at once)
  if (byPhone && !byPhone.contactId) await byPhone.update({ contactId: contact.id }).catch(() => undefined);
  return byPhone;
};

// the campaign this answer is for: one that reached this phone in the last days, from the number the answer came to
const campaignAnswered = async (ticket: Ticket, contact: Contact): Promise<CampaignShipping | null> => {
  if (!contact.number) return null;
  const since = new Date(Date.now() - TUTOR_REPLY_DAYS * 86400000);
  return CampaignShipping.findOne({
    where: { number: { [Op.in]: brPhoneVariants(contact.number) }, status: "sent", sentAt: { [Op.gte]: since } } as any,
    include: [{ model: Campaign, as: "campaign", attributes: ["id", "whatsappId"], where: { whatsappId: ticket.whatsappId }, required: true }],
    order: [["sentAt", "DESC"]]
  });
};

// on the answer itself (before the message is stored and before any robot): the campaign answered, the student and the tutor; the conversation
// becomes the tutor's at once, so no robot or AI of the official number answers in between
export const claimTutoringReply = async (ticketId: number): Promise<{ tutorId: number; shippingId: number } | null> => {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket || ticket.isGroup || ticket.status === "closed") return null;
  const { teamOfConnection } = await import("../ChannelServices/ConnectionTeam");
  if ((await teamOfConnection(ticket.whatsappId)) !== "tutoria") return null;
  const contact = await Contact.findByPk(ticket.contactId);
  if (!contact) return null;
  const shipping = await campaignAnswered(ticket, contact);
  if (!shipping) return null;
  const student = await studentOfContact(contact);
  const tutorId = Number(student?.onboardingTutorId) || null;
  if (!student || !tutorId || !(await User.count({ where: { id: tutorId } }))) return null;
  // the conversation is the tutor's (unless a person of the team already took it)
  if (!ticket.userId) await Ticket.update({ status: "open", userId: tutorId, aiActive: false, chatbotNodeId: -1 } as any, { where: { id: ticket.id, userId: null } as any });
  const fresh = await Ticket.findByPk(ticket.id, { attributes: ["id", "userId"] });
  return fresh && fresh.userId === tutorId ? { tutorId, shippingId: shipping.id } : null;
};

// right after the student's message is stored: the tutor hears it, and the conversation continues on the tutor's own WhatsApp when there is one
export const continueWithTutor = async (ticketId: number, tutorId: number, shippingId: number): Promise<"moved" | "tutor" | null> => {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket || ticket.userId !== tutorId) return null;
  const contact = await Contact.findByPk(ticket.contactId);
  const tutor = await User.findByPk(tutorId, { attributes: ["id", "name"] });
  if (!contact || !tutor) return null;
  const { notify } = await import("../NotificationServices/Notify");
  await notify([tutor.id], {
    kind: "tutoria",
    title: "Aluno respondeu à campanha da tutoria",
    body: `${firstName(contact.name) || "Um aluno"} respondeu. A conversa já está com você.`,
    link: `/tickets/${ticket.id}`,
    dedupeKey: `tutor-reply:${ticket.id}:${shippingId}`
  });
  const { tutorMoveFor, moveToTutorNumber } = await import("../TicketServices/TutorNumber");
  const move = await tutorMoveFor(ticket, tutor.id);
  if (!move) return "tutor";
  const official = await Whatsapp.findByPk(ticket.whatsappId);
  if (official) {
    const { default: SendToContact } = await import("../ChannelServices/SendToContact");
    await SendToContact({ contact, whatsapp: official, body: movedNotice(tutor.name), ticketId: ticket.id, keepOpen: { userId: tutor.id } }).catch(err => logger.warn(`Aviso da troca de número (conversa ${ticket.id}): ${err}`));
  }
  const moved = await moveToTutorNumber(ticket.id, move.whatsappId, tutor.id, null, ticket.queueId || null);
  return moved ? "moved" : "tutor";
};
