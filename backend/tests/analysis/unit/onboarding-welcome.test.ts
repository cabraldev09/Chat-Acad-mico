import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/helpers/AppSettings", () => ({ getSetting: async (_k: string, fallback = "") => fallback, setSetting: async () => undefined }));
vi.mock("../../../src/helpers/Institution", () => ({ institutionNameFor: async () => "Cruzeiro do Sul Virtual" }));
vi.mock("../../../src/models/Contact", () => ({ default: {} }));
vi.mock("../../../src/models/Course", () => ({ default: {} }));
vi.mock("../../../src/models/Lead", () => ({ default: {} }));
vi.mock("../../../src/models/LeadEnrollment", () => ({ default: {} }));
vi.mock("../../../src/models/LeadActivity", () => ({ default: {} }));
vi.mock("../../../src/models/Message", () => ({ default: {} }));
vi.mock("../../../src/models/Polo", () => ({ default: {} }));
vi.mock("../../../src/models/Queue", () => ({ default: {} }));
vi.mock("../../../src/models/Ticket", () => ({ default: {} }));
vi.mock("../../../src/models/User", () => ({ default: {} }));

import { DEFAULT_UNKNOWN, DEFAULT_WELCOME, fillWelcome, greetingOf } from "../../../src/helpers/OnboardingWelcome";

const full = { saudacao: "Olá, Gabriela, que bom que você chamou!", primeiro_nome: "Gabriela", nome: "Gabriela Jonjob", tutor: "João Vitor", polo: "Porto Velho", curso: "Pedagogia", instituicao: "Cruzeiro do Sul Virtual" };

describe("primeira abordagem do tutor", () => {
  it("o texto padrão responde ao aluno, se apresenta, traz o curso e o polo da matrícula e termina com uma pergunta só", () => {
    const text = fillWelcome(DEFAULT_WELCOME, full);
    expect(text.startsWith("Olá, Gabriela, que bom que você chamou! Eu sou João Vitor, tutor(a) da Cruzeiro do Sul Virtual no polo Porto Velho, e vou acompanhar você no curso de Pedagogia.")).toBe(true);
    expect(text).toContain("ambientação");
    expect(text.match(/\?/g)).toHaveLength(1);
    expect(text).not.toMatch(/\{\{|\[\[|\]\]/);
  });

  it("sem polo ou sem curso, a parte opcional some inteira e o texto continua limpo", () => {
    const noPolo = fillWelcome(DEFAULT_WELCOME, { ...full, polo: "" });
    expect(noPolo).toContain("tutor(a) da Cruzeiro do Sul Virtual, e vou acompanhar você no curso de Pedagogia.");
    const none = fillWelcome(DEFAULT_WELCOME, { ...full, polo: "", curso: "  " });
    expect(none).toContain("tutor(a) da Cruzeiro do Sul Virtual, e vou acompanhar você. O primeiro passo");
    expect(none).not.toMatch(/ {2}| \.| ,/);
  });

  it("a saudação responde quem escreveu primeiro; quando o tutor começa, só cumprimenta", () => {
    expect(greetingOf("Ana", true)).toBe("Olá, Ana, que bom que você chamou!");
    expect(greetingOf("Ana", false)).toBe("Olá, Ana!");
    expect(greetingOf("", true)).toBe("Olá, que bom que você chamou!");
    expect(greetingOf("  ", false)).toBe("Olá!");
  });

  it("para quem escreve sem matrícula no sistema: sem falar de matrícula nem de ambientação, só o RGM", () => {
    const text = fillWelcome(DEFAULT_UNKNOWN, full);
    expect(text).toBe("Olá, Gabriela, que bom que você chamou! Eu sou João Vitor, da tutoria da Cruzeiro do Sul Virtual. Para eu localizar o seu cadastro, você pode me informar o seu RGM?");
    expect(text).not.toMatch(/matr[ií]cula|ambienta/i);
  });

  it("os textos padrão não têm emoji", () => {
    expect(DEFAULT_WELCOME).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(DEFAULT_UNKNOWN).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("variável desconhecida fica como foi digitada, e colchetes sem fechar ficam no texto", () => {
    expect(fillWelcome("Oi {{primeiro_nome}}, {{turma}}!", full)).toBe("Oi Gabriela, {{turma}}!");
    expect(fillWelcome("Oi [[ {{polo}}", full)).toBe("Oi [[ Porto Velho");
  });

  it("variáveis em maiúsculas e com espaços também valem", () => {
    expect(fillWelcome("Aqui é {{ TUTOR }}.", full)).toBe("Aqui é João Vitor.");
  });
});
