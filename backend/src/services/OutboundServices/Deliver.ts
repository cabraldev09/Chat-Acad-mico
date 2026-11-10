import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";
import { Op } from "sequelize";
import sequelize from "../../database";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import Message from "../../models/Message";
import OutboundDelivery from "../../models/OutboundDelivery";
import { getSetting } from "../../helpers/AppSettings";
import { dayBounds } from "../../helpers/AppTime";
import AppError from "../../errors/AppError";
import { isWithinBusinessHours } from "../AutomationServices/BusinessHours";
import { inMessagingWindow, validateTemplate } from "./Policy";

const context = new AsyncLocalStorage<number>();
export interface SendPolicy {
  key?: string;
  automated?: boolean;
  optOutNotice?: boolean;
  outsideHoursNotice?: boolean;
  template?: { name: string; language: string; params: string[] } | null;
}

export const deliver = async <T extends { id: any }>(ticket: Ticket, options: SendPolicy, send: () => Promise<T>): Promise<T> => {
  // Nested calls from SendToContact are already reserved; direct inbox/bot sends use the same gate.
  if (context.getStore() === ticket.id) return send();
  const key = options.key || randomUUID();
  const prior = await OutboundDelivery.findOne({ where: { key } });
  if (prior) {
    if (prior.contactId !== ticket.contactId || prior.whatsappId !== ticket.whatsappId) throw new AppError("ERR_DELIVERY_KEY_CONFLICT", 409);
    if (prior.status === "sent" && prior.externalId) return { id: prior.externalId } as T;
    throw new AppError("ERR_DELIVERY_UNCERTAIN", 409);
  }
  const [contact, whatsapp] = await Promise.all([Contact.findByPk(ticket.contactId), Whatsapp.findByPk(ticket.whatsappId)]);
  if (!contact || !whatsapp) throw new AppError("ERR_NO_WAPP_FOUND", 404);
  if (contact.optOut && !options.optOutNotice) throw new AppError("ERR_CONTACT_OPTED_OUT", 409);
  if (options.automated && !options.optOutNotice && !options.outsideHoursNotice && !isWithinBusinessHours(whatsapp)) throw new AppError("ERR_OUTSIDE_BUSINESS_HOURS", 409);
  const channel = whatsapp.channel || "whatsapp";
  const related = await Ticket.findAll({ where: { contactId: contact.id, whatsappId: whatsapp.id }, attributes: ["id"] });
  const inbound = await Message.findOne({
    where: { ticketId: related.map(t => t.id), fromMe: false, isDeleted: false }, order: [["createdAt", "DESC"]], attributes: ["createdAt"]
  });
  if (options.template) {
    if (channel !== "whatsapp_cloud" || !validateTemplate(options.template)) throw new AppError("ERR_TEMPLATE_INVALID", 400);
    if (await getSetting("outbound_allow_templates", "false") !== "true") throw new AppError("ERR_TEMPLATES_NOT_AUTHORIZED", 409);
  } else if (!inMessagingWindow(channel, inbound?.createdAt || null)) throw new AppError("ERR_MESSAGING_WINDOW_CLOSED", 409);
  const meta = ["whatsapp_cloud", "instagram", "messenger"].includes(channel);
  const rateRaw = await getSetting(options.template ? "outbound_meta_template_usd" : "outbound_meta_service_usd", "");
  const rate = meta && rateRaw !== "" && Number.isFinite(Number(rateRaw)) && Number(rateRaw) >= 0 ? Number(rateRaw) : null;
  const [dailyMessages, dailyUsd] = await Promise.all([getSetting("outbound_daily_messages", "0"), getSetting("outbound_daily_usd", "0")]);
  const row = await sequelize.transaction(async transaction => {
    if (sequelize.getDialect() === "postgres") await sequelize.query("SELECT pg_advisory_xact_lock(918272)", { transaction });
    const concurrent = await OutboundDelivery.findOne({ where: { key }, transaction });
    if (concurrent) throw new AppError(concurrent.contactId !== ticket.contactId || concurrent.whatsappId !== ticket.whatsappId ? "ERR_DELIVERY_KEY_CONFLICT" : "ERR_DELIVERY_UNCERTAIN", 409);
    const where = { createdAt: { [Op.gte]: dayBounds().start }, status: { [Op.in]: ["sending", "sent", "uncertain"] } };
    if (Number(dailyMessages) > 0 && await OutboundDelivery.count({ where, transaction }) >= Number(dailyMessages)) throw new AppError("ERR_OUTBOUND_BUDGET", 409);
    if (meta && Number(dailyUsd) > 0) {
      if (rate === null) throw new AppError("ERR_OUTBOUND_RATE_REQUIRED", 409);
      const unknown = await OutboundDelivery.count({ where: { ...where, channel: { [Op.in]: ["whatsapp_cloud", "messenger", "instagram"] }, estimatedUsd: { [Op.is]: null } }, transaction });
      if (unknown) throw new AppError("ERR_OUTBOUND_RATE_REQUIRED", 409);
      const spent = Number(await OutboundDelivery.sum("estimatedUsd", { where, transaction }) || 0);
      if (spent + rate > Number(dailyUsd)) throw new AppError("ERR_OUTBOUND_BUDGET", 409);
    }
    return OutboundDelivery.create({ key, ticketId: ticket.id, contactId: contact.id, whatsappId: whatsapp.id, channel, status: "sending", estimatedUsd: rate }, { transaction });
  });
  try {
    const result = await context.run(ticket.id, send);
    await row.update({ status: "sent", externalId: String(result.id), error: null });
    return result;
  } catch (err) {
    // A timeout or a persistence failure after sending is not proof of non-delivery.
    await row.update({ status: "uncertain", error: String(err.message || err).slice(0, 500) });
    throw err;
  }
};
