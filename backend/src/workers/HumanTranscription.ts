import { logger } from "../utils/logger";

// Every minute (HUMAN_TRANSCRIBE_MS), a few voice notes of the conversations between people are written down in the background
// (services/AiServices/HumanTranscription). One run at a time; the receiving of messages never waits for it.
let running = false;

const tick = async (): Promise<void> => {
  if (running) return;
  running = true;
  try {
    const { transcribePending, logRun } = await import("../services/AiServices/HumanTranscription");
    logRun(await transcribePending());
  } catch (err) {
    logger.warn(`Transcrição dos áudios das conversas falhou: ${err}`);
  } finally {
    running = false;
  }
};

export const startHumanTranscription = (): void => {
  setInterval(tick, Number(process.env.HUMAN_TRANSCRIBE_MS) || 60000);
};
