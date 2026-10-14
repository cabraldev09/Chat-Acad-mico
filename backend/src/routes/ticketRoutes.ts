import express from "express";
import isAuth from "../middleware/isAuth";
import isAdmin from "../middleware/isAdmin";
import { canReadTicket, canWriteTicket } from "../middleware/canAccessTicket";

import * as TicketController from "../controllers/TicketController";

const ticketRoutes = express.Router();

ticketRoutes.get("/tickets", isAuth, TicketController.index);

ticketRoutes.get("/tickets/:ticketId", isAuth, canReadTicket, TicketController.show);

ticketRoutes.get("/tickets/:ticketId/group", isAuth, canReadTicket, TicketController.groupInfo);

ticketRoutes.get(
  "/tickets/:ticketId/events",
  isAuth,
  canReadTicket,
  TicketController.events
);

ticketRoutes.post("/tickets", isAuth, TicketController.store);

ticketRoutes.put("/tickets/:ticketId/pin", isAuth, canReadTicket, TicketController.pin);
ticketRoutes.put("/tickets/:ticketId/archive", isAuth, canWriteTicket, TicketController.archive);
ticketRoutes.put("/tickets/:ticketId/unread", isAuth, canWriteTicket, TicketController.markUnread);
ticketRoutes.post("/tickets/:ticketId/typing", isAuth, canWriteTicket, TicketController.typing);

ticketRoutes.put("/tickets/:ticketId", isAuth, canWriteTicket, TicketController.update);

ticketRoutes.delete("/tickets/:ticketId", isAuth, isAdmin, TicketController.remove);

export default ticketRoutes;
