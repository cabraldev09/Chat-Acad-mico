import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/channels/meta", () => ({ GRAPH: "https://graph.test" }));
vi.mock("../../src/channels/types", () => ({ getConfig: (w: any) => w.cfg }));

import { fillTemplate, paramsIn } from "../../src/services/CampaignServices/Templates";

describe("modelo aprovado da campanha", () => {
  it("conta as variáveis do texto do modelo", () => {
    expect(paramsIn("Olá {{1}}, aqui é {{2}} da {{3}}")).toBe(3);
    expect(paramsIn("Sem variáveis")).toBe(0);
  });
  it("preenche cada {{n}} com o valor escolhido e guarda o texto como a pessoa recebeu", () => {
    const r = fillTemplate(["primeiro_nome", "curso"], { primeiro_nome: "Ana", curso: "Pedagogia" }, "Olá {{1}}! Ainda quer fazer {{2}}?");
    expect(r.params).toEqual(["Ana", "Pedagogia"]);
    expect(r.text).toBe("Olá Ana! Ainda quer fazer Pedagogia?");
  });
  it("sem escolha usa o primeiro nome; valor vazio nunca vai vazio para a Meta", () => {
    expect(fillTemplate([], { primeiro_nome: "Bruno" }, null).params).toEqual(["Bruno"]);
    expect(fillTemplate(["primeiro_nome", "polo"], { primeiro_nome: "" }, null).params).toEqual(["aluno(a)", "-"]);
  });
});
