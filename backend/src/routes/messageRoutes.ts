import { Router } from "express";
import multer from "multer";
import isAuth from "../middleware/isAuth";
import { canReadTicket, canWriteTicket, canWriteMessage } from "../middleware/canAccessTicket";
import uploadConfig from "../config/upload";

import * as MessageController from "../controllers/MessageController";

const messageRoutes = Router();

const upload = multer(uploadConfig);

messageRoutes.get("/messages/:ticketId", isAuth, canReadTicket, MessageController.index);

messageRoutes.post(
  "/messages/:ticketId",
  isAuth,
  canWriteTicket,
  upload.array("medias"),
  MessageController.store
);

messageRoutes.delete("/messages/:messageId", isAuth, canWriteMessage, MessageController.remove);

messageRoutes.put("/messages/:messageId/star", isAuth, canWriteMessage, MessageController.star);
messageRoutes.post("/messages/:messageId/react", isAuth, canWriteMessage, MessageController.react);
messageRoutes.post("/messages/:messageId/forward", isAuth, canWriteMessage, MessageController.forward);

export default messageRoutes;
