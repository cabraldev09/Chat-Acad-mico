import { beforeEach, describe, expect, it, vi } from "vitest";

// the database rows of one conversation, its consultant and its connection
const state: any = {};
const sent: any[] = [];
const settings: Record<string, string> = {};

vi.mock("../../../src/helpers/AppSettings", () => ({ getSetting: async (k: string, d = "") => (k in settings ? settings[k] : d) }));
vi.mock("../../../src/helpers/BusinessTime", () => ({ getBusinessConfig: async () => null }));
vi.mock("../../../src/services/CommercialServices/Hours", () => ({ nextOpening: () => new Date("2026-11-13T11:00:00Z"), whenText: () => "amanhã às 08:00" }));
vi.mock("../../../src/services/AnalyticsServices/AnalyticsService", () => ({ onScheduleNow: async () => state.duty }));
vi.mock("../../../src/services/AutomationServices/BusinessHours", () => ({ isWithinBusinessHours: () => state.connectionOpen }));
vi.mock("../../../src/services/RelationshipServices/Relationship", () => ({ isRelationshipConnection: async () => false }));
vi.mock("../../../src/models/Ticket", () => ({
  default: { findByPk: async () => state.ticket && { ...state.ticket, update: async (v: any) => Object.assign(state.ticket, v) }, count: async () => 1, update: async () => [1] }
}));
vi.mock("../../../src/models/User", () => ({ default: { findByPk: async (id: number) => ({ id, name: "Gabrielli Souza" }) } }));
vi.mock("../../../src/models/Whatsapp", () => ({ default: { findByPk: async () => ({ id: 1, ownerId: null }) } }));
vi.mock("../../../src/models/Message", () => ({ default: { count: async () => state.answered } }));
vi.mock("../../../src/models/Lead", () => ({ default: { findOne: async () => null } }));
vi.mock("../../../src/models/TicketEvent", () => ({ default: { create: async () => ({}) } }));
vi.mock("../../../src/services/TicketServices/ShowTicketService", () => ({ default: async (id: number) => ({ id }) }));
vi.mock("../../../src/services/WbotServices/SendWhatsAppMessage", () => ({ default: async (p: any) => { sent.push(p); } }));

import { noticeIfOwnerAway } from "../../../src/services/CrmServices/ReturningClient";

describe("cliente que volta ao consultor fora do horário", () => {
  beforeEach(() => {
    sent.length = 0;
    Object.keys(settings).forEach(k => delete settings[k]);
    Object.assign(state, { ticket: { id: 9, userId: 5, status: "open", whatsappId: 1, outOfHoursSentAt: null }, duty: new Set<number>(), connectionOpen: true, answered: 0 });
  });

  it("avisa uma vez quando o consultor está fora da escala, com o primeiro nome e o próximo horário", async () => {
    expect(await noticeIfOwnerAway(9, 5)).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain("Gabrielli está fora do horário");
    expect(sent[0].body).toContain("amanhã às 08:00");
    expect(sent[0].automated).toBe(true);
    // a second message a moment later does not repeat the notice
    expect(await noticeIfOwnerAway(9, 5)).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it("não avisa quando o consultor está na escala e o número dentro do horário", async () => {
    state.duty = new Set([5]);
    expect(await noticeIfOwnerAway(9, 5)).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("avisa quando o número está fora do horário, mesmo sem escala cadastrada", async () => {
    Object.assign(state, { duty: null, connectionOpen: false });
    settings.return_to_owner_away_message = "{consultor} volta {quando}.";
    expect(await noticeIfOwnerAway(9, 5)).toBe(true);
    expect(sent[0].body).toContain("Gabrielli volta amanhã às 08:00.");
  });

  it("não avisa se o consultor já respondeu ou se a conversa mudou de mãos", async () => {
    state.answered = 1;
    expect(await noticeIfOwnerAway(9, 5)).toBe(false);
    state.answered = 0;
    state.ticket.userId = 7;
    expect(await noticeIfOwnerAway(9, 5)).toBe(false);
    expect(sent).toHaveLength(0);
  });
});
