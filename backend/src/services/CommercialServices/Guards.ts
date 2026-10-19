// What the agent is never allowed to SAY, checked on every answer before it is sent. The prompt asks the model not to; this is the
// check that does not depend on the model obeying.
//   price:   an amount of money in any form (R$ 299, "trezentos reais", "12x de 99", "299/mês");
//   percent: a scholarship or discount in percent;
//   free:    "grátis", "isento", "sem taxa";
//   promise: a guarantee of credit transfer / approval / graduation;
//   fact:    a number, a percentage or a date that is NOT in what the tools and the approved base returned in this turn (or in what the
//            person wrote): the agent invents nothing.
export type GuardKind = "price" | "percent" | "free" | "promise" | "fact";

const plain = (s: string): string =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const MONEY = [
  /r\$\s*\d|us\$\s*\d/,
  /\b\d[\d.,]*\s*(reais|real|conto|contos|mil reais)\b/,
  /\b(cem|duzentos|trezentos|quatrocentos|quinhentos|mil)\s+reais\b/,
  /\b\d+\s*x\s*(de\s*)?(r\$\s*)?\d/,
  /\b\d[\d.,]*\s*\/\s*mes\b/,
  /\b(mensalidade|parcela|matricula|taxa)\b[^.?!]{0,30}\b(de|por|a partir de)\s*(r\$\s*)?\d/
];
const PERCENT_BENEFIT = [/\b\d{1,3}\s*%\s*(de\s*)?(bolsa|desconto|off|abatimento)/, /\b(bolsa|desconto|abatimento)s?\b[^.?!]{0,25}\b\d{1,3}\s*%/];
const FREE = /\b(gratis|gratuit[oa]s?|isent[oa]s?|sem (custo|taxa|mensalidade)|de graca)\b/;
const PROMISE = [
  /\b(garant(imos|o|ido|ida|e)|certeza (de )?que)\b[^.?!]{0,50}\b(aproveit|dispens|aprova|vaga|formar|diploma|conclu)/,
  /\b(todas as|100% das|suas)\s+disciplinas?\b[^.?!]{0,30}\b(serao|sera|vai ser|vao ser|ficam)\s+(aproveitad|dispensad)/,
  /\bvoce (vai|ira) (se )?(formar|concluir)\b[^.?!]{0,20}\b(em|ate)\s+\d/
];

// numbers that need a source: percentages, dates (dd/mm, dd/mm/aaaa), hours (8h, 08:00)
const NEEDS_SOURCE = [/\b\d{1,3}(?:[.,]\d+)?\s*%/g, /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, /\b\d{1,2}h(?:\d{2})?\b/g, /\b\d{1,2}:\d{2}\b/g];

export const unsafeAnswer = (text: string, evidence: string): { unsafe: boolean; kind?: GuardKind; token?: string } => {
  const t = plain(text);
  if (!t.trim()) return { unsafe: false };
  if (MONEY.some(r => r.test(t))) return { unsafe: true, kind: "price" };
  if (PERCENT_BENEFIT.some(r => r.test(t))) return { unsafe: true, kind: "percent" };
  if (FREE.test(t)) return { unsafe: true, kind: "free" };
  if (PROMISE.some(r => r.test(t))) return { unsafe: true, kind: "promise" };
  const source = plain(evidence).replace(/\s+/g, "");
  for (const re of NEEDS_SOURCE) {
    for (const m of t.match(re) || []) {
      // a percentage is checked by its number (the tools return 30, the answer says 30%)
      const needle = m.includes("%") ? m.replace(/[^\d.,]/g, "") : m.replace(/\s+/g, "");
      if (!source.includes(needle)) return { unsafe: true, kind: "fact", token: m };
    }
  }
  return { unsafe: false };
};
