import { Router } from "express";
import multer from "multer";
import isAuth from "../middleware/isAuth";
import { canReadTicket, canWriteTicket, canSendTicket, canWriteMessage } from "../middleware/canAccessTicket";
import uploadConfig from "../config/upload";

import * as MessageController from "../controllers/MessageController";

const messageRoutes = Router();

const upload = multer(uploadConfig);

messageRoutes.get("/messages/:ticketId", isAuth, canReadTicket, MessageController.index);

messageRoutes.post("/messages/:ticketId/contact", isAuth, canSendTicket, MessageController.sendContact);
messageRoutes.post("/messages/:ticketId/poll", isAuth, canSendTicket, MessageController.sendPoll);
messageRoutes.get("/messages/:ticketId/list", isAuth, canReadTicket, MessageController.listByKind);

messageRoutes.post(
  "/messages/:ticketId",
  isAuth,
  canSendTicket,
  upload.array("medias"),
  MessageController.store
);

messageRoutes.delete("/messages/:messageId", isAuth, canWriteMessage, MessageController.remove);

messageRoutes.put("/messages/:messageId", isAuth, canWriteMessage, MessageController.edit);
messageRoutes.put("/messages/:messageId/star", isAuth, canWriteMessage, MessageController.star);
messageRoutes.post("/messages/:messageId/media", isAuth, canWriteMessage, MessageController.loadMedia);
messageRoutes.post("/messages/:messageId/react", isAuth, canWriteMessage, MessageController.react);
messageRoutes.post("/messages/:messageId/forward", isAuth, canWriteMessage, MessageController.forward);

export default messageRoutes;
