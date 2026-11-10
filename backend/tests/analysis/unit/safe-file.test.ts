import path from "path";
import { describe, expect, it } from "vitest";
import { extensionFromMime, insideFolder, safeStoredName } from "../../../src/helpers/SafeFile";
import { isEmail } from "../../../src/helpers/Email";

describe("the name of a stored file never comes from the sender", () => {
  it("cuts the folder part of a name that tries to leave the public folder", () => {
    const n = safeStoredName("../../dist/database/migrations/zz.js", "application/javascript");
    expect(n).not.toMatch(/[\\/]/);
    expect(n).toMatch(/^zz~[a-z0-9]{5}\.bin$/);
    expect(safeStoredName("..\\..\\windows\\evil.exe", "")).not.toMatch(/[\\/]/);
    expect(safeStoredName("/etc/passwd", "text/plain")).toMatch(/^passwd~[a-z0-9]{5}\.txt$/);
  });
  it("never keeps an extension that a browser or the server runs", () => {
    for (const ext of ["html", "xhtml", "svg", "svgz", "xml", "js", "mjs", "php", "sh", "exe", "SVG", "Html"]) {
      expect(safeStoredName(`arquivo.${ext}`, "application/pdf"), ext).toMatch(/\.pdf$/);
    }
    expect(safeStoredName("page.html", "")).toMatch(/\.bin$/);
  });
  it("keeps a normal name readable (accents, spaces) with the unique part after the tilde", () => {
    expect(safeStoredName("Histórico Escolar (1).pdf", "application/pdf")).toMatch(/^Histórico Escolar \(1\)~[a-z0-9]{5}\.pdf$/);
    expect(safeStoredName("", "audio/ogg; codecs=opus")).toMatch(/^[a-z0-9]{5}-\d+\.ogg$/);
    expect(extensionFromMime("image/png")).toBe("png");
    expect(extensionFromMime(undefined)).toBe("bin");
  });
  it("the unique part is not predictable", () => {
    const set = new Set(Array.from({ length: 200 }, () => safeStoredName("a.png", "image/png")));
    expect(set.size).toBeGreaterThan(190);
  });
  it("a path outside the folder is refused", () => {
    const dir = path.join(process.cwd(), "public-test");
    expect(insideFolder(dir, "ok~abcde.png")).toBe(path.join(dir, "ok~abcde.png"));
    expect(() => insideFolder(dir, "../x.js")).toThrow();
    expect(() => insideFolder(dir, "/etc/passwd")).toThrow();
  });
});

describe("the e-mail check is linear and limited", () => {
  it("accepts normal addresses and refuses the rest", () => {
    ["a@b.co", "maria.souza+rh@cruzeirodosul.edu.br", "x_y@sub.dominio.com.br"].forEach((e) => expect(isEmail(e), e).toBe(true));
    ["", "abc", "a@b", "a@@b.co", "a b@c.co", "@b.co", "a@.co", "a@b.", null, 5].forEach((e) => expect(isEmail(e as any), String(e)).toBe(false));
  });
  it("does not choke on a hostile text (the old pattern took seconds)", () => {
    const hostile = `a@${".".repeat(40000)} b`;
    const started = Date.now();
    expect(isEmail(hostile)).toBe(false);
    expect(isEmail(`${"a".repeat(300)}@b.co`)).toBe(false);
    expect(Date.now() - started).toBeLessThan(100);
  });
});
