import { Op } from "sequelize";

import { getSetting, setSetting } from "../../helpers/AppSettings";
import User from "../../models/User";
import UserQueue from "../../models/UserQueue";
import Whatsapp from "../../models/Whatsapp";

export { readableNumber } from "../../helpers/ReadableNumber";

// The round of a queue: the next member of the queue who takes new conversations (the turn is kept per queue). Members with their own
// QR Code number connected go first: the lead is called from that number. Nobody in the queue: null (the management is warned).
export const pickQueueOwner = async (queueId: number): Promise<number | null> => {
  if (!(queueId > 0)) return null;
  const links = await UserQueue.findAll({ where: { queueId }, attributes: ["userId"] });
  const ids = [...new Set(links.map(l => Number(l.userId)))];
  if (!ids.length) return null;
  const users = await User.findAll({ where: { id: { [Op.in]: ids } } as any, attributes: ["id", "acceptsNewTickets"], order: [["id", "ASC"]] });
  let pool = users.filter(u => (u as any).acceptsNewTickets !== false);
  if (!pool.length) return null;
  const own = await Whatsapp.findAll({ where: { ownerId: { [Op.in]: pool.map(u => u.id) }, channel: "whatsapp", status: "CONNECTED" } as any, attributes: ["ownerId"] });
  const withNumber = new Set(own.map(w => Number(w.ownerId)));
  if (pool.some(u => withNumber.has(u.id))) pool = pool.filter(u => withNumber.has(u.id));
  const key = `crm_rr_last_queue_${queueId}`;
  const last = Number(await getSetting(key, "0"));
  const next = pool.find(u => u.id > last) || pool[0];
  await setSetting(key, String(next.id));
  return next.id;
};

// the consultant's own QR Code number that is connected now (the one they call the lead from)
export const ownNumberOf = async (userId: number): Promise<Whatsapp | null> =>
  Whatsapp.findOne({ where: { ownerId: userId, channel: "whatsapp", status: "CONNECTED" } as any, order: [["id", "ASC"]] });
