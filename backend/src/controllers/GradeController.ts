import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { Op } from "sequelize";

import { PUBLIC_DIR } from "../config/paths";
import AppError from "../errors/AppError";
import { isManagerRole, roleOf } from "../helpers/Roles";
import CommercialGrade from "../models/CommercialGrade";
import { assertTicketAccess } from "../middleware/canAccessTicket";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import SendWhatsAppMedia from "../services/WbotServices/SendWhatsAppMedia";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import { gradePath, gradeView, importDefaultGrades, publishGrade, removeGrade } from "../analysis/Grades";

const manager = (req: Request): boolean => isManagerRole(roleOf(req.user));
const mustManage = (req: Request): void => {
  if (!manager(req)) throw new AppError("ERR_NO_PERMISSION", 403);
};

const load = async (id: string): Promise<CommercialGrade> => {
  const g = await CommercialGrade.findByPk(id);
  if (!g) throw new AppError("Grade não encontrada.", 404);
  return g;
};

// Everyone who works with candidates reads the catalog (the team consults it while chatting)
export const index = async (req: Request, res: Response): Promise<Response> => {
  const and: any[] = [];
  const q = String(req.query.search || "").trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    and.push({ [Op.or]: [{ courseName: { [Op.iLike]: like } }, { knowledgeArea: { [Op.iLike]: like } }, { degree: { [Op.iLike]: like } }] });
  }
  if (req.query.degree) and.push({ degree: String(req.query.degree) });
  if (req.query.area) and.push({ knowledgeArea: String(req.query.area) });
  if (req.query.modality) and.push({ modality: String(req.query.modality) });
  const rows = await CommercialGrade.findAll({ where: and.length ? { [Op.and]: and } : {}, order: [["courseName", "ASC"]] });
  const facets = await CommercialGrade.findAll({ attributes: ["degree", "knowledgeArea", "modality"], raw: true });
  const uniq = (key: "degree" | "knowledgeArea" | "modality") => [...new Set(facets.map((f: any) => f[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
  return res.json({ grades: rows.map(g => gradeView(g)), degrees: uniq("degree"), areas: uniq("knowledgeArea"), modalities: uniq("modality") });
};

export const show = async (req: Request, res: Response): Promise<Response> => res.json(gradeView(await load(req.params.id), true));

// the PDF itself, behind the login
export const file = async (req: Request, res: Response): Promise<void> => {
  const g = await load(req.params.id);
  const p = gradePath(g);
  if (!fs.existsSync(p)) throw new AppError("O PDF desta grade não está mais disponível. Envie o arquivo de novo.", 410);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(`${g.courseName}.pdf`)}`);
  fs.createReadStream(p).pipe(res);
};

// one or several PDFs (batch): "upsert" updates the matrix of the same course instead of refusing it
export const store = async (req: Request, res: Response): Promise<Response> => {
  mustManage(req);
  const files = ((req as any).files as Express.Multer.File[] | undefined) || [];
  if (!files.length) throw new AppError("Selecione ao menos 1 arquivo PDF.", 400);
  const upsert = String(req.body?.mode || "") === "upsert" || files.length > 1;
  const results: Array<{ name: string; ok: boolean; message: string; id?: number; action?: string; warning?: boolean }> = [];
  for (const f of files) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await publishGrade({ bytes: f.buffer, filename: f.originalname.replace(/[\\/:*?"<>|]/g, "_"), userId: Number(req.user.id), upsert });
      results.push({ name: f.originalname, ok: true, message: r.message, id: r.id, action: r.action, warning: r.warning });
    } catch (err) {
      results.push({ name: f.originalname, ok: false, message: err instanceof AppError ? err.message : "Não foi possível ler este PDF." });
    }
  }
  const failed = results.filter(r => !r.ok).length;
  return res.status(failed === results.length ? 400 : 201).json({ results, created: results.filter(r => r.action === "created").length, updated: results.filter(r => r.action === "updated").length, unchanged: results.filter(r => r.action === "unchanged").length, failed });
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  mustManage(req);
  await removeGrade(await load(req.params.id));
  return res.status(204).end();
};

export const importDefaults = async (req: Request, res: Response): Promise<Response> => {
  mustManage(req);
  return res.json(await importDefaultGrades());
};

// Sends the matrix into a conversation: the summary text and/or the PDF, through the same safe path as any message
export const send = async (req: Request, res: Response): Promise<Response> => {
  const g = await load(req.params.id);
  const ticketId = Number(req.body?.ticketId);
  if (!ticketId) throw new AppError("Escolha a conversa.", 400);
  const wantSummary = req.body?.summary !== false;
  const wantPdf = req.body?.pdf !== false;
  if (!wantSummary && !wantPdf) throw new AppError("Escolha enviar o resumo, o PDF ou os dois.", 400);
  await assertTicketAccess(req, ticketId, "send");
  const ticket = await ShowTicketService(ticketId);
  if (ticket.status === "closed") throw new AppError("Só é possível enviar para conversas abertas.", 400);
  if (wantSummary && g.whatsappSummary) await SendWhatsAppMessage({ body: g.whatsappSummary, ticket });
  if (wantPdf) {
    const source = gradePath(g);
    if (!fs.existsSync(source)) throw new AppError("O PDF desta grade não está mais disponível.", 410);
    // SendWhatsAppMedia consumes the file it sends: hand it a copy
    const copyName = `grade-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.pdf`;
    fs.copyFileSync(source, path.join(PUBLIC_DIR, copyName));
    await SendWhatsAppMedia({
      media: { filename: copyName, originalname: `${g.courseName}.pdf`.replace(/[\\/:*?"<>|]/g, "_"), mimetype: "application/pdf", path: path.join(PUBLIC_DIR, copyName) } as Express.Multer.File,
      ticket,
      body: ""
    });
  }
  return res.json({ ok: true });
};
