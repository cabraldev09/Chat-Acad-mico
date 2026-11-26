import { Request, Response } from "express";

import { institutionName } from "../helpers/Institution";
import { DEPARTMENTS, TEMPLATE_PACK, fullPack, allTemplates, createTemplate, deleteTemplate, linkApproved, notifyTemplates, sendTemplatePack, templatesInfo } from "../services/CampaignServices/Templates";

// Configurações → Modelos da Meta: every template of the WhatsApp account with its status and department, a new one (always Utility),
// the recommended pack, and removing an old one. The screen follows the changes live (socket "metaTemplates").
export const index = async (req: Request, res: Response): Promise<Response> => {
  const whatsappId = Number(req.query.whatsappId) || null;
  const templates = await allTemplates(whatsappId);
  const linked = await linkApproved(institutionName(), templates);
  const status = new Map(templates.map(t => [t.name, t.status]));
  const category = new Map(templates.map(t => [t.name, t.category]));
  const pack = await fullPack(institutionName());
  const info = await templatesInfo();
  const packOf = new Map(pack.map(p => [p.name, p]));
  return res.json({
    departments: DEPARTMENTS,
    templates: templates.map(t => {
      const p = packOf.get(t.name);
      const i = info[t.name] || {};
      return { ...t, inPack: !!p, department: p?.department || i.department || null, use: p?.use || i.use || null, purpose: p?.purpose || i.purpose || null };
    }),
    linked,
    pack: pack.map(t => ({ ...t, created: status.has(t.name), status: status.get(t.name) || null, category: category.get(t.name) || null }))
  });
};

export const store = async (req: Request, res: Response): Promise<Response> =>
  res.status(201).json(await createTemplate(req.body || {}, Number(req.body?.whatsappId) || null));

export const pack = async (req: Request, res: Response): Promise<Response> => {
  const results = await sendTemplatePack(institutionName(), Number(req.body?.whatsappId) || null);
  notifyTemplates();
  return res.json({ results });
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  await deleteTemplate(req.params.name, Number(req.query.whatsappId) || null);
  return res.json({ ok: true });
};
