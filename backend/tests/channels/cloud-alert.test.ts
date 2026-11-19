import { describe, expect, it, vi } from "vitest";

const sent: any[] = [];
vi.mock("../../src/models/Whatsapp", () => ({ default: { findAll: async () => [] } }));
vi.mock("../../src/channels/types", () => ({ getConfig: (w: any) => w.cfg || {} }));
vi.mock("../../src/libs/socket", () => ({ getIO: () => ({ emit: vi.fn() }) }));
vi.mock("../../src/channels/meta", () => ({ GRAPH: "https://graph.test" }));
vi.mock("../../src/models/User", () => ({ default: { findAll: async () => [{ email: "gestor@x.com" }, { email: "dono@x.com" }] } }));
vi.mock("../../src/services/MailServices/Notify", () => ({ frontBase: () => "https://app.test", notify: (to: string, body: any) => sent.push({ to, body }) }));

import { alertAdmins } from "../../src/workers/CloudHealth";

describe("aviso quando o número oficial cai", () => {
  it("manda e-mail aos administradores, no máximo uma vez a cada 6 horas por número", async () => {
    const w: any = { id: 7, name: "API Oficial Polos", status: "DISCONNECTED" };
    expect(await alertAdmins(w, "Caiu.")).toBe(true);
    expect(sent.map(s => s.to)).toEqual(["gestor@x.com", "dono@x.com"]);
    expect(sent[0].body.subject).toContain("fora do ar");
    expect(sent[0].body.text).toContain("https://app.test/connections");
    expect(await alertAdmins(w, "Caiu de novo.")).toBe(false);
    expect(sent.length).toBe(2);
  });
});
