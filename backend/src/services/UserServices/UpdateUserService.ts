import { MIN_PASSWORD } from "../../helpers/Passwords";
import { joinRelationshipQueue, leaveRelationshipQueue } from "../RelationshipServices/Relationship";
import * as Yup from "yup";
import { col, fn, where } from "sequelize";

import AppError from "../../errors/AppError";
import { normalizePhone } from "../../helpers/Phone";
import { SerializeUser } from "../../helpers/SerializeUser";
import User from "../../models/User";
import ShowUserService from "./ShowUserService";
import { COORD_AREAS, ROLES } from "../../helpers/Roles";
import { disconnectUser } from "../../libs/socket";

interface UserData {
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

  const schema = Yup.object().shape({
    name: Yup.string().min(2),
    email: Yup.string().email(),
    profile: Yup.string(),
    password: Yup.string().min(MIN_PASSWORD, "ERR_PASSWORD_SHORT")
  });

  const {
    email,
    password,
    profile,
    role,
    name,
    queueIds = [],
    whatsappId,
    coordArea,
    phone
  } = userData;

  try {
    await schema.validate({ email, password, profile, name });
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

  await user.update({
    tokenVersion: user.tokenVersion + 1,
    email: cleanEmail,
    password,
    profile: finalRole ? (finalRole === "admin" ? "admin" : "user") : profile,
    role: finalRole,
    name,
    // the area only matters for coordinators; any other role clears it
    coordArea: (finalRole || user.role) === "coordenacao" && (COORD_AREAS as readonly string[]).includes(String(coordArea)) ? coordArea : (finalRole || user.role) === "coordenacao" ? user.coordArea : null,
    ...(phone !== undefined ? { phone: normalizePhone(phone) || null } : {}),
    whatsappId: whatsappId ? whatsappId : null
  });

  await user.$set("queues", queueIds);
  // the relationship team works from the queue of the department; leaving the team leaves the queue
  if ((finalRole || user.role) === "relacionamento") await joinRelationshipQueue(user.id);
  else if (finalRole) await leaveRelationshipQueue(user.id);

  await user.reload();
  disconnectUser(user.id);

  return SerializeUser(user);
};

export default UpdateUserService;
