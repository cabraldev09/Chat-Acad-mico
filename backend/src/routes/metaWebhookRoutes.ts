import express, { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";

import Whatsapp from "../models/Whatsapp";
import { getConfig } from "../channels/types";
import { processMetaWebhook } from "../channels/meta";
import { logger } from "../utils/logger";
import { getMetaApp } from "../helpers/MetaApp";

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
  res.sendStatus(200);
  (async () => {
    const connections = await Whatsapp.findAll({ where: { channel: "instagram" } as any });
    for (const entry of req.body?.entry || []) {
      const whatsapp = connections.find(w => {
        const c = getConfig(w);
        return c.mode === "oauth" && String(c.igUserId) === String(entry.id);
      });
      if (!whatsapp) {
        logger.warn(`Meta app webhook: no connection for account ${entry.id}`);
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await processMetaWebhook(whatsapp, { entry: [entry] });
    }
  })().catch(err => logger.error(`Meta app webhook error: ${err}`));
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
    return res.status(200).send(String(req.query["hub.challenge"]));
  }
  return res.sendStatus(403);
});

router.post("/meta/:whatsappId", async (req: Request, res: Response) => {
  const whatsapp = await Whatsapp.findByPk(req.params.whatsappId);
  if (!whatsapp) return res.sendStatus(404);
  const { appSecret } = getConfig(whatsapp);

  if (!appSecret) {
    // unsigned deliveries could be forged by anyone who finds the URL
    logger.warn(`Meta webhook for connection ${whatsapp.id} rejected: App Secret not set`);
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
      return res.sendStatus(401);
    }
  }

  // acknowledge fast; Meta retries on slow responses
  res.sendStatus(200);
  processMetaWebhook(whatsapp, req.body).catch(err =>
    logger.error(`Meta webhook error: ${err}`)
  );
  return undefined;
});

export default router;
