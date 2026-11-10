import { describe, expect, it } from "vitest";
import { bodyOfMedia, kindOf, looksLikeFileName } from "../../../src/helpers/MediaLabel";

describe("what a message with a file says", () => {
  it("recognizes a file name made by the system, never a real caption", () => {
    expect(looksLikeFileName("dhasm-1792763841010.jpg")).toBe(true);
    expect(looksLikeFileName("Rp7oA-1792705978844.webp")).toBe(true);
    expect(looksLikeFileName("audio.ogg", "x/audio.ogg")).toBe(true);
    expect(looksLikeFileName("Segue a foto do curso.jpg final")).toBe(false);
    expect(looksLikeFileName("Bom dia! Olha a grade")).toBe(false);
    expect(looksLikeFileName("")).toBe(false);
  });

  it("says the label of the kind when there is no caption", () => {
    expect(bodyOfMedia("", "image", "a-1.jpg")).toBe("📷 Imagem");
    expect(bodyOfMedia("a-1.jpg", "image", "a-1.jpg")).toBe("📷 Imagem");
    expect(bodyOfMedia(undefined, "audio", "b.ogg")).toBe("🎤 Áudio");
    expect(bodyOfMedia("c-2.mp4", "video", "c-2.mp4")).toBe("🎥 Vídeo");
    expect(bodyOfMedia("", "image", "d.webp")).toBe("Figurinha");
    expect(bodyOfMedia("", "image", "x.bin", "x.bin", "image/webp")).toBe("Figurinha");
  });

  it("keeps the caption, and a document keeps its name", () => {
    expect(bodyOfMedia("Veja a grade", "image", "a-1.jpg")).toBe("Veja a grade");
    expect(bodyOfMedia("", "application", "contrato-12.pdf", "Contrato.pdf")).toBe("Contrato.pdf");
    expect(kindOf("ptt")).toBe("audio");
  });
});
