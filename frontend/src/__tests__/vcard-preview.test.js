import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../errors/toastError", () => ({ default: vi.fn() }));

import api from "../services/api";
import { AuthContext } from "../context/Auth/AuthContext";
import VcardPreview, { parseVcard } from "../components/VcardPreview";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const card = (tel) => `BEGIN:VCARD\nVERSION:3.0\nN:;Maria Souza;;;\nFN:Maria Souza\n${tel}\nEND:VCARD`;
const mount = (body) => render(
  <MemoryRouter><AuthContext.Provider value={{ user: { id: 1 } }}><VcardPreview vcard={body} /></AuthContext.Provider></MemoryRouter>
);

describe("contato compartilhado", () => {
  it("lê o nome e o número no próprio cartão, com ou sem +, e o waid tem prioridade", () => {
    expect(parseVcard(card("TEL;TYPE=CELL:11999999999"))).toEqual({ name: "Maria Souza", number: "5511999999999" });
    expect(parseVcard(card("TEL;type=CELL;waid=5569993667971:+55 69 99366-7971"))).toEqual({ name: "Maria Souza", number: "5569993667971" });
    expect(parseVcard(card("TEL:+55 (11) 98888-7777"))).toEqual({ name: "Maria Souza", number: "5511988887777" });
    expect(parseVcard("BEGIN:VCARD\nFN:Sem Telefone\nEND:VCARD")).toEqual({ name: "Sem Telefone", number: "" });
  });

  it("mostrar o cartão não cria contato; só ao clicar em Conversar", async () => {
    api.post.mockImplementation((url) => Promise.resolve({ data: url === "/contact" ? { id: 42, name: "Maria Souza", number: "5511999999999" } : { id: 9 } }));
    mount(card("TEL;TYPE=CELL:11999999999"));
    expect(screen.getByText("Maria Souza")).toBeTruthy();
    expect(screen.getByText("+55 11 99999-9999")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 700));
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Conversar"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/contact", { name: "Maria Souza", number: "5511999999999", email: "" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/tickets", { contactId: 42, userId: 1, status: "open" }));
  });

  it("sem número, o botão fica desabilitado e diz por quê", () => {
    mount("BEGIN:VCARD\nFN:Sem Telefone\nEND:VCARD");
    expect(screen.getByText("Sem Telefone")).toBeTruthy();
    expect(screen.getByText("Contato sem telefone no cartão")).toBeTruthy();
    expect(screen.getByText("Conversar").closest("button").disabled).toBe(true);
  });
});

import { parseVcards } from "../components/VcardPreview";

describe("vários contatos numa mensagem", () => {
  it("lê todos os cartões e mostra cada um com o botão Conversar", () => {
    const body = `${card("TEL;waid=5569911110001:+55 69 91111-0001")}\n${card("TEL:+55 69 92222-0002").replace(/Maria Souza/g, "João Lima")}`;
    expect(parseVcards(body)).toEqual([{ name: "Maria Souza", number: "5569911110001" }, { name: "João Lima", number: "5569922220002" }]);
    mount(body);
    expect(screen.getByText("Maria Souza")).toBeTruthy();
    expect(screen.getByText("João Lima")).toBeTruthy();
    expect(screen.getAllByText("Conversar")).toHaveLength(2);
  });
});
