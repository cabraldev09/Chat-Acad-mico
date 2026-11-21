import { getSetting, setSetting } from "../helpers/AppSettings";
import { getAppTz } from "../helpers/AppTime";
import { logger } from "../utils/logger";

// Once a day, after the working hours of the company (setting consultant_review_hour, 19 by default), the AI reads the conversations the
// consultants had that day (services/AnalyticsServices/ConsultantReview). Off with consultant_review_enabled = "false". It only runs when an
// active OpenAI agent with a key exists, and the daily spending caps apply: what is left when a cap is reached is not read.
export const runConsultantReview = async (day: string) => {
  const { configOf } = await import("../services/CopilotServices/Settings");
  const { reviewDay } = await import("../services/AnalyticsServices/ConsultantReview");
  const steps = (await configOf()).steps.map((s: any) => ({ key: s.key, label: s.label }));
  return reviewDay(day, steps);
};

const tick = async (): Promise<void> => {
  try {
    if ((await getSetting("consultant_review_enabled", "true")) === "false") return;
    const hour = Math.min(23, Math.max(0, Number(await getSetting("consultant_review_hour", "19")) || 19));
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: getAppTz(), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const part = (t: string) => (parts.find(p => p.type === t) || { value: "" }).value;
    const today = `${part("year")}-${part("month")}-${part("day")}`;
    // once a day; the date is saved before the run, so a restart in the middle (a deploy) does not read and pay twice
    if (Number(part("hour")) < hour || (await getSetting("consultant_review_last", "")) === today) return;
    await setSetting("consultant_review_last", today);
    const run = await runConsultantReview(today);
    logger.info(`Revisão diária das conversas (${today}): ${run.reviewed} lidas, ${run.skipped} curtas demais, ${run.failed} com erro${run.stoppedByBudget ? ", parou no limite de gasto" : ""}${run.reason ? ` (${run.reason})` : ""}`);
  } catch (err) {
    logger.warn(`Revisão diária das conversas falhou: ${err}`);
  }
};

export const startConsultantReview = (): void => {
  setInterval(tick, Number(process.env.CONSULTANT_REVIEW_MS) || 30 * 60000);
};
