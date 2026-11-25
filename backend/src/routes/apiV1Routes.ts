import express from "express";
import isAuthApi from "../middleware/isAuthApi";
import { canReadConnections, canReadContacts, canReadIndicators, canReadLeads, canReadTickets, canSendMessages, canWriteContacts, canWriteLeads } from "../middleware/apiScope";
import * as ApiV1 from "../controllers/ApiV1Controller";

// every route asks for its own scope of the token (docs/API-V1.md)
const router = express.Router();

router.post("/messages/send", isAuthApi, canSendMessages, ApiV1.sendMessage);
router.get("/tickets", isAuthApi, canReadTickets, ApiV1.tickets);
router.get("/contacts", isAuthApi, canReadContacts, ApiV1.contacts);
router.post("/contacts", isAuthApi, canWriteContacts, ApiV1.upsertContact);
router.get("/connections", isAuthApi, canReadConnections, ApiV1.connections);
router.get("/leads", isAuthApi, canReadLeads, ApiV1.leads);
router.post("/leads", isAuthApi, canWriteLeads, ApiV1.createLead);
router.get("/indicadores", isAuthApi, canReadIndicators, ApiV1.indicators);

export default router;
