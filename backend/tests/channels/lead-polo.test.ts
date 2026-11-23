import { beforeEach, describe, expect, it, vi } from "vitest";

const polos: Record<number, any> = {
  1: { id: 1, name: "Porto Velho", active: true },
  2: { id: 2, name: "Ji-Paraná", active: true },
  3: { id: 3, name: "Ariquemes", active: true }
};
const state = { members: [] as Array<{ userId: number; poloId: number; role: string }>, resolution: { status: "none", polo: null as any, candidates: [] as any[], state: null as any }, enrollAt: null as number | null };

vi.mock("../../src/models/Lead", () => ({ default: {} }));
vi.mock("../../src/models/User", () => ({ default: { findByPk: vi.fn(async () => ({ name: "Ana" })) } }));
vi.mock("../../src/models/Polo", () => ({
  default: {
    findByPk: vi.fn(async (id: number) => polos[id] || null),
    findAll: vi.fn(async (q: any) => Object.values(polos).filter((p: any) => p.active && (q.where.id[Object.getOwnPropertySymbols(q.where.id)[0]] as number[]).includes(p.id)))
  }
}));
vi.mock("../../src/models/PoloMember", () => ({ default: { findAll: vi.fn(async (q: any) => state.members.filter(m => m.userId === q.where.userId && m.role === q.where.role)) } }));
vi.mock("../../src/services/CrmServices/LeadCore", () => ({ addActivity: vi.fn(async () => undefined) }));
vi.mock("../../src/services/PoloServices/ResolvePolo", () => ({ resolvePoloFor: vi.fn(async () => state.resolution) }));
vi.mock("../../src/services/CommercialServices/Router", () => ({
  enrollmentPoloFor: vi.fn(async (_lead: any, cityPolo: any) => (state.enrollAt && state.enrollAt !== cityPolo.id ? { polo: polos[state.enrollAt], cityPolo } : { polo: cityPolo, cityPolo: null }))
}));

import { keepsPolo, pickPoloRule, refreshCoursePolo, settleLeadPolo } from "../../src/services/PoloServices/LeadPolo";
import { addActivity } from "../../src/services/CrmServices/LeadCore";

const leadOf = (data: Record<string, any>): any => {
  const lead: any = { id: 9, ownerId: null, city: null, state: null, poloId: null, practicePoloId: null, poloSource: null, enrolledAt: null, ...data };
  lead.update = vi.fn(async (patch: any) => Object.assign(lead, patch));
  return lead;
};
const found = (id: number) => ({ status: "found", polo: polos[id], candidates: [], state: null });
const none = { status: "none", polo: null, candidates: [], state: null };

beforeEach(() => {
  state.members = [];
  state.resolution = none;
  state.enrollAt = null;
  vi.mocked(addActivity).mockClear();
});

describe("polo do lead: cidade e curso primeiro, carteira só sem cidade", () => {
  it("a regra: com cidade vale só a cidade; sem cidade vale a carteira quando o consultor tem um único polo", () => {
    expect(pickPoloRule({ hasPlace: true, placePoloId: 1, walletPoloIds: [2] })).toEqual({ poloId: 1, source: "city" });
    expect(pickPoloRule({ hasPlace: true, placePoloId: null, walletPoloIds: [2] })).toEqual({ poloId: null, source: null });
    expect(pickPoloRule({ hasPlace: false, placePoloId: null, walletPoloIds: [2, 2] })).toEqual({ poloId: 2, source: "wallet" });
    expect(pickPoloRule({ hasPlace: false, placePoloId: null, walletPoloIds: [2, 3] })).toEqual({ poloId: null, source: null });
    expect(pickPoloRule({ hasPlace: false, placePoloId: null, walletPoloIds: [] })).toEqual({ poloId: null, source: null });
  });

  it("não mexe em matriculado nem em polo escolhido no fluxo; polo da carteira sempre pode ser refeito", () => {
    expect(keepsPolo({ poloId: 1, poloSource: "city", enrolledAt: new Date() }, true)).toBe(true);
    expect(keepsPolo({ poloId: 1, poloSource: "flow" }, true)).toBe(true);
    expect(keepsPolo({ poloId: 1, poloSource: "city" })).toBe(true);
    expect(keepsPolo({ poloId: 1, poloSource: "city" }, true)).toBe(false);
    expect(keepsPolo({ poloId: 1, poloSource: "wallet" })).toBe(false);
    expect(keepsPolo({ poloId: null, poloSource: null })).toBe(false);
  });

  it("cidade atendida: o polo da cidade, mesmo com o consultor em outro polo", async () => {
    state.members = [{ userId: 5, poloId: 2, role: "comercial" }];
    state.resolution = found(1);
    const lead = leadOf({ city: "Porto Velho", ownerId: 5 });
    const r = await settleLeadPolo(lead);
    expect(r.polo?.id).toBe(1);
    expect(lead).toMatchObject({ poloId: 1, practicePoloId: null, poloSource: "city" });
  });

  it("cidade não atendida (ou com mais de um polo): fica sem polo, a carteira não entra", async () => {
    state.members = [{ userId: 5, poloId: 2, role: "comercial" }];
    const lead = leadOf({ city: "Cidade Sem Polo", ownerId: 5 });
    expect((await settleLeadPolo(lead)).polo).toBeNull();
    expect(lead.poloId).toBeNull();
    state.resolution = { status: "ambiguous", polo: null, candidates: [polos[1], polos[2]], state: "RO" };
    const other = leadOf({ state: "RO", ownerId: 5 });
    expect((await settleLeadPolo(other)).polo).toBeNull();
    expect(other.update).not.toHaveBeenCalled();
  });

  it("sem cidade: o polo comercial do responsável; em dois polos (ou só como tutor) fica sem polo", async () => {
    state.members = [{ userId: 5, poloId: 2, role: "comercial" }, { userId: 5, poloId: 3, role: "tutoria" }];
    const lead = leadOf({ ownerId: 5 });
    await settleLeadPolo(lead);
    expect(lead).toMatchObject({ poloId: 2, poloSource: "wallet" });
    expect(vi.mocked(addActivity).mock.calls[0][3]).toBe("Polo definido pela carteira de Ana: Ji-Paraná");

    state.members = [{ userId: 6, poloId: 2, role: "comercial" }, { userId: 6, poloId: 3, role: "comercial" }];
    const two = leadOf({ ownerId: 6 });
    await settleLeadPolo(two);
    expect(two.poloId).toBeNull();
    const nobody = leadOf({});
    await settleLeadPolo(nobody);
    expect(nobody.poloId).toBeNull();
  });

  it("a cidade informada depois substitui o polo da carteira, e uma cidade não atendida o retira", async () => {
    state.resolution = found(1);
    const lead = leadOf({ ownerId: 5, poloId: 2, poloSource: "wallet" });
    const r = await settleLeadPolo(lead, { cityHint: "Porto Velho" });
    expect(r.cityPolo?.id).toBe(1);
    expect(lead).toMatchObject({ poloId: 1, poloSource: "city" });

    state.resolution = none;
    const gone = leadOf({ ownerId: 5, poloId: 2, poloSource: "wallet" });
    await settleLeadPolo(gone, { cityHint: "Cidade Sem Polo" });
    expect(gone).toMatchObject({ poloId: null, poloSource: null });
  });

  it("polo já definido pela cidade não muda sozinho; muda quando a cidade é editada", async () => {
    state.resolution = found(3);
    const lead = leadOf({ city: "Ariquemes", poloId: 1, poloSource: "city" });
    expect((await settleLeadPolo(lead)).changed).toBe(false);
    expect(lead.poloId).toBe(1);
    await settleLeadPolo(lead, { placeChanged: true });
    expect(lead.poloId).toBe(3);
  });

  it("curso semipresencial: matrícula no polo liberado e o polo da cidade guardado; trocar de curso desfaz", async () => {
    state.resolution = found(3);
    state.enrollAt = 1;
    const lead = leadOf({ city: "Ariquemes" });
    await settleLeadPolo(lead);
    expect(lead).toMatchObject({ poloId: 1, practicePoloId: 3, poloSource: "city" });
    state.enrollAt = null;
    await refreshCoursePolo(lead);
    expect(lead).toMatchObject({ poloId: 3, practicePoloId: null, poloSource: "city" });
  });

  it("matriculado e polo escolhido no fluxo ficam como estão", async () => {
    state.resolution = found(3);
    const enrolled = leadOf({ city: "Ariquemes", poloId: 1, poloSource: "enrollment", enrolledAt: new Date() });
    await settleLeadPolo(enrolled, { placeChanged: true });
    const flow = leadOf({ city: "Ariquemes", poloId: 2, poloSource: "flow" });
    await settleLeadPolo(flow, { placeChanged: true });
    await refreshCoursePolo(flow);
    expect(enrolled.poloId).toBe(1);
    expect(flow.poloId).toBe(2);
    expect(enrolled.update).not.toHaveBeenCalled();
    expect(flow.update).not.toHaveBeenCalled();
  });
});
