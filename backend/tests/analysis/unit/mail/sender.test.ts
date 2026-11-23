import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/helpers/AppSettings", () => ({ getSetting: async (_k: string, fallback = "") => fallback, setSetting: async () => undefined }));

// two universities: the default (no sender of its own) and the north one (its own name and address)
const unis: Record<number, any> = {
  1: { id: 1, name: "Cruzeiro do Sul Virtual", shortName: null, isDefault: true, mailFromName: null, mailFrom: null },
  2: { id: 2, name: "Universidade Norte", shortName: "Norte", isDefault: false, mailFromName: "Universidade Norte", mailFrom: "contato@norte.edu.br" }
};
const leads: Record<number, number> = { 10: 2, 11: 1 };
let current: number | null = null;
vi.mock("../../../../src/helpers/Institution", () => ({
  currentInstitutionId: () => current,
  institutionFor: async (ctx: any) => unis[ctx.leadId ? leads[ctx.leadId] : ctx.institutionId] || unis[1]
}));

import { MailConfig, senderFor } from "../../../../src/services/MailServices/SendMail";

const cfg = (over: Partial<MailConfig> = {}): MailConfig => ({
  provider: "resend", host: "", port: 465, secure: true, user: "conta@gmail.com", pass: "", fromName: "Cruzeiro do Sul Virtual",
  resendKey: "re_test", fromEmail: "nao-responda@mail.cruzeiro.test", replyTo: "", ...over
});

describe("remetente por universidade", () => {
  it("e-mail sobre um lead da universidade Norte sai com o nome e o endereço dela", async () => {
    const out = await senderFor(cfg(), { leadId: 10 });
    expect(out.fromName).toBe("Universidade Norte");
    expect(out.fromEmail).toBe("contato@norte.edu.br");
  });

  it("lead da universidade padrão e e-mail sem lead mantêm o remetente de Configurações", async () => {
    expect(await senderFor(cfg(), { leadId: 11 })).toEqual(cfg());
    expect(await senderFor(cfg(), {})).toEqual(cfg());
  });

  it("no SMTP só o nome muda (o endereço é o da conta)", async () => {
    const out = await senderFor(cfg({ provider: "smtp" }), { leadId: 10 });
    expect(out.fromName).toBe("Universidade Norte");
    expect(out.fromEmail).toBe("nao-responda@mail.cruzeiro.test");
  });

  it("dentro de uma conversa da universidade Norte, sem lead, usa a universidade da conversa", async () => {
    current = 2;
    try {
      expect((await senderFor(cfg(), {})).fromName).toBe("Universidade Norte");
    } finally {
      current = null;
    }
  });
});
