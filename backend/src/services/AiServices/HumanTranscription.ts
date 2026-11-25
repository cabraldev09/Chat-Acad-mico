import fs from "fs";
import path from "path";
import { Op, QueryTypes } from "sequelize";

import sequelize from "../../database";
import { PUBLIC_DIR } from "../../config/paths";
import { getSetting } from "../../helpers/AppSettings";
import { dayBounds } from "../../helpers/AppTime";
import AiUsage from "../../models/AiUsage";
import Reservation from "../../models/AiBudgetReservation";
import Message from "../../models/Message";
import { logger } from "../../utils/logger";
import { transcribeAudio, transcribeModel, transcriptionEnabled, MAX_BYTES } from "./Transcribe";
import { priceOf } from "./Usage";

// The voice notes of the conversations between people (the lead, the consultant, the tutor) on the WhatsApp numbers (official and QR Code)
// are written down too, so the daily review of the consultants (AnalyticsServices/ConsultantReview) and whoever opens the conversation
// read what was said. It runs in the background (workers/HumanTranscription), a few audios at a time, never in the path that receives the
// message. Each voice note is sent once (Messages.transcribeTriedAt), also when it had no speech or failed.
// It needs: the transcription on (ai_transcribe_audio, the same switch of the agents) and the OpenAI key; its own switch
// (ai_transcribe_human, OFF by default: turned on by the owner after telling the team and the leads); and room in the spending caps: the daily caps of the whole AI (ai_daily_token_cap,
// ai_daily_usd_cap) and its own cap of minutes per day (ai_transcribe_human_daily_minutes, 120 by default). A voice note longer than
// ai_transcribe_human_max_minutes (10 by default) or bigger than 12 MB is not sent.

export const HUMAN_KEYS = { on: "ai_transcribe_human", dailyMinutes: "ai_transcribe_human_daily_minutes", maxMinutes: "ai_transcribe_human_max_minutes" };
export const DEFAULTS = { dailyMinutes: 120, maxMinutes: 10 };
// WhatsApp voice notes are about 2 KB per second (the same estimate of Transcribe.ts when the duration is not told)
const BYTES_PER_SECOND = 2000;
// a voice note that just arrived is left to the AI agent and to the download for a little while
const MIN_AGE_MS = 2 * 60000;
// only the recent ones: an old backlog is not transcribed (nor paid) when the switch is turned on
const MAX_AGE_MS = 48 * 3600000;
const BATCH = 10;

// OFF until the owner turns it on, after the team and the leads are told that the voice notes are transcribed (LGPD)
export const humanTranscriptionOn = async (): Promise<boolean> => (await getSetting(HUMAN_KEYS.on, "0")) === "1" && (await transcriptionEnabled());

const numberSetting = async (key: string, fallback: number): Promise<number> => {
  const n = Number(await getSetting(key, String(fallback)));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

// seconds of audio of the conversations between people already written down today (logged with no agent, as "reading")
export const humanSecondsToday = async (): Promise<number> =>
  Number((await AiUsage.sum("inputTokens", { where: { kind: "reading", agentId: { [Op.is]: null }, model: transcribeModel(), createdAt: { [Op.gte]: dayBounds().start } } as any })) || 0);

export type BudgetVerdict = "ok" | "own_cap" | "token_cap" | "usd_cap" | "rate_required";

// the caps of spending, before sending one voice note of about `seconds` (the same rules of Budget.callWithBudget)
export const budgetFor = async (seconds: number): Promise<BudgetVerdict> => {
  const ownCap = (await numberSetting(HUMAN_KEYS.dailyMinutes, DEFAULTS.dailyMinutes)) * 60;
  if (!ownCap || (await humanSecondsToday()) + seconds > ownCap) return "own_cap";
  const [tokenCap, usdCap] = [Number(await getSetting("ai_daily_token_cap", "0")) || 0, Number(await getSetting("ai_daily_usd_cap", "0")) || 0];
  const since = { [Op.gte]: dayBounds().start };
  const active = { expiresAt: { [Op.gt]: new Date() } };
  if (tokenCap > 0) {
    const used = (await Promise.all((["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"] as const).map(c => AiUsage.sum(c, { where: { createdAt: since } as any }))))
      .reduce((n: number, v: any) => n + (Number(v) || 0), 0);
    const held = Number((await Reservation.sum("tokens", { where: active as any })) || 0);
    if (used + held + seconds > tokenCap) return "token_cap";
  }
  if (usdCap > 0) {
    const price = await priceOf(transcribeModel());
    if (!price) return "rate_required";
    const spent = Number((await AiUsage.sum("estimatedUsd", { where: { createdAt: since } as any })) || 0);
    const held = Number((await Reservation.sum("estimatedUsd", { where: active as any })) || 0);
    if (spent + held + (seconds * price.in) / 1e6 > usdCap) return "usd_cap";
  }
  return "ok";
};

// the voice notes waiting: recent, not tried yet, with the file, in a conversation (not a group) of a WhatsApp number
export const pendingVoiceNotes = async (limit = BATCH): Promise<Array<{ id: string; ticketId: number; mediaUrl: string }>> =>
  sequelize.query(`SELECT m.id, m."ticketId", m."mediaUrl" FROM "Messages" m JOIN "Tickets" t ON t.id = m."ticketId" JOIN "Whatsapps" w ON w.id = t."whatsappId"
    WHERE m."createdAt" > :since AND m."createdAt" < :until AND m.transcript IS NULL AND m."transcribeTriedAt" IS NULL AND m."isDeleted" = false
      AND m."mediaUrl" IS NOT NULL AND lower(m."mediaUrl") !~ '\\.(pdf|webp)$'
      AND (m."mediaType" IN ('audio', 'ptt') OR lower(m."mediaUrl") ~ '\\.(ogg|opus|mp3|m4a|wav|oga|aac)$')
      AND t."isGroup" = false AND w.channel IN ('whatsapp', 'whatsapp_cloud')
    ORDER BY m."createdAt" ASC LIMIT :limit`, {
    replacements: { since: new Date(Date.now() - MAX_AGE_MS), until: new Date(Date.now() - MIN_AGE_MS), limit },
    type: QueryTypes.SELECT
  }) as any;

// takes the voice note for this run (two runs never send the same audio)
const claim = async (id: string): Promise<boolean> => {
  const [, meta]: any = await sequelize.query(`UPDATE "Messages" SET "transcribeTriedAt" = NOW() WHERE id = :id AND "transcribeTriedAt" IS NULL AND transcript IS NULL`, { replacements: { id }, type: QueryTypes.RAW });
  return Number(meta?.rowCount ?? 0) === 1;
};

export interface HumanRun { transcribed: number; skipped: number; failed: number; stopped?: BudgetVerdict | "off" }

// the open conversation shows the transcript as soon as it is written (only who is in the room of that conversation receives it)
const announce = async (id: string): Promise<void> => {
  try {
    const { getIO } = await import("../../libs/socket");
    const message = await Message.findByPk(id, { include: ["contact", { model: Message, as: "quotedMsg", include: ["contact"] }] });
    if (message) getIO().to(String(message.ticketId)).emit("appMessage", { action: "update", message });
  } catch (err) {
    // no socket (tests, a restart): the conversation shows it when it is opened again
  }
};

export const transcribePending = async (limit = BATCH): Promise<HumanRun> => {
  const run: HumanRun = { transcribed: 0, skipped: 0, failed: 0 };
  if (!(await humanTranscriptionOn())) return { ...run, stopped: "off" };
  const maxSeconds = (await numberSetting(HUMAN_KEYS.maxMinutes, DEFAULTS.maxMinutes)) * 60;
  for (const m of await pendingVoiceNotes(limit)) {
    const name = path.basename(String(m.mediaUrl || ""));
    const full = path.join(PUBLIC_DIR, name);
    const size = fs.existsSync(full) ? fs.statSync(full).size : 0;
    const seconds = Math.max(1, Math.round(size / BYTES_PER_SECOND));
    // no file, too long or too big: marked as tried, never sent (and not looked at again)
    if (!size || size > MAX_BYTES || (maxSeconds > 0 && seconds > maxSeconds)) {
      // eslint-disable-next-line no-await-in-loop
      if (await claim(m.id)) run.skipped += 1;
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const verdict = await budgetFor(seconds);
    // a cap reached: this one and the rest wait (tomorrow there is room again; the window of 48 hours still takes them)
    if (verdict !== "ok") return { ...run, stopped: verdict };
    // eslint-disable-next-line no-await-in-loop
    if (!(await claim(m.id))) continue;
    // eslint-disable-next-line no-await-in-loop
    const text = await transcribeAudio(name, null, { kind: "reading", ticketId: m.ticketId });
    if (!text) { run.failed += 1; continue; }
    // eslint-disable-next-line no-await-in-loop
    await Message.update({ transcript: text } as any, { where: { id: m.id }, silent: true } as any);
    run.transcribed += 1;
    // eslint-disable-next-line no-await-in-loop
    await announce(m.id);
  }
  return run;
};

// one line when something was written down; a cap reached is told once (not every minute)
let lastStop = "";
export const logRun = (run: HumanRun): void => {
  if (run.transcribed || run.failed) logger.info(`Áudios das conversas: ${run.transcribed} transcritos, ${run.failed} sem texto, ${run.skipped} fora do limite${run.stopped ? ` (parou: ${run.stopped})` : ""}`);
  const stop = run.stopped && run.stopped !== "off" ? `${dayBounds().start.toISOString()}:${run.stopped}` : "";
  if (stop && stop !== lastStop) logger.info(`Áudios das conversas: parados pelo limite de gasto (${run.stopped}); voltam quando houver espaço no limite`);
  lastStop = stop || lastStop;
};
