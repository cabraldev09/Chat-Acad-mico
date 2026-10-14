import fs from "fs";
import path from "path";
import { Request, Response } from "express";
import { Op } from "sequelize";

import AppError from "../errors/AppError";
import Affiliate from "../models/Affiliate";
import AffiliateAudience from "../models/AffiliateAudience";
import AffiliateCampaign from "../models/AffiliateCampaign";
import AffiliateMaterial from "../models/AffiliateMaterial";
import Course from "../models/Course";
import { AFFILIATE_DIR, removeAffiliateFile } from "../config/affiliateUpload";
import { mimeFromName } from "../helpers/MimeFromName";
import { isAdminReq } from "../middleware/scope";
import { withAffiliateScope } from "../helpers/Affiliates";

const KINDS = ["banner", "copy", "video", "course_info", "course_list", "campaign", "other"];
const me = (req: Request) => Number(req.user.id);
const text = (v: any, n: number): string | null => {
  const t = v === undefined || v === null ? "" : String(v).trim();
  return t ? t.slice(0, n) : null;
};
const ids = (v: any): number[] => {
  let arr: any = v;
  if (typeof v === "string") {
    try { arr = JSON.parse(v); } catch (e) { arr = v.split(","); }
  }
  return (Array.isArray(arr) ? arr : []).map(Number).filter(n => Number.isInteger(n) && n > 0);
};
const bool = (v: any, d = true): boolean => (v === undefined || v === "" ? d : !["false", "0", "off", "não"].includes(String(v)));
// the material never carries prices; the admin is told what to fix
const PRICE = /R\$\s*\d|\d+\s*reais|\d+\s*%\s*de\s*desconto/i;

// ---------------------------------------------------------------- who sees what

interface Audience { ownerIds: number[]; affiliateIds: number[]; }

const audienceOf = async (type: "material" | "campaign", targetIds: number[]): Promise<Map<number, Audience>> => {
  const map = new Map<number, Audience>();
  targetIds.forEach(id => map.set(id, { ownerIds: [], affiliateIds: [] }));
  if (!targetIds.length) return map;
  const rows = await AffiliateAudience.findAll({ where: { targetType: type, targetId: { [Op.in]: targetIds } } });
  rows.forEach(r => {
    const a = map.get(r.targetId)!;
    if (r.ownerId) a.ownerIds.push(r.ownerId);
    if (r.affiliateId) a.affiliateIds.push(r.affiliateId);
  });
  return map;
};

const setAudience = async (type: "material" | "campaign", targetId: number, ownerIds: number[], affiliateIds: number[]) => {
  await AffiliateAudience.destroy({ where: { targetType: type, targetId } });
  const rows = [
    ...ownerIds.map(ownerId => ({ targetType: type, targetId, ownerId })),
    ...affiliateIds.map(affiliateId => ({ targetType: type, targetId, affiliateId }))
  ];
  if (rows.length) await AffiliateAudience.bulkCreate(rows as any);
};

// what a consultant / coordinator can use: everything released to them or to one of their affiliates
const visibleTo = async (req: Request, type: "material" | "campaign", all: Array<{ id: number; audience: string }>) => {
  if (isAdminReq(req)) return all.map(x => x.id);
  const mine = (await Affiliate.findAll({ where: await withAffiliateScope(req, {}), attributes: ["id"] })).map(a => a.id);
  const rows = await AffiliateAudience.findAll({
    where: { targetType: type, [Op.or]: [{ ownerId: me(req) }, { affiliateId: { [Op.in]: mine } }] },
    attributes: ["targetId"]
  });
  const released = new Set(rows.map(r => r.targetId));
  return all.filter(x => x.audience === "all" || released.has(x.id)).map(x => x.id);
};

// ---------------------------------------------------------------- materials

const presentMaterial = (m: AffiliateMaterial, aud?: Audience) => ({
  ...m.toJSON(),
  hasFile: !!m.fileName,
  ownerIds: aud?.ownerIds || [],
  affiliateIds: aud?.affiliateIds || []
});

export const listMaterials = async (req: Request, res: Response): Promise<Response> => {
  const all = await AffiliateMaterial.findAll({
    include: [{ model: Course, as: "course", attributes: ["id", "name"] }],
    order: [["sortOrder", "ASC"], ["id", "DESC"]]
  });
  const visible = new Set(await visibleTo(req, "material", all));
  const rows = all.filter(m => visible.has(m.id) && (isAdminReq(req) || m.active));
  const aud = await audienceOf("material", rows.map(r => r.id));
  return res.json(rows.map(r => presentMaterial(r, aud.get(r.id))));
};

const materialData = (b: any, req: Request, isNew: boolean) => {
  const data: any = {};
  if (b.title !== undefined || isNew) {
    data.title = text(b.title, 140);
    if (!data.title) throw new AppError("ERR_FIELD_REQUIRED_title");
  }
  if (b.kind !== undefined) data.kind = KINDS.includes(b.kind) ? b.kind : "other";
  if (b.description !== undefined) data.description = text(b.description, 1000);
  if (b.copyText !== undefined) data.copyText = text(b.copyText, 6000);
  if (b.externalUrl !== undefined) {
    const url = text(b.externalUrl, 600);
    if (url && !/^https?:\/\//i.test(url)) throw new AppError("ERR_AFFILIATE_BAD_URL");
    data.externalUrl = url;
  }
  if (b.courseId !== undefined) data.courseId = b.courseId ? Number(b.courseId) : null;
  if (b.campaignId !== undefined) data.campaignId = b.campaignId ? Number(b.campaignId) : null;
  if (b.audience !== undefined) data.audience = b.audience === "all" ? "all" : "restricted";
  if (b.active !== undefined) data.active = bool(b.active);
  if (b.sortOrder !== undefined) data.sortOrder = Number(b.sortOrder) || 0;
  const checked = [data.title, data.description, data.copyText].filter(Boolean).join(" ");
  if (PRICE.test(checked)) throw new AppError("ERR_AFFILIATE_MATERIAL_HAS_PRICE");
  if (isNew) data.createdBy = me(req);
  return data;
};

export const createMaterial = async (req: Request, res: Response): Promise<Response> => {
  const file = (req as any).file as Express.Multer.File | undefined;
  try {
    const data = materialData(req.body, req, true);
    if (file) Object.assign(data, { fileName: file.filename, originalName: file.originalname, mimeType: mimeFromName(file.originalname), fileSize: file.size });
    if (!file && !data.externalUrl && !data.copyText) throw new AppError("ERR_AFFILIATE_MATERIAL_EMPTY");
    const m = await AffiliateMaterial.create(data);
    await setAudience("material", m.id, ids(req.body.ownerIds), ids(req.body.affiliateIds));
    const aud = await audienceOf("material", [m.id]);
    return res.status(201).json(presentMaterial(m, aud.get(m.id)));
  } catch (err) {
    if (file) removeAffiliateFile(file.filename);
    throw err;
  }
};

export const updateMaterial = async (req: Request, res: Response): Promise<Response> => {
  const m = await AffiliateMaterial.findByPk(req.params.id);
  const file = (req as any).file as Express.Multer.File | undefined;
  try {
    if (!m) throw new AppError("ERR_NOT_FOUND", 404);
    const data = materialData(req.body, req, false);
    let old: string | null = null;
    if (file) {
      old = m.fileName;
      Object.assign(data, { fileName: file.filename, originalName: file.originalname, mimeType: mimeFromName(file.originalname), fileSize: file.size });
    } else if (req.body.removeFile === "true" && m.fileName) {
      old = m.fileName;
      Object.assign(data, { fileName: null, originalName: null, mimeType: null, fileSize: null });
    }
    await m.update(data);
    removeAffiliateFile(old);
    if (req.body.ownerIds !== undefined || req.body.affiliateIds !== undefined) {
      await setAudience("material", m.id, ids(req.body.ownerIds), ids(req.body.affiliateIds));
    }
    const aud = await audienceOf("material", [m.id]);
    return res.json(presentMaterial(m, aud.get(m.id)));
  } catch (err) {
    if (file) removeAffiliateFile(file.filename);
    throw err;
  }
};

export const removeMaterial = async (req: Request, res: Response): Promise<Response> => {
  const m = await AffiliateMaterial.findByPk(req.params.id);
  if (!m) throw new AppError("ERR_NOT_FOUND", 404);
  removeAffiliateFile(m.fileName);
  await AffiliateAudience.destroy({ where: { targetType: "material", targetId: m.id } });
  await m.destroy();
  return res.json({ message: "deleted" });
};

// internal download / preview for the team (the affiliate uses the portal endpoint)
export const materialFile = async (req: Request, res: Response): Promise<void> => {
  const m = await AffiliateMaterial.findByPk(req.params.id);
  if (!m || !m.fileName) throw new AppError("ERR_NOT_FOUND", 404);
  const all = [{ id: m.id, audience: m.audience }];
  if (!(await visibleTo(req, "material", all)).length) throw new AppError("ERR_NO_PERMISSION", 403);
  sendFile(res, m, false);
};

export const sendFile = (res: Response, m: AffiliateMaterial, count: boolean): void => {
  const full = path.join(AFFILIATE_DIR, path.basename(m.fileName));
  if (!fs.existsSync(full)) throw new AppError("ERR_NOT_FOUND", 404);
  const mime = m.mimeType || mimeFromName(m.originalName || m.fileName);
  res.setHeader("Content-Type", mime);
  // images, video and PDF open in the page (preview); the rest is downloaded
  const inline = /^(image\/(png|jpe?g|webp|gif)|video\/|application\/pdf)/.test(mime);
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(m.originalName || m.fileName)}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=300");
  if (count) AffiliateMaterial.increment("downloads", { where: { id: m.id } }).catch(() => undefined);
  // sendFile answers Range requests, which videos need to play and seek
  res.sendFile(full);
};

// a consultant (or coordinator) releases something they can already use to their own affiliates
export const releaseTo = (type: "material" | "campaign") => async (req: Request, res: Response): Promise<Response> => {
  const Model: any = type === "material" ? AffiliateMaterial : AffiliateCampaign;
  const item = await Model.findByPk(req.params.id);
  if (!item) throw new AppError("ERR_NOT_FOUND", 404);
  if (!(await visibleTo(req, type, [item])).length) throw new AppError("ERR_NO_PERMISSION", 403);
  const mineAll = new Set((await Affiliate.findAll({ where: await withAffiliateScope(req, {}), attributes: ["id"] })).map(a => a.id));
  const wanted = ids(req.body.affiliateIds).filter(id => mineAll.has(id));
  const current = await AffiliateAudience.findAll({ where: { targetType: type, targetId: item.id, affiliateId: { [Op.in]: [...mineAll] } } });
  // replace only the rows of the affiliates this person manages
  await AffiliateAudience.destroy({ where: { id: { [Op.in]: current.map(c => c.id) } } });
  if (wanted.length) await AffiliateAudience.bulkCreate(wanted.map(affiliateId => ({ targetType: type, targetId: item.id, affiliateId })) as any);
  return res.json({ released: wanted });
};

// ---------------------------------------------------------------- campaigns

const presentCampaign = (c: AffiliateCampaign, aud?: Audience) => ({
  ...c.toJSON(),
  hasCover: !!c.coverFile,
  ownerIds: aud?.ownerIds || [],
  affiliateIds: aud?.affiliateIds || []
});

export const listCampaigns = async (req: Request, res: Response): Promise<Response> => {
  const all = await AffiliateCampaign.findAll({ order: [["startsAt", "DESC"], ["id", "DESC"]] });
  const visible = new Set(await visibleTo(req, "campaign", all));
  const rows = all.filter(c => visible.has(c.id) && (isAdminReq(req) || c.active));
  const aud = await audienceOf("campaign", rows.map(r => r.id));
  return res.json(rows.map(r => presentCampaign(r, aud.get(r.id))));
};

const campaignData = (b: any, req: Request, isNew: boolean) => {
  const data: any = {};
  if (b.title !== undefined || isNew) {
    data.title = text(b.title, 140);
    if (!data.title) throw new AppError("ERR_FIELD_REQUIRED_title");
  }
  if (b.description !== undefined) data.description = text(b.description, 4000);
  const date = (v: any) => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new AppError("ERR_INVALID_DATE");
    return d;
  };
  if (b.startsAt !== undefined) data.startsAt = date(b.startsAt);
  if (b.endsAt !== undefined) data.endsAt = date(b.endsAt);
  if (data.startsAt && data.endsAt && data.endsAt < data.startsAt) throw new AppError("ERR_INVALID_DATE");
  if (b.audience !== undefined) data.audience = b.audience === "all" ? "all" : "restricted";
  if (b.bonusValue !== undefined) {
    const n = b.bonusValue === "" || b.bonusValue === null ? null : Number(String(b.bonusValue).replace(",", "."));
    data.bonusValue = n === null || Number.isNaN(n) || n < 0 ? null : n;
  }
  if (b.active !== undefined) data.active = bool(b.active);
  if (isNew) data.createdBy = me(req);
  return data;
};

export const createCampaign = async (req: Request, res: Response): Promise<Response> => {
  const file = (req as any).file as Express.Multer.File | undefined;
  try {
    const data = campaignData(req.body, req, true);
    if (file) data.coverFile = file.filename;
    const c = await AffiliateCampaign.create(data);
    await setAudience("campaign", c.id, ids(req.body.ownerIds), ids(req.body.affiliateIds));
    const aud = await audienceOf("campaign", [c.id]);
    return res.status(201).json(presentCampaign(c, aud.get(c.id)));
  } catch (err) {
    if (file) removeAffiliateFile(file.filename);
    throw err;
  }
};

export const updateCampaign = async (req: Request, res: Response): Promise<Response> => {
  const c = await AffiliateCampaign.findByPk(req.params.id);
  const file = (req as any).file as Express.Multer.File | undefined;
  try {
    if (!c) throw new AppError("ERR_NOT_FOUND", 404);
    const data = campaignData(req.body, req, false);
    let old: string | null = null;
    if (file) { old = c.coverFile; data.coverFile = file.filename; }
    else if (req.body.removeFile === "true") { old = c.coverFile; data.coverFile = null; }
    await c.update(data);
    removeAffiliateFile(old);
    if (req.body.ownerIds !== undefined || req.body.affiliateIds !== undefined) {
      await setAudience("campaign", c.id, ids(req.body.ownerIds), ids(req.body.affiliateIds));
    }
    const aud = await audienceOf("campaign", [c.id]);
    return res.json(presentCampaign(c, aud.get(c.id)));
  } catch (err) {
    if (file) removeAffiliateFile(file.filename);
    throw err;
  }
};

export const removeCampaign = async (req: Request, res: Response): Promise<Response> => {
  const c = await AffiliateCampaign.findByPk(req.params.id);
  if (!c) throw new AppError("ERR_NOT_FOUND", 404);
  removeAffiliateFile(c.coverFile);
  await AffiliateMaterial.update({ campaignId: null }, { where: { campaignId: c.id } });
  await AffiliateAudience.destroy({ where: { targetType: "campaign", targetId: c.id } });
  await c.destroy();
  return res.json({ message: "deleted" });
};

export const campaignCover = async (req: Request, res: Response): Promise<void> => {
  const c = await AffiliateCampaign.findByPk(req.params.id);
  if (!c || !c.coverFile) throw new AppError("ERR_NOT_FOUND", 404);
  const full = path.join(AFFILIATE_DIR, path.basename(c.coverFile));
  if (!fs.existsSync(full)) throw new AppError("ERR_NOT_FOUND", 404);
  res.setHeader("Content-Type", mimeFromName(c.coverFile));
  res.setHeader("Cache-Control", "private, max-age=300");
  res.sendFile(full);
};
