import { spawn } from "child_process";
import fs from "fs";
import path from "path";

import { logger } from "../utils/logger";

export interface AudioFile {
  path: string;
  filename: string;
  mimetype: string;
}

const run = (args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    ffmpeg.stderr.on("data", chunk => {
      err = (err + chunk.toString()).slice(-600);
    });
    const timer = setTimeout(() => {
      ffmpeg.kill("SIGKILL");
      reject(new Error("ffmpeg timeout"));
    }, 60000);
    ffmpeg.on("error", e => {
      clearTimeout(timer);
      reject(e);
    });
    ffmpeg.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}: ${err.trim()}`));
    });
  });

export const isAudio = (mimetype: string): boolean => mimetype.toLowerCase().startsWith("audio/");

const isOggOpus = (file: AudioFile): boolean =>
  /ogg/i.test(file.mimetype) && /\.(ogg|opus)$/i.test(file.filename);

// WhatsApp voice notes are Ogg/Opus. Browsers record WebM/Opus (Chrome) or MP4/AAC (Safari), and the old
// recorder produced MP3, so whatever arrives is converted before sending. Returns null when it cannot be done.
export const toVoiceNote = async (file: AudioFile): Promise<AudioFile | null> => {
  if (isOggOpus(file)) return file;
  const out = path.join(path.dirname(file.path), `${path.parse(file.filename).name}.voice.ogg`);
  try {
    await run([
      "-y", "-i", file.path, "-vn", "-map_metadata", "-1",
      "-c:a", "libopus", "-b:a", "32k", "-ar", "48000", "-ac", "1", "-application", "voip",
      "-f", "ogg", out
    ]);
    return { path: out, filename: path.basename(out), mimetype: "audio/ogg; codecs=opus" };
  } catch (err) {
    logger.error({ info: "Could not convert the audio to a voice note", err: String(err) });
    fs.rmSync(out, { force: true });
    return null;
  }
};

// Messenger, Instagram and the like accept MP3 everywhere.
export const toMp3 = async (file: AudioFile): Promise<AudioFile | null> => {
  if (/mpeg|mp3/i.test(file.mimetype)) return file;
  const out = path.join(path.dirname(file.path), `${path.parse(file.filename).name}.converted.mp3`);
  try {
    await run(["-y", "-i", file.path, "-vn", "-map_metadata", "-1", "-c:a", "libmp3lame", "-b:a", "96k", out]);
    return { path: out, filename: path.basename(out), mimetype: "audio/mpeg" };
  } catch (err) {
    logger.error({ info: "Could not convert the audio to mp3", err: String(err) });
    fs.rmSync(out, { force: true });
    return null;
  }
};
