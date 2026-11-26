import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent, act } from "@testing-library/react";

vi.mock("../services/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock("../errors/toastError", () => ({ default: vi.fn() }));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), info: vi.fn() } }));
vi.mock("../components/ConfirmDialog", () => ({ confirmDialog: vi.fn(() => Promise.resolve(true)) }));

import api from "../services/api";
import { confirmDialog } from "../components/ConfirmDialog";
import StandaloneProposals from "../pages/CRM/StandaloneProposals";

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

const rows = [
  { id: 7, recipientName: "Bia Contato", courseName: "Administração", status: "sent", link: "https://x/p/abc", recipientCpfMasked: "***.***.247-25", recipientPhone: "69999112233" },
  { id: 8, recipientName: "Sem Contato", courseName: "Pedagogia", status: "draft" },
];

describe("propostas avulsas", () => {
  it("lista com o CPF escondido e o telefone, busca pelo servidor e apaga com confirmação", async () => {
    api.get.mockResolvedValue({ data: rows });
    api.delete.mockResolvedValue({ data: {} });
    render(<StandaloneProposals open onClose={() => {}} ctx={{}} />);
    await waitFor(() => expect(screen.getByText("Bia Contato")).toBeTruthy());
    expect(screen.getByText("CPF ***.***.247-25 · (69) 99911-2233")).toBeTruthy();
    // the search goes to the server with the text
    fireEvent.change(screen.getByLabelText("Buscar propostas avulsas"), { target: { value: "529.982" } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/proposals", { params: { standalone: 1, q: "529.982" } }), { timeout: 2000 });
    // delete: asks first, then removes the row
    await act(async () => { fireEvent.click(screen.getByLabelText("Apagar a proposta de Bia Contato")); });
    expect(confirmDialog).toHaveBeenCalled();
    expect(String(confirmDialog.mock.calls[0][0].message)).toMatch(/link que foi enviado deixa de abrir/);
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/proposals/7"));
    await waitFor(() => expect(screen.queryByText("Bia Contato")).toBeNull());
  });

  it("o contato é opcional: só aparece ao marcar", async () => {
    api.get.mockResolvedValue({ data: [] });
    render(<StandaloneProposals open onClose={() => {}} ctx={{}} />);
    await waitFor(() => expect(screen.getByText("Nenhuma proposta avulsa ainda.")).toBeTruthy());
    expect(screen.queryByLabelText("CPF")).toBeNull();
    fireEvent.click(screen.getByLabelText("Informar CPF e telefone (opcional)"));
    expect(screen.getByLabelText("CPF")).toBeTruthy();
    expect(screen.getByLabelText("Telefone com DDD")).toBeTruthy();
  });
});
