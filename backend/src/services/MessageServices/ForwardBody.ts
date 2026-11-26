// What a forward sends for one message, decided without touching anything: the text (or the caption) and the file, or why it cannot
// go. A location copied from WhatsApp by QR Code is stored as "image in base64|map link|description": only the description and the
// link go (the base64 went out as a huge text before). A file that was never downloaded, or that the retention removed, is not sent
// as an empty message or as its label ("Áudio"): the person is told why.
export interface ForwardSource {
  body?: string | null;
  mediaType?: string | null;
  mediaUrl?: string | null;
  isDeleted?: boolean | null;
  mediaPurgedAt?: Date | string | null;
  bodyPurgedAt?: Date | string | null;
}

export type ForwardBody = { ok: true; body: string; media: string | null } | { ok: false; reason: string };

const FILE_KINDS = new Set(["image", "video", "audio", "ptt", "document", "sticker"]);

export const forwardBodyOf = (m: ForwardSource): ForwardBody => {
  if (m.isDeleted) return { ok: false, reason: "ERR_NO_MESSAGE_FOUND" };
  const body = String(m.body || "");
  const kind = String(m.mediaType || "chat");
  const media = m.mediaUrl || null;
  if (media) {
    const caption = body && body !== media && !/^\d{10,}\.\w{2,5}$/.test(body) ? body : "";
    return { ok: true, body: caption, media };
  }
  if (m.mediaPurgedAt || m.bodyPurgedAt) return { ok: false, reason: "ERR_FORWARD_CONTENT_REMOVED" };
  if (FILE_KINDS.has(kind)) return { ok: false, reason: "ERR_FORWARD_MEDIA_NOT_LOADED" };
  if (kind === "location" && body.includes("|")) {
    const [, link, description] = body.split("|");
    const text = [description, link].map(x => String(x || "").trim()).filter(Boolean).join("\n");
    return text ? { ok: true, body: text, media: null } : { ok: false, reason: "ERR_FORWARD_EMPTY" };
  }
  if (!body.trim()) return { ok: false, reason: "ERR_FORWARD_EMPTY" };
  return { ok: true, body, media: null };
};
