import { Request, Response } from "express";

import AppError from "../errors/AppError";
import { isManagerRole, roleOf } from "../helpers/Roles";
import Lead from "../models/Lead";
import Queue from "../models/Queue";
import { connectionOfTeam } from "../services/ChannelServices/ConnectionTeam";
import emitTicketUpdate from "../services/TicketServices/EmitTicketUpdate";
import { windowOf } from "../services/TicketServices/OpeningTemplate";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import { sideConversation } from "../services/TicketServices/TeamHandoff";
import { listStudents, tutorPanel, tutorsAndPolos } from "../services/TutoriaServices/Students";

const isTutor = (req: Request): boolean => roleOf(req.user) === "tutor";

// "Meus alunos": the tutor sees their own students; the management sees everybody (by tutor and polo); the consultants have their CRM
export const students = async (req: Request, res: Response): Promise<Response> => {
  const manager = isManagerRole(roleOf(req.user));
  if (!manager && !isTutor(req)) throw new AppError("ERR_NO_PERMISSION", 403);
  const tutorId = manager ? (req.query.tutorId === "none" ? "none" : Number(req.query.tutorId) || null) : Number(req.user.id);
  const list = await listStudents({ tutorId, poloId: manager ? Number(req.query.poloId) || null : null });
  return res.json({ ...list, ...(manager ? await tutorsAndPolos() : {}) });
};

// the manager's panel per tutor (period: from/to, default the last 30 days)
export const panel = async (req: Request, res: Response): Promise<Response> => {
  if (!isManagerRole(roleOf(req.user))) throw new AppError("ERR_NO_PERMISSION", 403);
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59`) : new Date();
  const from = req.query.from ? new Date(`${req.query.from}T00:00:00`) : new Date(to.getTime() - 30 * 86400000);
  if (Number.isNaN(+from) || Number.isNaN(+to) || from > to) throw new AppError("ERR_INVALID_PERIOD", 400);
  return res.json(await tutorPanel(from, to));
};

// opens (or finds) the student's conversation on the tutoring number, with the student's tutor; outside the 24 hours the screen offers
// the opening template
export const openConversation = async (req: Request, res: Response): Promise<Response> => {
  const manager = isManagerRole(roleOf(req.user));
  if (!manager && !isTutor(req)) throw new AppError("ERR_NO_PERMISSION", 403);
  const lead = await Lead.findByPk(req.params.leadId, { attributes: ["id", "contactId", "poloId", "onboardingTutorId"] });
  if (!lead || !lead.contactId) throw new AppError("ERR_NOT_FOUND", 404);
  if (!manager && lead.onboardingTutorId !== Number(req.user.id)) throw new AppError("ERR_NO_PERMISSION", 403);
  const number = await connectionOfTeam("tutoria");
  if (!number) throw new AppError("ERR_TEAM_NO_TUTORIA_NUMBER", 400);
  const queue = lead.poloId ? await Queue.findOne({ where: { poloId: lead.poloId, role: "tutoria" } as any, attributes: ["id"] }) : null;
  const ticket = await sideConversation(lead.contactId, "tutoria", number.id, lead.onboardingTutorId || (manager ? null : Number(req.user.id)), queue ? queue.id : null);
  await emitTicketUpdate(ticket.id);
  const full = await ShowTicketService(String(ticket.id));
  return res.json({ ticketId: ticket.id, window: await windowOf(full) });
};

// the tutor brings their students (a spreadsheet): each one becomes theirs in the whole system; the management imports for any tutor
export const importStudents = async (req: Request, res: Response): Promise<Response> => {
  const manager = isManagerRole(roleOf(req.user));
  if (!manager && !isTutor(req)) throw new AppError("ERR_NO_PERMISSION", 403);
  const items: any[] = Array.isArray(req.body?.items) ? req.body.items.slice(0, 2000) : [];
  const { importTutorStudents } = await import("../services/TutoriaServices/ImportStudents");
  return res.json(await importTutorStudents(items, {
    actorId: Number(req.user.id),
    tutorId: manager ? Number(req.body?.tutorId) || null : Number(req.user.id),
    manager,
    dryRun: Boolean(req.body?.dryRun)
  }));
};

// Avisos da tutoria (TutoriaServices/Notices): the preview (how many students, the cost, what blocks it) and the send after the
// confirmation. The tutor reaches only their own students; the management any polo, course or tutor.
const noticeScope = (req: Request): number | null => {
  const manager = isManagerRole(roleOf(req.user));
  if (!manager && !isTutor(req)) throw new AppError("ERR_NO_PERMISSION", 403);
  return manager ? null : Number(req.user.id);
};
export const noticePreview = async (req: Request, res: Response): Promise<Response> => {
  const tutorOnly = noticeScope(req);
  const { cleanNotice, previewNotice, publicPreview } = await import("../services/TutoriaServices/Notices");
  return res.json(publicPreview(await previewNotice(cleanNotice(req.body), tutorOnly, Number(req.user.id))));
};
export const noticeSend = async (req: Request, res: Response): Promise<Response> => {
  const tutorOnly = noticeScope(req);
  if (req.body?.confirm !== true) throw new AppError("ERR_NOTICE_CONFIRM", 400);
  const { cleanNotice, sendNotice } = await import("../services/TutoriaServices/Notices");
  return res.json(await sendNotice(cleanNotice(req.body), Number(req.user.id), tutorOnly));
};
