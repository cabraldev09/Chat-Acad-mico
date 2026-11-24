import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { used: 0, granted: [] as number[], quota: "200", role: "tutor", pending: null as any };
vi.mock("../../src/database", () => ({ default: { query: async () => (state.used ? [{ userId: 7, n: String(state.used) }] : []), getDialect: () => "postgres" } }));
vi.mock("../../src/helpers/AppSettings", () => ({ getSetting: async (k: string, d: string) => (k === "send_quota_monthly" ? state.quota : d) }));
vi.mock("../../src/models/SendRelease", () => ({
  default: {
    findAll: async () => state.granted.map(g => ({ userId: 7, granted: g })),
    findOne: async () => state.pending
  }
}));
vi.mock("../../src/models/User", () => ({ default: { findByPk: async () => ({ id: 7, role: state.role, profile: "user" }) } }));

import { assertCampaignQuota, assertSendQuota, quotaOf } from "../../src/services/CampaignServices/SendQuota";
import { currentActorId, withActor, withoutActor } from "../../src/helpers/Actor";

describe("a cota de disparos do mês", () => {
  beforeEach(() => Object.assign(state, { used: 0, granted: [], quota: "200", role: "tutor", pending: null }));

  it("cada pessoa tem 200 mensagens por mês; o que a gestão libera soma", async () => {
    state.used = 150;
    expect((await quotaOf(7)).left).toBe(50);
    await expect(assertSendQuota(7, 51)).rejects.toMatchObject({ message: "ERR_SEND_QUOTA", statusCode: 409 });
    await expect(assertSendQuota(7, 50)).resolves.toBeTruthy();
    state.granted = [30, 20];
    const q = await quotaOf(7);
    expect([q.extra, q.left]).toEqual([50, 100]);
    await expect(assertSendQuota(7, 100)).resolves.toBeTruthy();
  });

  it("a gestão não tem cota, e 0 desliga a cota", async () => {
    state.used = 999;
    state.role = "coordenacao";
    expect((await quotaOf(7)).limited).toBe(false);
    await expect(assertSendQuota(7, 5000)).resolves.toBeTruthy();
    state.role = "consultor";
    state.quota = "0";
    expect((await quotaOf(7)).left).toBeNull();
    // a manager starting a consultant's campaign passes, whatever the consultant's quota
    state.quota = "10";
    await expect(assertCampaignQuota(7, 50, { role: "admin", profile: "admin" })).resolves.toBeUndefined();
    await expect(assertCampaignQuota(7, 50, { role: "consultor", profile: "user" })).rejects.toMatchObject({ message: "ERR_SEND_QUOTA" });
  });

  it("um pedido aguardando aparece na cota", async () => {
    state.pending = { id: 3, requested: 40, createdAt: new Date() };
    expect((await quotaOf(7)).pending).toMatchObject({ id: 3, requested: 40 });
  });
});

describe("quem provocou o envio ou a chamada da IA", () => {
  it("vale a pessoa do pedido, também no que o pedido deixa para depois; uma sessão iniciada por alguém não guarda essa pessoa", async () => {
    expect(currentActorId()).toBeNull();
    await withActor(5, async () => {
      expect(currentActorId()).toBe(5);
      await new Promise(r => setTimeout(r, 1));
      expect(currentActorId()).toBe(5);
      withoutActor(() => expect(currentActorId()).toBeNull());
      withActor(9, () => expect(currentActorId()).toBe(9));
    });
    expect(withActor(0, () => currentActorId())).toBeNull();
  });
});
