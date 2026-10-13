import express from "express";
import * as Payment from "../controllers/PaymentController";

// Efí posts Pix notifications to <webhookUrl>/pix
const router = express.Router();
router.post("/efi/:secret/pix", Payment.efiWebhook);
router.post("/efi/:secret", Payment.efiWebhook);
export default router;
