import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";

import { PUBLIC_DIR } from "../../config/paths";
import { getSetting } from "../../helpers/AppSettings";
import { getSecretSetting } from "../../helpers/SecretSettings";
import { Op } from "sequelize";

import AiAgent from "../../models/AiAgent";
import Message from "../../models/Message";
import { mediaKindOf } from "./Media";
import { logger } from "../../utils/logger";
import { logUsage } from "./Usage";

// Voice notes are common in Brazil. When the OpenAI key is connected the audio is written down with the same key the agents already use, so the
// AI answers what the person said instead of a file name. It is ON by default with a key; the company can turn it off (Setting
// `ai_transcribe_audio` = "0").
const OPENAI_URL = (): string => process.env.OPENAI_API_URL || "https://api.openai.com";
const MAX_BYTES = 12 * 1024 * 1024;

export const transcriptionEnabled = async (): Promise<boolean> => (await getSetting("ai_transcribe_audio", "1")) !== "0" && !!(await openaiKey());

// the OpenAI key: the one of Configurações, else the one of the server (OPENAI_API_KEY), else the key of an active OpenAI agent
const openaiKey = async (): Promise<string> =>
  (await getSecretSetting("ai_openai_key")) ||
  String(process.env.OPENAI_API_KEY || "").trim() ||
  (await AiAgent.findOne({ where: { provider: "openai", active: true, apiKey: { [Op.ne]: null } } as any, order: [["id", "ASC"]] }))?.apiKey ||
  "";

// the text of the audio (null when it is off, too big, fails or has no speech): the caller then asks the person to write
export const transcribeAudio = async (mediaUrl: string, agentId?: number | null): Promise<string | null> => {
  try {
    if (!(await transcriptionEnabled())) return null;
    const full = path.join(PUBLIC_DIR, path.basename(String(mediaUrl || "")));
    if (!fs.existsSync(full)) return null;
    const size = fs.statSync(full).size;
    if (size > MAX_BYTES) return null;
    const form = new FormData();
    form.append("file", fs.createReadStream(full));
    form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1");
    form.append("language", "pt");
    // with the duration, so the cost (charged by minute) is counted in Custos
    form.append("response_format", "verbose_json");
    const started = Date.now();
    const { data } = await axios.post(`${OPENAI_URL()}/v1/audio/transcriptions`, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${await openaiKey()}` },
      timeout: 45000,
      maxBodyLength: Infinity
    });
    // the seconds of audio are the unit of the charge (WhatsApp voice notes are about 2 KB per second when the duration is not told)
    const seconds = Math.max(1, Math.round(Number(data?.duration) || size / 2000));
    await logUsage({ agentId: agentId || null, model: process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1", kind: "reply", usage: { input_tokens: seconds, output_tokens: 0 }, latencyMs: Date.now() - started });
    const text = String(data?.text || "").replace(/\s+/g, " ").trim();
    return text ? text.slice(0, 1500) : null;
  } catch (err) {
    logger.warn(`Audio transcription failed: ${(err as Error).message}`);
    return null;
  }
};

// A voice note of the conversation, written down once and kept on the message (the AI reads it in every turn after, the summary keeps
// it). A file still downloading is waited for a few seconds. Null when it cannot be heard (off, no key, no file, no speech).
export const transcribeMessage = async (m: Message, agentId?: number | null, waitMs = 12000): Promise<string | null> => {
  if (m.transcript) return m.transcript;
  if (!(await transcriptionEnabled())) return null;
  let file = String(m.getDataValue("mediaUrl") || "");
  const started = Date.now();
  // only a voice note that just arrived may still be downloading; an old one without a file will not get one
  const justArrived = Date.now() - new Date(m.createdAt).getTime() < 60000;
  while (!file && justArrived && Date.now() - started < waitMs) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise(r => setTimeout(r, 1500));
    // eslint-disable-next-line no-await-in-loop
    await m.reload({ attributes: ["id", "mediaUrl", "mediaType", "transcript"] });
    if (m.transcript) return m.transcript;
    file = String(m.getDataValue("mediaUrl") || "");
  }
  if (!file || mediaKindOf(m.mediaType, file) !== "audio") return null;
  const text = await transcribeAudio(file, agentId);
  if (text) await Message.update({ transcript: text } as any, { where: { id: m.id }, silent: true } as any).then(() => m.set("transcript", text));
  return text;
};

// an inbound message that is a voice note (also one whose file is still downloading)
export const isVoiceNote = (m: Message): boolean => {
  const file = String(m.getDataValue("mediaUrl") || "");
  if (file) return mediaKindOf(m.mediaType, file) === "audio";
  return m.mediaType === "audio" || m.mediaType === "ptt" || /^\[?(áudio|audio)\]?$/i.test(String(m.body || "").trim());
};
