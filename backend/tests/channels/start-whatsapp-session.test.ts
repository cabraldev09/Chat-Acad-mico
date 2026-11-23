import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const doubles = vi.hoisted(() => ({
  init: vi.fn(async () => {}),
  startAdapter: vi.fn(async () => {}),
  update: vi.fn(async () => {}),
  emit: vi.fn(),
  logError: vi.fn()
}));

vi.mock("../../src/providers/WhatsApp", () => ({
  whatsappProvider: { init: doubles.init }
}));
vi.mock("../../src/channels", () => ({
  getAdapter: () => ({ start: doubles.startAdapter })
}));
vi.mock("../../src/libs/socket", () => ({
  getIO: () => ({ emit: doubles.emit })
}));
vi.mock("../../src/utils/logger", () => ({
  logger: { error: doubles.logError }
}));

import { StartWhatsAppSession } from "../../src/services/WbotServices/StartWhatsAppSession";

describe("StartWhatsAppSession with SKIP_WHATSAPP_SESSIONS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("skips WWebJS when an E2E-created QR connection is stored", async () => {
    vi.stubEnv("SKIP_WHATSAPP_SESSIONS", "1");
    const whatsapp = { id: 17, channel: "whatsapp", update: doubles.update } as any;

    await StartWhatsAppSession(whatsapp);

    expect(doubles.init).not.toHaveBeenCalled();
    expect(doubles.update).not.toHaveBeenCalled();
    expect(doubles.startAdapter).not.toHaveBeenCalled();
  });

  it("still starts official channel adapters while the flag is set", async () => {
    vi.stubEnv("SKIP_WHATSAPP_SESSIONS", "1");
    const whatsapp = { id: 18, channel: "whatsapp_cloud", update: doubles.update } as any;

    await StartWhatsAppSession(whatsapp);

    expect(doubles.update).toHaveBeenCalledWith({ status: "OPENING" });
    expect(doubles.startAdapter).toHaveBeenCalledWith(whatsapp);
    expect(doubles.init).not.toHaveBeenCalled();
  });
});
