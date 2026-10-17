import { Op } from "sequelize";

import Campaign from "../models/Campaign";
import CampaignShipping from "../models/CampaignShipping";
import Whatsapp from "../models/Whatsapp";
import Contact from "../models/Contact";
import { brPhoneVariants } from "../helpers/PhoneVariants";
import { getIO } from "../libs/socket";
import { logger } from "../utils/logger";
import { stepsOf } from "../helpers/CampaignText";
import { checkCampaignSend } from "../services/SafetyServices/SendGuard";
import { deliverStep, usesTemplate } from "../services/CampaignServices/Deliver";
import { ensureShippings } from "../services/CampaignServices/Shippings";

interface RunState {
  nextAt: number;
  sentInBatch: number;
  running: boolean;
}

const states = new Map<number, RunState>();

const rand = (min: number, max: number): number =>
  Math.floor(min + Math.random() * (Math.max(max, min) - min + 1));

// a campaign whose time came while the system was off by more than this is not fired late by itself: someone decides
const LATE_AFTER_MS = 6 * 3600 * 1000;

// tells the screens and the people why a running campaign is not sending right now (once: it only writes when it changes)
const waiting = async (campaign: Campaign, reason: string): Promise<void> => {
  if (campaign.pauseReason === reason) return;
  await campaign.update({ pauseReason: reason });
  getIO().emit("campaign", { action: "update", row: campaign });
};

const emitCampaign = async (id: number) => {
  const campaign = await Campaign.findByPk(id);
  if (campaign) getIO().emit("campaign", { action: "update", row: campaign });
};

// persisted so a restart neither skips the batch pause nor fires everything at once
const persist = (id: number, state: RunState) =>
  Campaign.update(
    { nextRunAt: new Date(state.nextAt), sentInBatch: state.sentInBatch },
    { where: { id } }
  ).catch(err => logger.warn(`Campaign ${id} state not saved: ${err}`));

const processCampaign = async (campaign: Campaign): Promise<void> => {
  let state = states.get(campaign.id);
  if (!state) {
    state = {
      nextAt: campaign.nextRunAt ? new Date(campaign.nextRunAt).getTime() : 0,
      sentInBatch: campaign.sentInBatch || 0,
      running: false
    };
    states.set(campaign.id, state);
  }
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
      : await Whatsapp.findOne({ where: { isDefault: true } });
    if (fresh.whatsappId && !whatsapp) {
      // the connection chosen for this campaign was deleted: it cannot go on by itself
      await fresh.update({ status: "paused", pauseReason: "A conexão escolhida para esta campanha foi removida. Edite a campanha e escolha outra." });
      await emitCampaign(fresh.id);
      return;
    }
    if (!whatsapp || whatsapp.status !== "CONNECTED") {
      // wait for the connection, saying so on the screen
      await waiting(fresh, whatsapp
        ? `Aguardando a conexão “${whatsapp.name}” voltar (situação: ${whatsapp.status || "desconhecida"}). Nada é perdido: a campanha continua sozinha.`
        : "Aguardando uma conexão padrão. Defina uma em Conexões ou escolha uma conexão na campanha.");
      state.nextAt = Date.now() + 30000;
      await persist(fresh.id, state);
      return;
    }

    // an approved template opens the chat; the following messages need the person's reply first
    const viaTemplate = usesTemplate(fresh, whatsapp);
    const steps = viaTemplate ? stepsOf(fresh).slice(0, 1) : stepsOf(fresh);
    const index = shipping.stepsDone || 0;
    const step = steps[index];
    if (!step) {
      // every message of the sequence already went out
      await shipping.update({ status: "sent", sentAt: shipping.sentAt || new Date(), error: null });
      state.nextAt = Date.now() + 500;
      await persist(fresh.id, state);
      return;
    }
    let finishedContact = false;

    try {
      // Protects unofficial connections (opt-out, cold contacts, daily ceiling).
      // Decided from our own records BEFORE asking WhatsApp whether the number
      // exists: bulk number lookups are a ban signal too.
      // (a number is the same person with or without the Brazilian ninth digit)
      const known =
        whatsapp.channel === "whatsapp" || whatsapp.channel === "whatsapp_cloud"
          ? await Contact.findOne({ where: { number: { [Op.in]: brPhoneVariants(shipping.number) } }, order: [["id", "ASC"]] })
          : null;
      // later messages of a sequence go to someone we already wrote to: only the opt-out is re-checked
      const block = index === 0
        ? await checkCampaignSend(whatsapp, known)
        : known?.optOut
          ? { kind: "contact" as const, reason: "Contato pediu para não receber mais mensagens durante a sequência." }
          : null;
      if (block?.kind === "daily") {
        // keep everything pending and look again in an hour
        state.nextAt = Date.now() + 60 * 60 * 1000;
        await fresh.update({ pauseReason: block.reason });
        await persist(fresh.id, state);
        await emitCampaign(fresh.id);
        return;
      }
      if (block) {
        await shipping.update({ status: "failed", error: block.reason });
        state.nextAt = Date.now() + 500;
        await persist(fresh.id, state);
        await emitCampaign(fresh.id);
        return;
      }
      if (fresh.pauseReason) await fresh.update({ pauseReason: null });

      const body = await deliverStep({ campaign: fresh, whatsapp, number: shipping.number, name: shipping.name || "", step, index });
      finishedContact = index + 1 >= steps.length;
      const sentText = [shipping.message, body].filter(Boolean).join("\n— — —\n").slice(0, 4000);
      await shipping.update(
        finishedContact
          ? { status: "sent", sentAt: new Date(), message: sentText, error: null, stepsDone: index + 1 }
          : { message: sentText, error: null, stepsDone: index + 1 }
      );
    } catch (err) {
      // the pace protection said "too fast": nothing was tried with this person, so it is not a failure; look again soon
      if (err && (String(err.message) === "ERR_RATE_LIMITED" || err.statusCode === 429)) {
        state.nextAt = Date.now() + 45000;
        await persist(fresh.id, state);
        return;
      }
      // a failed step is not retried (the earlier ones already reached the person)
      logger.warn(`Campaign ${fresh.id} -> ${shipping.number} step ${index + 1} failed: ${err}`);
      await shipping.update({
        status: "failed",
        error: `${steps.length > 1 ? `Mensagem ${index + 1} de ${steps.length}: ` : ""}${String(err.message || err)}`.slice(0, 500)
      });
      finishedContact = true;
    }

    if (!finishedContact) {
      // next message of the same person: a human-looking pause, not the campaign interval
      const wait = Math.max(3, steps[index + 1].delaySec || 0);
      state.nextAt = Date.now() + Math.round(wait * 1000 * (0.85 + Math.random() * 0.3));
    } else {
      state.sentInBatch += 1;
      if (state.sentInBatch >= fresh.batchSize) {
        state.sentInBatch = 0;
        state.nextAt = Date.now() + fresh.batchPause * 1000;
      } else {
        state.nextAt = Date.now() + rand(fresh.intervalMin, fresh.intervalMax) * 1000;
      }
    }
    await persist(fresh.id, state);
    await emitCampaign(fresh.id);
  } catch (err) {
    logger.error(`Campaign runner error: ${err}`);
  } finally {
    state.running = false;
  }
};

// scheduled campaigns whose time has come start by themselves (their recipients are copied from the list now if that was
// not done yet); one that is hours late, because the system was off, waits for a person to decide
const promoteScheduled = async (): Promise<void> => {
  const due = await Campaign.findAll({ where: { status: "scheduled", scheduledAt: { [Op.lte]: new Date() } } });
  for (const c of due) {
    try {
      if (c.scheduledAt && Date.now() - new Date(c.scheduledAt).getTime() > LATE_AFTER_MS) {
        // eslint-disable-next-line no-await-in-loop
        await c.update({ status: "paused", pauseReason: "O horário agendado passou com o sistema desligado. Confira a campanha e inicie quando quiser." });
      } else {
        // eslint-disable-next-line no-await-in-loop
        await ensureShippings(c);
        // eslint-disable-next-line no-await-in-loop
        await c.update({ status: "running", startedAt: c.startedAt || new Date(), pauseReason: null });
      }
    } catch (err) {
      // an empty list cannot start: the person is told instead of a campaign that "finishes" with nothing sent
      // eslint-disable-next-line no-await-in-loop
      await c.update({ status: "paused", pauseReason: "A lista de contatos está vazia. Adicione contatos e inicie a campanha." });
    }
    getIO().emit("campaign", { action: "update", row: c });
  }
};

const tick = async (): Promise<void> => {
  try {
    await promoteScheduled();
    const running = await Campaign.findAll({ where: { status: "running" } });
    await Promise.all(running.map(processCampaign));
  } catch (err) {
    logger.error(`Campaign tick error: ${err}`);
  }
};

export const startCampaignRunner = (): void => {
  setInterval(tick, 3000);
};
