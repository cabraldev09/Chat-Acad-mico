import express from "express";
import isAuth from "../middleware/isAuth";
import canManageWhatsapp from "../middleware/canManageWhatsapp";

import * as WhatsAppController from "../controllers/WhatsAppController";

const whatsappRoutes = express.Router();

whatsappRoutes.get("/whatsapp/", isAuth, WhatsAppController.index);

// anyone may connect their own QR Code number (the controller limits what they can set)
whatsappRoutes.post("/whatsapp/", isAuth, WhatsAppController.store);

whatsappRoutes.get("/whatsapp/:whatsappId", isAuth, WhatsAppController.show);

whatsappRoutes.put("/whatsapp/:whatsappId", isAuth, canManageWhatsapp, WhatsAppController.update);

whatsappRoutes.delete(
  "/whatsapp/:whatsappId",
  isAuth,
  canManageWhatsapp,
  WhatsAppController.remove
);

export default whatsappRoutes;
