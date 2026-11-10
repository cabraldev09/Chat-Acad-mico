// What WhatsApp answers when asked about a number is either the same phone (Brazilian numbers may differ by the 9th digit)
// or, for people it knows only by its internal id, that internal id ("@lid": 14-15 digits that look like a phone but are
// not one). The answer is the same phone only when both end with the same 8 digits.
export const splitRegistered = (typed: string, registered: string): { phone: string; lid?: string } => {
  const reg = String(registered || "").replace(/\D/g, "");
  if (!reg) return { phone: typed };
  return reg.slice(-8) === typed.slice(-8) ? { phone: reg } : { phone: typed, lid: reg };
};
