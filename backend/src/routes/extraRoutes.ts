import * as Tutoria from "../controllers/TutoriaController";
import * as AnalysisCtl from "../controllers/AnalysisController";
import * as SendReleases from "../controllers/SendReleaseController";
import * as Notifications from "../controllers/NotificationController";
import * as MetaCosts from "../controllers/MetaCostsController";
import * as MetaTemplates from "../controllers/MetaTemplatesController";
import isRetentionOperator from "../middleware/isRetentionOperator";
import express from "express";
import multer from "multer";
import AppError from "../errors/AppError";
import { roleOf } from "../helpers/Roles";
import * as Materials from "../controllers/CourseMaterialController";

import isAuth from "../middleware/isAuth";
import { canAccessContact } from "../middleware/canAccessContact";
import { cached } from "../middleware/refCache";
import { crmReport } from "../controllers/ReportController";
import * as Preferences from "../controllers/PreferencesController";
import canManageWhatsapp from "../middleware/canManageWhatsapp";
import isAdmin from "../middleware/isAdmin";
import isManager from "../middleware/isManager";
import isSystemAdmin from "../middleware/isSystemAdmin";
import { canReadTicket, canWriteTicket } from "../middleware/canAccessTicket";
import { canAccessLead, canAccessOnboarding, canAccessProposal, canAccessPayment, loadCrmPolos } from "../middleware/scope";
import * as EnrollmentForm from "../controllers/EnrollmentFormController";
import * as TutoringIssue from "../controllers/TutoringIssueController";
import uploadConfig from "../config/upload";

import * as Tag from "../controllers/TagController";
import * as Community from "../controllers/CommunityController";
import * as MailSettings from "../controllers/MailSettingsController";
import * as Webhook from "../controllers/WebhookController";
import * as ApiToken from "../controllers/ApiTokenController";
import * as Ai from "../controllers/AiAgentController";
import * as Commercial from "../controllers/CommercialController";
import * as Mec from "../controllers/MecController";
import * as Chatbot from "../controllers/ChatbotController";
import * as Schedule from "../controllers/ScheduleController";
import * as Campaign from "../controllers/CampaignController";
import { campaignStaff, notTutor, ownCampaign, ownList } from "../services/CampaignServices/Access";
import * as Stats from "../controllers/StatsController";
import * as Dashboard from "../controllers/DashboardController";
import * as Channel from "../controllers/ChannelController";
import * as ChannelOAuth from "../controllers/ChannelOAuthController";
import * as Lead from "../controllers/LeadController";
import * as Proposal from "../controllers/ProposalController";
import * as Institutions from "../controllers/InstitutionController";
import analyticsInstitution from "../middleware/analyticsInstitution";
import * as Retention from "../controllers/RetentionController";
import * as Payment from "../controllers/PaymentController";
import * as PoloCtl from "../controllers/PoloController";
import * as Aff from "../controllers/AffiliateController";
import * as Commission from "../controllers/CommissionController";
import * as Goal from "../controllers/GoalController";
import * as Enrollment from "../controllers/EnrollmentController";
import * as Flow from "../controllers/FlowController";
import * as Trigger from "../controllers/TriggerController";
import * as DashboardMgmt from "../controllers/DashboardManagementController";
import * as Analytics from "../controllers/AnalyticsController";
import * as AffMat from "../controllers/AffiliateMaterialController";
import { affiliateUpload } from "../config/affiliateUpload";
import { affiliateStaff, canAccessAffiliate } from "../helpers/Affiliates";
import rateLimit from "../middleware/rateLimit";
import { uploadCapacity } from "../middleware/uploadCapacity";
import { PUBLIC_UPLOAD_MAX_FILE_BYTES } from "../helpers/PublicUploadPolicy";
import { isAllowedTrainingUpload } from "../services/AiServices/TrainZip";

const upload = multer({ ...uploadConfig, limits: { fileSize: PUBLIC_UPLOAD_MAX_FILE_BYTES, files: 1 } });
const materialUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
const certUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });
const trainUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, cb) => isAllowedTrainingUpload(file.originalname) ? cb(null, true) : cb(new AppError("ERR_UPLOAD_TYPE", 400) as unknown as Error) });
const kbUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const r = express.Router();

// generic upload used by campaigns / schedules to attach media
r.post("/uploads", isAuth, rateLimit({ windowMs: 60 * 60 * 1000, max: 30, key: req => String(req.user?.id || req.ip) }), uploadCapacity(PUBLIC_UPLOAD_MAX_FILE_BYTES + 1024 * 1024), upload.single("file"), (req, res) =>
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

// commercial analytics: one service computes everything; the personal route never reads whose numbers from the request
r.get("/analytics/definitions", isAuth, Analytics.definitions);
r.get("/analytics/me", isAuth, analyticsInstitution, Analytics.me);
r.get("/analytics/me/overview", isAuth, analyticsInstitution, Analytics.meOverview);
r.get("/analytics/team", isAuth, analyticsInstitution, isManager, Analytics.team);
r.get("/analytics/team/export.csv", isAuth, analyticsInstitution, isManager, Analytics.exportTeam);
r.get("/analytics/config", isAuth, isManager, Analytics.getAnalyticsConfig);
r.put("/analytics/config", isAuth, isManager, Analytics.putAnalyticsConfig);
r.get("/analytics/consultant/:userId", isAuth, analyticsInstitution, Analytics.consultant);
r.get("/analytics/process", isAuth, analyticsInstitution, isManager, Analytics.processTeam);
r.get("/analytics/process/skipped", isAuth, analyticsInstitution, isManager, Analytics.processSkipped);
r.get("/analytics/process/:userId", isAuth, analyticsInstitution, Analytics.processConsultant);
// everyone logged in: the management sees the consultants it may see, anybody else only their own numbers (decided in the controller)
r.get("/analytics/commercial", isAuth, analyticsInstitution, Analytics.commercial);
// training suggested by the daily review of the AI: the management reads it; only an administrator runs a reading on demand (it spends)
r.get("/analytics/coaching", isAuth, analyticsInstitution, isManager, Analytics.coaching);
r.post("/analytics/coaching/text", isAuth, isManager, Analytics.coachingText);
r.post("/analytics/coaching/run", isAuth, isAdmin, Analytics.coachingRun);
// the tutoring: the management sees every tutor, a tutor only their own students (decided in the controller)
r.get("/analytics/tutoria", isAuth, analyticsInstitution, Analytics.tutoria);
r.get("/analytics/insights", isAuth, analyticsInstitution, Analytics.insights);
// "Dispensar até amanhã": one priority leaves the person's own list for the rest of the day (kept in the person's preferences)
r.post("/analytics/insights/dismiss", isAuth, Analytics.dismissInsight);
r.get("/analytics/online", isAuth, isManager, Analytics.online);

r.get("/dashboard/management", isAuth, isManager, DashboardMgmt.management);
r.post("/dashboard/management/feedback", isAuth, isManager, rateLimit({ windowMs: 10 * 60 * 1000, max: 5, key: req => `management-feedback:${req.user.id}` }), DashboardMgmt.managementFeedback);
r.get("/dashboard/manager", isAuth, DashboardMgmt.managerOverview);
// the goals of every polo (target, done, pace): everyone who works on the enrollments follows them
r.get("/dashboard/polos-progress", isAuth, DashboardMgmt.polosProgress);
r.get("/dashboard/me", isAuth, DashboardMgmt.myDay);
r.get("/dashboard", isAuth, Dashboard.index);

// tags
r.get("/tags", isAuth, cached(), Tag.index);
r.get("/communities", isAuth, Community.index);
r.get("/mail/settings", isAuth, isSystemAdmin, MailSettings.show);
r.put("/mail/settings", isAuth, isSystemAdmin, MailSettings.update);
r.post("/mail/test", isAuth, isSystemAdmin, MailSettings.test);
r.get("/mail/templates", isAuth, isSystemAdmin, MailSettings.templates);
r.get("/mail/templates/:key/preview", isAuth, isSystemAdmin, MailSettings.preview);
r.post("/mail/templates/:key/test", isAuth, isSystemAdmin, MailSettings.testTemplate);
r.post("/tags", isAuth, isManager, Tag.store);
r.put("/tags/:id", isAuth, isManager, Tag.update);
r.delete("/tags/:id", isAuth, isManager, Tag.remove);
r.put("/tickets/:ticketId/tags", isAuth, canWriteTicket, Tag.setTicketTags);
r.get("/contacts/:contactId/tags", isAuth, canAccessContact, Tag.contactTags);
r.put("/contacts/:contactId/tags", isAuth, canAccessContact, Tag.setContactTags);

// webhooks / api tokens (admin)
r.get("/webhooks-config/events", isAuth, isSystemAdmin, Webhook.events);
r.get("/webhooks-config", isAuth, isSystemAdmin, Webhook.index);
r.post("/webhooks-config", isAuth, isSystemAdmin, Webhook.store);
r.put("/webhooks-config/:id", isAuth, isSystemAdmin, Webhook.update);
r.delete("/webhooks-config/:id", isAuth, isSystemAdmin, Webhook.remove);
r.post("/webhooks-config/:id/test", isAuth, isSystemAdmin, Webhook.test);
r.get("/api-tokens", isAuth, isSystemAdmin, ApiToken.index);
r.get("/api-tokens/scopes", isAuth, isSystemAdmin, ApiToken.scopes);
r.get("/api-tokens/legacy", isAuth, isSystemAdmin, ApiToken.legacyShow);
r.put("/api-tokens/legacy", isAuth, isSystemAdmin, ApiToken.legacySave);
r.post("/api-tokens", isAuth, isSystemAdmin, ApiToken.store);
r.delete("/api-tokens/:id", isAuth, isSystemAdmin, ApiToken.remove);

// AI agents
r.get("/ai-agents", isAuth, isManager, Ai.index);
r.post("/ai-agents", isAuth, isManager, Ai.store);
r.put("/ai-agents/:id", isAuth, isManager, Ai.update);
r.delete("/ai-agents/:id", isAuth, isManager, Ai.remove);
r.get("/ai-agent-templates", isAuth, isManager, Ai.agentTemplates);
// how the assistant introduces itself, with the institution of Configurações (one preview for every screen)
r.get("/ai-agent-intro", isAuth, isManager, Ai.introPreview);
r.get("/crm-funnel", isAuth, isManager, Commercial.funnelShow);
r.put("/crm-funnel", isAuth, isManager, Commercial.funnelSave);
r.post("/crm-funnel/create", isAuth, isManager, Commercial.funnelCreate);
r.get("/course-regulations", isAuth, isManager, Commercial.regulationsList);
r.put("/course-regulations/:courseId", isAuth, isManager, Commercial.regulationSave);
r.delete("/course-regulations/:id", isAuth, isManager, Commercial.regulationRemove);
r.get("/course-cohorts", isAuth, isManager, Mec.cohortsList);
r.post("/course-cohorts", isAuth, isManager, Mec.cohortStore);
r.put("/course-cohorts/:id", isAuth, isManager, Mec.cohortUpdate);
r.delete("/course-cohorts/:id", isAuth, isManager, Mec.cohortRemove);
r.get("/regulatory-norms", isAuth, isManager, Mec.normsShow);
r.post("/regulatory-norms", isAuth, isManager, Mec.normStore);
r.put("/regulatory-norms/:id", isAuth, isManager, Mec.normUpdate);
r.get("/mec-defaults", isAuth, isManager, Commercial.mecDefaultsShow);
r.put("/mec-defaults/:area", isAuth, isManager, Commercial.mecDefaultsSave);
r.post("/mec-defaults/apply", isAuth, isManager, Commercial.mecDefaultsApply);
r.get("/ai-agents/:id/commercial-metrics", isAuth, isManager, Commercial.metrics);
r.get("/ai-agents/:id/quality", isAuth, isManager, Commercial.quality);
r.get("/ai-agents/:id/improve", isAuth, isManager, Commercial.improve);
r.get("/ai-agents/:id/central", isAuth, isManager, Commercial.central);
r.get("/ai-handoff", isAuth, isManager, Commercial.handoffShow);
r.put("/ai-handoff", isAuth, isManager, Commercial.handoffSave);
r.get("/leads/:id/commercial", isAuth, canAccessLead, Commercial.leadCommercial);
r.get("/tickets/:ticketId/commercial", isAuth, canReadTicket, Commercial.ticketCommercial);
r.post("/ai-agents/from-template", isAuth, isManager, Ai.fromTemplate);
r.post("/ai-agents/generate", isAuth, isManager, Ai.generate);
r.post("/ai-agents/:id/convert", isAuth, isManager, Ai.convert);
r.get("/ai-agents/:id/kb", isAuth, isManager, Ai.kbList);
r.post("/ai-agents/:id/kb", isAuth, isManager, Ai.kbAdd);
r.post("/ai-agents/:id/kb/upload", isAuth, isManager, kbUpload.single("file"), Ai.kbUpload);
r.post("/ai-agents/:id/kb/url", isAuth, isManager, Ai.kbFromUrl);
r.get("/ai-agents/:id/kb/:docId", isAuth, isManager, Ai.kbShow);
r.put("/ai-agents/:id/kb/:docId", isAuth, isManager, Ai.kbUpdate);
r.delete("/ai-agents/:id/kb/:docId", isAuth, isManager, Ai.kbRemove);
r.post("/ai-agents/:id/test", isAuth, isManager, Ai.test);
r.put("/ai-agents/:id/draft", isAuth, isManager, Ai.saveDraft);
r.delete("/ai-agents/:id/draft", isAuth, isManager, Ai.discardDraft);
r.get("/ai-agents/:id/history", isAuth, isManager, Ai.historyList);
r.post("/ai-agents/:id/history/:revisionId/restore", isAuth, isManager, Ai.historyRestore);
r.get("/ai-agents/:id/cases", isAuth, isManager, Ai.evalList);
r.post("/ai-agents/:id/cases", isAuth, isManager, Ai.evalCreate);
r.post("/ai-agents/:id/cases/defaults", isAuth, isManager, Ai.evalDefaults);
r.post("/ai-agents/:id/cases/run", isAuth, isManager, Ai.evalRun);
r.get("/ai-agents/:id/script", isAuth, isManager, Ai.script);
r.get("/ai-agents/:id/process-eval", isAuth, isManager, Ai.processEval);
r.post("/ai-agents/:id/process-eval/run", isAuth, isManager, Ai.processEvalRun);
r.delete("/ai-agents/:id/cases/:caseId", isAuth, isManager, Ai.evalRemove);
r.post("/ai-agents/:id/kb-search", isAuth, isManager, Ai.kbSearch);
r.get("/ai-agents/:id/learnings", isAuth, isManager, Ai.learningList);
r.post("/ai-agents/:id/learnings", isAuth, isManager, Ai.learningTeach);
r.get("/ai-learnings/pending", isAuth, isManager, Ai.learningPending);
r.put("/ai-learnings/:id", isAuth, isManager, Ai.learningUpdate);
r.post("/ai-learnings/:id/approve", isAuth, isManager, Ai.learningApprove);
r.post("/ai-learnings/:id/discard", isAuth, isManager, Ai.learningDiscard);
r.get("/ai-agents/:id/rules", isAuth, isManager, Ai.ruleList);
r.post("/ai-agents/:id/rules", isAuth, isManager, Ai.ruleCreate);
r.post("/ai-agents/:id/rules/bulk", isAuth, isManager, Ai.ruleBulk);
r.put("/ai-rules/:id", isAuth, isManager, Ai.ruleUpdate);
r.delete("/ai-rules/:id", isAuth, isManager, Ai.ruleRemove);
r.post("/ai-agents/:id/coach", isAuth, isManager, Ai.coach);
r.post("/ai-agents/:id/ping", isAuth, isManager, Ai.ping);
r.post("/ai-agents/:id/train/upload", isAuth, isManager, rateLimit({ windowMs: 10 * 60 * 1000, max: 4, key: req => String(req.user?.id || req.ip) }), trainUpload.single("file"), Ai.trainUpload);
r.post("/ai-agents/:id/train/analyze", isAuth, isManager, Ai.trainAnalyze);
r.post("/ai-agents/:id/train/apply", isAuth, isManager, Ai.trainApply);
r.post("/ai-agents/:id/train/from-conversation", isAuth, isManager, Ai.trainFromConversation);
r.get("/ai-agents/:id/usage", isAuth, isManager, Ai.usage);
r.get("/ai-settings", isAuth, isSystemAdmin, Ai.getKeys);
r.put("/ai-settings", isAuth, isSystemAdmin, Ai.setKeys);

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
r.get("/flows/:id/versions", isAuth, isManager, Flow.versions);
r.post("/flows/:id/versions/:versionId/restore", isAuth, isManager, Flow.restoreVersion);
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

// campaigns + contact lists: the commercial team and the administration send to anyone in the CRM; the tutor sends only to their own
// students, through the tutoring number, and sees only what they created (CampaignServices/Access)
const salesStaff = campaignStaff;
r.get("/campaigns", isAuth, salesStaff, Campaign.index);
r.get("/campaigns/templates", isAuth, salesStaff, Campaign.templates);
r.post("/campaigns", isAuth, salesStaff, Campaign.store);
r.post("/campaigns/preflight", isAuth, salesStaff, Campaign.preflightDraft);
r.get("/campaigns/:id", isAuth, salesStaff, ownCampaign, Campaign.show);
r.put("/campaigns/:id", isAuth, salesStaff, ownCampaign, Campaign.update);
r.delete("/campaigns/:id", isAuth, salesStaff, ownCampaign, Campaign.remove);
r.get("/campaigns/:id/report", isAuth, salesStaff, ownCampaign, Campaign.report);
r.post("/campaigns/:id/start", isAuth, salesStaff, ownCampaign, Campaign.start);
r.post("/campaigns/:id/pause", isAuth, salesStaff, ownCampaign, Campaign.pause);
r.post("/campaigns/:id/cancel", isAuth, salesStaff, ownCampaign, Campaign.cancel);
r.post("/campaigns/:id/retry-failed", isAuth, salesStaff, ownCampaign, Campaign.retryFailed);
r.post("/campaigns/:id/duplicate", isAuth, salesStaff, ownCampaign, Campaign.duplicate);
r.post("/campaigns/:id/test", isAuth, salesStaff, ownCampaign, Campaign.sendTest);
r.get("/campaigns/:id/preflight", isAuth, salesStaff, ownCampaign, Campaign.preflight);
r.post("/campaigns/:id/remove-no-consent", isAuth, salesStaff, ownCampaign, Campaign.removeNoConsent);
r.get("/contact-lists", isAuth, salesStaff, Campaign.lists.index);
r.post("/contact-lists", isAuth, salesStaff, Campaign.lists.store);
r.post("/contact-lists/from-leads", isAuth, salesStaff, Campaign.listFromLeads);
r.put("/contact-lists/:id", isAuth, salesStaff, ownList, Campaign.lists.update);
r.delete("/contact-lists/:id", isAuth, salesStaff, ownList, Campaign.lists.remove);
r.get("/contact-lists/:id/items", isAuth, salesStaff, ownList, Campaign.listItems);
r.get("/contact-lists/:id/export.csv", isAuth, salesStaff, ownList, Campaign.exportListCsv);
r.post("/contact-lists/:id/import", isAuth, salesStaff, notTutor, Campaign.importItems);
r.delete("/contact-lists/:id/items/:itemId", isAuth, salesStaff, ownList, Campaign.removeItem);

// stats & live monitor
r.get("/stats/overview", isAuth, Stats.overview);

// channels
r.get("/channels", isAuth, Channel.index);
// Instagram login: the app of Meta is set once (managers); anyone signed in connects their own account
r.get("/channels/instagram/status", isAuth, ChannelOAuth.status);
// only the management connects an Instagram account (Conexões)
r.get("/channels/instagram/authorize", isAuth, isManager, ChannelOAuth.authorize);
r.get("/channels/instagram/app", isAuth, isManager, ChannelOAuth.getApp);
r.put("/channels/instagram/app", isAuth, isManager, ChannelOAuth.putApp);
r.get("/channels/:whatsappId/info", isAuth, isManager, Channel.info);
r.get("/channels/:whatsappId/safety", isAuth, canManageWhatsapp, Channel.safety);
r.get("/channels/:whatsappId/groups", isAuth, canManageWhatsapp, Channel.groups);

// polos (branches) and the team of each one
r.get("/polos", isAuth, cached(), PoloCtl.index);
r.get("/polos/:id/tutors", isAuth, PoloCtl.tutors);
r.get("/tutors", isAuth, PoloCtl.allTutors);
r.get("/polos/:id/coverage", isAuth, isManager, PoloCtl.coverage);
r.put("/polos/:id/coverage", isAuth, isManager, PoloCtl.setCoverage);
r.post("/polos", isAuth, isManager, PoloCtl.store);
r.post("/polos/import", isAuth, isManager, PoloCtl.importPolos);
r.put("/polos/:id", isAuth, isManager, PoloCtl.update);
r.put("/polos/:id/members", isAuth, isManager, PoloCtl.setMembers);
r.post("/polos/:id/members/:userId", isAuth, isManager, PoloCtl.addMember);
r.delete("/polos/:id/members/:userId", isAuth, isManager, PoloCtl.removeMember);
r.delete("/polos/:id", isAuth, isManager, PoloCtl.remove);

// ------------------------------------------------------------------- CRM
r.get("/crm/options", isAuth, cached(), Lead.options);
r.get("/crm/board", isAuth, Lead.board);
r.get("/crm/metrics", isAuth, Lead.metrics);
r.get("/crm/triage", isAuth, Lead.triageList);
r.get("/crm/report", isAuth, crmReport);
r.get("/me/preferences", isAuth, Preferences.show);
r.put("/me/preferences", isAuth, Preferences.update);
r.post("/crm/backfill", isAuth, isManager, Lead.backfill);
r.get("/crm/settings", isAuth, isManager, Lead.getSettings);
r.put("/crm/settings", isAuth, isManager, Lead.putSettings);
r.post("/crm/cadences/run", isAuth, isManager, Lead.runCadencesNow);
r.get("/retention/config", isAuth, loadCrmPolos, Retention.getConfig);
r.put("/retention/config", isAuth, loadCrmPolos, isRetentionOperator, Retention.putConfig);
r.post("/retention/run", isAuth, loadCrmPolos, isRetentionOperator, Retention.runNow);
r.get("/retention/summary", isAuth, loadCrmPolos, Retention.summary);
r.get("/retention/today", isAuth, loadCrmPolos, Retention.today);
r.post("/retention/contact/:leadId", isAuth, loadCrmPolos, Retention.contact);
r.get("/retention/students", isAuth, loadCrmPolos, Retention.students);
r.get("/retention/audience", isAuth, loadCrmPolos, Retention.audience);
r.post("/retention/preview", isAuth, loadCrmPolos, Retention.preview);
r.post("/retention/send", isAuth, loadCrmPolos, Retention.sendBulk);
r.get("/retention/log", isAuth, loadCrmPolos, Retention.log);
r.get("/retention/log.csv", isAuth, loadCrmPolos, Retention.logCsv);
r.get("/retention/operations", isAuth, loadCrmPolos, Retention.operations);
r.get("/retention/nps", isAuth, loadCrmPolos, Retention.nps);
r.get("/retention/nps.csv", isAuth, loadCrmPolos, Retention.npsCsv);
r.post("/retention/nps/send/:leadId", isAuth, loadCrmPolos, Retention.sendNps);
r.get("/retention/risk", isAuth, loadCrmPolos, Retention.risk);
r.get("/retention/risk.csv", isAuth, loadCrmPolos, Retention.riskCsv);
r.post("/retention/risk/:leadId/message", isAuth, loadCrmPolos, Retention.riskMessage);
r.get("/retention/rematricula", isAuth, loadCrmPolos, Retention.rematricula);
r.get("/retention/rematricula.csv", isAuth, loadCrmPolos, Retention.rematriculaCsv);
r.post("/retention/rematricula/:leadId", isAuth, loadCrmPolos, Retention.setRematricula);
r.get("/leads/:id/documents", isAuth, canAccessLead, Lead.documents);
r.put("/leads/:id/documents/:docId", isAuth, canAccessLead, Lead.setDocument);
r.post("/leads/:id/documents/remind", isAuth, canAccessLead, Lead.remindDocs);
// the enrollment form the lead fills in by a personal link (data and picture of the ID); erasing it (LGPD) is for the administration
r.get("/leads/:id/enrollment-form", isAuth, canAccessLead, EnrollmentForm.show);
r.post("/leads/:id/enrollment-form", isAuth, canAccessLead, EnrollmentForm.create);
r.post("/leads/:id/enrollment-form/send", isAuth, canAccessLead, EnrollmentForm.send);
r.get("/leads/:id/enrollment-form/files/:kind", isAuth, canAccessLead, EnrollmentForm.file);
r.delete("/leads/:id/enrollment-form", isAuth, isAdmin, canAccessLead, EnrollmentForm.erase);
r.post("/tickets/:ticketId/enrollment-form", isAuth, canWriteTicket, EnrollmentForm.sendFromTicket);
r.get("/lead-stages", isAuth, cached(), Lead.stages.index);
r.post("/lead-stages", isAuth, isManager, Lead.stages.store);
r.put("/lead-stages/:id", isAuth, isManager, Lead.stages.update);
r.delete("/lead-stages/:id", isAuth, isManager, Lead.stages.remove);
r.get("/course-materials", isAuth, Materials.index);
r.get("/courses/:id/materials", isAuth, Materials.list);
r.put("/courses/:id/active", isAuth, isManager, Materials.setActive);
r.put("/courses/:id/aliases", isAuth, isManager, Materials.setAliases);
r.post("/courses/:id/materials", isAuth, isManager, materialUpload.single("file"), Materials.upload);
r.get("/course-materials/:id/file", isAuth, Materials.file);
r.put("/course-materials/:id/confirm", isAuth, isManager, Materials.confirm);
r.delete("/course-materials/:id", isAuth, isManager, Materials.discard);
r.post("/course-materials/:id/send", isAuth, Materials.send);
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
r.post("/leads/:id/relation", isAuth, canAccessLead, Lead.classify);
r.get("/leads/:id/activities", isAuth, canAccessLead, Lead.activities);
// the academic and curricular analyses of the person, for their record
r.get("/leads/:id/analyses", isAuth, canAccessLead, AnalysisCtl.leadAnalyses);
r.post("/leads/:id/activities", isAuth, canAccessLead, Lead.addNote);
r.get("/leads/:id/tasks", isAuth, canAccessLead, Lead.leadTasks);
r.post("/leads/:id/tasks", isAuth, canAccessLead, Lead.addTask);
r.post("/leads/:id/open-ticket", isAuth, canAccessLead, Lead.openTicket);
// the notification center (the bell): each person reads and marks only their own notices
r.get("/notifications", isAuth, Notifications.index);
r.get("/notifications/count", isAuth, Notifications.count);
r.put("/notifications/read-all", isAuth, Notifications.readAll);
r.put("/notifications/:id/read", isAuth, Notifications.read);
r.get("/lead-tasks", isAuth, Lead.tasksIndex);
// the numbers of the tabs and of the menu badge (the same filters as the list)
r.get("/lead-tasks/counts", isAuth, Lead.tasksCounts);
r.post("/lead-tasks/release-unreachable", isAuth, isManager, Lead.releaseUnreachable);
r.get("/onboarding", isAuth, Lead.onboardingList);
r.get("/onboarding/rules", isAuth, Lead.onboardingRules);
// the audit of the tutoring (pending cases, protocols): only the administration and the academic coordination, never the tutor
r.get("/tutoria/issues", isAuth, TutoringIssue.academicManagement, TutoringIssue.index);
r.get("/tutoria/issues/count", isAuth, TutoringIssue.academicManagement, TutoringIssue.count);
r.post("/tutoria/issues", isAuth, TutoringIssue.academicManagement, TutoringIssue.store);
r.put("/tutoria/issues/:id", isAuth, TutoringIssue.academicManagement, TutoringIssue.update);
r.get("/tutoria/audit/settings", isAuth, TutoringIssue.academicManagement, TutoringIssue.settings);
r.put("/tutoria/audit/settings", isAuth, TutoringIssue.academicManagement, TutoringIssue.saveSettings);
r.post("/tutoria/audit/run", isAuth, TutoringIssue.academicManagement, TutoringIssue.runNow);
// the tutor's protocols: number and subject of a case opened in the institution's system, told to the student and kept in the history
r.get("/tutoria/protocols", isAuth, TutoringIssue.tutorSide, TutoringIssue.myProtocols);
r.post("/tutoria/protocols", isAuth, TutoringIssue.tutorSide, TutoringIssue.registerProtocol);
r.post("/tutoria/protocols/:id/resolve", isAuth, TutoringIssue.tutorSide, TutoringIssue.resolveProtocol);
r.get("/tickets/:ticketId/protocols", isAuth, canReadTicket, TutoringIssue.tutorSide, TutoringIssue.ticketProtocols);
r.get("/tutoria/students", isAuth, Tutoria.students);
r.get("/tutoria/panel", isAuth, Tutoria.panel);
r.post("/tutoria/students/import", isAuth, Tutoria.importStudents);
// Avisos da tutoria: only the tutor (their own students), the coordination and the admin
const tutoriaStaff = (req: any, _res: any, next: any) => {
  if (!["admin", "coordenacao", "tutor"].includes(roleOf(req.user || {}))) throw new AppError("ERR_NO_PERMISSION", 403);
  next();
};
r.post("/tutoria/notices/preview", isAuth, tutoriaStaff, Tutoria.noticePreview);
r.post("/tutoria/notices", isAuth, tutoriaStaff, Tutoria.noticeSend);
// the quota of sends of the month: each person sees theirs and asks the management for more; the management decides and follows
// what each person sent and spent (Meta + AI)
r.get("/send-quota/me", isAuth, campaignStaff, SendReleases.myQuota);
r.post("/send-releases", isAuth, campaignStaff, rateLimit({ windowMs: 60 * 60 * 1000, max: 10, key: req => `send-release:${req.user.id}` }), SendReleases.requestRelease);
r.get("/send-releases", isAuth, isManager, SendReleases.listReleases);
r.put("/send-releases/:id", isAuth, isManager, SendReleases.decideRelease);
r.get("/operations/costs-by-user", isAuth, isManager, SendReleases.costsByUser);
r.get("/operations/costs-by-user/:userId/sends", isAuth, isManager, SendReleases.sendsOfUser);
r.get("/meta/costs", isAuth, isManager, MetaCosts.show);
// the templates of the official WhatsApp account: list with status, create one (Utility only) and send the recommended pack
r.get("/meta/templates", isAuth, isManager, MetaTemplates.index);
r.get("/system/readiness", isAuth, isManager, async (_req, res) => {
  const { readiness } = await import("../services/SystemServices/Readiness");
  return res.json({ items: await readiness() });
});
// takes out of the funnel the affiliates that entered as leads when they wrote (never a student or a lead with a paid charge)
r.post("/system/affiliate-leads/clean", isAuth, isManager, async (req, res) => {
  const { affiliateLeads } = await import("../services/SystemServices/Readiness");
  const { getIO } = await import("../libs/socket");
  const { logger } = await import("../utils/logger");
  const leads = await affiliateLeads();
  // out of the funnel and of every number, like the history (nothing is deleted: tasks, proposals and conversations stay)
  const { addActivity } = await import("../services/CrmServices/LeadCore");
  for (const lead of leads) {
    // eslint-disable-next-line no-await-in-loop
    await lead.update({ isHistorical: true } as any);
    // eslint-disable-next-line no-await-in-loop
    await addActivity(lead.id, Number(req.user.id), "system", "É afiliado(a), não interessado em estudar: saiu do funil e das estatísticas.").catch(() => undefined);
    getIO().emit("lead", { action: "delete", leadId: lead.id });
  }
  logger.warn(`Afiliados tirados do funil por ${req.user.id}: ${leads.map(l => `#${l.id}`).join(", ") || "nenhum"}`);
  return res.json({ removed: leads.length });
});
r.post("/meta/templates", isAuth, isManager, MetaTemplates.store);
r.post("/meta/templates/pack", isAuth, isManager, MetaTemplates.pack);
r.delete("/meta/templates/:name", isAuth, isManager, MetaTemplates.remove);
r.post("/tutoria/students/:leadId/conversation", isAuth, Tutoria.openConversation);
r.put("/leads/:id/onboarding/access", isAuth, canAccessOnboarding, Lead.onboardingAccessSave);
r.post("/leads/:id/onboarding/access/send", isAuth, canAccessOnboarding, Lead.onboardingAccessSend);
r.get("/onboarding/pending", isAuth, Lead.onboardingPending);
r.get("/onboarding/stats", isAuth, Lead.onboardingStats);
r.put("/leads/:id/onboarding/checklist", isAuth, canAccessOnboarding, Lead.onboardingChecklist);
// the print of the enrollment: read (the RGM fills the field) before confirming, and seen later
r.post("/leads/:id/enrollment-proof", isAuth, canAccessLead, materialUpload.single("file"), Enrollment.uploadProof);
r.get("/leads/:id/enrollment-proof/:proofId/file", isAuth, canAccessLead, Enrollment.proofFile);
r.post("/leads/:id/enroll", isAuth, canAccessLead, Lead.enroll);
r.get("/leads/:id/enrollments", isAuth, canAccessLead, Lead.enrollments);
r.post("/leads/:id/onboarding", isAuth, canAccessOnboarding, Lead.onboarding);
r.put("/leads/:id/onboarding", isAuth, canAccessOnboarding, Lead.editOnboarding);
r.put("/leads/:id/tasks/:taskId", isAuth, canAccessLead, Lead.updateTask);
r.post("/leads/:id/tasks/:taskId/toggle", isAuth, canAccessLead, Lead.completeTask);
// conclude or reopen with the choice said (done: true | false): never flips a task the system closed a moment ago
r.put("/leads/:id/tasks/:taskId/done", isAuth, canAccessLead, Lead.setTaskDone);
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
r.get("/institutions", isAuth, Institutions.index);
r.post("/institutions", isAuth, isManager, Institutions.store);
r.put("/institutions/:id", isAuth, isManager, Institutions.update);
r.delete("/institutions/:id", isAuth, isManager, Institutions.remove);
r.get("/proposal-templates", isAuth, Proposal.templates.index);
r.post("/proposal-templates", isAuth, isManager, Proposal.templates.store);
r.put("/proposal-templates/:id", isAuth, isManager, Proposal.templates.update);
r.delete("/proposal-templates/:id", isAuth, isManager, Proposal.templates.remove);
r.post("/courses/import", isAuth, isManager, Lead.importCourses);
r.post("/courses/load-default", isAuth, isManager, Lead.loadDefaultCourses);

// ----------------------------------------------------- enrollment payments (Efí)
r.get("/payments/efi/settings", isAuth, isSystemAdmin, Payment.getSettings);
r.put("/payments/efi/settings", isAuth, isSystemAdmin, Payment.putSettings);
r.post("/payments/efi/certificate", isAuth, isSystemAdmin, certUpload.single("certificate"), Payment.uploadCertificate);
r.post("/payments/efi/test", isAuth, isSystemAdmin, Payment.testConnection);
r.post("/payments/efi/webhook", isAuth, isSystemAdmin, Payment.registerWebhook);
r.get("/payments/efi/wallets", isAuth, isSystemAdmin, Payment.listWallets);
r.put("/payments/efi/wallets/:userId", isAuth, isSystemAdmin, Payment.saveUserWallet);
r.delete("/payments/efi/wallets/:userId", isAuth, isSystemAdmin, Payment.clearUserWallet);
r.get("/me/efi", isAuth, Payment.myEfi);
r.put("/me/efi", isAuth, Payment.saveMyEfi);
r.delete("/me/efi", isAuth, Payment.clearMyEfi);
// commissions of the enrollment fee: each person sees their own, administration and coordination see everyone's
// team enrollment goals (administration and coordination)
// the whole team follows the polos; only managers change the numbers
r.get("/goals/semesters", isAuth, Goal.semesters);
r.get("/goals/polos", isAuth, Goal.poloBoard);
r.get("/goals/calendar", isAuth, isManager, Goal.calendar);
r.put("/goals/:id/polos", isAuth, isManager, Goal.updatePolos);
r.put("/goals/:id/polos/:poloId", isAuth, isManager, Goal.updatePolo);
r.post("/goals/:id/polos/import", isAuth, isManager, Goal.importPoloGoals);
// the goals of the consultants are read by the whole team (the menu Metas); only the management changes them
r.get("/goals", isAuth, Goal.index);
r.post("/goals", isAuth, isManager, Goal.store);
r.put("/goals/:id", isAuth, isManager, Goal.update);
r.delete("/goals/:id", isAuth, isManager, Goal.remove);
r.post("/goals/:id/repeat", isAuth, isManager, Goal.repeat);
// the end of a goal postponed, with the reason, and its history
r.post("/goals/:id/postpone", isAuth, isManager, Enrollment.postponeGoal);
r.get("/goals/:id/changes", isAuth, isManager, Enrollment.goalChanges);
// Matrículas realizadas (management): every enrollment of the period, its print and whether it fell inside the goal
r.get("/enrollments", isAuth, isManager, Enrollment.index);
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
