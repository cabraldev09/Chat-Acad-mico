// The decisions of a forward that do not need the database, kept apart so they are tested alone.

export interface ForwardEnd { whatsappId: number | null; channel?: string | null }

// The phone forwards it itself ("Encaminhada" on the other side, the file is not uploaded again) only between two chats of the same
// number connected by QR Code: the message lives in that phone. Between numbers, or with the official number, the copy is sent again.
export const nativeForwardable = (source: ForwardEnd, target: ForwardEnd, providerCanForward: boolean): boolean =>
  providerCanForward &&
  !!source.whatsappId &&
  source.whatsappId === target.whatsappId &&
  (source.channel || "whatsapp") === "whatsapp" &&
  (target.channel || "whatsapp") === "whatsapp";

export interface ForwardPair { messageId: string; ticketId: number }

// "Tentar de novo" sends exactly the pairs that failed: each one once, and never more than the batch allows
export const retryPairs = (pairs: unknown): ForwardPair[] => {
  const out = new Map<string, ForwardPair>();
  (Array.isArray(pairs) ? pairs : []).forEach((p: any) => {
    const messageId = String(p?.messageId || "");
    const ticketId = Number(p?.ticketId);
    if (messageId && Number.isInteger(ticketId) && ticketId > 0) out.set(`${messageId}|${ticketId}`, { messageId, ticketId });
  });
  return [...out.values()].slice(0, 500);
};
