import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import AppError from "../errors/AppError";
import User from "../models/User";
import { isManagerRole, roleOf } from "../helpers/Roles";

import CreateUserService from "../services/UserServices/CreateUserService";
import ListUsersService from "../services/UserServices/ListUsersService";
import UpdateUserService from "../services/UserServices/UpdateUserService";
import ShowUserService from "../services/UserServices/ShowUserService";
import DeleteUserService from "../services/UserServices/DeleteUserService";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
};

// Administrators manage everyone. Coordinators manage the team (create, edit, set sectors and roles) but can neither
// create or promote administrators nor change an administrator. Nobody else manages users.
const assertMayManage = (req: Request, wanted: { role?: string; profile?: string }, target?: User | null): void => {
  const me = roleOf(req.user);
  if (me === "admin") return;
  if (me !== "coordenacao") throw new AppError("ERR_NO_PERMISSION", 403);
  if (wanted.role === "admin" || wanted.profile === "admin") throw new AppError("ERR_NO_PERMISSION", 403);
  if (target && roleOf(target) === "admin") throw new AppError("ERR_NO_PERMISSION", 403);
};

import { frontBase, notify } from "../services/MailServices/Notify";
import { staffWelcomeMail } from "../services/MailServices/Templates";

const ROLE_LABEL: Record<string, string> = { admin: "Administrador", coordenacao: "Coordenação", consultor: "Consultor", tutor: "Tutor" };

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber } = req.query as IndexQuery;

  const { users, count, hasMore } = await ListUsersService({
    searchParam,
    pageNumber
  });

  // only the management sees the team's contact details (e-mail, phone); the other roles get just what the
  // selectors need (who exists and their function), never the staff directory's personal data
  if (!isManagerRole(roleOf(req.user))) {
    const slim = users.map(u => {
      const { email, phone, ...rest } = u.toJSON() as any;
      return rest;
    });
    return res.json({ users: slim, count, hasMore });
  }

  return res.json({ users, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { email, password, name, profile, role, queueIds, whatsappId, coordArea, phone } = req.body;
  // people are created by the administration only (there is no public sign-up)
  assertMayManage(req, { role, profile });

  const user = await CreateUserService({ email, password, name, profile, role, queueIds, whatsappId, coordArea, phone });

  notify(user.email, staffWelcomeMail(user.name, ROLE_LABEL[String(role || "")] || "Equipe", user.email, `${frontBase()}/login`), "staff welcome");

  const io = getIO();
  io.emit("user", {
    action: "create",
    user
  });

  return res.status(200).json(user);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params;

  const user = await ShowUserService(userId);

  // the form shows the effective role: an administrator is "admin" even when the stored role was left at the default
  const { tokenVersion, ...safe } = user.toJSON() as any;
  // the team's contact details (e-mail, phone) are the management's to see (and each person's own); other roles get the rest
  if (!isManagerRole(roleOf(req.user)) && Number(userId) !== Number(req.user.id)) {
    delete safe.email;
    delete safe.phone;
  }
  return res.status(200).json({ ...safe, role: roleOf(user) });
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { userId } = req.params;
  let userData = req.body;
  if (isManagerRole(roleOf(req.user))) {
    const target = await User.findByPk(userId, { attributes: ["id", "profile", "role"] });
    assertMayManage(req, { role: userData.role, profile: userData.profile }, target);
  } else {
    // a person editing their own profile (canEditUser lets nobody else through): only the name, the phone and the password.
    // Role, sectors, number, e-mail (the login) and the limits of attendance stay with the management.
    const { name, phone, password } = req.body || {};
    userData = { name, phone, password };
  }

  const user = await UpdateUserService({ userData, userId });

  const io = getIO();
  io.emit("user", {
    action: "update",
    user
  });

  return res.status(200).json(user);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { userId } = req.params;

  // the administration removes anyone; the coordination removes the team, never an administrator
  assertMayManage(req, {}, await User.findByPk(userId));

  await DeleteUserService(userId);

  const io = getIO();
  io.emit("user", {
    action: "delete",
    userId
  });

  return res.status(200).json({ message: "User deleted" });
};
