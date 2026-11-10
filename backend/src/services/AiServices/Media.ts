import { isMediaLabel } from "../../helpers/MediaLabel";
import path from "path";

import { Op } from "sequelize";

import Message from "../../models/Message";

// What the person sent besides text. The channels save the body of a file message as its file name ("AbC12-1699.ogg"): the AI must never
// read that as the person's words, so history shows a marker ([áudio], [figurinha], [arquivo enviado: nome.pdf]) instead.
export type MediaKind = "pdf" | "image" | "audio" | "video" | "sticker" | "other";
export interface MediaItem {
  kind: MediaKind;
  name: string;
  file: string;
}

export const mediaKindOf = (mediaType?: string | null, mediaUrl?: string | null): MediaKind | null => {
  const file = String(mediaUrl || "");
  if (!file) return null;
  const ext = path.extname(file.split("?")[0]).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".webp") return "sticker";
  if (mediaType === "audio" || [".ogg", ".opus", ".mp3", ".m4a", ".wav", ".oga", ".aac"].includes(ext)) return "audio";
  if (mediaType === "video" || [".mp4", ".3gp", ".mov"].includes(ext)) return "video";
  if (mediaType === "image" || [".jpg", ".jpeg", ".png", ".heic", ".gif"].includes(ext)) return "image";
  return "other";
};

export const markerOf = (kind: MediaKind, name: string): string =>
  ({ audio: "[áudio]", image: "[imagem]", video: "[vídeo]", sticker: "[figurinha]", pdf: `[arquivo enviado: ${name}]`, other: `[arquivo enviado: ${name}]` } as Record<MediaKind, string>)[kind];

const fileOf = (m: Message): string => String(m.getDataValue("mediaUrl") || "");

// the body of a message as the AI reads it
export const textOfMessage = (m: Message): string => {
  const body = String(m.body || "").replace(/‎/g, "").trim();
  const file = fileOf(m);
  const kind = mediaKindOf(m.mediaType, file);
  if (!kind) return body;
  const name = path.basename(file.split("?")[0]);
  // no caption: the body is only the name of the file
  const caption = !body || body === name || path.basename(body) === name || isMediaLabel(body) ? "" : body;
  return [caption, markerOf(kind, name)].filter(Boolean).join(" ");
};

export const mediaOfMessages = (rows: Message[]): MediaItem[] =>
  rows
    .map(m => {
      const file = fileOf(m);
      const kind = mediaKindOf(m.mediaType, file);
      return kind ? { kind, name: path.basename(file.split("?")[0]), file } : null;
    })
    .filter((x): x is MediaItem => !!x);

// what the person sent since our last answer (a burst: text, files, voice notes)
export const burstOf = async (ticketId: number): Promise<Message[]> => {
  const lastAnswer = await Message.findOne({ where: { ticketId, fromMe: true, isDeleted: false }, order: [["createdAt", "DESC"]], attributes: ["createdAt"] });
  return Message.findAll({
    where: { ticketId, fromMe: false, isDeleted: false, ...(lastAnswer ? { createdAt: { [Op.gt]: lastAnswer.createdAt } } : {}) },
    order: [["createdAt", "ASC"]],
    limit: 20
  });
};
