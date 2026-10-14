import { Router } from "express";
import isAuth from "../middleware/isAuth";
import canManageWhatsapp from "../middleware/canManageWhatsapp";

import WhatsAppSessionController from "../controllers/WhatsAppSessionController";

const whatsappSessionRoutes = Router();

whatsappSessionRoutes.post(
  "/whatsappsession/:whatsappId",
  isAuth,
  canManageWhatsapp,
  WhatsAppSessionController.store
);

whatsappSessionRoutes.put(
  "/whatsappsession/:whatsappId",
  isAuth,
  canManageWhatsapp,
  WhatsAppSessionController.update
);

whatsappSessionRoutes.delete(
  "/whatsappsession/:whatsappId",
  isAuth,
  canManageWhatsapp,
  WhatsAppSessionController.remove
);

export default whatsappSessionRoutes;
