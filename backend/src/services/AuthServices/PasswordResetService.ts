import crypto from "crypto";
import { Op, fn, col, where } from "sequelize";

import AppError from "../../errors/AppError";
import PasswordReset from "../../models/PasswordReset";
import User from "../../models/User";
import { logger } from "../../utils/logger";
import { mailConfigured, sendMail } from "../MailServices/SendMail";
import { frontBase, notify } from "../MailServices/Notify";
import { passwordChangedMail, resetPasswordMail } from "../MailServices/Templates";

const TOKEN_MINUTES = 30;
// per person, per hour: nobody can use this to flood somebody's inbox
const MAX_PER_HOUR = 3;
const MIN_PASSWORD = 8;

const hashOf = (token: string): string => crypto.createHash("sha256").update(token).digest("hex");

// Asks for a new password. The answer to the person is always the same, whether the address exists or not (so the
// form cannot be used to find out who has an account); the e-mail goes out in the background.
export const requestReset = async (emailRaw: string, ip: string): Promise<void> => {
  const email = String(emailRaw || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return;
  const user = await User.findOne({ where: where(fn("lower", col("email")), email) });
  if (!user) return;
  if (!(await mailConfigured())) {
    logger.warn("password reset asked but the e-mail account is not set up (Configurações > E-mail)");
    return;
  }
  const recent = await PasswordReset.count({ where: { userId: user.id, createdAt: { [Op.gt]: new Date(Date.now() - 3600000) } } });
  if (recent >= MAX_PER_HOUR) return;

  // a new request cancels the ones before it
  await PasswordReset.update({ usedAt: new Date() }, { where: { userId: user.id, usedAt: null } as any });
  const token = crypto.randomBytes(32).toString("hex");
  await PasswordReset.create({ userId: user.id, tokenHash: hashOf(token), expiresAt: new Date(Date.now() + TOKEN_MINUTES * 60000), requestIp: String(ip || "").slice(0, 64) } as any);
  const link = `${frontBase()}/redefinir-senha/${token}`;
  const mail = resetPasswordMail(user.name, link, TOKEN_MINUTES);
  sendMail({ to: user.email, ...mail }).catch(err => logger.warn(`password reset mail not sent: ${(err as Error).message}`));
};

// Is this link still good? (so the screen can say so before the person types a password)
export const checkToken = async (token: string): Promise<boolean> => {
  if (!/^[a-f0-9]{64}$/.test(String(token || ""))) return false;
  const row = await PasswordReset.findOne({ where: { tokenHash: hashOf(token), usedAt: null, expiresAt: { [Op.gt]: new Date() } } as any });
  return !!row;
};

export const confirmReset = async (token: string, password: string): Promise<void> => {
  if (String(password || "").length < MIN_PASSWORD) throw new AppError("ERR_PASSWORD_TOO_SHORT", 400);
  if (!/^[a-f0-9]{64}$/.test(String(token || ""))) throw new AppError("ERR_INVALID_RESET_TOKEN", 400);
  const row = await PasswordReset.findOne({ where: { tokenHash: hashOf(token), usedAt: null, expiresAt: { [Op.gt]: new Date() } } as any });
  if (!row) throw new AppError("ERR_INVALID_RESET_TOKEN", 400);
  const user = await User.findByPk(row.userId);
  if (!user) throw new AppError("ERR_INVALID_RESET_TOKEN", 400);
  // the new password, and every session opened before stops working
  await user.update({ password, tokenVersion: (user.tokenVersion || 0) + 1 });
  await PasswordReset.update({ usedAt: new Date() }, { where: { userId: user.id, usedAt: null } as any });
  // a security notice: if it was not the person, they know right away
  notify(user.email, passwordChangedMail(user.name, `${frontBase()}/login`), "password changed");
};
