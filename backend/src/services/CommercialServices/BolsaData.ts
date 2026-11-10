import { isValidCpf, normalizeCpf } from "../../helpers/Cpf";

// The two data the consultant needs to simulate the scholarship: the full name and the CPF. Read from what the person wrote (pure: tested without
// a database). The CPF must pass the check digits; the name is at least two words of letters, without numbers.
export interface BolsaData {
  cpf: string | null;
  fullName: string | null;
  // wrote a CPF-like number that is not a valid CPF
  invalidCpf: boolean;
}

const CPF_LIKE = /(?<!\d)(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2})(?!\d)/;
// the words people put in front of their name or CPF ("meu nome é", "cpf:"); \b does not work with accents, so the edges are spaces or punctuation
const LEAD_WORDS = /(^|[\s:,;])(meu nome completo é|meu nome completo|meu nome é|meu nome|me chamo|nome completo|nome|cpf|o meu|sou o|sou a|sou|é|e o|segue|aqui)(?=$|[\s:,;])/giu;

const titleCase = (s: string): string =>
  s
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && /^(d[aeo]s?|e)$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

export const bolsaDataFrom = (text: string): BolsaData => {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  const found = raw.match(CPF_LIKE);
  const digits = found ? normalizeCpf(found[1]) : null;
  const valid = !!digits && isValidCpf(digits);
  const withoutCpf = (found ? raw.replace(found[1], " ") : raw).replace(LEAD_WORDS, " ").replace(LEAD_WORDS, " ").replace(/[:,;\-–—()]+/g, " ").replace(/\s+/g, " ").trim();
  const words = withoutCpf.split(" ").filter(Boolean);
  const letters = words.length >= 2 && words.length <= 8 && words.every(w => /^[A-Za-zÀ-ÖØ-öø-ÿ'’]{2,}$|^(d[aeo]s?|e)$/i.test(w)) && withoutCpf.length <= 80;
  // a sentence of lowercase words ("vou pensar e volto depois") is not a name: it needs the CPF beside it, a lead-in ("meu nome é") or capital letters
  const connector = /^(d[aeo]s?|e)$/i;
  const capitalized = words.every(w => connector.test(w) || /^[A-ZÀ-ÖØ-Þ]/.test(w));
  const leadIn = /(^|[\s:,;])(meu nome|me chamo|nome completo|nome)(?=$|[\s:,;])/i.test(raw);
  const looksLikeName = letters && (!!found || leadIn || capitalized);
  return { cpf: valid ? (digits as string) : null, fullName: looksLikeName ? titleCase(withoutCpf) : null, invalidCpf: !!digits && !valid };
};

// asked to give the data: how many times the system may ask before it goes on without them
export const BOLSA_ASKS = 2;

export const BOLSA_REQUEST = "Para o consultor simular a bolsa que você pode ter, me envie seu nome completo e CPF, por favor.";
export const bolsaRequestFor = (missing: { name: boolean; cpf: boolean }): string =>
  missing.name && missing.cpf ? BOLSA_REQUEST : missing.cpf ? "Falta só o seu CPF para o consultor simular a bolsa. Pode me enviar, por favor?" : "Falta só o seu nome completo para o consultor simular a bolsa. Pode me enviar, por favor?";
