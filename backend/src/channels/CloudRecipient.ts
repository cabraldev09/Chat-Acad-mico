// Meta hands Brazilian mobiles over without the ninth digit (wa_id 556992283812). Sending to that id works for real numbers, but the
// test number of an app only sends to its list of allowed recipients, where the number is usually saved with the 9: the same mobile
// with the 9 put back, or null when the number is not a Brazilian mobile missing it.
export const brazilWithNinthDigit = (number: string): string | null => {
  const digits = String(number || "").replace(/\D/g, "");
  return /^55\d{2}[6-9]\d{7}$/.test(digits) ? `${digits.slice(0, 4)}9${digits.slice(4)}` : null;
};

const NOT_ALLOWED_RECIPIENT = 131030;

// Sends to the number Meta gave; refused as "not in the allowed list" for a Brazilian mobile without the 9, sends once more with the 9
// (numbers that already work never get there).
export const sendToRecipient = async <T>(number: string, post: (to: string) => Promise<T>, onRetry?: (to: string) => void): Promise<T> => {
  try {
    return await post(number);
  } catch (err) {
    const withNine = brazilWithNinthDigit(number);
    if (Number((err as any)?.response?.data?.error?.code) !== NOT_ALLOWED_RECIPIENT || !withNine) throw err;
    if (onRetry) onRetry(withNine);
    return post(withNine);
  }
};
