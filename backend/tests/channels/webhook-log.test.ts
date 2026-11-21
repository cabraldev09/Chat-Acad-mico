import { describe, expect, it } from "vitest";
import { forgetWebhook, lastWebhook, noteWebhook } from "../../src/channels/WebhookLog";

describe("what the Meta last did at the webhook", () => {
  it("saving the connection forgets a refusal recorded with the old secret", () => {
    noteWebhook(901, "assinatura_invalida", "o App Secret da conexão não é o do app da Meta");
    expect(lastWebhook(901)?.outcome).toBe("assinatura_invalida");
    forgetWebhook(901);
    expect(lastWebhook(901)).toBeNull();
  });

  it("a new delivery after the correction replaces the refusal", () => {
    noteWebhook(902, "assinatura_invalida");
    noteWebhook(902, "recebido", "1 mensagem", 1);
    expect(lastWebhook(902)?.outcome).toBe("recebido");
  });
});
