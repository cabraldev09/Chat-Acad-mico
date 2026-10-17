import express from "express";
import isAuth from "../middleware/isAuth";
import isAdmin from "../middleware/isAdmin";

import * as ContactController from "../controllers/ContactController";
import * as ImportPhoneContactsController from "../controllers/ImportPhoneContactsController";

const contactRoutes = express.Router();

contactRoutes.post(
  "/contacts/import",
  isAuth,
  ImportPhoneContactsController.store
);

contactRoutes.get("/contacts", isAuth, ContactController.index);

// before "/contacts/:contactId", or "export.csv" would be taken for an id
contactRoutes.get("/contacts/export.csv", isAuth, ContactController.exportCsv);

contactRoutes.get("/contacts/:contactId", isAuth, ContactController.show);

contactRoutes.post("/contacts", isAuth, ContactController.store);

contactRoutes.post("/contact", isAuth, ContactController.getContact);

contactRoutes.put("/contacts/:contactId", isAuth, ContactController.update);

contactRoutes.put("/contacts/:contactId/no-reply", isAuth, ContactController.setNoReply);
contactRoutes.put("/contacts/:contactId/staff", isAuth, ContactController.setStaff);
contactRoutes.put("/contacts/:contactId/relation", isAuth, ContactController.setRelation);
contactRoutes.put("/contacts/:contactId/community", isAuth, ContactController.setCommunity);

contactRoutes.delete("/contacts/:contactId", isAuth, isAdmin, ContactController.remove);

export default contactRoutes;
