import express, { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";

import Whatsapp from "../models/Whatsapp";
import { getConfig } from "../channels/types";
import { kickWebhook, storeWebhook } from "../services/ChannelServices/MetaWebhookQueue";
import { logger } from "../utils/logger";
import { getMetaApp } from "../helpers/MetaApp";
import { describeCloudBody, noteWebhook } from "../channels/WebhookLog";

const router = express.Router();

// The Instagram accounts connected by the login all deliver to one webhook, the app's: the connection is found by the account id
// of each entry. The verify token and the signature are the app's own (set once in Conexões > App da Meta).
router.get("/meta", async (req: Request, res: Response) => {
  const app = await getMetaApp();
  if (req.query["hub.mode"] === "subscribe" && app.verifyToken && req.query["hub.verify_token"] === app.verifyToken) {
    return res.status(200).send(String(req.query["hub.challenge"]));
  }
  return res.sendStatus(403);
});

router.post("/meta", async (req: Request, res: Response) => {
  const app = await getMetaApp();
  if (!app.appSecret) return res.sendStatus(403);
  const signature = String(req.headers["x-hub-signature-256"] || "");
  const raw: Buffer | undefined = (req as any).rawBody;
  const expected = `sha256=${createHmac("sha256", app.appSecret).update(raw || Buffer.alloc(0)).digest("hex")}`;
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    logger.warn("Meta app webhook signature mismatch");
    return res.sendStatus(401);
  }
  // stored before the 200: a restart or an error while processing no longer loses what the Meta delivered
  try {
    const row = await storeWebhook(null, (req as any).rawBody, req.body);
    res.sendStatus(200);
    if (row.status === "pending") kickWebhook(row.id);
  } catch (err) {
    // not stored: the Meta tries again on an error answer
    logger.error(`Meta app webhook not stored: ${err}`);
    return res.sendStatus(500);
  }
  return undefined;
});

router.get("/meta/:whatsappId", async (req: Request, res: Response) => {
  const whatsapp = await Whatsapp.findByPk(req.params.whatsappId);
  if (!whatsapp) return res.sendStatus(404);
  const { verifyToken } = getConfig(whatsapp);
  if (
    req.query["hub.mode"] === "subscribe" &&
    verifyToken &&
    req.query["hub.verify_token"] === verifyToken
  ) {
    noteWebhook(whatsapp.id, "verificacao_ok");
    return res.status(200).send(String(req.query["hub.challenge"]));
  }
  noteWebhook(whatsapp.id, "verificacao_recusada", "o Verify Token da Meta é diferente do salvo na conexão");
  return res.sendStatus(403);
});

router.post("/meta/:whatsappId", async (req: Request, res: Response) => {
  const whatsapp = await Whatsapp.findByPk(req.params.whatsappId);
  if (!whatsapp) return res.sendStatus(404);
  const { appSecret } = getConfig(whatsapp);

  if (!appSecret) {
    // unsigned deliveries could be forged by anyone who finds the URL
    logger.warn(`Meta webhook for connection ${whatsapp.id} rejected: App Secret not set`);
    noteWebhook(whatsapp.id, "sem_app_secret", "a conexão não tem App Secret salvo");
    return res.sendStatus(403);
  }

  {
    const signature = String(req.headers["x-hub-signature-256"] || "");
    const raw: Buffer | undefined = (req as any).rawBody;
    const expected = `sha256=${createHmac("sha256", appSecret)
      .update(raw || Buffer.alloc(0))
      .digest("hex")}`;
    const ok =
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!ok) {
      logger.warn(`Meta webhook signature mismatch for connection ${whatsapp.id}`);
      noteWebhook(whatsapp.id, "assinatura_invalida", "o App Secret da conexão não é o do app da Meta");
      return res.sendStatus(401);
    }
  }

  const seen = describeCloudBody(req.body);
  noteWebhook(whatsapp.id, "recebido", seen.text, seen.messages);
  // stored before the 200 (fast: one insert), processed right after and again by the queue if it fails or the server restarts
  try {
    const row = await storeWebhook(whatsapp.id, (req as any).rawBody, req.body);
    res.sendStatus(200);
    if (row.status === "pending") kickWebhook(row.id);
  } catch (err) {
    // not stored: the Meta tries again on an error answer
    logger.error(`Meta webhook not stored for connection ${whatsapp.id}: ${err}`);
    return res.sendStatus(500);
  }
  return undefined;
});

export default router;
