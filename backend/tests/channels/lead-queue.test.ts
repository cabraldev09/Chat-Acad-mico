import { beforeEach, describe, expect, it, vi } from "vitest";

// the setting of the common queue, switched by each test
let queueMode = "false";
vi.mock("../../src/helpers/AppSettings", () => ({ getSetting: async (key: string, fallback = "") => (key === "crm_queue_mode" ? queueMode : fallback), setSetting: async () => undefined }));
vi.mock("../../src/models/PoloMember", () => ({ default: { findAll: async () => [] } }));
vi.mock("../../src/models/UserQueue", () => ({ default: { findAll: async () => [] } }));
vi.mock("../../src/models/Queue", () => ({ default: { findAll: async () => [] } }));
vi.mock("../../src/models/Lead", () => ({ default: { findOne: async () => null, findByPk: async () => null } }));
vi.mock("../../src/models/Contact", () => ({ default: { findByPk: async () => null } }));

import { Op } from "sequelize";
import { firstNameOf, isPlainPerson, isQueueLead, queueLeadSql, queueLeadWhere, queueTicketSql, redactQueueLead } from "../../src/helpers/LeadQueue";
import { leadReadScopeWhere, leadScopeWhere } from "../../src/middleware/scope";
import { connectionScopeOf, contactScopeWhere, ticketScopeWhere, ticketVisibleIn } from "../../src/helpers/ConnectionScope";

const req = (user: any) => ({ user } as any);
const consultor = req({ id: 7, profile: "user", role: "consultor" });

beforeEach(() => { queueMode = "false"; });

describe("fila comum: quem está na fila", () => {
  const base = { ownerId: null, enrolledAt: null, wonAt: null, lostAt: null, isHistorical: false, onboardingStatus: "none" };
  it("lead novo, sem dono, do funil de vendas está na fila", () => {
    expect(isQueueLead(base)).toBe(true);
    expect(isQueueLead({ ...base, onboardingStatus: undefined })).toBe(true);
  });
  it("com dono, matriculado, ganho, perdido, histórico do celular ou aluno da tutoria não está", () => {
    expect(isQueueLead({ ...base, ownerId: 3 })).toBe(false);
    expect(isQueueLead({ ...base, enrolledAt: new Date() })).toBe(false);
    expect(isQueueLead({ ...base, wonAt: new Date() })).toBe(false);
    expect(isQueueLead({ ...base, lostAt: new Date() })).toBe(false);
    expect(isQueueLead({ ...base, isHistorical: true })).toBe(false);
    expect(isQueueLead({ ...base, onboardingStatus: "pending" })).toBe(false);
  });
  it("o filtro do Sequelize e o do SQL dizem a mesma coisa", () => {
    const where = queueLeadWhere();
    expect(where.ownerId).toEqual({ [Op.is]: null });
    expect(Object.keys(where).sort()).toEqual(["enrolledAt", "isHistorical", "lostAt", "onboardingStatus", "ownerId", "wonAt"]);
    const sql = queueLeadSql("l");
    ["ownerId", "enrolledAt", "wonAt", "lostAt", "isHistorical", "onboardingStatus"].forEach(c => expect(sql).toContain(`l."${c}"`));
  });
  it("a conversa da fila: sem atendente, privada, de vendas, de lead da fila ou de pessoa comum sem lead (nunca equipe ou pessoal)", () => {
    const sql = queueTicketSql('"Ticket"');
    expect(sql).toContain('"Ticket"."userId" IS NULL');
    expect(sql).toContain('"Ticket"."isGroup" = false');
    expect(sql).toContain(`'sales'`);
    expect(sql).toContain('"isStaff" = false');
    expect(sql).toContain('"isPersonal" = false');
    expect(isPlainPerson({ isStaff: false, isPersonal: false, kind: "person" })).toBe(true);
    expect(isPlainPerson({ isStaff: true, isPersonal: false, kind: "person" })).toBe(false);
    expect(isPlainPerson({ isStaff: false, isPersonal: true, kind: "person" })).toBe(false);
    expect(isPlainPerson({ isStaff: false, isPersonal: false, kind: "channel" })).toBe(false);
    expect(isPlainPerson(null)).toBe(false);
  });
  it("só o primeiro nome vai a quem perdeu a disputa", () => {
    expect(firstNameOf("Maria da Silva")).toBe("Maria");
    expect(firstNameOf(null)).toBe("");
  });
});

describe("fila comum: o consultor lê a fila, mas só age no que é seu", () => {
  it("desligada: nada muda, o consultor lê só os próprios leads", async () => {
    expect(await leadReadScopeWhere(consultor)).toEqual({ ownerId: 7 });
  });
  it("ligada: lê os próprios e os da fila; o escopo de agir continua só os próprios", async () => {
    queueMode = "true";
    const read: any = await leadReadScopeWhere(consultor);
    expect(read[Op.or]).toEqual([{ ownerId: 7 }, queueLeadWhere()]);
    expect(await leadScopeWhere(consultor)).toEqual({ ownerId: 7 });
  });
  it("os outros perfis não ganham a fila", async () => {
    queueMode = "true";
    expect(await leadReadScopeWhere(req({ id: 1, profile: "admin", role: "admin" }))).toBeNull();
    expect(await leadReadScopeWhere(req({ id: 9, profile: "user", role: "tutor" }))).toEqual(await leadScopeWhere(req({ id: 9, profile: "user", role: "tutor" })));
    expect(await leadReadScopeWhere(req({ id: 5, profile: "user", role: "relacionamento" }))).toEqual(await leadScopeWhere(req({ id: 5, profile: "user", role: "relacionamento" })));
  });
});

describe("fila comum: conversas e contatos", () => {
  const scope = { all: false, own: [1], others: [2] };
  it("desligada, a lista de conversas é a de sempre", () => {
    const where = ticketScopeWhere(scope, 7, false);
    expect(where[Op.or]).toHaveLength(3);
  });
  it("ligada, entra a conversa da fila (também no QR de outra pessoa)", () => {
    const where = ticketScopeWhere(scope, 7, true);
    expect(where[Op.or]).toHaveLength(4);
  });
  it("a conversa com atendente de QR alheio continua escondida", () => {
    const t = { isGroup: false, whatsappId: 2, userId: 8, segment: "sales" };
    expect(ticketVisibleIn(scope, t, 7)).toBe(false);
  });
  it("o contato de lead da fila só entra na lista de contatos quando a fila está ligada", () => {
    const text = (w: any) => w.val || String(w);
    expect(text(contactScopeWhere(scope, 7, false))).not.toContain("queue");
    const on = text(contactScopeWhere(scope, 7, true));
    expect(on).toContain('"Contact"."isGroup" = false AND EXISTS');
    expect(on).toContain('ql."ownerId" IS NULL');
  });
  it("a administração e a coordenação não passam por esse filtro", async () => {
    expect(await connectionScopeOf(1, "admin")).toEqual({ all: true, own: [], others: [] });
  });
});

describe("fila comum: o que o consultor vê do lead antes de assumir", () => {
  const lead = {
    id: 4, name: "Pessoa Teste", phone: "5511999990000", email: "a@b.c", cpf: "11144477735", notes: "anotação", city: "Cidade", state: "UF", courseId: 2, course: { id: 2, name: "Curso" },
    source: "WhatsApp", stageId: 1, stage: { id: 1, name: "Novo" }, contactId: 9, ownerId: null, motivation: "x", financing: "y", enemScore: 700, commercial: { temperature: "hot" }, payments: [{ id: 1 }], tags: [{ id: 1 }]
  };
  it("mostra nome, telefone, curso, cidade e origem; esconde CPF, e-mail, notas e o resto", () => {
    const card = redactQueueLead(lead);
    expect(card).toMatchObject({ id: 4, name: "Pessoa Teste", phone: "5511999990000", city: "Cidade", source: "WhatsApp", inQueue: true });
    ["cpf", "email", "notes", "motivation", "financing", "enemScore"].forEach(k => expect(card[k]).toBeUndefined());
    expect(card.commercial).toBeNull();
    expect(card.payments).toEqual([]);
    expect(card.tags).toEqual([]);
  });
});
