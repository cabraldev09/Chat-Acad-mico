import { Op } from "sequelize";

import AppError from "../../errors/AppError";
import { startOfTodayApp } from "../../helpers/AppTime";
import Contact from "../../models/Contact";
import Lead from "../../models/Lead";
import RetentionMessage from "../../models/RetentionMessage";
import Whatsapp from "../../models/Whatsapp";
import { logger } from "../../utils/logger";
import { insideServiceWindow } from "../ChannelServices/CloudWindow";
import { dailyColdLimit, hasConversed, isUnofficial, sentTodayByCampaigns } from "../SafetyServices/SendGuard";

// Every message the retention area sends is written down: what it said, to whom, by whom and whether it left. The log of
// "Envios" and the numbers of the operation read it. A failure to write the log never stops the message.
export type RetentionKind = "nps" | "risk" | "remat" | "custom";

export const logRetention = async (o: {
  lead?: Lead | null;
  // who it was when there is no lead
  name?: string | null;
  number?: string | null;
  contactId?: number | null;
  kind: RetentionKind;
  body: string;
  userId?: number | null;
  surveyId?: number | null;
  error?: string | null;
  withButtons?: boolean;
  whatsappId?: number | null;
}): Promise<void> => {
  try {
    await RetentionMessage.create({
      leadId: o.lead ? o.lead.id : null,
      contactId: o.contactId || (o.lead ? o.lead.contactId : null) || null,
      name: o.lead ? null : o.name ? String(o.name).slice(0, 160) : null,
      number: o.lead ? null : o.number ? String(o.number).slice(0, 40) : null,
      kind: o.kind,
      body: String(o.body || "").slice(0, 4000),
      userId: o.userId || null,
      surveyId: o.surveyId || null,
      status: o.error ? "failed" : "sent",
      error: o.error ? sendErrorText(o.error).slice(0, 400) : null,
      withButtons: !!o.withButtons,
      whatsappId: o.whatsappId || null
    } as any);
  } catch (err) {
    logger.warn(`Retention log not written: ${(err as Error).message}`);
  }
};

// on a QR Code connection the messages of the retention area go out a few seconds apart (never in a burst, which is what gets a
// number banned); the gap is a little different every time
const nextAt = new Map<number, number>();
const gap = async (whatsappId: number): Promise<void> => {
  const wait = (nextAt.get(whatsappId) || 0) - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  nextAt.set(whatsappId, Date.now() + 3500 + Math.floor(Math.random() * 4000));
};

// what a person reads when a message did not go out
const SEND_ERRORS: Record<string, string> = {
  ERR_CONTACT_OPTED_OUT: "O aluno pediu para não receber mensagens (SAIR).",
  ERR_CLOUD_WINDOW_CLOSED: "Fora das 24 horas da API oficial do WhatsApp: só sai por modelo aprovado. Informe um modelo na pesquisa ou espere o aluno escrever.",
  ERR_RETENTION_DAILY_LIMIT: "Limite diário de envios desta conexão por QR Code atingido. Continue amanhã para proteger o número.",
  ERR_RETENTION_COLD: "Esta pessoa nunca escreveu para este número e a conexão por QR Code está em modo seguro. Use a API oficial ou espere ela escrever.",
  ERR_RELATIONSHIP_WAPP_OFFLINE: "O número do relacionamento está desconectado. Reconecte em Conexões; o envio não sai pelo número do tutor.",
  ERR_RATE_LIMITED: "Envio em ritmo alto demais para proteger o número. Tente de novo em alguns minutos.",
  ERR_SENDING_WAPP_MSG: "O WhatsApp não aceitou o envio.",
  ERR_NO_DEF_WAPP_FOUND: "Não há conexão de WhatsApp disponível.",
  ERR_WAPP_NOT_INITIALIZED: "A conexão do WhatsApp não está pronta."
};
export const sendErrorText = (message: string): string => {
  const code = String(message || "").match(/ERR_[A-Z0-9_]+/)?.[0];
  if (code && SEND_ERRORS[code]) return SEND_ERRORS[code];
  return code ? "Não foi possível enviar." : String(message || "Não foi possível enviar.").slice(0, 300);
};

// Everything that must be true before a message goes to a student, to keep the number safe and the message deliverable:
//  - nobody who asked to stop (SAIR) receives anything;
//  - a connection by QR Code has a daily ceiling (the same warm-up ceiling as the campaigns, doubled for people who already
//    wrote to us), counting the campaigns and these messages together;
//  - the official API only sends free text and buttons during the 24 hours after the person wrote: outside it, `allowTemplate`
//    says the caller has an approved template to use, and otherwise the message is refused here instead of being refused by Meta.
export const assertCanSend = async (contact: Contact, whatsapp: Whatsapp, opts: { allowTemplate?: boolean } = {}): Promise<{ outsideWindow: boolean }> => {
  if (contact.optOut) throw new AppError("ERR_CONTACT_OPTED_OUT");
  if (isUnofficial(whatsapp)) {
    // a number that never answered is not written to by QR Code in the safe mode (what gets numbers banned)
    if (whatsapp.riskMode !== "relaxed" && !(await hasConversed(contact.id, whatsapp.id))) throw new AppError("ERR_RETENTION_COLD");
    const today = await RetentionMessage.count({ where: { status: "sent", whatsappId: whatsapp.id, createdAt: { [Op.gte]: startOfTodayApp() } } });
    if (today + (await sentTodayByCampaigns(whatsapp.id)) >= dailyColdLimit(whatsapp) * 2) throw new AppError("ERR_RETENTION_DAILY_LIMIT");
    await gap(whatsapp.id);
  }
  const outside = whatsapp.channel === "whatsapp_cloud" ? !(await insideServiceWindow(contact.id, whatsapp.id)) : false;
  if (outside && !opts.allowTemplate) throw new AppError("ERR_CLOUD_WINDOW_CLOSED");
  return { outsideWindow: outside };
};

// "{{nome}}" is the first name of the student; "{{periodo}}" the re-enrollment term
export const renderRetentionText = (text: string, name: string, extra: Record<string, string> = {}): string =>
  Object.entries({ nome: (name || "").trim().split(/\s+/)[0] || "", ...extra }).reduce(
    (t, [k, v]) => t.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), v),
    text
  );
