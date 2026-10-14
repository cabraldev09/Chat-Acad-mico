import { Request, Response } from "express";
import { Op } from "sequelize";

import AppError from "../errors/AppError";
import Lead from "../models/Lead";
import Payment from "../models/Payment";
import User from "../models/User";
import { getSetting } from "../helpers/AppSettings";
import { roleOf } from "../helpers/Roles";

// Commissions of the enrollment fee. Efí splits the payment to the consultant's wallet at the moment the student pays,
// so with a wallet registered the commission is "received" as soon as the payment is confirmed. Without a wallet the money
// stays with the company: the commission is "owed" until someone repays it by hand and marks it as paid here.
//   received   paid by the student and sent to the wallet (or repaid by hand)
//   owed       paid by the student, kept by the company, not yet repaid
//   waiting    the student has not paid yet
//   cancelled  charge cancelled or expired
const BUCKETS = ["received", "owed", "waiting", "cancelled"] as const;
type Bucket = typeof BUCKETS[number];

const sees = (req: Request): "all" | "mine" => {
  const role = roleOf(req.user);
  return role === "admin" || role === "coordenacao" ? "all" : "mine";
};

const bucketOf = (p: Payment): Bucket => {
  if (p.status === "paid") return p.recipientCode || p.commissionSettledAt ? "received" : "owed";
  if (p.status === "pending" || p.status === "scheduled") return "waiting";
  return "cancelled";
};

const fetchRows = async (req: Request) => {
  const me = Number(req.user.id);
  const where: any = { recipientUserId: sees(req) === "all" ? { [Op.ne]: null } : me };
  if (sees(req) === "all" && Number(req.query.userId)) where.recipientUserId = Number(req.query.userId);
  const from = req.query.from ? new Date(`${req.query.from}T00:00:00-04:00`) : null;
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59-04:00`) : null;
  if (from || to) where.createdAt = { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lte]: to } : {}) };

  const defaultPct = Math.min(100, Math.max(1, Number(await getSetting("efi_consultant_pct", "100")) || 100));
  const payments = await Payment.findAll({
    where,
    include: [{ model: Lead, as: "lead", attributes: ["id", "name"] }],
    order: [["createdAt", "DESC"]],
    limit: 5000
  });
  const users = await User.findAll({
    where: { id: [...new Set(payments.map(p => p.recipientUserId).filter(Boolean))] },
    attributes: ["id", "name"]
  });
  const nameOf = new Map(users.map(u => [u.id, u.name]));
  const search = String(req.query.search || "").trim().toLowerCase();

  let rows = payments.map(p => {
    const gross = Number(p.paidAmount || p.amount || 0);
    const pct = p.splitPct && p.recipientCode ? Number(p.splitPct) : defaultPct;
    return {
      id: p.id,
      leadId: p.leadId,
      lead: (p as any).lead?.name || "—",
      consultantId: p.recipientUserId,
      consultant: nameOf.get(p.recipientUserId) || "—",
      kind: p.kind,
      amount: Number(p.amount),
      paidAmount: p.paidAmount === null || p.paidAmount === undefined ? null : Number(p.paidAmount),
      pct,
      commission: Math.round(gross * pct) / 100,
      bucket: bucketOf(p),
      viaWallet: !!p.recipientCode,
      status: p.status,
      createdAt: p.createdAt,
      paidAt: p.paidAt,
      settledAt: p.commissionSettledAt,
      note: p.commissionNote
    };
  });
  const bucket = String(req.query.bucket || "");
  if ((BUCKETS as readonly string[]).includes(bucket)) rows = rows.filter(r => r.bucket === bucket);
  if (search) rows = rows.filter(r => `${r.lead} ${r.consultant}`.toLowerCase().includes(search));
  return { rows, defaultPct };
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { rows, defaultPct } = await fetchRows(req);
  const summary: Record<string, { count: number; total: number }> = {};
  BUCKETS.forEach(b => { summary[b] = { count: 0, total: 0 }; });
  rows.forEach(r => {
    summary[r.bucket].count += 1;
    summary[r.bucket].total = Math.round((summary[r.bucket].total + r.commission) * 100) / 100;
  });
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const me = await User.findByPk(Number(req.user.id), { attributes: ["id", "efiPayeeCode"] });
  const consultants = sees(req) === "all"
    ? [...new Map(rows.map(r => [r.consultantId, r.consultant])).entries()].map(([id, name]) => ({ id, name }))
    : [];
  return res.json({
    scope: sees(req),
    wallet: { informed: !!me?.efiPayeeCode, masked: me?.efiPayeeCode ? `••••${me.efiPayeeCode.slice(-4)}` : null },
    defaultPct,
    summary,
    count: rows.length,
    rows: rows.slice(offset, offset + limit),
    consultants
  });
};

// admin and coordination mark a commission that stayed with the company as repaid (or undo it)
export const settle = async (req: Request, res: Response): Promise<Response> => {
  if (sees(req) !== "all") throw new AppError("ERR_NO_PERMISSION", 403);
  const payment = await Payment.findByPk(req.params.id);
  if (!payment || !payment.recipientUserId) throw new AppError("ERR_NOT_FOUND", 404);
  if (payment.status !== "paid") throw new AppError("ERR_COMMISSION_NOT_PAID", 400);
  if (payment.recipientCode) throw new AppError("ERR_COMMISSION_VIA_WALLET", 400);
  const undo = req.body?.undo === true;
  await payment.update({
    commissionSettledAt: undo ? null : new Date(),
    commissionSettledBy: undo ? null : Number(req.user.id),
    commissionNote: undo ? null : String(req.body?.note || "").slice(0, 300) || null
  } as any);
  return res.json({ ok: true });
};

export const exportCsv = async (req: Request, res: Response): Promise<void> => {
  const { rows } = await fetchRows(req);
  const label: Record<string, string> = { received: "Recebida", owed: "A receber", waiting: "Aguardando pagamento", cancelled: "Cancelada" };
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const money = (n: number) => n.toFixed(2).replace(".", ",");
  const day = (d: any) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Porto_Velho" }) : "");
  const lines = [["Consultor", "Aluno", "Taxa", "Percentual", "Comissão", "Situação", "Via carteira Efí", "Criada em", "Paga em", "Repassada em", "Observação"].map(esc).join(";")];
  rows.forEach(r => lines.push([
    r.consultant, r.lead, money(r.paidAmount ?? r.amount), `${r.pct}%`, money(r.commission), label[r.bucket], r.viaWallet ? "Sim" : "Não",
    day(r.createdAt), day(r.paidAt), day(r.settledAt), r.note
  ].map(esc).join(";")));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=comissoes.csv");
  res.send(`﻿${lines.join("\r\n")}`);
};
