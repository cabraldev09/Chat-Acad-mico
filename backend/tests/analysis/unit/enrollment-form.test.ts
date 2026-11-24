import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../src/helpers/AppSettings", () => ({ getSetting: async (_k: string, fallback = "") => fallback, setSetting: async () => undefined }));
vi.mock("../../../src/libs/socket", () => ({ getIO: () => ({ emit: () => undefined, to: () => ({ emit: () => undefined }) }) }));
vi.mock("../../../src/services/NotificationServices/Notify", () => ({ notify: async () => 1 }));
vi.mock("../../../src/services/CrmServices/Documents", () => ({ ensureDocuments: async () => undefined, setDocumentStatus: async () => undefined }));
vi.mock("../../../src/services/CrmServices/LeadCore", () => ({ addActivity: async () => undefined, loadLead: async () => ({}) }));
vi.mock("../../../src/models/Contact", () => ({ default: { findByPk: async () => null } }));
vi.mock("../../../src/models/Course", () => ({ default: { findByPk: async () => null } }));
vi.mock("../../../src/models/LeadDocument", () => ({ default: {} }));
vi.mock("../../../src/models/Lead", () => ({ default: { findOne: async () => null } }));
vi.mock("../../../src/models/LeadCommercial", () => ({ default: {} }));
vi.mock("../../../src/analysis/Store", () => ({ createStudent: async () => ({}), normalizeRgm: (v: string) => v, issueToken: async () => "tok1234567890abcdef" }));
const sent: any[] = [];
vi.mock("../../../src/services/MailServices/SendMail", () => ({ mailConfigured: async () => true, sendMail: async (m: any) => { sent.push(m); } }));
vi.mock("../../../src/services/MailServices/Templates", () => ({ studentLinkMail: (_k: string, name: string, link: string) => ({ subject: `Portal ${name}`, html: link, text: link }) }));
let stored: any = null;
vi.mock("../../../src/models/EnrollmentForm", () => ({ default: { findOne: async () => stored } }));

import { normalizeField, problemOf, stateOf } from "../../../src/services/CrmServices/EnrollmentForm";
import { portalAccessAtEnrollment } from "../../../src/services/CrmServices/EnrollStudent";
import { sealSecret } from "../../../src/helpers/Secrets";

const full = { nome: "Ana Ficha da Silva", nascimento: "2000-05-10", cpf: "52998224725", rgNumero: "1234567", rgOrgao: "SSP", rgUf: "RO", mae: "Maria da Silva", cep: "76800000", rua: "Rua A", numero: "10", bairro: "Centro", cidade: "Porto Velho", uf: "RO", celular: "5569999990000", email: "ana@exemplo.com" };
const front = { kind: "doc_frente", file: "x.bin", name: "frente.jpg", mime: "image/jpeg", size: 10, at: "" };
const back = { ...front, kind: "doc_verso" };

describe("ficha de matrícula", () => {
  it("o progresso conta os campos certos, as duas fotos do documento e a autorização da LGPD", () => {
    expect(stateOf({}, [], false).progress).toBe(0);
    expect(stateOf(full, [], false).progress).toBeLessThan(100);
    const ready = stateOf(full, [front, back], true);
    expect(ready.progress).toBe(100);
    expect(ready.ready).toBe(true);
    // um PDF na frente vale pelos dois lados
    expect(stateOf(full, [{ ...front, mime: "application/pdf" }], true).ready).toBe(true);
    // sem a autorização não fica pronta
    expect(stateOf(full, [front, back], false).missing).toContain("Autorização de uso dos dados (LGPD)");
  });

  it("campo errado não conta e diz o problema em português", () => {
    const s = stateOf({ ...full, cpf: "11111111111", email: "ana@", uf: "XX" }, [front, back], true);
    expect(s.ready).toBe(false);
    expect(s.problems.cpf).toMatch(/CPF/);
    expect(s.problems.email).toMatch(/e-mail/);
    expect(s.problems.uf).toMatch(/sigla/);
    expect(problemOf("nome", "Ana")).toMatch(/sobrenome/);
  });

  it("guarda os campos limpos: só dígitos no CPF, CEP e celular, e-mail minúsculo, UF maiúscula", () => {
    expect(normalizeField("cpf", "529.982.247-25")).toBe("52998224725");
    expect(normalizeField("cep", "76800-000")).toBe("76800000");
    expect(normalizeField("email", " Ana@Exemplo.COM ")).toBe("ana@exemplo.com");
    expect(normalizeField("uf", "ro")).toBe("RO");
    expect(normalizeField("nascimento", "10/05/2000")).toBe("");
  });
});

describe("matrícula confirmada: o e-mail da ficha vai para o aluno do portal com o convite", () => {
  beforeEach(() => { sent.length = 0; });
  const lead = () => { const l: any = { id: 7, email: "antigo@exemplo.com", set(v: any) { Object.assign(this, v); }, save: async () => undefined }; return l; };
  const student = () => { const s: any = { id: 3, name: "Ana", email: null, activatedAt: null, blockedAt: null, set(v: any) { Object.assign(this, v); }, save: async () => undefined }; return s; };

  it("com a ficha enviada, o e-mail dela atualiza o lead e o aluno, e o convite sai para esse e-mail", async () => {
    stored = { submittedAt: new Date(), data: sealSecret(JSON.stringify(full)) };
    const l = lead();
    const s = student();
    const warnings: string[] = [];
    await portalAccessAtEnrollment(l, s, warnings);
    expect(l.email).toBe("ana@exemplo.com");
    expect(s.email).toBe("ana@exemplo.com");
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("ana@exemplo.com");
    expect(sent[0].html).toContain("/portal/ativar/tok1234567890abcdef");
    expect(warnings).toHaveLength(0);
  });

  it("sem ficha, usa o e-mail do lead; um aluno que já ativou o acesso não recebe outro convite", async () => {
    stored = null;
    const s = student();
    await portalAccessAtEnrollment(lead(), s, []);
    expect(s.email).toBe("antigo@exemplo.com");
    expect(sent).toHaveLength(1);
    const active = { ...student(), email: "x@y.com", activatedAt: new Date() };
    await portalAccessAtEnrollment(lead(), active, []);
    expect(sent).toHaveLength(1);
  });
});
