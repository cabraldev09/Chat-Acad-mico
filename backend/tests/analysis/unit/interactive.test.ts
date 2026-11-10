import { describe, expect, it } from "vitest";

import { buildInteractive, uniqueTitles } from "../../../src/helpers/Interactive";
import { pickOption } from "../../../src/services/FlowServices/Engine";

const opts = (...labels: string[]) => labels.map((label, i) => ({ id: String(i + 1), label }));

describe("botões e lista da API oficial do WhatsApp", () => {
  it("até 3 opções viram botões de resposta, com título de no máximo 20 caracteres", () => {
    const m = buildInteractive("Qual curso?", opts("Pedagogia", "Administração de Empresas e Negócios", "Outro"))!;
    expect(m.type).toBe("button");
    expect(m.action.buttons).toHaveLength(3);
    m.action.buttons.forEach((b: any) => expect(b.reply.title.length).toBeLessThanOrEqual(20));
    expect(new Set(m.action.buttons.map((b: any) => b.reply.id)).size).toBe(3);
  });

  it("de 4 a 10 opções viram lista, e o nome que não coube no título vai inteiro na descrição", () => {
    const labels = ["Pedagogia", "Administração de Empresas e Negócios Internacionais", "Ciências Contábeis", "Gestão de RH"];
    const m = buildInteractive("Qual curso?", opts(...labels))!;
    expect(m.type).toBe("list");
    const rows = m.action.sections[0].rows;
    expect(rows).toHaveLength(4);
    rows.forEach((r: any) => expect(r.title.length).toBeLessThanOrEqual(24));
    expect(rows[1].description).toBe(labels[1]);
    expect(rows[0].description).toBeUndefined();
  });

  it("mais de 10 opções não viram botões (vai o texto numerado)", () => {
    expect(buildInteractive("?", opts(...Array.from({ length: 11 }, (_, i) => `Opção ${i}`)))).toBeNull();
    expect(buildInteractive("?", [])).toBeNull();
  });

  it("dois títulos iguais depois do corte ganham o número, para o toque não ficar ambíguo", () => {
    const t = uniqueTitles(["Graduação em Administração Pública", "Graduação em Administração Privada"], 20);
    expect(new Set(t.map(x => x.toLowerCase())).size).toBe(2);
    t.forEach(x => expect(x.length).toBeLessThanOrEqual(20));
    expect(t[0].startsWith("1. ")).toBe(true);
  });

  it("texto vazio e opção sem nome nunca quebram a regra da Meta", () => {
    const m = buildInteractive("", [{ label: "" }, { label: "   " }])!;
    expect(m.body.text.length).toBeGreaterThan(0);
    expect(m.action.buttons.map((b: any) => b.reply.title)).toEqual(["Opção 1", "Opção 2"]);
    expect(buildInteractive("x".repeat(3000), opts("a", "b"))!.body.text.length).toBeLessThanOrEqual(1000);
  });
});

describe("o toque do aluno volta como o título: o fluxo entende", () => {
  const options = [{ label: "Graduação em Administração Pública" }, { label: "Graduação em Administração Privada" }, { label: "Pedagogia" }];
  it("pelo número, pelo nome inteiro e pelo começo quando é único", () => {
    expect(pickOption(options, "3")).toBe(options[2]);
    expect(pickOption(options, "pedagogia")).toBe(options[2]);
    expect(pickOption(options, "Pedag")).toBe(options[2]);
  });
  it("pelo título cortado com reticências e pelo título com o número na frente", () => {
    const titles = uniqueTitles(options.map(o => o.label), 20);
    expect(pickOption(options, titles[0])).toBe(options[0]);
    expect(pickOption(options, titles[1])).toBe(options[1]);
    expect(pickOption(options, "Pedagogia…")).toBe(options[2]);
  });
  it("o que não tem relação não escolhe nada", () => {
    expect(pickOption(options, "quero falar com alguém")).toBeNull();
  });
});
