import Message from "../../models/Message";
import Ticket from "../../models/Ticket";

// On the official WhatsApp API a company may only write free text (and send buttons or lists) during the 24 hours after the
// person last wrote to it. Outside that window only an approved template goes out. This tells whether the window is open.
export const WINDOW_MS = 24 * 3600 * 1000;

export const insideServiceWindow = async (contactId: number): Promise<boolean> => {
  const last = await Message.findOne({
    where: { fromMe: false },
    include: [{ model: Ticket, as: "ticket", attributes: [], where: { contactId }, required: true }],
    order: [["createdAt", "DESC"]],
    attributes: ["createdAt"]
  });
  // a minute of margin: the last message may be arriving while this runs
  return !!last && Date.now() - new Date(last.createdAt).getTime() < WINDOW_MS - 60000;
};
