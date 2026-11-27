import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@material-ui/core/styles";

// the live connection of the conversation: the test sends the events itself
const handlers = {};
vi.mock("../services/socket-io", () => ({ default: () => ({ on: (name, fn) => { handlers[name] = fn; }, off: () => {}, emit: () => {}, disconnect: () => {} }) }));
vi.mock("../services/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock("../errors/toastError", () => ({ default: vi.fn() }));

import api from "../services/api";
import MessagesList from "../components/MessagesList";
import Audio from "../components/Audio";
import { AuthContext } from "../context/Auth/AuthContext";
import { ReplyMessageProvider } from "../context/ReplyingMessage/ReplyingMessageContext";

if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });

const theme = createTheme({ scrollbarStyles: {} });
const at = (min) => new Date(Date.UTC(2026, 10, 26, 14, min)).toISOString();
const msg = (id, extra = {}) => ({ id: `m${id}`, ticketId: 9, fromMe: false, read: true, ack: 0, mediaType: "chat", body: `texto ${id}`, createdAt: at(id), contact: { id: 1, name: "Maria Souza" }, ...extra });
const mount = (messages) => {
  api.get.mockResolvedValue({ data: { messages, hasMore: false, count: messages.length } });
  return render(<ThemeProvider theme={theme}><AuthContext.Provider value={{ user: { id: 1, name: "Eu", profile: "admin", queues: [] } }}><ReplyMessageProvider><MessagesList ticketId={9} isGroup={false} channel="whatsapp" /></ReplyMessageProvider></AuthContext.Provider></ThemeProvider>);
};

describe("mídia na conversa, como no WhatsApp", () => {
  it("foto sem legenda: a hora fica sobre a foto; com legenda, a hora vai depois do texto", async () => {
    mount([
      msg(1, { mediaType: "image", mediaUrl: "https://x.test/foto.jpg", body: "foto.jpg" }),
      msg(2, { mediaType: "image", mediaUrl: "https://x.test/outra.jpg", body: "Segue o comprovante" }),
    ]);
    await waitFor(() => expect(screen.getAllByAltText("imagem")).toHaveLength(2));
    const [alone, captioned] = screen.getAllByAltText("imagem");
    // the time of the picture alone is inside the box of the picture
    expect(alone.parentElement.textContent).toMatch(/\d{2}:\d{2}/);
    expect(captioned.parentElement.textContent).not.toMatch(/\d{2}:\d{2}/);
    expect(screen.getByText("Segue o comprovante")).toBeTruthy();
  });

  it("vídeo: mostra o botão para assistir e não toca sozinho", async () => {
    mount([msg(1, { mediaType: "video", mediaUrl: "https://x.test/v.mp4", body: "v.mp4" })]);
    await waitFor(() => expect(screen.getByLabelText("Assistir ao vídeo")).toBeTruthy());
    expect(document.querySelector("video").autoplay).toBe(false);
  });

  it("mensagem nova enquanto a pessoa lê mensagens antigas: o lugar fica e o botão conta a nova", async () => {
    mount([msg(1), msg(2)]);
    await waitFor(() => expect(screen.getByText("texto 2")).toBeTruthy());
    const list = document.getElementById("messagesList");
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 500 });
    list.scrollTop = 400;
    fireEvent.scroll(list);
    await waitFor(() => expect(screen.getByLabelText("Ir para o fim")).toBeTruthy());
    act(() => { handlers.appMessage({ action: "create", message: msg(3) }); });
    await waitFor(() => expect(screen.getByText("texto 3")).toBeTruthy());
    expect(list.scrollTop).toBe(400);
    expect(screen.getByLabelText("Ir para o fim").textContent).toContain("1");
  });
});

describe("áudio", () => {
  it("não toca sozinho; tocar mostra a velocidade, que passa de 1x a 1,5x e 2x", async () => {
    const play = vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(function play() { this.dispatchEvent(new Event("play")); return Promise.resolve(); });
    render(<ThemeProvider theme={theme}><Audio url="https://x.test/voz.ogg" initials="MS" /></ThemeProvider>);
    expect(play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Ouvir"));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByLabelText("Pausar")).toBeTruthy());
    const speed = screen.getByText(/^(1|1,5|2)x$/);
    const first = speed.textContent;
    fireEvent.click(speed);
    expect(screen.getByText(/^(1|1,5|2)x$/).textContent).not.toBe(first);
  });
});
