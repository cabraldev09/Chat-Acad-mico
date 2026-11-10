// The number typed by a person to connect with the pairing code: digits only, with the country code (Brazil by default).
export const normalizePairingPhone = (raw: unknown): string | null => {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  // 10 or 11 digits = a Brazilian number without the country code
  const full = digits.length <= 11 ? `55${digits}` : digits;
  if (full.length < 12 || full.length > 15) return null;
  return full;
};
