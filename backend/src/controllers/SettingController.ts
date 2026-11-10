import { Request, Response } from "express";

import { getIO } from "../libs/socket";
import AppError from "../errors/AppError";
import { isManagerRole, roleOf } from "../helpers/Roles";
import { SEALED_SETTINGS } from "../helpers/SecretSettings";

import UpdateSettingService from "../services/SettingServices/UpdateSettingService";
import ListSettingsService from "../services/SettingServices/ListSettingsService";

// The generic list of settings is for the administration (the coordination has the same powers, see Roles.isManagerRole). The secrets never
// travel in it: the e-mail password lives only behind /mail/settings, the AI keys behind /ai-keys (the list shows only whether they are set).
export const index = async (req: Request, res: Response): Promise<Response> => {
  if (!isManagerRole(roleOf(req.user))) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const settings = await ListSettingsService();
  const visible = (settings || [])
    .filter(s => s.key !== "mail_pass")
    .map(s => (SEALED_SETTINGS.includes(s.key) ? { ...s.toJSON(), value: s.value ? "••••••••" : "" } : s));
  return res.status(200).json(visible);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { settingKey: key } = req.params;
  if (!isManagerRole(roleOf(req.user))) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  // secrets have their own routes (sealed at rest); writing them here would store them in plain text
  if (key === "mail_pass" || SEALED_SETTINGS.includes(key)) throw new AppError("ERR_NO_PERMISSION", 403);
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
