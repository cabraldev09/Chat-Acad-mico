import { describe, expect, it, vi } from "vitest";
import { Op } from "sequelize";

vi.mock("../../src/models/PoloMember", () => ({
  default: {
    findAll: async (q: any) => (q?.where?.userId === 20 ? [] : [{ poloId: 3 }]),
    count: async (q: any) => (q?.where?.userId === 8 && q?.where?.poloId?.[Op.in]?.includes(3) ? 1 : 0)
  }
}));
vi.mock("../../src/models/Whatsapp", () => ({ default: { findByPk: async () => null } }));

import { academicWhereOf, connectionOwnerInPolos, coordinationReachesConnection, curricularWhereOf, polosOfCoordination, studentWhereOf } from "../../src/helpers/PoloAccess";

const req = (user: any) => ({ user } as any);

describe("análises, alunos e conexões por polo", () => {
  it("só a coordenação é limitada por polo; a administração e os outros perfis ficam sem limite aqui", async () => {
    expect(await polosOfCoordination(req({ id: 2, profile: "user", role: "coordenacao" }))).toEqual([3]);
    expect(await polosOfCoordination(req({ id: 20, profile: "user", role: "coordenacao" }))).toEqual([]);
    expect(await polosOfCoordination(req({ id: 1, profile: "admin", role: "admin" }))).toBeNull();
    expect(await polosOfCoordination(req({ id: 7, profile: "user", role: "consultor" }))).toBeNull();
    expect(await polosOfCoordination(req({ id: 9, profile: "user", role: "tutor" }))).toBeNull();
  });
  it("o filtro de análises e alunos: do polo ou feito pela própria pessoa; sem polo, nada", () => {
    expect(curricularWhereOf([3], 2)[Op.or]).toEqual([{ userId: 2 }, { poloId: { [Op.in]: [3] } }]);
    expect(curricularWhereOf([], 2)[Op.or][1]).toEqual({ poloId: { [Op.in]: [0] } });
    expect(studentWhereOf([3], 2)[Op.or]).toEqual([{ responsibleUserId: 2 }, { poloId: { [Op.in]: [3] } }]);
  });
  it("a análise acadêmica segue o aluno ou o lead, em SQL e só com números", () => {
    const parts = academicWhereOf([3, Number("1; DROP TABLE x") as any], 2)[Op.or];
    expect(parts).toHaveLength(3);
    const sql = parts.slice(1).map((l: any) => l.val).join(" ");
    expect(sql).toContain('"Students"');
    expect(sql).toContain('"Leads"');
    expect(sql).toContain("IN (3)");
    expect(sql).not.toContain("DROP");
  });
  it("conexão: do dono ou de gente do polo; sem dono, só a administração", async () => {
    expect(await connectionOwnerInPolos([3], 2, 2)).toBe(true);
    expect(await connectionOwnerInPolos([3], 2, 8)).toBe(true);
    expect(await connectionOwnerInPolos([3], 2, 9)).toBe(false);
    expect(await connectionOwnerInPolos([3], 2, null)).toBe(false);
    expect(await connectionOwnerInPolos([], 2, 8)).toBe(false);
    expect(await coordinationReachesConnection(req({ id: 1, profile: "admin", role: "admin" }), null)).toBe(true);
    expect(await coordinationReachesConnection(req({ id: 2, profile: "user", role: "coordenacao" }), null)).toBe(false);
    expect(await coordinationReachesConnection(req({ id: 7, profile: "user", role: "consultor" }), 5)).toBe(true);
  });
});
