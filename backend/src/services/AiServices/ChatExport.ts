// Reads the file that WhatsApp exports ("Exportar conversa"): Android ("12/03/2024 14:35 - Ana: oi") and iPhone ("[12/03/2024 14:35:10] Ana: oi").
// Pure text code (no database, no network).

export interface ExportedMessage {
  at: string;
  name: string;
  text: string;
}
export interface ExportedChat {
  messages: ExportedMessage[];
  participants: Array<{ name: string; count: number }>;
}

// invisible marks that WhatsApp writes before lines (left-to-right mark, no-break spaces)
const CLEAN = /[‎‏‪-‮⁦-⁩﻿]/g;
const HEAD = /^\[?(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp]\.?[Mm]\.?)?)\]?\s*(?:-\s*)?(.*)$/;
const SKIP_BODY = /^(<\s*m[ií]dia oculta\s*>|<\s*media omitted\s*>|<\s*attached:.*>|.*\((arquivo|imagem|v[ií]deo|[aá]udio|figurinha|sticker|documento|gif) (anexad[oa]|omitid[oa]|oculto|oculta)\)|(imagem|v[ií]deo|[aá]udio|figurinha|sticker|documento|gif) (omitid[oa]|oculto|oculta|ocultad[oa])|.*omitted|null)$/i;
const SKIP_LINE = /(mensagem apagada|esta mensagem foi apagada|you deleted this message|this message was deleted|aguardando mensagem|mensagens e liga[cç][oõ]es s[aã]o protegidas|messages and calls are end-to-end encrypted|chamada de voz|chamada de v[ií]deo|missed (voice|video) call)/i;

const iso = (d: string, m: string, y: string, t: string): string => {
  const year = y.length === 2 ? `20${y}` : y;
  let [hh, mm] = t.split(":");
  const pm = /p\.?m/i.test(t);
  const am = /a\.?m/i.test(t);
  let h = Number(hh);
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  mm = mm.replace(/\D.*$/, "");
  return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${String(h).padStart(2, "0")}:${mm.padStart(2, "0")}`;
};

// the date is day/month in Brazil; when the first number cannot be a day (>12 in the second), swap
const fixDate = (a: string, b: string): [string, string] => (Number(b) > 12 && Number(a) <= 12 ? [b, a] : [a, b]);

export const parseWhatsAppExport = (raw: string): ExportedChat => {
  const lines = String(raw || "").replace(/\r/g, "").replace(CLEAN, "").split("\n");
  const messages: ExportedMessage[] = [];
  let current: ExportedMessage | null = null;
  for (const line of lines) {
    const m = line.match(HEAD);
    if (m) {
      const rest = m[5];
      const sep = rest.indexOf(": ");
      // a system line (group created, someone joined, encryption notice) has no "Name: " part
      if (sep <= 0 || sep > 60) {
        current = null;
        continue;
      }
      const [dd, mo] = fixDate(m[1], m[2]);
      current = { at: iso(dd, mo, m[3], m[4]), name: rest.slice(0, sep).trim(), text: rest.slice(sep + 2).trim() };
      messages.push(current);
    } else if (current) {
      current.text += `\n${line}`;
    }
  }
  const kept = messages
    .map(x => ({ ...x, text: x.text.trim() }))
    .filter(x => x.text && !SKIP_BODY.test(x.text) && !SKIP_LINE.test(x.text));
  const counts = new Map<string, number>();
  kept.forEach(x => counts.set(x.name, (counts.get(x.name) || 0) + 1));
  const participants = [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  return { messages: kept, participants };
};

export const looksLikeWhatsAppExport = (raw: string): boolean => parseWhatsAppExport(String(raw || "").slice(0, 200000)).messages.length >= 5;

// phone numbers, CPF and e-mails never leave the server: the model reads the way of talking, not the people
export const maskPii = (text: string): string =>
  String(text || "")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, "[telefone]");

// the conversation as a transcript: the attendant is "ATENDENTE", everybody else "CLIENTE"; a long pause starts a new conversation
export const toTranscript = (chat: ExportedChat, attendant: string): string => {
  const out: string[] = [];
  let last = 0;
  for (const m of chat.messages) {
    const t = Date.parse(m.at);
    if (out.length && t - last > 6 * 3600000) out.push("=== nova conversa ===");
    last = t;
    out.push(`${m.name === attendant ? "ATENDENTE" : "CLIENTE"}: ${maskPii(m.text).replace(/\n/g, " ")}`);
  }
  return out.join("\n");
};

// pieces that fit in one model call, cut between lines (never in the middle of a message)
export const chunkLines = (text: string, max = 14000): string[] => {
  const chunks: string[] = [];
  let cur = "";
  for (const line of String(text || "").split("\n")) {
    if (cur && cur.length + line.length + 1 > max) {
      chunks.push(cur);
      cur = "";
    }
    cur += (cur ? "\n" : "") + line.slice(0, max);
  }
  if (cur) chunks.push(cur);
  return chunks;
};
