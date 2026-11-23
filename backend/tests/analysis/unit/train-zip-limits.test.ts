import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import AppError from "../../../src/errors/AppError";
import { MAX_TRAIN_ZIP_TEXT_BYTES, textOfZip } from "../../../src/services/AiServices/TrainZip";

describe("ZIP training import limits", () => {
  it("rejects a highly compressible oversized conversation while streaming its extracted text", async () => {
    const zip = new JSZip();
    zip.file("_chat.txt", "x".repeat(MAX_TRAIN_ZIP_TEXT_BYTES + 1));
    const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    expect(archive.length).toBeLessThan(MAX_TRAIN_ZIP_TEXT_BYTES);
    await expect(textOfZip(archive)).rejects.toMatchObject<AppError>({ message: "ERR_FILE_TOO_LARGE" });
  });
});
