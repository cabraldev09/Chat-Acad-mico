import { describe, expect, it } from "vitest";

import { keepPendingAck, takePendingAck } from "../../src/helpers/PendingAcks";

describe("o sinal de enviado que chega antes da mensagem ser gravada", () => {
  it("fica guardado e vale quando a mensagem é gravada (uma vez)", () => {
    keepPendingAck("msg-a", 1, 1000);
    keepPendingAck("msg-a", 2, 1100);
    // só para frente
    keepPendingAck("msg-a", 1, 1200);
    expect(takePendingAck("msg-a", 1300)).toBe(2);
    expect(takePendingAck("msg-a", 1400)).toBe(null);
  });
  it("uma falha (-1) sempre vale; um sinal velho demais não vale", () => {
    keepPendingAck("msg-b", 2, 0);
    keepPendingAck("msg-b", -1, 10);
    expect(takePendingAck("msg-b", 20)).toBe(-1);
    keepPendingAck("msg-c", 1, 0);
    expect(takePendingAck("msg-c", 6 * 60 * 1000)).toBe(null);
    expect(takePendingAck(null)).toBe(null);
  });
});
