import { randomBytes } from "crypto";

import { getSetting, setSetting } from "../../helpers/AppSettings";

// How many days before the due date the boleto is made. Only a whole number typed on purpose counts (0 = on the due day);
// empty or anything else stays at 3, the default.
export const chargeDaysBeforeOf = (raw: unknown): number => {
  const text = String(raw ?? "").trim();
  return /^\d+$/.test(text) ? Math.min(30, Number(text)) : 3;
};

// The secret in the address the Efí calls when a boleto is paid: made by the server the first time it is needed (it used to wait for
// someone to open Configurações, Pagamentos)
export const efiWebhookSecret = async (): Promise<string> => {
  let secret = await getSetting("efi_webhook_secret", "");
  if (!secret) {
    secret = randomBytes(20).toString("hex");
    await setSetting("efi_webhook_secret", secret);
  }
  return secret;
};
