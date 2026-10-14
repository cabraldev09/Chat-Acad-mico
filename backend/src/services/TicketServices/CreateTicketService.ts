import AppError from "../../errors/AppError";
import CheckContactOpenTickets from "../../helpers/CheckContactOpenTickets";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import ShowContactService from "../ContactServices/ShowContactService";

interface Request {
  contactId: number;
  status: string;
  userId: number;
  queueId?: number;
}

const CreateTicketService = async ({
  contactId,
  status,
  userId,
  queueId
}: Request): Promise<Ticket> => {
  const defaultWhatsapp = await GetDefaultWhatsApp(userId);

  await CheckContactOpenTickets(contactId, defaultWhatsapp.id);

  const { isGroup } = await ShowContactService(contactId);

  if (queueId === undefined) {
    const user = await User.findByPk(userId, { include: ["queues"] });
    queueId = user?.queues.length === 1 ? user.queues[0].id : undefined;
  }

  // the person already has a closed conversation here: it is reopened (one thread per person)
  const previous = await Ticket.findOne({
    where: { contactId, whatsappId: defaultWhatsapp.id, status: "closed", isHistorical: false },
    order: [["updatedAt", "DESC"]]
  });
  if (previous) {
    await previous.update({
      status,
      userId,
      ...(queueId !== undefined ? { queueId } : {}),
      unreadMessages: 0,
      closedAt: null,
      chatbotNodeId: null,
      aiActive: true,
      firstResponseAt: null
    });
    await Ticket.update({ createdAt: new Date() } as any, { where: { id: previous.id }, silent: true } as any);
    return (await Ticket.findByPk(previous.id, { include: ["contact"] })) as Ticket;
  }

  const { id }: Ticket = await defaultWhatsapp.$create("ticket", {
    contactId,
    status,
    isGroup,
    userId,
    queueId
  });

  const ticket = await Ticket.findByPk(id, { include: ["contact"] });

  if (!ticket) {
    throw new AppError("ERR_CREATING_TICKET");
  }

  return ticket;
};

export default CreateTicketService;
