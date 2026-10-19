import { getSetting, setSetting } from "./AppSettings";
import { openSecret, sealSecret } from "./Secrets";
import Setting from "../models/Setting";

// A key the system must send to a provider (the AI keys) is stored sealed (AES-256-GCM keyed from the server secret): a copy of the database
// alone does not reveal it. A value written before sealing existed is read as it is, and sealed the next time the server starts.
export const getSecretSetting = async (key: string, fallback = ""): Promise<string> => openSecret(await getSetting(key, "")) || fallback;

export const setSecretSetting = async (key: string, value: string): Promise<void> => setSetting(key, value ? sealSecret(value) : "");

const SEALED_SETTINGS = ["ai_anthropic_key", "ai_openai_key"];

// at start: keys saved in plain text become sealed ones (once); the same for the key of each AI agent
export const sealStoredKeys = async (): Promise<number> => {
  let n = 0;
  for (const key of SEALED_SETTINGS) {
    const row = await Setting.findOne({ where: { key } });
    if (row && row.value && !row.value.startsWith("enc:v1:")) {
      await row.update({ value: sealSecret(row.value) });
      n += 1;
    }
  }
  const { default: AiAgent } = await import("../models/AiAgent");
  const agents = await AiAgent.sequelize!.query(`SELECT id, "apiKey" FROM "AiAgents" WHERE "apiKey" IS NOT NULL AND "apiKey" <> '' AND "apiKey" NOT LIKE 'enc:v1:%'`, { type: "SELECT" as any });
  for (const a of agents as any[]) {
    await AiAgent.sequelize!.query(`UPDATE "AiAgents" SET "apiKey" = :v WHERE id = :id`, { replacements: { v: sealSecret(a.apiKey), id: a.id } });
    n += 1;
  }
  return n;
};
