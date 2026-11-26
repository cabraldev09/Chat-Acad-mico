import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/models/Whatsapp", () => ({ default: {} }));
vi.mock("../../src/models/Ticket", () => ({ default: {} }));
vi.mock("../../src/models/Message", () => ({ default: {} }));
vi.mock("../../src/models/TicketPin", () => ({ default: {} }));
vi.mock("../../src/models/User", () => ({ default: {} }));
vi.mock("../../src/models/Contact", () => ({ default: {} }));
vi.mock("../../src/providers/WhatsApp", () => ({ whatsappProvider: {} }));
vi.mock("../../src/libs/socket", () => ({ getIO: () => ({ emit: () => undefined }) }));
vi.mock("../../src/helpers/Fire", () => ({ fire: () => undefined }));

import { chatBehind, eachLimited, isTransientState, settledChats, stateToWrite } from "../../src/providers/WhatsApp/Implementations/chatSync";
import { placeOf, RECENT_DAYS } from "../../src/services/WbotServices/ImportHistoryService";
import { betterNameOf } from "../../src/services/ContactServices/CreateOrUpdateContactService";
import { chatIdOfContact } from "../../src/services/WbotServices/ChatHistoryFromPhone";

describe("cópia das conversas do WhatsApp por QR Code", () => {
  it("espera o celular terminar de mandar as conversas antes de copiar", async () => {
    const sizes = [3, 40, 120, 120, 120, 120];
    let call = 0;
    const wbot = { getChats: async () => Array.from({ length: sizes[Math.min(call++, sizes.length - 1)] }, (_, i) => ({ i })) };
    const chats = await settledChats(wbot, { everyMs: 1, maxMs: 5000, stableReads: 3 });
    expect(chats.length).toBe(120);
    // 3 → 40 → 120, then two more equal readings
    expect(call).toBe(5);
  });

  it("não espera para sempre se a lista nunca para de crescer", async () => {
    let n = 0;
    const wbot = { getChats: async () => Array.from({ length: (n += 1) }, () => ({})) };
    const chats = await settledChats(wbot, { everyMs: 5, maxMs: 40, stableReads: 3 });
    expect(chats.length).toBeGreaterThan(1);
    expect(n).toBeLessThan(20);
  });

  it("lê as conversas em paralelo, no máximo o limite ao mesmo tempo, e todas são lidas", async () => {
    let running = 0;
    let peak = 0;
    const done: number[] = [];
    await eachLimited([1, 2, 3, 4, 5, 6, 7], 2, async i => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise(r => setTimeout(r, 5));
      running -= 1;
      if (i === 3) return;
      done.push(i);
    });
    expect(peak).toBe(2);
    expect(done.sort()).toEqual([1, 2, 4, 5, 6, 7]);
  });

  it("conversa recente do número próprio entra em Atendendo com o dono; antiga ou arquivada fica no histórico", () => {
    const now = new Date("2026-11-26T12:00:00Z");
    const recent = new Date(now.getTime() - 2 * 86400000);
    const old = new Date(now.getTime() - (RECENT_DAYS + 1) * 86400000);
    expect(placeOf({}, 7, recent, now)).toEqual({ status: "open", userId: 7 });
    expect(placeOf({ isGroup: true }, 7, recent, now)).toEqual({ status: "open", userId: 7 });
    expect(placeOf({}, 7, old, now)).toEqual({ status: "closed", userId: 7 });
    expect(placeOf({ archived: true }, 7, recent, now)).toEqual({ status: "closed", userId: 7 });
    // número da empresa (sem dono): tudo histórico, sem responsável
    expect(placeOf({}, null, recent, now)).toEqual({ status: "closed", userId: null });
  });

  it("só avisa como nova a mensagem que chegou depois da cópia", () => {
    const copied = Date.parse("2026-11-26T00:20:00Z");
    // antes da cópia nada é tratado como novo: a cópia traz em silêncio
    expect(chatBehind(Date.parse("2026-11-26T00:30:00Z"), null, null)).toBe(false);
    // conversa sem nada guardado: só o que é mais novo que a cópia
    expect(chatBehind(Date.parse("2026-10-01T10:00:00Z"), copied, null)).toBe(false);
    expect(chatBehind(Date.parse("2026-11-26T00:40:00Z"), copied, null)).toBe(true);
    // conversa com mensagens guardadas: só o que é mais novo que a última guardada
    const last = Date.parse("2026-11-26T00:35:00Z");
    expect(chatBehind(last + 2000, copied, last)).toBe(false);
    expect(chatBehind(last + 60000, copied, last)).toBe(true);
  });

  it("o contato que só tinha o número recebe o nome do celular; um nome digitado no sistema não é trocado", () => {
    expect(betterNameOf("5511999990000", "Maria Souza", "5511999990000")).toBe(true);
    expect(betterNameOf("+55 11 99999-0000", "Maria Souza", "5511999990000")).toBe(true);
    expect(betterNameOf(null, "Maria Souza", "5511999990000")).toBe(true);
    expect(betterNameOf("Maria (aluna)", "Maria Souza", "5511999990000")).toBe(false);
    expect(betterNameOf("5511999990000", "5511999990000", "5511999990000")).toBe(false);
    expect(betterNameOf("5511999990000", "", "5511999990000")).toBe(false);
  });

  it("a conversa de um contato é achada no celular pelo número", () => {
    expect(chatIdOfContact({ number: "55 (11) 99999-0000" })).toBe("5511999990000@c.us");
    expect(chatIdOfContact({ number: "120363000000000000", isGroup: true })).toBe("120363000000000000@g.us");
    expect(chatIdOfContact({ number: "" })).toBe(null);
  });

  it("um estado passageiro do WhatsApp Web não derruba a conexão na tela", () => {
    expect(isTransientState("OPENING")).toBe(true);
    expect(isTransientState("PAIRING")).toBe(true);
    expect(isTransientState("TIMEOUT")).toBe(true);
    expect(isTransientState("CONFLICT")).toBe(false);
    expect(isTransientState("UNPAIRED")).toBe(false);
    // perguntado de novo: voltou, continua, ou não respondeu
    expect(stateToWrite("OPENING", "CONNECTED", false)).toBe("CONNECTED");
    expect(stateToWrite("OPENING", "TIMEOUT", false)).toBe("TIMEOUT");
    expect(stateToWrite("OPENING", null, false)).toBe("OPENING");
    // na primeira sincronização a página ocupada demora: quem decide é a checagem de vida
    expect(stateToWrite("OPENING", null, true)).toBe(null);
  });
});
