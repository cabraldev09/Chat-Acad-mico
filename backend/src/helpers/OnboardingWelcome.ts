import { Op } from "sequelize";
import { getSetting } from "./AppSettings";
import { institutionNameFor } from "./Institution";
import Contact from "../models/Contact";
import Course from "../models/Course";
import Lead from "../models/Lead";
import LeadActivity from "../models/LeadActivity";
import LeadEnrollment from "../models/LeadEnrollment";
import Message from "../models/Message";
import Polo from "../models/Polo";
import Queue from "../models/Queue";
import Ticket from "../models/Ticket";
import User from "../models/User";

// The first approach of the tutor. The administration writes it in Configurações; the system never sends it: the tutor sees it ready in
// the message box, with the data of the enrollment filled in, and decides whether to use it.
//
// Variables: {{saudacao}}, {{primeiro_nome}}, {{nome}}, {{tutor}}, {{polo}}, {{curso}} and {{instituicao}}. A part of the text between
// [[ and ]] is kept only when every variable inside it has a value, so a student with no polo or no course yet reads clean, with no hole.
// {{saudacao}} answers the student who wrote first ("Olá, Ana, que bom que você chamou!"), else it only greets ("Olá, Ana!").
export const DEFAULT_WELCOME =
  "{{saudacao}} Eu sou {{tutor}}, tutor(a) da {{instituicao}}[[ no polo {{polo}}]], e vou acompanhar você[[ no curso de {{curso}}]]. O primeiro passo é a sua ambientação, a apresentação da plataforma de estudos. Qual o melhor dia e horário para falarmos?";

// someone wrote to the tutoring number and the system has no enrollment of theirs: no talk of enrollment or onboarding, only who the
// tutor is and the one thing needed to find the student (the RGM)
export const DEFAULT_UNKNOWN =
  "{{saudacao}} Eu sou {{tutor}}, da tutoria da {{instituicao}}. Para eu localizar o seu cadastro, você pode me informar o seu RGM?";

// the greeting: the student already wrote and nobody answered yet, or the tutor starts the conversation
export const greetingOf = (firstName: string, studentWroteFirst: boolean): string => {
  const name = String(firstName || "").trim();
  if (studentWroteFirst) return name ? `Olá, ${name}, que bom que você chamou!` : "Olá, que bom que você chamou!";
  return name ? `Olá, ${name}!` : "Olá!";
};

// each tutor may write their own text (Meus alunos → Meu texto de boas-vindas); without one, the text of the company, else the default
export const companyWelcome = async (): Promise<string> => (await getSetting("onboarding_welcome_template", "")).trim() || DEFAULT_WELCOME;
export const ownWelcomeOf = (preferences: string | null | undefined): string => {
  try {
    const v = preferences ? JSON.parse(preferences) : {};
    return typeof v?.welcomeTemplate === "string" ? v.welcomeTemplate.trim() : "";
  } catch (e) {
    return "";
  }
};

const VARIABLE = /\{\{\s*([a-z_]+)\s*\}\}/gi;

// pure: the text with its variables and optional parts filled; an unknown variable stays as typed
export const fillWelcome = (template: string, table: Record<string, string>): string => {
  const value = (key: string): string | undefined => table[key.toLowerCase()];
  const withParts = template.replace(/\[\[([\s\S]*?)\]\]/g, (_whole, inner: string) => {
    const keys = Array.from(inner.matchAll(VARIABLE)).map(m => m[1]);
    return keys.every(k => value(k) === undefined || String(value(k)).trim() !== "") ? inner : "";
  });
  return withParts
    .replace(VARIABLE, (whole, key: string) => (value(key) !== undefined ? String(value(key)) : whole))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
};

export interface WelcomeFacts {
  enrolled: boolean;
  courseName: string | null;
  poloName: string | null;
  rgm: string | null;
  consultantName: string | null;
  note: string | null;
  enrolledAt: string | null;
}

export const welcomeFacts = async (ticket: Ticket, actorId: number): Promise<{ table: Record<string, string>; facts: WelcomeFacts; tutorPreferences: string | null }> => {
  const contact = await Contact.findByPk(ticket.contactId, { attributes: ["name"] });
  // what the enrollment recorded: the course and the polo of the student, the tutor chosen there, the RGM and the consultant's note
  const lead = await Lead.findOne({ where: { contactId: ticket.contactId }, attributes: ["id", "courseId", "poloId", "onboardingTutorId", "enrolledAt", "rgm", "ownerId"], order: [["updatedAt", "DESC"]] });
  // a second enrollment has its own row; the first one is recorded on the lead and in the activity of the enrollment (with the note)
  const enrollment = lead ? await LeadEnrollment.findOne({ where: { leadId: lead.id }, order: [["enrolledAt", "DESC"], ["id", "DESC"]] }) : null;
  const record = lead && !enrollment ? await LeadActivity.findOne({ where: { leadId: lead.id, meta: { [Op.like]: '%"kind":"enrollment"%' } } as any, order: [["id", "DESC"]] }) : null;
  const recordMeta = (() => { try { return record?.meta ? JSON.parse(record.meta) : {}; } catch (e) { return {}; } })();
  const recordNote = recordMeta.note || (record?.body ? (String(record.body).match(/Obs\.: (.+)$/) || [])[1] : null) || null;
  const tutor = await User.findByPk(ticket.userId || enrollment?.tutorId || lead?.onboardingTutorId || actorId, { attributes: ["name", "preferences"] });
  const queue = ticket.queueId ? await Queue.findByPk(ticket.queueId, { attributes: ["poloId"] }) : null;
  const poloId = enrollment?.poloId || lead?.poloId || queue?.poloId || null;
  const polo = poloId ? await Polo.findByPk(poloId, { attributes: ["name"] }) : null;
  const course = enrollment?.courseName || recordMeta.courseName ? null : lead?.courseId ? await Course.findByPk(lead.courseId, { attributes: ["name"] }) : null;
  const consultantId = enrollment?.ownerId || lead?.ownerId || recordMeta.actorId || null;
  const consultant = consultantId ? await User.findByPk(consultantId, { attributes: ["name"] }) : null;
  // the student wrote and nobody answered yet: the text answers them
  const wrote = !ticket.firstResponseAt && (await Message.count({ where: { ticketId: ticket.id, fromMe: false } })) > 0;
  const fullName = String(contact?.name || "").trim();
  const firstName = fullName.split(/\s+/)[0] || "";
  const courseName = enrollment?.courseName || recordMeta.courseName || course?.name || "";
  const enrolledAt = enrollment?.enrolledAt || lead?.enrolledAt || null;
  return {
    tutorPreferences: tutor?.preferences || null,
    facts: {
      enrolled: !!(enrollment || lead?.enrolledAt),
      courseName: courseName || null,
      poloName: polo?.name || null,
      rgm: enrollment?.rgm || lead?.rgm || null,
      consultantName: consultant?.name || null,
      note: (enrollment?.note ? String(enrollment.note).trim() : recordNote ? String(recordNote).trim() : "") || null,
      enrolledAt: enrolledAt ? new Date(enrolledAt).toISOString() : null
    },
    table: {
      saudacao: greetingOf(firstName, wrote),
      primeiro_nome: firstName,
      nome: fullName,
      tutor: tutor?.name || "",
      polo: polo?.name || "",
      curso: courseName,
      instituicao: await institutionNameFor({ ticketId: ticket.id })
    }
  };
};

// the text and what the tutor needs to know about the person; a contact with no enrollment gets the neutral text, never "enrollment"
export const renderWelcome = async (ticket: Ticket, actorId: number): Promise<{ text: string; facts: WelcomeFacts }> => {
  const { table, facts, tutorPreferences } = await welcomeFacts(ticket, actorId);
  const template = facts.enrolled ? ownWelcomeOf(tutorPreferences) || (await companyWelcome()) : DEFAULT_UNKNOWN;
  return { text: fillWelcome(template, table), facts };
};
