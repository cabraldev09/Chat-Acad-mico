import { describe, expect, it } from "vitest";
import { chunkLines, looksLikeWhatsAppExport, maskPii, parseWhatsAppExport, toTranscript } from "../../../src/services/AiServices/ChatExport";

const ANDROID = `12/03/2024 14:35 - As mensagens e ligações são protegidas com a criptografia de ponta a ponta.
12/03/2024 14:35 - Ana Consultora: Oi! Tudo bem?
Aqui é a Ana, da Cruzeiro do Sul.
12/03/2024 14:36 - Cliente: Oi, quero saber de pedagogia
12/03/2024 14:36 - Cliente: <Mídia oculta>
12/03/2024 14:37 - Ana Consultora: Que bom! Qual a sua cidade?
12/03/2024 14:38 - Cliente: Porto Velho
12/03/2024 14:39 - Ana Consultora: Esta mensagem foi apagada
13/03/2024 09:00 - Ana Consultora: Bom dia!`;

const IPHONE = `[12/03/2024 14:35:10] Ana Consultora: ‎Oi! Tudo bem?
[12/03/2024 14:36:02] Cliente: Quero pedagogia
[12/03/2024 14:36:40] Ana Consultora: ‎imagem ocultada
[12/03/2024 02:37:00 PM] Ana Consultora: Qual a sua cidade?
[12/03/2024 14:38:00] Cliente: Porto Velho`;

describe("WhatsApp export reader", () => {
  it("reads the Android format: joins continuation lines, drops system lines, media and deleted messages", () => {
    const chat = parseWhatsAppExport(ANDROID);
    expect(chat.messages.map(m => m.name)).toEqual(["Ana Consultora", "Cliente", "Ana Consultora", "Cliente", "Ana Consultora"]);
    expect(chat.messages[0].text).toBe("Oi! Tudo bem?\nAqui é a Ana, da Cruzeiro do Sul.");
    expect(chat.messages[0].at).toBe("2024-03-12T14:35");
    expect(chat.participants[0]).toEqual({ name: "Ana Consultora", count: 3 });
  });

  it("reads the iPhone format with invisible marks, omitted media and 12-hour clocks", () => {
    const chat = parseWhatsAppExport(IPHONE);
    expect(chat.messages).toHaveLength(4);
    expect(chat.messages[2].at).toBe("2024-03-12T14:37");
    expect(chat.messages[0].text).toBe("Oi! Tudo bem?");
  });

  it("recognizes an export and does not mistake plain text for one", () => {
    expect(looksLikeWhatsAppExport(ANDROID)).toBe(true);
    expect(looksLikeWhatsAppExport("Procedimento de atendimento:\n1. Cumprimente\n2. Pergunte o curso")).toBe(false);
  });

  it("builds a transcript with roles, a break between conversations, and masks personal data", () => {
    const chat = parseWhatsAppExport(`${ANDROID}\n13/03/2024 09:01 - Cliente: meu cpf 123.456.789-09 e fone (69) 99999-1234, mail a@b.com`);
    const t = toTranscript(chat, "Ana Consultora");
    expect(t).toContain("ATENDENTE: Oi! Tudo bem?");
    expect(t).toContain("CLIENTE: Oi, quero saber de pedagogia");
    expect(t).toContain("=== nova conversa ===");
    expect(t).toContain("[cpf]");
    expect(t).toContain("[telefone]");
    expect(t).toContain("[email]");
    expect(t).not.toContain("123.456");
  });

  it("masks identifiers", () => {
    expect(maskPii("ligue 69 99999-1234 ou 11 98888-7777, cpf 12345678909")).toBe("ligue [telefone] ou [telefone], cpf [cpf]");
  });

  it("cuts long text between lines", () => {
    const text = Array.from({ length: 50 }, (_, i) => `linha ${i} ${"x".repeat(100)}`).join("\n");
    const parts = chunkLines(text, 1000);
    expect(parts.length).toBeGreaterThan(4);
    expect(parts.every(p => p.length <= 1000)).toBe(true);
    expect(parts.join("\n")).toBe(text);
  });
});
