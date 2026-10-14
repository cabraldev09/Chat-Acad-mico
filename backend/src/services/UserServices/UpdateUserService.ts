import * as Yup from "yup";

import AppError from "../../errors/AppError";
import { SerializeUser } from "../../helpers/SerializeUser";
import ShowUserService from "./ShowUserService";
import { COORD_AREAS, ROLES } from "../../helpers/Roles";

interface UserData {
  email?: string;
  password?: string;
  name?: string;
  profile?: string;
  role?: string;
  queueIds?: number[];
  whatsappId?: number;
  coordArea?: string;
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
    password: Yup.string()
  });

  const {
    email,
    password,
    profile,
    role,
    name,
    queueIds = [],
    whatsappId,
    coordArea
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

  await user.update({
    email,
    password,
    profile: finalRole ? (finalRole === "admin" ? "admin" : "user") : profile,
    role: finalRole,
    name,
    // the area only matters for coordinators; any other role clears it
    coordArea: (finalRole || user.role) === "coordenacao" && (COORD_AREAS as readonly string[]).includes(String(coordArea)) ? coordArea : (finalRole || user.role) === "coordenacao" ? user.coordArea : null,
    whatsappId: whatsappId ? whatsappId : null
  });

  await user.$set("queues", queueIds);

  await user.reload();

  return SerializeUser(user);
};

export default UpdateUserService;
