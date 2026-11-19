import axios from "axios";

import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import Lead from "../../models/Lead";
import Course from "../../models/Course";
import Polo from "../../models/Polo";
import User from "../../models/User";
import { GRAPH } from "../../channels/meta";
import { getConfig } from "../../channels/types";

// The approved templates of an official number, read on the Meta: the campaign picks one from a list (instead of typing its name)
// and sees its real text. The WhatsApp account (WABA) of the number comes from the connection, or from the token's own scopes.
export interface TemplateView { name: string; language: string; category: string; body: string; params: number; header: string | null; footer: string | null }

const wabaOf = async (accessToken: string, configured?: string): Promise<string[]> => {
  if (configured) return [String(configured).trim()];
  const { data } = await axios.get(`${GRAPH}/debug_token`, { params: { input_token: accessToken, access_token: accessToken }, timeout: 15000 });
  const scopes: any[] = data?.data?.granular_scopes || [];
  const ids = scopes.filter(s => s.scope === "whatsapp_business_management").flatMap(s => s.target_ids || []);
  return [...new Set(ids.map(String))];
};

export const paramsIn = (text: string): number => {
  const found = [...String(text || "").matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]));
  return found.length ? Math.max(...found) : 0;
};

export const approvedTemplates = async (whatsappId: number): Promise<TemplateView[]> => {
  const whatsapp = await Whatsapp.findByPk(whatsappId);
  if (!whatsapp || whatsapp.channel !== "whatsapp_cloud") throw new AppError("ERR_TEMPLATES_UNSUPPORTED", 400);
  const { accessToken, wabaId } = getConfig(whatsapp);
  if (!accessToken) throw new AppError("ERR_TEMPLATES_UNSUPPORTED", 400);
  let wabas: string[] = [];
  try { wabas = await wabaOf(accessToken, wabaId); } catch (err) { wabas = []; }
  if (!wabas.length) throw new AppError("ERR_TEMPLATES_NO_WABA", 400);
  const out: TemplateView[] = [];
  for (const waba of wabas) {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await axios.get(`${GRAPH}/${waba}/message_templates`, {
      params: { status: "APPROVED", fields: "name,language,category,components,status", limit: 200, access_token: accessToken }, timeout: 20000
    });
    (data?.data || []).forEach((t: any) => {
      const comp = (type: string) => (t.components || []).find((c: any) => c.type === type);
      const body = String(comp("BODY")?.text || "");
      out.push({ name: t.name, language: t.language, category: t.category, body, params: paramsIn(body), header: comp("HEADER")?.text || null, footer: comp("FOOTER")?.text || null });
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
};

// the values the {{n}} of a template can take, for one person of the list
export const TEMPLATE_VARIABLES = ["primeiro_nome", "nome", "curso", "polo", "consultor", "numero"] as const;
export const templateValues = async (contactId: number | null, name: string, number: string): Promise<Record<string, string>> => {
  const base: Record<string, string> = { primeiro_nome: (name || "").split(" ")[0] || "", nome: name || "", numero: number || "", curso: "", polo: "", consultor: "" };
  if (!contactId) return base;
  const lead = await Lead.findOne({ where: { contactId }, attributes: ["courseId", "poloId", "ownerId"], order: [["updatedAt", "DESC"]] });
  if (!lead) return base;
  const [course, polo, owner] = await Promise.all([
    lead.courseId ? Course.findByPk(lead.courseId, { attributes: ["name"] }) : null,
    lead.poloId ? Polo.findByPk(lead.poloId, { attributes: ["name"] }) : null,
    lead.ownerId ? User.findByPk(lead.ownerId, { attributes: ["name"] }) : null
  ]);
  return { ...base, curso: course?.name || "", polo: polo?.name || "", consultor: (owner?.name || "").split(" ")[0] };
};

// the parameters of the template for one person (the first name when nothing was chosen, as before) and the text as received
export const fillTemplate = (keys: string[], values: Record<string, string>, body: string | null): { params: string[]; text: string } => {
  const list = keys.length ? keys : ["primeiro_nome"];
  // the Meta refuses an empty parameter: a missing value becomes a neutral word
  const params = list.map(k => (values[k] || "").trim() || (k === "primeiro_nome" || k === "nome" ? "aluno(a)" : "-"));
  const text = body ? body.replace(/\{\{(\d+)\}\}/g, (_m, n) => params[Number(n) - 1] ?? "") : "";
  return { params, text };
};
