import * as PhoneAction from "../controllers/PhoneActionController";
import rateLimit from "../middleware/rateLimit";
import express from "express";
import isAuth from "../middleware/isAuth";
import isAdmin from "../middleware/isAdmin";
import { canReadTicket, canWriteTicket, canSendTicket } from "../middleware/canAccessTicket";

import * as CopilotController from "../controllers/CopilotController";
import * as TicketController from "../controllers/TicketController";

const ticketRoutes = express.Router();
ticketRoutes.get("/copilot/settings", isAuth, isAdmin, CopilotController.settings);
ticketRoutes.put("/copilot/settings", isAuth, isAdmin, CopilotController.updateSettings);
ticketRoutes.get("/copilot/usage", isAuth, isAdmin, CopilotController.usage);

const phoneLimiter = rateLimit({ windowMs: 60000, max: 20, key: req => `phone:${req.user.id}` });
ticketRoutes.get("/tickets/:ticketId/phone", isAuth, canReadTicket, phoneLimiter, PhoneAction.show);
ticketRoutes.post("/tickets/:ticketId/phone", isAuth, canSendTicket, phoneLimiter, PhoneAction.open);

// the chip counters of the conversations screen, in one request (same visibility rules as the list)
ticketRoutes.get("/tickets/counts", isAuth, TicketController.counts);
ticketRoutes.get("/tickets", isAuth, TicketController.index);

ticketRoutes.put("/tickets/read-all", isAuth, TicketController.readAll);

ticketRoutes.get("/tickets/:ticketId", isAuth, canReadTicket, TicketController.show);

ticketRoutes.get("/tickets/:ticketId/welcome", isAuth, canReadTicket, TicketController.welcome);
// what a transfer to the tutoring will do (call it on its number, or move this conversation to the tutor's QR Code), shown before confirming
ticketRoutes.get("/tickets/:ticketId/transfer-preview", isAuth, canReadTicket, TicketController.transferPreview);

ticketRoutes.get("/tickets/:ticketId/automation", isAuth, canReadTicket, TicketController.automation);

ticketRoutes.get("/tickets/:ticketId/ai-summary", isAuth, canReadTicket, TicketController.aiSummary);
ticketRoutes.get("/tickets/:ticketId/copilot", isAuth, canReadTicket, CopilotController.show);

ticketRoutes.put("/tickets/:ticketId/copilot/progress", isAuth, canWriteTicket, CopilotController.progress);

ticketRoutes.post("/tickets/:ticketId/suggest-reply", isAuth, canSendTicket, CopilotController.suggest);
ticketRoutes.post("/tickets/:ticketId/handoff-team", isAuth, canSendTicket, TicketController.handoffTeam);
ticketRoutes.get("/tickets/:ticketId/team-handoff", isAuth, canReadTicket, TicketController.teamHandoff);
ticketRoutes.post("/tickets/:ticketId/copilot/brief", isAuth, canReadTicket, CopilotController.brief);
ticketRoutes.get("/tickets/:ticketId/copilot/brief", isAuth, canReadTicket, CopilotController.lastBrief);
ticketRoutes.put("/tickets/:ticketId/copilot/requests/:requestId/feedback", isAuth, canReadTicket, CopilotController.feedback);
ticketRoutes.put("/tickets/:ticketId/copilot/requests/:requestId/take", isAuth, canSendTicket, CopilotController.take);

ticketRoutes.get("/tickets/:ticketId/group", isAuth, canReadTicket, TicketController.groupInfo);

ticketRoutes.get(
  "/tickets/:ticketId/events",
  isAuth,
  canReadTicket,
  TicketController.events
);

ticketRoutes.post("/tickets", isAuth, TicketController.store);

ticketRoutes.put("/tickets/:ticketId/pin", isAuth, canReadTicket, TicketController.pin);
ticketRoutes.post("/tickets/:ticketId/claim", isAuth, canWriteTicket, TicketController.claim);
ticketRoutes.post("/tickets/:ticketId/take", isAuth, canReadTicket, TicketController.take);
ticketRoutes.post("/tickets/:ticketId/ai", isAuth, canWriteTicket, TicketController.ai);
ticketRoutes.post("/tickets/:ticketId/reply-dismiss", isAuth, canWriteTicket, TicketController.dismissReply);
ticketRoutes.put("/tickets/:ticketId/archive", isAuth, canWriteTicket, TicketController.archive);
ticketRoutes.put("/tickets/:ticketId/unread", isAuth, canWriteTicket, TicketController.markUnread);
ticketRoutes.post("/tickets/:ticketId/typing", isAuth, canWriteTicket, TicketController.typing);

ticketRoutes.put("/tickets/:ticketId", isAuth, canWriteTicket, TicketController.update);

ticketRoutes.delete("/tickets/:ticketId", isAuth, isAdmin, canWriteTicket, TicketController.remove);

export default ticketRoutes;
