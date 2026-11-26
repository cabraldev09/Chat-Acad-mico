import fs from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";

const dir = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const f = require("fs"), p = require("path"), o = require("os");
  const d = f.mkdtempSync(p.join(o.tmpdir(), "pub-"));
  f.mkdirSync(p.join(d, "avatars"));
  f.writeFileSync(p.join(d, "avatars", "7-ab12.jpg"), "x");
  f.writeFileSync(p.join(d, "foto.jpg"), "x");
  return d as string;
});
vi.mock("../../src/config/paths", () => ({ PUBLIC_DIR: dir }));
vi.mock("../../src/config/auth", () => ({ default: { secret: "teste" } }));

import { publicFile } from "../../src/helpers/PublicFile";
import { fileKey, signedFileUrl, verifyFileToken } from "../../src/helpers/SignedFile";

describe("link das fotos de perfil", () => {
  it("o link mantém a pasta avatars/ e o token vale para o mesmo caminho", () => {
    const url = signedFileUrl("avatars/7-ab12.jpg");
    expect(url).toMatch(/\/public\/avatars\/7-ab12\.jpg\?access=/);
    const token = new URL(url, "http://x").searchParams.get("access") as string;
    expect(verifyFileToken(token, "avatars/7-ab12.jpg").file).toBe("avatars/7-ab12.jpg");
    expect(() => verifyFileToken(token, "7-ab12.jpg")).toThrow();
  });
  it("só a pasta avatars passa; outras pastas e .. viram só o nome", () => {
    expect(fileKey("avatars/7-ab12.jpg")).toBe("avatars/7-ab12.jpg");
    expect(fileKey("outra/7-ab12.jpg")).toBe("7-ab12.jpg");
    expect(fileKey("avatars/../segredo.txt")).toBe("segredo.txt");
    expect(fileKey("foto.jpg")).toBe("foto.jpg");
  });
  it("o servidor de arquivos acha a foto dentro de avatars/; quem anexa arquivo por nome, não", () => {
    expect(publicFile("avatars/7-ab12.jpg", true, { allowAvatar: true })).toBe(fs.realpathSync(path.join(dir, "avatars", "7-ab12.jpg")));
    expect(() => publicFile("avatars/7-ab12.jpg")).toThrow();
    expect(() => publicFile("avatars/../foto.jpg", true, { allowAvatar: true })).toThrow();
    expect(publicFile("foto.jpg")).toBe(fs.realpathSync(path.join(dir, "foto.jpg")));
  });
});
