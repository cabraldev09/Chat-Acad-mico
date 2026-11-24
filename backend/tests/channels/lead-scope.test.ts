import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/models/PoloMember", () => ({ default: { findAll: async () => [{ poloId: 3 }] } }));
vi.mock("../../src/models/UserQueue", () => ({ default: { findAll: async () => [] } }));
vi.mock("../../src/models/Queue", () => ({ default: { findAll: async () => [] } }));

import { leadScopeWhere } from "../../src/middleware/scope";

const req = (user: any) => ({ user } as any);

describe("no CRM cada um vê só o que é seu", () => {
  it("a gestão vê tudo", async () => {
    expect(await leadScopeWhere(req({ id: 1, profile: "admin", role: "consultor" }))).toBeNull();
    expect(await leadScopeWhere(req({ id: 2, profile: "user", role: "coordenacao" }))).toBeNull();
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
