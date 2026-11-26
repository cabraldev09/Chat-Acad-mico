import { describe, expect, it, vi } from "vitest";

// the rooms each "ticket" event reached
const emits: { rooms: string[]; event: string; payload: any }[] = [];
const fakeIO = () => {
  const rooms: string[] = [];
  const chain: any = {
    to: (room: string) => { rooms.push(room); return chain; },
    emit: (event: string, payload: any) => { emits.push({ rooms: [...rooms], event, payload }); }
  };
  return chain;
};
vi.mock("../../src/libs/socket", () => ({ getIO: () => fakeIO() }));
const message: any = { id: "MSG1", ticketId: 265, ack: 0, update: async (v: any) => Object.assign(message, v) };
vi.mock("../../src/models/Message", () => ({ default: { findByPk: async () => message } }));
vi.mock("../../src/models/Ticket", () => ({
  default: { update: async () => [1], findByPk: async () => ({ id: 265, status: "open", lastMessageAck: 2 }) }
}));
vi.mock("../../src/models/Tag", () => ({ default: {} }));
vi.mock("../../src/models/Whatsapp", () => ({ default: {} }));

import { handleAckByExternalId } from "../../src/services/InboundServices/HandleAck";

describe("tique da última mensagem na lista de conversas", () => {
  it("a confirmação chega também à lista Todas (sala notification), não só às abas por situação", async () => {
    await handleAckByExternalId("MSG1", 2);
    const update = emits.find(e => e.event === "ticket" && e.payload?.action === "update");
    expect(update?.payload.ticket.lastMessageAck).toBe(2);
    expect(update?.rooms).toEqual(expect.arrayContaining(["open", "265", "notification"]));
  });
});
