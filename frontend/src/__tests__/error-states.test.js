import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup, waitFor, act } from "@testing-library/react";

vi.mock("../services/api", () => ({ default: { get: vi.fn() } }));
vi.mock("../errors/toastError", () => ({ default: vi.fn() }));

import api from "../services/api";
import { ErrorState } from "../components/ui";
import useTickets from "../hooks/useTickets";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("ErrorState", () => {
  it("diz que falhou e oferece tentar de novo", () => {
    const retry = vi.fn();
    render(<ErrorState title="Não foi possível carregar as conversas." onRetry={retry} />);
    expect(screen.getByRole("alert").textContent).toContain("Não foi possível carregar as conversas.");
    fireEvent.click(screen.getByText("Tentar de novo"));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

const Probe = ({ onState }) => { onState(useTickets({ pageNumber: 1, status: "open" })); return null; };

describe("useTickets", () => {
  it("separa a falha da lista vazia e busca de novo ao tentar de novo", async () => {
    let state;
    api.get.mockRejectedValueOnce(new Error("rede")).mockResolvedValueOnce({ data: { tickets: [{ id: 1 }], hasMore: false, count: 1 } });
    render(<Probe onState={(s) => { state = s; }} />);
    await waitFor(() => expect(state.error).toBe(true), { timeout: 3000 });
    expect(state.tickets).toEqual([]);
    act(() => state.retry());
    await waitFor(() => expect(state.tickets).toEqual([{ id: 1 }]), { timeout: 3000 });
    expect(state.error).toBe(false);
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
