import { describe, expect, it } from "vitest";

import { normalizePairingPhone } from "../../src/helpers/PairingPhone";
import { openConfig, sealConfig, maskConfig, mergeConfig } from "../../src/helpers/Secrets";
import { readState, signState } from "../../src/helpers/MetaApp";

describe("the number typed to receive the WhatsApp pairing code", () => {
  it("accepts a Brazilian number with or without the country code and ignores punctuation", () => {
    expect(normalizePairingPhone("(69) 99999-1234")).toBe("5569999991234");
    expect(normalizePairingPhone("+55 69 99999-1234")).toBe("5569999991234");
    expect(normalizePairingPhone("5569999991234")).toBe("5569999991234");
  });
  it("refuses what cannot be a phone", () => {
    expect(normalizePairingPhone("123")).toBeNull();
    expect(normalizePairingPhone("abc")).toBeNull();
    expect(normalizePairingPhone("")).toBeNull();
  });
});

describe("channel credentials at rest", () => {
  const plain = JSON.stringify({ accessToken: "TOKEN-123456", appSecret: "SECRET-654321", phoneNumberId: "PN1" });

  it("seals the secrets and leaves the rest readable", () => {
    const sealed = JSON.parse(sealConfig(plain) as string);
    expect(sealed.accessToken.startsWith("enc:v1:")).toBe(true);
    expect(sealed.appSecret.startsWith("enc:v1:")).toBe(true);
    expect(sealed.phoneNumberId).toBe("PN1");
  });
  it("opens them back, and sealing twice does not seal a sealed value again", () => {
    const once = sealConfig(plain) as string;
    const twice = sealConfig(once) as string;
    expect(twice).toBe(once);
    expect(openConfig(JSON.parse(twice))).toMatchObject({ accessToken: "TOKEN-123456", appSecret: "SECRET-654321" });
  });
  it("masks with the real last characters and keeps the stored secret when the mask comes back", () => {
    const sealed = sealConfig(plain) as string;
    const shown = JSON.parse(maskConfig(sealed) as string);
    expect(shown.accessToken).toBe("••••3456");
    const merged = JSON.parse(openConfigText(mergeConfig(sealed, JSON.stringify({ ...shown, phoneNumberId: "PN2" }))));
    expect(merged.accessToken).toBe("TOKEN-123456");
    expect(merged.phoneNumberId).toBe("PN2");
  });
});

const openConfigText = (config: string): string => JSON.stringify(openConfig(JSON.parse(config)));

describe("the state that goes to Instagram and comes back", () => {
  it("returns who is connecting, signed", () => {
    const state = readState(signState(7, 12));
    expect(state).toMatchObject({ userId: 7, whatsappId: 12 });
  });
  it("refuses a forged, tampered or expired state", () => {
    const [payload] = signState(7, null).split(".");
    expect(readState(`${payload}.assinatura`)).toBeNull();
    const other = signState(8, null).split(".")[0];
    expect(readState(`${other}.${signState(7, null).split(".")[1]}`)).toBeNull();
    expect(readState(signState(7, null, -1000))).toBeNull();
    expect(readState("")).toBeNull();
  });
});

import { forChannel } from "../../src/helpers/ChannelText";
import { unsupportedFact } from "../../src/services/CommercialServices/Guards";

describe("text for the channel", () => {
  it("takes the WhatsApp marks out for Instagram and Messenger and leaves WhatsApp alone", () => {
    expect(forChannel("O curso é *100% online* e _flexível_.", "instagram")).toBe("O curso é 100% online e flexível.");
    expect(forChannel("Veja *isto*", "messenger")).toBe("Veja isto");
    expect(forChannel("O curso é *100% online*", "whatsapp")).toBe("O curso é *100% online*");
    expect(forChannel("2 * 3 = 6", "instagram")).toBe("2 * 3 = 6");
  });
});

describe("facts an agent may say", () => {
  const evidence = "Mensalidade 1299.00. Bolsa de 40% na primeira mensalidade. Atendimento das 8h às 18h. Matrícula até 20/07.";
  it("lets through what the tools or the base returned, even written another way", () => {
    expect(unsupportedFact("A mensalidade é R$ 1.299,00 com bolsa de 40%.", evidence)).toBeNull();
    expect(unsupportedFact("Atendemos das 8h às 18h e a matrícula vai até 20/07.", evidence)).toBeNull();
  });
  it("flags an amount, a percentage, a date or an hour with no source", () => {
    expect(unsupportedFact("A taxa é R$ 480,00.", evidence)).toMatch(/480/);
    expect(unsupportedFact("Você ganha 70% de desconto.", evidence)).toMatch(/70/);
    expect(unsupportedFact("As aulas começam em 03/08.", evidence)).toMatch(/03\/08/);
    expect(unsupportedFact("Falamos às 22h.", evidence)).toMatch(/22h/);
  });
  it("accepts what the person wrote themselves when it is part of the evidence", () => {
    expect(unsupportedFact("Combinado, amanhã às 14h.", `${evidence}\namanhã às 14h`)).toBeNull();
  });
});

import { alreadyIntroduces, courseMention, introText } from "../../src/services/CommercialServices/Rules";

describe("a course the person names", () => {
  it("finds the name after 'curso de', 'graduação em' and the like", () => {
    expect(courseMention("Quero saber o valor do curso de Direito")).toBe("direito");
    expect(courseMention("Vocês têm graduação em Engenharia Civil? quanto custa")).toBe("engenharia civil");
    expect(courseMention("tenho interesse no curso de Ciências Contábeis na modalidade EAD")).toBe("ciencias contabeis");
  });
  it("does not take other things for a course", () => {
    expect(courseMention("como funciona o curso de tutoria?")).toBeNull();
    expect(courseMention("queria um curso de ead")).toBeNull();
    expect(courseMention("oi, bom dia")).toBeNull();
    expect(courseMention("quero fazer pedagogia")).toBeNull();
  });
});

describe("how the agent presents itself", () => {
  it("says who it is, with or without the person's name and with the name the owner gave", () => {
    expect(introText(null, "")).toBe("Olá! Eu sou a Estela, assistente virtual da Cruzeiro do Sul Virtual.");
    expect(introText(null, "Ana")).toBe("Olá, Ana! Eu sou a Estela, assistente virtual da Cruzeiro do Sul Virtual.");
    // the administrator writes the greeting; it still says it is a virtual assistant
    expect(introText({ assistantName: "Bia", commercial: { greeting: "Oi, {{nome}}! Que bom ter você aqui." } }, "Ana")).toBe("Oi, Ana! Que bom ter você aqui. Sou a Bia, assistente virtual da Cruzeiro do Sul Virtual.");
    expect(introText({ commercial: { greeting: "Oi, {{nome}}! Aqui é a {{assistente}}, assistente virtual." } }, "Ana")).toBe("Oi, Ana! Aqui é a Estela, assistente virtual.");
    expect(introText({ assistantName: "Bia" }, "Ana")).toBe("Olá, Ana! Eu sou a Bia, assistente virtual da Cruzeiro do Sul Virtual.");
  });
  it("recognises an answer that already presents itself", () => {
    expect(alreadyIntroduces("Olá, Ana! Eu sou o assistente virtual da Cruzeiro do Sul Virtual. Qual curso?")).toBe(true);
    expect(alreadyIntroduces("Aqui é a Bia da Cruzeiro")).toBe(true);
    expect(alreadyIntroduces("O curso dura 8 semestres.")).toBe(false);
  });
});

describe("style of the agent and its history", () => {
  it("styleOf keeps the old behaviour when nothing is set and reads the four switches", async () => {
    const { styleOf, styleRules, signed } = await import("../../src/services/AiServices/Style");
    const none: any = { persona: {}, name: "Comercial" };
    expect(styleOf(none)).toEqual({ emoji: null, limitSubjects: true, splitMessages: true, signMessages: false });
    expect(styleRules(none)).toMatch(/apenas de assuntos da instituição/);
    const on: any = { persona: { emoji: true, limitSubjects: false, splitMessages: false, signMessages: true, assistantName: "Bia" }, name: "Comercial" };
    expect(styleOf(on)).toEqual({ emoji: true, limitSubjects: false, splitMessages: false, signMessages: true });
    expect(styleRules(on)).toMatch(/Pode usar emojis/);
    expect(styleRules(on)).not.toMatch(/apenas de assuntos/);
    expect(signed("Olá!", on)).toBe("*Bia:*\nOlá!");
    expect(signed("Olá!", none)).toBe("Olá!");
    expect(styleRules({ persona: { emoji: false, limitSubjects: false } } as any)).toMatch(/Não use emojis/);
  });

  it("the history names what changed and ignores what is the same", async () => {
    const { changedLabels, snapshotOf } = await import("../../src/services/AiServices/Revisions");
    const a = snapshotOf({ name: "A", systemPrompt: "x", persona: { tone: "t" }, apiKey: "secret", active: true });
    const b = snapshotOf({ name: "A", systemPrompt: "y", persona: { tone: "t" }, apiKey: "other", active: false });
    expect(changedLabels(a, b)).toEqual(["Quem é o agente"]);
    expect(Object.keys(a)).not.toContain("apiKey");
    expect(changedLabels(a, a)).toEqual([]);
  });
});

describe("what the person wants and what makes a lead qualified", () => {
  it("reads the kind of interest from the words, with no menu", async () => {
    const { interestOf } = await import("../../src/services/CommercialServices/Rules");
    const cases: Array<[string, string | null]> = [
      ["Oi", null],
      ["Quero fazer Pedagogia", "graduacao"],
      ["Quanto custa Criminologia?", null],
      ["Quero me matricular hoje", "matricula"],
      ["Já sou aluno", "aluno"],
      ["Meu boleto está errado", "administrativo"],
      ["É minha segunda graduação", "segunda_graduacao"],
      ["Quero transferir de faculdade", "transferencia"],
      ["Tem pós-graduação em direito do trabalho?", "pos_graduacao"],
      ["Quero transferir meu curso para cá", "transferencia"],
      ["Vocês têm curso técnico em enfermagem?", "tecnico"],
      ["Quero a grade curricular", null]
    ];
    for (const [text, kind] of cases) expect([text, interestOf(text, {})]).toEqual([text, kind]);
    expect(interestOf("", { enrolledStudent: true })).toBe("aluno");
  });

  it("qualifies by what the administrator requires, and always needs the course", async () => {
    const { isQualified, missingOf } = await import("../../src/services/CommercialServices/Rules");
    const slots = { courseName: "Pedagogia", courseExplained: true } as any;
    expect(isQualified(slots)).toBe(false);
    expect(missingOf(slots)).toEqual(["Cidade ou polo", "Tipo de ingresso"]);
    expect(isQualified(slots, ["course", "explained"])).toBe(true);
    expect(isQualified({}, [])).toBe(false);
    expect(isQualified({ courseName: "Pedagogia" } as any, [])).toBe(true);
  });

  it("cleans the configuration of the administrator", async () => {
    const { cleanCommercial, DEFAULT_COMMERCIAL } = await import("../../src/services/CommercialServices/Config");
    expect(cleanCommercial(null)).toEqual(DEFAULT_COMMERCIAL);
    const c = cleanCommercial({ hotHandoff: "hot", maxClarifications: 99, qualifyAfter: "3", qualifyRequires: ["course", "xx"], ask: { name: false }, messages: { queued: "  Na fila  " } });
    expect(c.hotHandoff).toBe("hot");
    expect(c.maxClarifications).toBe(3);
    expect(c.qualifyAfter).toBe(3);
    expect(c.qualifyRequires).toEqual(["course"]);
    expect(c.ask.name).toBe(false);
    expect(c.ask.city).toBe(true);
    expect(c.messages.queued).toBe("Na fila");
  });
});

describe("the scenarios of the attendance that need no model", () => {
  // what the system recognises by itself in each message (null: the model, with its tools, takes it)
  const table: Array<[string, { fast: string | null; support: string | null; interest: string | null; mention: string | null }]> = [
    ["Oi", { fast: null, support: null, interest: null, mention: null }],
    ["Quero fazer Pedagogia", { fast: null, support: null, interest: "graduacao", mention: null }],
    ["Quanto custa Criminologia?", { fast: "price", support: null, interest: null, mention: null }],
    ["Quero me matricular hoje", { fast: "enrollment", support: null, interest: "matricula", mention: null }],
    ["Já sou aluno", { fast: null, support: null, interest: "aluno", mention: null }],
    ["Quero falar com João", { fast: null, support: null, interest: null, mention: "João" }],
    ["É minha segunda graduação", { fast: null, support: null, interest: "segunda_graduacao", mention: null }],
    ["Preciso de atendimento humano", { fast: "human", support: null, interest: null, mention: null }],
    ["Já conversei com Gabrielli", { fast: null, support: null, interest: null, mention: "Gabrielli" }],
    ["Quero a grade curricular", { fast: null, support: null, interest: null, mention: null }],
    ["Essa mensalidade cabe no meu orçamento?", { fast: "price", support: null, interest: null, mention: null }],
    ["Vocês têm bolsa?", { fast: "price", support: null, interest: null, mention: null }],
    ["Meu boleto está errado", { fast: null, support: "secretary", interest: "administrativo", mention: null }],
    ["Não quero falar com atendente", { fast: null, support: null, interest: null, mention: null }],
  ];
  it.each(table)("%s", async (text, want) => {
    const R = await import("../../src/services/CommercialServices/Rules");
    const fast = R.fastIntent(text);
    expect({ fast: fast ? fast.intent : null, support: R.supportIntent(text, false), interest: R.interestOf(text, {}), mention: (R.consultantMention(text) || { name: null }).name }).toEqual(want);
  });

  it("a request for the grade is recognised without naming the course", async () => {
    const { gradeRequest } = await import("../../src/services/CommercialServices/Rules");
    expect(gradeRequest("Quero a grade curricular")).toEqual({ course: null });
  });

  it("remembers whether the lead had talked to a consultant before", async () => {
    const { consultantMention } = await import("../../src/services/CommercialServices/Rules");
    expect(consultantMention("Já conversei com a Gabrielli")).toEqual({ name: "Gabrielli", previous: true });
    expect(consultantMention("Fui atendida pelo Carlos ontem")).toEqual({ name: "Carlos", previous: true });
    expect(consultantMention("Quero falar com um consultor")).toBeNull();
  });
});
