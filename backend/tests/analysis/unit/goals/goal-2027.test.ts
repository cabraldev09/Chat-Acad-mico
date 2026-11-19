import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = new Map<string, string>();
const created: any[] = [];
const imported: any[] = [];
const rows = [{ poloId: 1, manualCount: -5, update: vi.fn() }, { poloId: 2, manualCount: -3, update: vi.fn() }];
vi.mock("../../../../src/helpers/AppSettings", () => ({ getSetting: async (k: string, d: string) => settings.get(k) ?? d, setSetting: async (k: string, v: string) => { settings.set(k, v); } }));
vi.mock("../../../../src/helpers/AppTime", () => ({ getAppTz: () => "America/Porto_Velho" }));
vi.mock("../../../../src/utils/logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock("../../../../src/models/Goal", () => ({ default: { findOne: async () => null, count: async () => 1, create: async (v: any) => { created.push(v); return { id: 9, ...v }; } } }));
vi.mock("../../../../src/models/GoalPolo", () => ({ default: { findAll: async ({ where }: any) => (imported.length ? rows : []).filter(() => where.goalId === 9) } }));
vi.mock("../../../../src/controllers/GoalController", () => ({ applyPoloImport: async (_g: any, items: any[]) => { imported.push(...items); return { created: 0, updated: items.length }; } }));

import { GOAL_2027_1, seedGoal20271 } from "../../../../src/services/GoalServices/SeedPoloGoals";

describe("meta do 1º semestre de 2027", () => {
  beforeEach(() => { settings.clear(); created.length = 0; imported.length = 0; rows.forEach(r => r.update.mockClear()); });

  it("cria a meta uma vez, de 17/11/2026 a 03/05/2027, com as 8 metas por polo, e mantém o realizado do CRM", async () => {
    await seedGoal20271();
    expect(created).toEqual([{ title: "Graduação 1º semestre de 2027", startsOn: "2026-11-17", endsOn: "2027-05-03", kind: "polo", workDays: 5 }]);
    expect(imported.map(p => [p.code, p.target])).toEqual([["8311", 150], ["8809", 150], ["1959", 77], ["2042", 56], ["2085", 38], ["8251", 34], ["1893", 29], ["2027", 26]]);
    expect(GOAL_2027_1.polos.reduce((s, p) => s + p.target, 0)).toBe(560);
    rows.forEach(r => expect(r.update).toHaveBeenCalledWith({ manualCount: 0 }));
    await seedGoal20271();
    expect(created).toHaveLength(1);
  });
});
