import { describe, expect, it } from "vitest";

import { isMasked, maskSecret, openSecret, sealSecret } from "../../../src/helpers/Secrets";

describe("keys sealed at rest", () => {
  it("is not readable in the database form and comes back as it was", () => {
    const sealed = sealSecret("sk-ant-api03-ABCDEFGH1234567890");
    expect(sealed.startsWith("enc:v1:")).toBe(true);
    expect(sealed).not.toContain("ABCDEFGH");
    expect(openSecret(sealed)).toBe("sk-ant-api03-ABCDEFGH1234567890");
  });
  it("a value saved before sealing existed is read as it is", () => {
    expect(openSecret("sk-old-plain")).toBe("sk-old-plain");
    expect(openSecret("")).toBe("");
  });
  it("two seals of the same key differ (new nonce each time)", () => {
    expect(sealSecret("abc")).not.toBe(sealSecret("abc"));
  });
  it("the browser only sees the mask", () => {
    const m = maskSecret("sk-ant-api03-ABCDEFGH1234567890")!;
    expect(isMasked(m)).toBe(true);
    expect(m).not.toContain("ABCDEFGH");
  });
});
