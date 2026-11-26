import { NextFunction, Request, Response } from "express";

import AppError from "../../errors/AppError";
import { roleOf } from "../../helpers/Roles";
import { crmPolosOf } from "../../middleware/scope";
import { listVisibleTo } from "../../helpers/ListScope";
import Campaign from "../../models/Campaign";
import ContactList from "../../models/ContactList";
import { connectionOfTeam } from "../ChannelServices/ConnectionTeam";

// Who sends mass messages: the commercial team and the administration to anyone in the CRM; the tutor only to their own students,
// through the tutoring number, and sees only the campaigns and lists they created.
export const tutorIdOf = (req: Request): number | null => (req.user && roleOf(req.user as any) === "tutor" ? Number(req.user.id) : null);

export const campaignStaff = (req: Request, _res: Response, next: NextFunction): void => {
  if (!["admin", "coordenacao", "consultor", "tutor"].includes(roleOf((req.user || {}) as any))) throw new AppError("ERR_NO_PERMISSION", 403);
  next();
};

// a tutor never pastes or imports numbers: their lists come from their own students
export const notTutor = (req: Request, _res: Response, next: NextFunction): void => {
  if (tutorIdOf(req)) throw new AppError("ERR_TUTOR_ONLY_STUDENTS", 403);
  next();
};

const owned = (model: "campaign" | "list") => async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const me = tutorIdOf(req);
  if (!me) return next();
  const row: any = model === "campaign" ? await Campaign.findByPk(req.params.id, { attributes: ["id", "createdById"] }) : await ContactList.findByPk(req.params.id, { attributes: ["id", "createdById"] });
  if (!row) throw new AppError("ERR_NOT_FOUND", 404);
  if (Number(row.createdById) !== me) throw new AppError("ERR_NO_PERMISSION", 403);
  next();
};
export const ownCampaign = owned("campaign");
export const ownList = owned("list");

export const assertOwnList = async (req: Request, listId: number | string | null | undefined): Promise<void> => {
  const me = tutorIdOf(req);
  if (!me || !listId) return;
  const list = await ContactList.findByPk(listId, { attributes: ["id", "createdById"] });
  if (!list || Number(list.createdById) !== me) throw new AppError("ERR_NO_PERMISSION", 403);
};

// the tutor's campaigns always go through the tutoring number
export const tutoriaConnectionId = async (): Promise<number> => {
  const w = await connectionOfTeam("tutoria");
  if (!w) throw new AppError("ERR_TUTORIA_NO_NUMBER", 400);
  return w.id;
};

// THE COORDINATION sees only the lists of its polos and the campaigns made with them (helpers/ListScope): its own, or the ones whose people are all
// in its polos. Admin, consultant and tutor keep the rules above. The answer is 403 (404 when it does not exist).
export const assertListVisible = async (req: Request, listId: number | string | null | undefined): Promise<void> => {
  if (!listId) return;
  const polos = await crmPolosOf(req);
  if (!polos) return;
  if (await listVisibleTo(listId, polos, Number(req.user.id))) return;
  const exists = await ContactList.findByPk(listId, { attributes: ["id"] });
  throw new AppError(exists ? "ERR_NO_PERMISSION" : "ERR_NOT_FOUND", exists ? 403 : 404);
};
export const assertCampaignVisible = async (req: Request, campaignId: number | string): Promise<void> => {
  const polos = await crmPolosOf(req);
  if (!polos) return;
  const c = await Campaign.findByPk(campaignId, { attributes: ["id", "createdById", "contactListId"] });
  if (!c) throw new AppError("ERR_NOT_FOUND", 404);
  if (Number(c.createdById) === Number(req.user.id)) return;
  if (!(await listVisibleTo(c.contactListId, polos, Number(req.user.id)))) throw new AppError("ERR_NO_PERMISSION", 403);
};
export const listVisible = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  await assertListVisible(req, req.params.id);
  next();
};
export const campaignVisible = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  await assertCampaignVisible(req, req.params.id);
  next();
};
