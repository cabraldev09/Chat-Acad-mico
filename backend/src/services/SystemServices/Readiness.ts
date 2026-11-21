import { Op } from "sequelize";

import { getSetting } from "../../helpers/AppSettings";
import { getSecretSetting } from "../../helpers/SecretSettings";
import { getConfig } from "../../channels/types";
import Whatsapp from "../../models/Whatsapp";
import Polo from "../../models/Polo";
import PoloMember from "../../models/PoloMember";
import { mailConfigured } from "../MailServices/SendMail";
import { connectionOfTeam } from "../ChannelServices/ConnectionTeam";
import { lastWebhook } from "../../channels/WebhookLog";
import User from "../../models/User";
import Affiliate from "../../models/Affiliate";
import Contact from "../../models/Contact";
import Lead from "../../models/Lead";
import Payment from "../../models/Payment";
import { normalizePhone } from "../../helpers/Phone";
import { brPhoneVariants } from "../../helpers/PhoneVariants";

// Configurações → Prontidão do sistema: what still has to be set before the team works on the system, each item with what is missing and
// where to fix it. Read-only: nothing here changes a setting.
export interface ReadinessItem { key: string; label: string; ok: boolean; level: "required" | "recommended"; detail: string; where: string }

// "3 min", "2 h": how long ago something happened, for a warning that would otherwise read as if it were happening now
export const minutesAgo = (at: number): string => {
  const min = Math.max(0, Math.round((Date.now() - at) / 60000));
  return min < 60 ? `${min} min` : `${Math.round(min / 60)} h`;
};

export const readiness = async (): Promise<ReadinessItem[]> => {
  const out: ReadinessItem[] = [];
  const add = (key: string, label: string, ok: boolean, level: ReadinessItem["level"], detail: string, where: string) => out.push({ key, label, ok, level, detail, where });

  const ai = (await getSecretSetting("ai_anthropic_key")) || (await getSecretSetting("ai_openai_key")) || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  add("ai", "Chave de IA", !!ai, "required", ai ? "Configurada." : "Sem chave, o agente e o copiloto não respondem.", "Agentes de IA → Chaves");

  const cloud = await Whatsapp.findAll({ where: { channel: "whatsapp_cloud" } as any });
  const down = cloud.filter(w => w.status !== "CONNECTED");
  add("numbers", "Números oficiais conectados", cloud.length > 0 && !down.length, "required",
    !cloud.length ? "Nenhum número da API oficial cadastrado." : down.length ? `Fora do ar: ${down.map(w => w.name).join(", ")}.` : `${cloud.length} número(s) conectado(s).`, "Conexões");
  // what the Meta last did at each official number's webhook: a refused delivery means no message from the leads arrives at all
  const refused = cloud.map(w => ({ w, note: lastWebhook(w.id) })).filter(x => x.note && (x.note.outcome === "assinatura_invalida" || x.note.outcome === "sem_app_secret"));
  add("webhook", "Mensagens da Meta chegando", cloud.length > 0 && !refused.length, "required",
    refused.length
      ? `A Meta está enviando as mensagens, mas o sistema recusa: ${refused.map(x => `${x.w.name} (${x.note!.outcome === "sem_app_secret" ? "sem App Secret" : "o App Secret salvo não é o do app da Meta"}, última tentativa há ${minutesAgo(x.note!.at)})`).join(", ")}. Nenhuma mensagem dos leads entra até corrigir.`
      : cloud.length ? "Nenhuma recusa recente." : "Sem número oficial.",
    "Conexões → número → App ID e chave secreta (App Secret do app na Meta)");
  const soon = cloud.filter(w => { const at = Number(getConfig(w).tokenExpiresAt || 0); return at > 0 && at - Date.now() < 15 * 86400000; });
  add("token", "Validade do token da Meta", !soon.length, "required",
    soon.length ? `Vence em menos de 15 dias: ${soon.map(w => `${w.name} (${new Date(Number(getConfig(w).tokenExpiresAt)).toLocaleDateString("pt-BR")})`).join(", ")}.` : "Nenhum token perto de vencer.", "Conexões → número → App ID e chave secreta");

  const tutoriaLine = await connectionOfTeam("tutoria");
  const tutoriaNumber = String(await getSetting("tutoria_numero", "")).replace(/\D/g, "") || (tutoriaLine && tutoriaLine.channel === "whatsapp_cloud" ? String(tutoriaLine.session || "").replace(/\D/g, "") : "");
  add("tutoria", "Número da Tutoria", !!tutoriaNumber, "required", tutoriaNumber ? `O aluno recebe o número ${tutoriaNumber} na matrícula.` : "Sem número, o aluno não recebe o contato da tutoria ao se matricular.", "Configurações → Tutoria");

  const allowed = (await getSetting("outbound_allow_templates", "false")) === "true";
  add("templates_allowed", "Envio de modelos autorizado", allowed, "required", allowed ? "Autorizado." : "Sem autorização, nada sai fora das 24 horas (abertura, boas-vindas, campanhas com modelo).", "Configurações → Operação");
  const linked = await Promise.all(["atendimento_template_name", "tutoria_template_name", "boas_vindas_template_name"].map(k => getSetting(k, "")));
  const missing = ["abertura do atendimento", "abertura da tutoria", "boas-vindas da matrícula"].filter((_, i) => !String(linked[i] || "").trim());
  add("templates", "Modelos aprovados em uso", !missing.length, "required", missing.length ? `Falta modelo para: ${missing.join(", ")}.` : "Abertura do atendimento, da tutoria e boas-vindas com modelos aprovados.", "Configurações → Modelos da Meta");

  const efi = (await getSetting("efi_env", "sandbox")) === "production";
  add("efi", "Pagamentos (Efí) em produção", efi, "recommended", efi ? "Em produção: as cobranças são reais." : "Em teste (sandbox): boletos e Pix não são cobrados de verdade.", "Configurações → Pagamentos");

  const mail = await mailConfigured().catch(() => false);
  add("mail", "E-mail de envio", !!mail, "recommended", mail ? "Configurado." : "Sem e-mail, alertas e acessos não chegam por e-mail.", "Configurações → E-mail");

  const hours = await getSetting("business_hours", "");
  let hoursOn = false;
  try { hoursOn = !!JSON.parse(hours || "{}").enabled; } catch { hoursOn = false; }
  add("hours", "Horário de atendimento", hoursOn, "recommended", hoursOn ? "Definido: prazos e alertas contam só o expediente." : "Sem horário, os prazos contam as 24 horas do dia.", "Configurações → Atendimento e horário");

  const polos = await Polo.findAll({ attributes: ["id", "name"] });
  const members = await PoloMember.findAll({ where: { poloId: { [Op.in]: polos.map(p => p.id) } } as any, attributes: ["poloId", "role"] });
  const lacking = polos.filter(p => !members.some(m => m.poloId === p.id && m.role === "comercial") || !members.some(m => m.poloId === p.id && m.role === "tutoria"));
  add("polos", "Polos com consultor e tutor", polos.length > 0 && !lacking.length, "recommended",
    !polos.length ? "Nenhum polo cadastrado." : lacking.length ? `Sem consultor ou tutor: ${lacking.slice(0, 8).map(p => p.name).join(", ")}${lacking.length > 8 ? ` e mais ${lacking.length - 8}` : ""}.` : "Todos os polos têm consultor e tutor.", "Polos e equipes");

  // the team: everyone who attends has working hours and the number they send from
  const team = await User.findAll({ where: { role: { [Op.in]: ["consultor", "tutor", "academico", "relacionamento"] } } as any, attributes: ["id", "name", "whatsappId"] });
  const names = (list: User[]) => `${list.slice(0, 8).map(u => u.name).join(", ")}${list.length > 8 ? ` e mais ${list.length - 8}` : ""}`;
  let schedules: Record<string, any> = {};
  try { schedules = JSON.parse(await getSetting("analytics_config", "{}")).schedules || {}; } catch { schedules = {}; }
  const noHours = team.filter(u => !Object.values(schedules[String(u.id)] || {}).some((d: any) => Array.isArray(d) && d.length));
  add("users_hours", "Horário de cada pessoa", !noHours.length, "recommended", noHours.length ? `Sem horário de trabalho: ${names(noHours)}.` : "Toda a equipe tem horário de trabalho.", "Usuários → editar a pessoa");
  const noNumber = team.filter(u => !u.whatsappId);
  add("users_number", "Número de cada pessoa", !noNumber.length, "recommended", noNumber.length ? `Sem o número que usam: ${names(noNumber)}.` : "Toda a equipe tem o número oficial definido.", "Usuários → editar a pessoa");

  // the affiliates: each one with a consultant (their messages to the official number go to that person), and none counted as a lead
  const affiliates = await Affiliate.findAll({ where: { status: "active" } as any, attributes: ["id", "name", "ownerId"] });
  const ownerIds = new Set((await User.findAll({ where: { id: affiliates.map(a => a.ownerId).filter(Boolean) as number[] }, attributes: ["id"] })).map(u => u.id));
  const orphan = affiliates.filter(a => !a.ownerId || !ownerIds.has(a.ownerId));
  add("affiliates_owner", "Afiliados com consultor", !orphan.length, "recommended", orphan.length ? `Sem consultor (a conversa deles fica na fila): ${orphan.slice(0, 8).map(a => a.name).join(", ")}${orphan.length > 8 ? ` e mais ${orphan.length - 8}` : ""}.` : "Todo afiliado tem um consultor.", "Afiliados");
  const asLeads = await affiliateLeads();
  add("affiliate_leads", "Afiliados fora do funil", !asLeads.length, "recommended", asLeads.length ? `${asLeads.length} afiliado(s) entraram no funil como lead quando escreveram. Eles não são interessados em estudar.` : "Nenhum afiliado contado como lead.", "Prontidão → Tirar do funil");
  return out;
};

// leads that are in fact affiliates (created when they wrote before the system knew them): only those without enrollment and payment
export const affiliateLeads = async (): Promise<Lead[]> => {
  const affiliates = await Affiliate.findAll({ where: { status: "active", phone: { [Op.ne]: null } } as any, attributes: ["phone"] });
  const numbers = [...new Set(affiliates.flatMap(a => brPhoneVariants(normalizePhone(a.phone) || "")))];
  if (!numbers.length) return [];
  const contacts = await Contact.findAll({ where: { number: { [Op.in]: numbers } } as any, attributes: ["id"] });
  if (!contacts.length) return [];
  const leads = await Lead.findAll({ where: { contactId: { [Op.in]: contacts.map(c => c.id) }, enrolledAt: null, wonAt: null, isHistorical: false } as any, attributes: ["id", "name", "contactId"] });
  const paid = new Set((await Payment.findAll({ where: { leadId: { [Op.in]: leads.map(l => l.id) }, status: "paid" } as any, attributes: ["leadId"] })).map(p => p.leadId));
  return leads.filter(l => !paid.has(l.id));
};
