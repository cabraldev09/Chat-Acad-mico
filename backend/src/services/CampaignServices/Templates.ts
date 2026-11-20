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

export const wabaOf = async (accessToken: string, configured?: string): Promise<string[]> => {
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
export const TEMPLATE_VARIABLES = ["primeiro_nome", "nome", "curso", "polo", "consultor", "numero", "vencimento", "valor", "prazo", "situacao", "tutoria"] as const;
export const templateValues = async (contactId: number | null, name: string, number: string): Promise<Record<string, string>> => {
  const { getSetting } = await import("../../helpers/AppSettings");
  const prazo = await getSetting("rematricula_prazo", "");
  const { tutoriaNumber, prettyPhone } = await import("../CrmServices/TutoriaContact");
  const tutoria = prettyPhone((await tutoriaNumber()).number);
  const base: Record<string, string> = { primeiro_nome: (name || "").split(" ")[0] || "", nome: name || "", numero: number || "", curso: "", polo: "", consultor: "", vencimento: "", valor: "", prazo, situacao: "cancelada", tutoria };
  if (!contactId) return base;
  const lead = await Lead.findOne({ where: { contactId }, attributes: ["id", "courseId", "poloId", "ownerId", "lostAt", "enrolledAt"], order: [["updatedAt", "DESC"]] });
  if (!lead) return base;
  // the open charge of the student (aviso de boleto): its due date and amount
  const Payment = (await import("../../models/Payment")).default;
  const due = await Payment.findOne({ where: { leadId: (lead as any).id, status: ["pending", "scheduled", "active", "waiting"] } as any, order: [["dueDate", "ASC"]], attributes: ["dueDate", "amount"] });
  if (due?.dueDate) base.vencimento = String(due.dueDate).slice(0, 10).split("-").reverse().join("/");
  if (due?.amount) base.valor = Number(due.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const [course, polo, owner] = await Promise.all([
    lead.courseId ? Course.findByPk(lead.courseId, { attributes: ["name"] }) : null,
    lead.poloId ? Polo.findByPk(lead.poloId, { attributes: ["name"] }) : null,
    lead.ownerId ? User.findByPk(lead.ownerId, { attributes: ["name"] }) : null
  ]);
  return { ...base, curso: course?.name || "", polo: polo?.name || "", consultor: (owner?.name || "").split(" ")[0], situacao: (lead as any).lostAt ? "cancelada" : (lead as any).enrolledAt ? "ativa" : "em aberto" };
};

// the parameters of the template for one person (the first name when nothing was chosen, as before) and the text as received
export const fillTemplate = (keys: string[], values: Record<string, string>, body: string | null): { params: string[]; text: string } => {
  const list = keys.length ? keys : ["primeiro_nome"];
  // the Meta refuses an empty parameter: a missing value becomes a neutral word
  const params = list.map(k => (values[k] || "").trim() || (k === "primeiro_nome" || k === "nome" ? "aluno(a)" : "-"));
  const text = body ? body.replace(/\{\{(\d+)\}\}/g, (_m, n) => params[Number(n) - 1] ?? "") : "";
  return { params, text };
};

// ---------------------------------------------------------------- creating templates on the Meta

// The recommended templates, all in the cheapest category (Utility): each one is a notice about something that already exists for the
// person (their enrollment, request, re-enrollment, charge), with no offer or promotion, which is what the Meta accepts as Utility.
// They are sent with allow_category_change=false: if the Meta judges one as Marketing it refuses it (it is never charged as Marketing).
export interface TemplateDraft { name: string; body: string; examples: string[]; purpose: string; setting?: string }
export const TEMPLATE_PACK = (institution: string): TemplateDraft[] => [
  { name: "abertura_atendimento", purpose: "Retomar o atendimento de matrícula fora das 24 h", setting: "atendimento_template_name",
    body: `Olá, {{1}}! Aqui é {{2}}, da ${institution}, sobre o seu atendimento de matrícula. Podemos continuar por aqui?`, examples: ["Maria", "Ana"] },
  { name: "abertura_tutoria", purpose: "A tutoria chamar o aluno fora das 24 h", setting: "tutoria_template_name",
    body: `Olá, {{1}}! Aqui é {{2}}, da tutoria da ${institution}, sobre o acompanhamento do seu curso. Podemos falar por aqui?`, examples: ["Maria", "Paula"] },
  { name: "abertura_relacionamento", purpose: "Relacionamento com o aluno (retenção) fora das 24 h",
    body: `Olá, {{1}}! Aqui é {{2}}, do relacionamento com o aluno da ${institution}, sobre a sua matrícula. Podemos falar por aqui?`, examples: ["Maria", "Carla"] },
  { name: "acompanhamento_solicitacao", purpose: "Follow-up de quem pediu informações",
    body: "Olá, {{1}}! A sua solicitação de informações sobre o curso {{2}} continua aberta. Para seguir com o atendimento, é só responder esta mensagem.", examples: ["Maria", "Pedagogia"] },
  { name: "aviso_rematricula", purpose: "Rematrícula (aluno ativo)",
    body: "Olá, {{1}}! O período de rematrícula do seu curso {{2}} vai até {{3}}. Se precisar de ajuda para concluir, responda esta mensagem.", examples: ["Maria", "Pedagogia", "15/01/2027"] },
  { name: "situacao_matricula", purpose: "Aluno cancelado ou trancado: retorno ao curso",
    body: "Olá, {{1}}! Consta no nosso sistema que a sua matrícula no curso {{2}} está {{3}}. Se quiser verificar como regularizar, responda esta mensagem.", examples: ["Maria", "Pedagogia", "cancelada"] },
  { name: "aviso_boleto", purpose: "Aviso do boleto da mensalidade",
    body: "Olá, {{1}}! O boleto da mensalidade do curso {{2}} vence em {{3}}. Se já pagou, desconsidere esta mensagem. Para receber a segunda via, responda aqui.", examples: ["Maria", "Pedagogia", "10/12/2026"] },
  { name: "boas_vindas_matricula", purpose: "Matrícula confirmada: o número da tutoria", setting: "boas_vindas_template_name",
    body: `Olá, {{1}}! A sua matrícula no curso {{2}} está confirmada. Quem acompanha você é {{3}}, da tutoria da ${institution}, pelo número {{4}}. Mande uma mensagem nesse número para agendar a sua ambientação.`, examples: ["Maria", "Pedagogia", "Ana Paula", "+55 (69) 99325-8103"] }
];

const cloudConnection = async (whatsappId?: number | null): Promise<Whatsapp> => {
  const w = whatsappId ? await Whatsapp.findByPk(whatsappId) : await Whatsapp.findOne({ where: { channel: "whatsapp_cloud" }, order: [["id", "ASC"]] });
  if (!w || w.channel !== "whatsapp_cloud") throw new AppError("ERR_TEMPLATES_UNSUPPORTED", 400);
  return w;
};

const accountOf = async (w: Whatsapp): Promise<{ waba: string; token: string }> => {
  const { accessToken, wabaId } = getConfig(w);
  if (!accessToken) throw new AppError("ERR_TEMPLATES_UNSUPPORTED", 400);
  const wabas = await wabaOf(accessToken, wabaId).catch(() => [] as string[]);
  if (!wabas.length) throw new AppError("ERR_TEMPLATES_NO_WABA", 400);
  return { waba: wabas[0], token: accessToken };
};

export interface TemplateStatus { name: string; language: string; category: string; status: string; reason: string | null; body: string }
export const allTemplates = async (whatsappId?: number | null): Promise<TemplateStatus[]> => {
  const { waba, token } = await accountOf(await cloudConnection(whatsappId));
  const { data } = await axios.get(`${GRAPH}/${waba}/message_templates`, { params: { fields: "name,language,category,status,rejected_reason,components", limit: 200, access_token: token }, timeout: 20000 });
  return (data?.data || []).map((t: any) => ({
    name: t.name, language: t.language, category: t.category, status: t.status,
    reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
    body: String(((t.components || []).find((c: any) => c.type === "BODY") || {}).text || "")
  })).sort((a: TemplateStatus, b: TemplateStatus) => a.name.localeCompare(b.name));
};

export const cleanDraft = (d: Partial<TemplateDraft>): TemplateDraft => {
  const name = String(d.name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
  const body = String(d.body || "").trim().slice(0, 1024);
  if (!name || !body) throw new AppError("ERR_TEMPLATE_INVALID", 400);
  const n = paramsIn(body);
  const examples = (Array.isArray(d.examples) ? d.examples : []).map(e => String(e || "").trim()).slice(0, n);
  if (examples.length < n || examples.some(e => !e)) throw new AppError("ERR_TEMPLATE_EXAMPLES", 400);
  return { name, body, examples, purpose: String(d.purpose || "").slice(0, 120) };
};

// one template, always Utility and never moved to another category by the Meta
export const createTemplate = async (draft: Partial<TemplateDraft>, whatsappId?: number | null): Promise<{ name: string; id: string | null; status: string }> => {
  const d = cleanDraft(draft);
  const { waba, token } = await accountOf(await cloudConnection(whatsappId));
  const body: any = { type: "BODY", text: d.body };
  if (d.examples.length) body.example = { body_text: [d.examples] };
  try {
    const { data } = await axios.post(`${GRAPH}/${waba}/message_templates`, {
      name: d.name, language: "pt_BR", category: "UTILITY", allow_category_change: false, components: [body]
    }, { params: { access_token: token }, timeout: 20000 });
    return { name: d.name, id: data?.id || null, status: String(data?.status || "PENDING") };
  } catch (err: any) {
    const e = err?.response?.data?.error;
    throw new AppError(`A Meta recusou o modelo ${d.name}: ${e?.error_user_msg || e?.message || err.message}`, 400);
  }
};

// the recommended pack: creates the ones that do not exist yet and points the settings (opening of each team, welcome) to them
export const sendTemplatePack = async (institution: string, whatsappId?: number | null): Promise<Array<{ name: string; result: string }>> => {
  const existing = new Set((await allTemplates(whatsappId)).map(t => t.name));
  const out: Array<{ name: string; result: string }> = [];
  for (const t of TEMPLATE_PACK(institution)) {
    try {
      if (existing.has(t.name)) out.push({ name: t.name, result: "já existe" });
      // eslint-disable-next-line no-await-in-loop
      else out.push({ name: t.name, result: `enviado (${(await createTemplate(t, whatsappId)).status})` });
    } catch (err) {
      out.push({ name: t.name, result: (err as Error).message });
    }
  }
  return out;
};

// once the Meta approves a template of the pack, it takes its place in the setting that uses it (opening of the department, welcome),
// unless the administration already chose another one; a template under review is never used (the Meta would refuse the send)
export const linkApproved = async (institution: string, templates: TemplateStatus[]): Promise<string[]> => {
  const { getSetting, setSetting } = await import("../../helpers/AppSettings");
  const approved = new Set(templates.filter(t => t.status === "APPROVED").map(t => t.name));
  const linked: string[] = [];
  for (const t of TEMPLATE_PACK(institution)) {
    // eslint-disable-next-line no-await-in-loop
    if (t.setting && approved.has(t.name) && !String(await getSetting(t.setting, "")).trim()) {
      // eslint-disable-next-line no-await-in-loop
      await setSetting(t.setting, t.name);
      linked.push(t.name);
    }
  }
  return linked;
};
