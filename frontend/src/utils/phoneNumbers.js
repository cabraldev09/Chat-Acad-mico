import { findPhoneNumbersInText, parsePhoneNumberFromString } from "libphonenumber-js/min";

export const validPhone = (value) => {
  const phone = parsePhoneNumberFromString(String(value || ""), "BR");
  return phone?.isValid() ? phone.number : null;
};

// Exclude URLs and existing Markdown links so their destinations are never rewritten.
export const linkPhoneNumbers = (text) => {
  if (typeof text !== "string") return text;
  const protectedRanges = [...text.matchAll(/https?:\/\/\S+|\[[^\]]*\]\([^)]*\)|`[^`]*`/g)].map(m => [m.index, m.index + m[0].length]);
  const matches = findPhoneNumbersInText(text, "BR").filter(m => m.number.isValid() && !protectedRanges.some(([start, end]) => m.startsAt < end && m.endsAt > start));
  let out = text;
  matches.reverse().forEach(m => { out = out.slice(0, m.startsAt) + `[${text.slice(m.startsAt, m.endsAt)}](tel:${m.number.number})` + out.slice(m.endsAt); });
  return out;
};
