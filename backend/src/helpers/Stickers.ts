import fs from "fs";
import path from "path";
import AppError from "../errors/AppError";

// The stickers (and GIFs) of a number, read from its messages: one entry per file (the same sticker comes under many names, so the bytes
// decide), newest first. "sent" = the team already sent it (Recentes), "uses" = how many times it went in the conversations (Mais usadas).
export const stickersOf = (rows: Array<{ id: string; url: string; hash: string; fromMe: boolean; at: number }>, max = 60) => {
  const byHash = new Map<string, { id: string; url: string; uses: number; sent: boolean; sentAt: number; lastAt: number }>();
  for (const r of rows) {
    const cur = byHash.get(r.hash);
    if (!cur) {
      byHash.set(r.hash, { id: r.id, url: r.url, uses: 1, sent: r.fromMe, sentAt: r.fromMe ? r.at : 0, lastAt: r.at });
      continue;
    }
    cur.uses += 1;
    if (r.fromMe) { cur.sent = true; cur.sentAt = Math.max(cur.sentAt, r.at); }
    cur.lastAt = Math.max(cur.lastAt, r.at);
  }
  return [...byHash.values()].sort((a, b) => b.lastAt - a.lastAt).slice(0, max)
    .map(x => ({ id: x.id, url: x.url, uses: x.uses, sent: x.sent, sentAt: x.sentAt ? new Date(x.sentAt).toISOString() : null }));
};
// turns the picked image into a WhatsApp sticker file: 512 x 512, the picture whole in the middle, transparent around it
export const asSticker = async (m: { path: string; filename: string; originalname: string; mimetype: string; size: number }): Promise<void> => {
  const sharp = (await import("sharp")).default;
  const filename = `${path.basename(m.filename, path.extname(m.filename))}-figurinha.webp`;
  const to = path.join(path.dirname(m.path), filename);
  try {
    await sharp(m.path, { animated: false }).rotate().resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 85 }).toFile(to);
  } catch (_) {
    // not an image that sharp reads: nothing of it stays on the disk
    fs.unlink(m.path, () => undefined);
    fs.unlink(to, () => undefined);
    throw new AppError("ERR_STICKER_IMAGE", 400);
  }
  fs.unlink(m.path, () => undefined);
  Object.assign(m, { path: to, filename, originalname: "figurinha.webp", mimetype: "image/webp", size: fs.statSync(to).size });
};

