import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/channels/meta", () => ({ GRAPH: "https://graph.test" }));
vi.mock("../../src/channels/types", () => ({ getConfig: (w: any) => JSON.parse(w.config) }));
vi.mock("../../src/helpers/Secrets", () => ({ sealConfig: (c: string) => c }));
vi.mock("../../src/utils/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
const get = vi.fn();
vi.mock("axios", () => ({ default: { get: (...a: any[]) => get(...a) } }));

import { expiryNote, extendCloudToken } from "../../src/services/ChannelServices/CloudToken";

const DAY = 86400000;
const conn = (cfg: any) => ({
  id: 1,
  config: JSON.stringify({ phoneNumberId: "111", accessToken: "EAAshort", appId: "123", appSecret: "sec", ...cfg }),
  update: vi.fn(async function (this: any, v: any) { Object.assign(this, v); })
});
const debug = (expiresMs: number) => ({ data: { data: { is_valid: true, expires_at: Math.floor(expiresMs / 1000) } } });

describe("token da API Oficial de 24 horas vira de 60 dias", () => {
  beforeEach(() => { get.mockReset(); });

  it("troca o token curto e guarda a validade", async () => {
    const w = conn({});
    const later = Date.now() + 60 * DAY;
    get.mockImplementation(async (url: string, opts: any) => {
      if (url.endsWith("/debug_token")) return debug(opts.params.input_token === "EAAlong" ? later : Date.now() + DAY);
      if (url.endsWith("/oauth/access_token")) {
        expect(opts.params).toMatchObject({ grant_type: "fb_exchange_token", client_id: "123", client_secret: "sec", fb_exchange_token: "EAAshort" });
        return { data: { access_token: "EAAlong", expires_in: 5184000 } };
      }
      throw new Error(url);
    });
    expect(await extendCloudToken(w as any)).toBe("extended");
    const saved = JSON.parse(w.config);
    expect(saved.accessToken).toBe("EAAlong");
    expect(Math.abs(new Date(saved.tokenExpiresAt).getTime() - later)).toBeLessThan(2000);
  });

  it("token permanente (sem vencimento) fica como está", async () => {
    const w = conn({ tokenExpiresAt: "2020-01-01T00:00:00.000Z" });
    get.mockResolvedValue(debug(0));
    expect(await extendCloudToken(w as any)).toBe("permanent");
    expect(JSON.parse(w.config).tokenExpiresAt).toBeNull();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("sem App ID não tenta nada", async () => {
    const w = conn({ appId: "" });
    expect(await extendCloudToken(w as any)).toBe("skipped");
    expect(get).not.toHaveBeenCalled();
  });

  it("App ID ou App Secret errados não quebram a conexão", async () => {
    const w = conn({});
    get.mockRejectedValue({ response: { status: 400, data: { error: { message: "Invalid OAuth access token" } } } });
    expect(await extendCloudToken(w as any)).toBe("skipped");
    expect(w.update).not.toHaveBeenCalled();
  });

  it("avisa nos últimos 7 dias e quando venceu", () => {
    const now = Date.now();
    expect(expiryNote(new Date(now + 20 * DAY).toISOString(), now)).toBe("");
    expect(expiryNote(new Date(now + 3 * DAY).toISOString(), now)).toContain("vence em 3 dias");
    expect(expiryNote(new Date(now - DAY).toISOString(), now)).toContain("venceu");
  });
});

describe("chave colada no campo que mostra a máscara", () => {
  it("a chave nova vale, e não a antiga", async () => {
    const { unmaskPasted, isMasked } = await vi.importActual<any>("../../src/helpers/Secrets");
    expect(unmaskPasted("••••abcdEAAnovo")).toBe("EAAnovo");
    expect(unmaskPasted("••••abcd")).toBe("••••abcd");
    expect(isMasked(unmaskPasted("••••abcd"))).toBe(true);
    expect(unmaskPasted("EAAx")).toBe("EAAx");
  });
});

