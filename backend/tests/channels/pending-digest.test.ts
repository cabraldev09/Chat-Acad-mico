import { describe, expect, it } from "vitest";
import { formatDigest } from "../../src/workers/PendingDigest";

const item = (level: "required" | "recommended", label: string, detail = "falta algo", where = "Conexões") => ({ level, label, detail, where });

describe("the daily e-mail of what is still open", () => {
  it("says nothing when nothing is open", () => {
    expect(formatDigest([], "https://x/configuracoes")).toBeNull();
  });

  it("lists the required items first and counts them in the subject", () => {
    const body = formatDigest([item("recommended", "Horário"), item("required", "Chave de IA"), item("required", "Token da Meta")], "https://x/configuracoes")!;
    expect(body.subject).toBe("Pendências do sistema: 3 em aberto (2 obrigatórias)");
    expect(body.text.indexOf("Chave de IA")).toBeLessThan(body.text.indexOf("Horário"));
    expect(body.text).toContain("https://x/configuracoes");
  });

  it("does not let a name written in a detail break the HTML", () => {
    const body = formatDigest([item("required", "Cursos <b>sem grade</b>", "A & B")], "https://x")!;
    expect(body.html).toContain("&lt;b&gt;sem grade&lt;/b&gt;");
    expect(body.html).toContain("A &amp; B");
    expect(body.html).not.toContain("<b>sem grade</b>");
  });
});
