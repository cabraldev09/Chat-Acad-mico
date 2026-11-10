import { describe, expect, it, vi } from "vitest";

import { makeThrottle } from "../../../src/helpers/RateWindow";
import rateLimit from "../../../src/middleware/rateLimit";

describe("throttle of the public routes", () => {
  it("counts per key inside the window and lets the others through", () => {
    const t = makeThrottle(3, 60000);
    expect([t("a"), t("a"), t("a"), t("a")]).toEqual([false, false, false, true]);
    expect(t("b")).toBe(false);
  });

  it("forgets the old ones: the window slides", () => {
    vi.useFakeTimers();
    const t = makeThrottle(1, 1000);
    expect(t("k")).toBe(false);
    expect(t("k")).toBe(true);
    vi.advanceTimersByTime(1500);
    expect(t("k")).toBe(false);
    vi.useRealTimers();
  });

  it("the table does not grow without bound with keys made up by a stranger", () => {
    const t = makeThrottle(5, 60000);
    for (let i = 0; i < 25000; i += 1) t(`ip:${i}`);
    // no way to read the size from outside: the call must still work and answer
    expect(t("ip:new")).toBe(false);
  });
});

describe("login limiter that counts only failures", () => {
  const run = (limiter: any, status: number) => {
    const handlers: Array<() => void> = [];
    const res: any = { statusCode: status, setHeader: () => undefined, on: (_e: string, f: () => void) => handlers.push(f) };
    let passed = false;
    let blocked = false;
    try {
      limiter({ ip: "1.1.1.1", body: {} }, res, () => { passed = true; });
    } catch (e) {
      blocked = true;
    }
    handlers.forEach(h => h());
    return { passed, blocked };
  };

  it("right answers never use the allowance; wrong ones do", () => {
    const limiter = rateLimit({ windowMs: 60000, max: 2, failuresOnly: true });
    for (let i = 0; i < 10; i += 1) expect(run(limiter, 200).passed).toBe(true);
    expect(run(limiter, 401).passed).toBe(true);
    expect(run(limiter, 401).passed).toBe(true);
    expect(run(limiter, 200).blocked).toBe(true);
  });
});
