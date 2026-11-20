// Quick-reply buttons on a bulk send (campaign, scheduled message, retention): up to 3 short answers the person taps.
// On the official API they go as native buttons (inside the 24 h window); on a QR connection, which has no buttons,
// they go as numbered options under the text, so the person can still answer with the number or the word.
export const MAX_BUTTONS = 3;
export const BUTTON_MAX_LEN = 20;

export const cleanButtons = (raw: any): string[] => {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  raw.forEach(b => {
    const label = String(b ?? "").replace(/\s+/g, " ").trim().slice(0, BUTTON_MAX_LEN);
    if (label && !out.some(o => o.toLowerCase() === label.toLowerCase())) out.push(label);
  });
  return out.slice(0, MAX_BUTTONS);
};

export const numberedText = (body: string, buttons: string[]): string =>
  buttons.length ? `${String(body || "").trim()}\n\n${buttons.map((b, i) => `*${i + 1}* - ${b}`).join("\n")}` : body;

// what SendToContact gets: native choices on channels with buttons, the numbered text on QR
export const withButtons = (channel: string | null | undefined, body: string, raw: any): {
  body: string;
  choices: { question: string; options: Array<{ id: string; label: string }> } | null;
} => {
  const buttons = cleanButtons(raw);
  if (!buttons.length || !String(body || "").trim()) return { body, choices: null };
  if ((channel || "whatsapp") === "whatsapp") return { body: numberedText(body, buttons), choices: null };
  return { body, choices: { question: body, options: buttons.map((label, i) => ({ id: String(i + 1), label })) } };
};
