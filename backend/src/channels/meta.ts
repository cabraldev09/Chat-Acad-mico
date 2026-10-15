import axios from "axios";
import FormData from "form-data";
import fs from "fs";

import Whatsapp from "../models/Whatsapp";
import Contact from "../models/Contact";
import { logger } from "../utils/logger";
import AppError from "../errors/AppError";
import { getPublicUrl } from "../helpers/PublicUrl";
import { setChannelStatus } from "../services/ChannelServices/ChannelStatus";
import HandleChannelMessage from "../services/InboundServices/HandleChannelMessage";
import { handleAckByExternalId } from "../services/InboundServices/HandleAck";
import { applyReaction } from "../services/MessageServices/MessageActions";
import {
  ChannelAdapter,
  ChannelType,
  OutboundMedia,
  getConfig,
  externalIdOf,
  mediaKindOf
} from "./types";

// Unversioned by default so Meta serves the app's default API version (pinned
// versions expire). Set META_GRAPH_VERSION=vNN.0 to pin, GRAPH_API_URL to override.
const GRAPH =
  process.env.GRAPH_API_URL ||
  `https://graph.facebook.com${
    process.env.META_GRAPH_VERSION ? `/${process.env.META_GRAPH_VERSION}` : ""
  }`;

// ---------------------------------------------------------------------------
// Messenger + Instagram (same Send API shape, different ids)
// ---------------------------------------------------------------------------

// Messenger accepts a fixed set of reactions; Instagram only the heart
const MESSENGER_REACTIONS: Record<string, string> = {
  "👍": "like", "👎": "dislike", "❤️": "love", "❤": "love", "😂": "smile", "😮": "wow", "😢": "sad", "😡": "angry"
};

const socialAdapter = (type: "messenger" | "instagram", prefix: string): ChannelAdapter => ({
  type,
  prefix,

  async start(whatsapp) {
    const { accessToken } = getConfig(whatsapp);
    if (!accessToken) {
      await setChannelStatus(whatsapp, "DISCONNECTED");
      return;
    }
    try {
      const { data } = await axios.get(`${GRAPH}/me`, {
        params: { access_token: accessToken, fields: "id,name" }
      });
      await whatsapp.update({ session: data.name || data.id });
      await setChannelStatus(whatsapp, "CONNECTED");
    } catch (err) {
      logger.error(`${type} start failed: ${err?.response?.data?.error?.message || err}`);
      await setChannelStatus(whatsapp, "DISCONNECTED");
    }
  },

  async stop() {
    // webhook driven
  },

  async sendTyping(whatsapp, contact: Contact) {
    const { accessToken } = getConfig(whatsapp);
    await axios.post(
      `${GRAPH}/me/messages`,
      { recipient: { id: externalIdOf(contact, prefix) }, sender_action: "typing_on" },
      { params: { access_token: accessToken }, timeout: 8000 }
    );
  },

  async sendReaction(whatsapp, contact: Contact, messageId, emoji) {
    const { accessToken } = getConfig(whatsapp);
    const reaction = type === "instagram" ? (emoji === "❤️" || emoji === "❤" ? "love" : "") : MESSENGER_REACTIONS[emoji] || "";
    if (emoji && !reaction) throw new AppError("ERR_REACTION_EMOJI_UNSUPPORTED", 400);
    await axios.post(
      `${GRAPH}/me/messages`,
      {
        recipient: { id: externalIdOf(contact, prefix) },
        sender_action: emoji ? "react" : "unreact",
        payload: emoji ? { message_id: messageId, reaction } : { message_id: messageId }
      },
      { params: { access_token: accessToken } }
    );
  },

  async sendText(whatsapp, contact: Contact, body) {
    const { accessToken } = getConfig(whatsapp);
    const { data } = await axios.post(
      `${GRAPH}/me/messages`,
      {
        recipient: { id: externalIdOf(contact, prefix) },
        message: { text: body },
        messaging_type: "RESPONSE"
      },
      { params: { access_token: accessToken } }
    );
    return { id: data.message_id };
  },

  // Messenger and Instagram: quick replies (up to 13 short options under the question)
  async sendChoices(whatsapp, contact: Contact, question, options) {
    const { accessToken } = getConfig(whatsapp);
    const { data } = await axios.post(
      `${GRAPH}/me/messages`,
      {
        recipient: { id: externalIdOf(contact, prefix) },
        message: {
          text: question.slice(0, 1900),
          quick_replies: options.slice(0, 13).map((o, i) => ({ content_type: "text", title: o.label.slice(0, 20), payload: String(i + 1) }))
        },
        messaging_type: "RESPONSE"
      },
      { params: { access_token: accessToken } }
    );
    return { id: data.message_id };
  },

  async sendMedia(whatsapp, contact: Contact, media: OutboundMedia, caption) {
    const { accessToken } = getConfig(whatsapp);
    const kind = mediaKindOf(media.mimetype);
    const attachmentType = kind === "file" ? "file" : kind;
    const form = new FormData();
    form.append("recipient", JSON.stringify({ id: externalIdOf(contact, prefix) }));
    form.append(
      "message",
      JSON.stringify({
        attachment: { type: attachmentType, payload: { is_reusable: true } }
      })
    );
    form.append("messaging_type", "RESPONSE");
    form.append("filedata", fs.createReadStream(media.path), {
      filename: media.filename,
      contentType: media.mimetype
    });
    const { data } = await axios.post(`${GRAPH}/me/messages`, form, {
      params: { access_token: accessToken },
      headers: form.getHeaders(),
      maxBodyLength: Infinity
    });
    if (caption) {
      await axios.post(
        `${GRAPH}/me/messages`,
        {
          recipient: { id: externalIdOf(contact, prefix) },
          message: { text: caption },
          messaging_type: "RESPONSE"
        },
        { params: { access_token: accessToken } }
      );
    }
    return { id: data.message_id };
  }
});

export const messenger = socialAdapter("messenger", "fb_");
export const instagram = socialAdapter("instagram", "ig_");

// ---------------------------------------------------------------------------
// WhatsApp Cloud API
// ---------------------------------------------------------------------------

export const whatsappCloud: ChannelAdapter = {
  type: "whatsapp_cloud",
  prefix: "",

  async start(whatsapp) {
    const { accessToken, phoneNumberId } = getConfig(whatsapp);
    if (!accessToken || !phoneNumberId) {
      await setChannelStatus(whatsapp, "DISCONNECTED");
      return;
    }
    try {
      const { data } = await axios.get(`${GRAPH}/${phoneNumberId}`, {
        params: {
          access_token: accessToken,
          fields: "display_phone_number,verified_name"
        }
      });
      await whatsapp.update({
        session: data.display_phone_number || data.verified_name
      });
      await setChannelStatus(whatsapp, "CONNECTED");
    } catch (err) {
      logger.error(`WhatsApp Cloud start failed: ${err?.response?.data?.error?.message || err}`);
      await setChannelStatus(whatsapp, "DISCONNECTED");
    }
  },

  async stop() {
    // webhook driven
  },

  async sendText(whatsapp, contact: Contact, body) {
    const { accessToken, phoneNumberId } = getConfig(whatsapp);
    const { data } = await axios.post(
      `${GRAPH}/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: contact.number,
        type: "text",
        text: { body, preview_url: false }
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return { id: data.messages[0].id };
  },

  // WhatsApp Cloud: up to 3 reply buttons, or a list for 4 to 10 options
  async sendChoices(whatsapp, contact: Contact, question, options) {
    const { accessToken, phoneNumberId } = getConfig(whatsapp);
    const interactive =
      options.length <= 3
        ? {
            type: "button",
            body: { text: question.slice(0, 1000) },
            action: { buttons: options.map((o, i) => ({ type: "reply", reply: { id: String(i + 1), title: o.label.slice(0, 20) } })) }
          }
        : {
            type: "list",
            body: { text: question.slice(0, 1000) },
            action: { button: "Escolher", sections: [{ title: "Opções", rows: options.slice(0, 10).map((o, i) => ({ id: String(i + 1), title: o.label.slice(0, 24) })) }] }
          };
    const { data } = await axios.post(
      `${GRAPH}/${phoneNumberId}/messages`,
      { messaging_product: "whatsapp", to: contact.number, type: "interactive", interactive },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return { id: data.messages[0].id };
  },

  async sendReaction(whatsapp, contact: Contact, messageId, emoji) {
    const { accessToken, phoneNumberId } = getConfig(whatsapp);
    await axios.post(
      `${GRAPH}/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: contact.number,
        type: "reaction",
        reaction: { message_id: messageId, emoji }
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
  },

  async sendTemplate(whatsapp, contact: Contact, template) {
    const { accessToken, phoneNumberId } = getConfig(whatsapp);
    const { data } = await axios.post(
      `${GRAPH}/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: contact.number,
        type: "template",
        template: {
          name: template.name,
          language: { code: template.language || "pt_BR" },
          components: template.params.length
            ? [
                {
                  type: "body",
                  parameters: template.params.map(text => ({ type: "text", text }))
                }
              ]
            : []
        }
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return { id: data.messages[0].id };
  },

  async sendMedia(whatsapp, contact: Contact, media: OutboundMedia, caption) {
    const { accessToken, phoneNumberId } = getConfig(whatsapp);
    const headers = { Authorization: `Bearer ${accessToken}` };
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", media.mimetype);
    form.append("file", fs.createReadStream(media.path), {
      filename: media.filename,
      contentType: media.mimetype
    });
    const upload = await axios.post(`${GRAPH}/${phoneNumberId}/media`, form, {
      headers: { ...headers, ...form.getHeaders() },
      maxBodyLength: Infinity
    });
    const kind = mediaKindOf(media.mimetype);
    const type = kind === "file" ? "document" : kind;
    const payload: any = { id: upload.data.id };
    if (caption && type !== "audio") payload.caption = caption;
    if (type === "document") payload.filename = media.filename;
    const { data } = await axios.post(
      `${GRAPH}/${phoneNumberId}/messages`,
      { messaging_product: "whatsapp", to: contact.number, type, [type]: payload },
      { headers }
    );
    return { id: data.messages[0].id };
  }
};

// ---------------------------------------------------------------------------
// Webhook payload processing
// ---------------------------------------------------------------------------

const download = async (url: string, headers?: Record<string, string>) => {
  const res = await axios.get(url, { responseType: "arraybuffer", headers });
  return {
    data: Buffer.from(res.data),
    mimetype: (res.headers["content-type"] || "application/octet-stream") as string
  };
};

const mimeFromType = (type: string): string =>
  ({ image: "image/jpeg", video: "video/mp4", audio: "audio/mpeg" } as Record<string, string>)[
    type
  ] || "application/octet-stream";

const processSocial = async (whatsapp: Whatsapp, entry: any, type: ChannelType) => {
  const config = getConfig(whatsapp);
  const prefix = type === "instagram" ? "ig_" : "fb_";
  for (const event of entry.messaging || []) {
    if (event.reaction?.mid) {
      const r = event.reaction;
      await applyReaction(r.mid, r.action === "unreact" ? "" : r.emoji || "", false, `${prefix}${event.sender.id}`);
      continue;
    }
    const msg = event.message;
    if (!msg || msg.is_echo) continue;
    const senderId: string = event.sender.id;

    let name = senderId;
    let pic: string | undefined;
    try {
      const { data } = await axios.get(`${GRAPH}/${senderId}`, {
        params: {
          access_token: config.accessToken,
          fields: type === "instagram" ? "name,profile_pic" : "name,profile_pic"
        }
      });
      name = data.name || senderId;
      pic = data.profile_pic;
    } catch (e) {
      // profile lookup is best effort
    }

    const attachments: any[] = msg.attachments || [];
    let media: { filename?: string; mimetype: string; data: Buffer } | undefined;
    // a quick reply arrives with its title as text; the number is the payload
    let body: string = msg.text || (msg.quick_reply && msg.quick_reply.payload) || "";
    const first = attachments.find(a => a.payload?.url);
    if (first) {
      try {
        const file = await download(first.payload.url);
        media = {
          data: file.data,
          mimetype:
            file.mimetype === "application/octet-stream"
              ? mimeFromType(first.type)
              : file.mimetype
        };
      } catch (e) {
        body = body || `[${first.type}] ${first.payload.url}`;
      }
    } else if (!body && attachments.length) {
      body = `[${attachments[0].type}]`;
    }
    if (!body && !media) continue;

    await HandleChannelMessage({
      whatsapp,
      contactNumber: `${prefix}${senderId}`,
      contactName: name,
      profilePicUrl: pic,
      messageId: msg.mid,
      body,
      media
    });
  }
};

const processCloud = async (whatsapp: Whatsapp, entry: any) => {
  const config = getConfig(whatsapp);
  const headers = { Authorization: `Bearer ${config.accessToken}` };

  for (const change of entry.changes || []) {
    const value = change.value || {};
    if (value.metadata?.phone_number_id !== config.phoneNumberId) continue;

    for (const st of value.statuses || []) {
      const ack = ({ sent: 1, delivered: 2, read: 3 } as Record<string, number>)[st.status];
      if (ack) await handleAckByExternalId(st.id, ack);
    }

    for (const m of value.messages || []) {
      if (m.type === "reaction" && m.reaction?.message_id) {
        await applyReaction(m.reaction.message_id, m.reaction.emoji || "", false, m.from);
        continue;
      }
      const profileName = (value.contacts || []).find((c: any) => c.wa_id === m.from)?.profile
        ?.name;
      let body = "";
      let media: { filename?: string; mimetype: string; data: Buffer } | undefined;

      if (m.type === "text") body = m.text.body;
      else if (["image", "video", "audio", "document", "sticker"].includes(m.type)) {
        const info = m[m.type];
        body = info.caption || "";
        try {
          const meta = await axios.get(`${GRAPH}/${info.id}`, { headers });
          const file = await download(meta.data.url, headers);
          media = {
            data: file.data,
            mimetype: info.mime_type || file.mimetype,
            filename: info.filename
          };
        } catch (err) {
          logger.warn(`Cloud API media download failed: ${err}`);
          body = body || `[${m.type}]`;
        }
      } else if (m.type === "location") {
        body = `Localização: https://maps.google.com/?q=${m.location.latitude},${m.location.longitude}`;
      } else if (m.type === "button") body = m.button.text;
      else if (m.type === "interactive") {
        body =
          m.interactive?.button_reply?.title ||
          m.interactive?.list_reply?.title ||
          "[interativo]";
      } else body = `[${m.type}]`;

      await HandleChannelMessage({
        whatsapp,
        contactNumber: m.from,
        contactName: profileName || m.from,
        messageId: m.id,
        body,
        media
      });
    }
  }
};

export const processMetaWebhook = async (whatsapp: Whatsapp, body: any): Promise<void> => {
  for (const entry of body.entry || []) {
    try {
      if (whatsapp.channel === "whatsapp_cloud") await processCloud(whatsapp, entry);
      else await processSocial(whatsapp, entry, whatsapp.channel as ChannelType);
    } catch (err) {
      logger.error(`Meta webhook processing error: ${err}`);
    }
  }
};

export const metaWebhookUrl = (whatsappId: number): string =>
  `${getPublicUrl()}/webhooks/meta/${whatsappId}`;
