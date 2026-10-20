import { isEmail } from "./Email";
// Brazilian-first phone normalisation: digits only, country code 55 added when
// the number looks like a national one (10-11 digits).
export const normalizePhone = (raw?: string | null): string | null => {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length < 8) return null;
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
};

// a number the consultant can write to on WhatsApp: the country code and the area code are there (at least 12 digits)
export const isWhatsappReady = (raw?: string | null): boolean => {
  const n = normalizePhone(raw);
  return !!n && n.length >= 12 && n.length <= 15;
};

export const normalizeEmail = (raw?: string | null): string | null => {
  if (!raw) return null;
  const e = String(raw).trim().toLowerCase();
  return isEmail(e) ? e : null;
};
