// The settings are read in almost every request (194 places, every file served included) and change rarely: they stay in memory for a
// few seconds. Every change made through the system (the Setting model: save, upsert, bulk update or delete) clears the memory at once
// and again after its transaction commits, so whoever saves never reads the old value. SETTINGS_CACHE_MS=0 turns it off (the end-to-end
// suite writes settings straight into the database).
const store = new Map<string, { at: number; value: string | null }>();

export const settingsTtl = (): number => Number(process.env.SETTINGS_CACHE_MS ?? 15000);

export const cachedSetting = (key: string): { hit: boolean; value: string | null } => {
  const ttl = settingsTtl();
  const entry = store.get(key);
  if (ttl > 0 && entry && Date.now() - entry.at < ttl) return { hit: true, value: entry.value };
  return { hit: false, value: null };
};

export const rememberSetting = (key: string, value: string | null): void => {
  if (settingsTtl() <= 0) return;
  if (store.size > 2000) store.clear();
  store.set(key, { at: Date.now(), value });
};

export const forgetSettings = (options?: any): void => {
  store.clear();
  const t = options && options.transaction;
  if (t && typeof t.afterCommit === "function") t.afterCommit(() => store.clear());
};
