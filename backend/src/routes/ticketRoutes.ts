import * as PhoneAction from "../controllers/PhoneActionController";
import rateLimit from "../middleware/rateLimit";
import express from "express";
import isAuth from "../middleware/isAuth";
import isAdmin from "../middleware/isAdmin";
import { canReadTicket, canWriteTicket, canSendTicket } from "../middleware/canAccessTicket";

import * as TicketController from "../controllers/TicketController";

const ticketRoutes = express.Router();

const phoneLimiter = rateLimit({ windowMs: 60000, max: 20, key: req => `phone:${req.user.id}` });
ticketRoutes.get("/tickets/:ticketId/phone", isAuth, canReadTicket, phoneLimiter, PhoneAction.show);
ticketRoutes.post("/tickets/:ticketId/phone", isAuth, canSendTicket, phoneLimiter, PhoneAction.open);

ticketRoutes.get("/tickets", isAuth, TicketController.index);

ticketRoutes.get("/tickets/:ticketId", isAuth, canReadTicket, TicketController.show);

ticketRoutes.get("/tickets/:ticketId/welcome", isAuth, canReadTicket, TicketController.welcome);

ticketRoutes.get("/tickets/:ticketId/group", isAuth, canReadTicket, TicketController.groupInfo);

ticketRoutes.get(
  "/tickets/:ticketId/events",
  isAuth,
  canReadTicket,
  TicketController.events
);

ticketRoutes.post("/tickets", isAuth, TicketController.store);

ticketRoutes.put("/tickets/:ticketId/pin", isAuth, canReadTicket, TicketController.pin);
ticketRoutes.post("/tickets/:ticketId/ai", isAuth, canWriteTicket, TicketController.ai);
ticketRoutes.put("/tickets/:ticketId/archive", isAuth, canWriteTicket, TicketController.archive);
ticketRoutes.put("/tickets/:ticketId/unread", isAuth, canWriteTicket, TicketController.markUnread);
ticketRoutes.post("/tickets/:ticketId/typing", isAuth, canWriteTicket, TicketController.typing);

ticketRoutes.put("/tickets/:ticketId", isAuth, canWriteTicket, TicketController.update);

ticketRoutes.delete("/tickets/:ticketId", isAuth, isAdmin, TicketController.remove);

export default ticketRoutes;
