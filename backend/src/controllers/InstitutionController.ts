import { Request, Response } from "express";
import path from "path";
import { Op, Transaction } from "sequelize";

import sequelize from "../database";
import AppError from "../errors/AppError";
import { isEmail } from "../helpers/Email";
import { forgetInstitutions } from "../helpers/Institution";
import { getIO } from "../libs/socket";
import AiAgent from "../models/AiAgent";
import Campaign from "../models/Campaign";
import Course from "../models/Course";
import Institution from "../models/Institution";
import InstitutionSetting from "../models/InstitutionSetting";
import Setting from "../models/Setting";
import Lead from "../models/Lead";
import PoloInstitution from "../models/PoloInstitution";
import Proposal from "../models/Proposal";
import ProposalTemplate from "../models/ProposalTemplate";
import ProposalTemplateInstitution from "../models/ProposalTemplateInstitution";
import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";
import makeCrud from "./crudFactory";

// The universities of the group (CRM → Configurações → Universidades). One is the default: everything that does not say another one
// belongs to it, so there is always exactly one default and it cannot be removed.

const fields = ["name", "cnpj", "logoFile", "active", "shortName", "slug", "brandColor", "site", "mailFromName", "mailFrom", "footer", "isDefault"];
const clean = (v: unknown, max: number): string | null => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
};

const bool = (value: unknown): boolean => {
  if (value === true || value === 1 || String(value).trim().toLowerCase() === "true" || String(value).trim() === "1") return true;
  if (value === false || value === 0 || String(value).trim().toLowerCase() === "false" || String(value).trim() === "0") return false;
  throw new AppError("ERR_INVALID_BOOLEAN");
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

const prepare = async (data: any, existing?: Institution): Promise<any> => {
  if (data.active !== undefined) data.active = bool(data.active);
  if (data.isDefault !== undefined) data.isDefault = bool(data.isDefault);
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
    const taken = await Institution.findOne({ where: { slug, ...(existing ? { id: { [Op.ne]: existing.id } } : {}) }, attributes: ["id"] });
    if (taken) throw new AppError("ERR_INSTITUTION_SLUG_TAKEN");
    data.slug = slug;
  }
  const becomesDefault = data.isDefault ?? existing?.isDefault ?? false;
  const staysActive = data.active ?? existing?.active ?? true;
  if (existing?.isDefault && data.isDefault === false) throw new AppError("ERR_INSTITUTION_DEFAULT");
  if (becomesDefault && !staysActive) throw new AppError("ERR_INSTITUTION_DEFAULT");
  return data;
};

const pick = (body: any): any => Object.fromEntries(fields.filter(f => body?.[f] !== undefined).map(f => [f, body[f]]));
const lockDefault = async (transaction: Transaction): Promise<void> => {
  if (sequelize.getDialect() === "postgres") await sequelize.query("SELECT pg_advisory_xact_lock(918276)", { transaction });
};
const emit = (action: string, payload: any): void => { getIO().emit("institution", { action, ...payload }); };
const crud = makeCrud(Institution, { event: "institution", fields, order: [["isDefault", "DESC"], ["name", "ASC"]] });

export const index = crud.index;

export const store = async (req: Request, res: Response): Promise<Response> => {
  const data = pick(req.body);
  if (data.name === undefined || data.name === null || data.name === "") throw new AppError("ERR_FIELD_REQUIRED_name");
  const id = await sequelize.transaction(async transaction => {
    await lockDefault(transaction);
    let cleanData = await prepare(data);
    if (!(await Institution.count({ transaction }))) cleanData.isDefault = true;
    cleanData = await prepare(cleanData);
    if (cleanData.isDefault) await Institution.update({ isDefault: false } as any, { where: { isDefault: true }, transaction });
    const row = await Institution.create(cleanData, { transaction });
    return row.id;
  });
  const row = await Institution.findByPk(id);
  forgetInstitutions();
  emit("create", { row });
  return res.status(201).json(row);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const id = await sequelize.transaction(async transaction => {
    await lockDefault(transaction);
    const row = await Institution.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!row) throw new AppError("ERR_NOT_FOUND", 404);
    const data = await prepare(pick(req.body), row);
    if (data.isDefault === true) {
      await Institution.update({ isDefault: false } as any, { where: { isDefault: true, id: { [Op.ne]: row.id } } as any, transaction });
    }
    await row.update(data, { transaction });
    return row.id;
  });
  const row = await Institution.findByPk(id);
  forgetInstitutions();
  emit("update", { row });
  return res.json(row);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const id = await sequelize.transaction(async transaction => {
    await lockDefault(transaction);
    const row = await Institution.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!row) throw new AppError("ERR_NOT_FOUND", 404);
    if (row.isDefault) throw new AppError("ERR_INSTITUTION_DEFAULT");
    const legacy = await Setting.findByPk("legacy_institution_id", { transaction, lock: transaction.LOCK.UPDATE });
    if (Number(legacy?.value) === row.id) throw new AppError("ERR_INSTITUTION_IN_USE");
    const refs = await Promise.all([
      Whatsapp.count({ where: { institutionId: row.id } as any, transaction }),
      Ticket.count({ where: { institutionId: row.id } as any, transaction }),
      Lead.count({ where: { institutionId: row.id } as any, transaction }),
      Campaign.count({ where: { institutionId: row.id } as any, transaction }),
      AiAgent.count({ where: { institutionId: row.id } as any, transaction }),
      Course.count({ where: { institutionId: row.id } as any, transaction }),
      Proposal.count({ where: { institutionId: row.id } as any, transaction }),
      ProposalTemplate.count({ where: { institutionId: row.id } as any, transaction }),
      ProposalTemplateInstitution.count({ where: { institutionId: row.id } as any, transaction }),
      InstitutionSetting.count({ where: { institutionId: row.id } as any, transaction }),
      PoloInstitution.count({ where: { institutionId: row.id } as any, transaction })
    ]);
    if (refs.some(count => count > 0)) throw new AppError("ERR_INSTITUTION_IN_USE");
    await row.destroy({ transaction });
    return row.id;
  });
  forgetInstitutions();
  emit("delete", { id: Number(id) });
  return res.json({ message: "deleted" });
};
