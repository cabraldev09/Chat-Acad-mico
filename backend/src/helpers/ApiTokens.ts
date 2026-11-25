import { createHash, randomBytes, timingSafeEqual } from "crypto";

import AppError from "../errors/AppError";

// What an API v1 token may do. Each route asks for one scope (middleware/apiScope). "*" = everything (only the legacy tokens).
export const API_SCOPES = {
  "leads:read": "Ler leads",
  "leads:write": "Criar leads",
  "contacts:read": "Ler contatos",
  "contacts:write": "Criar e atualizar contatos",
  "tickets:read": "Ler conversas (sem o texto)",
  "connections:read": "Ler as conexões",
  "indicators:read": "Ler indicadores consolidados",
  "messages:send": "Enviar mensagens"
} as const;
export type ApiScope = keyof typeof API_SCOPES;
export const FULL_ACCESS = "*";

export const MAX_EXPIRY_DAYS = 365;
export const DEFAULT_EXPIRY_DAYS = 90;

// the token is never kept: only its SHA-256
export const hashToken = (token: string): string => createHash("sha256").update(String(token)).digest("hex");
export const newToken = (): string => `wt_${randomBytes(24).toString("hex")}`;
export const prefixOf = (token: string): string => String(token).slice(0, 9);

export const sameSecret = (a: string, b: string): boolean => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

const parseList = (raw: any): any[] | null => {
  if (raw === null || raw === undefined || raw === "") return null;
  if (Array.isArray(raw)) return raw;
  try { const v = JSON.parse(String(raw)); return Array.isArray(v) ? v : null; } catch (_) { return null; }
};
export const scopesOf = (raw: any): string[] => (parseList(raw) || []).map(String);
// null = every polo
export const polosOf = (raw: any): number[] | null => {
  const list = parseList(raw);
  return list === null ? null : list.map(Number).filter(n => Number.isInteger(n) && n > 0);
};
export const hasScope = (scopes: string[], needed: ApiScope): boolean => scopes.includes(FULL_ACCESS) || scopes.includes(needed);

export interface TokenInput { name: string; scopes: ApiScope[]; poloIds: number[] | null; expiresAt: Date }

// what the administrator chose for a new token, checked: a name, at least one known scope (never "*"), the polos (none = every polo)
// and a validity of 1 to 365 days (90 when not chosen)
export const cleanTokenInput = (b: any, now = new Date()): TokenInput => {
  const name = String(b?.name || "").trim().slice(0, 80);
  if (!name) throw new AppError("ERR_FIELD_REQUIRED_name", 400);
  const asked: string[] = Array.isArray(b?.scopes) ? b.scopes.map(String) : [];
  const scopes = [...new Set(asked)].filter(s => Object.prototype.hasOwnProperty.call(API_SCOPES, s)) as ApiScope[];
  if (!scopes.length || scopes.length !== new Set(asked).size) throw new AppError("ERR_API_TOKEN_SCOPES", 400);
  let poloIds: number[] | null = null;
  if (Array.isArray(b?.poloIds) && b.poloIds.length) {
    poloIds = [...new Set(b.poloIds.map(Number))] as number[];
    if (poloIds.some(n => !Number.isInteger(n) || n <= 0)) throw new AppError("ERR_API_TOKEN_POLOS", 400);
  }
  const days = b?.expiresInDays === undefined || b?.expiresInDays === null || b?.expiresInDays === "" ? DEFAULT_EXPIRY_DAYS : Number(b.expiresInDays);
  if (!Number.isInteger(days) || days < 1 || days > MAX_EXPIRY_DAYS) throw new AppError("ERR_API_TOKEN_EXPIRY", 400);
  return { name, scopes, poloIds, expiresAt: new Date(now.getTime() + days * 86400000) };
};

// what req.apiToken carries after isAuthApi
export interface ApiCaller { id: number | null; scopes: string[]; poloIds: number[] | null; legacy: boolean }
