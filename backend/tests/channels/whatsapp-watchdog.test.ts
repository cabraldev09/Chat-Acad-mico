import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => { process.env.WHATSAPP_WATCHDOG_GRACE_MS = "0"; delete process.env.SKIP_WHATSAPP_SESSIONS; });
const rows: any[] = [];
const started: number[] = [];
vi.mock("../../src/models/Whatsapp", () => ({ default: { findAll: async () => rows } }));
vi.mock("../../src/providers/WhatsApp/Implementations/wwebjs", () => ({
  reconcileStatuses: async () => undefined,
  sessionHealth: async () => [],
  sessionWatch: () => ({ live: false, initializing: false })
}));
vi.mock("../../src/services/WbotServices/StartWhatsAppSession", () => ({ StartWhatsAppSession: async (w: any) => { started.push(w.id); } }));
vi.mock("./../../src/workers/CloudHealth", () => ({ alertAdmins: async () => true }));
vi.mock("fs", async (orig: any) => {
  const real = await orig();
  return { ...real, default: { ...real, existsSync: () => true }, existsSync: () => true };
});

import { runWhatsappWatchdogOnce } from "../../src/workers/WhatsappWatchdog";

describe("o watchdog não reabre para sempre um número que não volta", () => {
  beforeEach(() => { rows.length = 0; started.length = 0; delete process.env.SKIP_WHATSAPP_SESSIONS; });

  it("depois de 3 reaberturas sem sucesso, só tenta de novo 6 horas depois", async () => {
    const t0 = Date.now() + 60000;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(t0);
    const w: any = { id: 4, name: "Sem QR", channel: "whatsapp", status: "DISCONNECTED", statusSince: new Date(t0 - 3600000), update: async () => undefined };
    rows.push(w);
    for (let i = 0; i < 6; i += 1) {
      vi.setSystemTime(t0 + i * 31 * 60000);
      // eslint-disable-next-line no-await-in-loop
      await runWhatsappWatchdogOnce();
    }
    expect(started).toEqual([4, 4, 4]);
    vi.setSystemTime(t0 + 2 * 31 * 60000 + 6 * 3600000 + 60000);
    await runWhatsappWatchdogOnce();
    expect(started).toEqual([4, 4, 4, 4]);
    vi.useRealTimers();
  });
});
