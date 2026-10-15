import { getSetting } from "./AppSettings";
import Contact from "../models/Contact";
import Polo from "../models/Polo";
import Queue from "../models/Queue";
import Ticket from "../models/Ticket";
import User from "../models/User";

// The greeting a tutor may send to a newly enrolled student. The administration writes it in Configurações; the system
// never sends it: the tutor sees it ready in the message box and decides whether to use it.
export const DEFAULT_WELCOME =
  "Olá, {{primeiro_nome}}! Parabéns pela matrícula! 🎓 Eu sou {{tutor}}, tutor(a) do polo {{polo}}, e vou te ajudar no primeiro acesso à plataforma. Qual o melhor horário para falarmos?";

export const renderWelcome = async (ticket: Ticket, actorId: number): Promise<string> => {
  const template = (await getSetting("onboarding_welcome_template", "")).trim() || DEFAULT_WELCOME;
  const contact = await Contact.findByPk(ticket.contactId, { attributes: ["name"] });
  const tutor = await User.findByPk(ticket.userId || actorId, { attributes: ["name"] });
  const queue = ticket.queueId ? await Queue.findByPk(ticket.queueId, { attributes: ["poloId"] }) : null;
  const polo = queue?.poloId ? await Polo.findByPk(queue.poloId, { attributes: ["name"] }) : null;
  const table: Record<string, string> = {
    primeiro_nome: String(contact?.name || "").trim().split(/\s+/)[0] || "",
    nome: contact?.name || "",
    tutor: tutor?.name || "",
    polo: polo?.name || ""
  };
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, key) => (table[key.toLowerCase()] !== undefined ? table[key.toLowerCase()] : whole));
};
