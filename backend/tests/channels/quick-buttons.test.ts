import { describe, expect, it } from "vitest";
import { cleanButtons, numberedText, withButtons } from "../../src/helpers/QuickButtons";
import { cleanSteps } from "../../src/helpers/CampaignText";

describe("quick-reply buttons of the bulk sends", () => {
  it("keeps up to 3 short, distinct, non-empty labels", () => {
    expect(cleanButtons(["Sim", " sim ", "", "Não", "Quero falar com alguém agora mesmo", "Depois"])).toEqual(["Sim", "Não", "Quero falar com algu"]);
    expect(cleanButtons("Sim")).toEqual([]);
  });
  it("goes as native choices on the official API and as numbered text on QR", () => {
    const cloud = withButtons("whatsapp_cloud", "Vai renovar?", ["Sim", "Não"]);
    expect(cloud.body).toBe("Vai renovar?");
    expect(cloud.choices).toEqual({ question: "Vai renovar?", options: [{ id: "1", label: "Sim" }, { id: "2", label: "Não" }] });
    const qr = withButtons("whatsapp", "Vai renovar?", ["Sim", "Não"]);
    expect(qr.choices).toBeNull();
    expect(qr.body).toBe(numberedText("Vai renovar?", ["Sim", "Não"]));
    expect(qr.body).toContain("*1* - Sim\n*2* - Não");
    expect(withButtons("whatsapp_cloud", "Oi", [])).toEqual({ body: "Oi", choices: null });
  });
  it("a text step keeps its buttons; a step without them stays as before", () => {
    const [first, second] = cleanSteps([{ body: "Oi", buttons: ["Sim", "Não", "Sim"] }, { body: "Sem botões" }]);
    expect(first.buttons).toEqual(["Sim", "Não"]);
    expect(second.buttons).toBeUndefined();
  });
});
