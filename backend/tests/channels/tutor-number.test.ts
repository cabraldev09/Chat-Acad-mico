import { describe, expect, it } from "vitest";

import { afterHandoffNotice } from "../../src/services/CommercialServices/Notice";
import { sameWhatsapp } from "../../src/services/TicketServices/TutorNumber";

// the official number hands a student to a tutor, who continues on their own WhatsApp
describe("official number → tutor's WhatsApp", () => {
  const base = { queueId: 3, queueName: "Tutoria · Cacoal", userId: 9, userName: "Ana Souza", poloId: 1, poloName: "Cacoal - Centro - RO", fallback: false, within: true, whenText: null };

  it("the student is told who continues and that the message comes from another number", () => {
    const t = afterHandoffNotice({ ...base, moveTo: { whatsappId: 7, whatsappName: "WhatsApp da Ana", tutorId: 9, tutorName: "Ana Souza" } } as any, null)!;
    expect(t).toMatch(/^Ana, da tutoria do polo Cacoal, continua/);
    expect(t).toMatch(/outro número/);
  });

  it("outside the working hours the return time is said too; without a move nothing changes", () => {
    expect(afterHandoffNotice({ ...base, within: false, whenText: "amanhã às 8h", moveTo: { whatsappId: 7, whatsappName: "x", tutorId: 9, tutorName: "Ana" } } as any, null)).toMatch(/amanhã às 8h/);
    expect(afterHandoffNotice(base as any, null)).toBeNull();
  });

  it("the official number and a number by QR Code are both WhatsApp; other channels are not", () => {
    expect(sameWhatsapp("whatsapp_cloud", "whatsapp")).toBe(true);
    expect(sameWhatsapp(null, "whatsapp")).toBe(true);
    expect(sameWhatsapp("whatsapp_cloud", "telegram")).toBe(false);
  });
});
