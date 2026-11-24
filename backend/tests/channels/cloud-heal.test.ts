import { describe, expect, it, vi, beforeEach } from "vitest";

const saved: Record<number, any> = {};
const conns: any[] = [];
vi.mock("axios", () => ({ default: { get: vi.fn() } }));
vi.mock("../../src/channels/meta", () => ({ GRAPH: "https://graph.test" }));
vi.mock("../../src/channels/types", () => ({ getConfig: (w: any) => ({ ...w.cfg, ...(saved[w.id] || {}) }) }));
vi.mock("../../src/helpers/Secrets", () => ({ sealConfig: (s: string) => s }));
vi.mock("../../src/utils/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("../../src/models/Whatsapp", () => ({ default: { findAll: async () => conns } }));

import axios from "axios";
import { adoptSiblingApp, borrowSiblingToken } from "../../src/services/ChannelServices/CloudToken";

const conn = (id: number, status: string, cfg: any) => ({ id, status, name: `n${id}`, cfg, config: "{}", update: async ({ config }: any) => { saved[id] = { ...(saved[id] || {}), ...JSON.parse(config) }; } });

beforeEach(() => { conns.length = 0; Object.keys(saved).forEach(k => delete saved[Number(k)]); (axios.get as any).mockReset(); });

describe("número oficial que não cai", () => {
  it("o token expirado da Tutoria volta com o acesso do Atendimento, quando a Meta deixa esse acesso ler o número", async () => {
    const tutoria = conn(2, "DISCONNECTED", { phoneNumberId: "PN-T", accessToken: "EAA-velho" });
    conns.push(conn(1, "CONNECTED", { phoneNumberId: "PN-A", accessToken: "EAA-bom", appId: "APP", appSecret: "SEG", tokenExpiresAt: "2027-01-01T00:00:00.000Z" }), tutoria);
    (axios.get as any).mockImplementation(async (url: string, o: any) => {
      if (url.endsWith("/PN-T") && o.params.access_token === "EAA-bom") return { data: { display_phone_number: "+55 69 9" } };
      throw Object.assign(new Error("no"), { response: { status: 400 } });
    });
    const from = await borrowSiblingToken(tutoria as any);
    expect(from?.id).toBe(1);
    expect(saved[2]).toMatchObject({ accessToken: "EAA-bom", appId: "APP", appSecret: "SEG", tokenFrom: 1, tokenExpiresAt: "2027-01-01T00:00:00.000Z" });
  });

  it("não usa o acesso de outro número que a Meta recusa para este, nem o de um número caído", async () => {
    const tutoria = conn(2, "DISCONNECTED", { phoneNumberId: "PN-T", accessToken: "EAA-velho" });
    conns.push(conn(1, "CONNECTED", { phoneNumberId: "PN-A", accessToken: "EAA-outra-empresa" }), conn(3, "DISCONNECTED", { phoneNumberId: "PN-X", accessToken: "EAA-caido" }), tutoria);
    (axios.get as any).mockRejectedValue(Object.assign(new Error("no"), { response: { status: 400 } }));
    expect(await borrowSiblingToken(tutoria as any)).toBeNull();
    expect(saved[2]).toBeUndefined();
    expect((axios.get as any).mock.calls.every((c: any[]) => c[1].params.access_token !== "EAA-caido")).toBe(true);
  });

  it("um número sem App ID e App Secret recebe os do app que emitiu o token dele, para o token ser renovado a tempo", async () => {
    const tutoria = conn(2, "CONNECTED", { phoneNumberId: "PN-T", accessToken: "EAA-t" });
    conns.push(conn(1, "CONNECTED", { accessToken: "EAA-a", appId: "APP", appSecret: "SEG" }), tutoria);
    (axios.get as any).mockResolvedValue({ data: { data: { is_valid: true, app_id: "APP" } } });
    expect(await adoptSiblingApp(tutoria as any)).toBe(true);
    expect(saved[2]).toMatchObject({ appId: "APP", appSecret: "SEG" });
    (axios.get as any).mockResolvedValue({ data: { data: { is_valid: true, app_id: "OUTRO" } } });
    delete saved[2];
    expect(await adoptSiblingApp(tutoria as any)).toBe(false);
  });
});
