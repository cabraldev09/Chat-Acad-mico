import { describe, it, expect } from "vitest";
import { cleanConnectionIds, connectionsOf } from "../../src/helpers/AgentConnections";

describe("conexões de um agente de IA", () => {
  it("junta a conexão antiga com a lista, sem repetir", () => {
    expect(connectionsOf({ whatsappId: 3, whatsappIds: [3, 7] })).toEqual([3, 7]);
    expect(connectionsOf({ whatsappId: null, whatsappIds: [7] })).toEqual([7]);
    expect(connectionsOf({ whatsappId: 4 })).toEqual([4]);
  });

  it("sem nenhuma conexão marcada, o agente atende as que ninguém reivindicou", () => {
    expect(connectionsOf({})).toEqual([]);
    expect(connectionsOf({ whatsappId: null, whatsappIds: [] })).toEqual([]);
  });

  it("aceita só números inteiros positivos, também quando a lista vem como texto", () => {
    expect(cleanConnectionIds(["7", 8, "x", 0, -1, 2.5, null])).toEqual([7, 8]);
    expect(cleanConnectionIds("[5, 6]")).toEqual([5, 6]);
    expect(cleanConnectionIds("lixo")).toEqual([]);
    expect(cleanConnectionIds(undefined)).toEqual([]);
  });
});

import { describeCloudBody, lastWebhook, lastWebhookCheck, noteWebhook } from "../../src/channels/WebhookLog";

describe("o que a Meta mandou por último para a conexão", () => {
  it("conta mensagens e avisos de entrega de uma chamada da API oficial", () => {
    const body = { entry: [{ changes: [{ value: { messages: [{ id: "a" }], statuses: [{ id: "b" }, { id: "c" }] } }] }] };
    expect(describeCloudBody(body)).toEqual({ text: "1 mensagem e 2 avisos de entrega", messages: 1 });
    expect(describeCloudBody({ entry: [] })).toEqual({ text: "sem mensagens", messages: 0 });
    expect(describeCloudBody(undefined).messages).toBe(0);
  });

  it("guarda o resultado da última chamada por conexão", () => {
    expect(lastWebhook(991)).toBeNull();
    noteWebhook(991, "recebido", "1 mensagem", 1);
    noteWebhook(991, "assinatura_invalida", "o App Secret não confere");
    expect(lastWebhook(991)?.outcome).toBe("assinatura_invalida");
    expect(lastWebhook(992)).toBeNull();
  });

  it("uma verificação do endereço não esconde a última mensagem recebida", () => {
    noteWebhook(993, "recebido", "1 mensagem", 1);
    noteWebhook(993, "verificacao_recusada", "o Verify Token é diferente");
    expect(lastWebhook(993)?.outcome).toBe("recebido");
    expect(lastWebhookCheck(993)?.outcome).toBe("verificacao_recusada");
  });
});
