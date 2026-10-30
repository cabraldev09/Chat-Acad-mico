import { describe, it, expect } from "vitest";
import { aliasMessage, brazilWithNinthDigit, failureOf, messageIdOf, recipientOf, rememberRecipient, sendToRecipient } from "../../src/channels/CloudRecipient";

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
      sendToRecipient("556984445555", async to => {
        sent.push(to);
        throw refused(190);
      })
    ).rejects.toThrow();
    expect(sent).toEqual(["556984445555"]);
    expect(await sendToRecipient("5569992283812", async to => to)).toBe("5569992283812");
    await expect(sendToRecipient("15556501482", async () => Promise.reject(refused(131030)))).rejects.toThrow();
  });
});

describe("aviso de falha da Meta depois do envio", () => {
  it("fora da lista permitida, sem o 9: envia de novo com o 9", () => {
    const f = failureOf({ status: "failed", recipient_id: "556992283812", errors: [{ code: 131030, title: "Recipient phone number not in allowed list", error_data: { details: "Recipient phone number not in allowed list" } }] });
    expect(f.code).toBe(131030);
    expect(f.retryTo).toBe("5569992283812");
    expect(f.text).toContain("not in allowed list");
  });

  it("com o 9 ou outro erro: só mostra, não reenvia", () => {
    expect(failureOf({ recipient_id: "5569992283812", errors: [{ code: 131030 }] }).retryTo).toBeNull();
    expect(failureOf({ recipient_id: "556992283812", errors: [{ code: 131047, title: "Re-engagement message" }] }).retryTo).toBeNull();
    expect(failureOf({}).code).toBe(0);
  });

  it("o número que precisou do 9 já sai com o 9 nas próximas mensagens", async () => {
    const sent: string[] = [];
    const post = async (to: string) => {
      sent.push(to);
      if (to === "556981112222") throw refused(131030);
      return to;
    };
    await sendToRecipient("556981112222", post);
    await sendToRecipient("556981112222", post);
    expect(sent).toEqual(["556981112222", "5569981112222", "5569981112222"]);
    rememberRecipient("556970001111", "5569970001111");
    expect(recipientOf("556970001111")).toBe("5569970001111");
  });

  it("os tiques do reenvio caem na mensagem original", () => {
    aliasMessage("wamid.novo", "wamid.velho");
    expect(messageIdOf("wamid.novo")).toBe("wamid.velho");
    expect(messageIdOf("wamid.outro")).toBe("wamid.outro");
  });
});
