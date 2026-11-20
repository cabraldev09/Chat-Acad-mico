import { Request, Response } from "express";

import { institutionName } from "../helpers/Institution";
import { TEMPLATE_PACK, allTemplates, createTemplate, linkApproved, sendTemplatePack } from "../services/CampaignServices/Templates";

// Configurações → Modelos da Meta: every template of the WhatsApp account with its status, a new one (always Utility) and the recommended pack
export const index = async (req: Request, res: Response): Promise<Response> => {
  const whatsappId = Number(req.query.whatsappId) || null;
  const templates = await allTemplates(whatsappId);
  const linked = await linkApproved(institutionName(), templates);
  const status = new Map(templates.map(t => [t.name, t.status]));
  return res.json({ templates, linked, pack: TEMPLATE_PACK(institutionName()).map(t => ({ ...t, created: status.has(t.name), status: status.get(t.name) || null })) });
};

export const store = async (req: Request, res: Response): Promise<Response> =>
  res.status(201).json(await createTemplate(req.body || {}, Number(req.body?.whatsappId) || null));

export const pack = async (req: Request, res: Response): Promise<Response> =>
  res.json({ results: await sendTemplatePack(institutionName(), Number(req.body?.whatsappId) || null) });
