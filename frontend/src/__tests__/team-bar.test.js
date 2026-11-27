import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
vi.mock("../services/api", () => ({ default: { get: vi.fn() } }));
import api from "../services/api";
import TeamBar from "../components/TeamBar";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("janela oficial pertence à conversa aberta", () => {
  it("uma resposta atrasada de outro número não põe o aviso de 24h na conversa por QR", async () => {
    let finishOfficial;
    api.get.mockImplementation(path => path.includes("/1/")
      ? new Promise(resolve => { finishOfficial = resolve; })
      : Promise.resolve({ data: { window: { official: false, open: true } } }));
    const { rerender } = render(<TeamBar ticket={{ id: 1, userId: 3, status: "open" }} />);
    rerender(<TeamBar ticket={{ id: 2, userId: 3, status: "open" }} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/tickets/2/team-handoff"));
    await act(async () => { finishOfficial({ data: { window: { official: true, open: false, never: true } } }); });
    expect(screen.queryByText(/Esta pessoa ainda não escreveu/)).toBeNull();
  });
});
