import { describe, expect, it } from "vitest";

import { cleanOffer, offerAnswer, offerFor, offerIntro, offerTokens, offerValid } from "../../src/services/CampaignServices/Offer";
import { unsafeAnswer } from "../../src/services/CommercialServices/Guards";

describe("campanha de recuperação: a oferta do gestor", () => {
  it("bolsa sobre o preço do curso de cada pessoa; valor fixo para todos; taxa isenta", () => {
    const bolsa = cleanOffer({ monthlyMode: "bolsa", bolsaPct: 40, enrollmentExempt: true, startDate: "2027-02-10", validUntil: "2026-12-15" });
    const v = offerFor(bolsa, 500);
    expect(v.monthly).toBe(300);
    expect(v.text).toEqual({ oferta_mensalidade: "R$ 300,00", oferta_taxa: "isenta", oferta_inicio: "10/02/2027", oferta_prazo: "15/12/2026" });
    // sem curso com preço: o valor fica para o consultor
    expect(offerFor(bolsa, null).monthly).toBe(null);
    const fixo = offerFor(cleanOffer({ monthlyMode: "fixo", monthly: 199.9, enrollmentFee: 99, validUntil: "2026-12-15" }), 800);
    expect(fixo.monthly).toBe(199.9);
    expect(fixo.text.oferta_taxa).toBe("R$ 99,00");
  });
  it("oferta incompleta não sai (cada campo com o seu erro)", () => {
    expect(() => cleanOffer({ monthlyMode: "bolsa", bolsaPct: 0, enrollmentExempt: true, validUntil: "2026-12-15" })).toThrow("ERR_OFFER_BOLSA");
    expect(() => cleanOffer({ monthlyMode: "fixo", monthly: 0, enrollmentExempt: true, validUntil: "2026-12-15" })).toThrow("ERR_OFFER_MONTHLY");
    expect(() => cleanOffer({ monthlyMode: "fixo", monthly: 100, validUntil: "2026-12-15" })).toThrow("ERR_OFFER_FEE");
    expect(() => cleanOffer({ monthlyMode: "fixo", monthly: 100, enrollmentExempt: true })).toThrow("ERR_OFFER_VALID_UNTIL");
    expect(() => cleanOffer(null)).toThrow("ERR_OFFER_INVALID");
  });
  it("vale até o último dia", () => {
    expect(offerValid("2026-12-15", "2026-12-15")).toBe(true);
    expect(offerValid("2026-12-15", "2026-12-16")).toBe(false);
  });
  it("a IA diz só os valores da oferta; qualquer outro valor continua bloqueado", () => {
    const v = offerFor(cleanOffer({ monthlyMode: "bolsa", bolsaPct: 40, enrollmentFee: 50, startDate: "2027-02-10", validUntil: "2026-12-15" }), 500);
    const text = offerAnswer(v);
    expect(text).toMatch(/R\$ 300,00.*R\$ 50,00.*10\/02\/2027.*15\/12\/2026/);
    expect(unsafeAnswer(text, "", offerTokens(v)).unsafe).toBe(false);
    // sem a oferta, o mesmo texto é bloqueado (valor e data sem fonte)
    expect(unsafeAnswer(text, "").unsafe).toBe(true);
    // um valor diferente do da oferta é bloqueado mesmo com a oferta
    expect(unsafeAnswer("A mensalidade fica em R$ 250,00.", "", offerTokens(v)).unsafe).toBe(true);
  });

  it("a primeira resposta depois do modelo de Utilidade já é a oferta, só com os valores dela", () => {
    const v = offerFor(cleanOffer({ monthlyMode: "fixo", monthly: 250, enrollmentExempt: true, validUntil: "2026-12-15" }), null);
    const text = offerIntro(v);
    expect(text).toMatch(/^Que bom falar com você de novo!.*R\$ 250,00.*isenta.*15\/12\/2026/);
    expect(unsafeAnswer(text, "", offerTokens(v)).unsafe).toBe(false);
  });
});
