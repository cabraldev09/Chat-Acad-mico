// What a good conversation keeps between two moments: a return after hours or days is marked in the history (so an "oi" is read as a new
// moment of the same conversation), and an answer that hands the person over never ends in a question nobody will answer.

// a pause this long between two messages is a return: the history marks it and the agent resumes instead of starting over
export const RETURN_GAP_MS = 6 * 3600 * 1000;

export const sinceText = (ms: number): string => {
  const hours = Math.round(ms / 3600000);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 dia" : `${days} dias`;
};

// "23/11 às 00:03", in the time of the company
export const whenText = (at: number, tz = process.env.APP_TZ || "America/Porto_Velho"): string => {
  const d = new Date(at);
  const day = d.toLocaleDateString("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" });
  const hour = d.toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  return `${day} às ${hour}`;
};

export const gapNote = (prev: number, at: number, tz?: string): string => `[Nova conversa em ${whenText(at, tz)}, ${sinceText(at - prev)} depois da anterior]`;

// the closing question of an answer that hands over (the person would answer to nobody), keeping the paragraphs
const withoutQuestion = (text: string): string => {
  const parts = String(text || "").trim().split(/(?<=[.!?])\s+/);
  while (parts.length && /\?[\s"”')]*$/.test(parts[parts.length - 1])) parts.pop();
  return parts.join(" ").trim();
};
export const dropClosingQuestion = (text: string): string => {
  const paras = String(text || "").trim().split(/\n{2,}/);
  while (paras.length) {
    const last = withoutQuestion(paras[paras.length - 1]);
    if (last) { paras[paras.length - 1] = last; break; }
    paras.pop();
  }
  return paras.join("\n\n");
};
