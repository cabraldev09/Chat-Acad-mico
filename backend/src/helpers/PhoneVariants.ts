// The same Brazilian mobile number is stored with and without the ninth digit (5569991234567 / 556991234567): both forms are
// the same person. Used to recognise a contact we already know before deciding whether it is a "cold" number.
export const brPhoneVariants = (raw: string): string[] => {
  const d = String(raw || "").replace(/\D/g, "");
  const out = new Set<string>([d]);
  if (d.startsWith("55")) {
    if (d.length === 13 && d[4] === "9") out.add(d.slice(0, 4) + d.slice(5));
    if (d.length === 12 && /[6-9]/.test(d[4])) out.add(`${d.slice(0, 4)}9${d.slice(4)}`);
  }
  return [...out].filter(Boolean);
};
