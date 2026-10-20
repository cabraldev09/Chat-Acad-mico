import express, { Request, Response } from "express";
import multer from "multer";
import { v4 as uuid } from "uuid";
import { fn, col, Op } from "sequelize";

import uploadConfig from "../config/upload";
import Whatsapp from "../models/Whatsapp";
import Message from "../models/Message";
import Ticket from "../models/Ticket";
import Contact from "../models/Contact";
import { getConfig } from "../channels/types";
import { WEBCHAT_PREFIX } from "../channels/webchat";
import widgetSource from "../channels/webchatWidget";
import { getPublicUrl } from "../helpers/PublicUrl";
import HandleChannelMessage from "../services/InboundServices/HandleChannelMessage";
import fs from "fs";
import { getIO } from "../libs/socket";
import { isAgentTyping } from "../services/ChannelServices/TypingState";
import { makeThrottle } from "../helpers/RateWindow";
import { remember } from "../helpers/TtlCache";

// a visitor of the site is anonymous: only what a person sends in a conversation (pictures, sounds, PDF, office files, text), a few files, never a page or a script
const VISITOR_FILES = /^(image\/(jpeg|png|gif|webp)|audio\/(ogg|mpeg|mp4|aac|wav|webm)|video\/(mp4|webm|quicktime)|application\/(pdf|msword|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.[a-z.]+|zip)|text\/(plain|csv))$/i;
const upload = multer({
  ...uploadConfig,
  limits: { fileSize: 15 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, cb) => cb(null, VISITOR_FILES.test(String(file.mimetype || "").split(";")[0].trim()))
});
const router = express.Router();

// per-visitor throttle (30 messages / minute) and, before anything is read from a stranger, per IP (60 requests / minute)
const throttled = makeThrottle(30, 60000);
const ipThrottled = makeThrottle(60, 60000);

// the list of web chats changes rarely and every poll of every widget asks for it: a few seconds in memory
const findByToken = async (token: string): Promise<Whatsapp | null> => {
  const all = await remember("webchat:connections", 15000, () => Whatsapp.findAll({ where: { channel: "webchat" } }));
  return all.find(w => getConfig(w).token === token) || null;
};

const VISITOR = /^[a-zA-Z0-9_-]{8,64}$/;
const clean = (s: string) => s.replace(/‎/g, "");

router.get("/widget.js", (_req: Request, res: Response) => {
  res.type("application/javascript").send(widgetSource);
});

router.get("/:token/config", async (req: Request, res: Response) => {
  const whatsapp = await findByToken(req.params.token);
  if (!whatsapp) return res.status(404).json({ error: "not found" });
  const c = getConfig(whatsapp);
  return res.json({ title: c.title, color: c.color, welcome: c.welcome });
});

// a file is written to disk before the form is read, so the token and the IP are checked BEFORE the upload; and every early answer after
// it removes the file (a stranger cannot fill the disk with requests that are then refused)
const drop = (file?: Express.Multer.File): void => {
  if (file) fs.unlink(file.path, () => undefined);
};

router.post(
  "/:token/messages",
  async (req: Request, res: Response, next) => {
    if (!(await findByToken(req.params.token))) return res.status(404).json({ error: "not found" });
    if (ipThrottled(`ip:${req.ip}`)) return res.status(429).json({ error: "slow down" });
    return next();
  },
  upload.single("file"),
  async (req: Request, res: Response) => {
    const file = req.file;
    const whatsapp = await findByToken(req.params.token);
    if (!whatsapp) {
      drop(file);
      return res.status(404).json({ error: "not found" });
    }
    const { visitorId, body, name } = req.body;
    if (!VISITOR.test(visitorId || "")) {
      drop(file);
      return res.status(400).json({ error: "visitorId" });
    }
    if (throttled(`${req.ip}:${visitorId}`)) {
      drop(file);
      return res.status(429).json({ error: "slow down" });
    }

    const text = String(body || "").slice(0, 4000);
    if (!text && !file) return res.status(400).json({ error: "empty" });

    let media;
    if (file) {
      media = {
        filename: file.originalname,
        mimetype: file.mimetype,
        data: fs.readFileSync(file.path)
      };
      fs.unlinkSync(file.path);
    }

    const result = await HandleChannelMessage({
      whatsapp,
      contactNumber: `${WEBCHAT_PREFIX}${visitorId}`,
      contactName: name || `Visitante ${visitorId.slice(-4)}`,
      messageId: `web-in-${uuid()}`,
      body: text,
      media
    });
    return res.status(result ? 201 : 500).json({ ok: !!result });
  }
);

router.get("/:token/messages", async (req: Request, res: Response) => {
  const whatsapp = await findByToken(req.params.token);
  if (!whatsapp) return res.status(404).json({ error: "not found" });
  const visitorId = String(req.query.visitorId || "");
  if (!VISITOR.test(visitorId)) return res.status(400).json({ error: "visitorId" });

  const contact = await Contact.findOne({ where: { number: `${WEBCHAT_PREFIX}${visitorId}` } });
  if (!contact) return res.json({ messages: [], agentTyping: false });

  const where: any = { isDeleted: false };
  if (req.query.after) where.createdAt = { [Op.gt]: new Date(String(req.query.after)) };

  const messages = await Message.findAll({
    where,
    include: [
      {
        model: Ticket,
        as: "ticket",
        attributes: [],
        required: true,
        where: { contactId: contact.id, whatsappId: whatsapp.id }
      }
    ],
    order: [["createdAt", "ASC"]],
    limit: 100
  });

  return res.json({
    agentTyping: isAgentTyping(contact.number),
    messages: messages.map(m => ({
      id: m.id,
      body: clean(m.body || ""),
      fromMe: m.fromMe,
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType,
      createdAt: m.createdAt.toISOString()
    }))
  });
});

// the visitor is typing: shown to the agent as "digitando…" on the open conversation
const typingHits = new Map<string, number>();
router.post("/:token/typing", async (req: Request, res: Response) => {
  const whatsapp = await findByToken(req.params.token);
  if (!whatsapp) return res.status(404).json({ error: "not found" });
  const visitorId = String(req.body?.visitorId || "");
  if (!VISITOR.test(visitorId)) return res.status(400).json({ error: "visitorId" });
  const key = `${req.ip}:${visitorId}`;
  if (Date.now() - (typingHits.get(key) || 0) < 2000) return res.json({ ok: true });
  typingHits.delete(key);
  typingHits.set(key, Date.now());
  // oldest first (insertion order): never wipe everybody's throttle at once
  if (typingHits.size > 5000) for (const k of [...typingHits.keys()].slice(0, 500)) typingHits.delete(k);
  const contact = await Contact.findOne({ where: { number: `${WEBCHAT_PREFIX}${visitorId}` } });
  if (contact) {
    const ticket = await Ticket.findOne({
      where: { contactId: contact.id, whatsappId: whatsapp.id, status: { [Op.ne]: "closed" } },
      order: [["id", "DESC"]],
      attributes: ["id"]
    });
    if (ticket) getIO().to(String(ticket.id)).emit("typing", { ticketId: ticket.id, from: "contact" });
  }
  return res.json({ ok: true });
});

router.get("/:token/demo", async (req: Request, res: Response) => {
  const whatsapp = await findByToken(req.params.token);
  if (!whatsapp) return res.status(404).send("not found");
  const url = getPublicUrl();
  return res.type("html").send(`<!doctype html><meta charset="utf-8"><title>Demo do chat web</title>
<body style="font-family:system-ui;padding:40px"><h2>Página de teste do chat web</h2>
<p>O widget aparece no canto inferior direito.</p>
<script src="${url}/webchat/widget.js?token=${req.params.token}" async></script></body>`);
});

export default router;
