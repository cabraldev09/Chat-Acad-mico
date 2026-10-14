import express, { NextFunction, Request, Response } from "express";
import { Op } from "sequelize";

import Affiliate from "../models/Affiliate";
import AffiliateBonus from "../models/AffiliateBonus";
import AffiliateCampaign from "../models/AffiliateCampaign";
import AffiliateMaterial from "../models/AffiliateMaterial";
import Course from "../models/Course";
import Lead from "../models/Lead";
import LeadStage from "../models/LeadStage";
import User from "../models/User";
import { getSetting } from "../helpers/AppSettings";
import { inWindow, isVisibleTo, referralUrl, releasedIds } from "../helpers/Affiliates";
import { normalizePhone } from "../helpers/Phone";
import { statsFor } from "../services/AffiliateServices/Stats";
import { upsertLead } from "../services/CrmServices/LeadCore";
import { AFFILIATE_DIR } from "../config/affiliateUpload";
import { sendFile } from "../controllers/AffiliateMaterialController";
import path from "path";
import fs from "fs";
import { mimeFromName } from "../helpers/MimeFromName";

// Public portal of an affiliate: the link itself (an unguessable token) is the access. It never shows prices.
const router = express.Router();

const hits = new Map<string, number[]>();
const throttled = (key: string, max: number, windowMs: number): boolean => {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter(t => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      affiliate?: Affiliate;
    }
  }
}

const loadAffiliate = async (req: Request, res: Response, next: NextFunction) => {
  const token = String(req.params.token || "");
  const aff = token.length >= 32 ? await Affiliate.findOne({ where: { portalToken: token, status: "active" } }) : null;
  // the same answer for "wrong link" and "paused": nothing to learn from outside
  if (!aff) return res.status(404).json({ error: "Link indisponível. Peça um novo ao seu consultor." });
  req.affiliate = aff;
  if (!aff.lastAccessAt || Date.now() - new Date(aff.lastAccessAt).getTime() > 10 * 60 * 1000) {
    aff.update({ lastAccessAt: new Date() }, { silent: true } as any).catch(() => undefined);
  }
  return next();
};

// "Maria da Silva" -> "Maria S." (the affiliate sees progress, not other people's data)
const shortName = (n: string): string => {
  const parts = n.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
};

router.get("/:token", loadAffiliate, async (req: Request, res: Response) => {
  const aff = req.affiliate as Affiliate;

  const [released, mReleased] = await Promise.all([releasedIds("campaign", aff), releasedIds("material", aff)]);
  const campaignRows = await AffiliateCampaign.findAll({ where: { active: true }, order: [["startsAt", "DESC"], ["id", "DESC"]] });
  const campaigns = campaignRows.filter(c => inWindow(c) && isVisibleTo(c, released));
  const campaignIds = new Set(campaigns.map(c => c.id));

  const materialRows = await AffiliateMaterial.findAll({
    where: { active: true },
    include: [{ model: Course, as: "course", attributes: ["id", "name"] }],
    order: [["sortOrder", "ASC"], ["id", "DESC"]]
  });
  const materials = materialRows
    .filter(m => isVisibleTo(m, mReleased))
    // material of a campaign only shows while the campaign runs for this person
    .filter(m => !m.campaignId || campaignIds.has(m.campaignId))
    .map(m => ({
      id: m.id,
      title: m.title,
      kind: m.kind,
      description: m.description,
      copyText: m.copyText,
      externalUrl: m.externalUrl,
      hasFile: !!m.fileName,
      mimeType: m.mimeType,
      fileSize: m.fileSize,
      originalName: m.originalName,
      course: (m as any).course ? { id: (m as any).course.id, name: (m as any).course.name } : null,
      campaignId: m.campaignId,
      updatedAt: m.updatedAt
    }));

  // course list WITHOUT any price: only what an affiliate may repeat
  const courses = await Course.findAll({
    where: { active: true },
    attributes: ["id", "name", "modality", "category", "semesters"],
    order: [["name", "ASC"]]
  });
  const byFormat = new Map<string, any[]>();
  courses.forEach(c => {
    const key = c.modality || "Outros";
    if (!byFormat.has(key)) byFormat.set(key, []);
    byFormat.get(key)!.push({ id: c.id, name: c.name, category: c.category, semesters: c.semesters });
  });

  const stats = (await statsFor([aff.id])).get(aff.id);
  const owner = aff.ownerId ? await User.findByPk(aff.ownerId, { attributes: ["name"] }) : null;
  const referrals = await Lead.findAll({
    where: { affiliateId: aff.id },
    attributes: ["id", "name", "createdAt", "wonAt"],
    include: [{ model: LeadStage, as: "stage", attributes: ["name", "type"] }],
    order: [["createdAt", "DESC"]],
    limit: 50
  });
  const bonusLines = await AffiliateBonus.findAll({
    where: { affiliateId: aff.id, status: { [Op.ne]: "cancelled" } },
    attributes: ["id", "leadId", "amount", "status", "paidAt", "createdAt"],
    order: [["createdAt", "DESC"]],
    limit: 50
  });

  return res.json({
    affiliate: { name: aff.name, firstName: aff.name.split(" ")[0], refCode: aff.refCode, pixKey: !!aff.pixKey },
    owner: owner ? { name: owner.name } : null,
    title: await getSetting("affiliate_portal_title", "Portal do Afiliado"),
    message: await getSetting("affiliate_portal_message", "Tudo o que você precisa para indicar: materiais, cursos e campanhas."),
    referralUrl: referralUrl(aff.refCode),
    stats: stats && {
      referrals: stats.referrals,
      enrolled: stats.enrolled,
      conversion: stats.conversion,
      bonusPending: stats.bonusPending + stats.bonusApproved,
      bonusPaid: stats.bonusPaid
    },
    materials,
    campaigns: campaigns.map(c => ({
      id: c.id, title: c.title, description: c.description, startsAt: c.startsAt, endsAt: c.endsAt,
      hasCover: !!c.coverFile, bonusValue: c.bonusValue === null ? null : Number(c.bonusValue)
    })),
    courses: [...byFormat.entries()].map(([modality, list]) => ({ modality, courses: list })),
    referrals: referrals.map(l => ({
      id: l.id,
      name: shortName(l.name),
      createdAt: l.createdAt,
      status: l.wonAt ? "enrolled" : (l as any).stage?.type === "lost" ? "lost" : "open",
      stage: (l as any).stage?.name || null
    })),
    bonuses: bonusLines.map(b => ({ id: b.id, amount: Number(b.amount), status: b.status, paidAt: b.paidAt, createdAt: b.createdAt }))
  });
});

router.get("/:token/files/:id", loadAffiliate, async (req: Request, res: Response) => {
  const aff = req.affiliate as Affiliate;
  const m = await AffiliateMaterial.findOne({ where: { id: Number(req.params.id) || 0, active: true } });
  if (!m || !m.fileName) return res.status(404).json({ error: "Arquivo indisponível" });
  const released = await releasedIds("material", aff);
  if (!isVisibleTo(m, released)) return res.status(404).json({ error: "Arquivo indisponível" });
  if (m.campaignId) {
    const c = await AffiliateCampaign.findByPk(m.campaignId);
    if (!c || !c.active || !inWindow(c) || !isVisibleTo(c, await releasedIds("campaign", aff))) {
      return res.status(404).json({ error: "Arquivo indisponível" });
    }
  }
  // asking for ?download=1 forces a save dialog even for images
  if (req.query.download === "1") res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(m.originalName || m.fileName)}`);
  sendFile(res, m, req.query.preview !== "1");
  return undefined;
});

router.get("/:token/campaigns/:id/cover", loadAffiliate, async (req: Request, res: Response) => {
  const aff = req.affiliate as Affiliate;
  const c = await AffiliateCampaign.findOne({ where: { id: Number(req.params.id) || 0, active: true } });
  if (!c || !c.coverFile || !isVisibleTo(c, await releasedIds("campaign", aff))) return res.status(404).end();
  const full = path.join(AFFILIATE_DIR, path.basename(c.coverFile));
  if (!fs.existsSync(full)) return res.status(404).end();
  res.setHeader("Content-Type", mimeFromName(c.coverFile));
  res.setHeader("Cache-Control", "private, max-age=300");
  res.sendFile(full);
  return undefined;
});

// the affiliate refers someone from the portal
router.post("/:token/referrals", express.json(), loadAffiliate, async (req: Request, res: Response) => {
  const aff = req.affiliate as Affiliate;
  const b = req.body || {};
  if (b.website) return res.json({ message: "Recebido" }); // honeypot
  if (throttled(`ip:${req.ip}`, 12, 10 * 60 * 1000) || throttled(`aff:${aff.id}`, 40, 24 * 3600 * 1000)) {
    return res.status(429).json({ error: "Muitas indicações em pouco tempo. Tente de novo mais tarde." });
  }
  const name = String(b.name || "").trim().slice(0, 120);
  if (name.length < 2) return res.status(400).json({ error: "Informe o nome de quem você está indicando." });
  if (!normalizePhone(b.phone)) return res.status(400).json({ error: "Informe um WhatsApp válido com DDD." });
  if (b.consent !== true) return res.status(400).json({ error: "Confirme que a pessoa aceita ser contatada." });
  const course = b.courseId ? await Course.findByPk(Number(b.courseId)) : null;
  const { created } = await upsertLead({
    name,
    phone: b.phone,
    courseId: course ? course.id : null,
    modality: course?.modality || undefined,
    source: "Indicação",
    channel: "affiliate",
    notes: b.notes ? String(b.notes).slice(0, 300) : undefined,
    consentAt: new Date(),
    ownerId: aff.ownerId,
    affiliateId: aff.id
  });
  return res.status(created ? 201 : 200).json({
    created,
    message: created
      ? "Indicação enviada! Seu consultor vai entrar em contato."
      : "Essa pessoa já está em atendimento conosco. Obrigado por indicar!"
  });
});

export default router;
