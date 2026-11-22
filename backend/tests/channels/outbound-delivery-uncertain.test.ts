import { beforeEach, describe, expect, it, vi } from "vitest";
import AppError from "../../src/errors/AppError";

const state = vi.hoisted(() => ({ delivery: null as any, sendCalls: 0 }));

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
        update: async (patch: any) => Object.assign(state.delivery, patch)
      };
      return state.delivery;
    },
    count: async () => 0,
    sum: async () => 0
  }
}));
vi.mock("../../src/helpers/AppSettings", () => ({ getSetting: async () => "0" }));
vi.mock("../../src/helpers/AppTime", () => ({ dayBounds: () => ({ start: new Date(0), end: new Date() }) }));
vi.mock("../../src/services/AutomationServices/BusinessHours", () => ({ isWithinBusinessHours: () => true }));
vi.mock("../../src/services/OutboundServices/Policy", () => ({ inMessagingWindow: () => true, validateTemplate: () => true }));
vi.mock("../../src/services/OutboundServices/LastInbound", () => ({ lastInboundAt: async () => new Date() }));

import { deliver } from "../../src/services/OutboundServices/Deliver";

describe("envio com resultado incerto", () => {
  beforeEach(() => {
    state.delivery = null;
    state.sendCalls = 0;
  });

  it("não repete automaticamente um envio quando o erro genérico não prova recusa do provedor", async () => {
    const ticket: any = { id: 1, contactId: 7, whatsappId: 8 };
    const send = vi.fn(async () => {
      state.sendCalls += 1;
      throw new AppError("ERR_SENDING_WAPP_MSG");
    });

    await expect(deliver(ticket, { key: "media:one" }, send)).rejects.toMatchObject({ message: "ERR_SENDING_WAPP_MSG" });
    expect(state.delivery.status).toBe("uncertain");

    await expect(deliver(ticket, { key: "media:one" }, send)).rejects.toMatchObject({ message: "ERR_DELIVERY_UNCERTAIN" });
    expect(state.sendCalls).toBe(1);
  });
});
