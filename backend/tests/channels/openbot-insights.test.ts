import { describe, expect, it } from "vitest";

import { cleanInsight, personalDataIn, INSIGHT_LINKS } from "../../src/helpers/InsightRules";

const code = (fn: () => unknown): string => { try { fn(); return "ok"; } catch (e: any) { return e.message; } };
const valid = { kind: "indicador", level: "warning", title: "Origem Instagram caiu na semana", body: "Os contatos da origem Instagram caíram 40% em relação à semana anterior.", dedupeKey: "origem-instagram:2026-11-26" };

describe("recomendações do OpenBot: sem dado de pessoa", () => {
  it("aceita totais, percentuais e números com separador de milhar", () => {
    for (const s of ["Caiu 40% na semana", "Foram 1.250.000 reais em propostas", "Mediana de 12 min para 35 min", "Origem X: 120 leads, 8 matrículas", "Semana 48 de 2026", "Entre 3 e 5 dias"]) {
      expect(personalDataIn(s), s).toBeNull();
    }
    expect(cleanInsight(valid)).toMatchObject({ kind: "indicador", level: "warning", link: null, expiresInDays: 7 });
  });

  it("recusa telefone em qualquer formato (casos fictícios)", () => {
    for (const s of ["Ligar para 69999990000", "(69) 99999-0000", "(69)99999-0000", "69 99999 0000".replace(/ /g, "-"), "+55 69 99999-0000", "55 69 9 9999-0000", "9999-0000", "99999.0000", "fone 3333-4444"]) {
      expect(personalDataIn(s), s).not.toBeNull();
    }
  });

  it("recusa e-mail, @, CPF, RGM e endereço da internet", () => {
    for (const s of ["fulano@exemplo.com", "@fulano", "CPF 000.000.000-00", "cpf: 00000000000", "RGM 1234567", "rgm: 98765", "veja https://exemplo.com", "www.exemplo.com", "javascript:alert(1)", "data:text/html;base64,AAAA"]) {
      expect(personalDataIn(s), s).not.toBeNull();
    }
  });

  it("recusa dado pessoal no título e no texto, com o código próprio", () => {
    expect(code(() => cleanInsight({ ...valid, title: "Ligar para 69999990000" }))).toBe("ERR_INSIGHT_PERSONAL_DATA");
    expect(code(() => cleanInsight({ ...valid, body: "Falar com fulano@exemplo.com hoje" }))).toBe("ERR_INSIGHT_PERSONAL_DATA");
    expect(code(() => cleanInsight({ ...valid, body: "CPF 000.000.000-00 pediu bolsa" }))).toBe("ERR_INSIGHT_PERSONAL_DATA");
  });
});

describe("recomendações do OpenBot: o corpo", () => {
  it("o tipo, o nível, os textos e a chave do assunto são obrigatórios e limitados", () => {
    expect(code(() => cleanInsight({ ...valid, kind: "outro" }))).toBe("ERR_INSIGHT_INVALID_KIND");
    expect(code(() => cleanInsight({ ...valid, level: "alto" }))).toBe("ERR_INSIGHT_INVALID_LEVEL");
    expect(code(() => cleanInsight({ ...valid, title: "" }))).toBe("ERR_INSIGHT_INVALID_TITLE");
    expect(code(() => cleanInsight({ ...valid, title: "a".repeat(121) }))).toBe("ERR_INSIGHT_INVALID_TITLE");
    expect(code(() => cleanInsight({ ...valid, body: "a".repeat(401) }))).toBe("ERR_INSIGHT_INVALID_BODY");
    expect(code(() => cleanInsight({ ...valid, dedupeKey: "" }))).toBe("ERR_INSIGHT_INVALID_DEDUPE");
    expect(code(() => cleanInsight({ ...valid, dedupeKey: "com espaço" }))).toBe("ERR_INSIGHT_INVALID_DEDUPE");
    expect(code(() => cleanInsight({ ...valid, dedupeKey: "a".repeat(161) }))).toBe("ERR_INSIGHT_INVALID_DEDUPE");
    expect(code(() => cleanInsight(undefined))).toBe("ERR_INSIGHT_INVALID_KIND");
  });

  it("o nível é info quando não vem; a validade é de 1 a 7 dias, 7 por padrão", () => {
    expect(cleanInsight({ ...valid, level: undefined }).level).toBe("info");
    expect(cleanInsight({ ...valid, expiresInDays: 7 }).expiresInDays).toBe(7);
    expect(cleanInsight({ ...valid, expiresInDays: 1 }).expiresInDays).toBe(1);
    for (const bad of [0, 8, 30, 31, 1.5, "x", -1]) expect(code(() => cleanInsight({ ...valid, expiresInDays: bad }))).toBe("ERR_INSIGHT_INVALID_EXPIRY");
  });

  it("o link é só caminho interno da lista: nada de endereço externo, javascript ou caminho solto", () => {
    expect(cleanInsight({ ...valid, link: "/estatisticas" }).link).toBe("/estatisticas");
    for (const l of INSIGHT_LINKS) expect(cleanInsight({ ...valid, link: l }).link).toBe(l);
    for (const bad of ["https://exemplo.com", "//exemplo.com", "javascript:alert(1)", "/admin", "/crm?lead=3", "/crm/../users", "crm", 7]) {
      expect(code(() => cleanInsight({ ...valid, link: bad })), String(bad)).toBe("ERR_INSIGHT_INVALID_LINK");
    }
  });

  it("HTML no texto passa como texto puro (a tela não interpreta), sem virar ação", () => {
    const r = cleanInsight({ ...valid, title: "<b>Atenção</b>", body: "<script>alert(1)</script> origem caiu" });
    expect(r.title).toBe("<b>Atenção</b>");
    expect(r.body).toContain("<script>");
  });
});
