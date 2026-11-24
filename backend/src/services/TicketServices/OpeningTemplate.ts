import { lastInboundAt } from "../OutboundServices/LastInbound";
import { getSetting } from "../../helpers/AppSettings";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { sideOfSegment } from "../ChannelServices/ConnectionTeam";
import { inMessagingWindow } from "../OutboundServices/Policy";

// The template that reopens a conversation on an official number outside the 24 hours, one per side, set in Configurações. The screens
// no longer send it one by one (every template sent is charged by the Meta): it is read here only to say whether one is configured.
export const openingTemplateOf = async (side: "tutoria" | "atendimento"): Promise<{ name: string; language: string } | null> => {
  const name = String(await getSetting(`${side}_template_name`, "")).trim();
  const language = String(await getSetting(`${side}_template_language`, "pt_BR")).trim() || "pt_BR";
  return name ? { name, language } : null;
};

export interface WindowState {
  official: boolean;
  open: boolean;
  // the person never wrote to this number: the 24 hours did not "pass", they never started
  never?: boolean;
  template: { name: string; language: string } | null;
}

// whether the 24 hours of this conversation's number are open, and the opening template of its side
export const windowOf = async (ticket: Pick<Ticket, "id" | "whatsappId" | "segment" | "contactId">): Promise<WindowState> => {
  const w = await Whatsapp.findByPk(ticket.whatsappId, { attributes: ["id", "channel"] });
  const channel = w?.channel || "whatsapp";
  if (channel !== "whatsapp_cloud") return { official: false, open: true, template: null };
  const last = await lastInboundAt(ticket.contactId, ticket.whatsappId);
  const side = sideOfSegment(ticket.segment) === "tutoria" ? "tutoria" : "atendimento";
  return { official: true, open: inMessagingWindow(channel, last), never: !last, template: await openingTemplateOf(side) };
};
