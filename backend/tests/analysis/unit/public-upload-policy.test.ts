import { describe, expect, it } from "vitest";
import { isAllowedPublicUpload, publicUploadWithinLimits, PUBLIC_UPLOAD_MAX_FILE_BYTES, PUBLIC_UPLOAD_MAX_BATCH_BYTES, PUBLIC_UPLOAD_MAX_API_REQUEST_BYTES } from "../../../src/helpers/PublicUploadPolicy";

describe("public upload policy", () => {
  it("allows attachment formats used by campaigns and the CRM, while rejecting active web content", () => {
    expect(isAllowedPublicUpload("banner.webp")).toBe(true);
    expect(isAllowedPublicUpload("voice.ogg")).toBe(true);
    expect(isAllowedPublicUpload("brochure.pdf")).toBe(true);
    expect(isAllowedPublicUpload("logo.svg")).toBe(true);
    expect(isAllowedPublicUpload("payload.html")).toBe(false);
    expect(isAllowedPublicUpload("payload.svgz")).toBe(false);
  });

  it("enforces per-file and whole-request byte caps", () => {
    expect(publicUploadWithinLimits(PUBLIC_UPLOAD_MAX_FILE_BYTES, PUBLIC_UPLOAD_MAX_BATCH_BYTES)).toBe(true);
    expect(publicUploadWithinLimits(PUBLIC_UPLOAD_MAX_FILE_BYTES + 1, 1)).toBe(false);
    expect(publicUploadWithinLimits(1, PUBLIC_UPLOAD_MAX_BATCH_BYTES + 1)).toBe(false);
    expect(PUBLIC_UPLOAD_MAX_API_REQUEST_BYTES).toBe(5 * PUBLIC_UPLOAD_MAX_FILE_BYTES + 2 * 1024 * 1024);
  });
});
