// Contact cards (vCard 3.0), the same everywhere: a card received on a QR Code number (one or several, "multi_vcard"), a card received
// on the official number (Meta sends them as "contacts") and the card the team sends. Stored as the message body, one card after the
// other, with mediaType "vcard": the conversation shows each person with "Conversar".

const clean = (v: unknown): string => String(v ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
const digits = (v: unknown): string => String(v ?? "").replace(/\D/g, "");

export const vcardOf = (name: string, number: string): string => {
  const n = digits(number);
  return `BEGIN:VCARD\nVERSION:3.0\nFN:${clean(name) || `+${n}`}\nTEL;type=CELL;waid=${n}:+${n}\nEND:VCARD`;
};

// the "contacts" of a message of the official API: one card per person, with every number (the WhatsApp one carries waid)
export const vcardsOfCloud = (contacts: any): string =>
  (Array.isArray(contacts) ? contacts : [])
    .map((c: any) => {
      const name = clean(c?.name?.formatted_name || [c?.name?.first_name, c?.name?.last_name].filter(Boolean).join(" "));
      const phones = (Array.isArray(c?.phones) ? c.phones : [])
        .map((p: any) => ({ wa: digits(p?.wa_id), phone: digits(p?.phone) }))
        .filter((p: { wa: string; phone: string }) => (p.wa || p.phone).length >= 8);
      if (!phones.length) return "";
      const tels = phones.map((p: { wa: string; phone: string }) => (p.wa ? `TEL;type=CELL;waid=${p.wa}:+${p.wa}` : `TEL;type=CELL:+${p.phone}`));
      return `BEGIN:VCARD\nVERSION:3.0\nFN:${name || `+${phones[0].wa || phones[0].phone}`}\n${tels.join("\n")}\nEND:VCARD`;
    })
    .filter(Boolean)
    .join("\n");

// a card (or several) received on a QR Code number: whatsapp-web.js gives the cards in vCards
export const vcardsOfWbot = (msg: { type?: string; body?: string; vCards?: string[] }): string => {
  const cards = (Array.isArray(msg.vCards) ? msg.vCards : []).map(c => String(c || "").trim()).filter(c => /^BEGIN:VCARD/i.test(c));
  if (cards.length) return cards.join("\n");
  return msg.type === "vcard" && /^\s*BEGIN:VCARD/i.test(msg.body || "") ? String(msg.body).trim() : "";
};

export const countCards = (body?: string | null): number => (String(body || "").match(/BEGIN:VCARD/gi) || []).length;

// the card sent by the official API (message type "contacts", as the Meta documents it)
export const cloudContactsPayload = (name: string, number: string) => {
  const n = digits(number);
  const full = clean(name) || `+${n}`;
  return [{ name: { formatted_name: full, first_name: full.split(" ")[0] }, phones: [{ phone: `+${n}`, wa_id: n, type: "CELL" }] }];
};
