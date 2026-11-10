// Meta hands Brazilian mobiles over without the ninth digit (wa_id 556992283812). Sending to that id works for real numbers, but the
// test number of an app only sends to its list of allowed recipients, where the number is usually saved with the 9: the same mobile
// with the 9 put back, or null when the number is not a Brazilian mobile missing it.
export const brazilWithNinthDigit = (number: string): string | null => {
  const digits = String(number || "").replace(/\D/g, "");
  return /^55\d{2}[6-9]\d{7}$/.test(digits) ? `${digits.slice(0, 4)}9${digits.slice(4)}` : null;
};

export const NOT_ALLOWED_RECIPIENT = 131030;

// The form of a number that Meta accepted after refusing the other (in memory: after a restart the first refusal teaches it again)
const preferred = new Map<string, string>();
export const rememberRecipient = (number: string, to: string): void => {
  preferred.set(String(number), to);
};
export const recipientOf = (number: string): string => preferred.get(String(number)) || number;

// A message sent again under a new id: the ticks of the new id belong to the row of the old one
const aliases = new Map<string, string>();
export const aliasMessage = (newId: string, oldId: string): void => {
  aliases.set(newId, oldId);
};
export const messageIdOf = (id: string): string => aliases.get(id) || id;

// Sends to the number Meta gave (or the form it accepted before); refused as "not in the allowed list" for a Brazilian mobile without
// the 9, sends once more with the 9 and keeps that form (numbers that already work never get there).
export const sendToRecipient = async <T>(number: string, post: (to: string) => Promise<T>, onRetry?: (to: string) => void): Promise<T> => {
  const to = recipientOf(number);
  try {
    return await post(to);
  } catch (err) {
    const withNine = brazilWithNinthDigit(to);
    if (Number((err as any)?.response?.data?.error?.code) !== NOT_ALLOWED_RECIPIENT || !withNine) throw err;
    if (onRetry) onRetry(withNine);
    const out = await post(withNine);
    rememberRecipient(number, withNine);
    return out;
  }
};

// A "failed" status of the Cloud API webhook: what Meta said, and the number to send again to (a Brazilian mobile without the 9 out
// of the allowed list), or null when sending again would not help.
export const failureOf = (status: any): { code: number; text: string; retryTo: string | null } => {
  const e = (status && Array.isArray(status.errors) && status.errors[0]) || {};
  const code = Number(e.code || 0);
  const text = [e.title || e.message || "erro", e.error_data?.details].filter(Boolean).join(": ");
  const retryTo = code === NOT_ALLOWED_RECIPIENT ? brazilWithNinthDigit(String(status?.recipient_id || "")) : null;
  return { code, text, retryTo };
};
