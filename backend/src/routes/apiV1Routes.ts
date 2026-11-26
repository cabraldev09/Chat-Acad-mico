import express from "express";
import isAuthApi from "../middleware/isAuthApi";
import { canReadConnections, canReadContacts, canReadIndicators, canReadLeads, canReadTickets, canSendMessages, canWorkReadings, canWriteInsights, canWriteContacts, canWriteLeads } from "../middleware/apiScope";
import * as ApiV1 from "../controllers/ApiV1Controller";
import rateLimit from "../middleware/rateLimit";

// requests per token (after the token is known): a leaked or looping integration cannot take the server. 429 with Retry-After.
const tokenKey = (req: express.Request): string => {
  const caller = (req as any).apiToken;
  return caller && caller.id ? `token:${caller.id}` : "legacy";
};
export const perToken = rateLimit({ windowMs: 60000, max: Number(process.env.API_V1_RATE_MAX || 120), key: req => `api-v1:${tokenKey(req)}` });
// the consolidated indicators cost more: a lower limit of their own
const perTokenIndicators = rateLimit({ windowMs: 60000, max: Number(process.env.API_V1_INDICATORS_RATE_MAX || 20), key: req => `api-v1-ind:${tokenKey(req)}` });

// the recommendations of the OpenBot for the management: a few per hour (the panel holds at most 20 in force)
const perTokenInsights = rateLimit({ windowMs: 3600000, max: Number(process.env.API_V1_INSIGHTS_RATE_MAX || 30), key: req => `api-v1-insights:${tokenKey(req)}` });

// every route asks for its own scope of the token (docs/API-V1.md)
const router = express.Router();

router.post("/messages/send", isAuthApi, perToken, canSendMessages, ApiV1.sendMessage);
router.post("/insights", isAuthApi, perToken, perTokenInsights, canWriteInsights, ApiV1.createInsight);
router.get("/tickets", isAuthApi, perToken, canReadTickets, ApiV1.tickets);
router.get("/contacts", isAuthApi, perToken, canReadContacts, ApiV1.contacts);
router.post("/contacts", isAuthApi, perToken, canWriteContacts, ApiV1.upsertContact);
router.get("/connections", isAuthApi, perToken, canReadConnections, ApiV1.connections);
router.get("/leads", isAuthApi, perToken, canReadLeads, ApiV1.leads);
router.post("/leads", isAuthApi, perToken, canWriteLeads, ApiV1.createLead);
// the queue of readings: an outside worker (OpenBot) takes masked conversations and gives back the codes (docs/API-V1.md)
router.get("/leituras", isAuthApi, perToken, canWorkReadings, ApiV1.takeReadings);
router.post("/leituras/:id", isAuthApi, perToken, canWorkReadings, ApiV1.answerReading);
router.get("/indicadores", isAuthApi, perToken, perTokenIndicators, canReadIndicators, ApiV1.indicators);

export default router;
