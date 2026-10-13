import express from "express";
import multer from "multer";

import isAuth from "../middleware/isAuth";
import isAdmin from "../middleware/isAdmin";
import uploadConfig from "../config/upload";

import * as Tag from "../controllers/TagController";
import * as Webhook from "../controllers/WebhookController";
import * as ApiToken from "../controllers/ApiTokenController";
import * as Ai from "../controllers/AiAgentController";
import * as Chatbot from "../controllers/ChatbotController";
import * as Schedule from "../controllers/ScheduleController";
import * as Campaign from "../controllers/CampaignController";
import * as Stats from "../controllers/StatsController";
import * as Channel from "../controllers/ChannelController";

const upload = multer({ ...uploadConfig, limits: { fileSize: 30 * 1024 * 1024 } });
const r = express.Router();

// generic upload used by campaigns / schedules to attach media
r.post("/uploads", isAuth, upload.single("file"), (req, res) =>
  res.json({
    filename: req.file?.filename,
    originalname: req.file?.originalname,
    mimetype: req.file?.mimetype
  })
);

// tags
r.get("/tags", isAuth, Tag.index);
r.post("/tags", isAuth, isAdmin, Tag.store);
r.put("/tags/:id", isAuth, isAdmin, Tag.update);
r.delete("/tags/:id", isAuth, isAdmin, Tag.remove);
r.put("/tickets/:ticketId/tags", isAuth, Tag.setTicketTags);
r.get("/contacts/:contactId/tags", isAuth, Tag.contactTags);
r.put("/contacts/:contactId/tags", isAuth, Tag.setContactTags);

// webhooks / api tokens (admin)
r.get("/webhooks-config/events", isAuth, isAdmin, Webhook.events);
r.get("/webhooks-config", isAuth, isAdmin, Webhook.index);
r.post("/webhooks-config", isAuth, isAdmin, Webhook.store);
r.put("/webhooks-config/:id", isAuth, isAdmin, Webhook.update);
r.delete("/webhooks-config/:id", isAuth, isAdmin, Webhook.remove);
r.post("/webhooks-config/:id/test", isAuth, isAdmin, Webhook.test);
r.get("/api-tokens", isAuth, isAdmin, ApiToken.index);
r.post("/api-tokens", isAuth, isAdmin, ApiToken.store);
r.delete("/api-tokens/:id", isAuth, isAdmin, ApiToken.remove);

// AI agents
r.get("/ai-agents", isAuth, isAdmin, Ai.index);
r.post("/ai-agents", isAuth, isAdmin, Ai.store);
r.put("/ai-agents/:id", isAuth, isAdmin, Ai.update);
r.delete("/ai-agents/:id", isAuth, isAdmin, Ai.remove);
r.get("/ai-settings", isAuth, isAdmin, Ai.getKeys);
r.put("/ai-settings", isAuth, isAdmin, Ai.setKeys);

// chatbot flow
r.get("/chatbot-nodes", isAuth, isAdmin, Chatbot.index);
r.post("/chatbot-nodes", isAuth, isAdmin, Chatbot.store);
r.put("/chatbot-nodes/:id", isAuth, isAdmin, Chatbot.update);
r.delete("/chatbot-nodes/:id", isAuth, isAdmin, Chatbot.remove);

// scheduled messages
r.get("/schedules", isAuth, Schedule.index);
r.post("/schedules", isAuth, Schedule.store);
r.put("/schedules/:id", isAuth, Schedule.update);
r.post("/schedules/:id/cancel", isAuth, Schedule.cancel);
r.delete("/schedules/:id", isAuth, Schedule.remove);

// campaigns + contact lists
r.get("/campaigns", isAuth, Campaign.index);
r.post("/campaigns", isAuth, Campaign.store);
r.get("/campaigns/:id", isAuth, Campaign.show);
r.put("/campaigns/:id", isAuth, Campaign.update);
r.delete("/campaigns/:id", isAuth, Campaign.remove);
r.get("/campaigns/:id/report", isAuth, Campaign.report);
r.post("/campaigns/:id/start", isAuth, Campaign.start);
r.post("/campaigns/:id/pause", isAuth, Campaign.pause);
r.post("/campaigns/:id/cancel", isAuth, Campaign.cancel);
r.get("/contact-lists", isAuth, Campaign.lists.index);
r.post("/contact-lists", isAuth, Campaign.lists.store);
r.put("/contact-lists/:id", isAuth, Campaign.lists.update);
r.delete("/contact-lists/:id", isAuth, Campaign.lists.remove);
r.get("/contact-lists/:id/items", isAuth, Campaign.listItems);
r.post("/contact-lists/:id/import", isAuth, Campaign.importItems);
r.delete("/contact-lists/:id/items/:itemId", isAuth, Campaign.removeItem);

// stats & live monitor
r.get("/stats/overview", isAuth, Stats.overview);
r.get("/stats/live", isAuth, isAdmin, Stats.live);

// channels
r.get("/channels", isAuth, Channel.index);
r.get("/channels/:whatsappId/info", isAuth, isAdmin, Channel.info);

export default r;
