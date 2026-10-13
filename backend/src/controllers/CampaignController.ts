import { Request, Response } from "express";
import { fn, col } from "sequelize";

import Campaign from "../models/Campaign";
import CampaignShipping from "../models/CampaignShipping";
import ContactList from "../models/ContactList";
import ContactListItem from "../models/ContactListItem";
import Whatsapp from "../models/Whatsapp";
import AppError from "../errors/AppError";
import { getIO } from "../libs/socket";
import makeCrud from "./crudFactory";

const crud = makeCrud(Campaign, {
  event: "campaign",
  fields: [
    "name",
    "message",
    "mediaUrl",
    "scheduledAt",
    "intervalMin",
    "intervalMax",
    "batchSize",
    "batchPause",
    "contactListId",
    "whatsappId"
  ],
  required: ["name", "message", "contactListId"],
  include: [
    { model: ContactList, as: "contactList", attributes: ["id", "name"] },
    { model: Whatsapp, as: "whatsapp", attributes: ["id", "name", "channel"] }
  ],
  beforeSave: (data, _req, existing) => {
    if (existing && !["draft", "scheduled", "paused"].includes(existing.status)) {
      throw new AppError("ERR_CAMPAIGN_LOCKED");
    }
    if (data.whatsappId === "" || data.whatsappId === 0) data.whatsappId = null;
    if (data.scheduledAt === "") data.scheduledAt = null;
    if (data.intervalMin !== undefined && data.intervalMax !== undefined) {
      if (Number(data.intervalMin) > Number(data.intervalMax)) {
        throw new AppError("ERR_CAMPAIGN_INTERVAL");
      }
    }
    return data;
  }
});

export const { show, store, update, remove } = crud;

const withCounters = async (campaigns: Campaign[]) => {
  const rows: any[] = await CampaignShipping.findAll({
    attributes: ["campaignId", "status", [fn("COUNT", col("id")), "total"]],
    group: ["campaignId", "status"],
    raw: true
  });
  return campaigns.map(c => {
    const counters = { pending: 0, sent: 0, failed: 0, total: 0 };
    rows
      .filter(r => r.campaignId === c.id)
      .forEach(r => {
        (counters as any)[r.status] = Number(r.total);
        counters.total += Number(r.total);
      });
    return { ...c.toJSON(), counters };
  });
};

export const index = async (_req: Request, res: Response): Promise<Response> => {
  const campaigns = await Campaign.findAll({
    include: [
      { model: ContactList, as: "contactList", attributes: ["id", "name"] },
      { model: Whatsapp, as: "whatsapp", attributes: ["id", "name", "channel"] }
    ],
    order: [["id", "DESC"]]
  });
  return res.json(await withCounters(campaigns));
};

export const report = async (req: Request, res: Response): Promise<Response> => {
  const campaign = await Campaign.findByPk(req.params.id);
  if (!campaign) throw new AppError("ERR_NOT_FOUND", 404);
  const shippings = await CampaignShipping.findAll({
    where: { campaignId: campaign.id },
    order: [["id", "ASC"]]
  });
  const [withCount] = await withCounters([campaign]);
  return res.json({ campaign: withCount, shippings });
};

const setStatus = async (id: string, status: string, allowedFrom: string[]) => {
  const campaign = await Campaign.findByPk(id);
  if (!campaign) throw new AppError("ERR_NOT_FOUND", 404);
  if (!allowedFrom.includes(campaign.status)) {
    throw new AppError("ERR_CAMPAIGN_INVALID_STATE");
  }
  return { campaign, apply: (extra = {}) => campaign.update({ status, ...extra }) };
};

export const start = async (req: Request, res: Response): Promise<Response> => {
  const { campaign, apply } = await setStatus(req.params.id, "running", [
    "draft",
    "paused",
    "scheduled"
  ]);

  // (re)build the shipping list the first time the campaign starts
  const existing = await CampaignShipping.count({ where: { campaignId: campaign.id } });
  if (!existing) {
    const items = await ContactListItem.findAll({
      where: { contactListId: campaign.contactListId }
    });
    if (!items.length) throw new AppError("ERR_CAMPAIGN_EMPTY_LIST");
    await CampaignShipping.bulkCreate(
      items.map(i => ({
        campaignId: campaign.id,
        name: i.name,
        number: i.number,
        status: "pending"
      }))
    );
  }

  const future = campaign.scheduledAt && campaign.scheduledAt.getTime() > Date.now();
  const updated = future
    ? await apply({ status: "scheduled" })
    : await apply({ startedAt: campaign.startedAt || new Date() });
  getIO().emit("campaign", { action: "update", row: updated });
  return res.json(updated);
};

export const pause = async (req: Request, res: Response): Promise<Response> => {
  const { apply } = await setStatus(req.params.id, "paused", ["running", "scheduled"]);
  const updated = await apply();
  getIO().emit("campaign", { action: "update", row: updated });
  return res.json(updated);
};

export const cancel = async (req: Request, res: Response): Promise<Response> => {
  const { campaign, apply } = await setStatus(req.params.id, "cancelled", [
    "running",
    "paused",
    "scheduled",
    "draft"
  ]);
  await CampaignShipping.update(
    { status: "cancelled" },
    { where: { campaignId: campaign.id, status: "pending" } }
  );
  const updated = await apply({ finishedAt: new Date() });
  getIO().emit("campaign", { action: "update", row: updated });
  return res.json(updated);
};

// ---------------------------------------------------------------- contact lists

const listCrud = makeCrud(ContactList, {
  event: "contactList",
  fields: ["name"],
  required: ["name"]
});

export const lists = {
  ...listCrud,
  index: async (_req: Request, res: Response): Promise<Response> => {
    const rows = await ContactList.findAll({
      attributes: ["id", "name", "createdAt", [fn("COUNT", col("items.id")), "itemCount"]],
      include: [{ model: ContactListItem, as: "items", attributes: [] }],
      group: ["ContactList.id"],
      order: [["id", "DESC"]],
      raw: true
    });
    return res.json(rows);
  }
};

export const listItems = async (req: Request, res: Response): Promise<Response> => {
  const items = await ContactListItem.findAll({
    where: { contactListId: req.params.id },
    order: [["id", "ASC"]]
  });
  return res.json(items);
};

const normalizeNumber = (n: string) => String(n || "").replace(/\D/g, "");

export const importItems = async (req: Request, res: Response): Promise<Response> => {
  const list = await ContactList.findByPk(req.params.id);
  if (!list) throw new AppError("ERR_NOT_FOUND", 404);
  const incoming: Array<{ name?: string; number?: string; email?: string }> =
    req.body.items || [];

  const existing = new Set(
    (await ContactListItem.findAll({ where: { contactListId: list.id }, attributes: ["number"] })).map(
      i => i.number
    )
  );
  const toCreate: any[] = [];
  let skipped = 0;
  incoming.forEach(i => {
    const number = normalizeNumber(i.number || "");
    if (number.length < 8 || existing.has(number)) {
      skipped += 1;
      return;
    }
    existing.add(number);
    toCreate.push({
      contactListId: list.id,
      name: (i.name || number).trim(),
      number,
      email: i.email || null
    });
  });
  await ContactListItem.bulkCreate(toCreate);
  return res.json({ imported: toCreate.length, skipped });
};

export const removeItem = async (req: Request, res: Response): Promise<Response> => {
  await ContactListItem.destroy({
    where: { id: req.params.itemId, contactListId: req.params.id }
  });
  return res.json({ message: "deleted" });
};
