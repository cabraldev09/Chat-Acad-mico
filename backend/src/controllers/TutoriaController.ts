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
import { listStudents } from "../services/TutoriaServices/Students";

const isTutor = (req: Request): boolean => roleOf(req.user) === "tutor";

// "Meus alunos": the tutor sees their own students; the management sees everybody (by tutor and polo); the consultants have their CRM
export const students = async (req: Request, res: Response): Promise<Response> => {
  const manager = isManagerRole(roleOf(req.user));
  if (!manager && !isTutor(req)) throw new AppError("ERR_NO_PERMISSION", 403);
  const tutorId = manager ? Number(req.query.tutorId) || null : Number(req.user.id);
  return res.json(await listStudents({ tutorId, poloId: manager ? Number(req.query.poloId) || null : null }));
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
