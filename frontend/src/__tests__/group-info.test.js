import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route } from "react-router-dom";

vi.mock("../services/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock("../errors/toastError", () => ({ default: vi.fn() }));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn() } }));

import api from "../services/api";
import GroupInfo from "../components/GroupInfo";
import { AuthContext } from "../context/Auth/AuthContext";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const mount = () => render(
  <AuthContext.Provider value={{ user: { id: 5 } }}>
    <MemoryRouter initialEntries={["/tickets/9"]}>
      <Route path="/tickets/:ticketId"><GroupInfo /></Route>
      <Route path="/tickets/77" render={() => <div>conversa aberta</div>} />
    </MemoryRouter>
  </AuthContext.Provider>
);

describe("participantes do grupo", () => {
  it("lista criador e admins, esconde a LID e abre a conversa particular", async () => {
    api.get.mockResolvedValue({ data: { participants: [
      { id: "1", name: "Adriele Tutora", number: "5569911110001", isAdmin: true, isSuperAdmin: true, contactId: 10 },
      { id: "88001122334455", name: "Pedro", number: null, isAdmin: false, contactId: null },
      { id: "3", name: null, number: "5569911110003", isAdmin: false, contactId: null },
    ] } });
    api.post.mockImplementation((url) => Promise.resolve({ data: url === "/contact" ? { id: 33 } : { id: 77 } }));
    mount();
    await waitFor(() => expect(screen.getByText("Adriele Tutora")).toBeTruthy());
    expect(screen.getByText("criador")).toBeTruthy();
    expect(screen.getByText("Número oculto pelo WhatsApp")).toBeTruthy();
    // the participant whose number WhatsApp hides cannot be reached outside the group
    expect(screen.queryByLabelText("Conversar com Pedro")).toBeNull();
    // someone not yet in the system is registered with the phone and the conversation opens
    fireEvent.click(screen.getByLabelText("Conversar com +55 69 91111-0003"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/tickets", { contactId: 33, userId: 5, status: "open" }));
    expect(api.post).toHaveBeenCalledWith("/contact", { name: "+55 69 91111-0003", number: "5569911110003", email: "" });
    // a known contact goes straight to the conversation
    fireEvent.click(screen.getByLabelText("Conversar com Adriele Tutora"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/tickets", { contactId: 10, userId: 5, status: "open" }));
  });
});
