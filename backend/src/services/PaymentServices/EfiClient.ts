import axios, { AxiosRequestConfig } from "axios";
import https from "https";
import fs from "fs";
import path from "path";

import AppError from "../../errors/AppError";
import { getSetting } from "../../helpers/AppSettings";
import { logger } from "../../utils/logger";

// Efí Bank (ex-Gerencianet) Pix API. Auth is OAuth2 client credentials over
// mutual TLS: the .p12 certificate downloaded from the Efí panel is required.
export const CERT_PATH = path.resolve(__dirname, "..", "..", "..", "secrets", "efi.p12");

export interface EfiConfig {
  env: "sandbox" | "production";
  clientId: string;
  clientSecret: string;
  pixKey: string;
}

export const loadConfig = async (): Promise<EfiConfig> => ({
  env: (await getSetting("efi_env", "sandbox")) === "production" ? "production" : "sandbox",
  clientId: await getSetting("efi_client_id", ""),
  clientSecret: await getSetting("efi_client_secret", ""),
  pixKey: await getSetting("efi_pix_key", "")
});

export const isConfigured = (cfg: EfiConfig): boolean =>
  !!(cfg.clientId && cfg.clientSecret && cfg.pixKey);

const baseUrl = (cfg: EfiConfig): string =>
  process.env.EFI_API_URL ||
  (cfg.env === "production"
    ? "https://pix.api.efipay.com.br"
    : "https://pix-h.api.efipay.com.br");

const agentFor = (url: string): https.Agent | undefined => {
  if (!url.startsWith("https")) return undefined; // local mock server in tests
  if (!fs.existsSync(CERT_PATH)) throw new AppError("ERR_EFI_NO_CERT");
  return new https.Agent({ pfx: fs.readFileSync(CERT_PATH), passphrase: "" });
};

const tokens = new Map<string, { value: string; exp: number }>();

const explain = (err: any): AppError => {
  const d = err?.response?.data;
  const msg = d?.mensagem || d?.error_description || d?.message || err?.message || "falha na API";
  logger.warn(`Efí API error: ${JSON.stringify(d || err?.message)}`);
  return new AppError(`Efí: ${msg}`);
};

export const clearTokens = (): void => tokens.clear();

const request = async (cfg: EfiConfig, config: AxiosRequestConfig) => {
  const url = baseUrl(cfg);
  const httpsAgent = agentFor(url);
  const key = `${cfg.env}:${cfg.clientId}`;
  let tk = tokens.get(key);
  if (!tk || tk.exp < Date.now() + 60000) {
    try {
      const res = await axios.post(
        `${url}/oauth/token`,
        { grant_type: "client_credentials" },
        {
          httpsAgent,
          timeout: 20000,
          auth: { username: cfg.clientId, password: cfg.clientSecret }
        }
      );
      tk = { value: res.data.access_token, exp: Date.now() + (res.data.expires_in || 3600) * 1000 };
      tokens.set(key, tk);
    } catch (err) {
      throw explain(err);
    }
  }
  try {
    const res = await axios({
      ...config,
      url: `${url}${config.url}`,
      httpsAgent,
      timeout: 25000,
      headers: { ...(config.headers || {}), Authorization: `Bearer ${tk.value}` }
    });
    return res.data;
  } catch (err) {
    if (err?.response?.status === 401) tokens.delete(key);
    throw explain(err);
  }
};

export interface EfiCharge {
  txid: string;
  status: string; // ATIVA | CONCLUIDA | REMOVIDA_PELO_USUARIO_RECEBEDOR | REMOVIDA_PELO_PSP
  pixCopiaECola?: string;
  loc?: { id: number; location: string };
  pix?: Array<{ endToEndId: string; txid: string; valor: string; horario: string }>;
}

// A successful OAuth token request proves the credentials and the certificate
export const testConnection = async (cfg: EfiConfig): Promise<void> => {
  const url = baseUrl(cfg);
  const httpsAgent = agentFor(url);
  try {
    await axios.post(
      `${url}/oauth/token`,
      { grant_type: "client_credentials" },
      { httpsAgent, timeout: 20000, auth: { username: cfg.clientId, password: cfg.clientSecret } }
    );
  } catch (err) {
    throw explain(err);
  }
};

export const createCharge = async (
  cfg: EfiConfig,
  p: { txid: string; amount: number; cpf: string; name: string; expirationSeconds: number; description: string }
): Promise<EfiCharge> =>
  request(cfg, {
    method: "PUT",
    url: `/v2/cob/${p.txid}`,
    data: {
      calendario: { expiracao: p.expirationSeconds },
      devedor: { cpf: p.cpf, nome: p.name.slice(0, 200) },
      valor: { original: p.amount.toFixed(2) },
      chave: cfg.pixKey,
      solicitacaoPagador: p.description.slice(0, 140)
    }
  });

export const getQrCode = async (
  cfg: EfiConfig,
  locId: number
): Promise<{ qrcode: string; imagemQrcode: string }> =>
  request(cfg, { method: "GET", url: `/v2/loc/${locId}/qrcode` });

export const getCharge = async (cfg: EfiConfig, txid: string): Promise<EfiCharge> =>
  request(cfg, { method: "GET", url: `/v2/cob/${txid}` });

export const cancelCharge = async (cfg: EfiConfig, txid: string): Promise<void> => {
  await request(cfg, {
    method: "PATCH",
    url: `/v2/cob/${txid}`,
    data: { status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" }
  });
};

// Efí appends "/pix" to this URL when delivering notifications. mTLS is skipped
// on our side (the URL carries a secret and every payment is re-checked via API).
export const registerWebhook = async (cfg: EfiConfig, url: string): Promise<void> => {
  await request(cfg, {
    method: "PUT",
    url: `/v2/webhook/${encodeURIComponent(cfg.pixKey)}`,
    headers: { "x-skip-mtls-checking": "true" },
    data: { webhookUrl: url }
  });
};
