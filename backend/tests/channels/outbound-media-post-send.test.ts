import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendMedia: vi.fn(), updateTicket: vi.fn() }));

vi.mock("../../src/services/OutboundServices/Deliver", () => ({
  deliver: (_ticket: any, _options: any, send: () => Promise<any>) => send()
}));
vi.mock("../../src/helpers/MediaLabel", () => ({ bodyOfMedia: () => "arquivo" }));
vi.mock("../../src/helpers/ChatId", () => ({ chatIdOf: () => "contact@c.us" }));
vi.mock("../../src/helpers/Mustache", () => ({ default: (body: string) => body }));
vi.mock("../../src/models/Whatsapp", () => ({ default: { findByPk: async () => ({ id: 8, channel: "whatsapp" }) } }));
vi.mock("../../src/providers/WhatsApp", () => ({
  whatsappProvider: { sendMedia: mocks.sendMedia },
  ProviderMessage: {}
}));
vi.mock("../../src/channels", () => ({ getAdapter: vi.fn() }));
vi.mock("../../src/services/MessageServices/CreateMessageService", () => ({ default: vi.fn() }));
vi.mock("../../src/services/SafetyServices/SendGuard", () => ({ paceSend: vi.fn(), recordSendResult: vi.fn() }));
vi.mock("../../src/helpers/ConvertAudio", () => ({ isAudio: () => false, toVoiceNote: vi.fn(), toMp3: vi.fn() }));

import SendWhatsAppMedia from "../../src/services/WbotServices/SendWhatsAppMedia";

describe("mídia aceita pelo provedor com falha posterior", () => {
  it("marca como resultado incerto em vez de recusa confirmada", async () => {
    mocks.sendMedia.mockResolvedValue({ id: "provider-1" });
    mocks.updateTicket.mockRejectedValue(new Error("database unavailable"));
    const ticket: any = {
      id: 1,
      contactId: 7,
      whatsappId: 8,
      contact: { id: 7 },
      whatsapp: { channel: "whatsapp" },
      isGroup: false,
      update: mocks.updateTicket
    };

    await expect(SendWhatsAppMedia({
      media: { filename: "file.pdf", originalname: "file.pdf", mimetype: "application/pdf", path: "/tmp/file.pdf" } as any,
      ticket,
      deliveryKey: "media:one"
    })).rejects.toMatchObject({ message: "ERR_DELIVERY_UNCERTAIN" });
    expect(mocks.sendMedia).toHaveBeenCalledTimes(1);
    expect(mocks.updateTicket).toHaveBeenCalledTimes(1);
  });
});
