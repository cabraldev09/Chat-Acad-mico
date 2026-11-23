import { Request, Response } from "express";
import path from "path";
import { Op } from "sequelize";

import AppError from "../errors/AppError";
import { isEmail } from "../helpers/Email";
import { forgetInstitutions } from "../helpers/Institution";
import Institution from "../models/Institution";
import Whatsapp from "../models/Whatsapp";
import makeCrud from "./crudFactory";

// The universities of the group (CRM → Configurações → Universidades). One is the default: everything that does not say another one
// belongs to it, so there is always exactly one default and it cannot be removed.

const clean = (v: unknown, max: number): string | null => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
};

// "Universidade Cruzeiro do Sul" -> "universidade-cruzeiro-do-sul"
export const slugify = (v: unknown): string =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const crud = makeCrud(Institution, {
  event: "institution",
  fields: ["name", "cnpj", "logoFile", "active", "shortName", "slug", "brandColor", "site", "mailFromName", "mailFrom", "footer", "isDefault"],
  required: ["name"],
  order: [["isDefault", "DESC"], ["name", "ASC"]],
  beforeSave: async (data, req, existing) => {
    if (data.logoFile) data.logoFile = path.basename(String(data.logoFile));
    if (data.name !== undefined) {
      data.name = clean(data.name, 120);
      if (!data.name) throw new AppError("ERR_FIELD_REQUIRED_name");
    }
    ["shortName", "mailFromName"].forEach(k => { if (data[k] !== undefined) data[k] = clean(data[k], 80); });
    if (data.site !== undefined) data.site = clean(data.site, 200);
    if (data.footer !== undefined) data.footer = String(data.footer ?? "").trim().slice(0, 500) || null;
    if (data.brandColor !== undefined) {
      data.brandColor = clean(String(data.brandColor ?? "").replace(/^#$/, ""), 7);
      if (data.brandColor && !/^#[0-9a-fA-F]{6}$/.test(data.brandColor)) throw new AppError("ERR_INSTITUTION_COLOR");
    }
    if (data.mailFrom !== undefined) {
      data.mailFrom = clean(data.mailFrom, 160);
      if (data.mailFrom && !isEmail(data.mailFrom)) throw new AppError("ERR_INVALID_EMAIL");
    }
    // the address of its public pages: typed, else made from the short name or the name; never repeated
    if (data.slug !== undefined || !existing?.slug) {
      const slug = slugify(data.slug || data.shortName || existing?.shortName || data.name || existing?.name);
      if (!slug) throw new AppError("ERR_INSTITUTION_SLUG");
      const taken = await Institution.findOne({ where: { slug, ...(existing ? { id: { [Op.ne]: existing.id } } : {}) } as any, attributes: ["id"] });
      if (taken) throw new AppError("ERR_INSTITUTION_SLUG_TAKEN");
      data.slug = slug;
    }
    // the default one stays the default until another takes its place (and is never turned off)
    if (existing?.isDefault && data.isDefault === false) throw new AppError("ERR_INSTITUTION_DEFAULT");
    if ((existing?.isDefault || data.isDefault) && data.active === false) throw new AppError("ERR_INSTITUTION_DEFAULT");
    if (!existing && !(await Institution.count())) data.isDefault = true;
    return data;
  },
  afterSave: async row => {
    if (row.isDefault) await Institution.update({ isDefault: false } as any, { where: { id: { [Op.ne]: row.id }, isDefault: true } as any });
    forgetInstitutions();
  },
  afterDelete: () => forgetInstitutions()
});

export const index = crud.index;
export const store = crud.store;
export const update = crud.update;

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const row = await Institution.findByPk(req.params.id, { attributes: ["id", "isDefault"] });
  if (!row) throw new AppError("ERR_NOT_FOUND", 404);
  if (row.isDefault) throw new AppError("ERR_INSTITUTION_DEFAULT");
  // a number keeps working: its conversations go back to the default university
  if (await Whatsapp.count({ where: { institutionId: row.id } as any })) throw new AppError("ERR_INSTITUTION_IN_USE");
  return crud.remove(req, res);
};
