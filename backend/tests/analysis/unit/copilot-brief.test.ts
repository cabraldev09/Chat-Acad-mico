import { beforeEach, describe, expect, it, vi } from "vitest";

// the conversations of one client and their messages (newest first, as the query asks)
let tickets: any[] = [];
let messages: any[] = [];
let requests: any[] = [];
let scopedInstitutionId: number | null = null;
let legacyInstitution = 1;

vi.mock("../../../src/models/Ticket", () => ({ default: { findAll: async ({ where }: any) => {
  const scope = where[Symbol.for("and")] || where[Object.getOwnPropertySymbols(where).find(s => String(s).includes("and")) as any];
  const allowed = Array.isArray(scope) ? scope.flatMap((part: any) => part[Object.getOwnPropertySymbols(part).find(s => String(s).includes("or")) as any] || []).filter((part: any) => Object.prototype.hasOwnProperty.call(part, "institutionId")) : [];
  return tickets.filter(t => {
    if (where.id && t.id !== where.id) return false;
    if (where.contactId && t.contactId !== where.contactId) return false;
    return !allowed.length || allowed.some((part: any) => part.institutionId === t.institutionId || (part.institutionId === null && t.institutionId == null));
  });
} } }));
vi.mock("../../../src/models/User", () => ({ default: { findAll: async () => [{ id: 5, name: "Gabrielli" }, { id: 6, name: "João Vitor" }] } }));
vi.mock("../../../src/models/Message", () => ({ default: { findAll: async ({ limit, where }: any) => {
  const symbols = Object.getOwnPropertySymbols(where.ticketId || {});
  const ids = (where.ticketId && where.ticketId[symbols.find(s => String(s).includes("in")) as any]) || [];
  return messages.filter(m => ids.includes(m.ticketId)).slice(0, limit);
} } }));
vi.mock("../../../src/helpers/AppTime", () => ({ getAppTz: () => "America/Porto_Velho" }));
vi.mock("../../../src/helpers/Institution", () => ({
  currentInstitutionId: () => scopedInstitutionId,
  legacyInstitutionId: async () => legacyInstitution,
  institutionFor: async ({ ticket }: any) => ({ id: ticket?.institutionId || legacyInstitution }),
  institutionName: () => "Universidade teste"
}));
vi.mock("../../../src/models/CopilotRequest", () => ({
  default: { findOne: async ({ where }: any) => requests.filter(r => r.ticketId === where.ticketId && r.userId === where.userId && r.outcome === where.outcome).pop() || null }
}));

import { contactTranscript, parseBrief } from "../../../src/services/CopilotServices/Brief";
import { closeness, noteSuggestionSent } from "../../../src/services/CopilotServices/Feedback";

const at = (min: number) => new Date(Date.UTC(2026, 10, 12, 12, min));

describe("resumo do cliente para o consultor", () => {
  beforeEach(() => {
    scopedInstitutionId = null;
    legacyInstitution = 1;
    tickets = [{ id: 1, contactId: 9, userId: 5, lastUserId: null }, { id: 2, contactId: 9, userId: null, lastUserId: 6 }];
    // newest first
    messages = [
      { id: "m4", ticketId: 2, fromMe: false, body: "voltei, ainda dá para entrar em 2027/1?", mediaType: "chat", createdAt: at(40) },
      { id: "m3", ticketId: 1, fromMe: true, body: "‎Olá! Sou o assistente virtual.", mediaType: "chat", createdAt: at(3) },
      { id: "m2", ticketId: 1, fromMe: true, body: "*Gabrielli:*\nClaro, te mando a grade de Pedagogia.", mediaType: "chat", createdAt: at(2) },
      { id: "m1", ticketId: 1, fromMe: false, body: "", mediaType: "image", createdAt: at(1) }
    ];
  });

  it("keeps another university's ticket text out while retaining NULL legacy tickets for that institution", async () => {
    // No AsyncLocal wrapper: this must still derive the target's university from its ticket.
    scopedInstitutionId = null;
    legacyInstitution = 1;
    tickets = [
      { id: 10, contactId: 9, institutionId: 1, segment: "consultant", userId: 5, lastUserId: null },
      { id: 11, contactId: 9, institutionId: 2, segment: "consultant", userId: 6, lastUserId: null },
      { id: 12, contactId: 9, institutionId: null, segment: "consultant", userId: null, lastUserId: 5 }
    ];
    messages = [
      { id: "a", ticketId: 10, fromMe: false, body: "atendimento da A", mediaType: "chat", createdAt: at(1) },
      { id: "b", ticketId: 11, fromMe: false, body: "dado privado da B", mediaType: "chat", createdAt: at(2) },
      { id: "legacy", ticketId: 12, fromMe: false, body: "histórico legado da A", mediaType: "chat", createdAt: at(3) }
    ];

    const transcript = await contactTranscript({ id: 10, contactId: 9, segment: "consultant" } as any);
    expect(transcript.text).toContain("atendimento da A");
    expect(transcript.text).toContain("histórico legado da A");
    expect(transcript.text).not.toContain("dado privado da B");
    expect(transcript.conversations).toBe(2);
  });

  it("does not fall back to a direct ticket-message query when context and ticket institutions disagree", async () => {
    scopedInstitutionId = 2;
    tickets = [{ id: 10, contactId: 9, institutionId: 1, segment: "consultant", userId: 5, lastUserId: null }];
    messages = [{ id: "a", ticketId: 10, fromMe: false, body: "conteúdo da outra instituição", mediaType: "chat", createdAt: at(1) }];

    const transcript = await contactTranscript({ id: 10, contactId: 9, institutionId: 1, segment: "consultant" } as any, 60, true);
    expect(transcript.text).toBe("");
    expect(transcript.lastMessageId).toBeNull();
  });

  it("junta os atendimentos anteriores, em ordem, dizendo quem falou e tirando a assinatura", async () => {
    const t = await contactTranscript({ id: 2, contactId: 9 } as any);
    const lines = t.text.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/Cliente: \[image\]$/);
    expect(lines[1]).toMatch(/Consultor \(Gabrielli\): Claro, te mando a grade de Pedagogia\.$/);
    expect(lines[2]).toMatch(/Robô: Olá! Sou o assistente virtual\.$/);
    expect(lines[3]).toMatch(/Cliente: voltei/);
    expect(t.lastMessageId).toBe("m4");
    expect(t.conversations).toBe(2);
    expect(t.attendants.sort()).toEqual(["Gabrielli", "João Vitor"]);
  });

  it("lê o JSON da IA mesmo com texto em volta e recusa o que não é resumo", () => {
    const b = parseBrief('Aqui está:\n```json\n{"resumo":"Quer Pedagogia EAD.","interesse":"Pedagogia","pendencias":["enviar grade",""],"objecoes":"x","proximoPasso":"Enviar a grade","mensagemSugerida":"Oi!"}\n```');
    expect(b).toEqual({ resumo: "Quer Pedagogia EAD.", interesse: "Pedagogia", pendencias: ["enviar grade"], objecoes: [], proximoPasso: "Enviar a grade", mensagemSugerida: "Oi!", encaminhar: "" });
    expect(parseBrief('{"resumo":"Dúvida da prova","encaminhar":"tutoria"}')?.encaminhar).toBe("tutoria");
    expect(parseBrief('{"resumo":"x","encaminhar":"financeiro"}')?.encaminhar).toBe("");
    expect(parseBrief("não sei")).toBeNull();
    expect(parseBrief('{"resumo":""}')).toBeNull();
    expect(parseBrief("{quebrado")).toBeNull();
  });
});

describe("sugestão usada, editada ou descartada", () => {
  beforeEach(() => { requests = []; });

  it("mede quanto da sugestão foi enviado", () => {
    expect(closeness("Olá, Maria! Posso te enviar a grade?", "olá maria, posso te enviar a grade?")).toBe(1);
    expect(closeness("Olá, Maria! Posso te enviar a grade?", "Oi Maria, quer a grade?")).toBeGreaterThan(0.3);
    expect(closeness("Olá, Maria! Posso te enviar a grade?", "ok")).toBe(0);
    expect(closeness("", "qualquer")).toBe(0);
  });

  it("a mensagem enviada depois de 'Usar e editar' marca a sugestão (ignorando a assinatura)", async () => {
    const taken = { ticketId: 3, userId: 5, outcome: "taken", text: "Posso te enviar a grade de Pedagogia agora?", update: vi.fn(async function (this: any, v: any) { Object.assign(this, v); }) };
    requests.push(taken);
    await noteSuggestionSent(3, 5, "*Gabrielli:*\nPosso te enviar a grade de Pedagogia agora?");
    expect(taken.outcome).toBe("used");
    const edited = { ...taken, outcome: "taken", update: vi.fn(async function (this: any, v: any) { Object.assign(this, v); }) };
    requests.push(edited);
    await noteSuggestionSent(3, 5, "Posso enviar a grade completa do curso?");
    expect(edited.outcome).toBe("edited");
  });

  it("sem sugestão levada para a caixa, nada muda", async () => {
    await expect(noteSuggestionSent(3, 5, "oi")).resolves.toBeUndefined();
  });
});
