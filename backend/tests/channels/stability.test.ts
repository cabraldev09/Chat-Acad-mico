import { describe, expect, it, vi, beforeEach } from "vitest";

// ---- the stored webhooks of the Meta: processed, retried with a growing wait, given up after 5 tries
const rows = new Map<number, any>();
const updates: any[] = [];
vi.mock("../../src/models/MetaWebhookEvent", () => ({
  default: {
    update: vi.fn(async (patch: any, opts: any) => {
      updates.push({ patch, where: opts.where });
      const row = rows.get(opts.where.id);
      if (!row) return [0];
      if (opts.where.status && row.status !== opts.where.status) return [0];
      Object.assign(row, patch);
      return [1];
    }),
    findByPk: vi.fn(async (id: number) => rows.get(id) || null),
    findOrCreate: vi.fn()
  }
}));
vi.mock("../../src/models/Whatsapp", () => ({ default: { findByPk: vi.fn(async () => ({ id: 3, channel: "whatsapp_cloud" })), findAll: vi.fn(async () => []) } }));
vi.mock("../../src/channels/types", () => ({ getConfig: () => ({}) }));
const process = vi.fn();
vi.mock("../../src/channels/meta", () => ({ processMetaWebhook: (...args: any[]) => process(...args) }));

import { processEvent, webhookKey } from "../../src/services/ChannelServices/MetaWebhookQueue";
import { batchLimit } from "../../src/helpers/UploadLimit";

describe("webhook da Meta guardado antes de responder", () => {
  beforeEach(() => { rows.clear(); updates.length = 0; process.mockReset(); });
  it("a mesma entrega gera a mesma chave; outra conexão, outra chave", () => {
    const raw = Buffer.from('{"entry":[1]}');
    expect(webhookKey(3, raw, null)).toBe(webhookKey(3, raw, null));
    expect(webhookKey(3, raw, null)).not.toBe(webhookKey(4, raw, null));
  });
  it("processa no modo estrito e marca como concluído", async () => {
    rows.set(1, { id: 1, whatsappId: 3, body: '{"entry":[]}', status: "pending", attempts: 0 });
    await processEvent(1);
    expect(process).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }), { entry: [] }, true);
    expect(rows.get(1).status).toBe("done");
  });
  it("uma falha volta para a fila com espera maior; na 5ª tentativa desiste", async () => {
    process.mockRejectedValue(new Error("banco fora"));
    rows.set(2, { id: 2, whatsappId: 3, body: "{}", status: "pending", attempts: 0 });
    await processEvent(2);
    expect(rows.get(2)).toMatchObject({ status: "pending", attempts: 1 });
    expect(new Date(rows.get(2).nextAt).getTime()).toBeGreaterThan(Date.now() + 15000);
    rows.get(2).attempts = 4;
    rows.get(2).status = "pending";
    await processEvent(2);
    expect(rows.get(2)).toMatchObject({ status: "failed", attempts: 5 });
  });
  it("um evento já pego por outro processo não é processado duas vezes", async () => {
    rows.set(3, { id: 3, whatsappId: 3, body: "{}", status: "processing", attempts: 0 });
    await processEvent(3);
    expect(process).not.toHaveBeenCalled();
  });
});

describe("limite do lote de upload", () => {
  it("recusa o lote acima do total e deixa passar o que cabe", () => {
    const next = vi.fn();
    batchLimit(100)({ files: [{ size: 60 }, { size: 50 }] } as any, {} as any, next);
    expect(next.mock.calls[0][0]?.message).toBe("ERR_UPLOAD_TOO_LARGE");
    const ok = vi.fn();
    batchLimit(100)({ files: [{ size: 60 }, { size: 30 }] } as any, {} as any, ok);
    expect(ok).toHaveBeenCalledWith();
  });
});
