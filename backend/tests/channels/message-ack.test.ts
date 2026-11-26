import { describe, expect, it } from "vitest";
import { ackOfCreated, mapMessageAck } from "../../src/helpers/MessageAck";

describe("confirmação da mensagem criada (WhatsApp por QR)", () => {
  it("mensagem enviada pelo celular ou pelo sistema já chega com a confirmação que o WhatsApp tem", () => {
    expect(ackOfCreated({ fromMe: true, ack: 1 })).toBe(1);
    expect(ackOfCreated({ fromMe: true, ack: 2 })).toBe(2);
    expect(ackOfCreated({ fromMe: true, ack: 3 })).toBe(3);
    expect(ackOfCreated({ fromMe: true, ack: -1 })).toBe(-1);
  });
  it("mensagem recebida não leva confirmação (o gravador usa 0)", () => {
    expect(ackOfCreated({ fromMe: false, ack: 3 })).toBeUndefined();
  });
  it("valor desconhecido vira 0, como antes", () => {
    expect(mapMessageAck(9)).toBe(0);
    expect(mapMessageAck(undefined)).toBe(0);
    expect(ackOfCreated({ fromMe: true })).toBe(0);
  });
});
