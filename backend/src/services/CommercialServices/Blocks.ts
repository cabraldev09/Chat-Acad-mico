import { toWhatsapp } from "../../helpers/ChannelText";

// A person on WhatsApp writes in short bubbles, one idea each, and never sends a wall of text that the app cuts with "Ler mais".
// The AI is asked to write that way; this makes it true whatever the model does: an answer is split into bubbles of a few lines that are
// sent one after the other (the sender already shows "digitando…" and waits like a person would).
export const BLOCK_MAX = 300; // a bubble never goes past this (WhatsApp folds a long message behind "Ler mais")
export const BLOCK_SOFT = 240; // short paragraphs share a bubble while they fit in this (an idea is never torn into one-line bubbles)
export const BLOCKS_MAX = 5; // more bubbles than this feel like spam

// sentences of a long paragraph (the accented capitals and the *bold* marks also start a sentence)
const sentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?…])\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ*¿¡"“(])/)
    .map(s => s.trim())
    .filter(Boolean);

const pack = (parts: string[], limit: number, joiner: string): string[] => {
  const out: string[] = [];
  parts.forEach(p => {
    const last = out[out.length - 1];
    if (last !== undefined && last.length + joiner.length + p.length <= limit) out[out.length - 1] = `${last}${joiner}${p}`;
    else out.push(p);
  });
  return out;
};

// a word-by-word cut for what has no punctuation at all (a pasted line)
const hardCut = (text: string, limit: number): string[] => {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    let cut = rest.lastIndexOf(" ", limit);
    if (cut < limit / 2) cut = limit;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
};

export const splitIntoBlocks = (raw: string): string[] => {
  const text = toWhatsapp(String(raw || "")).replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return [];
  if (text.length <= BLOCK_SOFT && !text.includes("\n\n")) return [text];

  // 1) the paragraphs the writer already separated (a list stays together: its lines keep one bubble)
  let parts: string[] = [];
  text.split(/\n{2,}/).forEach(p => {
    const para = p.trim();
    if (!para) return;
    if (para.length <= BLOCK_MAX) parts.push(para);
    else {
      // 2) a long paragraph goes by sentences, packed up to the limit
      const packed = pack(sentences(para.replace(/\n/g, " ")), BLOCK_MAX, " ");
      packed.forEach(s => (s.length > BLOCK_MAX ? parts.push(...hardCut(s, BLOCK_MAX)) : parts.push(s)));
    }
  });

  // 3) short neighbours share a bubble (a greeting and the first sentence), but a question stays alone at the end when it fits
  const question = parts.length > 1 && /\?\s*$/.test(parts[parts.length - 1]) && parts[parts.length - 1].length <= BLOCK_SOFT ? parts.pop()! : null;
  const room = BLOCKS_MAX - (question ? 1 : 0);
  // 4) too many bubbles: neighbours are joined with a little more room each time (up to what WhatsApp shows without "Ler mais")
  let limit = BLOCK_SOFT;
  let packed = pack(parts, limit, "\n\n");
  while (packed.length > room && limit < 600) {
    limit = Math.ceil(limit * 1.25);
    packed = pack(parts, limit, "\n\n");
  }
  parts = packed;
  if (question) parts.push(question);
  return parts.flatMap(p => (p.length > 650 ? hardCut(p, BLOCK_MAX) : [p]));
};
