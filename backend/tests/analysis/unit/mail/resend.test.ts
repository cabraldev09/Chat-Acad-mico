import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// the settings live in memory here (the real ones are rows of the database)
const settings: Record<string, string> = {};
vi.mock("../../../../src/helpers/AppSettings", () => ({
  getSetting: async (key: string, fallback = "") => (key in settings ? settings[key] : fallback),
  setSetting: async (key: string, value: string) => { settings[key] = value; }
}));

// the people of the team (the real ones are rows of the database)
let people: Array<{ name: string; email: string; profile?: string }> = [];
vi.mock("../../../../src/models/User", () => ({
  default: { findAll: async ({ where }: any = {}) => people.filter(p => !where?.profile || p.profile === where.profile).map(({ name, email }) => ({ name, email })) }
}));

import { MAIL_CATALOG } from "../../../../src/services/MailServices/Templates";
import { LOGO_CID } from "../../../../src/services/MailServices/Logo";
import { MailConfig, mailConfigured, readMailConfig, resendPayload, sendMail } from "../../../../src/services/MailServices/SendMail";
import { handleInbound } from "../../../../src/services/MailServices/Inbound";
import { aliasOf, aliasTable, forwardTargets } from "../../../../src/services/MailServices/Aliases";

const cfg = (over: Partial<MailConfig> = {}): MailConfig => ({
  provider: "resend", host: "", port: 465, secure: true, user: "", pass: "", fromName: "Cruzeiro do Sul Virtual",
  resendKey: "re_test_123456789", fromEmail: "nao-responda@mail.cruzeirodosulvirtual.app.br", replyTo: "", ...over
});

// what the SDK sends to the API, captured from fetch
let calls: Array<{ url: string; init: any }> = [];
const answer = (status: number, body: any, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
let replies: Array<() => Response> = [];
beforeEach(() => {
  calls = [];
  replies = [];
  Object.keys(settings).forEach(k => delete settings[k]);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => { calls.push({ url: String(url), init }); const next = replies.shift(); return next ? next() : answer(200, { id: "em_1" }); }));
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const useResend = () => Object.assign(settings, { mail_provider: "resend", mail_resend_key: "re_test_123456789", mail_from_email: "nao-responda@mail.cruzeirodosulvirtual.app.br", mail_from_name: "Cruzeiro do Sul Virtual" });
const run = async <T>(p: Promise<T>): Promise<T> => { const out = p; await vi.runAllTimersAsync(); return out; };

describe("e-mail pelo Resend", () => {
  it("o provedor e a configuração saem das configurações; sem chave ou remetente não está configurado", async () => {
    expect((await readMailConfig()).provider).toBe("smtp");
    settings.mail_provider = "resend";
    expect(await mailConfigured()).toBe(false);
    useResend();
    expect(await mailConfigured()).toBe(true);
  });

  it("o remetente, o logo embutido (content_id) e o reply-to vão no corpo", () => {
    const body = MAIL_CATALOG[0].build();
    const p: any = resendPayload(cfg({ replyTo: "atendimento@mail.cruzeirodosulvirtual.app.br" }), { to: "aluno@x.com", ...body });
    expect(p.from).toBe("Cruzeiro do Sul Virtual <nao-responda@mail.cruzeirodosulvirtual.app.br>");
    expect(p.to).toEqual(["aluno@x.com"]);
    expect(p.replyTo).toBe("atendimento@mail.cruzeirodosulvirtual.app.br");
    expect(p.attachments[0]).toMatchObject({ contentId: LOGO_CID, contentType: "image/png" });
    expect(Buffer.from(p.attachments[0].content, "base64").subarray(1, 4).toString()).toBe("PNG");
  });

  it("envia pela API com a chave, a chave de idempotência e o id devolvido", async () => {
    useResend();
    await run(sendMail({ to: "aluno@x.com", subject: "Oi", text: "t", html: "<p>t</p>", idempotencyKey: "password-reset/abc" }));
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/emails$/);
    const h = new Headers(calls[0].init.headers);
    expect(h.get("authorization")).toBe("Bearer re_test_123456789");
    expect(h.get("idempotency-key")).toBe("password-reset/abc");
    expect(JSON.parse(calls[0].init.body)).toMatchObject({ subject: "Oi", to: ["aluno@x.com"] });
  });

  it("tenta de novo em 429 e 5xx com a mesma chave; não insiste num 4xx", async () => {
    useResend();
    replies = [() => answer(429, { statusCode: 429, name: "rate_limit_exceeded", message: "slow down" }), () => answer(500, { statusCode: 500, name: "internal_server_error", message: "x" })];
    await run(sendMail({ to: "a@x.com", subject: "s", text: "t", html: "h" }));
    expect(calls).toHaveLength(3);
    const keys = calls.map(c => new Headers(c.init.headers).get("idempotency-key"));
    expect(new Set(keys).size).toBe(1);

    calls = [];
    replies = [() => answer(422, { statusCode: 422, name: "validation_error", message: "bad from" })];
    const failed = sendMail({ to: "a@x.com", subject: "s", text: "t", html: "h" }).catch(e => e);
    await vi.runAllTimersAsync();
    expect(await failed).toMatchObject({ message: "ERR_MAIL_SEND_FAILED" });
    expect(calls).toHaveLength(1);
  });
});

describe("endereço de cada pessoa", () => {
  it("vem do primeiro e do último nome, sem acento nem partículas", () => {
    expect(aliasOf("João da Silva")).toBe("joao.silva");
    expect(aliasOf("  MARIA  José dos Santos ")).toBe("maria.santos");
    expect(aliasOf("Cláudia")).toBe("claudia");
    expect(aliasOf("")).toBe("");
  });

  it("o e-mail vai ao dono; endereço sem dono e nome repetido vão para a gerência", () => {
    const table = aliasTable([
      { name: "João Silva", email: "joao@gmail.com" }, { name: "Ana Souza", email: "ana1@gmail.com" }, { name: "Ana de Souza", email: "ana2@gmail.com" }, { name: "Sem Email", email: "" }
    ]);
    const d = "mail.cruzeirodosulvirtual.app.br";
    expect(forwardTargets([`joao.silva@${d}`], d, table, ["gerencia@x.com"])).toEqual(["joao@gmail.com"]);
    expect(forwardTargets([`"João" <Joao.Silva@${d}>`], d, table, ["gerencia@x.com"])).toEqual(["joao@gmail.com"]);
    expect(forwardTargets([`atendimento@${d}`], d, table, ["gerencia@x.com"])).toEqual(["gerencia@x.com"]);
    expect(forwardTargets([`ana.souza@${d}`], d, table, ["gerencia@x.com"])).toEqual(["gerencia@x.com"]);
    expect(forwardTargets([`joao.silva@${d}`, `atendimento@${d}`, "outro@gmail.com"], d, table, ["gerencia@x.com"])).toEqual(["joao@gmail.com", "gerencia@x.com"]);
  });
});

describe("e-mails recebidos são encaminhados à equipe", () => {
  // a webhook signed like Resend (Svix): base64 HMAC-SHA256 of "id.timestamp.body" with the secret after "whsec_"
  const key = Buffer.from("segredo-de-teste-123456").toString("base64");
  const secret = `whsec_${key}`;
  const sign = (body: string, id = "msg_1", ts = String(Math.floor(Date.now() / 1000))) =>
    ({ id, timestamp: ts, signature: `v1,${createHmac("sha256", Buffer.from(key, "base64")).update(`${id}.${ts}.${body}`).digest("base64")}` });
  const received = JSON.stringify({ type: "email.received", created_at: new Date().toISOString(), data: { email_id: "in_42", from: "aluno@x.com", to: ["atendimento@mail.cruzeirodosulvirtual.app.br"], subject: "Dúvida" } });

  beforeEach(() => { useResend(); people = []; Object.assign(settings, { mail_inbound_secret: secret, mail_forward_to: "equipe@cruzeiro.com" }); });

  it("recusa um pedido sem assinatura válida e não encaminha nada", async () => {
    const bad = await handleInbound(received, { ...sign(received), signature: "v1,AAAA" });
    expect(bad.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("um e-mail recebido de verdade é encaminhado uma vez (idempotência pelo id) para o endereço da equipe", async () => {
    replies = [
      () => answer(200, { object: "email", id: "in_42", from: "aluno@x.com", to: ["atendimento@mail.cruzeirodosulvirtual.app.br"], subject: "Dúvida", created_at: "2026-11-11", text: "Qual o prazo?", html: null, reply_to: null, raw: { download_url: "https://files.resend.test/in_42.eml" } }),
      () => new Response("From: aluno@x.com\r\nSubject: Dúvida\r\n\r\nQual o prazo?", { status: 200 })
    ];
    const r = await run(handleInbound(received, sign(received)));
    expect(r).toMatchObject({ status: 200, body: { forwarded: true } });
    expect(calls[0].url).toMatch(/\/emails\/receiving\/in_42$/);
    expect(calls[1].url).toBe("https://files.resend.test/in_42.eml");
    const fwd = calls[2];
    expect(new Headers(fwd.init.headers).get("idempotency-key")).toBe("inbound-forward/in_42/equipe@cruzeiro.com");
    const body = JSON.parse(fwd.init.body);
    expect(body.to).toEqual(["equipe@cruzeiro.com"]);
    expect(body.reply_to).toEqual(["aluno@x.com"]);
    expect(body.subject).toBe("Fwd: Dúvida");
    expect(body.text).toContain("Qual o prazo?");
    expect(body.attachments[0]).toMatchObject({ filename: "mensagem-original.eml", content_type: "message/rfc822" });
  });

  it("o e-mail para o endereço de uma pessoa vai para o e-mail dela; sem gerência, o sem dono vai aos administradores", async () => {
    people = [{ name: "João da Silva", email: "joao@gmail.com" }, { name: "Admin Geral", email: "admin@x.com", profile: "admin" }];
    delete settings.mail_forward_to;
    const body = JSON.stringify({ type: "email.received", created_at: new Date().toISOString(), data: { email_id: "in_7", from: "aluno@x.com", to: ["joao.silva@mail.cruzeirodosulvirtual.app.br", "atendimento@mail.cruzeirodosulvirtual.app.br"], subject: "Oi" } });
    replies = [() => answer(200, { object: "email", id: "in_7", from: "aluno@x.com", to: ["joao.silva@mail.cruzeirodosulvirtual.app.br"], subject: "Oi", created_at: "2026-11-11", text: "oi", html: null, reply_to: null, raw: null })];
    const r = await run(handleInbound(body, sign(body)));
    expect(r).toMatchObject({ status: 200, body: { forwarded: true, count: 2 } });
    const sends = calls.filter(c => /\/emails$/.test(c.url));
    expect(sends.map(c => JSON.parse(c.init.body).to[0])).toEqual(["joao@gmail.com", "admin@x.com"]);
    expect(sends.map(c => new Headers(c.init.headers).get("idempotency-key"))).toEqual(["inbound-forward/in_7/joao@gmail.com", "inbound-forward/in_7/admin@x.com"]);
  });

  it("outros eventos são ignorados", async () => {
    const other = JSON.stringify({ type: "email.delivered", created_at: new Date().toISOString(), data: { email_id: "em_1" } });
    const r = await handleInbound(other, sign(other));
    expect(r).toMatchObject({ status: 200, body: { ignored: "email.delivered" } });
  });
});
