import Message from "../../models/Message";
import Ticket from "../../models/Ticket";

// The last message the person sent to this number (any conversation of the contact on it), ignoring the deleted ones: the same rule for
// the screen ("the 24 hours are open") and for the send itself, so they never disagree.
export const lastInboundAt = async (contactId: number, whatsappId: number): Promise<Date | null> => {
  const last = await Message.findOne({
    where: { fromMe: false, isDeleted: false },
    include: [{ model: Ticket, as: "ticket", attributes: [], where: { contactId, whatsappId }, required: true }],
    order: [["createdAt", "DESC"]],
    attributes: ["createdAt"]
  });
  return last ? new Date(last.createdAt) : null;
};
