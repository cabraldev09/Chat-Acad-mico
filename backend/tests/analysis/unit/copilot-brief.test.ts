import { beforeEach, describe, expect, it, vi } from "vitest";

// the conversations of one client and their messages (newest first, as the query asks)
let tickets: any[] = [];
let messages: any[] = [];
let requests: any[] = [];

vi.mock("../../../src/models/Ticket", () => ({ default: { findAll: async () => tickets } }));
vi.mock("../../../src/models/User", () => ({ default: { findAll: async () => [{ id: 5, name: "Gabrielli" }, { id: 6, name: "João Vitor" }] } }));
vi.mock("../../../src/models/Message", () => ({ default: { findAll: async ({ limit }: any) => messages.slice(0, limit) } }));
vi.mock("../../../src/helpers/AppTime", () => ({ getAppTz: () => "America/Porto_Velho" }));
vi.mock("../../../src/models/CopilotRequest", () => ({
  default: { findOne: async ({ where }: any) => requests.filter(r => r.ticketId === where.ticketId && r.userId === where.userId && r.outcome === where.outcome).pop() || null }
}));

import { contactTranscript, parseBrief } from "../../../src/services/CopilotServices/Brief";
import { closeness, noteSuggestionSent } from "../../../src/services/CopilotServices/Feedback";

const at = (min: number) => new Date(Date.UTC(2026, 10, 12, 12, min));

describe("resumo do cliente para o consultor", () => {
  beforeEach(() => {
    tickets = [{ id: 1, userId: 5, lastUserId: null }, { id: 2, userId: null, lastUserId: 6 }];
    // newest first
    messages = [
      { id: "m4", ticketId: 2, fromMe: false, body: "voltei, ainda dá para entrar em 2027/1?", mediaType: "chat", createdAt: at(40) },
      { id: "m3", ticketId: 1, fromMe: true, body: "‎Olá! Sou o assistente virtual.", mediaType: "chat", createdAt: at(3) },
      { id: "m2", ticketId: 1, fromMe: true, body: "*Gabrielli:*\nClaro, te mando a grade de Pedagogia.", mediaType: "chat", createdAt: at(2) },
      { id: "m1", ticketId: 1, fromMe: false, body: "", mediaType: "image", createdAt: at(1) }
    ];
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
