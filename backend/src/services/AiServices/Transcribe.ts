import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";

import { PUBLIC_DIR } from "../../config/paths";
import { getSetting } from "../../helpers/AppSettings";
import AiAgent from "../../models/AiAgent";
import { logger } from "../../utils/logger";
import { logUsage } from "./Usage";

// Voice notes are common in Brazil. When the company turned it on (Setting `ai_transcribe_audio` = "1") and the OpenAI key is connected,
// the audio is written down with the same key the agents already use, so the AI answers what the person said instead of a file name.
const OPENAI_URL = (): string => process.env.OPENAI_API_URL || "https://api.openai.com";
const MAX_BYTES = 12 * 1024 * 1024;

export const transcriptionEnabled = async (): Promise<boolean> => (await getSetting("ai_transcribe_audio", "0")) === "1" && !!(await openaiKey());

const openaiKey = async (): Promise<string> => (await getSetting("ai_openai_key", "")) || (await AiAgent.findOne({ where: { provider: "openai" } as any }))?.apiKey || "";

// the text of the audio (null when it is off, too big, fails or has no speech): the caller then asks the person to write
export const transcribeAudio = async (mediaUrl: string, agentId?: number | null): Promise<string | null> => {
  try {
    if (!(await transcriptionEnabled())) return null;
    const full = path.join(PUBLIC_DIR, path.basename(String(mediaUrl || "")));
    if (!fs.existsSync(full) || fs.statSync(full).size > MAX_BYTES) return null;
    const form = new FormData();
    form.append("file", fs.createReadStream(full));
    form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1");
    form.append("language", "pt");
    const started = Date.now();
    const { data } = await axios.post(`${OPENAI_URL()}/v1/audio/transcriptions`, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${await openaiKey()}` },
      timeout: 45000,
      maxBodyLength: Infinity
    });
    await logUsage({ agentId: agentId || null, model: process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1", kind: "reply", usage: {}, latencyMs: Date.now() - started });
    const text = String(data?.text || "").replace(/\s+/g, " ").trim();
    return text ? text.slice(0, 1500) : null;
  } catch (err) {
    logger.warn(`Audio transcription failed: ${(err as Error).message}`);
    return null;
  }
};
