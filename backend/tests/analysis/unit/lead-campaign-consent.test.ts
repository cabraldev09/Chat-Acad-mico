import { beforeEach, describe, expect, it, vi } from "vitest";

const { findOne, create } = vi.hoisted(() => ({ findOne: vi.fn(), create: vi.fn() }));
vi.mock("../../../src/models/Contact", () => ({ default: { findOne, create } }));

import Contact from "../../../src/models/Contact";
import { recordLeadCampaignConsent } from "../../../src/services/SafetyServices/LeadCampaignConsent";
import { checkCampaignSend } from "../../../src/services/SafetyServices/SendGuard";

describe("consented Lead added to a campaign", () => {
  beforeEach(() => { findOne.mockReset(); create.mockReset(); });

  it("persists the Lead's opt-in as Contact evidence consumed by SendGuard", async () => {
    const consentAt = new Date("2026-11-23T12:00:00Z");
    findOne.mockResolvedValue(null);
    const saved = { id: 8, number: "5511987654321", optOut: false, consentAt, consentSource: "form" };
    create.mockResolvedValue(saved);

    await recordLeadCampaignConsent({ name: "Lead de teste", phone: saved.number, consentAt });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ consentAt, consentSource: "form", optOut: false }));
    expect(await checkCampaignSend({ id: 1, channel: "whatsapp_cloud" } as any, saved as any)).toBeNull();
  });

  it("never replaces an opt-out and SendGuard blocks it even when a Lead has opt-in", async () => {
    const optedOut = { id: 9, optOut: true, consentAt: null, update: vi.fn() };
    findOne.mockResolvedValue(optedOut);
    await recordLeadCampaignConsent({ name: "Lead", phone: "5511987654322", consentAt: new Date() });
    expect(optedOut.update).not.toHaveBeenCalled();
    expect(await checkCampaignSend({ id: 1, channel: "whatsapp_cloud" } as any, optedOut as any)).toMatchObject({ kind: "contact" });
  });
});
