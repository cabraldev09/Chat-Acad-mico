import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The ready-made texts of the affiliate home (ideas, messages and phrases of the art) never name a price, a discount, a
// scholarship or "free": the affiliate repeats them to other people and the institution did not promise any of that.
const FILE = path.resolve(__dirname, "../../../../frontend/src/pages/AffiliatePortal/promoContent.js");
const FORBIDDEN = /R\$|\breais\b|desconto|mensalidade|bolsa|gr[aá]tis|gratuit|\d+\s*%|\bpromo[cç][aã]o\b|\bpre[cç]o/i;

describe("textos prontos da Central do Afiliado", () => {
  const source = fs.readFileSync(FILE, "utf8");
  // only the texts between quotes: the comments of the file explain the rule and may name these words
  const strings = [...source.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map(m => m[1]);

  it("lê o arquivo e encontra os textos", () => {
    expect(strings.length).toBeGreaterThan(30);
  });

  it.each(strings.map(s => [s.slice(0, 60), s] as const))("sem valores nem promessas: %s", (_label, text) => {
    expect(text).not.toMatch(FORBIDDEN);
  });
});
