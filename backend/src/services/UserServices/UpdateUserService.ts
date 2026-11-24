import Whatsapp from "../../models/Whatsapp";
import { MIN_PASSWORD } from "../../helpers/Passwords";
import { joinRelationshipQueue, leaveRelationshipQueue } from "../RelationshipServices/Relationship";
import * as Yup from "yup";
import { col, fn, where } from "sequelize";

import AppError from "../../errors/AppError";
import { normalizePhone } from "../../helpers/Phone";
import { SerializeUser } from "../../helpers/SerializeUser";
import User from "../../models/User";
import ShowUserService from "./ShowUserService";
import { COORD_AREAS, ROLES, roleOf } from "../../helpers/Roles";
import { disconnectUser } from "../../libs/socket";

interface UserData {
  acceptsNewTickets?: boolean;
  maxOpenTickets?: number;
  email?: string;
  password?: string;
  name?: string;
  profile?: string;
  role?: string;
  queueIds?: number[];
  whatsappId?: number;
  coordArea?: string;
  phone?: string;
}

interface Request {
  userData: UserData;
  userId: string | number;
}

interface Response {
  id: number;
  name: string;
  email: string;
  profile: string;
}

const UpdateUserService = async ({
  userData,
  userId
}: Request): Promise<Response | undefined> => {
  const user = await ShowUserService(userId);

  const { profile, role, queueIds, whatsappId, coordArea, phone } = userData;
  // an empty password field means "keep the current one" (the edit form always sends it): only a typed one is validated and saved
  const password = typeof userData.password === "string" && userData.password.trim() ? userData.password : undefined;
  const name = userData.name === undefined ? undefined : String(userData.name).trim();
  const email = userData.email === undefined ? undefined : String(userData.email).trim();

  // only what came in the request is checked: a partial change (only the sectors, only the name) keeps the rest as it is
  const checks: Record<string, Yup.StringSchema> = {};
  if (name !== undefined) checks.name = Yup.string().required("ERR_NAME_REQUIRED").min(2, "ERR_USER_NAME_SHORT");
  if (email !== undefined) checks.email = Yup.string().required("ERR_INVALID_EMAIL").email("ERR_INVALID_EMAIL");
  if (password !== undefined) checks.password = Yup.string().min(MIN_PASSWORD, "ERR_PASSWORD_SHORT");
  try {
    await Yup.object().shape(checks).validate({ name, email, password });
  } catch (err) {
    throw new AppError(err.message);
  }

  if (role !== undefined && !(ROLES as readonly string[]).includes(role)) {
    throw new AppError("ERR_INVALID_ROLE", 400);
  }
  const finalRole = role || (profile === "admin" ? "admin" : undefined);

  // the system always keeps one administrator: nobody can demote the last one (not even themselves)
  if (user.profile === "admin" && finalRole && finalRole !== "admin" && (await User.count({ where: { profile: "admin" } })) <= 1) {
    throw new AppError("ERR_LAST_ADMIN", 400);
  }

  const cleanEmail = email === undefined ? undefined : String(email).trim().toLowerCase();
  if (cleanEmail && cleanEmail !== String(user.email).toLowerCase()) {
    const taken = await User.findOne({ where: where(fn("LOWER", col("email")), cleanEmail), attributes: ["id"] });
    if (taken && taken.id !== user.id) throw new AppError("ERR_USER_EMAIL_EXISTS", 409);
  }

  // the number the person uses must exist
  if (whatsappId && !(await Whatsapp.findByPk(Number(whatsappId), { attributes: ["id"] }))) throw new AppError("ERR_NO_WAPP_FOUND", 404);

  const nextProfile = finalRole ? (finalRole === "admin" ? "admin" : "user") : profile;
  // the sessions of the person end only when what proves who they are, or what they may do, changes (password, e-mail, role):
  // a change of sectors, number or hours keeps them signed in (permissions are read again on every request anyway)
  const accessChanged =
    password !== undefined ||
    (cleanEmail !== undefined && cleanEmail !== String(user.email || "").toLowerCase()) ||
    (finalRole !== undefined && finalRole !== roleOf(user)) ||
    (nextProfile !== undefined && nextProfile !== (user.profile || "user"));

  const patch: Record<string, unknown> = {
    ...(typeof userData.acceptsNewTickets === "boolean" ? { acceptsNewTickets: userData.acceptsNewTickets } : {}),
    ...(userData.maxOpenTickets !== undefined ? { maxOpenTickets: Math.min(1000, Math.max(0, Math.floor(Number(userData.maxOpenTickets) || 0))) } : {}),
    ...(accessChanged ? { tokenVersion: user.tokenVersion + 1 } : {}),
    ...(cleanEmail !== undefined ? { email: cleanEmail } : {}),
    ...(password !== undefined ? { password } : {}),
    ...(nextProfile !== undefined ? { profile: nextProfile } : {}),
    ...(finalRole !== undefined ? { role: finalRole } : {}),
    ...(name !== undefined ? { name } : {}),
    // the area only matters for coordinators; any other role clears it
    coordArea: (finalRole || user.role) === "coordenacao" && (COORD_AREAS as readonly string[]).includes(String(coordArea)) ? coordArea : (finalRole || user.role) === "coordenacao" ? user.coordArea : null,
    ...(phone !== undefined ? { phone: normalizePhone(phone) || null } : {}),
    // the default number only changes when it came in the request ("" or null clears it)
    ...(whatsappId !== undefined ? { whatsappId: whatsappId ? whatsappId : null } : {})
  };
  user.set(patch as any);
  await user.save();

  // the sectors only change when they came in the request (an edit of the name alone keeps them)
  if (Array.isArray(queueIds)) await user.$set("queues", queueIds);
  // the relationship team works from the queue of the department; leaving the team leaves the queue
  if ((finalRole || user.role) === "relacionamento") await joinRelationshipQueue(user.id);
  else if (finalRole) await leaveRelationshipQueue(user.id);

  await user.reload();
  if (accessChanged) disconnectUser(user.id);

  return SerializeUser(user);
};

export default UpdateUserService;
