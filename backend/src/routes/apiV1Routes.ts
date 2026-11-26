import express from "express";
import isAuthApi from "../middleware/isAuthApi";
import { canReadConnections, canReadContacts, canReadIndicators, canReadLeads, canReadTickets, canSendMessages, canWriteContacts, canWriteLeads } from "../middleware/apiScope";
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

// every route asks for its own scope of the token (docs/API-V1.md)
const router = express.Router();

router.post("/messages/send", isAuthApi, perToken, canSendMessages, ApiV1.sendMessage);
router.get("/tickets", isAuthApi, perToken, canReadTickets, ApiV1.tickets);
router.get("/contacts", isAuthApi, perToken, canReadContacts, ApiV1.contacts);
router.post("/contacts", isAuthApi, perToken, canWriteContacts, ApiV1.upsertContact);
router.get("/connections", isAuthApi, perToken, canReadConnections, ApiV1.connections);
router.get("/leads", isAuthApi, perToken, canReadLeads, ApiV1.leads);
router.post("/leads", isAuthApi, perToken, canWriteLeads, ApiV1.createLead);
router.get("/indicadores", isAuthApi, perToken, perTokenIndicators, canReadIndicators, ApiV1.indicators);

export default router;
