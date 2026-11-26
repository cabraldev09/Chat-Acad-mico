// Field masks: what the person types becomes the right shape while they type (CPF, phone, e-mail, name, city, money in reais).
// Pure functions: the screens keep the clean value (digits, a number) and show the formatted one.
import { formatCpf, isValidCpf as cpfCheck, onlyDigits as cpfDigits } from "../pages/CRM/cpf";

export const digitsOf = (v) => String(v ?? "").replace(/\D/g, "");

// CPF: 000.000.000-00, only digits, at most 11
export const cpfMask = (v) => formatCpf(v);
export const cpfClean = (v) => cpfDigits(v);
export const isValidCpf = (v) => cpfCheck(v);

// Brazilian phone: (69) 3333-4444, (69) 99999-9999; with the country code, +55 (69) 99999-9999. The value kept is only the digits
// (the server adds 55 to a national number, helpers/Phone.ts normalizePhone).
export const phoneClean = (v) => digitsOf(v).slice(0, 13);
export const phoneMask = (v) => {
  const d = phoneClean(v);
  if (!d) return "";
  const withCountry = d.length > 11 && d.startsWith("55");
  const national = withCountry ? d.slice(2) : d;
  const prefix = withCountry ? "+55 " : "";
  if (national.length <= 2) return `${prefix}(${national}`;
  const area = national.slice(0, 2);
  const rest = national.slice(2);
  // 8 digits after the area code is a landline (4-4), 9 a mobile (5-4); while typing, the hyphen moves as the number grows
  const head = rest.length > 8 ? rest.slice(0, 5) : rest.slice(0, 4);
  const tail = rest.length > 8 ? rest.slice(5, 9) : rest.slice(4, 8);
  return `${prefix}(${area}) ${head}${tail ? `-${tail}` : ""}`;
};
// a complete phone: area code and 8 or 9 digits (with or without 55)
export const isValidPhone = (v) => {
  const d = phoneClean(v);
  const national = d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
  return national.length === 10 || national.length === 11;
};

// e-mail: no spaces, lower case
export const emailNormalize = (v) => String(v ?? "").replace(/\s+/g, "").toLowerCase();
export const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailNormalize(v));

// Name and city in Portuguese: every word with the first letter in capitals, the small words in the middle in lower case
// ("joão DA silva" → "João da Silva"). While typing, the spaces are kept as typed (a final space is never eaten).
const SMALL = new Set(["de", "da", "do", "das", "dos", "e", "d'"]);
export const titleCaseName = (v) => {
  const text = String(v ?? "");
  let index = 0;
  return text.replace(/[^\s]+/g, (word) => {
    const lower = word.toLocaleLowerCase("pt-BR");
    const first = index === 0;
    index += 1;
    if (!first && SMALL.has(lower)) return lower;
    // hyphenated and apostrophe names: each part capitalised (Maria-Clara, D'Ávila)
    return lower.replace(/(^|[-'’])(\p{L})/gu, (m, sep, ch) => sep + ch.toLocaleUpperCase("pt-BR"));
  });
};
// the name kept: no double or edge spaces
export const nameClean = (v) => titleCaseName(String(v ?? "").replace(/\s+/g, " ").trim());

// Money in reais typed from right to left, like a card machine: 1 → R$ 0,01, 12145 → R$ 121,45. Pasting "1.221,45" or "1221.45"
// keeps the value. Returns the text to show and the number (null when empty).
const fmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const brl = (n) => (n === null || n === undefined || n === "" || Number.isNaN(Number(n)) ? "" : `R$ ${fmt.format(Number(n))}`);
export const parseMoney = (raw) => {
  const s = String(raw ?? "").replace(/R\$\s?/g, "").trim();
  if (!s) return null;
  // a pasted value with a decimal separator (1.221,45 or 1221.45 or 1221,4)
  const m = s.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:[.,](\d{1,2}))?$/);
  if (m && (m[2] !== undefined || /\./.test(m[1]))) {
    const int = m[1].replace(/\./g, "");
    return Number(`${int}.${(m[2] || "0").padEnd(2, "0")}`);
  }
  if (/^\d+[.,]\d{1,2}$/.test(s)) return Number(s.replace(",", "."));
  return null;
};
export const brlTyping = (raw) => {
  const text = String(raw ?? "");
  if (!digitsOf(text)) return { text: "", value: null };
  const pasted = parseMoney(text);
  if (pasted !== null && !/^R\$/.test(text.trim())) return { text: brl(pasted), value: pasted };
  // typed into the formatted field: every digit counts as cents; erasing down to zeros empties the field (it never gets stuck on R$ 0,00)
  const significant = digitsOf(text).replace(/^0+/, "").slice(0, 13);
  if (!significant) return { text: "", value: null };
  const cents = Number(significant);
  const value = Math.round(cents) / 100;
  return { text: brl(value), value };
};
