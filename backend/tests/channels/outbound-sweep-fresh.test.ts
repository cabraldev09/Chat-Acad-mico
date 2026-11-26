import { Op } from "sequelize";
import { describe, expect, it, vi } from "vitest";

const seen = vi.hoisted(() => ({ where: [] as any[] }));

vi.mock("../../src/database", () => ({ default: { transaction: async (cb: any) => cb({}), literal: (v: string) => v } }));
vi.mock("../../src/libs/socket", () => ({ getIO: () => ({ to: () => ({ emit: () => undefined }), emit: () => undefined }) }));
vi.mock("../../src/models/Message", () => ({ default: {} }));
vi.mock("../../src/models/OutboundMessage", () => ({
  default: {
    findAll: async (opts: any) => { seen.where.push(opts.where); return []; },
    update: async () => [0, []]
  }
}));
vi.mock("../../src/helpers/SetTicketMessagesAsRead", () => ({ default: () => undefined }));
vi.mock("../../src/services/TicketServices/ActivateForSending", () => ({ default: async () => undefined }));
vi.mock("../../src/services/TicketServices/ShowTicketService", () => ({ default: async () => ({}) }));
vi.mock("../../src/services/WbotServices/SendWhatsAppMedia", () => ({ default: async () => ({}) }));
vi.mock("../../src/services/WbotServices/SendWhatsAppMessage", () => ({ default: async () => ({}) }));
vi.mock("../../src/services/AnalyticsServices/Realtime", () => ({ touchAnalytics: () => undefined }));
vi.mock("../../src/services/CrmServices/LeadCore", () => ({ hookHumanReply: () => undefined }));

import { FRESH_MS, sweepOutbound } from "../../src/services/MessageServices/OutboundService";

describe("varredura dos envios", () => {
  it("não disputa com a requisição o envio recém-gravado: a primeira tentativa só depois de FRESH_MS; a nova tentativa marcada vale na hora", async () => {
    const before = Date.now();
    await sweepOutbound();
    const due = seen.where.find(w => w.status === "pending");
    expect(due).toBeTruthy();
    const branches = due[Op.or as any];
    const first = branches.find((b: any) => b.nextAttemptAt === null);
    const limit = first.createdAt[Op.lt as any].getTime();
    expect(limit).toBeLessThanOrEqual(before - FRESH_MS + 50);
    expect(limit).toBeGreaterThan(before - FRESH_MS - 1000);
    const retry = branches.find((b: any) => b.nextAttemptAt && b.nextAttemptAt[Op.lte as any]);
    expect(retry).toBeTruthy();
    expect(FRESH_MS).toBeGreaterThanOrEqual(5000);
  });
});
