import { describe, expect, it } from "vitest";
import { isLate, LATE_MS } from "../../src/helpers/LateMessage";

describe("a message the provider delivers late", () => {
  const now = Date.UTC(2026, 10, 21, 4, 40);
  it("is late when it was sent more than ten minutes before it arrived", () => {
    expect(isLate(new Date(now - LATE_MS - 1000), now)).toBe(true);
  });
  it("is not late when it just arrived, or when the provider did not say when it was sent", () => {
    expect(isLate(new Date(now - 30000), now)).toBe(false);
    expect(isLate(undefined, now)).toBe(false);
    expect(isLate(new Date("x"), now)).toBe(false);
  });
});
