import Setting from "../models/Setting";

export const getSetting = async (
  key: string,
  fallback = ""
): Promise<string> => {
  const setting = await Setting.findOne({ where: { key } });
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
