import { getSetting } from "../../helpers/AppSettings";

// Reference prices of the models the system uses (US$ per million tokens, input / output), so the spending never shows as zero for a model
// nobody typed a price for. They come from the public price lists of the providers (table of PRICES_DATE) and can change: a price saved in
// "ai_price_<model>" (Agentes de IA → Uso) always wins, and the real bill comes from the provider (OpenAI costs API) when it is set up.
export const PRICES_DATE = "2026-11";
export const DEFAULT_PRICES: Record<string, { in: number; out: number }> = {
  // OpenAI
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4.1-nano": { in: 0.1, out: 0.4 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "gpt-4.1": { in: 2, out: 8 },
  "gpt-5-mini": { in: 0.25, out: 2 },
  "o4-mini": { in: 1.1, out: 4.4 },
  // OpenAI transcription of voice notes: charged by minute (US$ 0,006); the usage is logged in seconds of audio, so 100 per million
  // "tokens" (seconds) is the same price
  "whisper-1": { in: 100, out: 0 },
  "gpt-4o-mini-transcribe": { in: 50, out: 0 },
  "gpt-4o-transcribe": { in: 100, out: 0 },
  // Anthropic
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-opus-5-5": { in: 4, out: 20 }
};

// "gpt-4o-mini-2024-07-18" is priced as "gpt-4o-mini": the longest known name the model starts with
export const defaultPriceOf = (model: string): { in: number; out: number } | null => {
  const m = String(model || "").toLowerCase();
  const key = Object.keys(DEFAULT_PRICES).filter(k => m === k || m.startsWith(`${k}-`)).sort((a, b) => b.length - a.length)[0];
  return key ? DEFAULT_PRICES[key] : null;
};

export interface PriceInfo { in: number; out: number; source: "cadastrado" | "padrão" }

export const priceInfoOf = async (model: string): Promise<PriceInfo | null> => {
  const raw = await getSetting(`ai_price_${model}`, "");
  const [i, o] = raw.split(",").map(Number);
  if (raw && Number.isFinite(i) && Number.isFinite(o)) return { in: i, out: o, source: "cadastrado" };
  const d = defaultPriceOf(model);
  return d ? { ...d, source: "padrão" } : null;
};
