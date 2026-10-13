import express from "express";
import isAuthApi from "../middleware/isAuthApi";
import * as ApiV1 from "../controllers/ApiV1Controller";

const router = express.Router();

router.post("/messages/send", isAuthApi, ApiV1.sendMessage);
router.get("/tickets", isAuthApi, ApiV1.tickets);
router.get("/contacts", isAuthApi, ApiV1.contacts);
router.post("/contacts", isAuthApi, ApiV1.upsertContact);
router.get("/connections", isAuthApi, ApiV1.connections);

export default router;
