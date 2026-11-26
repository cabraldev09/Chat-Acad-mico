import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@material-ui/core/styles";

vi.mock("../services/socket-io", () => ({ default: () => ({ on: () => {}, off: () => {}, emit: () => {}, disconnect: () => {} }) }));
vi.mock("../services/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock("../errors/toastError", () => ({ default: vi.fn() }));

import api from "../services/api";
import MessagesList from "../components/MessagesList";
import { AuthContext } from "../context/Auth/AuthContext";
import { ReplyMessageProvider } from "../context/ReplyingMessage/ReplyingMessageContext";

if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const at = (min) => new Date(Date.UTC(2026, 10, 26, 14, min)).toISOString();
const person = (id, name) => ({ id, name, number: `55699000000${id}` });
const msg = (id, contact, extra = {}) => ({ id: `m${id}`, ticketId: 9, fromMe: false, read: true, ack: 0, mediaType: "chat", body: `texto ${id}`, createdAt: at(id), contactId: contact ? contact.id : null, contact, ...extra });

const theme = createTheme({ scrollbarStyles: {} });
const mount = (messages, isGroup = true) => {
  api.get.mockResolvedValue({ data: { messages, hasMore: false, count: messages.length } });
  return render(<ThemeProvider theme={theme}><AuthContext.Provider value={{ user: { id: 1, name: "Eu", profile: "admin", queues: [] } }}><ReplyMessageProvider><MessagesList ticketId={9} isGroup={isGroup} channel="whatsapp" /></ReplyMessageProvider></AuthContext.Provider></ThemeProvider>);
};

const adriele = person(1, "Adriele Tutora");
const pedro = person(2, "Pedro Tutor");
const laura = person(3, "Laura Jonjob");

describe("mensagens de grupo", () => {
  it("cada pessoa que escreve em sequência aparece com o próprio nome, como no WhatsApp", async () => {
    mount([msg(1, adriele), msg(2, pedro, { body: "", mediaType: "audio", mediaUrl: "https://x.test/a.ogg" }), msg(3, laura, { isForwarded: true }), msg(4, laura)]);
    await waitFor(() => expect(screen.getByText("Adriele Tutora")).toBeTruthy());
    expect(screen.getByText("Pedro Tutor")).toBeTruthy();
    // the same person twice in a row: the name once
    expect(screen.getAllByText("Laura Jonjob")).toHaveLength(1);
    // each person with their own color
    const colors = ["Adriele Tutora", "Pedro Tutor", "Laura Jonjob"].map((n) => screen.getByText(n).style.color);
    expect(new Set(colors).size).toBe(3);
    // the forwarded message says so
    expect(screen.getByText("Encaminhada")).toBeTruthy();
  });

  it("sem nome, mostra o telefone; sem contato, Participante; nunca vazio", async () => {
    mount([msg(1, { id: 7, name: "5569911112222", number: "5569911112222" }), msg(2, null)]);
    await waitFor(() => expect(screen.getByText("+55 69 91111-2222")).toBeTruthy());
    expect(screen.getByText("Participante")).toBeTruthy();
  });

  it("na conversa com uma pessoa não aparece nome em cima do balão", async () => {
    mount([msg(1, adriele), msg(2, adriele)], false);
    await waitFor(() => expect(screen.getByText("texto 1")).toBeTruthy());
    expect(screen.queryByText("Adriele Tutora")).toBeNull();
  });
});

import { SeenBy } from "../components/MessageOptionsMenu";

describe("dados da mensagem", () => {
  it("mostra quem leu e quem só recebeu, com o horário", async () => {
    api.get.mockResolvedValue({ data: { available: true, isGroup: true, read: [{ id: "1", name: "Adriele Tutora", at: at(5) }], played: [], delivery: [{ id: "2", name: null, number: "5569911112222", at: at(4) }], readRemaining: 0, deliveryRemaining: 3, playedRemaining: 0 } });
    render(<SeenBy messageId="abc" />);
    await waitFor(() => expect(screen.getByText("Adriele Tutora")).toBeTruthy());
    expect(api.get).toHaveBeenCalledWith("/messages/abc/info");
    expect(screen.getByText("Lida por (1)")).toBeTruthy();
    expect(screen.getByText("+55 69 91111-2222")).toBeTruthy();
    expect(screen.getByText("Faltam 3")).toBeTruthy();
  });

  it("no número oficial explica que só existe no QR Code", async () => {
    api.get.mockResolvedValue({ data: { available: false, reason: "channel" } });
    render(<SeenBy messageId="x" />);
    await waitFor(() => expect(screen.getByText(/só aparece em números conectados por QR Code/)).toBeTruthy());
  });
});
