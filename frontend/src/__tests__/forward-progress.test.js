import { describe, expect, it, vi } from "vitest";

vi.mock("../services/api", () => ({ default: { post: vi.fn() } }));
vi.mock("../services/socket-io", () => ({ default: () => ({ on: () => {}, disconnect: () => {} }) }));

import { failureLines } from "../utils/forwardProgress";

describe("aviso do encaminhamento", () => {
  it("o aviso final diz o motivo de cada um", () => {
    const lines = failureLines([
      { messageId: "a", ticketId: 1, reason: "ERR_MESSAGING_WINDOW_CLOSED", name: "Ana" },
      { messageId: "a", ticketId: 2, reason: "ERR_MESSAGING_WINDOW_CLOSED", name: "Bia" },
      { messageId: "a", ticketId: 3, reason: "ERR_CONTACT_OPTED_OUT", name: "Caio" },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0].startsWith("Ana, Bia: ")).toBe(true);
    expect(lines[1].startsWith("Caio: ")).toBe(true);
  });
});
