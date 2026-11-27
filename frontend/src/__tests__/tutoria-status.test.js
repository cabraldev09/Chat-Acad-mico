import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@material-ui/core/styles";
import createAppTheme from "../theme";

vi.mock("../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../errors/toastError", () => ({ default: vi.fn() }));
import api from "../services/api";
import { AuthContext } from "../context/Auth/AuthContext";
import Tutoria from "../pages/Tutoria";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ambientação e atrasos na lista dos alunos", () => {
  it("mostra e filtra ambientados e atrasados, sem confundir conclusão com contato atrasado", async () => {
    const common = { checklist: { done: 0, total: 5 }, unread: 0, windowOpen: true };
    api.get.mockImplementation(async path => ({ data: path === "/tutoria/students" ? {
      rules: {}, counters: { total: 3 }, students: [
        { ...common, leadId: 1, name: "Aluno concluído", onboardingStatus: "done" },
        { ...common, leadId: 2, name: "Aluno sem primeiro contato", onboardingStatus: "pending", late: true },
        { ...common, leadId: 3, name: "Aluno sem retorno", onboardingStatus: "done", idle: true, daysWithoutContact: 20 },
      ],
    } : [] }));
    render(<ThemeProvider theme={createAppTheme("light")}><MemoryRouter><AuthContext.Provider value={{ user: { id: 1, role: "tutor", profile: "user" } }}><Tutoria /></AuthContext.Provider></MemoryRouter></ThemeProvider>);
    const done = await screen.findByRole("button", { name: "Ambientados 2" });
    fireEvent.click(done);
    expect(screen.getByText("Aluno concluído")).toBeTruthy();
    expect(screen.getByText("Aluno sem retorno")).toBeTruthy();
    expect(screen.queryByText("Aluno sem primeiro contato")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Atrasados 2" }));
    await waitFor(() => expect(screen.queryByText("Aluno concluído")).toBeNull());
    expect(screen.getByText("Aluno sem primeiro contato")).toBeTruthy();
    expect(screen.getByText("Contato atrasado · há 20 dias")).toBeTruthy();
    expect(screen.getByText("Ambientado")).toBeTruthy();
  });
});
