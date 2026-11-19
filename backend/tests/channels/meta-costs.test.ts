import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/models/Whatsapp", () => ({ default: { findAll: async () => [] } }));
vi.mock("../../src/channels/types", () => ({ getConfig: (w: any) => w.cfg || {} }));
vi.mock("../../src/channels/meta", () => ({ GRAPH: "https://graph.test" }));
vi.mock("../../src/services/CampaignServices/Templates", () => ({ wabaOf: async () => [] }));

import { parsePoints, summarizeCosts } from "../../src/services/ChannelServices/MetaCosts";

const TZ = "America/Porto_Velho";
const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

describe("custos da API oficial (Meta)", () => {
  it("lê os pontos do pricing_analytics e do conversation_analytics", () => {
    const pricing = parsePoints({ pricing_analytics: { data: [{ data_points: [
      { start: at("2026-11-18T12:00:00Z"), end: 0, volume: 10, cost: 0.625, pricing_category: "MARKETING", pricing_type: "REGULAR", phone_number: "+55 69 9999-0000" }
    ] }] } });
    expect(pricing).toEqual([{ start: at("2026-11-18T12:00:00Z"), cost: 0.625, volume: 10, category: "MARKETING", type: "REGULAR", phone: "556999990000" }]);
    const legacy = parsePoints({ conversation_analytics: { data: [{ data_points: [{ start: 1, conversation: 3, cost: 0.2, conversation_category: "service", conversation_type: "free_tier" }] }] } });
    expect(legacy[0]).toMatchObject({ volume: 3, category: "SERVICE", type: "FREE_TIER" });
    expect(parsePoints({})).toEqual([]);
  });

  it("soma por dia (no fuso da empresa), por categoria e por número, e separa o gratuito", () => {
    const points = [
      { start: at("2026-11-18T12:00:00Z"), cost: 1.5, volume: 20, category: "MARKETING", type: "REGULAR", phone: "1" },
      { start: at("2026-11-19T02:00:00Z"), cost: 0.25, volume: 5, category: "UTILITY", type: "REGULAR", phone: "1" }, // 18/11 22h em Porto Velho
      { start: at("2026-11-19T15:00:00Z"), cost: 0, volume: 40, category: "SERVICE", type: "FREE_CUSTOMER_SERVICE", phone: "2" },
    ];
    const s = summarizeCosts(points, TZ, new Map([["1", "API Oficial Polos"]]), "2026-11-19");
    expect(s.total).toBe(1.75);
    expect(s.volume).toBe(65);
    expect(s.freeVolume).toBe(40);
    expect(s.today).toBe(0);
    expect(s.byDay).toEqual([{ date: "2026-11-18", cost: 1.75, volume: 25 }, { date: "2026-11-19", cost: 0, volume: 40 }]);
    expect(s.byCategory[0]).toEqual({ category: "MARKETING", label: "Marketing", cost: 1.5, volume: 20 });
    expect(s.byNumber[0]).toEqual({ phone: "1", name: "API Oficial Polos", cost: 1.75, volume: 25 });
  });
});
