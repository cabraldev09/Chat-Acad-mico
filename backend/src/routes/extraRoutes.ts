import express from "express";
import multer from "multer";

import isAuth from "../middleware/isAuth";
import canManageWhatsapp from "../middleware/canManageWhatsapp";
import isAdmin from "../middleware/isAdmin";
import { canWriteTicket } from "../middleware/canAccessTicket";
import { canAccessLead, canAccessProposal, canAccessPayment } from "../middleware/scope";
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
import * as Lead from "../controllers/LeadController";
import * as Proposal from "../controllers/ProposalController";
import * as Payment from "../controllers/PaymentController";
import * as PoloCtl from "../controllers/PoloController";

const upload = multer({ ...uploadConfig, limits: { fileSize: 30 * 1024 * 1024 } });
const certUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });
const kbUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
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
r.put("/tickets/:ticketId/tags", isAuth, canWriteTicket, Tag.setTicketTags);
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
r.get("/ai-defaults", isAuth, isAdmin, Ai.defaults);
r.get("/ai-agents/:id/kb", isAuth, isAdmin, Ai.kbList);
r.post("/ai-agents/:id/kb", isAuth, isAdmin, Ai.kbAdd);
r.post("/ai-agents/:id/kb/upload", isAuth, isAdmin, kbUpload.single("file"), Ai.kbUpload);
r.post("/ai-agents/:id/kb/url", isAuth, isAdmin, Ai.kbFromUrl);
r.get("/ai-agents/:id/kb/:docId", isAuth, isAdmin, Ai.kbShow);
r.put("/ai-agents/:id/kb/:docId", isAuth, isAdmin, Ai.kbUpdate);
r.delete("/ai-agents/:id/kb/:docId", isAuth, isAdmin, Ai.kbRemove);
r.post("/ai-agents/:id/test", isAuth, isAdmin, Ai.test);
r.post("/ai-agents/:id/kb-search", isAuth, isAdmin, Ai.kbSearch);
r.get("/ai-agents/:id/learnings", isAuth, isAdmin, Ai.learningList);
r.post("/ai-agents/:id/learnings", isAuth, isAdmin, Ai.learningTeach);
r.get("/ai-learnings/pending", isAuth, isAdmin, Ai.learningPending);
r.put("/ai-learnings/:id", isAuth, isAdmin, Ai.learningUpdate);
r.post("/ai-learnings/:id/approve", isAuth, isAdmin, Ai.learningApprove);
r.post("/ai-learnings/:id/discard", isAuth, isAdmin, Ai.learningDiscard);
r.get("/ai-agents/:id/usage", isAuth, isAdmin, Ai.usage);
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
r.post("/contact-lists/from-leads", isAuth, Campaign.listFromLeads);
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
r.get("/channels/:whatsappId/safety", isAuth, Channel.safety);
r.get("/channels/:whatsappId/groups", isAuth, canManageWhatsapp, Channel.groups);

// polos (branches) and the team of each one
r.get("/polos", isAuth, PoloCtl.index);
r.get("/polos/:id/tutors", isAuth, PoloCtl.tutors);
r.post("/polos", isAuth, isAdmin, PoloCtl.store);
r.post("/polos/import", isAuth, isAdmin, PoloCtl.importPolos);
r.put("/polos/:id", isAuth, isAdmin, PoloCtl.update);
r.put("/polos/:id/members", isAuth, isAdmin, PoloCtl.setMembers);
r.delete("/polos/:id", isAuth, isAdmin, PoloCtl.remove);

// ------------------------------------------------------------------- CRM
r.get("/crm/options", isAuth, Lead.options);
r.get("/crm/board", isAuth, Lead.board);
r.get("/crm/metrics", isAuth, Lead.metrics);
r.post("/crm/backfill", isAuth, isAdmin, Lead.backfill);
r.get("/crm/settings", isAuth, isAdmin, Lead.getSettings);
r.put("/crm/settings", isAuth, isAdmin, Lead.putSettings);
r.get("/lead-stages", isAuth, Lead.stages.index);
r.post("/lead-stages", isAuth, isAdmin, Lead.stages.store);
r.put("/lead-stages/:id", isAuth, isAdmin, Lead.stages.update);
r.delete("/lead-stages/:id", isAuth, isAdmin, Lead.stages.remove);
r.get("/courses", isAuth, Lead.courses.index);
r.post("/courses", isAuth, isAdmin, Lead.courses.store);
r.put("/courses/:id", isAuth, isAdmin, Lead.courses.update);
r.delete("/courses/:id", isAuth, isAdmin, Lead.courses.remove);

r.get("/leads", isAuth, Lead.index);
r.post("/leads", isAuth, Lead.store);
r.post("/leads/import", isAuth, Lead.importLeads);
r.get("/leads/by-contact/:contactId", isAuth, Lead.byContact);
r.post("/leads/from-contact/:contactId", isAuth, Lead.fromContact);
r.get("/leads/:id", isAuth, canAccessLead, Lead.show);
r.put("/leads/:id", isAuth, canAccessLead, Lead.update);
r.delete("/leads/:id", isAuth, canAccessLead, isAdmin, Lead.remove);
r.put("/leads/:id/stage", isAuth, canAccessLead, Lead.setStage);
r.get("/leads/:id/activities", isAuth, canAccessLead, Lead.activities);
r.post("/leads/:id/activities", isAuth, canAccessLead, Lead.addNote);
r.get("/leads/:id/tasks", isAuth, canAccessLead, Lead.leadTasks);
r.post("/leads/:id/tasks", isAuth, canAccessLead, Lead.addTask);
r.post("/leads/:id/open-ticket", isAuth, canAccessLead, Lead.openTicket);
r.get("/lead-tasks", isAuth, Lead.tasksIndex);
r.get("/onboarding", isAuth, Lead.onboardingList);
r.post("/leads/:id/enroll", isAuth, canAccessLead, Lead.enroll);
r.post("/leads/:id/onboarding", isAuth, canAccessLead, Lead.onboarding);
r.put("/leads/:id/tasks/:taskId", isAuth, canAccessLead, Lead.updateTask);
r.post("/leads/:id/tasks/:taskId/toggle", isAuth, canAccessLead, Lead.completeTask);
r.delete("/leads/:id/tasks/:taskId", isAuth, canAccessLead, Lead.removeTask);

// ---------------------------------------------------------------- proposals
r.get("/proposals/defaults", isAuth, Proposal.defaults);
r.post("/proposals/preview", isAuth, Proposal.preview);
r.get("/proposals", isAuth, Proposal.index);
r.post("/proposals", isAuth, Proposal.store);
r.get("/proposals/:id", isAuth, canAccessProposal, Proposal.show);
r.put("/proposals/:id", isAuth, canAccessProposal, Proposal.update);
r.delete("/proposals/:id", isAuth, canAccessProposal, Proposal.remove);
r.post("/proposals/:id/duplicate", isAuth, canAccessProposal, Proposal.duplicate);
r.get("/proposals/:id/pdf", isAuth, canAccessProposal, Proposal.pdf);
r.post("/proposals/:id/send", isAuth, canAccessProposal, Proposal.send);
r.get("/institutions", isAuth, Proposal.institutions.index);
r.post("/institutions", isAuth, isAdmin, Proposal.institutions.store);
r.put("/institutions/:id", isAuth, isAdmin, Proposal.institutions.update);
r.delete("/institutions/:id", isAuth, isAdmin, Proposal.institutions.remove);
r.get("/proposal-templates", isAuth, Proposal.templates.index);
r.post("/proposal-templates", isAuth, isAdmin, Proposal.templates.store);
r.put("/proposal-templates/:id", isAuth, isAdmin, Proposal.templates.update);
r.delete("/proposal-templates/:id", isAuth, isAdmin, Proposal.templates.remove);
r.post("/courses/import", isAuth, isAdmin, Lead.importCourses);

// ----------------------------------------------------- enrollment payments (Efí)
r.get("/payments/efi/settings", isAuth, isAdmin, Payment.getSettings);
r.put("/payments/efi/settings", isAuth, isAdmin, Payment.putSettings);
r.post("/payments/efi/certificate", isAuth, isAdmin, certUpload.single("certificate"), Payment.uploadCertificate);
r.post("/payments/efi/test", isAuth, isAdmin, Payment.testConnection);
r.post("/payments/efi/webhook", isAuth, isAdmin, Payment.registerWebhook);
r.get("/me/efi", isAuth, Payment.myEfi);
r.put("/me/efi", isAuth, Payment.saveMyEfi);
r.delete("/me/efi", isAuth, Payment.clearMyEfi);
r.get("/leads/:id/payments", isAuth, canAccessLead, Payment.listForLead);
r.post("/leads/:id/payments", isAuth, canAccessLead, Payment.createForLead);
r.get("/payments/:id", isAuth, canAccessPayment, Payment.show);
r.post("/payments/:id/refresh", isAuth, canAccessPayment, Payment.refresh);
r.post("/payments/:id/cancel", isAuth, canAccessPayment, Payment.cancel);
r.post("/payments/:id/send", isAuth, canAccessPayment, Payment.send);

export default r;
