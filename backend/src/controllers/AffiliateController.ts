import { tagAffiliateLead } from "../services/AffiliateServices/AffiliateLane";
import { Request, Response } from "express";
import { Op } from "sequelize";

import AppError from "../errors/AppError";
import Affiliate from "../models/Affiliate";
import AffiliateBonus from "../models/AffiliateBonus";
import Course from "../models/Course";
import Lead from "../models/Lead";
import LeadStage from "../models/LeadStage";
import Polo from "../models/Polo";
import Proposal from "../models/Proposal";
import User from "../models/User";
import { getSetting, setSetting } from "../helpers/AppSettings";
import { getPublicUrl } from "../helpers/PublicUrl";
import { normalizeEmail, normalizePhone } from "../helpers/Phone";
import {
  brl, newPortalToken, newRefCode, portalUrl, referralUrl, withAffiliateScope
} from "../helpers/Affiliates";
import { isAdminReq, withLeadScope } from "../middleware/scope";
import { statsFor } from "../services/AffiliateServices/Stats";
import { getPortalTexts, getRules } from "../services/AffiliateServices/Bonus";
import { addActivity, loadLead, resolveLeadTarget, upsertLead } from "../services/CrmServices/LeadCore";
import SendToContact from "../services/ChannelServices/SendToContact";
import { getIO } from "../libs/socket";

const uid = (req: Request) => Number(req.user.id);
const clip = (v: any, n = 160): string | null => {
  const t = v === undefined || v === null ? "" : String(v).trim();
  return t ? t.slice(0, n) : null;
};
const money = (v: any): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isNaN(n) || n < 0 ? null : Math.round(n * 100) / 100;
};

const present = (a: Affiliate, extra: any = {}) => ({
  ...a.toJSON(),
  portalUrl: portalUrl(a.portalToken),
  referralUrl: referralUrl(a.refCode),
  ...extra
});

const load = async (id: number | string): Promise<Affiliate> => {
  const a = await Affiliate.findByPk(id, {
    include: [
      { model: User, as: "owner", attributes: ["id", "name"] }
    ]
  });
  if (!a) throw new AppError("ERR_AFFILIATE_NOT_FOUND", 404);
  return a;
};

const fieldsOf = (b: any, isNew: boolean) => {
  const data: any = {};
  if (b.name !== undefined) {
    const name = clip(b.name, 120);
    if (!name) throw new AppError("ERR_FIELD_REQUIRED_name");
    data.name = name;
  } else if (isNew) throw new AppError("ERR_FIELD_REQUIRED_name");
  if (b.phone !== undefined) {
    const phone = b.phone ? normalizePhone(b.phone) : null;
    if (b.phone && !phone) throw new AppError("ERR_INVALID_PHONE");
    data.phone = phone;
  }
  if (b.email !== undefined) {
    const email = b.email ? normalizeEmail(b.email) : null;
    if (b.email && !email) throw new AppError("ERR_INVALID_EMAIL");
    data.email = email;
  }
  if (b.document !== undefined) data.document = clip(b.document, 20);
  if (b.city !== undefined) data.city = clip(b.city, 80);
  if (b.poloId !== undefined) data.poloId = b.poloId ? Number(b.poloId) : null;
  if (b.externalLink !== undefined) {
    const link = clip(b.externalLink, 600);
    if (link && !/^https?:\/\//i.test(link)) throw new AppError("ERR_AFFILIATE_BAD_URL");
    data.externalLink = link;
  }
  if (b.pixKeyType !== undefined) data.pixKeyType = clip(b.pixKeyType, 20);
  if (b.pixKey !== undefined) data.pixKey = clip(b.pixKey, 140);
  if (b.notes !== undefined) data.notes = clip(b.notes, 2000);
  if (b.status !== undefined) data.status = b.status === "paused" ? "paused" : "active";
  return data;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const where = await withAffiliateScope(req, {});
  const search = String(req.query.search || "").trim();
  if (search) {
    where[Op.and] = [...(where[Op.and] || []), { [Op.or]: [{ name: { [Op.iLike]: `%${search}%` } }, { phone: { [Op.like]: `%${search.replace(/\D/g, "") || "@@"}%` } }, { refCode: search.toUpperCase() }] }];
  }
  const rows = await Affiliate.findAll({
    where,
    include: [{ model: User, as: "owner", attributes: ["id", "name"] }],
    order: [["name", "ASC"]]
  });
  const since = req.query.days ? new Date(Date.now() - Number(req.query.days) * 86400000) : undefined;
  const stats = await statsFor(rows.map(r => r.id), since);
  return res.json(rows.map(a => present(a, { stats: stats.get(a.id) })));
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const a = await load(req.params.id);
  const stats = await statsFor([a.id]);
  return res.json(present(a, { stats: stats.get(a.id) }));
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const data = fieldsOf(req.body, true);
  // a consultant follows their own affiliates; admin and coordination choose who
  const role = isAdminReq(req) || req.user.role === "coordenacao";
  const ownerId = role && req.body.ownerId ? Number(req.body.ownerId) : uid(req);
  if (role && req.body.ownerId && !(await User.findByPk(ownerId, { attributes: ["id"] }))) throw new AppError("ERR_USER_NOT_FOUND", 404);
  const a = await Affiliate.create({
    ...data,
    ownerId,
    refCode: await newRefCode(),
    portalToken: newPortalToken(),
    bonusValue: isAdminReq(req) ? money(req.body.bonusValue) : null
  } as any);
  const full = await load(a.id);
  getIO().emit("affiliate", { action: "create", affiliate: present(full) });
  return res.status(201).json(present(full));
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const a = await load(req.params.id);
  const data = fieldsOf(req.body, false);
  if (req.body.ownerId !== undefined && (isAdminReq(req) || req.user.role === "coordenacao")) {
    data.ownerId = req.body.ownerId ? Number(req.body.ownerId) : a.ownerId;
  }
  if (req.body.bonusValue !== undefined && isAdminReq(req)) data.bonusValue = money(req.body.bonusValue);
  await a.update(data);
  const full = await load(a.id);
  getIO().emit("affiliate", { action: "update", affiliate: present(full) });
  return res.json(present(full));
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const a = await load(req.params.id);
  if (await AffiliateBonus.count({ where: { affiliateId: a.id, status: { [Op.in]: ["pending", "approved"] } } })) {
    throw new AppError("ERR_AFFILIATE_HAS_OPEN_BONUS");
  }
  await a.destroy();
  getIO().emit("affiliate", { action: "delete", affiliateId: a.id });
  return res.json({ message: "deleted" });
};

// invalidates the link already shared with the affiliate
export const rotateToken = async (req: Request, res: Response): Promise<Response> => {
  const a = await load(req.params.id);
  await a.update({ portalToken: newPortalToken() });
  return res.json(present(a));
};

// everything behind the numbers: people referred, proposals and the bonus lines
export const summary = async (req: Request, res: Response): Promise<Response> => {
  const a = await load(req.params.id);
  const leadWhere = await withLeadScope(req, { affiliateId: a.id });
  const leads = await Lead.findAll({
    where: leadWhere,
    include: [
      { model: LeadStage, as: "stage", attributes: ["id", "name", "color", "type"] },
      { model: Course, as: "course", attributes: ["id", "name", "modality"] }
    ],
    attributes: ["id", "name", "phone", "createdAt", "wonAt", "enrolledAt", "ownerId"],
    order: [["createdAt", "DESC"]],
    limit: 300
  });
  const proposals = await Proposal.findAll({
    where: { affiliateId: a.id },
    attributes: ["id", "leadId", "token", "courseName", "status", "sentAt", "viewedAt", "createdAt"],
    order: [["createdAt", "DESC"]],
    limit: 200
  });
  const bonuses = await AffiliateBonus.findAll({
    where: { affiliateId: a.id },
    include: [{ model: Lead, as: "lead", attributes: ["id", "name"] }],
    order: [["createdAt", "DESC"]],
    limit: 200
  });
  const stats = await statsFor([a.id]);
  return res.json({
    affiliate: present(a, { stats: stats.get(a.id) }),
    leads,
    proposals: proposals.map(p => ({ ...p.toJSON(), publicUrl: `${getPublicUrl()}/p/${p.token}` })),
    bonuses
  });
};

export const ranking = async (req: Request, res: Response): Promise<Response> => {
  const where = await withAffiliateScope(req, {});
  const rows = await Affiliate.findAll({ where, include: [{ model: User, as: "owner", attributes: ["id", "name"] }] });
  const days = Number(req.query.days) || 30;
  const stats = await statsFor(rows.map(r => r.id), new Date(Date.now() - days * 86400000));
  const byPaid = req.query.by === "paid";
  const list = rows
    .map(a => ({ id: a.id, name: a.name, owner: (a as any).owner?.name || null, ...stats.get(a.id)! }))
    // "who received the most" counts what was already paid, then what is owed
    .sort((x, y) => (byPaid ? y.bonusPaid - x.bonusPaid || (y.bonusPending + y.bonusApproved) - (x.bonusPending + x.bonusApproved) : 0) || y.enrolled - x.enrolled || y.referrals - x.referrals);
  const totals = list.reduce(
    (t, r) => ({ referrals: t.referrals + r.referrals, enrolled: t.enrolled + r.enrolled, proposals: t.proposals + r.proposals, bonusOwed: t.bonusOwed + r.bonusPending + r.bonusApproved, bonusPaid: t.bonusPaid + r.bonusPaid }),
    { referrals: 0, enrolled: 0, proposals: 0, bonusOwed: 0, bonusPaid: 0 }
  );
  return res.json({ days, totals, affiliates: list });
};

// The consultant registers a person the affiliate referred; the lead belongs to the affiliate's consultant and
// the proposal can be made right away
export const addReferral = async (req: Request, res: Response): Promise<Response> => {
  const a = await load(req.params.id);
  const name = clip(req.body.name, 120);
  if (!name) throw new AppError("ERR_FIELD_REQUIRED_name");
  if (!normalizePhone(req.body.phone)) throw new AppError("ERR_INVALID_PHONE");
  const course = req.body.courseId ? await Course.findByPk(Number(req.body.courseId)) : null;
  const { lead, created } = await upsertLead(
    {
      name,
      phone: req.body.phone,
      email: req.body.email,
      city: clip(req.body.city, 80) || undefined,
      courseId: course ? course.id : null,
      modality: clip(req.body.modality, 40) || course?.modality || undefined,
      source: "Indicação",
      channel: "affiliate",
      notes: clip(req.body.notes, 500) || undefined,
      ownerId: a.ownerId,
      affiliateId: a.id
    },
    uid(req)
  );
  return res.status(created ? 201 : 200).json({ lead: await loadLead(lead.id), created, duplicateOfOther: !created && lead.affiliateId !== a.id });
};

// attach a lead that already exists (and has no affiliate yet) to this affiliate
export const attachLead = async (req: Request, res: Response): Promise<Response> => {
  const a = await load(req.params.id);
  const lead = await Lead.findOne({ where: await withLeadScope(req, { id: Number(req.body.leadId) }) });
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  if (lead.affiliateId && lead.affiliateId !== a.id) throw new AppError("ERR_LEAD_HAS_AFFILIATE");
  await lead.update({ affiliateId: a.id });
  await tagAffiliateLead(lead);
  // the proposals already made for this person now count for the affiliate too
  await Proposal.update({ affiliateId: a.id } as any, { where: { leadId: lead.id, affiliateId: null } });
  await addActivity(lead.id, uid(req), "system", `Lead atribuído ao afiliado ${a.name}`);
  return res.json(await loadLead(lead.id));
};

const affiliateContact = async (a: Affiliate, req: Request) => {
  if (!a.phone) throw new AppError("ERR_AFFILIATE_NO_PHONE");
  // reuse the lead-target logic: it finds/creates the contact and the connection of the person sending
  const fake: any = { phone: a.phone, name: a.name, contactId: null, update: async () => null };
  return resolveLeadTarget(fake, uid(req), req.body.whatsappId);
};

// sends the portal link to the affiliate on WhatsApp
export const sendPortal = async (req: Request, res: Response): Promise<Response> => {
  const a = await load(req.params.id);
  const { contact, whatsapp } = await affiliateContact(a, req);
  const first = a.name.split(" ")[0];
  const body =
    (clip(req.body.message, 1500) ||
      `Olá, ${first}! Aqui está o seu acesso ao material de apoio (banners, textos, vídeos, cursos e campanhas):`) +
    `\n\n${portalUrl(a.portalToken)}\n\nGuarde este link: ele é só seu.`;
  await SendToContact({ contact, whatsapp, body, keepOpen: { userId: uid(req) } }).catch(() => {
    throw new AppError("ERR_AFFILIATE_SEND_FAILED");
  });
  return res.json({ message: "sent" });
};

// sends a proposal made for a referred person to the affiliate, who forwards it
export const sendProposal = async (req: Request, res: Response): Promise<Response> => {
  const a = await load(req.params.id);
  const p = await Proposal.findByPk(Number(req.body.proposalId), { include: [{ model: Lead, as: "lead", attributes: ["id", "name", "affiliateId"] }] });
  if (!p || (p.affiliateId !== a.id && (p as any).lead?.affiliateId !== a.id)) throw new AppError("ERR_NOT_FOUND", 404);
  if (!isAdminReq(req) && (await Lead.count({ where: await withLeadScope(req, { id: p.leadId }) })) === 0) throw new AppError("ERR_NO_PERMISSION", 403);
  const { contact, whatsapp } = await affiliateContact(a, req);
  const first = a.name.split(" ")[0];
  const body =
    `Olá, ${first}! Segue a proposta de ${(p as any).lead?.name || "seu indicado"} para você encaminhar:\n\n` +
    `${getPublicUrl()}/p/${p.token}\n\nO link abre a proposta completa (e tem o PDF para baixar).`;
  await SendToContact({ contact, whatsapp, body, keepOpen: { userId: uid(req) } }).catch(() => {
    throw new AppError("ERR_AFFILIATE_SEND_FAILED");
  });
  await addActivity(p.leadId, uid(req), "whatsapp", `Proposta #${p.id} enviada ao afiliado ${a.name} para encaminhar`);
  return res.json({ message: "sent", url: `${getPublicUrl()}/p/${p.token}` });
};

// ---------------------------------------------------------------- bonuses (what the maintainer owes)

const bonusWhere = async (req: Request) => {
  const where: any = {};
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.affiliateId) where.affiliateId = Number(req.query.affiliateId);
  if (req.query.from) where.createdAt = { ...(where.createdAt || {}), [Op.gte]: new Date(String(req.query.from)) };
  if (req.query.to) where.createdAt = { ...(where.createdAt || {}), [Op.lte]: new Date(`${String(req.query.to)}T23:59:59`) };
  const visible = await Affiliate.findAll({ where: await withAffiliateScope(req, {}), attributes: ["id"] });
  where.affiliateId = where.affiliateId
    ? { [Op.and]: [where.affiliateId, { [Op.in]: visible.map(v => v.id) }] }
    : { [Op.in]: visible.map(v => v.id) };
  return where;
};

export const listBonuses = async (req: Request, res: Response): Promise<Response> => {
  const rows = await AffiliateBonus.findAll({
    where: await bonusWhere(req),
    include: [
      { model: Affiliate, as: "affiliate", attributes: ["id", "name", "phone", "pixKeyType", "pixKey", "ownerId"] },
      { model: Lead, as: "lead", attributes: ["id", "name"] }
    ],
    order: [["createdAt", "DESC"]],
    limit: 1000
  });
  const sum = (s: string) => rows.filter(r => r.status === s).reduce((t, r) => t + Number(r.amount), 0);
  return res.json({ rows, totals: { pending: sum("pending"), approved: sum("approved"), paid: sum("paid") } });
};

export const bonusAction = async (req: Request, res: Response): Promise<Response> => {
  const row = await AffiliateBonus.findByPk(req.params.id);
  if (!row) throw new AppError("ERR_NOT_FOUND", 404);
  const action = req.params.action;
  const me = uid(req);
  if (req.body.amount !== undefined) {
    const amount = money(req.body.amount);
    if (amount === null) throw new AppError("ERR_INVALID_AMOUNT");
    if (row.status === "paid") throw new AppError("ERR_BONUS_ALREADY_PAID");
    await row.update({ amount });
  }
  if (action === "approve") {
    if (row.status !== "pending") throw new AppError("ERR_BONUS_BAD_STATUS");
    await row.update({ status: "approved", approvedBy: me, approvedAt: new Date() });
  } else if (action === "pay") {
    if (!["pending", "approved"].includes(row.status)) throw new AppError("ERR_BONUS_BAD_STATUS");
    await row.update({
      status: "paid", paidBy: me, paidAt: new Date(), approvedBy: row.approvedBy || me, approvedAt: row.approvedAt || new Date(),
      paymentRef: clip(req.body.paymentRef, 200), note: clip(req.body.note, 500) ?? row.note
    });
  } else if (action === "cancel") {
    if (row.status === "paid") throw new AppError("ERR_BONUS_ALREADY_PAID");
    await row.update({ status: "cancelled", note: clip(req.body.note, 500) ?? row.note });
  } else if (action !== "amount") throw new AppError("ERR_NOT_FOUND", 404);
  getIO().emit("affiliateBonus", { action: "update", bonusId: row.id, affiliateId: row.affiliateId });
  return res.json(row);
};

// one line per bonus to pay, ready for a bulk Pix
export const exportBonuses = async (req: Request, res: Response): Promise<void> => {
  const rows = await AffiliateBonus.findAll({
    where: await bonusWhere(req),
    include: [
      { model: Affiliate, as: "affiliate", attributes: ["name", "phone", "pixKeyType", "pixKey"] },
      { model: Lead, as: "lead", attributes: ["name"] }
    ],
    order: [["createdAt", "ASC"]]
  });
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const label: any = { pending: "Pendente", approved: "Aprovado", paid: "Pago", cancelled: "Cancelado" };
  const lines = [["Afiliado", "Tipo da chave", "Chave Pix", "Indicado", "Valor", "Situação", "Motivo", "Data", "Comprovante"].map(esc).join(";")];
  rows.forEach(r => {
    const a: any = (r as any).affiliate;
    lines.push([
      a?.name, a?.pixKeyType, a?.pixKey, (r as any).lead?.name, Number(r.amount).toFixed(2).replace(".", ","),
      label[r.status] || r.status, r.reason, new Date(r.createdAt).toLocaleDateString("pt-BR"), r.paymentRef
    ].map(esc).join(";"));
  });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=bonificacoes.csv");
  res.send(`﻿${lines.join("\r\n")}`);
};

// ---------------------------------------------------------------- rules (admin)

export const getRulesRoute = async (_req: Request, res: Response): Promise<Response> =>
  res.json({
    ...(await getRules()),
    ...(await getPortalTexts()),
    portalTitle: await getSetting("affiliate_portal_title", "Central do Afiliado"),
    portalMessage: await getSetting("affiliate_portal_message", "Tudo o que você precisa para indicar: materiais, cursos e campanhas.")
  });

export const putRules = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body || {};
  if (b.mode !== undefined) await setSetting("affiliate_bonus_mode", b.mode === "pct" || b.mode === "first_monthly" ? b.mode : "fixed");
  if (b.payDays !== undefined) await setSetting("affiliate_pay_days", String(Math.min(365, Math.max(1, Math.round(Number(b.payDays)) || 60))));
  if (b.value !== undefined) {
    const v = Number(String(b.value).replace(",", "."));
    if (Number.isNaN(v) || v < 0) throw new AppError("ERR_INVALID_AMOUNT");
    await setSetting("affiliate_bonus_value", String(v));
  }
  if (b.trigger !== undefined) await setSetting("affiliate_bonus_trigger", b.trigger === "fee_paid" ? "fee_paid" : "enrolled");
  if (b.kind !== undefined) await setSetting("affiliate_bonus_kind", b.kind === "pix" ? "pix" : "bonus");
  if (b.faq !== undefined) {
    const list = (Array.isArray(b.faq) ? b.faq : []).filter((i: any) => i && String(i.q || "").trim() && String(i.a || "").trim()).slice(0, 20)
      .map((i: any) => ({ q: String(i.q).trim().slice(0, 160), a: String(i.a).trim().slice(0, 1200) }));
    await setSetting("affiliate_faq", list.length ? JSON.stringify(list) : "");
  }
  for (const [field, key] of [["videoProgram", "affiliate_video_program"], ["videoTutorial", "affiliate_video_tutorial"]] as const) {
    if (b[field] !== undefined) {
      const url = String(b[field] || "").trim();
      if (url && !/^https?:\/\//i.test(url)) throw new AppError("ERR_AFFILIATE_BAD_URL");
      await setSetting(key, url.slice(0, 300));
    }
  }
  if (b.supportPhone !== undefined) await setSetting("affiliate_support_phone", String(b.supportPhone || "").replace(/\D/g, "").slice(0, 15));
  if (b.portalTitle !== undefined) await setSetting("affiliate_portal_title", String(b.portalTitle).slice(0, 80));
  if (b.portalMessage !== undefined) await setSetting("affiliate_portal_message", String(b.portalMessage).slice(0, 300));
  return getRulesRoute(req, res);
};

// the WhatsApp the person's affiliates see as "support" (each person sets their own)
export const myPhone = async (req: Request, res: Response): Promise<Response> => {
  const u = await User.findByPk(uid(req), { attributes: ["id", "phone"] });
  return res.json({ phone: u?.phone || null });
};

export const saveMyPhone = async (req: Request, res: Response): Promise<Response> => {
  const raw = String(req.body.phone || "").trim();
  const phone = raw ? normalizePhone(raw) : null;
  if (raw && !phone) throw new AppError("ERR_INVALID_PHONE", 400);
  await User.update({ phone } as any, { where: { id: uid(req) } });
  return res.json({ phone });
};

// polos for the form
export const polos = async (_req: Request, res: Response): Promise<Response> =>
  res.json(await Polo.findAll({ where: { active: true }, attributes: ["id", "name", "city"], order: [["name", "ASC"]] }));

export { brl };
