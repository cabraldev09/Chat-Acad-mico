import { describe, expect, it } from "vitest";

import { normalizePairingPhone } from "../../src/helpers/PairingPhone";
import { openConfig, sealConfig, maskConfig, mergeConfig } from "../../src/helpers/Secrets";
import { readState, signState } from "../../src/helpers/MetaApp";

describe("the number typed to receive the WhatsApp pairing code", () => {
  it("accepts a Brazilian number with or without the country code and ignores punctuation", () => {
    expect(normalizePairingPhone("(69) 99999-1234")).toBe("5569999991234");
    expect(normalizePairingPhone("+55 69 99999-1234")).toBe("5569999991234");
    expect(normalizePairingPhone("5569999991234")).toBe("5569999991234");
  });
  it("refuses what cannot be a phone", () => {
    expect(normalizePairingPhone("123")).toBeNull();
    expect(normalizePairingPhone("abc")).toBeNull();
    expect(normalizePairingPhone("")).toBeNull();
  });
});

describe("channel credentials at rest", () => {
  const plain = JSON.stringify({ accessToken: "TOKEN-123456", appSecret: "SECRET-654321", phoneNumberId: "PN1" });

  it("seals the secrets and leaves the rest readable", () => {
    const sealed = JSON.parse(sealConfig(plain) as string);
    expect(sealed.accessToken.startsWith("enc:v1:")).toBe(true);
    expect(sealed.appSecret.startsWith("enc:v1:")).toBe(true);
    expect(sealed.phoneNumberId).toBe("PN1");
  });
  it("opens them back, and sealing twice does not seal a sealed value again", () => {
    const once = sealConfig(plain) as string;
    const twice = sealConfig(once) as string;
    expect(twice).toBe(once);
    expect(openConfig(JSON.parse(twice))).toMatchObject({ accessToken: "TOKEN-123456", appSecret: "SECRET-654321" });
  });
  it("masks with the real last characters and keeps the stored secret when the mask comes back", () => {
    const sealed = sealConfig(plain) as string;
    const shown = JSON.parse(maskConfig(sealed) as string);
    expect(shown.accessToken).toBe("••••3456");
    const merged = JSON.parse(openConfigText(mergeConfig(sealed, JSON.stringify({ ...shown, phoneNumberId: "PN2" }))));
    expect(merged.accessToken).toBe("TOKEN-123456");
    expect(merged.phoneNumberId).toBe("PN2");
  });
});

const openConfigText = (config: string): string => JSON.stringify(openConfig(JSON.parse(config)));

describe("the state that goes to Instagram and comes back", () => {
  it("returns who is connecting, signed", () => {
    const state = readState(signState(7, 12));
    expect(state).toMatchObject({ userId: 7, whatsappId: 12 });
  });
  it("refuses a forged, tampered or expired state", () => {
    const [payload] = signState(7, null).split(".");
    expect(readState(`${payload}.assinatura`)).toBeNull();
    const other = signState(8, null).split(".")[0];
    expect(readState(`${other}.${signState(7, null).split(".")[1]}`)).toBeNull();
    expect(readState(signState(7, null, -1000))).toBeNull();
    expect(readState("")).toBeNull();
  });
});

import { forChannel } from "../../src/helpers/ChannelText";
import { unsupportedFact } from "../../src/services/CommercialServices/Guards";

describe("text for the channel", () => {
  it("takes the WhatsApp marks out for Instagram and Messenger and leaves WhatsApp alone", () => {
    expect(forChannel("O curso é *100% online* e _flexível_.", "instagram")).toBe("O curso é 100% online e flexível.");
    expect(forChannel("Veja *isto*", "messenger")).toBe("Veja isto");
    expect(forChannel("O curso é *100% online*", "whatsapp")).toBe("O curso é *100% online*");
    expect(forChannel("2 * 3 = 6", "instagram")).toBe("2 * 3 = 6");
  });
});

describe("facts an agent may say", () => {
  const evidence = "Mensalidade 1299.00. Bolsa de 40% na primeira mensalidade. Atendimento das 8h às 18h. Matrícula até 20/07.";
  it("lets through what the tools or the base returned, even written another way", () => {
    expect(unsupportedFact("A mensalidade é R$ 1.299,00 com bolsa de 40%.", evidence)).toBeNull();
    expect(unsupportedFact("Atendemos das 8h às 18h e a matrícula vai até 20/07.", evidence)).toBeNull();
  });
  it("flags an amount, a percentage, a date or an hour with no source", () => {
    expect(unsupportedFact("A taxa é R$ 480,00.", evidence)).toMatch(/480/);
    expect(unsupportedFact("Você ganha 70% de desconto.", evidence)).toMatch(/70/);
    expect(unsupportedFact("As aulas começam em 03/08.", evidence)).toMatch(/03\/08/);
    expect(unsupportedFact("Falamos às 22h.", evidence)).toMatch(/22h/);
  });
  it("accepts what the person wrote themselves when it is part of the evidence", () => {
    expect(unsupportedFact("Combinado, amanhã às 14h.", `${evidence}\namanhã às 14h`)).toBeNull();
  });
});
