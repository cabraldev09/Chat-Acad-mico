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
