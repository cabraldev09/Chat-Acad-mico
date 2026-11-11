import express, { Request, Response } from "express";
import { handleInbound } from "../services/MailServices/Inbound";

// Resend posts here the e-mails that arrive at the receiving domain (event email.received). The signature is checked on the raw body.
const router = express.Router();
router.post("/resend", async (req: Request, res: Response) => {
  const raw = (req as any).rawBody ? Buffer.from((req as any).rawBody).toString("utf8") : "";
  const r = await handleInbound(raw, {
    id: String(req.headers["svix-id"] || ""),
    timestamp: String(req.headers["svix-timestamp"] || ""),
    signature: String(req.headers["svix-signature"] || "")
  });
  return res.status(r.status).json(r.body);
});
export default router;
