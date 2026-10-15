import express from "express";
import multer from "multer";

import isAuth from "../middleware/isAuth";
import { cached } from "../middleware/refCache";
import { crmReport } from "../controllers/ReportController";
import * as Preferences from "../controllers/PreferencesController";
import canManageWhatsapp from "../middleware/canManageWhatsapp";
import isAdmin from "../middleware/isAdmin";
import isManager from "../middleware/isManager";
import { canWriteTicket } from "../middleware/canAccessTicket";
import { canAccessLead, canAccessProposal, canAccessPayment } from "../middleware/scope";
import uploadConfig from "../config/upload";

import * as Tag from "../controllers/TagController";
import * as Community from "../controllers/CommunityController";
import * as MailSettings from "../controllers/MailSettingsController";
import * as Webhook from "../controllers/WebhookController";
import * as ApiToken from "../controllers/ApiTokenController";
import * as Ai from "../controllers/AiAgentController";
import * as Chatbot from "../controllers/ChatbotController";
import * as Schedule from "../controllers/ScheduleController";
import * as Campaign from "../controllers/CampaignController";
import * as Stats from "../controllers/StatsController";
import * as Dashboard from "../controllers/DashboardController";
import * as Channel from "../controllers/ChannelController";
import * as Lead from "../controllers/LeadController";
import * as Proposal from "../controllers/ProposalController";
import * as Payment from "../controllers/PaymentController";
import * as PoloCtl from "../controllers/PoloController";
import * as Aff from "../controllers/AffiliateController";
import * as Commission from "../controllers/CommissionController";
import * as Goal from "../controllers/GoalController";
import * as Flow from "../controllers/FlowController";
import * as Trigger from "../controllers/TriggerController";
import * as DashboardMgmt from "../controllers/DashboardManagementController";
import * as AffMat from "../controllers/AffiliateMaterialController";
import { affiliateUpload } from "../config/affiliateUpload";
import { affiliateStaff, canAccessAffiliate } from "../helpers/Affiliates";

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

// affiliates: people outside the team who refer students (consultants see their own)
r.get("/affiliates", isAuth, affiliateStaff, Aff.index);
r.get("/affiliates/ranking", isAuth, affiliateStaff, Aff.ranking);
r.get("/me/phone", isAuth, Aff.myPhone);
r.put("/me/phone", isAuth, Aff.saveMyPhone);
r.get("/affiliates/polos", isAuth, affiliateStaff, Aff.polos);
r.post("/affiliates", isAuth, affiliateStaff, Aff.store);
r.get("/affiliates/:id", isAuth, affiliateStaff, canAccessAffiliate, Aff.show);
r.put("/affiliates/:id", isAuth, affiliateStaff, canAccessAffiliate, Aff.update);
r.delete("/affiliates/:id", isAuth, isAdmin, Aff.remove);
r.get("/affiliates/:id/summary", isAuth, affiliateStaff, canAccessAffiliate, Aff.summary);
r.post("/affiliates/:id/rotate-token", isAuth, affiliateStaff, canAccessAffiliate, Aff.rotateToken);
r.post("/affiliates/:id/referrals", isAuth, affiliateStaff, canAccessAffiliate, Aff.addReferral);
r.post("/affiliates/:id/attach-lead", isAuth, affiliateStaff, canAccessAffiliate, Aff.attachLead);
r.post("/affiliates/:id/send-portal", isAuth, affiliateStaff, canAccessAffiliate, Aff.sendPortal);
r.post("/affiliates/:id/send-access-email", isAuth, affiliateStaff, canAccessAffiliate, Aff.sendPortalMail);
r.post("/affiliates/:id/send-proposal", isAuth, affiliateStaff, canAccessAffiliate, Aff.sendProposal);
r.get("/affiliate-rules", isAuth, affiliateStaff, Aff.getRulesRoute);
r.put("/affiliate-rules", isAuth, isManager, Aff.putRules);
r.get("/affiliate-bonuses", isAuth, affiliateStaff, Aff.listBonuses);
r.get("/affiliate-bonuses/export.csv", isAuth, affiliateStaff, Aff.exportBonuses);
r.put("/affiliate-bonuses/:id/:action", isAuth, isManager, Aff.bonusAction);
r.get("/affiliate-materials", isAuth, affiliateStaff, AffMat.listMaterials);
r.post("/affiliate-materials", isAuth, affiliateStaff, affiliateUpload.single("file"), AffMat.createMaterial);
r.put("/affiliate-materials/:id", isAuth, affiliateStaff, affiliateUpload.single("file"), AffMat.updateMaterial);
r.delete("/affiliate-materials/:id", isAuth, affiliateStaff, AffMat.removeMaterial);
r.get("/affiliate-materials/:id/file", isAuth, affiliateStaff, AffMat.materialFile);
r.post("/affiliate-materials/:id/release", isAuth, affiliateStaff, AffMat.releaseTo("material"));
r.get("/affiliate-campaigns", isAuth, affiliateStaff, AffMat.listCampaigns);
r.post("/affiliate-campaigns", isAuth, affiliateStaff, affiliateUpload.single("file"), AffMat.createCampaign);
r.put("/affiliate-campaigns/:id", isAuth, affiliateStaff, affiliateUpload.single("file"), AffMat.updateCampaign);
r.delete("/affiliate-campaigns/:id", isAuth, affiliateStaff, AffMat.removeCampaign);
r.get("/affiliate-campaigns/:id/cover", isAuth, affiliateStaff, AffMat.campaignCover);
r.post("/affiliate-campaigns/:id/release", isAuth, affiliateStaff, AffMat.releaseTo("campaign"));

r.get("/dashboard/management", isAuth, DashboardMgmt.management);
r.get("/dashboard/me", isAuth, DashboardMgmt.myDay);
r.get("/dashboard", isAuth, Dashboard.index);

// tags
r.get("/tags", isAuth, cached(), Tag.index);
r.get("/communities", isAuth, Community.index);
r.get("/mail/settings", isAuth, isAdmin, MailSettings.show);
r.put("/mail/settings", isAuth, isAdmin, MailSettings.update);
r.post("/mail/test", isAuth, isAdmin, MailSettings.test);
r.get("/mail/templates", isAuth, isAdmin, MailSettings.templates);
r.get("/mail/templates/:key/preview", isAuth, isAdmin, MailSettings.preview);
r.post("/mail/templates/:key/test", isAuth, isAdmin, MailSettings.testTemplate);
r.post("/tags", isAuth, isManager, Tag.store);
r.put("/tags/:id", isAuth, isManager, Tag.update);
r.delete("/tags/:id", isAuth, isManager, Tag.remove);
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
r.get("/ai-agents", isAuth, isManager, Ai.index);
r.post("/ai-agents", isAuth, isManager, Ai.store);
r.put("/ai-agents/:id", isAuth, isManager, Ai.update);
r.delete("/ai-agents/:id", isAuth, isManager, Ai.remove);
r.get("/ai-defaults", isAuth, isManager, Ai.defaults);
r.get("/ai-agents/:id/kb", isAuth, isManager, Ai.kbList);
r.post("/ai-agents/:id/kb", isAuth, isManager, Ai.kbAdd);
r.post("/ai-agents/:id/kb/upload", isAuth, isManager, kbUpload.single("file"), Ai.kbUpload);
r.post("/ai-agents/:id/kb/url", isAuth, isManager, Ai.kbFromUrl);
r.get("/ai-agents/:id/kb/:docId", isAuth, isManager, Ai.kbShow);
r.put("/ai-agents/:id/kb/:docId", isAuth, isManager, Ai.kbUpdate);
r.delete("/ai-agents/:id/kb/:docId", isAuth, isManager, Ai.kbRemove);
r.post("/ai-agents/:id/test", isAuth, isManager, Ai.test);
r.post("/ai-agents/:id/kb-search", isAuth, isManager, Ai.kbSearch);
r.get("/ai-agents/:id/learnings", isAuth, isManager, Ai.learningList);
r.post("/ai-agents/:id/learnings", isAuth, isManager, Ai.learningTeach);
r.get("/ai-learnings/pending", isAuth, isManager, Ai.learningPending);
r.put("/ai-learnings/:id", isAuth, isManager, Ai.learningUpdate);
r.post("/ai-learnings/:id/approve", isAuth, isManager, Ai.learningApprove);
r.post("/ai-learnings/:id/discard", isAuth, isManager, Ai.learningDiscard);
r.get("/ai-agents/:id/usage", isAuth, isManager, Ai.usage);
r.get("/ai-settings", isAuth, isAdmin, Ai.getKeys);
r.put("/ai-settings", isAuth, isAdmin, Ai.setKeys);

// visual flows (the chatbot builder)
r.get("/flows", isAuth, isManager, Flow.index);
r.get("/flow-templates", isAuth, isManager, Flow.templates);
r.post("/flows", isAuth, isManager, Flow.store);
r.post("/flows/import-legacy", isAuth, isManager, Flow.importLegacy);
r.post("/flows/generate", isAuth, isManager, Flow.generate);
r.get("/flows/:id", isAuth, isManager, Flow.show);
r.put("/flows/:id", isAuth, isManager, Flow.update);
r.delete("/flows/:id", isAuth, isManager, Flow.remove);
r.post("/flows/:id/validate", isAuth, isManager, Flow.validate);
r.post("/flows/:id/publish", isAuth, isManager, Flow.publish);
r.post("/flows/:id/unpublish", isAuth, isManager, Flow.unpublish);
r.post("/flows/:id/duplicate", isAuth, isManager, Flow.duplicate);
r.post("/flows/:id/simulate", isAuth, isManager, Flow.simulate);
r.get("/flows/:id/stats", isAuth, isManager, Flow.stats);

// triggers ("Gatilhos"): when something happens, run a flow
r.get("/automation-events", isAuth, isManager, Trigger.catalog);
r.get("/automation-triggers", isAuth, isManager, Trigger.index);
r.post("/automation-triggers", isAuth, isManager, Trigger.store);
r.put("/automation-triggers/:id", isAuth, isManager, Trigger.update);
r.delete("/automation-triggers/:id", isAuth, isManager, Trigger.remove);

// chatbot flow
r.get("/chatbot-nodes", isAuth, isManager, Chatbot.index);
r.post("/chatbot-nodes", isAuth, isManager, Chatbot.store);
r.put("/chatbot-nodes/:id", isAuth, isManager, Chatbot.update);
r.delete("/chatbot-nodes/:id", isAuth, isManager, Chatbot.remove);

// scheduled messages
r.get("/schedules", isAuth, Schedule.index);
r.post("/schedules", isAuth, Schedule.store);
r.put("/schedules/:id", isAuth, Schedule.update);
r.post("/schedules/:id/cancel", isAuth, Schedule.cancel);
r.delete("/schedules/:id", isAuth, Schedule.remove);

// campaigns + contact lists: mass messages are for the commercial team and the administration, never for the tutoring
const salesStaff = affiliateStaff;
r.get("/campaigns", isAuth, salesStaff, Campaign.index);
r.post("/campaigns", isAuth, salesStaff, Campaign.store);
r.get("/campaigns/:id", isAuth, salesStaff, Campaign.show);
r.put("/campaigns/:id", isAuth, salesStaff, Campaign.update);
r.delete("/campaigns/:id", isAuth, salesStaff, Campaign.remove);
r.get("/campaigns/:id/report", isAuth, salesStaff, Campaign.report);
r.post("/campaigns/:id/start", isAuth, salesStaff, Campaign.start);
r.post("/campaigns/:id/pause", isAuth, salesStaff, Campaign.pause);
r.post("/campaigns/:id/cancel", isAuth, salesStaff, Campaign.cancel);
r.get("/contact-lists", isAuth, salesStaff, Campaign.lists.index);
r.post("/contact-lists", isAuth, salesStaff, Campaign.lists.store);
r.post("/contact-lists/from-leads", isAuth, salesStaff, Campaign.listFromLeads);
r.put("/contact-lists/:id", isAuth, salesStaff, Campaign.lists.update);
r.delete("/contact-lists/:id", isAuth, salesStaff, Campaign.lists.remove);
r.get("/contact-lists/:id/items", isAuth, salesStaff, Campaign.listItems);
r.post("/contact-lists/:id/import", isAuth, salesStaff, Campaign.importItems);
r.delete("/contact-lists/:id/items/:itemId", isAuth, salesStaff, Campaign.removeItem);

// stats & live monitor
r.get("/stats/overview", isAuth, Stats.overview);
r.get("/stats/live", isAuth, isManager, Stats.live);

// channels
r.get("/channels", isAuth, Channel.index);
r.get("/channels/:whatsappId/info", isAuth, isManager, Channel.info);
r.get("/channels/:whatsappId/safety", isAuth, Channel.safety);
r.get("/channels/:whatsappId/groups", isAuth, canManageWhatsapp, Channel.groups);

// polos (branches) and the team of each one
r.get("/polos", isAuth, cached(), PoloCtl.index);
r.get("/polos/:id/tutors", isAuth, PoloCtl.tutors);
r.post("/polos", isAuth, isManager, PoloCtl.store);
r.post("/polos/import", isAuth, isManager, PoloCtl.importPolos);
r.put("/polos/:id", isAuth, isManager, PoloCtl.update);
r.put("/polos/:id/members", isAuth, isManager, PoloCtl.setMembers);
r.delete("/polos/:id", isAuth, isManager, PoloCtl.remove);

// ------------------------------------------------------------------- CRM
r.get("/crm/options", isAuth, cached(), Lead.options);
r.get("/crm/board", isAuth, Lead.board);
r.get("/crm/metrics", isAuth, Lead.metrics);
r.get("/crm/report", isAuth, crmReport);
r.get("/me/preferences", isAuth, Preferences.show);
r.put("/me/preferences", isAuth, Preferences.update);
r.post("/crm/backfill", isAuth, isManager, Lead.backfill);
r.get("/crm/settings", isAuth, isManager, Lead.getSettings);
r.put("/crm/settings", isAuth, isManager, Lead.putSettings);
r.get("/lead-stages", isAuth, cached(), Lead.stages.index);
r.post("/lead-stages", isAuth, isManager, Lead.stages.store);
r.put("/lead-stages/:id", isAuth, isManager, Lead.stages.update);
r.delete("/lead-stages/:id", isAuth, isManager, Lead.stages.remove);
r.get("/courses", isAuth, cached(), Lead.courses.index);
r.post("/courses", isAuth, isManager, Lead.courses.store);
r.put("/courses/:id", isAuth, isManager, Lead.courses.update);
r.delete("/courses/:id", isAuth, isManager, Lead.courses.remove);

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
r.put("/leads/:id/onboarding", isAuth, canAccessLead, Lead.editOnboarding);
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
r.post("/institutions", isAuth, isManager, Proposal.institutions.store);
r.put("/institutions/:id", isAuth, isManager, Proposal.institutions.update);
r.delete("/institutions/:id", isAuth, isManager, Proposal.institutions.remove);
r.get("/proposal-templates", isAuth, Proposal.templates.index);
r.post("/proposal-templates", isAuth, isManager, Proposal.templates.store);
r.put("/proposal-templates/:id", isAuth, isManager, Proposal.templates.update);
r.delete("/proposal-templates/:id", isAuth, isManager, Proposal.templates.remove);
r.post("/courses/import", isAuth, isManager, Lead.importCourses);
r.post("/courses/load-default", isAuth, isManager, Lead.loadDefaultCourses);

// ----------------------------------------------------- enrollment payments (Efí)
r.get("/payments/efi/settings", isAuth, isAdmin, Payment.getSettings);
r.put("/payments/efi/settings", isAuth, isAdmin, Payment.putSettings);
r.post("/payments/efi/certificate", isAuth, isAdmin, certUpload.single("certificate"), Payment.uploadCertificate);
r.post("/payments/efi/test", isAuth, isAdmin, Payment.testConnection);
r.post("/payments/efi/webhook", isAuth, isAdmin, Payment.registerWebhook);
r.get("/me/efi", isAuth, Payment.myEfi);
r.put("/me/efi", isAuth, Payment.saveMyEfi);
r.delete("/me/efi", isAuth, Payment.clearMyEfi);
// commissions of the enrollment fee: each person sees their own, administration and coordination see everyone's
// team enrollment goals (administration and coordination)
// the whole team follows the polos; only managers change the numbers
r.get("/goals/polos", isAuth, Goal.poloBoard);
r.put("/goals/:id/polos", isAuth, isManager, Goal.updatePolos);
r.put("/goals/:id/polos/:poloId", isAuth, isManager, Goal.updatePolo);
r.post("/goals/:id/polos/import", isAuth, isManager, Goal.importPoloGoals);
r.get("/goals", isAuth, isManager, Goal.index);
r.post("/goals", isAuth, isManager, Goal.store);
r.put("/goals/:id", isAuth, isManager, Goal.update);
r.delete("/goals/:id", isAuth, isManager, Goal.remove);
r.post("/goals/:id/repeat", isAuth, isManager, Goal.repeat);
r.get("/commissions", isAuth, Commission.index);
r.get("/commissions/export.csv", isAuth, Commission.exportCsv);
r.put("/commissions/:id/settle", isAuth, Commission.settle);
r.get("/leads/:id/payments", isAuth, canAccessLead, Payment.listForLead);
r.post("/leads/:id/payments", isAuth, canAccessLead, Payment.createForLead);
r.get("/payments/:id", isAuth, canAccessPayment, Payment.show);
r.post("/payments/:id/refresh", isAuth, canAccessPayment, Payment.refresh);
r.post("/payments/:id/cancel", isAuth, canAccessPayment, Payment.cancel);
r.post("/payments/:id/send", isAuth, canAccessPayment, Payment.send);

export default r;
