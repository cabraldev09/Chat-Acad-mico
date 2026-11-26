import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";

vi.mock("../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../errors/toastError", () => ({ default: vi.fn() }));
vi.mock("../components/EmojiPicker", () => ({ default: () => <div>emojis</div> }));

import api from "../services/api";
import ExpressionPanel, { filterStickers } from "../components/MessageInput/ExpressionPanel";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const list = [
  { id: "a", url: "/a.webp", uses: 3, sent: true, sentAt: "2026-11-20T10:00:00Z" },
  { id: "b", url: "/b.webp", uses: 1, sent: false, sentAt: null },
  { id: "c", url: "/c.webp", uses: 2, sent: true, sentAt: "2026-11-25T10:00:00Z" },
];

describe("painel de figurinhas como o do WhatsApp", () => {
  it("filtros: Recentes (enviadas pela equipe, a mais nova primeiro), Mais usadas e Recebidas", () => {
    expect(filterStickers(list, "all").map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(filterStickers(list, "recent").map((s) => s.id)).toEqual(["c", "a"]);
    expect(filterStickers(list, "top").map((s) => s.id)).toEqual(["a", "c"]);
    expect(filterStickers(list, "received").map((s) => s.id)).toEqual(["b"]);
  });

  it("mostra Criar figurinha e as figurinhas; um toque envia e fecha", async () => {
    api.get.mockResolvedValue({ data: list });
    api.post.mockResolvedValue({ data: {} });
    const onSent = vi.fn();
    render(<ExpressionPanel ticketId={9} tab="stickers" onTab={() => {}} onEmoji={() => {}} onSent={onSent} showMedia />);
    expect(screen.getByRole("button", { name: "Criar figurinha a partir de uma foto" })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Enviar figurinha" })).toHaveLength(3));
    expect(api.get).toHaveBeenCalledWith("/messages/9/stickers", { params: {} });
    fireEvent.click(screen.getByRole("button", { name: "Recebidas" }));
    expect(screen.getAllByRole("button", { name: "Enviar figurinha" })).toHaveLength(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Enviar figurinha" })[0]);
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(api.post.mock.calls[0][0]).toBe("/messages/9/sticker");
    expect(api.post.mock.calls[0][1].messageId).toBe("b");
  });

  it("Criar figurinha manda a foto como figurinha", async () => {
    api.get.mockResolvedValue({ data: [] });
    api.post.mockResolvedValue({ data: {} });
    const onSent = vi.fn();
    const { container } = render(<ExpressionPanel ticketId={9} tab="stickers" onTab={() => {}} onEmoji={() => {}} onSent={onSent} showMedia />);
    await waitFor(() => expect(screen.getByText("As figurinhas recebidas ou enviadas neste número aparecem aqui.")).toBeTruthy());
    const file = new File(["x"], "foto.png", { type: "image/png" });
    fireEvent.change(container.querySelector("input[type=file]"), { target: { files: [file] } });
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    const form = api.post.mock.calls[0][1];
    expect(api.post.mock.calls[0][0]).toBe("/messages/9");
    expect(form.get("kind")).toBe("sticker");
    expect(form.get("medias").name).toBe("foto.png");
  });

  it("as abas Emoji, GIF e Figurinhas; a de GIF pede os GIFs do número; sem WhatsApp, só emojis", async () => {
    api.get.mockResolvedValue({ data: [{ id: "g", url: "/g.mp4", uses: 1, sent: false }] });
    const onTab = vi.fn();
    const { rerender } = render(<ExpressionPanel ticketId={9} tab="gif" onTab={onTab} onEmoji={() => {}} onSent={() => {}} showMedia />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Enviar GIF" })).toBeTruthy());
    expect(api.get).toHaveBeenCalledWith("/messages/9/stickers", { params: { kind: "gif" } });
    expect(screen.getByRole("button", { name: "GIFs" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Emojis" }));
    expect(onTab).toHaveBeenCalledWith("emoji");
    rerender(<ExpressionPanel ticketId={9} tab="emoji" onTab={onTab} onEmoji={() => {}} onSent={() => {}} showMedia={false} />);
    expect(screen.getByText("emojis")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Figurinhas" })).toBeNull();
  });

  it("erro ao carregar mostra Tentar de novo", async () => {
    api.get.mockRejectedValueOnce(new Error("x")).mockResolvedValue({ data: list });
    render(<ExpressionPanel ticketId={9} tab="stickers" onTab={() => {}} onEmoji={() => {}} onSent={() => {}} showMedia />);
    await waitFor(() => expect(screen.getByText("Tentar de novo")).toBeTruthy());
    fireEvent.click(screen.getByText("Tentar de novo"));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Enviar figurinha" })).toHaveLength(3));
  });
});
