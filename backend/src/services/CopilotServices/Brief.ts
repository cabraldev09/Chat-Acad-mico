import { Op } from "sequelize";

import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import { getAppTz } from "../../helpers/AppTime";
import { segmentsOfSide, sideOfSegment, TUTORIA_SEGMENTS } from "../ChannelServices/ConnectionTeam";

const MARK = "‎";

export interface ContactTranscript {
  text: string;
  lastMessageId: string | null;
  conversations: number;
  attendants: string[];
}

// The conversations of the same side as this one: the tutors never read the consultants' conversations and vice-versa
export const sameSideWhere = (ticket: Pick<Ticket, "contactId" | "segment">): any => {
  const segments = segmentsOfSide(sideOfSegment(ticket.segment));
  return {
    contactId: ticket.contactId,
    isGroup: false,
    ...(segments ? { segment: { [Op.in]: segments } } : { [Op.or]: [{ segment: { [Op.notIn]: [...TUTORIA_SEGMENTS, "relationship"] } }, { segment: null }] })
  };
};

// The whole story of the client on this side, not only this conversation: earlier attendances (and who attended them) are where the
// consultant who receives a returning or transferred client loses the most time. The newest messages win when the story is long.
// `onlyThis`: just this conversation (what goes to the other side when the tutoring or the consultant is called).
export const contactTranscript = async (ticket: Ticket, limit = 60, onlyThis = false): Promise<ContactTranscript> => {
  const tickets = await Ticket.findAll({ where: onlyThis ? { id: ticket.id } : sameSideWhere(ticket), attributes: ["id", "userId", "lastUserId"] });
  const ids = tickets.map(t => t.id);
  const people = [...new Set(tickets.flatMap(t => [t.userId, t.lastUserId]).filter(Boolean))] as number[];
  const names = new Map((people.length ? await User.findAll({ where: { id: people }, attributes: ["id", "name"] }) : []).map(u => [u.id, u.name]));
  const byTicket = new Map(tickets.map(t => [t.id, names.get(t.userId) || names.get(t.lastUserId) || ""]));
  const rows = (await Message.findAll({
    where: { ticketId: { [Op.in]: ids.length ? ids : [ticket.id] }, isDeleted: false } as any,
    attributes: ["id", "body", "fromMe", "mediaType", "createdAt", "ticketId"],
    order: [["createdAt", "DESC"], ["id", "DESC"]],
    limit
  })).reverse();
  const when = (d: Date) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: getAppTz() }).format(new Date(d));
  const lines = rows.map(m => {
    const body = String(m.body || "").replace(/^‎/, "").replace(/^\*[^*\n]{1,60}:\*\n/, "").trim() || (m.mediaType && m.mediaType !== "chat" ? `[${m.mediaType}]` : "");
    const who = !m.fromMe ? "Cliente" : String(m.body || "").startsWith(MARK) ? "Robô" : `Consultor${byTicket.get(m.ticketId) ? ` (${byTicket.get(m.ticketId)})` : ""}`;
    return body ? `[${when(m.createdAt)}] ${who}: ${body.slice(0, 600)}` : "";
  }).filter(Boolean);
  return {
    text: lines.join("\n").slice(-12000),
    lastMessageId: rows.length ? String(rows[rows.length - 1].id) : null,
    conversations: new Set(rows.map(m => m.ticketId)).size,
    attendants: [...new Set([...byTicket.values()].filter(Boolean))]
  };
};

export interface CopilotBrief {
  resumo: string;
  interesse: string;
  pendencias: string[];
  objecoes: string[];
  proximoPasso: string;
  mensagemSugerida: string;
  // the subject belongs to the other side: "tutoria" (academic matters of an enrolled student) or "atendimento" (enrollment, payments,
  // re-enrollment, another course); empty when it is this side's
  encaminhar: "" | "tutoria" | "atendimento";
}

export const BRIEF_SYSTEM = [
  "Você ajuda um CONSULTOR de uma faculdade EAD (Cruzeiro do Sul Virtual) a retomar o atendimento de um cliente no WhatsApp.",
  "Leia o histórico (pode ter vários atendimentos e consultores) e responda SOMENTE um JSON válido, sem texto fora dele, com as chaves:",
  '{"resumo": "até 4 frases: quem é, o que quer, o que já aconteceu", "interesse": "curso/forma de ingresso/polo de interesse ou vazio",',
  '"pendencias": ["o que ficou combinado e não foi feito, documentos, respostas devidas"], "objecoes": ["dúvidas ou receios que travam a matrícula"],',
  '"proximoPasso": "a melhor ação agora, objetiva", "mensagemSugerida": "a próxima mensagem do consultor, curta, profissional, sem emoji",',
  '"encaminhar": "tutoria" se o assunto atual é acadêmico de aluno já matriculado (disciplinas, provas, notas, ambiente virtual, estágio) e quem atende é o comercial; "atendimento" se o assunto é matrícula, pagamento, rematrícula ou outro curso e quem atende é a tutoria; senão ""}',
  "Use só fatos do histórico. Nunca invente valores, bolsas, prazos ou confirmação de matrícula. Listas vazias quando não houver."
].join("\n");

// The model answers JSON; a little noise around it (a code fence, a sentence) is tolerated. Anything else is not a brief.
export const parseBrief = (raw: string): CopilotBrief | null => {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const j = JSON.parse(raw.slice(start, end + 1));
    const str = (v: any, max: number) => String(v ?? "").trim().slice(0, max);
    const list = (v: any) => (Array.isArray(v) ? v : []).map(x => str(x, 200)).filter(Boolean).slice(0, 6);
    const encaminhar: CopilotBrief["encaminhar"] = j.encaminhar === "tutoria" || j.encaminhar === "atendimento" ? j.encaminhar : "";
    const brief = { resumo: str(j.resumo, 900), interesse: str(j.interesse, 200), pendencias: list(j.pendencias), objecoes: list(j.objecoes), proximoPasso: str(j.proximoPasso, 300), mensagemSugerida: str(j.mensagemSugerida, 700), encaminhar };
    return brief.resumo ? brief : null;
  } catch {
    return null;
  }
};
