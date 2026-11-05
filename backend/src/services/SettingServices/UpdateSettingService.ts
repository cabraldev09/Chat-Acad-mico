import AppError from "../../errors/AppError";
import Setting from "../../models/Setting";
import { isValidTz, setAppTz } from "../../helpers/AppTime";

// settings that may be created on first save
const CREATABLE = ["appTimezone", "appName", "onboarding_sla_hours", "chatbot_reminder_minutes", "max_connections_per_user", "onboarding_welcome_template", "response_sla_minutes", "tutoria_whatsapp_id", "ai_reactivation", "ai_reactivation_minutes"];
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
  // the reminders of the AI agent: on/off, and the first one between 1 minute and 4 hours of silence
  if (key === "ai_reactivation" && !["0", "1"].includes(String(value))) throw new AppError("ERR_INVALID_SETTING", 400);
  if (key === "ai_reactivation_minutes" && !(Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 240)) throw new AppError("ERR_INVALID_SETTING", 400);

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
