import { beforeEach, describe, expect, it, vi } from "vitest";

// the official numbers registered in the system (config already opened)
let numbers: any[] = [];
const emitted: any[] = [];

vi.mock("../../src/models/Whatsapp", () => ({ default: { findAll: async () => numbers } }));
vi.mock("../../src/channels/types", () => ({ getConfig: (w: any) => w.cfg }));
vi.mock("../../src/libs/socket", () => ({ getIO: () => ({ emit: (...a: any[]) => emitted.push(a) }) }));
vi.mock("../../src/channels/meta", () => ({ GRAPH: "https://graph.test" }));
const get = vi.fn();
vi.mock("axios", () => ({ default: { get: (...a: any[]) => get(...a) } }));

import { cloudConnectionFor } from "../../src/channels/CloudRouting";
import { checkCloudConnection } from "../../src/workers/CloudHealth";

const conn = (id: number, phoneNumberId: string, appSecret = "app-a", extra: any = {}) => ({
  id, channel: "whatsapp_cloud", status: "CONNECTED", statusNote: null, session: "", cfg: { phoneNumberId, appSecret, accessToken: `tok-${id}` },
  update: vi.fn(async function (this: any, v: any) { Object.assign(this, v); }), ...extra
});

describe("vários números oficiais no mesmo app da Meta", () => {
  beforeEach(() => { numbers = []; });

  it("o evento de cada número vai para a conexão do próprio número, mesmo chegando pela URL de outra", async () => {
    const polo1 = conn(1, "111");
    const polo2 = conn(2, "222");
    numbers = [polo1, polo2];
    expect(await cloudConnectionFor(polo1 as any, "111")).toBe(polo1);
    expect(await cloudConnectionFor(polo1 as any, "222")).toBe(polo2);
  });

  it("número de outro app (outro App Secret) ou desconhecido é descartado", async () => {
    const polo1 = conn(1, "111", "app-a");
    const outroApp = conn(3, "333", "app-b");
    numbers = [polo1, outroApp];
    expect(await cloudConnectionFor(polo1 as any, "333")).toBeNull();
    expect(await cloudConnectionFor(polo1 as any, "999")).toBeNull();
    expect(await cloudConnectionFor(polo1 as any, "")).toBeNull();
  });
});

describe("saúde dos números oficiais", () => {
  beforeEach(() => { get.mockReset(); emitted.length = 0; });

  it("token expirado marca a conexão como desconectada, com o motivo", async () => {
    const w = conn(1, "111");
    get.mockRejectedValue({ response: { status: 401, data: { error: { code: 190, message: "Session has expired" } } } });
    expect(await checkCloudConnection(w as any)).toBe("DISCONNECTED");
    expect(w.status).toBe("DISCONNECTED");
    expect(w.statusNote).toContain("token de acesso da Meta expirou");
    expect(emitted).toHaveLength(1);
  });

  it("volta a conectada e mostra a qualidade baixa do número", async () => {
    const w = conn(1, "111", "app-a", { status: "DISCONNECTED", statusNote: "antigo" });
    get.mockResolvedValue({ data: { display_phone_number: "+55 69 3000-0000", quality_rating: "RED" } });
    expect(await checkCloudConnection(w as any)).toBe("CONNECTED");
    expect(w.status).toBe("CONNECTED");
    expect(w.statusNote).toContain("vermelha");
    expect(w.session).toBe("+55 69 3000-0000");
  });

  it("falha de rede ou erro da própria Meta não muda nada", async () => {
    const w = conn(1, "111");
    get.mockRejectedValue(new Error("timeout"));
    expect(await checkCloudConnection(w as any)).toBe("CONNECTED");
    get.mockRejectedValue({ response: { status: 503, data: {} } });
    expect(await checkCloudConnection(w as any)).toBe("CONNECTED");
    expect(w.update).not.toHaveBeenCalled();
    expect(emitted).toHaveLength(0);
  });

  it("sem mudança, não grava nem avisa a tela", async () => {
    const w = conn(1, "111");
    get.mockResolvedValue({ data: { display_phone_number: "", quality_rating: "GREEN" } });
    await checkCloudConnection(w as any);
    expect(w.update).not.toHaveBeenCalled();
    expect(emitted).toHaveLength(0);
  });

  it("token colado errado (Cannot parse) explica o que copiar de novo", async () => {
    const w = conn(1, "111");
    get.mockRejectedValue({ response: { status: 400, data: { error: { code: 190, message: "Invalid OAuth access token - Cannot parse access token" } } } });
    expect(await checkCloudConnection(w as any)).toBe("DISCONNECTED");
    expect(w.statusNote).toContain("começa com EAA");
  });

  it("número que o token não alcança pede a WABA atribuída ao usuário do sistema", async () => {
    const w = conn(1, "111");
    get.mockRejectedValue({ response: { status: 400, data: { error: { code: 100, message: "Unsupported get request" } } } });
    await checkCloudConnection(w as any);
    expect(w.statusNote).toContain("WABA");
  });

  it("ao conectar, a Meta sem responder deixa desconectada com o motivo", async () => {
    const w = conn(1, "111", "app-a", { status: "OPENING" });
    get.mockRejectedValue(new Error("timeout"));
    expect(await checkCloudConnection(w as any, true)).toBe("DISCONNECTED");
    expect(w.statusNote).toContain("Tentar novamente");
  });
});

describe("credenciais coladas", () => {
  it("tira espaços, quebras de linha, aspas e o Bearer da frente", async () => {
    const { cleanCredential } = await vi.importActual<any>("../../src/helpers/Secrets");
    expect(cleanCredential(" Bearer EAAabc\n123 ")).toBe("EAAabc123");
    expect(cleanCredential('"EAAx y"')).toBe("EAAxy");
    expect(cleanCredential("EAAok")).toBe("EAAok");
  });
});
