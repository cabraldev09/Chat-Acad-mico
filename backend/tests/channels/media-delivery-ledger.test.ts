import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  delivery: null as any,
  sendMedia: vi.fn(),
  updateTicket: vi.fn()
}));

vi.mock("../../src/database", () => ({
  default: {
    getDialect: () => "sqlite",
    transaction: async (callback: (transaction: any) => Promise<any>) => callback({}),
    query: vi.fn()
  }
}));
vi.mock("../../src/models/Contact", () => ({ default: { findByPk: async () => ({ id: 7, optOut: false }) } }));
vi.mock("../../src/models/Whatsapp", () => ({ default: { findByPk: async () => ({ id: 8, channel: "whatsapp" }) } }));
vi.mock("../../src/models/Ticket", () => ({ default: {} }));
vi.mock("../../src/models/Message", () => ({ default: {} }));
vi.mock("../../src/models/OutboundDelivery", () => ({
  default: {
    findOne: async () => state.delivery,
    create: async (values: any) => {
      state.delivery = {
        ...values,
        update: async (patch: any) => Object.assign(state.delivery, patch),
        destroy: async () => { state.delivery = null; }
      };
      return state.delivery;
    },
    count: async () => 0,
    sum: async () => 0
  }
}));
vi.mock("../../src/helpers/AppSettings", () => ({ getSetting: async () => "0" }));
vi.mock("../../src/helpers/AppTime", () => ({ dayBounds: () => ({ start: new Date(0), end: new Date() }) }));
vi.mock("../../src/helpers/MediaLabel", () => ({ bodyOfMedia: () => "arquivo" }));
vi.mock("../../src/helpers/ChatId", () => ({ chatIdOf: () => "contact@c.us" }));
vi.mock("../../src/helpers/Mustache", () => ({ default: (body: string) => body }));
vi.mock("../../src/providers/WhatsApp", () => ({ whatsappProvider: { sendMedia: state.sendMedia } }));
vi.mock("../../src/channels", () => ({ getAdapter: vi.fn() }));
vi.mock("../../src/services/MessageServices/CreateMessageService", () => ({ default: vi.fn() }));
vi.mock("../../src/services/SafetyServices/SendGuard", () => ({ paceSend: vi.fn(), recordSendResult: vi.fn() }));
vi.mock("../../src/helpers/ConvertAudio", () => ({ isAudio: () => false, toVoiceNote: vi.fn(), toMp3: vi.fn() }));
vi.mock("../../src/services/AutomationServices/BusinessHours", () => ({ isWithinBusinessHours: () => true }));
vi.mock("../../src/services/OutboundServices/Policy", () => ({ inMessagingWindow: () => true, validateTemplate: () => true }));
vi.mock("../../src/services/OutboundServices/LastInbound", () => ({ lastInboundAt: async () => new Date() }));

import SendWhatsAppMedia from "../../src/services/WbotServices/SendWhatsAppMedia";

describe("ledger de mídia aceita pelo provedor", () => {
  beforeEach(() => {
    state.delivery = null;
    state.sendMedia.mockReset();
    state.updateTicket.mockReset();
  });

  it("registra entrega incerta e não reenvia na repetição da chave", async () => {
    state.sendMedia.mockResolvedValue({ id: "provider-1" });
    state.updateTicket.mockRejectedValue(new Error("database unavailable"));
    const ticket: any = {
      id: 1,
      contactId: 7,
      whatsappId: 8,
      contact: { id: 7 },
      whatsapp: { channel: "whatsapp" },
      isGroup: false,
      update: state.updateTicket
    };
    const request = {
      media: { filename: "file.pdf", originalname: "file.pdf", mimetype: "application/pdf", path: "/tmp/file.pdf" } as any,
      ticket,
      deliveryKey: "media:one"
    };

    await expect(SendWhatsAppMedia(request)).rejects.toMatchObject({ message: "ERR_DELIVERY_UNCERTAIN" });
    expect(state.delivery.status).toBe("uncertain");
    await expect(SendWhatsAppMedia(request)).rejects.toMatchObject({ message: "ERR_DELIVERY_UNCERTAIN" });
    expect(state.sendMedia).toHaveBeenCalledTimes(1);
    expect(state.updateTicket).toHaveBeenCalledTimes(1);
  });
});
