import { describe, expect, it } from "vitest";

import { forwardUnavailable } from "../../src/providers/WhatsApp/ForwardFallback";

describe("encaminhar entre conversas do mesmo número por QR Code", () => {
  it("o módulo de encaminhar que sumiu do WhatsApp Web não enviou nada: a cópia vai pelo envio comum", () => {
    // o erro real do servidor ao encaminhar um vídeo para um grupo (26/11, 17:49 PVH)
    expect(forwardUnavailable(new TypeError("Evaluation failed: TypeError: Cannot read properties of undefined (reading 'forwardMessages')"))).toBe(true);
    expect(forwardUnavailable(new Error("forwardMessages is not a function"))).toBe(true);
  });
  it("um prazo esgotado ou a página perdida pode ter enviado: continua incerto (não envia de novo)", () => {
    expect(forwardUnavailable(new Error("timeout"))).toBe(false);
    expect(forwardUnavailable(new Error("Protocol error: Target closed"))).toBe(false);
    expect(forwardUnavailable(null)).toBe(false);
  });
});
