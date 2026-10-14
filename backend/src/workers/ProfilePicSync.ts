import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { Op, literal } from "sequelize";

import Contact from "../models/Contact";
import Whatsapp from "../models/Whatsapp";
import { PUBLIC_DIR } from "../config/paths";
import { chatIdOf } from "../helpers/ChatId";
import { isLocalPic } from "../helpers/PicUrl";
import { whatsappProvider } from "../providers/WhatsApp";
import { logger } from "../utils/logger";

const AVATAR_DIR = path.join(PUBLIC_DIR, "avatars");
const RETRY_AFTER_MS = 7 * 24 * 3600 * 1000;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let running = false;

// WhatsApp's picture links stop working after a while, so the real picture of each person and group is
// downloaded once and kept on our side. People are processed a few at a time, conversations first, so
// WhatsApp is never flooded with requests.
const download = async (url: string): Promise<Buffer | null> => {
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length > 0 && buf.length < 3 * 1024 * 1024 ? buf : null;
};

const save = (contact: Contact, buf: Buffer): string => {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
  const name = `${contact.id}-${randomBytes(4).toString("hex")}.jpg`;
  fs.writeFileSync(path.join(AVATAR_DIR, name), buf);
  const old = contact.getDataValue("profilePicUrl");
  if (old && isLocalPic(old)) fs.rmSync(path.join(PUBLIC_DIR, old), { force: true });
  return `avatars/${name}`;
};

const tick = async (): Promise<void> => {
  if (running) return;
  running = true;
  try {
    const connection = await Whatsapp.findOne({
      where: { status: "CONNECTED", channel: "whatsapp" },
      order: [["id", "ASC"]]
    });
    if (!connection || !whatsappProvider.getChatPicUrl) return;

    const retryBefore = new Date(Date.now() - RETRY_AFTER_MS);
    const batch = await Contact.findAll({
      where: {
        [Op.and]: [
          { [Op.or]: [{ profilePicUrl: { [Op.is]: null } }, { profilePicUrl: { [Op.like]: "http%" } }] },
          { [Op.or]: [{ picCheckedAt: { [Op.is]: null } }, { picCheckedAt: { [Op.lt]: retryBefore } }] }
        ]
      } as any,
      // people with a conversation first
      order: [
        [literal(`(SELECT COUNT(*) FROM "Tickets" t WHERE t."contactId" = "Contact"."id") > 0`), "DESC"],
        ["id", "ASC"]
      ],
      limit: 10
    });

    for (const contact of batch) {
      try {
        const chatId = chatIdOf(contact, contact.isGroup);
        // eslint-disable-next-line no-await-in-loop
        const url = await Promise.race([
          whatsappProvider.getChatPicUrl(connection.id, chatId),
          new Promise<undefined>(resolve => setTimeout(resolve, 10000))
        ]);
        const known = contact.getDataValue("profilePicUrl");
        // eslint-disable-next-line no-await-in-loop
        const buf = url ? await download(url) : known ? await download(known) : null;
        if (buf) {
          // eslint-disable-next-line no-await-in-loop
          await contact.update({ profilePicUrl: save(contact, buf), picCheckedAt: new Date() });
        } else {
          // no picture (private or none): ask again in a week
          // eslint-disable-next-line no-await-in-loop
          await contact.update({ picCheckedAt: new Date() });
        }
      } catch (err) {
        // transient problem: try again tomorrow instead of every minute
        // eslint-disable-next-line no-await-in-loop
        await contact.update({ picCheckedAt: new Date(Date.now() - RETRY_AFTER_MS + 24 * 3600 * 1000) }).catch(() => undefined);
      }
      // eslint-disable-next-line no-await-in-loop
      await sleep(1500);
    }
  } catch (err) {
    logger.warn(`Profile picture sync tick failed: ${err}`);
  } finally {
    running = false;
  }
};

export const startProfilePicSync = (): void => {
  setInterval(tick, 20000);
};
