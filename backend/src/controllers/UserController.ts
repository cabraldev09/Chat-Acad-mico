import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import CheckSettingsHelper from "../helpers/CheckSettings";
import AppError from "../errors/AppError";
import User from "../models/User";
import { roleOf } from "../helpers/Roles";

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

  return res.json({ users, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { email, password, name, profile, role, queueIds, whatsappId, coordArea, phone } = req.body;
  const isSignup = req.url === "/signup";

  if (isSignup) {
    // self-registration is opt-in: only an explicit "enabled" opens it
    const setting = await CheckSettingsHelper("userCreation").catch(() => "");
    if (setting !== "enabled") {
      throw new AppError("ERR_USER_CREATION_DISABLED", 403);
    }
  } else {
    assertMayManage(req, { role, profile });
  }

  // a public signup can never choose its own role, sectors or connection
  const user = await CreateUserService({
    email,
    password,
    name,
    profile: isSignup ? "user" : profile,
    role: isSignup ? "consultor" : role,
    queueIds: isSignup ? [] : queueIds,
    whatsappId: isSignup ? undefined : whatsappId,
    coordArea: isSignup ? undefined : coordArea,
    phone: isSignup ? undefined : phone
  });

  if (!isSignup) notify(user.email, staffWelcomeMail(user.name, ROLE_LABEL[String(role || "")] || "Equipe", user.email, `${frontBase()}/login`), "staff welcome");

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
  return res.status(200).json({ ...user.toJSON(), role: roleOf(user) });
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { userId } = req.params;
  const userData = req.body;
  const target = await User.findByPk(userId, { attributes: ["id", "profile", "role"] });
  assertMayManage(req, { role: userData.role, profile: userData.profile }, target);

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

  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  await DeleteUserService(userId);

  const io = getIO();
  io.emit("user", {
    action: "delete",
    userId
  });

  return res.status(200).json({ message: "User deleted" });
};
