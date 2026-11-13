import { Op } from "sequelize";

import { getSetting } from "../../helpers/AppSettings";
import { getBusinessConfig } from "../../helpers/BusinessTime";
import Lead from "../../models/Lead";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import TicketEvent from "../../models/TicketEvent";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import { logger } from "../../utils/logger";
import { onScheduleNow } from "../AnalyticsServices/AnalyticsService";
import { isWithinBusinessHours } from "../AutomationServices/BusinessHours";
import { nextOpening, whenText } from "../CommercialServices/Hours";
import { isRelationshipConnection } from "../RelationshipServices/Relationship";
import { TUTORIA_SEGMENTS, teamOfConnection } from "../ChannelServices/ConnectionTeam";

// The client belongs to a consultant ("carteira"): when somebody who already talked to a consultant writes again on a shared number
// (the official API of the polos, or any number with no owner), the conversation goes straight back to that consultant, without robots
// or the rotation in between. The consultant is the owner of the lead in the CRM; with no lead, the last person who attended the conversation.
// It stays with the owner even outside their hours: the client is told once when the consultant answers.

export const RETURN_TO_OWNER = "return_to_owner";
export const RETURN_AWAY_MESSAGE = "return_to_owner_away_message";
export const DEFAULT_AWAY_MESSAGE = "Olá! {consultor} está fora do horário de atendimento agora e responde {quando}. Sua mensagem já ficou com {consultor}.";

const MARK = "‎";
const FLOW_DONE = -1;

export const returnToOwnerEnabled = async (): Promise<boolean> => (await getSetting(RETURN_TO_OWNER, "true")) !== "false";

export interface ClientOwner {
  user: User;
  source: "lead" | "last_attendant";
}

// Somebody of the team already talked to this client (a conversation of theirs, or one they attended last), on the same side
// (the consultants' conversations, or the tutoring ones: one side never counts the other)
const attended = async (contactId: number, userId: number, tutoring = false): Promise<boolean> =>
  (await Ticket.count({
    where: {
      contactId,
      [Op.and]: [
        { [Op.or]: [{ userId }, { lastUserId: userId }] },
        tutoring ? { segment: { [Op.in]: TUTORIA_SEGMENTS } } : { [Op.or]: [{ segment: { [Op.notIn]: TUTORIA_SEGMENTS } }, { segment: null }] }
      ]
    } as any
  })) > 0;

// The consultant who owns the client: the lead's owner (an open lead or a won one: the student stays with who enrolled them), else whoever
// attended last. Only a consultant who already talked to the client counts: a lead the CRM rotation gave to someone who never answered it is
// still qualified by the robots first, as before.
// On the tutoring side the owner is the student's tutor (given at the enrollment), even before they ever talked.
export const clientOwnerOf = async (contactId: number, lastUserId?: number | null, tutoring = false): Promise<ClientOwner | null> => {
  const lead = await Lead.findOne({ where: { contactId }, attributes: ["id", "ownerId", "onboardingTutorId"], order: [["updatedAt", "DESC"]] });
  const candidates: Array<[number | null | undefined, ClientOwner["source"]]> = [[tutoring ? lead?.onboardingTutorId : lead?.ownerId, "lead"], [lastUserId, "last_attendant"]];
  for (const [id, source] of candidates) {
    if (!id) continue;
    // the tutor of the student needs no earlier conversation; anybody else must have attended the client on this side
    // eslint-disable-next-line no-await-in-loop
    if (!(tutoring && source === "lead") && !(await attended(contactId, id, tutoring))) continue;
    // eslint-disable-next-line no-await-in-loop
    const user = await User.findByPk(id, { attributes: ["id", "name", "profile"] });
    if (user) return { user, source };
  }
  return null;
};

// Called when a conversation comes back (a closed one reopened, or a new one born) on a shared number: hands it to the client's consultant.
// Returns the consultant, or null when the conversation follows the usual way (robots, rotation).
export const returnToOwner = async (ticket: Ticket, previousUserId: number | null): Promise<User | null> => {
  if (ticket.isGroup || ticket.userId || ticket.status !== "pending") return null;
  if (!(await returnToOwnerEnabled())) return null;
  const connection = await Whatsapp.findByPk(ticket.whatsappId, { attributes: ["id", "ownerId"] });
  // a personal number already belongs to its owner, and the institution's own number is the relationship team's
  if (!connection || connection.ownerId || (await isRelationshipConnection(ticket.whatsappId))) return null;
  const tutoring = (await teamOfConnection(ticket.whatsappId)) === "tutoria";
  const owner = await clientOwnerOf(ticket.contactId, previousUserId || ticket.lastUserId, tutoring);
  if (!owner) return null;

  // only a conversation still waiting is taken (a robot or a person that took it meanwhile is not undone)
  const [taken] = await Ticket.update(
    { status: "open", userId: owner.user.id, aiActive: false, chatbotNodeId: FLOW_DONE } as any,
    { where: { id: ticket.id, userId: null, status: "pending" } as any }
  );
  if (!taken) return null;
  await TicketEvent.create({
    ticketId: ticket.id,
    type: "returned_to_owner",
    actorId: null,
    toUserId: owner.user.id,
    note: `O cliente voltou a escrever e foi direto para ${owner.user.name}, ${owner.source === "lead" ? (tutoring ? "tutor dele" : "responsável por ele no CRM") : "que fez o último atendimento"}.`
  } as any);
  await ticket.reload();
  return owner.user;
};

const firstName = (name: string): string => String(name || "").trim().split(/\s+/)[0] || "o consultor";

// The consultant is away (outside their working hours, or the number is outside its hours): the client hears once (every 6 hours at most)
// when the answer comes. Nothing is sent if the consultant already answered.
export const noticeIfOwnerAway = async (ticketId: number, ownerId: number, now: Date = new Date()): Promise<boolean> => {
  try {
    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket || ticket.userId !== ownerId || ticket.status === "closed") return false;
    if (ticket.outOfHoursSentAt && new Date(ticket.outOfHoursSentAt).getTime() > now.getTime() - 6 * 3600000) return false;
    const [owner, connection, duty] = await Promise.all([
      User.findByPk(ownerId, { attributes: ["id", "name"] }),
      Whatsapp.findByPk(ticket.whatsappId),
      onScheduleNow([ownerId], now).catch(() => null)
    ]);
    if (!owner) return false;
    const offDuty = duty ? !duty.has(ownerId) : false;
    const closed = connection ? !isWithinBusinessHours(connection, now) : false;
    if (!offDuty && !closed) return false;
    const answered = await Message.count({ where: { ticketId, fromMe: true, createdAt: { [Op.gt]: new Date(now.getTime() - 10 * 60000) } } as any });
    if (answered) return false;
    const when = whenText(nextOpening(await getBusinessConfig(), now), now) || "no próximo horário de atendimento";
    const template = String(await getSetting(RETURN_AWAY_MESSAGE, "")).trim() || DEFAULT_AWAY_MESSAGE;
    const text = template.replace(/\{consultor\}/g, firstName(owner.name)).replace(/\{quando\}/g, when);
    await ticket.update({ outOfHoursSentAt: now });
    // loaded here so the ticket services do not import the sending ones at start
    const { default: ShowTicketService } = await import("../TicketServices/ShowTicketService");
    const { default: SendWhatsAppMessage } = await import("../WbotServices/SendWhatsAppMessage");
    await SendWhatsAppMessage({ body: `${MARK}${text}`, ticket: await ShowTicketService(ticketId), automated: true, outsideHoursNotice: true });
    return true;
  } catch (err) {
    logger.warn(`Aviso de consultor ausente (ticket ${ticketId}) não enviado: ${(err as Error).message}`);
    return false;
  }
};
