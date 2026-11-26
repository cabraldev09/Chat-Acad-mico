import { describe, expect, it } from "vitest";
import { forgottenNotice, howLong, slaDecision } from "../../src/services/NotificationServices/SlaRules";

const now = new Date("2026-11-26T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3600000);

describe("SLA alert rules", () => {
  it("says the wait in plain words", () => {
    expect(howLong(45)).toBe("45 min");
    expect(howLong(130)).toBe("2 h 10 min");
    expect(howLong(120)).toBe("2 h");
    expect(howLong(28857)).toBe("20 dias");
    expect(howLong(1500)).toBe("1 dia");
  });

  it("a closing message, a sticker or a reaction needs no answer", () => {
    const first = { body: "Qual o valor?", createdAt: ago(1) };
    expect(slaDecision({ body: "Obrigado!", mediaType: "chat", createdAt: ago(0.5) }, first, now, 24)).toBe("closing");
    expect(slaDecision({ body: "Blz", mediaType: "chat", createdAt: ago(0.5) }, first, now, 24)).toBe("closing");
    expect(slaDecision({ body: "", mediaType: "sticker", createdAt: ago(0.5) }, first, now, 24)).toBe("closing");
    expect(slaDecision({ body: "", mediaType: "reaction", createdAt: ago(0.5) }, first, now, 24)).toBe("closing");
  });

  it("a question still waits, even a short one", () => {
    const first = { body: "Oi", createdAt: ago(1) };
    expect(slaDecision({ body: "Ok?", mediaType: "chat", createdAt: ago(0.5) }, first, now, 24)).toBe("alert");
    expect(slaDecision({ body: "ok, e o valor?", mediaType: "chat", createdAt: ago(0.5) }, first, now, 24)).toBe("alert");
    expect(slaDecision({ body: "Obrigado", mediaType: "image", createdAt: ago(0.5) }, first, now, 24)).toBe("alert");
  });

  it("a wait that started days ago is not an alert", () => {
    const last = { body: "Tenho uma dúvida", mediaType: "chat", createdAt: ago(480) };
    expect(slaDecision(last, last, now, 24)).toBe("old");
    expect(slaDecision(last, { ...last, createdAt: ago(2) }, now, 24)).toBe("alert");
    // 0 turns the limit off
    expect(slaDecision(last, last, now, 0)).toBe("alert");
  });

  it("the daily line counts the conversations", () => {
    expect(forgottenNotice(1).title).toBe("1 conversa esquecida");
    expect(forgottenNotice(7).title).toBe("7 conversas esquecidas");
  });
});
