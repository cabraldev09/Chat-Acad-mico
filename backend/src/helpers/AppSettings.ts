import Setting from "../models/Setting";
import { cachedSetting, rememberSetting } from "./SettingsCache";

export const getSetting = async (
  key: string,
  fallback = ""
): Promise<string> => {
  const cached = cachedSetting(key);
  if (cached.hit) return cached.value === null ? fallback : cached.value;
  const setting = await Setting.findOne({ where: { key } });
  rememberSetting(key, setting ? setting.value : null);
  return setting ? setting.value : fallback;
};

export const setSetting = async (key: string, value: string): Promise<void> => {
  const setting = await Setting.findOne({ where: { key } });
  if (setting) {
    await setting.update({ value });
  } else {
    await Setting.create({ key, value });
  }
};
