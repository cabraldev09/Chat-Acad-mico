import { describe, expect, it, vi } from "vitest";

// ---- each piece of a send has its own delivery key, so a retry never sends again what already went
const sent: any[] = [];
let failSecond = true;
vi.mock("../../src/services/WbotServices/SendWhatsAppMedia", () => ({
  default: vi.fn(async (input: any) => {
    sent.push(input.deliveryKey);
    if (failSecond && input.deliveryKey.endsWith(":1")) { failSecond = false; throw new Error("ERR_SENDING_WAPP_MSG"); }
    return { id: `p-${input.deliveryKey}` };
  })
}));
vi.mock("../../src/services/WbotServices/SendWhatsAppMessage", () => ({ default: vi.fn(async (input: any) => { sent.push(input.deliveryKey); return { id: "p" }; }) }));
const row: any = { id: 9, ticketId: 1, userId: 2, attempts: 1, payload: { medias: [{ path: "a" }, { path: "b" }], requireOwner: false } };
const statusUpdates: any[] = [];
vi.mock("../../src/models/OutboundMessage", () => ({
  default: {
    update: vi.fn(async (patch: any, opts: any) => {
      statusUpdates.push({ patch, where: opts.where });
      return patch.attempts ? [1, [row]] : [1];
    })
  }
}));
vi.mock("../../src/services/TicketServices/ShowTicketService", () => ({ default: vi.fn(async () => ({ id: 1, userId: 2, contactId: 5 })) }));
vi.mock("../../src/helpers/SetTicketMessagesAsRead", () => ({ default: vi.fn() }));
vi.mock("../../src/models/Message", () => ({ default: { findByPk: vi.fn(), findOne: vi.fn(async () => null) } }));
vi.mock("../../src/libs/socket", () => ({ getIO: () => ({ to: () => ({ emit: vi.fn() }) }) }));
vi.mock("../../src/services/AnalyticsServices/Realtime", () => ({ touchAnalytics: vi.fn() }));
vi.mock("../../src/services/CrmServices/LeadCore", () => ({ hookHumanReply: vi.fn() }));
vi.mock("../../src/services/TicketServices/ActivateForSending", () => ({ default: vi.fn() }));
vi.mock("../../src/database", () => ({ default: { literal: (x: string) => x, transaction: vi.fn() } }));

import { processOutbound } from "../../src/services/MessageServices/OutboundService";
import { lastInboundAt } from "../../src/services/OutboundServices/LastInbound";
import Message from "../../src/models/Message";

describe("envio sem duplicar", () => {
  it("cada arquivo tem a sua chave; a nova tentativa reusa as mesmas chaves e só troca o status de quem ainda está enviando", async () => {
    await processOutbound(9);
    expect(sent).toEqual(["outbound:9:0", "outbound:9:1"]);
    const retry = statusUpdates.find(u => u.patch.status === "pending");
    expect(retry.where).toMatchObject({ id: 9, status: "sending" });
    sent.length = 0;
    await processOutbound(9);
    // the 1st file goes to deliver() with the same key: deliver answers with the first send (no second message)
    expect(sent).toEqual(["outbound:9:0", "outbound:9:1"]);
    expect(statusUpdates.some(u => u.patch.status === "sent" && u.where.status === "sending")).toBe(true);
  });
});

describe("janela de 24 horas", () => {
  it("a última mensagem da pessoa ignora as apagadas (a tela e o envio usam a mesma regra)", async () => {
    await lastInboundAt(5, 3);
    expect((Message.findOne as any).mock.calls[0][0].where).toEqual({ fromMe: false, isDeleted: false });
  });
});
