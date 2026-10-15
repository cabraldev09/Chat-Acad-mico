import gracefulShutdown from "http-graceful-shutdown";
import app from "./app";
import { initIO } from "./libs/socket";
import { logger } from "./utils/logger";
import { StartAllWhatsAppsSessions } from "./services/WbotServices/StartAllWhatsAppsSessions";
import { startScheduler } from "./workers/Scheduler";
import { startCampaignRunner } from "./workers/CampaignRunner";
import { startCrmReminders } from "./workers/CrmReminders";
import { startLeadSlaAlert } from "./workers/LeadSlaAlert";
import { startProfilePicSync } from "./workers/ProfilePicSync";
import { startAckReconciler } from "./workers/AckReconciler";
import { startPaymentPoller } from "./workers/PaymentPoller";
import { startOnboardingSla } from "./workers/OnboardingSla";
import { startChatbotReminder } from "./workers/ChatbotReminder";
import { startFlowRunner } from "./workers/FlowRunner";
import { loadAppTz } from "./helpers/AppTime";
import { whenLeader } from "./helpers/SingleInstance";
import { ensureRls } from "./helpers/EnsureRls";

const server = app.listen(process.env.PORT, () => {
  logger.info(`Server started on port: ${process.env.PORT}`);
});

initIO(server);
loadAppTz();
ensureRls();
// Only one instance may own the WhatsApp sessions and the background workers
whenLeader(() => {
  StartAllWhatsAppsSessions();
  startScheduler();
  startCampaignRunner();
  startCrmReminders();
  startLeadSlaAlert();
  startProfilePicSync();
  startAckReconciler();
  startPaymentPoller();
  startOnboardingSla();
  startChatbotReminder();
  startFlowRunner();
  // the polos and goals of the spreadsheet are loaded once, so the goals screen is never empty
  import("./services/GoalServices/SeedPoloGoals").then(({ seedPoloGoals }) => seedPoloGoals()).catch(() => undefined);
  // every contact already in the system becomes a lead too (idempotent)
  import("./services/CrmServices/LeadCore")
    .then(({ backfillLeads }) => backfillLeads())
    .then(r => logger.info(`CRM backfill: ${r.created} new leads`))
    .catch(err => logger.warn(`CRM backfill failed: ${err}`));
});
gracefulShutdown(server);

// A stray exception is logged and survived, but a burst means the process is
// in a bad state: exit so the supervisor (pm2/launchd/docker) restarts it clean.
const recentCrashes: number[] = [];
process.on("uncaughtException", err => {
  logger.error({ info: "Global uncaught exception", err });
  const now = Date.now();
  recentCrashes.push(now);
  while (recentCrashes.length && now - recentCrashes[0] > 60000) {
    recentCrashes.shift();
  }
  if (recentCrashes.length >= 10) {
    logger.fatal("Too many uncaught exceptions in 60s, exiting");
    process.exit(1);
  }
});

process.on("unhandledRejection", err => {
  if (err) logger.error({ info: "Global unhandled rejection", err });
});
