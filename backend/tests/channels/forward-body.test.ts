import { describe, expect, it } from "vitest";
import { forwardBodyOf } from "../../src/services/MessageServices/ForwardBody";

const m = (extra: Record<string, unknown>) => ({ body: "", mediaType: "chat", mediaUrl: null, isDeleted: false, mediaPurgedAt: null, bodyPurgedAt: null, ...extra });

describe("o que vai num encaminhamento", () => {
  it("texto vai como está", () => {
    expect(forwardBodyOf(m({ body: "Olá, tudo bem?" }))).toEqual({ ok: true, body: "Olá, tudo bem?", media: null });
  });

  it("localização do QR vai como descrição e link do mapa, nunca a imagem em base64", () => {
    const body = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB|https://maps.google.com/maps?q=-10.1,-63.2|Polo Vilhena";
    expect(forwardBodyOf(m({ mediaType: "location", body }))).toEqual({ ok: true, body: "Polo Vilhena\nhttps://maps.google.com/maps?q=-10.1,-63.2", media: null });
    expect(forwardBodyOf(m({ mediaType: "location", body: "data:image/png;base64,AAAA|https://maps.google.com/maps?q=1,2" }))).toEqual({ ok: true, body: "https://maps.google.com/maps?q=1,2", media: null });
  });

  it("arquivo baixado vai com a legenda; sem arquivo, não vai e diz por quê", () => {
    expect(forwardBodyOf(m({ mediaType: "image", mediaUrl: "foto.jpg", body: "Segue" }))).toEqual({ ok: true, body: "Segue", media: "foto.jpg" });
    expect(forwardBodyOf(m({ mediaType: "image", mediaUrl: "foto.jpg", body: "foto.jpg" }))).toEqual({ ok: true, body: "", media: "foto.jpg" });
    expect(forwardBodyOf(m({ mediaType: "audio", body: "Áudio" }))).toEqual({ ok: false, reason: "ERR_FORWARD_MEDIA_NOT_LOADED" });
    expect(forwardBodyOf(m({ mediaType: "image", body: "", mediaPurgedAt: new Date() }))).toEqual({ ok: false, reason: "ERR_FORWARD_CONTENT_REMOVED" });
    expect(forwardBodyOf(m({ body: "", bodyPurgedAt: new Date() }))).toEqual({ ok: false, reason: "ERR_FORWARD_CONTENT_REMOVED" });
  });

  it("mensagem apagada ou vazia não vai", () => {
    expect(forwardBodyOf(m({ body: "x", isDeleted: true }))).toEqual({ ok: false, reason: "ERR_NO_MESSAGE_FOUND" });
    expect(forwardBodyOf(m({ body: "   " }))).toEqual({ ok: false, reason: "ERR_FORWARD_EMPTY" });
  });
});
