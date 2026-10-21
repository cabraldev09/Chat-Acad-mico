import express, { Request, Response } from "express";

import Course from "../models/Course";
import Affiliate from "../models/Affiliate";
import { getSetting } from "../helpers/AppSettings";
import { recordClick } from "../services/AffiliateServices/Clicks";
import { normalizeEmail, normalizePhone } from "../helpers/Phone";
import { upsertLead } from "../services/CrmServices/LeadCore";
import { notifyReferral } from "../services/AffiliateServices/ReferralNotice";
import { CRM_OPTIONS } from "../services/CrmServices/crmOptions";
import { renderLeadPage, renderUnavailable } from "../helpers/LeadPage";
import { getPublicUrl } from "../helpers/PublicUrl";
import { randomBytes } from "crypto";
import path from "path";
import { makeThrottle } from "../helpers/RateWindow";

// Public lead capture form (embed with an <iframe>) and its JSON endpoint.
const router = express.Router();

const DEFAULT_TITLE = "Quero conhecer a instituição";
// 8 submissions / 10 min per IP
const throttled = makeThrottle(8, 600000);

// The page runs only its own style and script (the nonce of this request): nothing a person typed can run in it. The form of the site may be framed by
// other sites; the link of an affiliate may not. Neither is indexed by search engines.
const pageHeaders = (res: Response, nonce: string, embeddable: boolean): void => {
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors ${embeddable ? "*" : "'none'"}`
  );
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
};

const unavailable = async (res: Response, text: string, embeddable: boolean): Promise<Response> => {
  const nonce = randomBytes(16).toString("base64");
  pageHeaders(res, nonce, embeddable);
  return res.status(404).type("html").send(renderUnavailable(nonce, await getSetting("crm_form_color", "#0B4279"), text));
};

const pageOf = async (res: Response, opts: { referrer?: string }, embeddable: boolean): Promise<Response> => {
  const [title, color, courses, privacyUrl] = await Promise.all([
    getSetting("crm_form_title", DEFAULT_TITLE),
    getSetting("crm_form_color", "#0B4279"),
    Course.findAll({ where: { active: true }, order: [["name", "ASC"]] }),
    getSetting("crm_form_privacy_url", "")
  ]);
  const nonce = randomBytes(16).toString("base64");
  pageHeaders(res, nonce, embeddable);
  return res.type("html").send(renderLeadPage({ title, color, courses, referrer: opts.referrer, customTitle: title !== DEFAULT_TITLE, nonce, baseUrl: getPublicUrl(), privacyUrl }));
};

const validToken = async (token: string): Promise<boolean> => {
  const stored = await getSetting("crm_form_token", "");
  return !!stored && stored === token;
};

// the photo of the page (before "/:token", or it would be taken for a form)
router.get("/_aluna.webp", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "public, max-age=604800, immutable");
  res.type("image/webp").sendFile(path.join(__dirname, "..", "..", "assets", "brand", "aluna.webp"));
});

// the brand of the page: the colored logo (light screens), the light one (dark screens) and the image a shared link shows
const asset = (file: string, type: string) => (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "public, max-age=604800, immutable");
  res.type(type).sendFile(path.join(__dirname, "..", "..", "assets", ...file.split("/")));
};
router.get("/_logo.svg", asset("brand/logo-color.svg", "image/svg+xml"));
router.get("/_logo-light.png", asset("mail/logo.png", "image/png"));
router.get("/_og.jpg", asset("brand/og.jpg", "image/jpeg"));

router.get("/:token", async (req: Request, res: Response) => {
  if (!(await validToken(req.params.token))) return unavailable(res, "Este formulário não está disponível no momento.", true);
  return pageOf(res, {}, true);
});

// validates the submission and creates (or enriches) the lead; the affiliate, when there is one, owns the referral
const submit = async (req: Request, res: Response, affiliate: Affiliate | null) => {
  if (throttled(req.ip || "")) return res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos." });
  const b = req.body || {};
  if (b.website) return res.json({ message: "Recebido" }); // honeypot: pretend success
  const name = String(b.name || "").trim();
  if (name.length < 2) return res.status(400).json({ error: "Informe seu nome." });
  if (!normalizePhone(b.phone)) return res.status(400).json({ error: "Informe um WhatsApp válido com DDD." });
  if (b.email && !normalizeEmail(b.email)) return res.status(400).json({ error: "E-mail inválido." });
  if (b.consent !== true) return res.status(400).json({ error: "É preciso aceitar o contato para continuar." });

  const course = b.courseId ? await Course.findByPk(Number(b.courseId)) : null;
  const clip = (v: any, n = 120) => (v ? String(v).slice(0, n) : undefined);
  const { lead, created } = await upsertLead({
    name: clip(name, 120),
    phone: b.phone,
    email: b.email,
    city: clip(b.city, 80),
    courseId: course ? course.id : null,
    modality: CRM_OPTIONS.modalities.includes(b.modality) ? b.modality : undefined,
    admissionType: CRM_OPTIONS.admissionTypes.includes(b.admissionType) ? b.admissionType : undefined,
    source: affiliate ? "Indicação" : "Site / formulário",
    channel: affiliate ? "affiliate" : "form",
    utmSource: clip(b.utm_source),
    utmMedium: clip(b.utm_medium),
    utmCampaign: clip(b.utm_campaign),
    consentAt: new Date(),
    ...(affiliate ? { affiliateId: affiliate.id, ownerId: affiliate.ownerId } : {})
  });
  if (affiliate) notifyReferral(affiliate, lead, created);
  return res.json({ message: await getSetting("crm_form_thanks", "Recebemos seus dados! Em breve um consultor entra em contato.") });
};

router.post("/:token/submit", express.json(), async (req: Request, res: Response) => {
  if (!(await validToken(req.params.token))) return res.status(404).json({ error: "Formulário indisponível" });
  return submit(req, res, null);
});

// Referral link of an affiliate (/r/CODE): the same form, and the lead is credited to the affiliate
export const referralRouter = express.Router();

const activeAffiliate = (code: string) =>
  Affiliate.findOne({ where: { refCode: String(code || "").toUpperCase(), status: "active" } });

referralRouter.get("/:code", async (req: Request, res: Response) => {
  const aff = await activeAffiliate(req.params.code);
  // a wrong code and a paused affiliate get the same answer (nobody can tell which codes exist)
  if (!aff) return unavailable(res, "Este link não está mais disponível. Peça um novo link a quem indicou você.", false);
  recordClick(req, aff.id);
  return pageOf(res, { referrer: aff.name.split(" ")[0] }, false);
});

referralRouter.post("/:code/submit", express.json(), async (req: Request, res: Response) => {
  const aff = await activeAffiliate(req.params.code);
  if (!aff) return res.status(404).json({ error: "Link indisponível" });
  return submit(req, res, aff);
});

export default router;
