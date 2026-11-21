import { describe, expect, it, vi } from "vitest";

const affiliates = [{ id: 1, name: "Rosa", phone: "(69) 99325-8103", ownerId: 7, status: "active" }];
vi.mock("../../src/models/Affiliate", () => ({ default: { findAll: async () => affiliates } }));
vi.mock("../../src/helpers/AppSettings", () => ({ getSetting: async (_k: string, d: string) => d }));

import { findAffiliateByPhone } from "../../src/services/AffiliateServices/AffiliateLane";
import { cardText, peopleOfCloudContacts } from "../../src/helpers/CloudContacts";
import { normalizeBusiness, standardWeek } from "../../src/helpers/BusinessTime";

describe("afiliado no número oficial", () => {
  it("reconhece o afiliado com e sem o nono dígito (a API oficial costuma mandar sem)", async () => {
    expect((await findAffiliateByPhone("5569993258103"))?.id).toBe(1);
    expect((await findAffiliateByPhone("556993258103"))?.id).toBe(1);
    expect(await findAffiliateByPhone("5569900000000")).toBeNull();
  });
  it("lê o cartão de contato da API oficial: nome e números de cada pessoa", () => {
    const people = peopleOfCloudContacts([
      { name: { formatted_name: "Ana Souza" }, phones: [{ phone: "+55 69 99999-1111", wa_id: "5569999991111" }] },
      { name: { first_name: "Bruno", last_name: "Lima" }, phones: [{ phone: "+55 (69) 98888-2222" }] },
      { name: { formatted_name: "Sem número" }, phones: [] }
    ]);
    expect(people).toEqual([{ name: "Ana Souza", number: "5569999991111" }, { name: "Bruno Lima", number: "5569988882222" }]);
    expect(cardText(people)).toBe("Contato compartilhado: Ana Souza (5569999991111), Bruno Lima (5569988882222)");
    expect(cardText([])).toBe("[contato]");
  });
});

describe("semana padrão do time", () => {
  it("segunda a quinta das 08h às 18h, sexta até as 17h, sem fim de semana", () => {
    const w = standardWeek();
    ["1", "2", "3", "4"].forEach(d => expect(w[d]).toEqual([{ start: "08:00", end: "18:00" }]));
    expect(w["5"]).toEqual([{ start: "08:00", end: "17:00" }]);
    expect(w["6"]).toEqual([]);
    expect(w["0"]).toEqual([]);
  });
  it("um dia que não veio salvo usa a semana padrão", () => {
    const b = normalizeBusiness({ enabled: true, days: { "1": [{ start: "09:00", end: "18:00" }] } });
    expect(b.days["1"]).toEqual([{ start: "09:00", end: "18:00" }]);
    expect(b.days["5"]).toEqual([{ start: "08:00", end: "17:00" }]);
    expect(b.days["6"]).toEqual([]);
  });
});
