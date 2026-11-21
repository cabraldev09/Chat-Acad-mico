import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/channels/meta", () => ({ GRAPH: "https://graph.test" }));
vi.mock("../../src/channels/types", () => ({ getConfig: (w: any) => w.cfg }));
vi.mock("../../src/services/ChannelServices/SendToContact", () => ({ default: vi.fn() }));
vi.mock("../../src/services/ChannelServices/ConnectionTeam", () => ({ connectionOfTeam: vi.fn() }));
vi.mock("../../src/services/TicketServices/OpeningTemplate", () => ({ windowOf: vi.fn() }));
vi.mock("../../src/helpers/AppSettings", () => ({ getSetting: vi.fn(async (_k: string, d: string) => d), setSetting: vi.fn() }));

import { TEMPLATE_PACK, cleanDraft, paramsIn, variableAtEdge } from "../../src/services/CampaignServices/Templates";
import { prettyPhone, vcardOf, welcomeText } from "../../src/services/CrmServices/TutoriaContact";

describe("pacote de modelos da Meta", () => {
  const pack = TEMPLATE_PACK("Cruzeiro do Sul Virtual");
  it("cada modelo tem um exemplo para cada variável e nome aceito pela Meta", () => {
    for (const t of pack) {
      expect(t.examples.length).toBe(paramsIn(t.body));
      expect(t.name).toMatch(/^[a-z0-9_]+$/);
      expect(() => cleanDraft(t)).not.toThrow();
    }
  });
  it("quem já está no processo não recebe Olá de novo; cada modelo tem departamento; as aberturas têm botões", () => {
    for (const t of pack) {
      expect(t.body).not.toMatch(/^\s*ol[aá]/i);
      expect(t.department).toBeTruthy();
    }
    for (const t of pack.filter(p => p.use === "abertura")) expect((t.buttons || []).length).toBeGreaterThan(0);
  });
  it("não usa palavras de oferta (o que faria a Meta tratar como Marketing)", () => {
    for (const t of pack) expect(t.body).not.toMatch(/desconto|promo|oferta|gr[aá]tis|imperd[ií]vel|condi[cç][oõ]es especiais/i);
  });
  it("as boas-vindas da matrícula pedem para agendar a ambientação com o tutor", () => {
    const bv = pack.find(t => t.name === "matricula_confirmada_tutoria")!;
    expect(bv.setting).toBe("boas_vindas_template_name");
    expect(paramsIn(bv.body)).toBe(4);
    expect(bv.body).toMatch(/ambientação/);
  });
});

describe("rascunho de modelo", () => {
  it("normaliza o nome e exige um exemplo para cada variável", () => {
    expect(cleanDraft({ name: "Aviso Boleto Mês", body: "Olá {{1}}, o boleto saiu.", examples: ["Ana"] }).name).toBe("aviso_boleto_mes");
    expect(() => cleanDraft({ name: "x", body: "Olá {{1}} e {{2}}", examples: ["Ana"] })).toThrow();
    expect(() => cleanDraft({ name: "", body: "Olá" })).toThrow();
  });
});

describe("variável no início ou no fim (a Meta recusa)", () => {
  it("é recusada aqui antes de ir para a Meta, com a pontuação em volta", () => {
    expect(variableAtEdge("{{1}}, a sua matrícula está confirmada.")).toBe(true);
    expect(variableAtEdge("A sua prova é em {{2}}.")).toBe(true);
    expect(variableAtEdge("Matrícula confirmada, {{1}}: tudo certo.")).toBe(false);
    expect(() => cleanDraft({ name: "x", body: "{{1}}, tudo certo.", examples: ["Ana"] })).toThrow();
  });
  it("nenhum modelo do pacote começa ou termina com variável", () => {
    for (const t of TEMPLATE_PACK("Cruzeiro do Sul Virtual")) expect(variableAtEdge(t.body)).toBe(false);
  });
});

describe("contato da tutoria na matrícula", () => {
  it("formata o número e monta o cartão de contato", () => {
    expect(prettyPhone("5569993258103")).toBe("+55 (69) 99325-8103");
    expect(vcardOf("Tutoria", "5569993258103")).toContain("waid=5569993258103");
  });
  it("nomeia o tutor e pede para mandar mensagem para agendar a ambientação", () => {
    const t = welcomeText("Maria", "5569993258103", "Ana Paula");
    expect(t).toMatch(/^Maria, sua matrícula está confirmada!/);
    expect(t).toContain("Ana Paula");
    expect(t).toContain("+55 (69) 99325-8103");
    expect(t).toMatch(/agendar a sua ambientação/);
    expect(welcomeText("", "5569993258103", null)).toMatch(/^sua matrícula/);
  });
});
