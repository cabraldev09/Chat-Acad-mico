import { Op } from "sequelize";

import AutomationTrigger from "../../models/AutomationTrigger";
import ChatFlow from "../../models/ChatFlow";
import Lead from "../../models/Lead";
import Ticket from "../../models/Ticket";
import { logger } from "../../utils/logger";
import { startFlowForTicket } from "./Runner";

// What the system can tell the triggers about. A trigger picks one event, optionally narrows it with a filter and runs a
// published flow on the conversation of the person.
export interface EventDef {
  key: string;
  label: string;
  group: string;
  available: boolean;
  // filters the trigger may set (stored in its config)
  filters?: Array<{ key: string; label: string; kind: "stage" | "tag" | "user" | "text" }>;
  note?: string;
}

export const EVENTS: EventDef[] = [
  { key: "contact.created", label: "Novo contato", group: "Contatos", available: true },
  { key: "lead.created", label: "Novo lead no CRM", group: "CRM", available: true },
  { key: "stage.changed", label: "Lead mudou de etapa", group: "CRM", available: true, filters: [{ key: "stageId", label: "Para a etapa", kind: "stage" }] },
  { key: "enrollment.confirmed", label: "Matrícula confirmada", group: "CRM", available: true },
  { key: "fee.paid", label: "Taxa de matrícula paga", group: "CRM", available: true },
  { key: "affiliate.referral", label: "Indicação de afiliado", group: "CRM", available: true },
  { key: "tag.added", label: "Etiqueta colocada", group: "Etiquetas", available: true, filters: [{ key: "tagId", label: "Etiqueta", kind: "tag" }] },
  { key: "tag.removed", label: "Etiqueta retirada", group: "Etiquetas", available: true, filters: [{ key: "tagId", label: "Etiqueta", kind: "tag" }] },
  { key: "ticket.opened", label: "Conversa em atendimento", group: "Conversas", available: true },
  { key: "ticket.pending", label: "Conversa aguardando", group: "Conversas", available: true },
  { key: "ticket.closed", label: "Conversa finalizada", group: "Conversas", available: true },
  { key: "ticket.assigned", label: "Conversa atribuída a um atendente", group: "Conversas", available: true, filters: [{ key: "userId", label: "Atendente", kind: "user" }] },
  { key: "message.agent_sent", label: "Atendente enviou uma mensagem", group: "Mensagens", available: true },
  { key: "message.reaction", label: "Contato reagiu a uma mensagem", group: "Mensagens", available: true, filters: [{ key: "emoji", label: "Reação (ex.: 👍)", kind: "text" }] },
  { key: "nps.answered", label: "Aluno respondeu a pesquisa de satisfação", group: "CRM", available: true, filters: [{ key: "category", label: "Resposta (promoter, neutral ou detractor)", kind: "text" }] },
  { key: "documents.complete", label: "Documentos do aluno completos", group: "CRM", available: true },
  { key: "lead.idle", label: "Lead parado: não responde há alguns dias", group: "CRM", available: true, filters: [{ key: "days", label: "Dias sem resposta do lead", kind: "text" }], note: "Roda na conversa aberta do lead, uma vez por silêncio. O lead precisa estar em uma etapa aberta e já ter sido contatado." },
  { key: "deadline.near", label: "Prazo de matrícula se aproximando", group: "CRM", available: true, filters: [{ key: "daysBefore", label: "Dias antes do prazo", kind: "text" }], note: "Cadastre o prazo de cada período em Configurações → Atendimento e CRM. Vale para leads do período que ainda não se matricularam." },
  { key: "datetime", label: "Data e hora", group: "Tempo", available: false, note: "Em breve: rodar o fluxo em um dia e horário." },
  { key: "field.changed", label: "Campo do lead mudou", group: "CRM", available: false, note: "Em breve." },
  { key: "shopify", label: "Pedido na Shopify", group: "Lojas e pagamentos", available: false, note: "Não se aplica: o sistema não tem loja." },
  { key: "woocommerce", label: "Pedido no WooCommerce", group: "Lojas e pagamentos", available: false, note: "Não se aplica: o sistema não tem loja." },
  { key: "stripe", label: "Pagamento no Stripe", group: "Lojas e pagamentos", available: false, note: "Não se aplica: os pagamentos são pela Efí." },
  { key: "calendly", label: "Agendamento no Calendly", group: "Integrações", available: false, note: "Não se aplica." },
  { key: "tiktok", label: "Evento do TikTok", group: "Canais", available: false, note: "Não se aplica: o canal não está conectado." },
  { key: "email.optin", label: "Inscrição ou saída de e-mail e SMS", group: "Canais", available: false, note: "Não se aplica: o sistema não envia e-mail ou SMS em massa." }
];

// a trigger must not start the same flow on the same conversation again and again (a flow that tags the lead could
// otherwise call itself through "tag added")
const recent = new Map<string, number>();
const COOLDOWN_MS = 10 * 60 * 1000;

const parseConfig = (raw: string): Record<string, any> => {
  try {
    return JSON.parse(raw || "{}");
  } catch (e) {
    return {};
  }
};

const matches = (config: Record<string, any>, ctx: Record<string, any>): boolean =>
  Object.entries(config).every(([k, v]) => {
    if (v === undefined || v === null || v === "") return true;
    if (k === "emoji") return String(ctx.emoji || "").includes(String(v));
    return String(ctx[k]) === String(v);
  });

// the conversation where the flow talks: the one of the event, else the latest open one of the person
const ticketFor = async (ctx: Record<string, any>): Promise<number | null> => {
  if (ctx.ticketId) return Number(ctx.ticketId);
  let contactId = ctx.contactId ? Number(ctx.contactId) : null;
  if (!contactId && ctx.leadId) contactId = (await Lead.findByPk(Number(ctx.leadId), { attributes: ["contactId"] }))?.contactId || null;
  if (!contactId) return null;
  const t = await Ticket.findOne({ where: { contactId, status: { [Op.in]: ["open", "pending"] }, isGroup: false } as any, order: [["updatedAt", "DESC"]], attributes: ["id"] });
  return t ? t.id : null;
};

export const emitEvent = async (event: string, ctx: Record<string, any>): Promise<void> => {
  if (!EVENTS.some(e => e.key === event && e.available)) return;
  const triggers = await AutomationTrigger.findAll({ where: { event, active: true, flowId: { [Op.ne]: null } } as any });
  if (!triggers.length) return;
  const ticketId = await ticketFor(ctx);
  if (!ticketId) return;
  for (const trigger of triggers) {
    if (!matches(parseConfig(trigger.config), ctx)) continue;
    const key = `${trigger.id}:${ticketId}`;
    if (Date.now() - (recent.get(key) || 0) < COOLDOWN_MS) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      const flow = await ChatFlow.findByPk(trigger.flowId);
      if (!flow || flow.status !== "published") continue;
      // eslint-disable-next-line no-await-in-loop
      const started = await startFlowForTicket(flow.id, ticketId);
      if (started) {
        recent.set(key, Date.now());
        // eslint-disable-next-line no-await-in-loop
        await trigger.update({ runCount: trigger.runCount + 1, lastRunAt: new Date() });
      }
    } catch (err) {
      logger.warn(`trigger ${trigger.id} failed: ${err}`);
    }
  }
  if (recent.size > 5000) recent.clear();
};
