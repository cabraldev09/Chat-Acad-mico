import * as Yup from "yup";

import AppError from "../../errors/AppError";
import { SerializeUser } from "../../helpers/SerializeUser";
import User from "../../models/User";
import { COORD_AREAS, ROLES } from "../../helpers/Roles";

interface Request {
  email: string;
  password: string;
  name: string;
  queueIds?: number[];
  profile?: string;
  role?: string;
  whatsappId?: number;
  coordArea?: string;
}

interface Response {
  email: string;
  name: string;
  id: number;
  profile: string;
}

const CreateUserService = async ({
  email,
  password,
  name,
  queueIds = [],
  profile = "user",
  role,
  whatsappId,
  coordArea
}: Request): Promise<Response> => {
  const schema = Yup.object().shape({
    name: Yup.string().required().min(2),
    email: Yup.string()
      .email()
      .required()
      .test(
        "Check-email",
        "An user with this email already exists.",
        async value => {
          if (!value) return false;
          const emailExists = await User.findOne({
            where: { email: value }
          });
          return !emailExists;
        }
      ),
    password: Yup.string().required().min(5)
  });

  try {
    await schema.validate({ email, password, name });
  } catch (err) {
    throw new AppError(err.message);
  }

  if (role !== undefined && !(ROLES as readonly string[]).includes(role)) {
    throw new AppError("ERR_INVALID_ROLE", 400);
  }
  // the role decides the permission level: only "admin" is an administrator
  const finalRole = role || (profile === "admin" ? "admin" : "consultor");

  const user = await User.create(
    {
      email,
      password,
      name,
      profile: finalRole === "admin" ? "admin" : "user",
      role: finalRole,
      coordArea: finalRole === "coordenacao" && (COORD_AREAS as readonly string[]).includes(String(coordArea)) ? coordArea : null,
      whatsappId: whatsappId ? whatsappId : null
    },
    { include: ["queues", "whatsapp"] }
  );

  await user.$set("queues", queueIds);

  await user.reload();

  return SerializeUser(user);
};

export default CreateUserService;
