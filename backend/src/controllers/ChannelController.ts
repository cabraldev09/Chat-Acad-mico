import { Request, Response } from "express";
import Whatsapp from "../models/Whatsapp";
import AppError from "../errors/AppError";
import { getConfig } from "../channels/types";
import { getPublicUrl } from "../helpers/PublicUrl";

// Field definitions drive the connection form in the frontend
const CHANNELS = [
  {
    type: "whatsapp",
    label: "WhatsApp (QR Code)",
    fields: []
  },
  {
    type: "whatsapp_cloud",
    label: "WhatsApp Cloud API (oficial)",
    fields: [
      { key: "phoneNumberId", label: "Phone Number ID" },
      { key: "accessToken", label: "Access Token (permanente)", secret: true },
      { key: "appSecret", label: "App Secret (valida assinatura)", secret: true },
      { key: "verifyToken", label: "Verify Token (você define)", secret: true }
    ],
    webhook: true
  },
  {
    type: "messenger",
    label: "Facebook Messenger",
    fields: [
      { key: "accessToken", label: "Page Access Token", secret: true },
      { key: "appSecret", label: "App Secret (valida assinatura)", secret: true },
      { key: "verifyToken", label: "Verify Token (você define)", secret: true }
    ],
    webhook: true
  },
  {
    type: "instagram",
    label: "Instagram Direct",
    fields: [
      { key: "accessToken", label: "Access Token", secret: true },
      { key: "appSecret", label: "App Secret (valida assinatura)", secret: true },
      { key: "verifyToken", label: "Verify Token (você define)", secret: true }
    ],
    webhook: true
  },
  {
    type: "telegram",
    label: "Telegram (bot)",
    fields: [{ key: "botToken", label: "Bot Token (@BotFather)", secret: true }]
  },
  {
    type: "webchat",
    label: "Chat web (widget para site)",
    fields: [
      { key: "title", label: "Título do chat" },
      { key: "color", label: "Cor principal (ex: #128c7e)" },
      { key: "welcome", label: "Mensagem de boas-vindas" }
    ],
    widget: true
  }
];

export const index = async (_req: Request, res: Response): Promise<Response> =>
  res.json(CHANNELS);

export const info = async (req: Request, res: Response): Promise<Response> => {
  const whatsapp = await Whatsapp.findByPk(req.params.whatsappId);
  if (!whatsapp) throw new AppError("ERR_NO_WAPP_FOUND", 404);
  const publicUrl = getPublicUrl();
  const out: Record<string, any> = { publicUrl, channel: whatsapp.channel };
  if (["whatsapp_cloud", "messenger", "instagram"].includes(whatsapp.channel)) {
    out.webhookUrl = `${publicUrl}/webhooks/meta/${whatsapp.id}`;
  }
  if (whatsapp.channel === "webchat") {
    const { token } = getConfig(whatsapp);
    out.token = token;
    out.demoUrl = `${publicUrl}/webchat/${token}/demo`;
    out.snippet = `<script src="${publicUrl}/webchat/widget.js?token=${token}" async></script>`;
  }
  return res.json(out);
};
