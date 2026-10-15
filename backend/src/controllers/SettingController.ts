import { Request, Response } from "express";

import { getIO } from "../libs/socket";
import AppError from "../errors/AppError";
import { isManagerRole, roleOf } from "../helpers/Roles";

import UpdateSettingService from "../services/SettingServices/UpdateSettingService";
import ListSettingsService from "../services/SettingServices/ListSettingsService";

// What the coordination may read and change: the day-to-day rules of the service. Access, tokens, keys and payment
// credentials stay with the administrator.
const MANAGER_KEYS = [
  "appTimezone", "onboarding_sla_hours", "chatbot_reminder_minutes", "max_connections_per_user",
  "onboarding_welcome_template", "response_sla_minutes", "tutoria_whatsapp_id"
];

export const index = async (req: Request, res: Response): Promise<Response> => {
  const admin = isManagerRole(roleOf(req.user));
  if (!admin) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const settings = await ListSettingsService();

  return res.status(200).json(admin ? settings : (settings || []).filter(s => MANAGER_KEYS.includes(s.key)));
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { settingKey: key } = req.params;
  if (!isManagerRole(roleOf(req.user))) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  const { value } = req.body;

  const setting = await UpdateSettingService({
    key,
    value
  });

  const io = getIO();
  io.emit("settings", {
    action: "update",
    setting
  });

  return res.status(200).json(setting);
};
