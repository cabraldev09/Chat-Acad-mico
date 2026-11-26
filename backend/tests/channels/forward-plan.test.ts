import { describe, expect, it } from "vitest";
import { nativeForwardable, retryPairs } from "../../src/services/MessageServices/ForwardPlan";

describe("encaminhar como o celular", () => {
  it("só entre conversas do mesmo número por QR Code", () => {
    expect(nativeForwardable({ whatsappId: 3, channel: "whatsapp" }, { whatsappId: 3, channel: "whatsapp" }, true)).toBe(true);
    expect(nativeForwardable({ whatsappId: 3, channel: "whatsapp" }, { whatsappId: 4, channel: "whatsapp" }, true)).toBe(false);
    expect(nativeForwardable({ whatsappId: 3, channel: "whatsapp_cloud" }, { whatsappId: 3, channel: "whatsapp_cloud" }, true)).toBe(false);
    expect(nativeForwardable({ whatsappId: 3, channel: "whatsapp" }, { whatsappId: 3, channel: "whatsapp" }, false)).toBe(false);
  });

  it("tentar de novo manda só os pares que falharam, cada um uma vez", () => {
    expect(retryPairs([{ messageId: "a", ticketId: 1 }, { messageId: "a", ticketId: 1 }, { messageId: "b", ticketId: "2" }, { messageId: "", ticketId: 3 }, null])).toEqual([
      { messageId: "a", ticketId: 1 },
      { messageId: "b", ticketId: 2 }
    ]);
    expect(retryPairs("x")).toEqual([]);
  });
});
