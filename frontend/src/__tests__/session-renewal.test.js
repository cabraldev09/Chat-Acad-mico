import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const post = vi.fn();
vi.mock("axios", () => ({ default: { create: () => ({ post: (...a) => post(...a) }) } }));
vi.mock("../config", () => ({ getBackendUrl: () => "http://api.test" }));

// a plain in-memory localStorage (some Node versions put their own, empty one over the one of jsdom)
const memoryStorage = () => { let data = {}; return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; }, clear: () => { data = {}; } }; };
vi.stubGlobal("localStorage", memoryStorage());

import { refreshSession, RENEW_WAITS } from "../services/session";

const fail = (status) => Object.assign(new Error(`HTTP ${status}`), status ? { response: { status } } : {});
const ok = { data: { token: "novo-token", user: { id: 1 } } };

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); post.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe("renovação da sessão (services/session.js)", () => {
  it("funcionou: guarda o token novo e devolve a resposta", async () => {
    post.mockResolvedValueOnce(ok);
    const data = await refreshSession();
    expect(data.token).toBe("novo-token");
    expect(JSON.parse(localStorage.getItem("token"))).toBe("novo-token");
  });

  it("401 e 403 são login perdido de verdade: devolve null na hora, sem repetir", async () => {
    for (const status of [401, 403]) {
      post.mockReset();
      post.mockRejectedValueOnce(fail(status));
      expect(await refreshSession()).toBeNull();
      expect(post).toHaveBeenCalledTimes(1);
    }
  });

  it("falha do momento (rede, 429, 503) NÃO é login perdido: repete com 1, 2 e 4 segundos e, se acabar, rejeita como transitória", async () => {
    expect(RENEW_WAITS).toEqual([1000, 2000, 4000]);
    for (const status of [503, 429, 0]) {
      post.mockReset();
      post.mockRejectedValue(fail(status));
      const result = refreshSession().then(() => "resolveu", (e) => e);
      await vi.advanceTimersByTimeAsync(1000);
      expect(post).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(2000);
      expect(post).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(4000);
      const error = await result;
      expect(post).toHaveBeenCalledTimes(4);
      expect(error.transient).toBe(true);
      expect(localStorage.getItem("token")).toBeNull();
    }
  });

  it("falha uma vez e volta a funcionar: a pessoa nem percebe", async () => {
    post.mockRejectedValueOnce(fail(503)).mockResolvedValueOnce(ok);
    const result = refreshSession();
    await vi.advanceTimersByTimeAsync(1000);
    expect((await result).token).toBe("novo-token");
  });

  it("uma renovação de cada vez: chamadas ao mesmo tempo dividem a mesma", async () => {
    post.mockResolvedValue(ok);
    const [a, b, c] = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});
