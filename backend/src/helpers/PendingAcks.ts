// The ticks that arrived before their message was stored. On WhatsApp by QR Code the "sent" of a message can come while the system is
// still saving it (a link waits for its preview, a busy page answers late): the tick is kept here for a few minutes and applied when the
// message is stored, instead of being lost until the periodic check fixes it.
const KEEP_MS = 5 * 60 * 1000;
const pending = new Map<string, { ack: number; at: number }>();

const prune = (now: number): void => {
  if (pending.size < 500) return;
  pending.forEach((v, k) => { if (now - v.at > KEEP_MS) pending.delete(k); });
};

export const keepPendingAck = (messageId: string, ack: number, now = Date.now()): void => {
  if (!messageId) return;
  prune(now);
  const old = pending.get(messageId);
  // ticks only go forward; a failure (-1) replaces anything
  if (!old || ack < 0 || ack > old.ack) pending.set(messageId, { ack, at: now });
};

export const takePendingAck = (messageId: string | undefined | null, now = Date.now()): number | null => {
  if (!messageId) return null;
  const hit = pending.get(messageId);
  if (!hit) return null;
  pending.delete(messageId);
  return now - hit.at > KEEP_MS ? null : hit.ack;
};
