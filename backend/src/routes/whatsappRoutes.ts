import express from "express";
import isAuth from "../middleware/isAuth";
import canManageWhatsapp from "../middleware/canManageWhatsapp";
import isManager from "../middleware/isManager";
import canConnectOwnQr from "../middleware/canConnectOwnQr";

import * as WhatsAppController from "../controllers/WhatsAppController";
import * as ImportController from "../controllers/ImportPhoneContactsController";

const whatsappRoutes = express.Router();

whatsappRoutes.get("/whatsapp/", isAuth, WhatsAppController.index);
whatsappRoutes.get("/whatsapp-health", isAuth, WhatsAppController.health);

// only the management (admin, coordination) adds connections; a QR Code number may be given to a consultant or tutor, who reads
// the QR Code on their own phone (see whatsappSessionRoutes)
whatsappRoutes.post("/whatsapp/", isAuth, isManager, WhatsAppController.store);

// a consultant, tutor or relationship person connects their own WhatsApp by QR Code (one per person, within the server's capacity)
whatsappRoutes.post("/whatsapp/mine", isAuth, canConnectOwnQr, WhatsAppController.storeMine);

whatsappRoutes.get("/whatsapp/:whatsappId", isAuth, WhatsAppController.show);

// the owner of a QR Code number only chooses which of its groups become conversations; everything else is the management's
whatsappRoutes.put("/whatsapp/:whatsappId", isAuth, canManageWhatsapp, WhatsAppController.update);

whatsappRoutes.delete(
  "/whatsapp/:whatsappId",
  isAuth,
  isManager,
  WhatsAppController.remove
);

// copies the conversations that already exist on the phone, as history
whatsappRoutes.post("/whatsapp/:whatsappId/import-history", isAuth, canManageWhatsapp, ImportController.history);

export default whatsappRoutes;
