import { Op } from "sequelize";

import Campaign from "../models/Campaign";
import CampaignShipping from "../models/CampaignShipping";
import Whatsapp from "../models/Whatsapp";
import Contact from "../models/Contact";
import GetDefaultWhatsApp from "../helpers/GetDefaultWhatsApp";
import formatBody from "../helpers/Mustache";
import SendToContact from "../services/ChannelServices/SendToContact";
import { resolveOutboundContact } from "../services/ChannelServices/ResolveOutboundContact";
import { getIO } from "../libs/socket";
import { logger } from "../utils/logger";
import Mustache from "mustache";
import { checkCampaignSend } from "../services/SafetyServices/SendGuard";

interface RunState {
  nextAt: number;
  sentInBatch: number;
  running: boolean;
}

const states = new Map<number, RunState>();

const rand = (min: number, max: number): number =>
  Math.floor(min + Math.random() * (Math.max(max, min) - min + 1));

const emitCampaign = async (id: number) => {
  const campaign = await Campaign.findByPk(id);
  if (campaign) getIO().emit("campaign", { action: "update", row: campaign });
};

const processCampaign = async (campaign: Campaign): Promise<void> => {
  const state = states.get(campaign.id) || { nextAt: 0, sentInBatch: 0, running: false };
  states.set(campaign.id, state);
  if (state.running || Date.now() < state.nextAt) return;
  state.running = true;

  try {
    const fresh = await Campaign.findByPk(campaign.id);
    if (!fresh || fresh.status !== "running") return;

    const shipping = await CampaignShipping.findOne({
      where: { campaignId: fresh.id, status: "pending" },
      order: [["id", "ASC"]]
    });

    if (!shipping) {
      await fresh.update({ status: "finished", finishedAt: new Date() });
      states.delete(fresh.id);
      await emitCampaign(fresh.id);
      return;
    }

    const whatsapp = fresh.whatsappId
      ? await Whatsapp.findByPk(fresh.whatsappId)
      : await GetDefaultWhatsApp();
    if (!whatsapp || whatsapp.status !== "CONNECTED") {
      // pause quietly until the connection is back
      state.nextAt = Date.now() + 30000;
      return;
    }

    try {
      // Protects unofficial connections (opt-out, cold contacts, daily ceiling).
      // Decided from our own records BEFORE asking WhatsApp whether the number
      // exists: bulk number lookups are a ban signal too.
      const known =
        whatsapp.channel === "whatsapp" || whatsapp.channel === "whatsapp_cloud"
          ? await Contact.findOne({ where: { number: shipping.number.replace(/\D/g, "") } })
          : null;
      const block = await checkCampaignSend(whatsapp, known);
      if (block?.kind === "daily") {
        // keep everything pending and look again in an hour
        state.nextAt = Date.now() + 60 * 60 * 1000;
        await fresh.update({ pauseReason: block.reason });
        await emitCampaign(fresh.id);
        return;
      }
      if (block) {
        await shipping.update({ status: "failed", error: block.reason });
        state.nextAt = Date.now() + 500;
        await emitCampaign(fresh.id);
        return;
      }
      if (fresh.pauseReason) await fresh.update({ pauseReason: null });

      const contact = await resolveOutboundContact(whatsapp, shipping.number, shipping.name || "");
      const body = Mustache.render(fresh.message, {
        name: shipping.name || contact.name,
        number: shipping.number
      });
      await SendToContact({
        contact,
        whatsapp,
        body: formatBody(body, contact),
        mediaUrl: fresh.mediaUrl,
        template:
          whatsapp.channel === "whatsapp_cloud" && fresh.templateName
            ? {
                name: fresh.templateName,
                language: fresh.templateLanguage || "pt_BR",
                // {{1}} of the approved template receives the lead's first name
                params: [(shipping.name || contact.name || "").split(" ")[0]]
              }
            : null
      });
      await shipping.update({ status: "sent", sentAt: new Date(), message: body, error: null });
    } catch (err) {
      logger.warn(`Campaign ${fresh.id} -> ${shipping.number} failed: ${err}`);
      await shipping.update({
        status: "failed",
        error: String(err.message || err).slice(0, 500)
      });
    }

    state.sentInBatch += 1;
    if (state.sentInBatch >= fresh.batchSize) {
      state.sentInBatch = 0;
      state.nextAt = Date.now() + fresh.batchPause * 1000;
    } else {
      state.nextAt = Date.now() + rand(fresh.intervalMin, fresh.intervalMax) * 1000;
    }
    await emitCampaign(fresh.id);
  } catch (err) {
    logger.error(`Campaign runner error: ${err}`);
  } finally {
    state.running = false;
  }
};

const tick = async (): Promise<void> => {
  try {
    // scheduled campaigns whose time has come
    await Campaign.update(
      { status: "running", startedAt: new Date() },
      { where: { status: "scheduled", scheduledAt: { [Op.lte]: new Date() } } }
    );
    const running = await Campaign.findAll({ where: { status: "running" } });
    await Promise.all(running.map(processCampaign));
  } catch (err) {
    logger.error(`Campaign tick error: ${err}`);
  }
};

export const startCampaignRunner = (): void => {
  setInterval(tick, 3000);
};
