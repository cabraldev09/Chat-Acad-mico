import { describe, expect, it, vi } from "vitest";

const settings: Record<string, string> = {};
vi.mock("../../src/helpers/AppSettings", () => ({ getSetting: async (k: string, d: string) => (k in settings ? settings[k] : d), setSetting: async (k: string, v: string) => { settings[k] = v; } }));
vi.mock("../../src/helpers/AppTime", () => ({ todayInAppTz: () => "2026-11-24", monthStartApp: () => new Date("2026-11-01T04:00:00Z") }));
vi.mock("../../src/channels/meta", () => ({ GRAPH: "https://graph.test" }));
vi.mock("../../src/channels/types", () => ({ getConfig: () => ({}) }));
vi.mock("../../src/libs/socket", () => ({ getIO: () => ({ emit: () => undefined }) }));

import { estimateBatchUsd, estimateSendUsd, FREE_SERVICE_PER_NUMBER } from "../../src/services/ChannelServices/MetaRates";
import { categoryOf, fillTemplate, rememberCategories, TEMPLATE_PACK, variableAtEdge } from "../../src/services/CampaignServices/Templates";
import { cleanNotice, noticeParams } from "../../src/services/TutoriaServices/Notices";

describe("custo estimado de cada envio da Meta", () => {
  it("cobra pela categoria do modelo: marketing custa cerca de 9 vezes utilidade", () => {
    const utility = estimateSendUsd({ channel: "whatsapp_cloud", category: "UTILITY" }) as number;
    const marketing = estimateSendUsd({ channel: "whatsapp_cloud", category: "MARKETING" }) as number;
    expect(utility).toBe(0.0068);
    expect(marketing).toBe(0.0625);
    expect(marketing / utility).toBeGreaterThan(9);
  });
  it("as primeiras 1.000 respostas de cada número no mês são grátis; depois, usa o preço digitado ou o da utilidade", () => {
    expect(estimateSendUsd({ channel: "whatsapp_cloud", category: "SERVICE", serviceUsedThisMonth: FREE_SERVICE_PER_NUMBER - 1 })).toBe(0);
    expect(estimateSendUsd({ channel: "whatsapp_cloud", category: "SERVICE", serviceUsedThisMonth: FREE_SERVICE_PER_NUMBER })).toBe(0.0068);
    expect(estimateSendUsd({ channel: "whatsapp_cloud", category: "SERVICE", serviceUsedThisMonth: 5000, serviceUsd: "0.004" })).toBe(0.004);
  });
  it("o preço digitado vale para utilidade, nunca baixa o de marketing", () => {
    expect(estimateSendUsd({ channel: "whatsapp_cloud", category: "UTILITY", templateUsd: "0.005" })).toBe(0.005);
    expect(estimateSendUsd({ channel: "whatsapp_cloud", category: "MARKETING", templateUsd: "0.005" })).toBe(0.0625);
  });
  it("QR Code não tem custo da Meta; Instagram e Messenger respondem sem custo", () => {
    expect(estimateSendUsd({ channel: "whatsapp", category: "SERVICE" })).toBeNull();
    expect(estimateSendUsd({ channel: "instagram", category: "SERVICE" })).toBe(0);
  });
  it("1.600 alunos com 2 avisos de utilidade no mês ficam perto de US$ 22 (cerca de R$ 120)", () => {
    expect(estimateBatchUsd(3200, "UTILITY")).toBe(21.76);
    // categoria desconhecida conta como marketing, a mais cara
    expect(estimateBatchUsd(100, "")).toBe(6.25);
  });
});

describe("categoria de cada modelo", () => {
  it("guarda a categoria que a Meta deu e conta o desconhecido como marketing", async () => {
    expect(await categoryOf("aviso_atividades_mes")).toBe("MARKETING");
    await rememberCategories([{ name: "aviso_atividades_mes", category: "UTILITY" }, { name: "x", category: "OUTRA" }]);
    expect(await categoryOf("aviso_atividades_mes")).toBe("UTILITY");
    await rememberCategories([{ name: "aviso_atividades_mes", category: "marketing" }]);
    expect(await categoryOf("aviso_atividades_mes")).toBe("MARKETING");
  });
});

describe("avisos da tutoria", () => {
  it("os dois modelos novos são de aviso da tutoria e não começam nem terminam com variável", () => {
    const pack = TEMPLATE_PACK("Cruzeiro do Sul Virtual").filter(t => ["aviso_atividades_mes", "lembrete_prova"].includes(t.name));
    expect(pack).toHaveLength(2);
    pack.forEach(t => {
      expect(t.department).toBe("tutoria");
      expect(variableAtEdge(t.body)).toBe(false);
      expect(t.examples).toHaveLength((t.body.match(/\{\{\d+\}\}/g) || []).length);
    });
  });
  it("confere o que foi digitado: tipo, data a partir de hoje e disciplina da prova", () => {
    expect(() => cleanNotice({ kind: "x", date: "2026-12-01" })).toThrow("ERR_NOTICE_KIND");
    expect(() => cleanNotice({ kind: "atividades", date: "01/12/2026" })).toThrow("ERR_NOTICE_DATE");
    expect(() => cleanNotice({ kind: "atividades", date: "2026-11-23" })).toThrow("ERR_NOTICE_DATE_PAST");
    expect(() => cleanNotice({ kind: "prova", date: "2026-12-01" })).toThrow("ERR_NOTICE_SUBJECT");
    const n = cleanNotice({ kind: "prova", date: "2026-12-12", subject: " Didática\n  geral ", poloId: "3", tutorId: "abc" });
    expect(n).toMatchObject({ kind: "prova", subject: "Didática geral", poloId: 3, tutorId: null });
  });
  it("monta o texto que o aluno recebe com o nome e o curso de cada um", () => {
    const n = cleanNotice({ kind: "atividades", date: "2026-12-20", note: "faça o fórum primeiro." });
    const body = TEMPLATE_PACK("").find(t => t.name === "aviso_atividades_mes")!.body;
    const filled = fillTemplate(noticeParams(n), { primeiro_nome: "Ana", curso: "Pedagogia" }, body);
    expect(filled.params).toEqual(["Ana", "Pedagogia", "20/12/2026", "faça o fórum primeiro"]);
    expect(filled.text).toBe("Atividades do mês, Ana: as atividades do curso Pedagogia estão disponíveis no portal do aluno, com entrega até 20/12/2026. Orientação da tutoria: faça o fórum primeiro. Os detalhes de cada atividade estão no portal.");
  });
});
