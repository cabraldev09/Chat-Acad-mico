import { describe, expect, it } from "vitest";
import { MAIL_CATALOG, resetPasswordMail, staffWelcomeMail } from "../../../../src/services/MailServices/Templates";

describe("e-mails do sistema", () => {
  it("todos os modelos têm assunto, texto simples, HTML completo e o motivo do envio", () => {
    expect(MAIL_CATALOG.length).toBeGreaterThanOrEqual(9);
    for (const t of MAIL_CATALOG) {
      const m = t.build();
      expect(m.subject.length, t.key).toBeGreaterThan(5);
      expect(m.html, t.key).toContain("<!doctype html>");
      expect(m.html, t.key).toContain("Cruzeiro do Sul Virtual");
      expect(m.html, t.key).toContain("mensagem automática");
      expect(m.text, t.key).toContain("mensagem automática");
      expect(m.html, t.key).not.toMatch(/undefined|\[object/);
      expect(m.text, t.key).not.toMatch(/undefined|\[object|\*\*/);
    }
  });

  it("o link aparece no botão e por extenso, e o texto do usuário é escapado", () => {
    const m = resetPasswordMail('<script>alert(1)</script> Maria', "https://x.test/r/abc?a=1&b=2", 30);
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("https://x.test/r/abc?a=1&amp;b=2");
    expect(m.text).toContain("https://x.test/r/abc?a=1&b=2");
  });

  it("o e-mail de boas-vindas nunca leva senha", () => {
    const m = staffWelcomeMail("Ana", "Tutor", "ana@x.com", "https://x.test/login");
    expect(m.html + m.text).not.toMatch(/senha:/i);
  });
});
