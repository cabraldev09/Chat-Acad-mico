import { Op } from "sequelize";

import AppError from "../../errors/AppError";
import Campaign from "../../models/Campaign";
import CampaignShipping from "../../models/CampaignShipping";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";
import { startOfTodayApp } from "../../helpers/AppTime";

// Protection for unofficial (QR code) WhatsApp connections. WhatsApp bans
// numbers that behave like bots: instant replies, bursts, cold mass messages
// from a young number, ignoring opt-outs. Everything that sends through such a
// connection goes through this module.

export const BOT_MARK = "‎";

const MIN_GAP_MS = 1500; // between any two sends on one connection
const MIN_GAP_AUTOMATED_MS = 3000;
const MAX_PER_MINUTE = 20;
const MAX_WAIT_MS = 25000; // longer than this and we refuse instead of queueing
const BREAKER_THRESHOLD = 5; // consecutive failures

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const rand = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));

export const isUnofficial = (whatsapp: Pick<Whatsapp, "channel">): boolean =>
  (whatsapp.channel || "whatsapp") === "whatsapp";

const sentAt = new Map<number, number[]>();
const failures = new Map<number, number>();

// ---------------------------------------------------------------- pacing

// Waits until this connection may send again. Throws when it would have to
// wait too long (the caller reports the failure instead of piling up sends).
export const paceSend = async (
  whatsapp: Whatsapp,
  automated: boolean
): Promise<void> => {
  if (!isUnofficial(whatsapp)) return;

  const started = Date.now();
  for (;;) {
    const now = Date.now();
    const recent = (sentAt.get(whatsapp.id) || []).filter(t => now - t < 60000);
    const last = recent[recent.length - 1] || 0;
    const gap = automated ? MIN_GAP_AUTOMATED_MS : MIN_GAP_MS;

    let wait = Math.max(0, last + gap - now);
    if (recent.length >= MAX_PER_MINUTE) {
      wait = Math.max(wait, recent[0] + 60000 - now);
    }

    if (wait <= 0) {
      recent.push(now);
      sentAt.set(whatsapp.id, recent);
      return;
    }
    if (now - started + wait > MAX_WAIT_MS) {
      throw new AppError("ERR_RATE_LIMITED", 429);
    }
    await sleep(wait + rand(0, 400));
  }
};

// How long a person would take to type this (1.5s to 6s)
export const typingDelay = (text: string): number =>
  Math.min(6000, 1500 + text.length * 25) + rand(0, 800);

// ------------------------------------------------------------- limits

const ageInDays = (whatsapp: Whatsapp): number => {
  const since = whatsapp.connectedSince || whatsapp.createdAt;
  return Math.max(0, (Date.now() - new Date(since).getTime()) / 86400000);
};

// New numbers must warm up: the daily ceiling grows with the connection age.
export const dailyColdLimit = (whatsapp: Whatsapp): number => {
  const age = ageInDays(whatsapp);
  if (age < 7) return 20;
  if (age < 14) return 40;
  if (age < 30) return 80;
  return 150;
};

const startOfToday = (): Date => startOfTodayApp();

export const sentTodayByCampaigns = async (whatsappId: number): Promise<number> => {
  const campaigns = await Campaign.findAll({
    where: { whatsappId },
    attributes: ["id"]
  });
  if (!campaigns.length) return 0;
  return CampaignShipping.count({
    where: {
      campaignId: { [Op.in]: campaigns.map(c => c.id) },
      status: "sent",
      sentAt: { [Op.gte]: startOfToday() }
    }
  });
};

export const hasConversed = async (contactId: number): Promise<boolean> => {
  const incoming = await Message.count({
    where: { fromMe: false },
    include: [
      {
        model: Ticket,
        as: "ticket",
        attributes: [],
        where: { contactId },
        required: true
      }
    ]
  });
  return incoming > 0;
};

// Decides whether a campaign message may go out through this connection.
// Returns a human-readable reason when it must not.
export interface SendBlock {
  // "contact": skip this recipient; "daily": hold the whole campaign until tomorrow
  kind: "contact" | "daily";
  reason: string;
}

export const checkCampaignSend = async (
  whatsapp: Whatsapp,
  // null = number we have never seen (so, by definition, a cold contact)
  contact: { id: number; optOut?: boolean } | null
): Promise<SendBlock | null> => {
  if (contact?.optOut) {
    return { kind: "contact", reason: "Contato pediu para não receber mensagens (SAIR)." };
  }
  if (!isUnofficial(whatsapp)) return null;

  const warm = contact ? await hasConversed(contact.id) : false;
  if (!warm && whatsapp.riskMode !== "relaxed") {
    return {
      kind: "contact",
      reason:
        "Bloqueado: contato nunca respondeu e a conexão não oficial está em modo seguro. Use a API oficial (Cloud) para contatos novos."
    };
  }

  const limit = dailyColdLimit(whatsapp) * (warm ? 2 : 1);
  const sent = await sentTodayByCampaigns(whatsapp.id);
  if (sent >= limit) {
    return {
      kind: "daily",
      reason: `Limite diário de campanhas desta conexão atingido (${limit}). Continua amanhã.`
    };
  }
  return null;
};

export const getSafetyStatus = async (whatsapp: Whatsapp) => {
  const unofficial = isUnofficial(whatsapp);
  const limit = dailyColdLimit(whatsapp);
  return {
    unofficial,
    riskMode: whatsapp.riskMode || "strict",
    ageDays: Math.floor(ageInDays(whatsapp)),
    dailyLimit: unofficial ? limit : null,
    sentToday: unofficial ? await sentTodayByCampaigns(whatsapp.id) : null,
    failuresInRow: failures.get(whatsapp.id) || 0,
    perMinute: unofficial ? MAX_PER_MINUTE : null
  };
};

// ------------------------------------------------------- circuit breaker

// Pauses every running campaign of a connection and tells the admins.
export const tripBreaker = async (
  whatsappId: number,
  reason: string
): Promise<void> => {
  try {
    const [paused] = await Campaign.update(
      { status: "paused", pauseReason: reason.slice(0, 250) },
      { where: { whatsappId, status: "running" } }
    );
    logger.warn(`Safety breaker on connection ${whatsappId}: ${reason} (${paused} campaign(s) paused)`);
    getIO().emit("safety", { action: "paused", whatsappId, reason, paused });
    if (paused) {
      const rows = await Campaign.findAll({ where: { whatsappId, pauseReason: reason.slice(0, 250) } });
      rows.forEach(row => getIO().emit("campaign", { action: "update", row }));
    }
  } catch (err) {
    logger.error(`Safety breaker failed: ${err}`);
  }
};

export const recordSendResult = (whatsapp: Whatsapp, ok: boolean): void => {
  if (!isUnofficial(whatsapp)) return;
  if (ok) {
    failures.set(whatsapp.id, 0);
    return;
  }
  const count = (failures.get(whatsapp.id) || 0) + 1;
  failures.set(whatsapp.id, count);
  if (count === BREAKER_THRESHOLD) {
    tripBreaker(
      whatsapp.id,
      `${BREAKER_THRESHOLD} falhas seguidas de envio: campanhas pausadas por segurança.`
    );
  }
};

// Reasons that mean the session was kicked/blocked rather than a network blip
const SEVERE_DISCONNECT = /LOGOUT|CONFLICT|BAN|BLOCK|UNPAIRED|UNLAUNCHED/i;
export const onDisconnected = (whatsappId: number, reason: string): void => {
  if (SEVERE_DISCONNECT.test(reason || "")) {
    tripBreaker(whatsappId, `Conexão encerrada pelo WhatsApp (${reason}). Campanhas pausadas.`);
  }
};

// ---------------------------------------------------------------- opt-out

const OPT_OUT = ["sair", "parar", "stop", "cancelar", "descadastrar", "remover", "nao quero receber"];
const OPT_IN = ["voltar", "reativar"];

const normalize = (text: string): string =>
  (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, "")
    .trim();

export const optKeyword = (body: string): "out" | "in" | null => {
  const text = normalize(body);
  if (OPT_OUT.includes(text)) return "out";
  if (OPT_IN.includes(text)) return "in";
  return null;
};
