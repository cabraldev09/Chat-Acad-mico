const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { redact, save, MASK } = require("./e2e-logs");

// made-up values only
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.c2lnbmF0dXJlLWZhbHNh";
const API_TOKEN = `wt_${"ab12cd34".repeat(6)}`;
const none = (text, ...secrets) => secrets.forEach((s) => assert.ok(!text.includes(s), `still there: ${s}`));

test("remove cabeçalho Authorization, Bearer, cookies e jrt", () => {
  const out = redact([
    `Authorization: Bearer ${JWT}`,
    `authorization: ${API_TOKEN}`,
    `Cookie: jrt=${JWT}; outro=valor-falso`,
    `set-cookie: jrt=${JWT}; Path=/; HttpOnly; Secure`,
    `request failed with header "Authorization": "Bearer ${JWT}"`,
    `cookie jrt=${JWT}; ok`,
    `usou Bearer ${API_TOKEN} na chamada`,
  ].join("\n"));
  none(out, JWT, API_TOKEN, "valor-falso");
  assert.match(out, new RegExp(MASK.replace(/[[\]]/g, "\\$&")));
});

test("remove tokens assinados, tokens da API e campos token/secret/password/key", () => {
  const out = redact([
    `{"token":"${JWT}","refreshToken":"${JWT}","user":{"id":1}}`,
    `{"password":"senha-falsa-123","secret":"segredo-falso","apiKey":"chave-falsa"}`,
    `GET /x?token=abc123&page=2&key=chave-na-url&signature=assinatura-falsa`,
    `JWT_SECRET=e2e DB_PASS=banco-falso token: abc.def`,
    `token ${API_TOKEN} created`,
  ].join("\n"));
  none(out, JWT, API_TOKEN, "senha-falsa-123", "segredo-falso", "chave-falsa", "abc123", "chave-na-url", "assinatura-falsa");
});

test("o resto do log continua legível e sem perda de linhas", () => {
  const lines = ["[2026-11-26 00:49:47.349] WARN: message: \"ERR_API_TOKEN_SCOPE\"", "statusCode: 403", "✗ campanhas: timeout waiting for finished", "page=2 limit=50"];
  assert.equal(redact(lines.join("\n")), lines.join("\n"));
  assert.equal(redact(undefined), "");
});

test("save grava só o texto limpo, e só quando E2E_LOG_DIR existe", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-logs-"));
  delete process.env.E2E_LOG_DIR;
  save("/x/canais.js", `Authorization: Bearer ${JWT}`);
  assert.deepEqual(fs.readdirSync(dir), []);
  process.env.E2E_LOG_DIR = path.join(dir, "sub");
  save("/x/canais.js", `Authorization: Bearer ${JWT}\nfalhou aqui`);
  const written = fs.readFileSync(path.join(dir, "sub", "canais.backend.log"), "utf8");
  none(written, JWT);
  assert.match(written, /falhou aqui/);
  delete process.env.E2E_LOG_DIR;
});
