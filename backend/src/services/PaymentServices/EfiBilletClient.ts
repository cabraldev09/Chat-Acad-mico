import axios, { AxiosRequestConfig } from "axios";

import AppError from "../../errors/AppError";
import { logger } from "../../utils/logger";
import { EfiConfig } from "./EfiClient";

// Efí Cobranças API (boleto / Bolix = boleto with Pix, card). Unlike the Pix API
// it needs no client certificate: OAuth2 client credentials over Basic auth.
// Docs: https://dev.efipay.com.br/docs/api-cobrancas
const baseUrl = (cfg: EfiConfig): string =>
  process.env.EFI_BILLET_API_URL ||
  (cfg.env === "production" ? "https://cobrancas.api.efipay.com.br" : "https://cobrancas-h.api.efipay.com.br");

const tokens = new Map<string, { value: string; exp: number }>();
export const clearBilletTokens = (): void => tokens.clear();

const explain = (err: any): AppError => {
  const d = err?.response?.data;
  const msg = d?.error_description?.message || d?.error_description || d?.message || d?.error || err?.message || "falha na API";
  logger.warn(`Efí billet API error: ${JSON.stringify(d || err?.message)}`);
  // the status Efí answered with travels along: the caller tells a refusal of the data (4xx) from a failure of the network
  return new AppError(`Efí: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`, 400, { efiStatus: Number(err?.response?.status) || 0 });
};

const request = async (cfg: EfiConfig, config: AxiosRequestConfig) => {
  const url = baseUrl(cfg);
  const key = `${cfg.env}:${cfg.clientId}`;
  let tk = tokens.get(key);
  if (!tk || tk.exp < Date.now() + 60000) {
    try {
      const res = await axios.post(
        `${url}/v1/authorize`,
        { grant_type: "client_credentials" },
        { timeout: 20000, auth: { username: cfg.clientId, password: cfg.clientSecret } }
      );
      tk = { value: res.data.access_token, exp: Date.now() + (res.data.expires_in || 600) * 1000 };
      tokens.set(key, tk);
    } catch (err) {
      throw explain(err);
    }
  }
  try {
    const res = await axios({
      ...config,
      url: `${url}${config.url}`,
      timeout: 25000,
      headers: { ...(config.headers || {}), Authorization: `Bearer ${tk.value}` }
    });
    return res.data;
  } catch (err) {
    if (err?.response?.status === 401) tokens.delete(key);
    throw explain(err);
  }
};

export interface BilletCharge {
  charge_id: number | string;
  status: string; // new | waiting | paid | unpaid | refunded | contested | canceled | settled | expired
  total?: number;
  custom_id?: string;
  barcode?: string;
  link?: string;
  billet_link?: string;
  pdf?: { charge?: string };
  expire_at?: string;
  pix?: { qrcode?: string; qrcode_image?: string };
  payment?: string;
}

export const testBilletConnection = async (cfg: EfiConfig): Promise<void> => {
  try {
    await axios.post(
      `${baseUrl(cfg)}/v1/authorize`,
      { grant_type: "client_credentials" },
      { timeout: 20000, auth: { username: cfg.clientId, password: cfg.clientSecret } }
    );
  } catch (err) {
    throw explain(err);
  }
};

// One-step boleto charge. `repass` routes `percentage` (1% = 100, so 10000 = all of it) of the amount to another Efí
// account by its "payee_code" (the Wallet ID, the only thing needed); whatever is not routed stays with the account that
// owns the credentials. `feeMode` says who pays the Efí fee: 1 = only the account that issued the charge, 2 = each
// receiving account in proportion to what it gets (the default of Efí).
// Docs: https://dev.efipay.com.br/en/docs/api-cobrancas/split-de-pagamento/
export const createBolix = async (
  cfg: EfiConfig,
  p: {
    customId: string;
    name: string;
    cpf: string;
    phone?: string | null;
    amountCents: number;
    dueDate: string; // YYYY-MM-DD
    description: string;
    notificationUrl?: string;
    repass?: { payeeCode: string; percentage: number; feeMode?: 1 | 2 } | null;
  }
): Promise<BilletCharge> => {
  const item: any = { name: p.description.slice(0, 255), value: p.amountCents, amount: 1 };
  if (p.repass) {
    item.marketplace = {
      mode: p.repass.feeMode === 1 ? 1 : 2,
      repasses: [{ payee_code: p.repass.payeeCode, percentage: Math.min(10000, Math.max(1, Math.round(p.repass.percentage))) }]
    };
  }
  const data = await request(cfg, {
    method: "POST",
    url: "/v1/charge/one-step",
    data: {
      items: [item],
      metadata: { custom_id: p.customId, ...(p.notificationUrl ? { notification_url: p.notificationUrl } : {}) },
      payment: {
        banking_billet: {
          expire_at: p.dueDate,
          message: p.description.slice(0, 80),
          customer: {
            name: p.name.slice(0, 255),
            cpf: p.cpf,
            ...(p.phone && p.phone.length >= 10 ? { phone_number: p.phone.slice(-11) } : {})
          }
        }
      }
    }
  });
  return data.data || data;
};

export const getBilletCharge = async (cfg: EfiConfig, chargeId: string): Promise<BilletCharge> => {
  const data = await request(cfg, { method: "GET", url: `/v1/charge/${chargeId}` });
  return data.data || data;
};

export const cancelBilletCharge = async (cfg: EfiConfig, chargeId: string): Promise<void> => {
  await request(cfg, { method: "PUT", url: `/v1/charge/${chargeId}/cancel` });
};

// Notification token (sent by Efí to our webhook) -> the charge ids it talks about
export const notificationCharges = async (cfg: EfiConfig, token: string): Promise<string[]> => {
  const data = await request(cfg, { method: "GET", url: `/v1/notification/${encodeURIComponent(token)}` });
  const events: any[] = Array.isArray(data.data) ? data.data : [];
  return [...new Set(events.map(e => String(e?.identifiers?.charge_id || "")).filter(Boolean))];
};
