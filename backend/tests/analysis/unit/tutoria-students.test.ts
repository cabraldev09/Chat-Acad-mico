import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/database", () => ({ default: {} }));
vi.mock("../../../src/services/ChannelServices/ConnectionTeam", () => ({ TUTORIA_SEGMENTS: ["onboarding", "support"], connectionOfTeam: async () => null }));
vi.mock("../../../src/services/TicketServices/OpeningTemplate", () => ({ openingTemplateOf: async () => null }));

import { studentState } from "../../../src/services/TutoriaServices/Students";

const DAY = 86400000;
const now = Date.UTC(2026, 10, 12, 12);
const ago = (days: number) => new Date(now - days * DAY);
const facts = (over: any = {}) => ({ ticketId: 1, status: "open", unread: 0, lastIn: null, lastOut: null, callAt: null, callNote: null, ...over });
const rules = { slaHours: 24, idleDays: 15, official: true };

describe("situação do aluno no painel do tutor", () => {
  it("primeiro contato atrasado só na ambientação pendente, passado o prazo", () => {
    expect(studentState({ onboardingStatus: "pending", enrolledAt: ago(2) }, facts(), rules, now).late).toBe(true);
    expect(studentState({ onboardingStatus: "pending", enrolledAt: ago(0.5) }, facts(), rules, now).late).toBe(false);
    expect(studentState({ onboardingStatus: "started", enrolledAt: ago(2) }, facts(), rules, now).late).toBe(false);
  });

  it("sem contato conta da última mensagem (de qualquer lado) e não vale para quem ainda nem foi contatado", () => {
    const s = studentState({ onboardingStatus: "done", enrolledAt: ago(60) }, facts({ lastIn: ago(20), lastOut: ago(16) }), rules, now);
    expect(s.daysWithoutContact).toBe(16);
    expect(s.idle).toBe(true);
    expect(studentState({ onboardingStatus: "done", enrolledAt: ago(60) }, facts({ lastOut: ago(3) }), rules, now).idle).toBe(false);
    expect(studentState({ onboardingStatus: "pending", enrolledAt: ago(30) }, facts(), rules, now).idle).toBe(false);
  });

  it("chamado do comercial fica pendente até a tutoria responder depois dele", () => {
    expect(studentState({ onboardingStatus: "done", enrolledAt: ago(60) }, facts({ callAt: ago(1), lastOut: ago(2) }), rules, now).callPending).toBe(true);
    expect(studentState({ onboardingStatus: "done", enrolledAt: ago(60) }, facts({ callAt: ago(1), lastOut: ago(0.5) }), rules, now).callPending).toBe(false);
  });

  it("a janela de 24h só existe no número oficial", () => {
    expect(studentState({ onboardingStatus: "done", enrolledAt: ago(60) }, facts({ lastIn: ago(0.5) }), rules, now).windowOpen).toBe(true);
    expect(studentState({ onboardingStatus: "done", enrolledAt: ago(60) }, facts({ lastIn: ago(2) }), rules, now).windowOpen).toBe(false);
    expect(studentState({ onboardingStatus: "done", enrolledAt: ago(60) }, facts(), { ...rules, official: false }, now).windowOpen).toBe(true);
  });
});
