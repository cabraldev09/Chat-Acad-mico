import AppError from "../../errors/AppError";
import { logger } from "../../utils/logger";

// What the AI provider answered when it did not work, in words the owner can act on (the key is never part of it).
export interface ProviderFailure {
  status: number | null;
  code: string;
  detail: string;
}

const clean = (text: string): string =>
  String(text || "")
    .replace(/(sk|key|Bearer)[-_ ]?[A-Za-z0-9._-]{12,}/g, "[chave]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);

export const explainProviderError = (err: any, model?: string): ProviderFailure => {
  const status: number | null = err?.response?.status ?? null;
  const body = err?.response?.data;
  const providerCode = String(body?.error?.code || body?.error?.type || "");
  const providerMessage = clean(body?.error?.message || (typeof body === "string" ? body : "") || err?.message || "");
  const code = String(err?.code || "");
  if (status === 401) return { status, code: "key_refused", detail: "A chave de API foi recusada pelo provedor. Confira se é a chave certa para este provedor (GPT ou Claude)." };
  if (status === 403) return { status, code: "forbidden", detail: `A chave não tem acesso ao modelo${model ? ` "${model}"` : ""}. ${providerMessage}` };
  if (status === 404 || /model_not_found|not_found_error/.test(providerCode)) return { status, code: "model_not_found", detail: `O modelo${model ? ` "${model}"` : ""} não existe ou a chave não tem acesso a ele. Escolha outro modelo nos Ajustes do agente.` };
  if (status === 429 && /quota|billing|credit/i.test(`${providerCode} ${providerMessage}`)) return { status, code: "no_balance", detail: "Sem saldo no provedor de IA. Adicione créditos e tente de novo." };
  if (status === 429) return { status, code: "rate_limit", detail: "O provedor pediu para aguardar (muitas chamadas). Tente de novo em instantes." };
  if (status === 400) return { status, code: "bad_request", detail: `O provedor recusou o pedido: ${providerMessage}` };
  if (status && status >= 500) return { status, code: "provider_down", detail: "O provedor de IA está com problema agora. Tente de novo em instantes." };
  if (code === "ECONNABORTED" || /timeout/i.test(providerMessage)) return { status, code: "timeout", detail: "O provedor demorou demais para responder. Tente de novo." };
  if (["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "EAI_AGAIN"].includes(code)) return { status, code: "network", detail: "O servidor não conseguiu falar com o provedor de IA (rede)." };
  return { status, code: "unknown", detail: providerMessage || "Erro desconhecido ao falar com o provedor de IA." };
};

// The error the screens receive: the usual title plus the real reason; and the log keeps it for the team.
export const aiError = (err: any, where: string, model?: string): AppError => {
  if (err instanceof AppError) return err;
  if (err && err.message === "ERR_AI_NO_API_KEY") return new AppError("ERR_AI_NO_API_KEY");
  const failure = explainProviderError(err, model);
  logger.error(`AI (${where}) failed: ${failure.status || "-"} ${failure.code} ${failure.detail}${err?.stack && failure.code === "unknown" ? ` | ${String(err.stack).split("\n").slice(0, 3).join(" ")}` : ""}`);
  return new AppError("ERR_AI_FAILED", 502, { detail: failure.detail, reason: failure.code });
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// The call is repeated when the provider is busy (429 without balance problem, 5xx, network) and when it does not know a parameter.
export const withRetry = async <T>(run: (compat: boolean) => Promise<T>): Promise<T> => {
  let compat = false;
  let lastErr: any;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await run(compat);
    } catch (err) {
      lastErr = err;
      const status = err?.response?.status;
      const message = String(err?.response?.data?.error?.message || "");
      if (status === 400 && /max_completion_tokens|max_tokens|unsupported parameter/i.test(message) && !compat) { compat = true; continue; }
      const busy = (status === 429 && !/quota|billing|credit/i.test(message)) || (status && status >= 500) || ["ECONNRESET", "EAI_AGAIN"].includes(String(err?.code));
      if (!busy) throw err;
      // eslint-disable-next-line no-await-in-loop
      await wait(800 * (attempt + 1));
    }
  }
  throw lastErr;
};
