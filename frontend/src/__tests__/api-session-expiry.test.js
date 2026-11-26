import { describe, expect, it, vi, beforeEach } from "vitest";

const renewToken = vi.fn();
vi.mock("../services/session", () => ({ renewToken: (...a) => renewToken(...a) }));
vi.mock("../config", () => ({ getBackendUrl: () => "http://api.test" }));

// a plain in-memory localStorage (some Node versions put their own, empty one over the one of jsdom)
const memoryStorage = () => { let data = {}; return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; }, clear: () => { data = {}; } }; };
vi.stubGlobal("localStorage", memoryStorage());

import api from "../services/api";

// the server answers with what each test says; the interceptors of services/api.js are the real ones
const answers = [];
const seen = [];
api.defaults.adapter = async (config) => {
  seen.push(config);
  const answer = answers.shift();
  if (answer.status >= 400) throw Object.assign(new Error(`HTTP ${answer.status}`), { config, response: { status: answer.status, data: {} } });
  return { status: answer.status, data: answer.data || {}, headers: {}, config };
};

let expired;
beforeEach(() => {
  renewToken.mockReset();
  answers.length = 0;
  seen.length = 0;
  localStorage.clear();
  expired = vi.fn();
  window.addEventListener("sessionExpired", expired, { once: true });
});
const noEventLeft = () => window.removeEventListener("sessionExpired", expired);

describe("o cliente da API e a sessão (services/api.js)", () => {
  it("sem login (tela de login): um 401 não renova nada nem desloga ninguém", async () => {
    answers.push({ status: 401 });
    await expect(api.get("/whatsapp/")).rejects.toMatchObject({ response: { status: 401 } });
    expect(renewToken).not.toHaveBeenCalled();
    expect(expired).not.toHaveBeenCalled();
    noEventLeft();
  });

  it("com login e token vencido: renova e repete o pedido com o token novo", async () => {
    localStorage.setItem("token", JSON.stringify("velho"));
    // like the real renewal: the new token is saved and returned
    renewToken.mockImplementation(async () => { localStorage.setItem("token", JSON.stringify("novo")); return "novo"; });
    answers.push({ status: 401 }, { status: 200, data: { ok: true } });
    const r = await api.get("/tickets");
    expect(r.data.ok).toBe(true);
    expect(seen[1].headers.Authorization).toBe("Bearer novo");
    expect(expired).not.toHaveBeenCalled();
    noEventLeft();
  });

  it("o servidor diz que o login acabou (renovação devolve null): desloga", async () => {
    localStorage.setItem("token", JSON.stringify("velho"));
    renewToken.mockResolvedValue(null);
    answers.push({ status: 401 });
    await expect(api.get("/tickets")).rejects.toMatchObject({ response: { status: 401 } });
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it("a renovação falhou por motivo do momento (rede, servidor reiniciando): NÃO desloga", async () => {
    localStorage.setItem("token", JSON.stringify("velho"));
    renewToken.mockRejectedValue(Object.assign(new Error("rede"), { transient: true }));
    answers.push({ status: 401 });
    await expect(api.get("/tickets")).rejects.toMatchObject({ response: { status: 401 } });
    expect(expired).not.toHaveBeenCalled();
    noEventLeft();
  });

  it("erros 5xx e 429 de outras rotas nunca deslogam", async () => {
    localStorage.setItem("token", JSON.stringify("velho"));
    for (const status of [500, 503, 429]) {
      answers.push({ status });
      await expect(api.get("/tickets")).rejects.toMatchObject({ response: { status } });
    }
    expect(renewToken).not.toHaveBeenCalled();
    expect(expired).not.toHaveBeenCalled();
    noEventLeft();
  });
});
