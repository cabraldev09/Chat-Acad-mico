import { col, fn, where } from "sequelize";
import User from "../../models/User";
import AppError from "../../errors/AppError";
import {
  createAccessToken,
  createRefreshToken
} from "../../helpers/CreateTokens";
import { SerializeUser } from "../../helpers/SerializeUser";
import Queue from "../../models/Queue";
import { burnPasswordTime, needsRehash } from "../../helpers/Passwords";

interface SerializedUser {
  id: number;
  name: string;
  email: string;
  profile: string;
  queues: Queue[];
}

interface Request {
  email: string;
  password: string;
}

interface Response {
  serializedUser: SerializedUser;
  token: string;
  refreshToken: string;
}

const AuthUserService = async ({
  email,
  password
}: Request): Promise<Response> => {
  // the e-mail is compared without caring about capitals ("Maria@x.com" and "maria@x.com" are the same person)
  const user = await User.findOne({
    where: where(fn("LOWER", col("User.email")), String(email || "").trim().toLowerCase()),
    include: ["queues"]
  });

  if (!user) {
    // the same work as a real login: the time of the answer does not tell whether the address has an account
    await burnPasswordTime(password);
    throw new AppError("ERR_INVALID_CREDENTIALS", 401);
  }

  if (!(await user.checkPassword(password))) {
    throw new AppError("ERR_INVALID_CREDENTIALS", 401);
  }

  // an old, cheap hash is replaced by a strong one now that the password is known
  if (needsRehash(user.getDataValue("passwordHash"))) {
    await user.update({ password }).catch(() => undefined);
  }

  const token = createAccessToken(user);
  const refreshToken = createRefreshToken(user);

  const serializedUser = SerializeUser(user);

  return {
    serializedUser,
    token,
    refreshToken
  };
};

export default AuthUserService;
