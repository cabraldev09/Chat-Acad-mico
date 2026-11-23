import { withInstitutionOf } from "../../helpers/Institution";
import { Op } from "sequelize";

import { getSetting } from "../../helpers/AppSettings";
import { institutionName } from "../../helpers/Institution";
import Contact from "../../models/Contact";
import Course from "../../models/Course";
import Lead from "../../models/Lead";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { connectionOfTeam } from "../ChannelServices/ConnectionTeam";
import SendToContact from "../ChannelServices/SendToContact";
import { windowOf } from "../TicketServices/OpeningTemplate";
import { logger } from "../../utils/logger";

// When the enrollment is confirmed, the consultant's conversation hands the student the tutoring number: a short text and the contact
// card (QR) or the number in the text (official). The student saves it and writes "oi" there, which opens a free conversation on the
// tutoring number. Outside the 24 hours of the official API it goes by the approved welcome template. Never blocks the enrollment.

const digits = (s: unknown): string => String(s || "").replace(/\D/g, "");
export const prettyPhone = (d: string): string => {
  const n = digits(d);
  const m = n.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : n ? `+${n}` : "";
};

// the tutoring number: typed by the administration (Configurações → Tutoria), else the number the Meta reports for the official line
export const tutoriaNumber = async (): Promise<{ number: string; connection: Whatsapp | null }> => {
  const typed = digits(await getSetting("tutoria_numero", ""));
  const connection = await connectionOfTeam("tutoria");
  const fromLine = connection && connection.channel === "whatsapp_cloud" ? digits(connection.session) : "";
  return { number: typed || fromLine, connection };
};

export const vcardOf = (name: string, number: string): string =>
  `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL;type=CELL;waid=${number}:+${number}\nEND:VCARD`;

// the tutor chosen in the enrollment is named, and the student is asked to write to schedule the onboarding session (ambientação)
export const welcomeText = (first: string, number: string, tutorName?: string | null): string => {
  const who = tutorName ? `${tutorName}, da tutoria da ${institutionName()}, vai acompanhar você no curso` : `A tutoria da ${institutionName()} vai acompanhar você no curso`;
  return `${first ? `${first}, ` : ""}sua matrícula está confirmada! ${who}. Salve o número da tutoria ${prettyPhone(number)} e mande uma mensagem por lá para agendar a sua ambientação (a apresentação da plataforma de estudos).`;
};

export const sendTutoriaContact = async (lead: Lead, tutorName?: string | null): Promise<string | null> =>
  withInstitutionOf({ lead }, () => sendTutoriaContactNow(lead, tutorName));
const sendTutoriaContactNow = async (lead: Lead, tutorName?: string | null): Promise<string | null> => {
  try {
    const { number, connection } = await tutoriaNumber();
    // no tutoring line at all (an installation without it): nothing to hand over; a line without a known number: the team is told
    if (!number) return connection ? "O contato da tutoria não foi enviado: informe o número da Tutoria em Configurações → Tutoria." : null;
    if (!lead.contactId) return null;
    const contact = await Contact.findByPk(lead.contactId);
    if (!contact) return null;
    // the consultant's conversation (the last one that is not the tutoring), on its own connection
    const last = await Ticket.findOne({ where: { contactId: contact.id, [Op.or]: [{ segment: null }, { segment: { [Op.notIn]: ["onboarding", "support"] } }] } as any, order: [["updatedAt", "DESC"]] });
    const whatsapp = last ? await Whatsapp.findByPk(last.whatsappId) : null;
    if (!last || !whatsapp) return null;
    // the student already writes on the tutoring number: nothing to hand over
    if (connection && whatsapp.id === connection.id) return null;
    const first = String(lead.name || contact.name || "").split(" ")[0];
    const key = `enroll-tutoria:${lead.id}`;
    const state = await windowOf(last);
    if (state.official && !state.open) {
      const name = await getSetting("boas_vindas_template_name", "");
      if (!name) return "O contato da tutoria não foi enviado: a conversa está fora das 24 horas e o modelo de boas-vindas ainda não foi aprovado.";
      const course = lead.courseId ? await Course.findByPk(lead.courseId, { attributes: ["name"] }) : null;
      await SendToContact({ contact, whatsapp, body: welcomeText(first, number, tutorName), idempotencyKey: key, ticketId: last.id, byPerson: true, template: { name, language: await getSetting("boas_vindas_template_language", "pt_BR"), params: [first || "aluno(a)", course?.name || "seu curso", tutorName || "a equipe de tutoria", prettyPhone(number)] } });
      return null;
    }
    await SendToContact({ contact, whatsapp, body: welcomeText(first, number, tutorName), idempotencyKey: key, ticketId: last.id, byPerson: true });
    // the QR WhatsApp turns this text into a contact card the student saves with one tap
    if (whatsapp.channel === "whatsapp") await SendToContact({ contact, whatsapp, body: vcardOf(`Tutoria ${institutionName()}`, number), idempotencyKey: `${key}:card`, ticketId: last.id, byPerson: true });
    return null;
  } catch (err) {
    logger.warn(`Contato da tutoria não enviado (lead ${lead.id}): ${(err as Error).message}`);
    return `O contato da tutoria não foi enviado (${(err as Error).message}). Envie o número da tutoria ao aluno pela conversa.`;
  }
};
