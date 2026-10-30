import { describe, it, expect } from "vitest";
import { brazilWithNinthDigit, sendToRecipient } from "../../src/channels/CloudRecipient";

const refused = (code: number) => Object.assign(new Error("meta"), { response: { data: { error: { code } } } });

describe("destinatário da API oficial do WhatsApp", () => {
  it("põe o 9 de volta só em celular brasileiro que veio sem ele", () => {
    expect(brazilWithNinthDigit("556992283812")).toBe("5569992283812");
    expect(brazilWithNinthDigit("+55 (69) 9228-3812")).toBe("5569992283812");
    expect(brazilWithNinthDigit("5569992283812")).toBeNull();
    expect(brazilWithNinthDigit("556932283812")).toBeNull();
    expect(brazilWithNinthDigit("15556501482")).toBeNull();
    expect(brazilWithNinthDigit("")).toBeNull();
  });

  it("recusado por não estar na lista permitida, envia de novo com o 9", async () => {
    const sent: string[] = [];
    const out = await sendToRecipient("556992283812", async to => {
      sent.push(to);
      if (to === "556992283812") throw refused(131030);
      return "ok";
    });
    expect(out).toBe("ok");
    expect(sent).toEqual(["556992283812", "5569992283812"]);
  });

  it("outros erros e números que já funcionam não são reenviados", async () => {
    const sent: string[] = [];
    await expect(
      sendToRecipient("556992283812", async to => {
        sent.push(to);
        throw refused(190);
      })
    ).rejects.toThrow();
    expect(sent).toEqual(["556992283812"]);
    expect(await sendToRecipient("5569992283812", async to => to)).toBe("5569992283812");
    await expect(sendToRecipient("15556501482", async () => Promise.reject(refused(131030)))).rejects.toThrow();
  });
});
