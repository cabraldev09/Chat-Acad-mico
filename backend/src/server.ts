import { createServer } from "http";
import { startWebhookQueue } from "./services/WebhookServices/DispatchWebhook";
import { startUnreadReconciler } from "./workers/UnreadReconciler";
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

const server = createServer(app);
initIO(server);
const boot = async () => {
  await ensureRls();
  await loadAppTz();
  server.listen(process.env.PORT, () => logger.info(`Server started on port: ${process.env.PORT}`));
// Only one instance may own the WhatsApp sessions and the background workers
whenLeader(() => {
  StartAllWhatsAppsSessions();
  startScheduler();
  startWebhookQueue();
  startCampaignRunner();
  startCrmReminders();
  startLeadSlaAlert();
  startProfilePicSync();
  startAckReconciler();
  startUnreadReconciler();
  startPaymentPoller();
  startOnboardingSla();
  startChatbotReminder();
  startFlowRunner();
  // the polos and goals of the spreadsheet are loaded once, so the goals screen is never empty
  import("./services/GoalServices/SeedPoloGoals").then(({ seedPoloGoals }) => seedPoloGoals()).catch(() => undefined);
  // the commercial matrices that come with the system, read once when the catalog is empty
  import("./analysis/Grades").then(({ importDefaultGradesIfEmpty }) => importDefaultGradesIfEmpty()).catch(() => undefined);
  // every contact already in the system becomes a lead too (idempotent)
  import("./services/CrmServices/LeadCore")
    .then(({ backfillLeads }) => backfillLeads())
    .then(r => logger.info(`CRM backfill: ${r.created} new leads`))
    .catch(err => logger.warn(`CRM backfill failed: ${err}`));
});
};
boot().catch(err => { logger.fatal({ err }, "Startup checks failed"); process.exit(1); });
gracefulShutdown(server);

// Exit after an uncaught failure: continuing could serve partially corrupted state.
process.on("uncaughtException", err => { logger.fatal({ err }, "Uncaught exception"); process.exit(1); });
process.on("unhandledRejection", err => { logger.fatal({ err }, "Unhandled rejection"); process.exit(1); });
