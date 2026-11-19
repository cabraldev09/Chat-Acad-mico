import { describe, expect, it, vi } from "vitest";

const upserts: any[] = [];
vi.mock("../../../../src/models/CopilotSnapshot", () => ({ default: { upsert: async (v: any) => { upserts.push(v); } } }));
vi.mock("../../../../src/services/AnalyticsServices/AnalyticsService", () => ({ rows: async () => [], VALID_TICKET: "1=1" }));
vi.mock("../../../../src/utils/logger", () => ({ logger: { warn: vi.fn() } }));

import { saveSnapshot } from "../../../../src/services/AnalyticsServices/ProcessMetrics";

describe("retrato do processo para o gestor", () => {
  it("guarda as etapas feitas, a etapa atual e o quanto do obrigatório foi feito (opcionais não contam)", async () => {
    await saveSnapshot({ id: 9, userId: 4 } as any, {
      leadId: 2, current: "city",
      steps: [{ key: "course", done: true }, { key: "entry", done: true }, { key: "city", done: false }, { key: "objective", done: true, optional: true }]
    });
    expect(upserts[0]).toMatchObject({ ticketId: 9, userId: 4, leadId: 2, current: "city", doneKeys: ["course", "entry", "objective"], doneCount: 2, requiredTotal: 3 });
  });
});
