import { describe, expect, it } from "vitest";

import { mediaOptionsOf } from "../../src/helpers/MediaSendOptions";

describe("envio de figurinha e GIF", () => {
  it("figurinha sai como figurinha (antes uma .webp saía como documento)", () => {
    expect(mediaOptionsOf({ mimetype: "image/webp", filename: "sticker-1.webp" }, "sticker")).toEqual({ sendMediaAsDocument: false, sendMediaAsSticker: true });
  });
  it("vídeo curto pedido como GIF sai em reprodução contínua; sem pedir, sai como vídeo", () => {
    expect(mediaOptionsOf({ mimetype: "video/mp4", filename: "a.mp4" }, "gif")).toEqual({ sendMediaAsDocument: false, sendVideoAsGif: true });
    expect(mediaOptionsOf({ mimetype: "video/mp4", filename: "a.mp4" })).toEqual({ sendMediaAsDocument: false });
  });
  it("foto comum continua foto; .webp sem pedir figurinha continua arquivo", () => {
    expect(mediaOptionsOf({ mimetype: "image/jpeg", filename: "a.jpg" })).toEqual({ sendMediaAsDocument: false });
    expect(mediaOptionsOf({ mimetype: "image/webp", filename: "a.webp" })).toEqual({ sendMediaAsDocument: true });
  });
});
