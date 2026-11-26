import AppError from "../errors/AppError";

// Rules of the recommendations the OpenBot writes to the management through POST /api/v1/insights (scope insights:write): warnings and recommendations of the
// whole operation, never about a person. The server refuses anything that looks like personal data (the last defense: the agent is
// told to send only totals), keeps each subject once (dedupeKey), and shows it to the administrators only: the bell and the block
// "Recomendações do OpenBot" of the commercial center. The text is data, never an instruction: nothing runs because of it.
export const INSIGHT_KINDS = ["indicador", "oportunidade", "risco", "operacao"] as const;
export const INSIGHT_LEVELS = ["info", "warning", "urgent"] as const;
// where a recommendation may point (an internal path of the system; never an address of another site)
export const INSIGHT_LINKS = [
  "/crm", "/crm/painel", "/crm/tarefas", "/crm/matriculas", "/crm/metas", "/crm/metas-polos", "/crm/retencao",
  "/estatisticas", "/estatisticas/captacao", "/estatisticas/tutoria", "/gestao-comercial", "/connections", "/reports", "/integrations"
];
export const MAX_ACTIVE_INSIGHTS = Number(process.env.OPENBOT_INSIGHTS_MAX_ACTIVE || 20);
export const DEFAULT_INSIGHT_DAYS = 7;
export const MAX_INSIGHT_DAYS = 30;

// "looks like a person": an e-mail or any @; a run of 8 digits or more (phone, CPF, RGM, ids); a phone written with separators
// ("(69) 99999-8888", "9999-8888", "+55 69 ..."); a CPF with mask; "cpf" or "rgm" followed by a number. Totals written with thousand
// separators ("1.250.000") and short numbers pass. A rare false positive (a range like "1000-2000") is cheaper than a leaked number.
const PERSONAL: Array<[string, RegExp]> = [
  ["e-mail ou @", /@/],
  ["número com 8 dígitos ou mais", /\d{8,}/],
  ["telefone com separadores", /(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]\d{4}/],
  ["telefone sem DDD", /(?:^|\D)9?\d{4}[\s.-]\d{4}(?:\D|$)/],
  ["CPF com máscara", /\d{3}\.\d{3}\.\d{3}-\d{2}/],
  ["CPF ou RGM citado", /\b(?:cpf|rgm)\b[^a-z]{0,12}\d/i],
  ["endereço da internet", /(?:https?:|www\.|javascript:|data:)/i]
];
export const personalDataIn = (text: string): string | null => {
  const found = PERSONAL.find(([, re]) => re.test(String(text || "")));
  return found ? found[0] : null;
};

export interface InsightInput {
  kind: string;
  level: string;
  title: string;
  body: string;
  link: string | null;
  dedupeKey: string;
  expiresInDays: number;
}

const text = (v: unknown, max: number, code: string, required: boolean): string => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) {
    if (required) throw new AppError(code, 400);
    return "";
  }
  if (s.length > max) throw new AppError(code, 400);
  return s;
};

// validates the whole body before anything is written; the errors are codes the screen translates (pt.js)
export const cleanInsight = (b: any): InsightInput => {
  b = b || {};
  if (!INSIGHT_KINDS.includes(b.kind)) throw new AppError("ERR_INSIGHT_INVALID_KIND", 400);
  const level = b.level === undefined || b.level === null || b.level === "" ? "info" : b.level;
  if (!INSIGHT_LEVELS.includes(level)) throw new AppError("ERR_INSIGHT_INVALID_LEVEL", 400);
  const title = text(b.title, 120, "ERR_INSIGHT_INVALID_TITLE", true);
  const body = text(b.body, 400, "ERR_INSIGHT_INVALID_BODY", true);
  const key = text(b.dedupeKey, 160, "ERR_INSIGHT_INVALID_DEDUPE", true);
  if (!/^[A-Za-z0-9][A-Za-z0-9:._-]*$/.test(key)) throw new AppError("ERR_INSIGHT_INVALID_DEDUPE", 400);
  let link: string | null = null;
  if (b.link !== undefined && b.link !== null && b.link !== "") {
    if (typeof b.link !== "string" || !INSIGHT_LINKS.includes(b.link)) throw new AppError("ERR_INSIGHT_INVALID_LINK", 400);
    link = b.link;
  }
  const days = b.expiresInDays === undefined || b.expiresInDays === null || b.expiresInDays === "" ? DEFAULT_INSIGHT_DAYS : Number(b.expiresInDays);
  if (!Number.isInteger(days) || days < 1 || days > MAX_INSIGHT_DAYS) throw new AppError("ERR_INSIGHT_INVALID_EXPIRY", 400);
  if (personalDataIn(title) || personalDataIn(body)) throw new AppError("ERR_INSIGHT_PERSONAL_DATA", 400);
  return { kind: b.kind, level, title, body, link, dedupeKey: key, expiresInDays: days };
};

