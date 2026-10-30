// The reminders of the AI agent to a lead who stopped answering (pure text: nothing about money, nothing promised): a quick "tá por aí?" while the
// conversation is still warm, a question about doubts hours later, and the offer of the consultant at the end
export const firstName = (name: string): string => String(name || "").trim().split(/\s+/)[0] || "";

export const NUDGES = 3;
// after the last reminder, a lead who already said what they want goes to the consultant if they still do not answer
export const HANDOFF_AFTER_LAST_MS = 2 * 3600000;

export const nudgeText = (index: number, first: string, course?: string | null): string => {
  const hi = first ? `Oi, ${first}!` : "Oi!";
  if (index === 0) return `${hi} Tá por aí? 😊`;
  if (index === 1) return `${hi} Ficou com alguma dúvida${course ? ` sobre ${course}` : ""}? Consigo te ajudar com o que faltar por aqui.`;
  return `${first ? `${first}, passando` : "Passando"} só para saber se ainda posso te ajudar${course ? ` com ${course}` : ""}. Se preferir, chamo o consultor do seu polo para continuar com você.`;
};

// how long after the last word of the agent (or the last reminder) each reminder goes: the first one in minutes, the others in hours
export const nudgeWaitMs = (index: number, firstMinutes = 10): number => (index === 0 ? Math.max(1, firstMinutes) * 60000 : index === 1 ? 3 * 3600000 : 9 * 3600000);

// whether the next reminder is due now (only the first one also goes outside the working hours: the conversation was happening a moment ago)
export const nudgeDue = (nudges: number, sinceMs: number, nowMs: number, opts: { firstMinutes?: number; businessNow?: boolean } = {}): boolean => {
  if (nudges >= NUDGES) return false;
  if (nudges > 0 && opts.businessNow === false) return false;
  return nowMs - sinceMs >= nudgeWaitMs(nudges, opts.firstMinutes);
};
