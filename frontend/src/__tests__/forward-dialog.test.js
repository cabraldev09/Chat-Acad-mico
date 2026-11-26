import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@material-ui/core/styles";

vi.mock("../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../errors/toastError", () => ({ default: vi.fn() }));
vi.mock("../utils/forwardProgress", () => ({ trackForward: vi.fn() }));

import api from "../services/api";
import ForwardDialog from "../components/chat/ForwardDialog";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const theme = createTheme();
const targets = {
  tickets: [
    { id: 1, name: "Ana Aberta", queueName: "Comercial", connectionName: "QR", waiting: false, windowClosed: false },
    { id: 2, name: "Bruno Aguardando", queueName: "Comercial", connectionName: "QR", waiting: true, windowClosed: false },
    { id: 3, name: "Carla Oficial", queueName: "Comercial", connectionName: "Oficial", waiting: false, windowClosed: true },
  ],
  contacts: [{ id: 50, name: "Davi Sem Conversa", number: "5569911112222" }],
  hasMore: false,
};
const mount = () => render(<ThemeProvider theme={theme}><ForwardDialog open onClose={() => {}} message={{ id: "m1" }} fromTicketId={9} /></ThemeProvider>);

describe("encaminhar", () => {
  it("fora da janela de 24 h não dá para escolher; aguardando pede confirmação; contato sem conversa entra", async () => {
    api.get.mockResolvedValue({ data: targets });
    api.post.mockResolvedValue({ data: { batchId: "b", total: 2 } });
    mount();
    await waitFor(() => expect(screen.getByText("Ana Aberta")).toBeTruthy());
    expect(api.get).toHaveBeenCalledWith("/forward/targets", { params: { q: "", page: 1 } });
    expect(screen.getByText("Fora da janela de 24 h do número oficial")).toBeTruthy();
    expect(screen.getByLabelText("Carla Oficial").disabled).toBe(true);
    fireEvent.click(screen.getByText("Carla Oficial"));
    fireEvent.click(screen.getByText("Bruno Aguardando"));
    fireEvent.click(screen.getByText("Davi Sem Conversa"));
    fireEvent.click(screen.getByText("Encaminhar (2)"));
    // nothing goes before the confirmation
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByText(/você assume 1 conversa que está aguardando/)).toBeTruthy();
    fireEvent.click(screen.getByText("Assumir e encaminhar"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/messages/forward-batch", { messageIds: ["m1"], ticketIds: [2], contactIds: [50], confirmAssume: true }));
  });

  it("a busca vai para o servidor", async () => {
    api.get.mockResolvedValue({ data: { tickets: [], contacts: [], hasMore: false } });
    mount();
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Buscar conversa ou contato"), { target: { value: "davi" } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/forward/targets", { params: { q: "davi", page: 1 } }), { timeout: 2000 });
    expect(screen.getByText("Nenhuma conversa ou contato com esse nome ou número.")).toBeTruthy();
  });

});
