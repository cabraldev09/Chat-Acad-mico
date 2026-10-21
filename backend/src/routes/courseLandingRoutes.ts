import express, { Request, Response } from "express";

import { getSetting } from "../helpers/AppSettings";
import rateLimit from "../middleware/rateLimit";
import { normalizeEmail, normalizePhone } from "../helpers/Phone";
import Course from "../models/Course";
import { upsertLead } from "../services/CrmServices/LeadCore";
import Affiliate from "../models/Affiliate";
import { recordClick } from "../services/AffiliateServices/Clicks";
import { notifyReferral } from "../services/AffiliateServices/ReferralNotice";

// The public page of one course, for the site and for the ads: the course (never its price) and a form that opens a lead
// already tied to it, with the origin (UTM) of the visit. Public: no login.
const router = express.Router();

// "12-pedagogia" -> the course 12
const courseOf = async (slug: string): Promise<Course | null> => {
  const m = String(slug || "").match(/^(\d+)(?:-.*)?$/);
  if (!m) return null;
  const course = await Course.findByPk(Number(m[1]));
  return course && course.active ? course : null;
};

// the affiliate whose link brought the person here (?ref=CODE): only an active one counts, and a wrong code is ignored without saying so
const affiliateOf = async (code: unknown): Promise<Affiliate | null> => {
  const ref = String(code || "").trim().toUpperCase();
  return /^[A-Z0-9]{4,12}$/.test(ref) ? Affiliate.findOne({ where: { refCode: ref, status: "active" } }) : null;
};

router.get("/:slug", async (req: Request, res: Response) => {
  const course = await courseOf(req.params.slug);
  if (!course) return res.status(404).json({ error: "Curso indisponível" });
  // the visit of an affiliate's link is counted like the one of the page /r/CODE
  if (req.query.ref) {
    const aff = await affiliateOf(req.query.ref);
    if (aff) recordClick(req, aff.id);
  }
  return res.json({
    course: { id: course.id, name: course.name, modality: course.modality, category: course.category, semesters: course.semesters },
    color: await getSetting("crm_form_color", "#0B4279"),
    thanks: await getSetting("crm_form_thanks", "Recebemos seus dados! Em breve um consultor entra em contato.")
  });
});

const submitLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });

router.post("/:slug/lead", submitLimiter, express.json(), async (req: Request, res: Response) => {
  const course = await courseOf(req.params.slug);
  if (!course) return res.status(404).json({ error: "Curso indisponível" });
  const b = req.body || {};
  // honeypot: a robot fills the hidden field; it is told everything went well
  if (b.website) return res.json({ message: "Recebido" });
  const name = String(b.name || "").trim();
  if (name.length < 2) return res.status(400).json({ error: "Informe seu nome." });
  if (!normalizePhone(b.phone)) return res.status(400).json({ error: "Informe um WhatsApp válido com DDD." });
  if (b.email && !normalizeEmail(b.email)) return res.status(400).json({ error: "E-mail inválido." });
  if (b.consent !== true) return res.status(400).json({ error: "É preciso aceitar o contato para continuar." });
  const clip = (v: any, n = 120) => (v ? String(v).slice(0, n) : undefined);
  const affiliate = await affiliateOf(b.ref);
  const { lead, created } = await upsertLead({
    name: clip(name, 120),
    phone: b.phone,
    email: b.email,
    courseId: course.id,
    modality: course.modality || undefined,
    source: affiliate ? "Indicação" : "Site / formulário",
    channel: affiliate ? "affiliate" : "form",
    ...(affiliate ? { affiliateId: affiliate.id, ownerId: affiliate.ownerId } : {}),
    utmSource: clip(b.utm_source),
    utmMedium: clip(b.utm_medium),
    utmCampaign: clip(b.utm_campaign),
    notes: `Página do curso: ${course.name}`,
    consentAt: new Date()
  });
  if (affiliate) notifyReferral(affiliate, lead, created);
  return res.json({ message: await getSetting("crm_form_thanks", "Recebemos seus dados! Em breve um consultor entra em contato.") });
});

export default router;
