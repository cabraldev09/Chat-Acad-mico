import AppError from "../../errors/AppError";
import Setting from "../../models/Setting";
import { isValidTz, setAppTz } from "../../helpers/AppTime";

// settings that may be created on first save
const CREATABLE = ["appTimezone", "appName", "onboarding_sla_hours", "chatbot_reminder_minutes"];
// per-model token prices, typed by the administrator
const CREATABLE_PREFIX = ["ai_price_"];

interface Request {
  key: string;
  value: string;
}

const UpdateSettingService = async ({
  key,
  value
}: Request): Promise<Setting | undefined> => {
  if (key === "appTimezone" && !isValidTz(value)) {
    throw new AppError("ERR_INVALID_TIMEZONE", 400);
  }

  let setting = await Setting.findOne({
    where: { key }
  });

  if (!setting && (CREATABLE.includes(key) || CREATABLE_PREFIX.some(p => key.startsWith(p)))) {
    setting = await Setting.create({ key, value });
  }

  if (!setting) {
    throw new AppError("ERR_NO_SETTING_FOUND", 404);
  }

  await setting.update({ value });
  if (key === "appTimezone") setAppTz(value);

  return setting;
};

export default UpdateSettingService;
