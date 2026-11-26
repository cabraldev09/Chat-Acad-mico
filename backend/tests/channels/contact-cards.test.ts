import { describe, expect, it } from "vitest";
import { cloudContactsPayload, vcardOf, vcardsOfCloud, vcardsOfWbot, countCards } from "../../src/helpers/ContactCards";
import { previewOf } from "../../src/helpers/MessagePreview";

describe("cartões de contato", () => {
  it("o vCard de uma pessoa tem o nome e o número com waid", () => {
    const card = vcardOf("Maria Souza", "5569999990000");
    expect(card).toBe("BEGIN:VCARD\nVERSION:3.0\nFN:Maria Souza\nTEL;type=CELL;waid=5569999990000:+5569999990000\nEND:VCARD");
    // a line break in the name never breaks the card
    expect(vcardOf("Ana\nPaula", "5569999990001")).toContain("FN:Ana Paula\n");
  });

  it("os contatos que chegam pelo oficial viram vCards, um por pessoa, com todos os números", () => {
    const body = vcardsOfCloud([
      { name: { formatted_name: "João Lima" }, phones: [{ phone: "+55 69 99999-1111", wa_id: "5569999991111" }, { phone: "+55 69 3222-0000" }] },
      { name: { first_name: "Bia", last_name: "Rocha" }, phones: [{ wa_id: "5569988887777" }] }
    ]);
    expect(countCards(body)).toBe(2);
    expect(body).toContain("FN:João Lima");
    expect(body).toContain("waid=5569999991111:+5569999991111");
    expect(body).toContain("TEL;type=CELL:+556932220000");
    expect(body).toContain("FN:Bia Rocha");
    expect(previewOf(body, "vcard")).toBe("👤 2 contatos");
    expect(previewOf(vcardOf("Maria", "5569999990000"), "vcard")).toBe("👤 Maria");
  });

  it("vários contatos do QR (multi_vcard) ficam juntos, um contato só também", () => {
    const a = vcardOf("A", "5569900000001");
    const b = vcardOf("B", "5569900000002");
    expect(countCards(vcardsOfWbot({ type: "multi_vcard", vCards: [a, b] }))).toBe(2);
    expect(vcardsOfWbot({ type: "vcard", body: a, vCards: [a] })).toBe(a);
    expect(vcardsOfWbot({ type: "multi_vcard", vCards: [] })).toBe("");
  });

  it("o envio pelo oficial leva o nome e o número no formato da Meta", () => {
    expect(cloudContactsPayload("Maria Souza", "5569999990000")).toEqual([
      { name: { formatted_name: "Maria Souza", first_name: "Maria" }, phones: [{ phone: "+5569999990000", wa_id: "5569999990000", type: "CELL" }] }
    ]);
  });
});
