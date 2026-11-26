import { isClosingMessage } from "../../helpers/ClosingMessage";

// "28857 min" says nothing: 45 min, 2 h 10 min, 20 dias
export const howLong = (minutes: number): string => {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m} min`;
  if (m < 1440) return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 60)} h`;
  const d = Math.floor(m / 1440);
  return `${d} ${d === 1 ? "dia" : "dias"}`;
};

export interface WaitingMessage {
  body?: string | null;
  mediaType?: string | null;
  createdAt: Date | string;
}

export type SlaDecision = "alert" | "closing" | "old";

// Whether the client's waiting message deserves an alert now.
// - "closing": the last thing the client sent closes the subject ("obrigado", "ok", a sticker, a reaction): nothing to answer.
// - "old": the wait started more than maxAgeHours ago (conversations copied from a phone, or a long stop of the server). An alert
//   then is noise (20 "Prazo escalado" at once): it goes once a day in the bell as "conversas esquecidas".
// - "alert": a real, recent wait.
export const slaDecision = (last: WaitingMessage, first: WaitingMessage, now: Date, maxAgeHours: number): SlaDecision => {
  const kind = String(last.mediaType || "").toLowerCase();
  if (kind === "sticker" || kind === "reaction") return "closing";
  if ((!kind || kind === "chat" || kind === "text" || kind === "conversation" || kind === "extendedtextmessage") && isClosingMessage(last.body)) return "closing";
  const age = (now.getTime() - new Date(first.createdAt).getTime()) / 3600000;
  if (maxAgeHours > 0 && age > maxAgeHours) return "old";
  return "alert";
};

// the daily line in the bell for the waits that are too old to alert one by one
export const forgottenNotice = (count: number): { title: string; body: string } => ({
  title: count === 1 ? "1 conversa esquecida" : `${count} conversas esquecidas`,
  body: count === 1
    ? "O cliente escreveu há mais de um dia e ninguém respondeu. Responda ou finalize a conversa."
    : "Clientes escreveram há mais de um dia e ninguém respondeu. Responda ou finalize as conversas."
});
