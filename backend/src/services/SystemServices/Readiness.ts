import { Op } from "sequelize";

import { getSetting } from "../../helpers/AppSettings";
import { getSecretSetting } from "../../helpers/SecretSettings";
import { getConfig } from "../../channels/types";
import Whatsapp from "../../models/Whatsapp";
import Polo from "../../models/Polo";
import PoloMember from "../../models/PoloMember";
import { mailConfigured } from "../MailServices/SendMail";
import { connectionOfTeam } from "../ChannelServices/ConnectionTeam";

// Configurações → Prontidão do sistema: what still has to be set before the team works on the system, each item with what is missing and
// where to fix it. Read-only: nothing here changes a setting.
export interface ReadinessItem { key: string; label: string; ok: boolean; level: "required" | "recommended"; detail: string; where: string }

export const readiness = async (): Promise<ReadinessItem[]> => {
  const out: ReadinessItem[] = [];
  const add = (key: string, label: string, ok: boolean, level: ReadinessItem["level"], detail: string, where: string) => out.push({ key, label, ok, level, detail, where });

  const ai = (await getSecretSetting("ai_anthropic_key")) || (await getSecretSetting("ai_openai_key")) || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  add("ai", "Chave de IA", !!ai, "required", ai ? "Configurada." : "Sem chave, o agente e o copiloto não respondem.", "Agentes de IA → Chaves");

  const cloud = await Whatsapp.findAll({ where: { channel: "whatsapp_cloud" } as any });
  const down = cloud.filter(w => w.status !== "CONNECTED");
  add("numbers", "Números oficiais conectados", cloud.length > 0 && !down.length, "required",
    !cloud.length ? "Nenhum número da API oficial cadastrado." : down.length ? `Fora do ar: ${down.map(w => w.name).join(", ")}.` : `${cloud.length} número(s) conectado(s).`, "Conexões");
  const soon = cloud.filter(w => { const at = Number(getConfig(w).tokenExpiresAt || 0); return at > 0 && at - Date.now() < 15 * 86400000; });
  add("token", "Validade do token da Meta", !soon.length, "required",
    soon.length ? `Vence em menos de 15 dias: ${soon.map(w => `${w.name} (${new Date(Number(getConfig(w).tokenExpiresAt)).toLocaleDateString("pt-BR")})`).join(", ")}.` : "Nenhum token perto de vencer.", "Conexões → número → App ID e chave secreta");

  const tutoriaLine = await connectionOfTeam("tutoria");
  const tutoriaNumber = String(await getSetting("tutoria_numero", "")).replace(/\D/g, "") || (tutoriaLine && tutoriaLine.channel === "whatsapp_cloud" ? String(tutoriaLine.session || "").replace(/\D/g, "") : "");
  add("tutoria", "Número da Tutoria", !!tutoriaNumber, "required", tutoriaNumber ? `O aluno recebe o número ${tutoriaNumber} na matrícula.` : "Sem número, o aluno não recebe o contato da tutoria ao se matricular.", "Configurações → Tutoria");

  const allowed = (await getSetting("outbound_allow_templates", "false")) === "true";
  add("templates_allowed", "Envio de modelos autorizado", allowed, "required", allowed ? "Autorizado." : "Sem autorização, nada sai fora das 24 horas (abertura, boas-vindas, campanhas com modelo).", "Configurações → Operação e custos");
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
  add("hours", "Horário de atendimento", hoursOn, "recommended", hoursOn ? "Definido: prazos e alertas contam só o expediente." : "Sem horário, os prazos contam as 24 horas do dia.", "Configurações → Horário e prazos");

  const polos = await Polo.findAll({ attributes: ["id", "name"] });
  const members = await PoloMember.findAll({ where: { poloId: { [Op.in]: polos.map(p => p.id) } } as any, attributes: ["poloId", "role"] });
  const lacking = polos.filter(p => !members.some(m => m.poloId === p.id && m.role === "comercial") || !members.some(m => m.poloId === p.id && m.role === "tutoria"));
  add("polos", "Polos com consultor e tutor", polos.length > 0 && !lacking.length, "recommended",
    !polos.length ? "Nenhum polo cadastrado." : lacking.length ? `Sem consultor ou tutor: ${lacking.slice(0, 8).map(p => p.name).join(", ")}${lacking.length > 8 ? ` e mais ${lacking.length - 8}` : ""}.` : "Todos os polos têm consultor e tutor.", "Polos e equipes");
  return out;
};
