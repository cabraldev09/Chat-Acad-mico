import { describe, expect, it } from "vitest";
import { movedNotice } from "../../src/services/CampaignServices/TutorReply";

describe("aluno respondeu à campanha da tutoria", () => {
  it("o aluno lê quem continua e de onde, sem número nem sobrenome", () => {
    expect(movedNotice("Pedro Henrique Tutor")).toBe("Pedro, da tutoria, continua o seu atendimento pelo WhatsApp da tutoria. Fique de olho: a mensagem chega de outro número.");
    expect(movedNotice("")).toMatch(/^A tutoria do seu polo continua/);
  });
});
