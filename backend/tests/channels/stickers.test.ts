import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { asSticker, stickersOf } from "../../src/helpers/Stickers";

describe("figurinhas do número", () => {
  it("uma figurinha por arquivo, a mais nova primeiro, com quantas vezes foi usada e se a equipe já mandou", () => {
    const list = stickersOf([
      { id: "a1", url: "/a.webp", hash: "A", fromMe: false, at: 1000 },
      { id: "b1", url: "/b.webp", hash: "B", fromMe: true, at: 3000 },
      { id: "a2", url: "/a2.webp", hash: "A", fromMe: true, at: 2000 },
      { id: "a3", url: "/a3.webp", hash: "A", fromMe: false, at: 500 }
    ]);
    expect(list.map(s => s.id)).toEqual(["b1", "a1"]);
    expect(list[1]).toMatchObject({ uses: 3, sent: true, sentAt: new Date(2000).toISOString() });
    expect(list[0]).toMatchObject({ uses: 1, sent: true });
  });
  it("só recebida: não conta como enviada pela equipe", () => {
    expect(stickersOf([{ id: "c", url: "/c.webp", hash: "C", fromMe: false, at: 1 }])[0]).toMatchObject({ sent: false, sentAt: null });
  });
  it("respeita o limite", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: String(i), url: `/${i}.webp`, hash: String(i), fromMe: false, at: i }));
    expect(stickersOf(rows, 3)).toHaveLength(3);
  });
  it("Criar figurinha: a foto vira um .webp de 512 x 512", async () => {
    const sharp = (await import("sharp")).default;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fig-"));
    const src = path.join(dir, "foto.png");
    await sharp({ create: { width: 800, height: 300, channels: 3, background: "#ff0000" } }).png().toFile(src);
    const m = { path: src, filename: "foto.png", originalname: "foto.png", mimetype: "image/png", size: fs.statSync(src).size };
    await asSticker(m);
    expect(m.mimetype).toBe("image/webp");
    expect(m.filename.endsWith(".webp")).toBe(true);
    const meta = await sharp(m.path).metadata();
    expect([meta.width, meta.height, meta.format, meta.hasAlpha]).toEqual([512, 512, "webp", true]);
  });
  it("um arquivo que não é imagem é recusado com uma mensagem clara", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fig-"));
    const src = path.join(dir, "x.png");
    fs.writeFileSync(src, "não é imagem");
    await expect(asSticker({ path: src, filename: "x.png", originalname: "x.png", mimetype: "image/png", size: 12 })).rejects.toMatchObject({ message: "ERR_STICKER_IMAGE" });
    await new Promise(r => setTimeout(r, 50));
    expect(fs.existsSync(src)).toBe(false);
  });
});
