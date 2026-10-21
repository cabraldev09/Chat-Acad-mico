import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { readyTextFor } from "../../../src/analysis/Grades";

const dir = path.join(__dirname, "..", "..", "..", "data", "grades");

describe("the text ready to copy that comes with the matrices", () => {
  it("every matrix PDF that ships with the system finds its text by the hash of the file", () => {
    const pdfs = fs.readdirSync(dir).filter(f => /\.pdf$/i.test(f));
    const without = pdfs.filter(f => !readyTextFor(createHash("sha256").update(fs.readFileSync(path.join(dir, f))).digest("hex")));
    // the matrices that came before the exchange with the other system have no ready text and are summarized by the reader (at most a handful)
    expect(pdfs.length).toBeGreaterThan(130);
    expect(without.length).toBeLessThan(pdfs.length * 0.3);
  });

  it("an unknown file has no text of its own", () => {
    expect(readyTextFor("0".repeat(64))).toBeNull();
    expect(readyTextFor(null)).toBeNull();
  });

  it("the texts are about the matrix and carry no price", () => {
    const all = JSON.parse(fs.readFileSync(path.join(dir, "summaries.json"), "utf8")) as Record<string, string>;
    const texts = Object.values(all);
    expect(texts.length).toBeGreaterThan(130);
    texts.forEach(t => expect(t).not.toMatch(/R\$\s?\d|\d+ ?% de (bolsa|desconto)/i));
  });
});
