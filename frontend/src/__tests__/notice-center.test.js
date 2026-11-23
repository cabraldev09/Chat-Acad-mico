import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../services/api", () => ({ default: { get: vi.fn(), put: vi.fn() } }));
vi.mock("../services/socket-io", () => ({ default: () => ({ on: vi.fn(), disconnect: vi.fn() }) }));
vi.mock("react-toastify", () => ({ toast: { info: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

import api from "../services/api";
import { NoticeList, useNotices } from "../components/NotificationCenter";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const Center = () => { const notices = useNotices(); return <NoticeList notices={notices} />; };
const mount = () => render(<MemoryRouter><Center /></MemoryRouter>);

describe("central de avisos (sino)", () => {
  it("mostra os avisos, destaca os não lidos e marca todos como lidos", async () => {
    api.get.mockResolvedValueOnce({ data: { unread: 1, notifications: [
      { id: 1, kind: "proposal_viewed", level: "info", title: "Maria abriu a proposta", body: "Bom momento para falar com o lead.", link: "/crm?lead=3", createdAt: new Date().toISOString(), readAt: null },
      { id: 2, kind: "task_assigned", level: "warning", title: "Nova tarefa: Ligar", createdAt: new Date().toISOString(), readAt: new Date().toISOString() },
    ] } });
    api.put.mockResolvedValue({ data: { updated: 1 } });
    mount();
    await waitFor(() => expect(screen.getByText("Maria abriu a proposta")).toBeTruthy());
    expect(screen.getAllByLabelText("Não lido").length).toBe(1);
    fireEvent.click(screen.getByText("Marcar todos como lidos"));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/notifications/read-all"));
    expect(screen.queryAllByLabelText("Não lido").length).toBe(0);
  });

  it("sem avisos diz o que vai aparecer ali; numa falha oferece tentar de novo", async () => {
    api.get.mockResolvedValueOnce({ data: { unread: 0, notifications: [] } });
    mount();
    await waitFor(() => expect(screen.getByText(/Nenhum aviso por enquanto/)).toBeTruthy());
    cleanup();
    api.get.mockRejectedValueOnce(new Error("rede")).mockResolvedValueOnce({ data: { unread: 0, notifications: [] } });
    mount();
    await waitFor(() => expect(screen.getByText("Tentar de novo")).toBeTruthy());
    fireEvent.click(screen.getByText("Tentar de novo"));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
  });
});
