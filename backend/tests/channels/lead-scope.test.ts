import { describe, expect, it, vi } from "vitest";

// user 20 belongs to no polo; everybody else to polo 3
vi.mock("../../src/models/PoloMember", () => ({ default: { findAll: async (q: any) => (q?.where?.userId === 20 ? [] : [{ poloId: 3 }]) } }));
vi.mock("../../src/models/UserQueue", () => ({ default: { findAll: async () => [] } }));
vi.mock("../../src/models/Queue", () => ({ default: { findAll: async () => [] } }));

import { Op } from "sequelize";
import { crmPolosOf, leadScopeWhere, poloSql, seesEveryPolo } from "../../src/middleware/scope";

const req = (user: any) => ({ user } as any);

describe("no CRM cada um vê só o que é seu", () => {
  it("a administração vê tudo", async () => {
    expect(await leadScopeWhere(req({ id: 1, profile: "admin", role: "consultor" }))).toBeNull();
    expect(await leadScopeWhere(req({ id: 1, profile: "user", role: "admin" }))).toBeNull();
    expect(await crmPolosOf(req({ id: 1, profile: "admin" }))).toBeNull();
    expect(seesEveryPolo(req({ id: 1, profile: "admin" }))).toBe(true);
  });
  it("a coordenação vê só os leads dos polos em que está; sem polo, nenhum", async () => {
    expect(await leadScopeWhere(req({ id: 2, profile: "user", role: "coordenacao" }))).toEqual({ poloId: { [Op.in]: [3] } });
    expect(await leadScopeWhere(req({ id: 20, profile: "user", role: "coordenacao" }))).toEqual({ poloId: { [Op.in]: [0] } });
    expect(seesEveryPolo(req({ id: 2, profile: "user", role: "coordenacao" }))).toBe(false);
    expect(await crmPolosOf(req({ id: 2, profile: "user", role: "coordenacao" }))).toEqual([3]);
    expect(await crmPolosOf(req({ id: 20, profile: "user", role: "coordenacao" }))).toEqual([]);
    // the other profiles are limited by what is theirs, not by polo (their own leads)
    expect(await crmPolosOf(req({ id: 7, profile: "user", role: "consultor" }))).toBeNull();
  });
  it("o relacionamento vê só os matriculados dos seus polos, nunca o funil", async () => {
    expect(await leadScopeWhere(req({ id: 5, profile: "user", role: "relacionamento" }))).toEqual({ enrolledAt: { [Op.ne]: null }, poloId: { [Op.in]: [3] } });
    expect(await leadScopeWhere(req({ id: 20, profile: "user", role: "relacionamento" }))).toEqual({ enrolledAt: { [Op.ne]: null }, poloId: { [Op.in]: [0] } });
  });
  it("o limite em SQL nunca fica vazio nem leva texto", () => {
    expect(poloSql(null)).toBe("");
    expect(poloSql([])).toBe("AND l.poloId IN (0)");
    expect(poloSql([3, 7], 'l."poloId"')).toBe('AND l."poloId" IN (3, 7)');
    expect(poloSql([Number("1; DROP TABLE x") as any, 4])).toBe("AND l.poloId IN (4)");
  });
  it("o consultor vê só os leads em que é o responsável, nem a fila sem responsável do polo", async () => {
    expect(await leadScopeWhere(req({ id: 7, profile: "user", role: "consultor" }))).toEqual({ ownerId: 7 });
  });
  it("a tutora vê os leads dela e os alunos dados a ela, nunca os alunos do polo ainda sem tutor", async () => {
    const scope: any = await leadScopeWhere(req({ id: 9, profile: "user", role: "tutor" }));
    const text = JSON.stringify(scope, (_k, v) => v);
    expect(Object.getOwnPropertySymbols(scope)).toHaveLength(1);
    const or = scope[Object.getOwnPropertySymbols(scope)[0]];
    expect(or).toEqual([{ ownerId: 9 }, { onboardingTutorId: 9 }]);
    expect(text).not.toContain("poloId");
  });
});
