import axios from "axios";
import FormData from "form-data";
import fs from "fs";

import Whatsapp from "../models/Whatsapp";
import Contact from "../models/Contact";
import { logger } from "../utils/logger";
import { setChannelStatus } from "../services/ChannelServices/ChannelStatus";
import HandleChannelMessage from "../services/InboundServices/HandleChannelMessage";
import { applyReaction } from "../services/MessageServices/MessageActions";
import {
  ChannelAdapter,
  OutboundMedia,
  getConfig,
  externalIdOf,
  mediaKindOf
} from "./types";

const PREFIX = "tg_";
const API = process.env.TELEGRAM_API_URL || "https://api.telegram.org";
const running = new Map<number, { stop: boolean }>();

const call = async (token: string, method: string, data?: any, timeout = 30000) => {
  const res = await axios.post(`${API}/bot${token}/${method}`, data, {
    timeout,
    headers: data instanceof FormData ? data.getHeaders() : undefined,
    maxBodyLength: Infinity
  });
  return res.data.result;
};

const downloadFile = async (token: string, fileId: string) => {
  const file = await call(token, "getFile", { file_id: fileId });
  const res = await axios.get(`${API}/file/bot${token}/${file.file_path}`, {
    responseType: "arraybuffer"
  });
  return { data: Buffer.from(res.data), path: file.file_path as string };
};

const profilePic = async (token: string, userId: number): Promise<string | undefined> => {
  try {
    const photos = await call(token, "getUserProfilePhotos", {
      user_id: userId,
      limit: 1
    });
    const fileId = photos?.photos?.[0]?.[0]?.file_id;
    if (!fileId) return undefined;
    const { data } = await downloadFile(token, fileId);
    return `data:image/jpeg;base64,${data.toString("base64")}`;
  } catch (e) {
    return undefined;
  }
};

// the person reacted to (or removed a reaction from) one of the messages in the conversation
const handleReaction = async (whatsapp: Whatsapp, update: any) => {
  const r = update.message_reaction;
  if (!r || r.chat?.type !== "private" || !r.user) return;
  const emojis = (r.new_reaction || []).filter((x: any) => x.type === "emoji").map((x: any) => x.emoji);
  await applyReaction(
    `tg-${whatsapp.id}-${r.chat.id}-${r.message_id}`,
    emojis[0] || "",
    false,
    `${PREFIX}${r.user.id}`
  );
};

const handleUpdate = async (whatsapp: Whatsapp, token: string, update: any) => {
  if (update.message_reaction) {
    await handleReaction(whatsapp, update);
    return;
  }
  // a tap on an option of a question: it goes in as if the person had written that option
  if (update.callback_query) {
    const cq = update.callback_query;
    const chat = cq.message && cq.message.chat;
    if (!chat || chat.type !== "private") return;
    call(token, "answerCallbackQuery", { callback_query_id: cq.id }, 8000).catch(() => undefined);
    const keys: any[] = ((cq.message.reply_markup && cq.message.reply_markup.inline_keyboard) || []).reduce((all: any[], row: any[]) => all.concat(row), []);
    const label = (keys.find(k => k.callback_data === cq.data) || {}).text || String(cq.data || "");
    const person = cq.from || {};
    await HandleChannelMessage({
      whatsapp,
      contactNumber: `${PREFIX}${chat.id}`,
      contactName: [person.first_name, person.last_name].filter(Boolean).join(" ") || person.username || String(chat.id),
      profilePicUrl: undefined,
      messageId: `tg-${whatsapp.id}-${chat.id}-cb${update.update_id}`,
      body: label
    });
    return;
  }
  const msg = update.message || update.edited_message;
  if (!msg || msg.chat.type !== "private") return;

  const from = msg.from || {};
  const name =
    [from.first_name, from.last_name].filter(Boolean).join(" ") ||
    from.username ||
    String(msg.chat.id);

  let body: string = msg.text || msg.caption || "";
  let media: { filename?: string; mimetype: string; data: Buffer } | undefined;

  try {
    let fileId: string | undefined;
    let mimetype = "application/octet-stream";
    let filename: string | undefined;
    if (msg.photo) {
      fileId = msg.photo[msg.photo.length - 1].file_id;
      mimetype = "image/jpeg";
    } else if (msg.voice) {
      fileId = msg.voice.file_id;
      mimetype = msg.voice.mime_type || "audio/ogg";
    } else if (msg.audio) {
      fileId = msg.audio.file_id;
      mimetype = msg.audio.mime_type || "audio/mpeg";
      filename = msg.audio.file_name;
    } else if (msg.video) {
      fileId = msg.video.file_id;
      mimetype = msg.video.mime_type || "video/mp4";
    } else if (msg.document) {
      fileId = msg.document.file_id;
      mimetype = msg.document.mime_type || mimetype;
      filename = msg.document.file_name;
    } else if (msg.sticker && !msg.sticker.is_animated && !msg.sticker.is_video) {
      fileId = msg.sticker.file_id;
      mimetype = "image/webp";
    }
    if (fileId) {
      const file = await downloadFile(token, fileId);
      media = { filename, mimetype, data: file.data };
    }
  } catch (err) {
    logger.warn(`Telegram media download failed: ${err}`);
  }

  if (!body && !media) body = "[mensagem não suportada]";

  await HandleChannelMessage({
    whatsapp,
    contactNumber: `${PREFIX}${msg.chat.id}`,
    contactName: name,
    profilePicUrl: undefined,
    messageId: `tg-${whatsapp.id}-${msg.chat.id}-${msg.message_id}`,
    body,
    media
  });
};

const poll = async (whatsapp: Whatsapp, token: string, control: { stop: boolean }) => {
  let offset = 0;
  while (!control.stop) {
    try {
      const updates = await call(
        token,
        "getUpdates",
        { offset, timeout: 25, allowed_updates: ["message", "edited_message", "message_reaction", "callback_query"] },
        40000
      );
      for (const update of updates) {
        offset = update.update_id + 1;
        // eslint-disable-next-line no-await-in-loop
        await handleUpdate(whatsapp, token, update).catch(err =>
          logger.error(`Telegram update error: ${err}`)
        );
      }
    } catch (err) {
      if (control.stop) break;
      const status = err?.response?.status;
      logger.warn(`Telegram polling error (${status || err.message})`);
      if (status === 401) {
        await setChannelStatus(whatsapp, "DISCONNECTED");
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, 5000));
    }
  }
};

const telegram: ChannelAdapter = {
  type: "telegram",
  prefix: PREFIX,

  async start(whatsapp) {
    const { botToken } = getConfig(whatsapp);
    if (!botToken) {
      await setChannelStatus(whatsapp, "DISCONNECTED");
      return;
    }
    await telegram.stop(whatsapp);
    try {
      const me = await call(botToken, "getMe");
      // polling and webhooks are mutually exclusive on Telegram's side
      await call(botToken, "deleteWebhook", { drop_pending_updates: false });
      await whatsapp.update({ session: `@${me.username}` });
      await setChannelStatus(whatsapp, "CONNECTED");
      const control = { stop: false };
      running.set(whatsapp.id, control);
      poll(whatsapp, botToken, control);
    } catch (err) {
      logger.error(`Telegram start failed: ${err?.response?.data?.description || err}`);
      await setChannelStatus(whatsapp, "DISCONNECTED");
    }
  },

  async stop(whatsapp) {
    const control = running.get(whatsapp.id);
    if (control) control.stop = true;
    running.delete(whatsapp.id);
  },

  async sendText(whatsapp, contact: Contact, body) {
    const { botToken } = getConfig(whatsapp);
    const result = await call(botToken, "sendMessage", {
      chat_id: externalIdOf(contact, PREFIX),
      text: body
    });
    return { id: `tg-${whatsapp.id}-${result.chat.id}-${result.message_id}` };
  },

  // inline keyboard: one option per row; the tap arrives as a callback_query (see handleUpdate)
  async sendChoices(whatsapp, contact: Contact, question, options) {
    const { botToken } = getConfig(whatsapp);
    const result = await call(botToken, "sendMessage", {
      chat_id: externalIdOf(contact, PREFIX),
      text: question,
      reply_markup: { inline_keyboard: options.map((o, i) => [{ text: o.label.slice(0, 60), callback_data: String(i + 1) }]) }
    });
    return { id: `tg-${whatsapp.id}-${result.chat.id}-${result.message_id}` };
  },

  async sendTyping(whatsapp, contact: Contact) {
    const { botToken } = getConfig(whatsapp);
    // the indicator lasts about 5 seconds on Telegram's side
    await call(botToken, "sendChatAction", { chat_id: externalIdOf(contact, PREFIX), action: "typing" }, 8000);
  },

  async sendReaction(whatsapp, contact: Contact, messageId, emoji) {
    const { botToken } = getConfig(whatsapp);
    // ids are stored as tg-<connection>-<chat>-<message>; Telegram only needs the last part
    const telegramMessageId = Number(String(messageId).split("-").pop());
    await call(botToken, "setMessageReaction", {
      chat_id: externalIdOf(contact, PREFIX),
      message_id: telegramMessageId,
      reaction: emoji ? [{ type: "emoji", emoji }] : []
    });
  },

  async sendMedia(whatsapp, contact: Contact, media: OutboundMedia, caption) {
    const { botToken } = getConfig(whatsapp);
    const kind = mediaKindOf(media.mimetype);
    const methodMap = {
      image: ["sendPhoto", "photo"],
      video: ["sendVideo", "video"],
      audio: [
        media.mimetype.includes("ogg") ? "sendVoice" : "sendAudio",
        media.mimetype.includes("ogg") ? "voice" : "audio"
      ],
      file: ["sendDocument", "document"]
    } as const;
    const [method, field] = methodMap[kind];
    const form = new FormData();
    form.append("chat_id", externalIdOf(contact, PREFIX));
    if (caption) form.append("caption", caption);
    form.append(field, fs.createReadStream(media.path), {
      filename: media.filename,
      contentType: media.mimetype
    });
    const result = await call(botToken, method, form, 120000);
    return { id: `tg-${whatsapp.id}-${result.chat.id}-${result.message_id}` };
  }
};

export default telegram;
