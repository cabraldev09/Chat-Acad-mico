import gracefulShutdown from "http-graceful-shutdown";
import app from "./app";
import { initIO } from "./libs/socket";
import { logger } from "./utils/logger";
import { StartAllWhatsAppsSessions } from "./services/WbotServices/StartAllWhatsAppsSessions";
import { startScheduler } from "./workers/Scheduler";
import { startCampaignRunner } from "./workers/CampaignRunner";
import { startCrmReminders } from "./workers/CrmReminders";

const server = app.listen(process.env.PORT, () => {
  logger.info(`Server started on port: ${process.env.PORT}`);
});

initIO(server);
StartAllWhatsAppsSessions();
startScheduler();
startCampaignRunner();
startCrmReminders();
// every contact already in the system becomes a lead too (idempotent)
import("./services/CrmServices/LeadCore")
  .then(({ backfillLeads }) => backfillLeads())
  .then(r => logger.info(`CRM backfill: ${r.created} new leads`))
  .catch(err => logger.warn(`CRM backfill failed: ${err}`));
gracefulShutdown(server);

process.on("uncaughtException", err => {
  logger.error({ info: "Global uncaught exception", err });
});

process.on("unhandledRejection", err => {
  if (err) logger.error({ info: "Global unhandled rejection", err });
});
