import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/channels/meta", () => ({ GRAPH: "https://graph.test" }));
vi.mock("../../../src/channels/types", () => ({ getConfig: (w: any) => w.cfg }));
vi.mock("../../../src/services/ChannelServices/SendToContact", () => ({ default: vi.fn() }));
vi.mock("../../../src/services/ChannelServices/ConnectionTeam", () => ({ connectionOfTeam: vi.fn() }));
vi.mock("../../../src/services/TicketServices/OpeningTemplate", () => ({ windowOf: vi.fn() }));
vi.mock("../../../src/helpers/AppSettings", () => ({ getSetting: vi.fn(async (_k: string, d: string) => d), setSetting: vi.fn() }));

import { Effects, advance, resume } from "../../../src/services/FlowServices/Engine";
import { validateGraph } from "../../../src/services/FlowServices/Graph";
import { sestedGraph } from "../../../src/services/FlowServices/SestedBot";
import { readableNumber } from "../../../src/helpers/ReadableNumber";
import { SESTED_PACK, cleanDraft, paramsIn, variableAtEdge } from "../../../src/services/CampaignServices/Templates";

// The SESTED bot, walked with buttons: what it asks, what it saves, the consultant it ends with, and the paths of each kind of course.
const run = () => {
  const said: string[] = [];
  const saved: Record<string, string> = {};
  const crm: any[] = [];
  const transfers: any[] = [];
  const fx: Effects = {
    say: async t => { said.push(t); },
    readField: async () => "",
    saveField: async (k, v) => { saved[k] = v; },
    crm: async (node, vars) => {
      crm.push(node.data);
      if (node.data.action === "send_to_crm") { vars.consultor = "Ana"; vars.consultor_whatsapp = "(69) 99999-0000"; }
      return "";
    },
    transfer: async node => { transfers.push(node.data); },
    handToAi: async () => undefined,
    close: async () => undefined,
    webhook: async () => true,
    who: () => ({ name: "Maria Souza", first: "Maria" }),
    listPolos: async () => [],
    setPolo: async () => "",
    aiTurn: async () => ({ text: "" }),
    humanHandoff: async () => undefined,
    startFlow: async () => true,
    commercial: async () => undefined
  };
  const g = sestedGraph({ institutionId: 7, queueId: 3, tagId: 9 });
  let state: any = { nodeId: null, vars: {}, tries: 0 };
  const start = async () => { state = (await advance(g, "start", state, fx)).state; };
  const answer = async (text: string) => { const r = await resume(g, state, text, fx); state = r.state; return r; };
  return { fx, said, saved, crm, transfers, start, answer, state: () => state };
};

describe("bot da SESTED", () => {
  it("o fluxo instalado é válido (sem bloco solto nem saída obrigatória sem destino)", () => {
    const errors = validateGraph(sestedGraph({ institutionId: 7, queueId: 3, tagId: 9 })).filter(i => i.level === "error");
    expect(errors).toEqual([]);
  });

  it("graduação: nome, cidade, tipo, formação e primeira graduação; passa ao consultor da fila e diz o número dele", async () => {
    const b = run();
    await b.start();
    expect(b.crm[0]).toMatchObject({ action: "set_institution", institutionId: 7 });
    expect(b.said[0]).toMatch(/SESTED/);
    await b.answer("Conhecer os cursos");
    await b.answer("Maria Souza");
    await b.answer("Porto Velho");
    await b.answer("Graduação");
    await b.answer("Ensino médio completo");
    expect(b.said[b.said.length - 1]).toMatch(/primeira graduação/);
    await b.answer("Sim");
    expect(b.said[b.said.length - 1]).toMatch(/Anotei: Graduação, em Porto Velho, formação Ensino médio completo/);
    const end = await b.answer("Está certo");
    expect(b.saved).toMatchObject({ nome: "Maria Souza", cidade: "Porto Velho", tipo_curso: "Graduação", escolaridade: "Ensino médio completo", primeira_graduacao: "Sim" });
    expect(b.crm[1]).toMatchObject({ action: "send_to_crm", ownerMode: "queue", queueId: 3, institutionId: 7, tagId: 9 });
    expect(b.said.some(t => /Ana, da SESTED, vai te chamar pelo WhatsApp \(69\) 99999-0000/.test(t))).toBe(true);
    expect(b.transfers[0]).toMatchObject({ to: "lead_owner", queueId: 3 });
    expect(end.status).not.toBe("waiting");
    // no value, scholarship, deadline or emoji is said
    expect(b.said.join(" ")).not.toMatch(/R\$|bolsa|desconto|prazo|[\u{1F300}-\u{1FAFF}]/u);
  });

  it("técnico por competência pergunta a experiência na área; sem experiência sugere o técnico regular", async () => {
    const b = run();
    await b.start();
    for (const a of ["Conhecer os cursos", "João", "Ariquemes", "Técnico por competência", "Técnico"]) await b.answer(a); // eslint-disable-line no-await-in-loop
    expect(b.said[b.said.length - 1]).toMatch(/trabalha nessa área/);
    await b.answer("Não");
    expect(b.said.some(t => /técnico regular/.test(t))).toBe(true);
    // kept in the flow (the note sent to the CRM carries it); the lead has no field for it
    expect(b.state().vars.trabalha_na_area).toBe("Não");
  });

  it("pós sem superior completo explica e oferece graduação", async () => {
    const b = run();
    await b.start();
    for (const a of ["Conhecer os cursos", "Ana", "Jaru", "Pós-graduação", "Ensino médio completo"]) await b.answer(a); // eslint-disable-line no-await-in-loop
    expect(b.said[b.said.length - 1]).toMatch(/pós-graduação é para quem já concluiu uma graduação/);
    await b.answer("Graduação");
    expect(b.saved.tipo_curso).toBe("Graduação");
    expect(b.said[b.said.length - 1]).toMatch(/primeira graduação/);
  });

  it("pós com superior completo vai direto ao resumo; corrigir volta ao nome", async () => {
    const b = run();
    await b.start();
    for (const a of ["Conhecer os cursos", "Ana", "Jaru", "Pós-graduação", "Superior completo"]) await b.answer(a); // eslint-disable-line no-await-in-loop
    expect(b.said[b.said.length - 1]).toMatch(/Anotei: Pós-graduação/);
    await b.answer("Corrigir");
    expect(b.said[b.said.length - 1]).toMatch(/qual é o seu nome/i);
  });

  it("falar com consultor vai direto ao CRM; já sou aluno vai para a fila da SESTED", async () => {
    const a = run();
    await a.start();
    await a.answer("Falar com consultor");
    expect(a.crm.some(d => d.action === "send_to_crm")).toBe(true);
    const s = run();
    await s.start();
    await s.answer("Já sou aluno");
    expect(s.transfers[0]).toMatchObject({ to: "queue", queueId: 3 });
  });
});

describe("modelos da SESTED e número legível", () => {
  it("cada modelo passa nas regras da Meta (exemplos, sem variável na ponta, botões curtos) e fala em nome da SESTED", () => {
    for (const t of SESTED_PACK) {
      expect(t.name).toMatch(/^sested_[a-z0-9_]+$/);
      expect(t.examples.length).toBe(paramsIn(t.body));
      expect(variableAtEdge(t.body)).toBe(false);
      expect(t.body).toMatch(/SESTED/);
      (t.buttons || []).forEach(b => expect(b.length).toBeLessThanOrEqual(25));
      expect(() => cleanDraft(t)).not.toThrow();
    }
  });
  it("número para a pessoa ler", () => {
    expect(readableNumber("5569999990000")).toBe("(69) 99999-0000");
    expect(readableNumber("6932220000")).toBe("(69) 3222-0000");
    expect(readableNumber("")).toBe("");
  });
});
