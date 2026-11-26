import { logger } from "../utils/logger";
import { getSetting, setSetting } from "../helpers/AppSettings";
import { todayInAppTz } from "../helpers/AppTime";

// Every half hour: the conversations copied from the consultants' phones not read yet go to the queue, once a day the leads that ended
// (enrolled or lost) go too, and the system's AI reads what is waiting (all of it, or with OpenBot only what it left behind; see
// services/ReadingServices/Queue). One round at a time; the daily limit and the spending caps stop it.
let busy = false;

export const readingRound = async (): Promise<void> => {
  if (busy) return;
  busy = true;
  try {
    const { enqueueImported } = await import("../services/ReadingServices/ImportedLeads");
    const { enqueueOutcomes } = await import("../services/ReadingServices/Outcome");
    const { readingSettings, runLocalReadings } = await import("../services/ReadingServices/Queue");
    // the administrator's switch: off, nothing is put in the queue nor read
    if (!(await readingSettings()).enabled) return;
    const added = await enqueueImported();
    const today = todayInAppTz();
    let outcomes = 0;
    if ((await getSetting("readings_outcome_day", "")) !== today) {
      await setSetting("readings_outcome_day", today);
      outcomes = await enqueueOutcomes();
    }
    const run = await runLocalReadings();
    // stopped with no key of AI and conversations waiting: the management hears it once a day (before, it stayed quiet and Recuperação empty)
    if (run.reason === "no_api_key" && (await getSetting("readings_nokey_day", "")) !== today) {
      await setSetting("readings_nokey_day", today);
      const { notify, managerIds } = await import("../services/NotificationServices/Notify");
      await notify(await managerIds(), {
        kind: "reading",
        level: "warning",
        title: "Leitura das conversas parada: falta a chave da IA",
        body: "As conversas copiadas do WhatsApp esperam a leitura. Cadastre a chave em um agente de IA para os leads aparecerem no funil e em Recuperação.",
        link: "/ai-agents",
        dedupeKey: `reading-nokey:${today}`
      });
    }
    if (added || outcomes || run.read || run.failed) {
      logger.info(`Leituras: ${added} conversas copiadas e ${outcomes} resultados na fila; ${run.read} lidas pela IA do sistema, ${run.failed} falhas${run.stoppedByBudget ? ", parou no limite de gasto" : ""}${run.reason ? ` (${run.reason})` : ""}`);
    }
  } catch (err) {
    logger.warn(`Leituras não rodaram: ${(err as Error).message}`);
  } finally {
    busy = false;
  }
};

// right after the copy of a phone: its conversations are put in the queue and (with the system's AI) read at once
export const readAfterCopy = async (whatsappId: number): Promise<void> => {
  try {
    const { readingSettings } = await import("../services/ReadingServices/Queue");
    if (!(await readingSettings()).enabled) return;
    const { enqueueImported } = await import("../services/ReadingServices/ImportedLeads");
    await enqueueImported(whatsappId);
    await readingRound();
  } catch (err) {
    logger.warn(`Leitura depois da cópia: ${(err as Error).message}`);
  }
};

export const startConversationReading = (): void => {
  const every = Number(process.env.READINGS_MS) || 30 * 60000;
  if (process.env.NODE_ENV === "test" && !process.env.READINGS_MS) return;
  setInterval(readingRound, every).unref?.();
};
