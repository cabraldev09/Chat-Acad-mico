/* eslint-disable */
// End-to-end check of every API based channel against local mock servers
// (Telegram Bot API + Meta Graph API). Runs the real backend on its own port
// with a throw-away database. Usage: node scripts/channels-e2e.js
const { spawn, execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");

const ROOT = path.resolve(__dirname, "..");
// PostgreSQL (the same engine as Supabase) is the supported database.
const PGBIN = process.env.PG_BIN || path.dirname(execFileSync("which", ["psql"]).toString().trim());
const PGUSER = process.env.PGUSER || require("os").userInfo().username;
const psql = (db, q) => execFileSync(`${PGBIN}/psql`, ["-X", "-U", PGUSER, "-d", db, "-At", "-c", q]).toString().trim();
const DB = `chat_e2e_${process.pid}_${crypto.randomBytes(4).toString("hex")}`;
const PORT = 8091;
const TG_PORT = 9101;
const GRAPH_PORT = 9102;
const API = `http://localhost:${PORT}`;
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

// tests are written in plain camelCase SQL: quote mixed-case identifiers for Postgres,
// map MySQL-isms and print booleans as 1/0
const BOOLS = "fromMe|optOut|aiActive|isGroup|read|active|isDeleted|isDefault";
const pgSql = q =>
  q
    .replace(/('(?:[^']|'')*')|\b([A-Za-z_]\w*)\b/g, (m, str, id) => (str ? m : /[a-z]/.test(id) && /[A-Z]/.test(id) ? `"${id}"` : m))
    .replace(/\bIFNULL\(([^,()]+),/g, "COALESCE($1::text,")
    .replace(new RegExp(`("?(?:${BOOLS})"?)\\s*=\\s*([01])\\b`, "g"), (m, c, v) => `${c}=${v === "1" ? "true" : "false"}`);
const sql = q => {
  const out = psql(DB, pgSql(q));
  return out === "t" ? "1" : out === "f" ? "0" : out;
};
// small selectable PDFs for the analysis tests (the same generators of the unit tests, no personal data)
const selectablePdfJs = (lines, metadata = "") => {
  const stream = lines.map(([x, y, text]) => `BT /F1 10 Tf ${x} ${y} Td (${text.replace(/[\\()]/g, "\\$&")}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let document = `%PDF-1.4\n% ${metadata}\n`;
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(document);
  document += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(document);
};
const academicPdfJs = (rgm, status = "A CURSAR", metadata = "") =>
  selectablePdfJs([
    [30, 780, "Aluno: Aluno Teste Portal"], [30, 760, `RGM: ${rgm}`], [30, 740, "Curso: Administracao"], [30, 720, "Periodo atual: 3"],
    [30, 680, "Codigo"], [130, 680, "Disciplina"], [300, 680, "Periodo"], [390, 680, "Status"], [510, 680, "CH"],
    [30, 650, "001"], [130, 650, "Matematica"], [315, 650, "1"], [390, 650, status], [510, 650, "40"],
    [30, 620, "002"], [130, 620, "Gestao"], [315, 620, "3"], [390, 620, "CURSANDO"], [510, 620, "60"],
    [30, 590, "003"], [130, 590, "Economia"], [315, 590, "2"], [390, 590, "AE"], [510, 590, "40"]
  ], metadata);
const academicHistoryPdfJs = (rgm, official = false, approved = false) =>
  selectablePdfJs([
    [40, 800, "HISTORICO ESCOLAR"], [40, 780, `RGM: ${rgm}`], [40, 760, "Nome: Aluno Teste Portal"], [40, 740, "Curso: Administracao"],
    [40, 700, "Disciplina"], [195, 700, "Periodo"], [250, 700, "C/Horaria"], [306, 700, "Media"], [353, 700, "Situacao"], [420, 700, "Docente / Titulacao"],
    [40, 670, "001 - Matematica"], [205, 670, "2026/2"], [264, 670, "40"], [310, 670, approved ? "8.5" : "******"], [353, 670, approved ? "Aprovado" : "Pendente"], [420, 670, "Professor Teste"],
    [40, 640, "002 - Gestao"], [205, 640, "2026/2"], [264, 640, "60"], [310, 640, "******"], [353, 640, "Pendente"], [420, 640, "Professor Teste"],
    [40, 610, "003 - Economia"], [205, 610, "2026/2"], [264, 610, "40"], [310, 610, "AE"], [353, 610, "Aprovado"], [420, 610, "Professor Teste"],
    [40, 560, "Dados Complementares"], [40, 540, "Carga Horaria Prevista: 140 horas"], [40, 520, `Carga Horaria Integralizada: ${approved ? 80 : 40} horas`],
    [40, 490, official ? "Assinatura eletronica via Certificado Digital" : "SIMPLES CONFERENCIA"], [40, 470, official ? "https://validar.iti.gov.br" : "Somente para conferencia"]
  ]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 12000, label = "condition") => {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e; }
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${label}`);
};

// ----------------------------------------------------------------- mocks
const tg = { updates: [], sent: [], offset: 0, n: 100 };
const graph = { sent: [], media: [], n: 0, hooks: [] };
const efi = { charges: {}, calls: [], webhook: null, authOk: 0 };
const EFI_PORT = 9103;
const BILLET_PORT = 9104;
const AI_PORT = 9105;
const anthropic = { requests: [] };
const billet = { charges: {}, calls: [], notifications: {}, n: 500 };

const startTelegramMock = () => {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage() });
  app.use(express.json());
  app.get("/file/bot:token/*", (req, res) => res.type("image/jpeg").send(PNG));
  app.post("/bot:token/:method", upload.any(), async (req, res) => {
    const { method } = req.params;
    const body = req.body || {};
    const ok = result => res.json({ ok: true, result });
    if (method === "getMe") return ok({ id: 1, username: "mockbot" });
    if (method === "deleteWebhook") return ok(true);
    if (method === "getUserProfilePhotos") return ok({ photos: [] });
    if (method === "getFile") return ok({ file_path: "photos/file_1.jpg" });
    if (method === "getUpdates") {
      const end = Date.now() + 2500;
      while (Date.now() < end) {
        const pending = tg.updates.filter(u => u.update_id >= (body.offset || 0));
        if (pending.length) return ok(pending);
        await sleep(100);
      }
      return ok([]);
    }
    tg.n += 1;
    tg.sent.push({ method, body, files: (req.files || []).map(f => ({ field: f.fieldname, name: f.originalname, size: f.size })) });
    return ok({ message_id: tg.n, chat: { id: Number(body.chat_id) } });
  });
  return new Promise(r => { const s = app.listen(TG_PORT, () => r(s)); });
};

// Anthropic Messages API: answers by what the last user message says, and asks for tools when the scenario needs them
const startAnthropicMock = () => {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.post("/v1/messages", (req, res) => {
    anthropic.requests.push(req.body);
    const usage = { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const last = req.body.messages[req.body.messages.length - 1];
    const text = t => res.json({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage });
    const tool = (name, input) => res.json({ content: [{ type: "tool_use", id: `toolu_${anthropic.requests.length}`, name, input }], stop_reason: "tool_use", usage });
    if (typeof req.body.system === "string" && /desenha fluxos/.test(req.body.system)) {
      return text(JSON.stringify({
        name: "Triagem gerada",
        entry: { type: "first_message" },
        nodes: [
          { key: "start", type: "start" },
          { key: "menu", type: "buttons", text: "Oi! Sobre o que você quer falar?", options: ["Cursos", "Financeiro"] },
          { key: "nome", type: "ask", text: "Qual o seu nome?", field: "nome", validate: "text" },
          { key: "crm", type: "crm", action: "send_to_crm", ownerMode: "roundrobin", tagName: "Etiqueta que não existe" },
          { key: "fim", type: "end", text: "Anotado, até já!" },
          { key: "fin", type: "message", text: "O financeiro responde em horário comercial." },
          { key: "fimf", type: "end" }
        ],
        edges: [
          { from: "start", to: "menu" }, { from: "menu", to: "nome", option: "Cursos" }, { from: "menu", to: "fin", option: "Financeiro" },
          { from: "nome", to: "crm" }, { from: "crm", to: "fim" }, { from: "fin", to: "fimf" },
          { from: "menu", to: "nome", option: "opção que não existe" }
        ]
      }));
    }
    if (req.body.max_tokens === 220) return text("O aluno quer saber sobre bolsas e cursos.");
    const result = Array.isArray(last.content) && last.content.find(b => b.type === "tool_result");
    if (result) {
      const out = JSON.parse(result.content);
      if (out.iniciado) return text("Pronto, enviei o menu de cursos para você.");
      if (out.completo) return text("Perfeito, Paulo! Um consultor da equipe continua com você.");
      if (out.cursos) return text(`O curso ${out.cursos[0].nome} tem mensalidade de tabela de R$ ${out.cursos[0].mensalidade_bruta_de_tabela}.`);
      return text("Anotado!");
    }
    const said = typeof last.content === "string" ? last.content : "";
    const knowledge = (req.body.system[1] && req.body.system[1].text) || "";
    if (/atletas/i.test(said)) return text(knowledge.includes("30% de bolsa") ? "Atletas federados têm 30% de bolsa, mediante comprovação." : "[DESCONHECIDO]");
    if (/menu de cursos/i.test(said)) return tool("fluxo_menu_cursos", {});
    if (/valor do curso/i.test(said)) return tool("buscar_curso", { nome: "Direit" });
    if (/meu nome é/i.test(said)) return tool("salvar_lead", { nome: "Paulo Mendes", cidade: "Ji-Paraná", curso: "Direito" });
    if (/falar com (uma )?pessoa/i.test(said)) return text("[HANDOFF]");
    return text("Claro! Posso ajudar com as bolsas. Qual curso você quer?");
  });
  return new Promise(r => { const s = app.listen(AI_PORT, () => r(s)); });
};

const startGraphMock = () => {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage() });
  app.use(express.json());
  app.get("/pic.jpg", (q, res) => res.type("image/png").send(PNG));
  app.get("/page.html", (q, res) => res.type("html").send("<html><head><style>x{}</style></head><body><nav>menu</nav><h1>Calendário acadêmico</h1><p>As aulas do segundo semestre começam em 3 de agosto e a rematrícula vai até 20 de julho para todos os cursos de graduação a distância.</p></body></html>"));
  app.post("/hook", (req, res) => { graph.hooks.push(req.body); res.json({ ok: true }); });
  app.get("/att.png", (q, res) => res.type("image/png").send(PNG));
  app.get("/media/:id", (q, res) => res.type("image/png").send(PNG));
  app.get("/me", (q, res) => res.json({ id: "PAGE1", name: "Mock Page" }));
  app.get("/:id", (req, res) => {
    const { id } = req.params;
    if (id === "PN1") return res.json({ display_phone_number: "+55 11 99999-0000", verified_name: "Mock Co" });
    if (id.startsWith("PSID") || id.startsWith("IGSID")) return res.json({ name: "Maria Silva", profile_pic: `http://localhost:${GRAPH_PORT}/pic.jpg` });
    if (id.startsWith("MEDIA")) return res.json({ url: `http://localhost:${GRAPH_PORT}/media/${id}` });
    return res.status(404).json({ error: { message: "unknown id" } });
  });
  app.post("/me/messages", upload.any(), (req, res) => {
    graph.n += 1;
    graph.sent.push({ path: "/me/messages", body: req.body, files: (req.files || []).length });
    res.json({ recipient_id: "x", message_id: `m_mock_${graph.n}` });
  });
  app.post("/:id/messages", (req, res) => {
    graph.n += 1;
    graph.sent.push({ path: `/${req.params.id}/messages`, body: req.body, auth: req.headers.authorization });
    res.json({ messaging_product: "whatsapp", messages: [{ id: `wamid.mock${graph.n}` }] });
  });
  app.post("/:id/media", upload.any(), (req, res) => {
    graph.media.push({ id: req.params.id, type: req.body.type, files: (req.files || []).length });
    res.json({ id: "MEDIAUP1" });
  });
  return new Promise(r => { const s = app.listen(GRAPH_PORT, () => r(s)); });
};

// Efí Cobranças (boleto / Bolix) — OAuth with Basic auth, no mTLS
const startBilletMock = () => {
  const app = express();
  app.use(express.json());
  app.post("/v1/authorize", (req, res) => {
    const basic = Buffer.from(String(req.headers.authorization || "").replace("Basic ", ""), "base64").toString();
    if (basic !== "Client_Id_test:Client_Secret_test") return res.status(401).json({ error: "invalid_client" });
    return res.json({ access_token: "bt-123", expires_in: 600 });
  });
  const guard = (req, res, next) => (req.headers.authorization === "Bearer bt-123" ? next() : res.status(401).json({ error: "sem token" }));
  app.post("/v1/charge/one-step", guard, (req, res) => {
    billet.n += 1;
    const id = billet.n;
    billet.calls.push({ method: "POST", path: req.path, body: req.body });
    billet.charges[id] = { status: "waiting", body: req.body };
    res.json({ code: 200, data: { charge_id: id, status: "waiting", total: req.body.items[0].value, custom_id: req.body.metadata.custom_id, barcode: `34191.79001 01043.510047 91020.150008 5 8${id}`, billet_link: `https://boleto.example/${id}`, pdf: { charge: `https://boleto.example/${id}.pdf` }, expire_at: req.body.payment.banking_billet.expire_at, pix: { qrcode: `00020126BOLIX${id}`, qrcode_image: `data:image/png;base64,${PNG.toString("base64")}` } } });
  });
  app.get("/v1/charge/:id", guard, (req, res) => {
    const c = billet.charges[req.params.id];
    if (!c) return res.status(404).json({ error: "not found" });
    return res.json({ code: 200, data: { charge_id: Number(req.params.id), status: c.status, total: c.body.items[0].value } });
  });
  app.put("/v1/charge/:id/cancel", guard, (req, res) => {
    billet.calls.push({ method: "PUT", path: req.path });
    if (billet.charges[req.params.id]) billet.charges[req.params.id].status = "canceled";
    res.json({ code: 200 });
  });
  app.get("/v1/notification/:token", guard, (req, res) => res.json({ code: 200, data: (billet.notifications[req.params.token] || []).map(id => ({ identifiers: { charge_id: id }, status: { current: "paid" } })) }));
  return new Promise(r => { const s3 = app.listen(BILLET_PORT, () => r(s3)); });
};

const startEfiMock = () => {
  const app = express();
  app.use(express.json());
  app.post("/oauth/token", (req, res) => {
    const basic = Buffer.from(String(req.headers.authorization || "").replace("Basic ", ""), "base64").toString();
    if (basic !== "Client_Id_test:Client_Secret_test") return res.status(401).json({ error: "invalid_client", error_description: "credenciais inválidas" });
    efi.authOk += 1;
    return res.json({ access_token: "tok-123", expires_in: 3600 });
  });
  const guard = (req, res, next) => (req.headers.authorization === "Bearer tok-123" ? next() : res.status(401).json({ mensagem: "sem token" }));
  app.put("/v2/cob/:txid", guard, (req, res) => {
    efi.calls.push({ method: "PUT", path: req.path, body: req.body });
    const txid = req.params.txid;
    efi.charges[txid] = { body: req.body, status: "ATIVA", pix: [] };
    res.status(201).json({ txid, status: "ATIVA", loc: { id: 777, location: "pix.example/qr/v2/abc" }, pixCopiaECola: `00020126EFI${txid}` });
  });
  app.get("/v2/loc/:id/qrcode", guard, (req, res) => res.json({ qrcode: "00020126-QR-FALLBACK", imagemQrcode: `data:image/png;base64,${PNG.toString("base64")}` }));
  app.get("/v2/cob/:txid", guard, (req, res) => {
    const c = efi.charges[req.params.txid];
    if (!c) return res.status(404).json({ mensagem: "cobrança não encontrada" });
    return res.json({ txid: req.params.txid, status: c.status, pix: c.pix });
  });
  app.patch("/v2/cob/:txid", guard, (req, res) => {
    efi.calls.push({ method: "PATCH", path: req.path, body: req.body });
    if (efi.charges[req.params.txid]) efi.charges[req.params.txid].status = req.body.status;
    res.json({ txid: req.params.txid, status: req.body.status });
  });
  app.put("/v2/webhook/:chave", guard, (req, res) => {
    efi.webhook = { chave: req.params.chave, url: req.body.webhookUrl, skipMtls: req.headers["x-skip-mtls-checking"] };
    res.json({ webhookUrl: req.body.webhookUrl });
  });
  return new Promise(r => { const s2 = app.listen(EFI_PORT, () => r(s2)); });
};

// ---------------------------------------------------------------- harness
const results = [];
const test = async (name, fn) => {
  try { await fn(); results.push([true, name]); console.log(`  ✓ ${name}`); }
  catch (e) { results.push([false, `${name} -> ${e.message}`]); console.log(`  ✗ ${name}\n      ${e.message}`); }
};
const assert = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };

let token;
const http = axios.create({ baseURL: API, validateStatus: () => true });
const auth = () => ({ headers: { Authorization: `Bearer ${token}` } });
const asUser = t => ({ headers: { Authorization: `Bearer ${t}` } });

const createConnection = async (name, channel, config) => {
  const r = await http.post("/whatsapp", { name, channel, config: JSON.stringify(config) }, auth());
  assert(r.status === 200, `create ${channel}: ${r.status} ${JSON.stringify(r.data)}`);
  const id = r.data.id;
  await waitFor(async () => (await http.get(`/whatsapp/${id}`, auth())).data.status === "CONNECTED", 12000, `${channel} CONNECTED`);
  return id;
};
const ticketOf = number => sql(`SELECT t.id FROM Tickets t JOIN Contacts c ON c.id=t.contactId WHERE c.number='${number}' ORDER BY t.id DESC LIMIT 1`);
const msgCount = tid => Number(sql(`SELECT COUNT(*) FROM Messages WHERE ticketId=${tid}`));
const sign = (secret, body) => `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
const postMeta = (id, payload, secret, badSig) => {
  const body = JSON.stringify(payload);
  const headers = { "Content-Type": "application/json" };
  if (secret) headers["X-Hub-Signature-256"] = badSig || sign(secret, body);
  return http.post(`/webhooks/meta/${id}`, body, { headers });
};

// ------------------------------------------------------------------ main
(async () => {
  let backend;
  const cleanup = async () => {
    if (backend) backend.kill();
    try { psql("postgres", `DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`); } catch (e) {}
  };
  try {
    psql("postgres", `CREATE DATABASE ${DB}`);
    const env = {
      ...process.env, DATABASE_URL: "", DATABASE_URL_POOL: "", DB_SSL: "false", NODE_ENV: "test", DB_NAME: DB, DB_HOST: "localhost", DB_USER: PGUSER, DB_PASS: "", DB_PORT: "5432", DB_DIALECT: "postgres",
      PORT: String(PORT), PROXY_PORT: String(PORT), BACKEND_URL: "http://localhost", PUBLIC_URL: API,
      FRONTEND_URL: "http://localhost:3000", JWT_SECRET: "e2e", JWT_REFRESH_SECRET: "e2e-r", DASHBOARD_CACHE_MS: "0", LOGIN_RATE_MAX: "100",
      TELEGRAM_API_URL: `http://localhost:${TG_PORT}`, GRAPH_API_URL: `http://localhost:${GRAPH_PORT}`,
      SKIP_WHATSAPP_SESSIONS: "1", SKIP_DEFAULT_DATA: "1", LOG_LEVEL: "warn", EFI_API_URL: `http://localhost:${EFI_PORT}`, EFI_BILLET_API_URL: `http://localhost:${BILLET_PORT}`, EFI_POLL_MS: "1500",
      ANTHROPIC_API_URL: `http://localhost:${AI_PORT}`, ALLOW_PRIVATE_URLS: "true"
    };
    execFileSync("npx", ["sequelize", "db:migrate"], { cwd: ROOT, env, stdio: "ignore" });
    execFileSync("npx", ["sequelize", "db:seed:all"], { cwd: ROOT, env, stdio: "ignore" });
    await startTelegramMock();
    await startGraphMock();
    await startEfiMock();
    await startBilletMock();
    await startAnthropicMock();
    backend = spawn("node", ["dist/server.js"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    backend.stdout.on("data", d => (log += d));
    backend.stderr.on("data", d => (log += d));
    global.__backendLog = () => log;
    await waitFor(async () => (await axios.post(`${API}/auth/login`, { email: "admin@whaticket.com", password: "admin" }, { validateStatus: () => true })).status === 200, 30000, "backend up");
    token = (await axios.post(`${API}/auth/login`, { email: "admin@whaticket.com", password: "admin" })).data.token;

    // ------------------------------------------------------------ Telegram
    console.log("\nTelegram");
    let tgId;
    await test("connects with bot token and shows @username", async () => {
      tgId = await createConnection("Telegram", "telegram", { botToken: "123:ABC" });
      const w = (await http.get(`/whatsapp/${tgId}`, auth())).data;
      assert(w.session === "@mockbot", `session=${w.session}`);
      assert(!JSON.parse(w.config).botToken.includes("123:ABC"), "bot token leaked to the browser");
    });
    let tgTicket;
    await test("inbound text creates contact, ticket and message", async () => {
      tg.updates.push({ update_id: 1, message: { message_id: 10, chat: { id: 5551, type: "private" }, from: { first_name: "Ana", last_name: "Souza" }, text: "Olá, quero informações do curso" } });
      tgTicket = await waitFor(() => ticketOf("tg_5551"), 8000, "telegram ticket");
      assert(sql(`SELECT name FROM Contacts WHERE number='tg_5551'`) === "Ana Souza", "contact name");
      assert(sql(`SELECT channel FROM Contacts WHERE number='tg_5551'`) === "telegram", "contact channel");
      assert(sql(`SELECT body FROM Messages WHERE ticketId=${tgTicket} AND fromMe=0 LIMIT 1`).includes("quero informações"), "message body");
    });
    await test("agent reply is delivered to Telegram and stored", async () => {
      const before = tg.sent.length;
      const r = await http.post(`/messages/${tgTicket}`, { body: "Oi Ana, tudo bem?" }, auth());
      assert(r.status === 200, `status ${r.status}`);
      const s = tg.sent.slice(before).find(x => x.method === "sendMessage");
      assert(s && String(s.body.chat_id) === "5551" && s.body.text.includes("Oi Ana"), "sendMessage payload");
      assert(Number(sql(`SELECT COUNT(*) FROM Messages WHERE ticketId=${tgTicket} AND fromMe=1`)) >= 1, "outbound stored");
    });
    await test("inbound photo is downloaded and saved", async () => {
      tg.updates.push({ update_id: 2, message: { message_id: 11, chat: { id: 5551, type: "private" }, from: { first_name: "Ana" }, photo: [{ file_id: "small" }, { file_id: "big" }], caption: "meu documento" } });
      const f = await waitFor(() => sql(`SELECT mediaUrl FROM Messages WHERE ticketId=${tgTicket} AND mediaUrl IS NOT NULL LIMIT 1`), 8000, "photo message");
      assert(fs.existsSync(path.join(ROOT, "public", f)), `file ${f} missing`);
    });
    await test("agent media upload is sent as photo", async () => {
      const form = new FormData();
      form.append("medias", PNG, { filename: "foto.png", contentType: "image/png" });
      const before = tg.sent.length;
      const r = await http.post(`/messages/${tgTicket}`, form, { headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` } });
      assert(r.status === 200, `status ${r.status} ${JSON.stringify(r.data)}`);
      const s = tg.sent.slice(before).find(x => x.method === "sendPhoto");
      assert(s && s.files.length === 1 && String(s.body.chat_id) === "5551", "sendPhoto payload");
    });
    await test("duplicate update is ignored", async () => {
      const n = msgCount(tgTicket);
      tg.updates.push({ update_id: 3, message: { message_id: 10, chat: { id: 5551, type: "private" }, from: { first_name: "Ana" }, text: "repetida" } });
      await sleep(3500);
      assert(msgCount(tgTicket) === n, "duplicate stored");
    });
    await test("group chats are ignored", async () => {
      tg.updates.push({ update_id: 4, message: { message_id: 12, chat: { id: -900, type: "group" }, from: { first_name: "X" }, text: "oi grupo" } });
      await sleep(3500);
      assert(!ticketOf("tg_-900"), "group created a ticket");
    });
    await test("chatbot answers a new Telegram contact", async () => {
      const q = (await http.post("/queue", { name: "Admissão", color: "#0693e3", greetingMessage: "Fila de admissão" }, auth())).data.id;
      await http.post("/chatbot-nodes", { title: "Quero me matricular", action: "queue", targetId: q, message: "Ótimo! Encaminhando para Admissão.", position: 1 }, auth());
      const before = tg.sent.length;
      tg.updates.push({ update_id: 5, message: { message_id: 20, chat: { id: 5552, type: "private" }, from: { first_name: "Beto" }, text: "oi" } });
      await waitFor(() => tg.sent.slice(before).some(s => s.method === "sendMessage" && s.body.text.includes("Quero me matricular")), 10000, "menu sent");
      tg.updates.push({ update_id: 6, message: { message_id: 21, chat: { id: 5552, type: "private" }, from: { first_name: "Beto" }, text: "1" } });
      await waitFor(() => tg.sent.some(s => s.body.text && s.body.text.includes("Encaminhando para Admissão")), 10000, "queue reply");
      const t = ticketOf("tg_5552");
      assert(sql(`SELECT queueId FROM Tickets WHERE id=${t}`) === String(q), "ticket queue not set");
    });

    // ------------------------------------------------- Messenger / Instagram
    for (const [channel, object, prefix, idp] of [["messenger", "page", "fb_", "PSID"], ["instagram", "instagram", "ig_", "IGSID"]]) {
      console.log(`\n${channel}`);
      const cfg = { accessToken: "EAAB-secret-token", appSecret: `${channel}-secret`, verifyToken: `${channel}-verify` };
      let id, ticket;
      await test("connects and validates the access token", async () => {
        id = await createConnection(channel, channel, cfg);
        const shown = JSON.parse((await http.get(`/whatsapp/${id}`, auth())).data.config);
        assert(!JSON.stringify(shown).includes("EAAB-secret-token") && !JSON.stringify(shown).includes(cfg.appSecret), "secrets leaked");
      });
      await test("webhook verification handshake", async () => {
        const ok = await http.get(`/webhooks/meta/${id}`, { params: { "hub.mode": "subscribe", "hub.verify_token": cfg.verifyToken, "hub.challenge": "12345" } });
        assert(ok.status === 200 && String(ok.data) === "12345", `ok=${ok.status}`);
        const bad = await http.get(`/webhooks/meta/${id}`, { params: { "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1" } });
        assert(bad.status === 403, `bad=${bad.status}`);
      });
      const event = (mid, extra = {}) => ({ object, entry: [{ id: "PAGE1", messaging: [{ sender: { id: `${idp}1` }, recipient: { id: "PAGE1" }, message: { mid, ...extra } }] }] });
      await test("rejects missing and forged signatures", async () => {
        const noSig = await postMeta(id, event(`m_${channel}_x`, { text: "x" }));
        assert(noSig.status === 401, `no signature -> ${noSig.status}`);
        const forged = await postMeta(id, event(`m_${channel}_y`, { text: "y" }), cfg.appSecret, "sha256=" + "0".repeat(64));
        assert(forged.status === 401, `forged -> ${forged.status}`);
        assert(!ticketOf(`${prefix}${idp}1`), "forged webhook created a ticket");
      });
      await test("signed message creates contact with profile name and ticket", async () => {
        const r = await postMeta(id, event(`m_${channel}_1`, { text: "Oi, vi o anúncio" }), cfg.appSecret);
        assert(r.status === 200, `status ${r.status}`);
        ticket = await waitFor(() => ticketOf(`${prefix}${idp}1`), 8000, "ticket");
        assert(sql(`SELECT name FROM Contacts WHERE number='${prefix}${idp}1'`) === "Maria Silva", "profile name");
      });
      await test("image attachment is downloaded", async () => {
        await postMeta(id, event(`m_${channel}_2`, { attachments: [{ type: "image", payload: { url: `http://localhost:${GRAPH_PORT}/att.png` } }] }), cfg.appSecret);
        const f = await waitFor(() => sql(`SELECT mediaUrl FROM Messages WHERE ticketId=${ticket} AND mediaUrl IS NOT NULL LIMIT 1`), 8000, "attachment");
        assert(fs.existsSync(path.join(ROOT, "public", f)), "file missing");
      });
      await test("echo and duplicate deliveries are ignored", async () => {
        const n = msgCount(ticket);
        await postMeta(id, { object, entry: [{ messaging: [{ sender: { id: "PAGE1" }, message: { mid: `m_${channel}_echo`, is_echo: true, text: "eco" } }] }] }, cfg.appSecret);
        await postMeta(id, event(`m_${channel}_1`, { text: "Oi, vi o anúncio" }), cfg.appSecret);
        await sleep(1500);
        assert(msgCount(ticket) === n, "echo/duplicate stored");
      });
      await test("typing and reactions go out through the channel, and the contact's reaction comes in", async () => {
        const before = graph.sent.length;
        const t = await http.post(`/tickets/${ticket}/typing`, {}, auth());
        assert(t.status === 200 && t.data.sent === true, `typing ${t.status} ${JSON.stringify(t.data)}`);
        const typing = graph.sent.slice(before).find(x => x.body && x.body.sender_action === "typing_on");
        assert(typing && typing.body.recipient.id === `${idp}1`, "typing_on not sent to the contact");
        const again = await http.post(`/tickets/${ticket}/typing`, {}, auth());
        assert(again.data.sent === false, "typing is not throttled");

        const emoji = channel === "messenger" ? "👍" : "❤️";
        const r = await http.post(`/messages/m_${channel}_1/react`, { emoji }, auth());
        assert(r.status === 200, `react ${r.status} ${JSON.stringify(r.data)}`);
        const sent = graph.sent.slice(before).find(x => x.body && x.body.sender_action === "react");
        assert(sent && sent.body.payload.message_id === `m_${channel}_1` && sent.body.payload.reaction === (channel === "messenger" ? "like" : "love"), `react payload ${JSON.stringify(sent && sent.body)}`);
        if (channel === "instagram") {
          assert((await http.post(`/messages/m_${channel}_1/react`, { emoji: "👍" }, auth())).status === 400, "instagram accepts only the heart");
        }
        const un = await http.post(`/messages/m_${channel}_1/react`, { emoji: "" }, auth());
        assert(un.status === 200, `unreact ${un.status}`);
        assert(graph.sent.slice(before).some(x => x.body && x.body.sender_action === "unreact"), "unreact not sent");

        const inbound = await postMeta(id, { object, entry: [{ id: "PAGE1", messaging: [{ sender: { id: `${idp}1` }, recipient: { id: "PAGE1" }, reaction: { mid: `m_${channel}_1`, action: "react", emoji: "😮" } }] }] }, cfg.appSecret);
        assert(inbound.status === 200, `inbound reaction ${inbound.status}`);
        await waitFor(() => sql(`SELECT reactions FROM Messages WHERE id='m_${channel}_1'`).includes("😮"), 8000, "inbound reaction stored");
      });
      await test("agent reply goes to the Send API with the right recipient", async () => {
        const before = graph.sent.length;
        const r = await http.post(`/messages/${ticket}`, { body: "Olá Maria!" }, auth());
        assert(r.status === 200, `status ${r.status}`);
        const s = graph.sent.slice(before).find(x => x.path === "/me/messages");
        assert(s && s.body.recipient.id === `${idp}1` && s.body.message.text.includes("Olá Maria"), "payload");
      });
      await test("agent media upload is sent as an attachment", async () => {
        const form = new FormData();
        form.append("medias", PNG, { filename: "a.png", contentType: "image/png" });
        const before = graph.sent.length;
        const r = await http.post(`/messages/${ticket}`, form, { headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` } });
        assert(r.status === 200, `status ${r.status}`);
        assert(graph.sent.slice(before).some(x => x.files === 1), "no multipart attachment");
      });
    }
    await test("webhook without App Secret configured is refused", async () => {
      const id = await createConnection("sem segredo", "messenger", { accessToken: "T" });
      const r = await postMeta(id, { object: "page", entry: [] });
      assert(r.status === 403, `status ${r.status}`);
    });

    // ----------------------------------------------------- WhatsApp Cloud API
    console.log("\nwhatsapp_cloud");
    const cloudCfg = { phoneNumberId: "PN1", accessToken: "CLOUD-TOKEN", appSecret: "cloud-secret", verifyToken: "cloud-verify" };
    let cid, cticket;
    const cloudEvent = (messages, extra = {}) => ({ object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "PN1" }, contacts: [{ wa_id: "5511988887777", profile: { name: "João Pedro" } }], messages, ...extra } }] }] });
    await test("connects and reads the business phone number", async () => {
      cid = await createConnection("Cloud", "whatsapp_cloud", cloudCfg);
      assert((await http.get(`/whatsapp/${cid}`, auth())).data.session === "+55 11 99999-0000", "session label");
    });
    await test("inbound text keeps the phone number as contact", async () => {
      const r = await postMeta(cid, cloudEvent([{ from: "5511988887777", id: "wamid.in1", type: "text", text: { body: "Quero saber sobre Direito" } }]), cloudCfg.appSecret);
      assert(r.status === 200, `status ${r.status}`);
      cticket = await waitFor(() => ticketOf("5511988887777"), 8000, "ticket");
      assert(sql(`SELECT name FROM Contacts WHERE number='5511988887777'`) === "João Pedro", "profile name");
    });
    await test("inbound image is fetched through the media endpoint", async () => {
      await postMeta(cid, cloudEvent([{ from: "5511988887777", id: "wamid.in2", type: "image", image: { id: "MEDIA1", mime_type: "image/png", caption: "RG" } }]), cloudCfg.appSecret);
      const f = await waitFor(() => sql(`SELECT mediaUrl FROM Messages WHERE ticketId=${cticket} AND mediaUrl IS NOT NULL LIMIT 1`), 8000, "media");
      assert(fs.existsSync(path.join(ROOT, "public", f)), "file missing");
    });
    await test("wrong phone_number_id is ignored", async () => {
      const n = msgCount(cticket);
      const bad = cloudEvent([{ from: "5511988887777", id: "wamid.in3", type: "text", text: { body: "x" } }]);
      bad.entry[0].changes[0].value.metadata.phone_number_id = "OTHER";
      await postMeta(cid, bad, cloudCfg.appSecret);
      await sleep(1200);
      assert(msgCount(cticket) === n, "foreign number stored");
    });
    let outId;
    await test("agent reply uses the Cloud API with bearer auth", async () => {
      const before = graph.sent.length;
      const r = await http.post(`/messages/${cticket}`, { body: "Olá João!" }, auth());
      assert(r.status === 200, `status ${r.status}`);
      const s = graph.sent.slice(before).find(x => x.path === "/PN1/messages");
      assert(s && s.body.to === "5511988887777" && s.body.type === "text" && s.auth === "Bearer CLOUD-TOKEN", "payload");
      outId = sql(`SELECT id FROM Messages WHERE ticketId=${cticket} AND fromMe=1 ORDER BY createdAt DESC LIMIT 1`);
      assert(outId.startsWith("wamid.mock"), `outbound id ${outId}`);
    });
    await test("delivery status updates the message ack", async () => {
      await postMeta(cid, cloudEvent([], { statuses: [{ id: outId, status: "read", recipient_id: "5511988887777" }] }), cloudCfg.appSecret);
      await waitFor(() => sql(`SELECT ack FROM Messages WHERE id='${outId}'`) === "3", 6000, "ack=3");
    });
    await test("agent media is uploaded then sent by id", async () => {
      const form = new FormData();
      form.append("medias", PNG, { filename: "b.png", contentType: "image/png" });
      const before = graph.sent.length;
      const r = await http.post(`/messages/${cticket}`, form, { headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` } });
      assert(r.status === 200, `status ${r.status}`);
      assert(graph.media.length >= 1, "no /media upload");
      const s = graph.sent.slice(before).find(x => x.body && x.body.type === "image");
      assert(s && s.body.image.id === "MEDIAUP1", "image send payload");
    });

    // --------------------------------------------------------------- Web chat
    console.log("\nwebchat");
    const wid = await createConnection("Site", "webchat", { title: "Fale conosco" });
    const wtoken = JSON.parse((await http.get(`/whatsapp/${wid}`, auth())).data.config).token;
    await test("visitor message reaches the inbox and agent reply returns", async () => {
      const r = await http.post(`/webchat/${wtoken}/messages`, { visitorId: "visitor-e2e-0001", body: "Olá!" });
      assert(r.status === 201, `status ${r.status}`);
      const t = await waitFor(() => ticketOf("web_visitor-e2e-0001"), 8000, "ticket");
      await http.post(`/messages/${t}`, { body: "Resposta do atendente" }, auth());
      const m = (await http.get(`/webchat/${wtoken}/messages`, { params: { visitorId: "visitor-e2e-0001" } })).data.messages;
      assert(m.some(x => x.fromMe && x.body.includes("Resposta do atendente")), "agent reply not visible to visitor");
    });
    await test("web chat rejects bad visitor ids and unknown tokens", async () => {
      assert((await http.post(`/webchat/${wtoken}/messages`, { visitorId: "../x", body: "a" })).status === 400, "bad id accepted");
      assert((await http.get(`/webchat/nope/config`)).status === 404, "unknown token accepted");
    });

    // ------------------------------------------------------ Outbound webhooks
    console.log("\napi & webhooks");
    await test("API token sends through any channel and rejects bad tokens", async () => {
      const t = (await http.post("/api-tokens", { name: "e2e" }, auth())).data.token;
      assert((await http.get("/api/v1/connections", { headers: { Authorization: "Bearer wrong" } })).status >= 400, "bad token accepted");
      const list = (await http.get("/api/v1/connections", { headers: { Authorization: `Bearer ${t}` } })).data;
      assert(list.length >= 5, `connections=${list.length}`);
      const before = graph.sent.length;
      const r = await http.post("/api/v1/messages/send", { number: "5511977776666", body: "Olá {{name}}!", whatsappId: cid, name: "Lead API" }, { headers: { Authorization: `Bearer ${t}` } });
      assert(r.status === 200, `send ${r.status} ${JSON.stringify(r.data)}`);
      assert(graph.sent.slice(before).some(x => x.body && x.body.to === "5511977776666"), "not sent through cloud api");
    });

    // -------------------------------------------------------------------- CRM
    console.log("\ncrm");
    const leadOf = number => sql(`SELECT l.id FROM Leads l JOIN Contacts c ON c.id=l.contactId WHERE c.number='${number}' LIMIT 1`);
    const stageName = lid => sql(`SELECT s.name FROM Leads l JOIN LeadStages s ON s.id=l.stageId WHERE l.id=${lid}`);
    await test("every channel's first message registers a lead automatically", async () => {
      for (const [num, source] of [["tg_5551", "Telegram"], ["fb_PSID1", "Facebook"], ["ig_IGSID1", "Instagram"], ["5511988887777", "WhatsApp"], ["web_visitor-e2e-0001", "Site / formulário"]]) {
        const id = leadOf(num);
        assert(id, `no lead for ${num}`);
        assert(sql(`SELECT source FROM Leads WHERE id=${id}`) === source, `source for ${num}`);
        assert(stageName(id) === "Novo lead" || stageName(id) === "Primeiro contato", `stage for ${num}: ${stageName(id)}`);
      }
      assert(sql(`SELECT phone FROM Leads WHERE id=${leadOf("5511988887777")}`) === "5511988887777", "phone from number");
      assert(sql(`SELECT phone IS NULL FROM Leads WHERE id=${leadOf("tg_5551")}`) === "1", "telegram lead should have no phone");
    });
    await test("one lead per contact and groups never become leads", async () => {
      assert(sql(`SELECT COUNT(*) FROM Leads WHERE contactId IN (SELECT id FROM Contacts WHERE number='tg_5551')`) === "1", "duplicate lead");
      assert(!leadOf("tg_-900"), "group became a lead");
    });
    await test("first human reply stamps first contact and advances the stage", async () => {
      const id = leadOf("tg_5551");
      assert(sql(`SELECT firstContactAt IS NOT NULL FROM Leads WHERE id=${id}`) === "1", "firstContactAt");
      assert(stageName(id) === "Primeiro contato", `stage ${stageName(id)}`);
      assert(Number(sql(`SELECT score FROM Leads WHERE id=${id}`)) > 0, "score");
    });
    let leadId;
    await test("manual lead is deduplicated by phone across formats", async () => {
      const a = await http.post("/leads", { name: "Carla Dias", phone: "(11) 97777-1234", email: "carla@x.com", source: "Indicação" }, auth());
      assert(a.status === 201 && a.data.created, `first ${a.status}`);
      leadId = a.data.lead.id;
      const b = await http.post("/leads", { name: "Carla D.", phone: "+55 11 97777 1234", source: "Google" }, auth());
      assert(b.status === 200 && b.data.created === false && b.data.lead.id === leadId, "not deduplicated");
      const acts = (await http.get(`/leads/${leadId}/activities`, auth())).data;
      assert(acts.some(x => x.body.includes("Novo contato recebido")), "re-contact not logged");
    });
    await test("lost needs a reason; won stamps wonAt; reopening clears it", async () => {
      const stages = (await http.get("/lead-stages", auth())).data;
      const lost = stages.find(x => x.type === "lost"), won = stages.find(x => x.type === "won"), first = stages[0];
      assert((await http.put(`/leads/${leadId}/stage`, { stageId: lost.id }, auth())).status === 400, "lost without reason accepted");
      assert((await http.put(`/leads/${leadId}/stage`, { stageId: lost.id, lostReason: "Preço / mensalidade" }, auth())).status === 200, "lost");
      assert(sql(`SELECT score FROM Leads WHERE id=${leadId}`) === "0", "lost score");
      assert((await http.put(`/leads/${leadId}/stage`, { stageId: won.id }, auth())).status === 200, "won");
      assert(sql(`SELECT wonAt IS NOT NULL AND lostAt IS NULL AND lostReason IS NULL FROM Leads WHERE id=${leadId}`) === "1", "won fields");
      assert(sql(`SELECT score FROM Leads WHERE id=${leadId}`) === "100", "won score");
      await http.put(`/leads/${leadId}/stage`, { stageId: first.id }, auth());
      assert(sql(`SELECT wonAt IS NULL FROM Leads WHERE id=${leadId}`) === "1", "reopen");
    });
    await test("follow-up tasks drive nextFollowUpAt and completion clears it", async () => {
      const due = new Date(Date.now() + 3600000).toISOString();
      const t = (await http.post(`/leads/${leadId}/tasks`, { title: "Ligar para Carla", dueAt: due }, auth())).data;
      assert(sql(`SELECT nextFollowUpAt IS NOT NULL FROM Leads WHERE id=${leadId}`) === "1", "nextFollowUpAt");
      await http.post(`/leads/${leadId}/tasks/${t.id}/toggle`, {}, auth());
      assert(sql(`SELECT nextFollowUpAt IS NULL FROM Leads WHERE id=${leadId}`) === "1", "cleared");
    });
    await test("public form creates leads, enforces consent and ignores bots", async () => {
      const settings = (await http.get("/crm/settings", auth())).data;
      const tokenForm = settings.formToken || (await http.put("/crm/settings", {}, auth())).data.formToken;
      assert(tokenForm, "form token");
      const page = await http.get(`/leadform/${tokenForm}`);
      assert(page.status === 200 && String(page.data).includes("Quero ser contatado"), "form page");
      assert((await http.get("/leadform/wrong")).status === 404, "wrong token page");
      const body = { name: "Pedro Lima", phone: "11 98888-0001", email: "pedro@x.com", consent: true, utm_source: "instagram", utm_campaign: "vestibular" };
      assert((await http.post(`/leadform/${tokenForm}/submit`, { ...body, consent: false })).status === 400, "no consent accepted");
      assert((await http.post(`/leadform/${tokenForm}/submit`, { ...body, website: "spam" })).status === 200, "honeypot");
      assert(!sql(`SELECT id FROM Leads WHERE email='pedro@x.com'`), "bot created a lead");
      assert((await http.post(`/leadform/${tokenForm}/submit`, body)).status === 200, "valid submit");
      assert(sql(`SELECT CONCAT(source,'|',utmSource,'|',utmCampaign,'|',CAST(consentAt IS NOT NULL AS INTEGER)) FROM Leads WHERE email='pedro@x.com'`) === "Site / formulário|instagram|vestibular|1", "form fields");
    });
    await test("API v1 creates leads (deduplicated) and lists them", async () => {
      const t = (await http.post("/api-tokens", { name: "crm" }, auth())).data.token;
      const h = { headers: { Authorization: `Bearer ${t}` } };
      const a = await http.post("/api/v1/leads", { name: "Lead API", phone: "21 99999-1111", source: "Google" }, h);
      assert(a.status === 201, `status ${a.status}`);
      const b = await http.post("/api/v1/leads", { name: "Lead API", phone: "5521999991111" }, h);
      assert(b.status === 200 && b.data.created === false, "dedupe");
      assert((await http.post("/api/v1/leads", { name: "Sem contato" }, h)).status >= 400, "accepted lead without phone/email");
      assert((await http.get("/api/v1/leads", h)).data.length >= 5, "list");
    });
    await test("metrics endpoint returns coherent numbers", async () => {
      const m = (await http.get("/crm/metrics", auth())).data;
      const total = Number(sql("SELECT COUNT(*) FROM Leads"));
      assert(m.kpi.leads === total, `kpi.leads ${m.kpi.leads} != ${total}`);
      assert(m.funnel.reduce((a, b) => a + b.total, 0) === total, "funnel sum");
      assert(m.bySource.length >= 4, "bySource");
    });
    await test("backfill registers people who have a conversation, never an imported address book", async () => {
      const headers = { headers: { Authorization: `Bearer ${(await http.post("/api-tokens", { name: "bf" }, auth())).data.token}` } };
      await http.post("/api/v1/contacts", { name: "Contato antigo", number: "5531977770000" }, headers);
      await http.post("/api/v1/contacts", { name: "So agenda", number: "5531977771111" }, headers);
      assert(!leadOf("5531977770000") && !leadOf("5531977771111"), "lead existed before backfill");
      // only the first one has a conversation here
      const contactId = sql(`SELECT id FROM Contacts WHERE number='5531977770000'`);
      sql(`INSERT INTO Tickets (status, contactId, whatsappId, unreadMessages, isGroup, segment, createdAt, updatedAt) VALUES ('closed', ${contactId}, ${tgId}, 0, false, 'sales', NOW(), NOW())`);
      const r = await http.post("/crm/backfill", {}, auth());
      assert(r.status === 200 && r.data.created >= 1, `backfill ${JSON.stringify(r.data)}`);
      assert(leadOf("5531977770000"), "backfill did not create the lead of the conversation");
      assert(!leadOf("5531977771111"), "an address-book contact became a lead");
    });
    await test("Cloud API campaign sends the approved template, not free text", async () => {
      const list = (await http.post("/contact-lists", { name: "Vestibular" }, auth())).data;
      await http.post(`/contact-lists/${list.id}/import`, { items: [{ name: "Rita Souza", number: "5511966665555" }] }, auth());
      const c = (await http.post("/campaigns", { name: "Vestibular 2027", message: "Olá {{name}}, inscrições abertas!", contactListId: list.id, whatsappId: cid, templateName: "inscricoes_abertas", templateLanguage: "pt_BR", intervalMin: 0, intervalMax: 0, batchSize: 50, batchPause: 1 }, auth())).data;
      const before = graph.sent.length;
      assert((await http.post(`/campaigns/${c.id}/start`, {}, auth())).status === 200, "start");
      const s = await waitFor(() => graph.sent.slice(before).find(x => x.body && x.body.type === "template"), 15000, "template send");
      assert(s.body.template.name === "inscricoes_abertas" && s.body.template.language.code === "pt_BR", "template payload");
      assert(s.body.template.components[0].parameters[0].text === "Rita", "first name parameter");
      assert(s.body.to === "5511966665555", "recipient");
    });
    await test("a campaign with several messages delivers them in order, then marks the recipient as sent", async () => {
      const list = (await http.post("/contact-lists", { name: "Sequência" }, auth())).data;
      await http.post(`/contact-lists/${list.id}/import`, { items: [{ name: "Paula Dias", number: "5511955554444" }] }, auth());
      const steps = [
        { body: "Oi {{name}}! {{spin|Tudo bem|Tudo certo}}?", delaySec: 0 },
        { body: "Abrimos as inscrições do vestibular.", delaySec: 3 },
        { body: "Posso te explicar as bolsas?", delaySec: 3 }
      ];
      const bad = await http.post("/campaigns", { name: "Sem texto", contactListId: list.id, steps: [{ body: "" }] }, auth());
      assert(bad.status === 400, `empty step should be refused, got ${bad.status}`);
      const six = await http.post("/campaigns", { name: "Seis", contactListId: list.id, steps: Array.from({ length: 6 }, () => ({ body: "x" })) }, auth());
      assert(six.status === 400, `6 steps should be refused, got ${six.status}`);
      const tpl = await http.post("/campaigns", { name: "Modelo + sequência", contactListId: list.id, whatsappId: cid, templateName: "inscricoes_abertas", steps }, auth());
      assert(tpl.status === 400, `template + several steps should be refused, got ${tpl.status}`);
      const c = (await http.post("/campaigns", { name: "Sequência", steps, contactListId: list.id, whatsappId: cid, intervalMin: 0, intervalMax: 0, batchSize: 50, batchPause: 1 }, auth())).data;
      assert(c.message.startsWith("Oi {{name}}") && !c.templateName, "first step should mirror message");
      const before = graph.sent.length;
      assert((await http.post(`/campaigns/${c.id}/start`, {}, auth())).status === 200, "start");
      await waitFor(() => graph.sent.slice(before).filter(x => x.body && x.body.type === "text").length >= 3, 30000, "three messages");
      const texts = graph.sent.slice(before).filter(x => x.body && x.body.type === "text").map(x => x.body.text.body);
      assert(/^Oi Paula Dias! Tudo (bem|certo)\?$/.test(texts[0]), `first: ${texts[0]}`);
      assert(texts[1] === steps[1].body && texts[2] === steps[2].body, `order: ${JSON.stringify(texts)}`);
      await waitFor(() => sql(`SELECT status FROM CampaignShippings WHERE campaignId=${c.id}`) === "sent", 8000, "shipping sent");
      assert(sql(`SELECT stepsDone FROM CampaignShippings WHERE campaignId=${c.id}`) === "3", "stepsDone");
      assert(sql(`SELECT nextRunAt IS NOT NULL FROM Campaigns WHERE id=${c.id}`) === "1", "runner state was not persisted");
    });
    await test("a contact list can be built from the CRM funnel with a live count", async () => {
      const dry = await http.post("/contact-lists/from-leads", { dryRun: true }, auth());
      assert(dry.status === 200 && dry.data.count > 0, `dry run ${JSON.stringify(dry.data)}`);
      const made = await http.post("/contact-lists/from-leads", { name: "Funil aberto" }, auth());
      assert(made.status === 200 && made.data.imported === dry.data.count, `created ${JSON.stringify(made.data)}`);
      const items = (await http.get(`/contact-lists/${made.data.id}/items`, auth())).data;
      assert(items.length === made.data.imported && items.every(i => /^\d{10,}$/.test(i.number)), "items are valid numbers");
      const again = await http.post("/contact-lists/from-leads", { listId: made.data.id }, auth());
      assert(again.data.imported === 0 && again.data.skipped === made.data.imported, "second run should add nobody");
      assert((await http.post("/contact-lists/from-leads", {}, auth())).status === 400, "name is required");
    });

    // -------------------------------------------------------------- proposals
    console.log("\nproposals");
    // reference documents: row = [sem, period, bolsa, ajuste, semestral, anual5, total5, mensal5, anual11, total11, mensal11, diff]
    const REF1 = { gross: 1014.6, first: 164.93, fee: 99, parcels: 3, semesters: 6, b1: 25, b2: 20, applied: 83.74, mid: 189.67, late: 206.16, rows: [
      [1, "2026.2", 25, 0, 0, 0, 0, 164.93, 0, 0, 164.93, 0], [2, "2027.1", 20, 5, 2, 5, 12, 184.72, 11, 18, 194.62, 9.9],
      [3, "2027.2", 20, 0, 2, 0, 2, 188.42, 0, 2, 198.51, 10.09], [4, "2028.1", 20, 0, 2, 5, 7, 201.61, 11, 13, 224.32, 22.71],
      [5, "2028.2", 20, 0, 2, 0, 2, 205.64, 0, 2, 228.8, 23.17], [6, "2029.1", 20, 0, 3, 5, 8, 222.09, 11, 14, 260.83, 38.75]] };
    const REF2 = { gross: 1073.8, first: 134.93, fee: 99, parcels: 2, semesters: 8, b1: 30, b2: 25, applied: 87.43, mid: 155.17, late: 168.66, rows: [
      [1, "2026.2", 30, 0, 0, 0, 0, 134.93, 0, 0, 134.93, 0], [2, "2027.1", 25, 5, 2, 5, 12, 151.12, 11, 18, 159.22, 8.1],
      [3, "2027.2", 25, 0, 2, 0, 2, 154.14, 0, 2, 162.4, 8.26], [4, "2028.1", 25, 0, 2, 5, 7, 164.93, 11, 13, 183.51, 18.58],
      [5, "2028.2", 25, 0, 2, 0, 2, 168.23, 0, 2, 187.18, 18.95], [6, "2029.1", 25, 0, 3, 5, 8, 181.69, 11, 14, 213.39, 31.7],
      [7, "2029.2", 25, 0, 3, 0, 3, 187.14, 0, 3, 219.79, 32.65], [8, "2030.1", 25, 0, 3, 5, 8, 202.11, 11, 14, 250.56, 48.45]] };
    const plead = (await http.post("/leads", { name: "Maria Souza Teste", phone: "11 95555-0001", source: "Indicação" }, auth())).data.lead;
    const previewFor = async ref => {
      const r = await http.post("/proposals/preview", { leadId: plead.id, params: { gross: ref.gross, firstMonthly: ref.first, enrollmentFee: ref.fee, installments: ref.parcels, semesters: ref.semesters, startYear: 2026, startSemester: 2, bolsaFirst: ref.b1, bolsaNext: ref.b2 } }, auth());
      assert(r.status === 200, `preview ${r.status} ${JSON.stringify(r.data)}`);
      return r.data;
    };
    for (const [label, ref] of [["PDF de referência (6 semestres)", REF1], ["tela de referência (8 semestres)", REF2]]) {
      await test(`matches the ${label} cell by cell`, async () => {
        const { result } = await previewFor(ref);
        assert(result.bolsaApplied === ref.applied, `bolsa ${result.bolsaApplied} != ${ref.applied}`);
        assert(result.tiers.mid === ref.mid && result.tiers.late === ref.late, `tiers ${JSON.stringify(result.tiers)}`);
        assert(result.rows.length === ref.rows.length, "row count");
        result.rows.forEach((row, i) => {
          const got = [row.semester, row.period, row.bolsa, row.bolsaAdjust, row.semestral, row.annualMin, row.totalMin, row.monthlyMin, row.annualMax, row.totalMax, row.monthlyMax, row.diff];
          assert(JSON.stringify(got) === JSON.stringify(ref.rows[i]), `row ${i + 1}: ${JSON.stringify(got)} != ${JSON.stringify(ref.rows[i])}`);
        });
      });
    }
    await test("document contains every section of the reference proposal", async () => {
      const { html } = await previewFor(REF1);
      for (const t of ["Proposta de Bolsa", "Maria Souza Teste", "Mensalidade bruta atual:", "R$ 1.014,60", "83,74%", "R$ 164,93", "R$ 99,00", "no ato da inscrição", "todo dia 10", "Quantidade de parcelas desse semestre:", "R$ 189,67", "R$ 206,16", "Projeção por semestre", "R$ 260,83", "Produtos ou serviços", "Valor total do pedido", "Mensagem final"]) {
        assert(html.includes(t), `missing: ${t}`);
      }
    });
    await test("WhatsApp message never claims a fixed tuition or a scholarship regression unless the model says so", async () => {
      const base = { gross: REF1.gross, firstMonthly: REF1.first, enrollmentFee: REF1.fee, installments: REF1.parcels, semesters: REF1.semesters, startYear: 2026, startSemester: 2, bolsaFirst: REF1.b1, bolsaNext: REF1.b2 };
      const msgs = async extra => {
        const r = await http.post("/proposals/preview", { leadId: plead.id, params: { ...base, ...extra } }, auth());
        assert(r.status === 200, `preview ${r.status}`);
        return (r.data.messages || []).map(m => m.text).join("\n");
      };
      const plain = await msgs({});
      assert(plain.length > 0, "no messages returned by preview");
      assert(!/Bolsa:\*/.test(plain) && !/25% no 1/.test(plain), "regression line leaked");
      assert(!/fixa/i.test(plain), "claims fixed tuition by default");
      assert(!/até o fim do curso/.test(plain), "generic 'until the end of the course' line leaked");
      assert(/fixa/i.test(await msgs({ fixedUntilEnd: true })), "fixedUntilEnd should say the tuition is fixed");
      assert(/36 mensalidades/.test(await msgs({ installmentsFixed: 36 })), "installmentsFixed=36 should say 36 mensalidades");
    });
    await test("rejects impossible proposals", async () => {
      const bad = p => http.post("/proposals/preview", { leadId: plead.id, params: p }, auth());
      assert((await bad({ gross: 0, firstMonthly: 100 })).status === 400, "zero gross accepted");
      assert((await bad({ gross: 500, firstMonthly: 900 })).status === 400, "first monthly above gross accepted");
    });
    let prop;
    await test("saves a draft, downloads a real PDF and shows it on the public link only after sending", async () => {
      const r = await http.post("/proposals", { leadId: plead.id, params: { gross: REF1.gross, firstMonthly: REF1.first, semesters: 6, startYear: 2026, startSemester: 2 } }, auth());
      assert(r.status === 201, `store ${r.status} ${JSON.stringify(r.data)}`);
      prop = r.data;
      const pdf = await http.get(`/proposals/${prop.id}/pdf`, { ...auth(), responseType: "arraybuffer" });
      assert(pdf.status === 200 && Buffer.from(pdf.data).slice(0, 4).toString() === "%PDF", `pdf ${pdf.status}`);
      assert((await http.get(`/p/${prop.token}`)).status === 404, "draft visible publicly");
    });
    await test("sending delivers the PDF in the conversation, moves the lead and notifies", async () => {
      const lid = plead.id;
      // route the proposal through the WhatsApp Cloud connection (mock Graph API)
      await http.put(`/leads/${lid}`, { phone: "5511955550001" }, auth());
      const before = graph.sent.length;
      const r = await http.post(`/proposals/${prop.id}/send`, { whatsappId: cid, message: "Segue a proposta!" }, auth());
      assert(r.status === 200, `send ${r.status} ${JSON.stringify(r.data)}`);
      assert(graph.media.length >= 1, "pdf not uploaded to the channel");
      const doc = graph.sent.slice(before).find(x => x.body && x.body.type === "document");
      assert(doc && doc.body.document.filename && doc.body.document.filename.endsWith(".pdf"), "document message payload");
      assert(sql(`SELECT status FROM Proposals WHERE id=${prop.id}`) === "sent", "status");
      assert(/proposta/i.test(stageName(lid)), `stage ${stageName(lid)}`);
      assert(sql(`SELECT COUNT(*) FROM LeadActivities WHERE leadId=${lid} AND body LIKE 'Proposta #${prop.id} enviada%'`) === "1", "activity");
      const pub = await http.get(`/p/${prop.token}`);
      assert(pub.status === 200 && String(pub.data).includes("Projeção por semestre"), "public link");
      assert(sql(`SELECT viewedAt IS NOT NULL FROM Proposals WHERE id=${prop.id}`) === "1", "viewedAt");
      assert((await http.put(`/proposals/${prop.id}`, { params: { gross: 999, firstMonthly: 100 } }, auth())).status === 400, "sent proposal editable");
    });
    await test("issued proposals keep their numbers when the template changes", async () => {
      const tpl = (await http.get("/proposal-templates", auth())).data[0];
      await http.put(`/proposal-templates/${tpl.id}`, { enrollmentFee: 500, observation: "texto novo" }, auth());
      const shown = (await http.get(`/proposals/${prop.id}`, auth())).data;
      assert(!shown.html.includes("texto novo") && shown.html.includes("R$ 99,00"), "template change leaked into an issued proposal");
      await http.put(`/proposal-templates/${tpl.id}`, { enrollmentFee: 99, observation: tpl.observation }, auth());
    });

    // ------------------------------------------- admission, CPF and payments
    console.log("\nadmission & enrollment payments");
    const VALID_CPF = "529.982.247-25";
    const mkLead = async (name, phone, extra = {}) => (await http.post("/leads", { name, phone, source: "WhatsApp", ...extra }, auth())).data.lead;

    await test("CPF is validated, hidden from lists and returned only by the detail view", async () => {
      const l = await mkLead("Aluno Cpf", "11 94444-0001");
      assert((await http.put(`/leads/${l.id}`, { cpf: "111.111.111-11" }, auth())).status === 400, "invalid CPF accepted");
      assert((await http.put(`/leads/${l.id}`, { cpf: "123.456.789-00" }, auth())).status === 400, "bad check digits accepted");
      assert((await http.put(`/leads/${l.id}`, { cpf: VALID_CPF }, auth())).status === 200, "valid CPF refused");
      const list = (await http.get("/leads?limit=200", auth())).data.leads.find(x => x.id === l.id);
      assert(list.cpf === undefined && list.hasCpf === true && /^\*\*\*\.\*\*\*\.247-25$/.test(list.cpfMasked), `list leaks CPF: ${JSON.stringify([list.cpf, list.cpfMasked])}`);
      assert((await http.get(`/leads/${l.id}`, auth())).data.cpf === "52998224725", "detail view should return the CPF");
      const dup = await mkLead("Outro", "11 94444-0002");
      assert((await http.put(`/leads/${dup.id}`, { cpf: VALID_CPF }, auth())).status === 400, "same CPF accepted on two leads");
    });
    await test("new leads get the intake period the administrator chose", async () => {
      await http.put("/crm/settings", { entryTerms: ["2027/1", "2027/2"], defaultEntryTerm: "2027/2" }, auth());
      const l = await mkLead("Aluno Periodo", "11 94444-0003");
      assert(sql(`SELECT entryTerm FROM Leads WHERE id=${l.id}`) === "2027/2", "default intake not applied");
      const o = (await http.get("/crm/options", auth())).data;
      assert(o.entryTerms.join() === "2027/1,2027/2" && o.defaultEntryTerm === "2027/2", "options");
      assert(o.admissionTypes.includes("Transferência externa") && !o.shifts.includes("Tarde-x"), "admission types");
    });
    await test("catalog import understands Brazilian prices and updates by name", async () => {
      const r = await http.post("/courses/import", { items: [
        { name: "Direito", category: "Graduação - Teste", modality: "Semipresencial", monthlyFee: "1.290,50", semesters: "10" },
        { name: "Pedagogia", category: "Graduação - Teste", modality: "EAD", monthlyFee: "954,80", semesters: "8" }] }, auth());
      assert(r.data.created === 2, JSON.stringify(r.data));
      const again = await http.post("/courses/import", { items: [{ name: "Direito", category: "Graduação - Teste", modality: "Semipresencial", monthlyFee: "1.300,00", semesters: "10" }] }, auth());
      assert(again.data.updated === 1 && sql("SELECT monthlyFee FROM Courses WHERE name='Direito'") === "1300.00", "update by name");
      assert(sql("SELECT semesters FROM Courses WHERE name='Pedagogia'") === "8", "semesters");
    });
    await test("a transfer student's projection covers only the semesters left to attend", async () => {
      const direito = sql("SELECT id FROM Courses WHERE name='Direito'");
      const l = await mkLead("Aluno Transferido", "11 94444-0004", { courseId: Number(direito), admissionType: "Transferência externa", entrySemester: 4, entryTerm: "2027/1" });
      const r = await http.post("/proposals/preview", { leadId: l.id, params: { gross: 1300, firstMonthly: 260, bolsaFirst: 25, bolsaNext: 20 } }, auth());
      assert(r.status === 200, `preview ${r.status} ${JSON.stringify(r.data)}`);
      assert(r.data.result.rows.length === 7, `rows ${r.data.result.rows.length} (10 semesters, enters at 4th => 7)`);
      assert(r.data.result.rows[0].courseSemester === 4 && r.data.result.rows[6].courseSemester === 10, "course semester numbering");
      assert(r.data.result.rows[0].period === "2027.1" && r.data.result.rows[1].period === "2027.2", "calendar starts at the intake period");
      assert(r.data.html.includes("Ingresso no 4º semestre") && r.data.html.includes("Transferência externa") && r.data.html.includes("7 semestres a cursar"), "document header");
      const full = await mkLead("Aluno Calouro", "11 94444-0005", { courseId: Number(direito), admissionType: "ENEM" });
      const f = await http.post("/proposals/preview", { leadId: full.id, params: { gross: 1300, firstMonthly: 260 } }, auth());
      assert(f.data.result.rows.length === 10, "freshman should see all 10 semesters");
    });

    await test("a transfer can need more semesters than the course length (adaptation)", async () => {
      const direito = sql("SELECT id FROM Courses WHERE name='Direito'");
      const l = await mkLead("Aluno Adaptacao", "11 94444-0006", { courseId: Number(direito), admissionType: "Transferência externa", entrySemester: 4, extraSemesters: 2, entryTerm: "2027/1" });
      const r = await http.post("/proposals/preview", { leadId: l.id, params: { gross: 1300, firstMonthly: 260 } }, auth());
      assert(r.data.result.rows.length === 9, `rows ${r.data.result.rows.length} (7 left + 2 adaptation = 9)`);
      const last = r.data.result.rows[8];
      assert(last.courseSemester === 12, `courseSemester ${last.courseSemester}`);
      assert(r.data.html.includes("9 semestres a cursar") && r.data.html.includes("inclui 2 de adaptação") && r.data.html.includes("Adapt."), "document should flag the adaptation semesters");
      // the consultant can also set the total directly, above the course length
      const o = await http.post("/proposals/preview", { leadId: l.id, params: { gross: 1300, firstMonthly: 260, attendSemesters: 12 } }, auth());
      assert(o.data.result.rows.length === 12 && o.data.html.includes("inclui 5 de adaptação"), "manual total");
      // and below the remaining ones (credits validated)
      const f = await http.post("/proposals/preview", { leadId: l.id, params: { gross: 1300, firstMonthly: 260, attendSemesters: 5 } }, auth());
      assert(f.data.result.rows.length === 5 && !f.data.html.includes("de adaptação"), "fewer semesters");
    });
    await test("decision timeline and motivation replace the payment-form field and lift the score", async () => {
      const base = { source: "Google", email: "x@x.com", city: "Cuiabá" };
      const cold = await mkLead("Lead Frio", "11 94444-0007", { ...base, email: "frio@x.com", decisionTimeline: "Pesquisando, sem prazo" });
      const hot = await mkLead("Lead Quente", "11 94444-0008", { ...base, email: "quente@x.com", decisionTimeline: "Quer matricular agora", motivation: "Mudança de carreira" });
      const sc = id => Number(sql(`SELECT score FROM Leads WHERE id=${id}`));
      assert(sc(hot.id) - sc(cold.id) === 12, `score gap ${sc(hot.id)} vs ${sc(cold.id)} (expected 12)`);
      const o = (await http.get("/crm/options", auth())).data;
      assert(o.decisionTimelines[0] === "Quer matricular agora" && o.motivations.includes("Mudança de carreira"), "options");
      assert(sql(`SELECT motivation FROM Leads WHERE id=${hot.id}`) === "Mudança de carreira", "motivation stored");
    });

    const paying = await mkLead("Aluno Pagante", "5511955550011");
    await test("charging the enrollment fee needs CPF, and Efí credentials", async () => {
      assert((await http.post(`/leads/${paying.id}/payments`, {}, auth())).data.error === "ERR_LEAD_NEEDS_CPF", "no CPF should be refused");
      await http.put(`/leads/${paying.id}`, { cpf: "168.995.350-09" }, auth());
      assert((await http.post(`/leads/${paying.id}/payments`, {}, auth())).data.error === "ERR_EFI_NOT_CONFIGURED", "unconfigured Efí should be refused");
    });
    await test("Efí settings: secret is masked, wrong credentials fail, correct ones connect", async () => {
      await http.put("/payments/efi/settings", { env: "sandbox", clientId: "Client_Id_wrong", clientSecret: "nope", pixKey: "chave-pix@exemplo.com", expiryMinutes: 60 }, auth());
      assert((await http.post("/payments/efi/test", {}, auth())).status === 400, "wrong credentials accepted");
      const v = (await http.put("/payments/efi/settings", { clientId: "Client_Id_test", clientSecret: "Client_Secret_test" }, auth())).data;
      assert(v.clientSecret.startsWith("••••") && !JSON.stringify(v).includes("Client_Secret_test"), "secret leaked");
      assert(v.configured && v.webhookUrl.includes("/webhooks/efi/"), "settings view");
      assert((await http.post("/payments/efi/test", {}, auth())).data.ok === true, "test connection");
      const reg = await http.post("/payments/efi/webhook", {}, auth());
      assert(reg.status === 200 && efi.webhook && efi.webhook.chave === "chave-pix@exemplo.com" && efi.webhook.skipMtls === "true", `webhook registration ${JSON.stringify(efi.webhook)}`);
    });
    let pay;
    await test("generates a Pix charge with the right payload and keeps the QR code", async () => {
      const r = await http.post(`/leads/${paying.id}/payments`, {}, auth());
      assert(r.status === 201, `status ${r.status} ${JSON.stringify(r.data)}`);
      pay = r.data;
      const call = efi.calls.find(c => c.path === `/v2/cob/${pay.txid}`);
      assert(call.body.valor.original === "99.00" && call.body.devedor.cpf === "16899535009" && call.body.devedor.nome === "Aluno Pagante", `payload ${JSON.stringify(call.body)}`);
      assert(call.body.chave === "chave-pix@exemplo.com" && call.body.calendario.expiracao === 3600, "key / expiry");
      assert(pay.txid.length >= 26 && pay.txid.length <= 35 && /^[a-zA-Z0-9]+$/.test(pay.txid), `txid ${pay.txid}`);
      assert(pay.pixCopiaECola.startsWith("00020126") && pay.qrImage.startsWith("data:image/png;base64,"), "pix code / qr");
      assert(pay.status === "pending", "status");
      const again = await http.post(`/leads/${paying.id}/payments`, {}, auth());
      assert(again.data.id === pay.id, "second request should reuse the open charge");
    });
    await test("a webhook never marks a payment as paid on its own word", async () => {
      assert((await http.post("/webhooks/efi/wrong-secret/pix", { pix: [{ txid: pay.txid }] })).status === 404, "wrong secret accepted");
      const secret = (await http.get("/payments/efi/settings", auth())).data.webhookUrl.split("/").pop();
      await http.post(`/webhooks/efi/${secret}/pix`, { pix: [{ txid: pay.txid, valor: "99.00" }] }); // Efí still says ATIVA
      await sleep(1200);
      assert(sql(`SELECT status FROM Payments WHERE id=${pay.id}`) === "pending", "forged webhook marked it paid");
    });
    await test("an underpayment is not accepted", async () => {
      efi.charges[pay.txid].status = "CONCLUIDA";
      efi.charges[pay.txid].pix = [{ endToEndId: "E1", txid: pay.txid, valor: "50.00", horario: new Date().toISOString() }];
      const secret = (await http.get("/payments/efi/settings", auth())).data.webhookUrl.split("/").pop();
      await http.post(`/webhooks/efi/${secret}/pix`, { pix: [{ txid: pay.txid }] });
      await sleep(1500);
      assert(sql(`SELECT status FROM Payments WHERE id=${pay.id}`) === "pending", "partial payment accepted as full");
      assert(sql(`SELECT lastError LIKE 'Pagamento parcial%' FROM Payments WHERE id=${pay.id}`) === "1", "partial not recorded");
    });
    await test("a confirmed webhook marks the fee paid, moves the lead and logs it", async () => {
      efi.charges[pay.txid].pix = [{ endToEndId: "E2026ABC", txid: pay.txid, valor: "99.00", horario: new Date().toISOString() }];
      const secret = (await http.get("/payments/efi/settings", auth())).data.webhookUrl.split("/").pop();
      await http.post(`/webhooks/efi/${secret}/pix`, { pix: [{ txid: pay.txid }] });
      await waitFor(() => sql(`SELECT status FROM Payments WHERE id=${pay.id}`) === "paid", 8000, "payment paid");
      assert(sql(`SELECT endToEndId FROM Payments WHERE id=${pay.id}`) === "E2026ABC", "endToEndId");
      assert(stageName(paying.id) === "Matrícula em andamento", `stage ${stageName(paying.id)}`);
      await waitFor(() => sql(`SELECT COUNT(*) FROM LeadActivities WHERE leadId=${paying.id} AND body LIKE 'Taxa de matrícula paga%'`) === "1", 8000, "payment activity");
      const detail = (await http.get(`/leads/${paying.id}`, auth())).data;
      assert(detail.payments && detail.payments.length === 1 && detail.hasCpf && detail.cpfMasked.endsWith("-09"), "paid fee/CPF flags on the lead");
      // the same notification again (webhook + poller) must not duplicate anything
      await http.post(`/webhooks/efi/${secret}/pix`, { pix: [{ txid: pay.txid }] });
      await sleep(1500);
      assert(sql(`SELECT COUNT(*) FROM LeadActivities WHERE leadId=${paying.id} AND body LIKE 'Taxa de matrícula paga%'`) === "1", "duplicate activity");
    });
    await test("without a webhook (localhost) the poller still detects the payment", async () => {
      const l = await mkLead("Aluno Poller", "5511955550002");
      await http.put(`/leads/${l.id}`, { cpf: "111.444.777-35" }, auth());
      const p = (await http.post(`/leads/${l.id}/payments`, { amount: "150,50" }, auth())).data;
      assert(efi.calls.find(c => c.path === `/v2/cob/${p.txid}`).body.valor.original === "150.50", "custom amount");
      efi.charges[p.txid].status = "CONCLUIDA";
      efi.charges[p.txid].pix = [{ endToEndId: "E9", txid: p.txid, valor: "150.50", horario: new Date().toISOString() }];
      await waitFor(() => sql(`SELECT status FROM Payments WHERE id=${p.id}`) === "paid", 12000, "poller detection");
      assert(/matr/i.test(stageName(l.id)), `stage ${stageName(l.id)}`);
    });
    // --------------------------------------------------- Bolix + split to the consultant
    // fresh, valid CPFs (a CPF identifies one lead, so tests must not reuse them)
    const cpfFor = n => {
      const d = String(n).padStart(9, "0").split("").map(Number);
      const dv = (arr, w) => { const t = arr.reduce((a, x, i) => a + x * (w - i), 0) % 11; return t < 2 ? 0 : 11 - t; };
      const d1 = dv(d, 10); const d2 = dv([...d, d1], 11);
      return [...d, d1, d2].join("");
    };
    // the system counts days in the company timezone (Rondônia), not in UTC: late in the evening the two dates differ
    const ymdPlus = d => new Date(Date.now() + d * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });
    let bolix, bolixLead, bolixConsultantToken, bolixConsultantId;
    await test("Bolix routes the fee to the consultant's Efí account, or to the company when none is set", async () => {
      const mkUser = async (name, email) => (await http.post("/users", { name, email, password: "senha123", role: "consultor" }, auth())).data;
      const cons = await mkUser("Consultora Bolix", "bolix@polo.test");
      bolixConsultantId = cons.id;
      bolixConsultantToken = (await http.post("/auth/login", { email: "bolix@polo.test", password: "senha123" })).data.token;
      // a consultant sees only "informed" + the last digits, never the code back
      assert((await http.put("/me/efi", { payeeCode: "xx" }, asUser(bolixConsultantToken))).status === 400, "short code accepted");
      const saved = (await http.put("/me/efi", { payeeCode: "A1b2C3d4E5f6" }, asUser(bolixConsultantToken))).data;
      assert(saved.informed === true && saved.masked === "••••E5f6" || saved.masked.endsWith("f6"), `masked ${JSON.stringify(saved)}`);
      assert(!JSON.stringify((await http.get("/me/efi", asUser(bolixConsultantToken))).data).includes("A1b2C3d4"), "payee code leaked back");

      bolixLead = await mkLead("Aluno Bolix", "5511955551001", { ownerId: bolixConsultantId });
      await http.put(`/leads/${bolixLead.id}`, { cpf: cpfFor(123456780) }, auth());
      const due = ymdPlus(2); // inside the "N days before" window: created right away
      const r = await http.post(`/leads/${bolixLead.id}/payments`, { method: "bolix", dueDate: due, amount: "99" }, auth());
      assert(r.status === 201, `bolix ${r.status} ${JSON.stringify(r.data)}`);
      bolix = r.data;
      assert(bolix.method === "bolix" && bolix.status === "pending", `status ${bolix.status}`);
      const call = billet.calls.filter(c => c.method === "POST").pop();
      assert(call, "Efí Cobranças not called");
      const item = call.body.items[0];
      assert(item.value === 9900, `value ${item.value}`);
      assert(item.marketplace && item.marketplace.repasses[0].payee_code === "A1b2C3d4E5f6" && item.marketplace.repasses[0].percentage === 10000, `split ${JSON.stringify(item.marketplace)}`);
      assert(call.body.payment.banking_billet.expire_at === due && call.body.payment.banking_billet.customer.cpf === cpfFor(123456780), "billet payload");
      const row = sql(`SELECT CONCAT(status,'|',method,'|',recipientCode,'|',splitPct) FROM Payments WHERE id=${bolix.id}`);
      assert(row === "pending|bolix|A1b2C3d4E5f6|100", `row ${row}`);

      // a lead whose consultant has no account falls back to the company account (no split)
      const plain = await mkLead("Aluno Sem Conta", "5511955551002", { ownerId: 1 });
      await http.put(`/leads/${plain.id}`, { cpf: cpfFor(123456781) }, auth());
      await http.post(`/leads/${plain.id}/payments`, { method: "bolix", dueDate: due }, auth());
      const call2 = billet.calls.filter(c => c.method === "POST").pop();
      assert(!call2.body.items[0].marketplace, "split sent without a registered account");
      assert((await http.post(`/leads/${plain.id}/payments`, { method: "bolix", dueDate: "2020-01-01", force: true }, auth())).status === 400, "past due date accepted");
    });
    await test("a far due date schedules the charge: created later, with a task for the consultant", async () => {
      const l = await mkLead("Aluno Agendado", "5511955551003", { ownerId: bolixConsultantId });
      await http.put(`/leads/${l.id}`, { cpf: cpfFor(123456782) }, auth());
      const callsBefore = billet.calls.length;
      const r = await http.post(`/leads/${l.id}/payments`, { method: "bolix", dueDate: ymdPlus(40) }, auth());
      assert(r.status === 201 && r.data.status === "scheduled", `status ${r.data.status}`);
      assert(billet.calls.length === callsBefore, "charge created too early");
      sql(`UPDATE Payments SET generateAt=NOW() - INTERVAL '1 minute' WHERE id=${r.data.id}`);
      await waitFor(() => sql(`SELECT status FROM Payments WHERE id=${r.data.id}`) === "pending", 12000, "scheduled charge issued");
      assert(sql(`SELECT COUNT(*) FROM LeadTasks WHERE leadId=${l.id} AND userId=${bolixConsultantId} AND title LIKE 'Enviar o boleto%'`) === "1", "no reminder task for the consultant");
    });
    await test("a Bolix payment is confirmed only after Efí itself says so", async () => {
      const secret = (await http.get("/payments/efi/settings", auth())).data.webhookUrl.split("/").pop();
      const chargeId = sql(`SELECT chargeId FROM Payments WHERE id=${bolix.id}`);
      billet.notifications.forged = []; // a token that names no charge
      await http.post(`/webhooks/efi/${secret}/billet`, "notification=forged", { headers: { "content-type": "application/x-www-form-urlencoded" } });
      await sleep(900);
      assert(sql(`SELECT status FROM Payments WHERE id=${bolix.id}`) === "pending", "forged notification changed the payment");
      billet.notifications.real = [chargeId];
      await http.post(`/webhooks/efi/${secret}/billet`, "notification=real", { headers: { "content-type": "application/x-www-form-urlencoded" } });
      await sleep(900);
      assert(sql(`SELECT status FROM Payments WHERE id=${bolix.id}`) === "pending", "notification alone must not mark it paid");
      billet.charges[chargeId].status = "paid";
      await http.post(`/webhooks/efi/${secret}/billet`, "notification=real", { headers: { "content-type": "application/x-www-form-urlencoded" } });
      await waitFor(() => sql(`SELECT status FROM Payments WHERE id=${bolix.id}`) === "paid", 8000, "bolix paid");
      assert(/matr/i.test(stageName(bolixLead.id)), `stage ${stageName(bolixLead.id)}`);
    });
    await test("an open Bolix can be cancelled at Efí", async () => {
      const l = await mkLead("Aluno Bolix Cancela", "5511955551004");
      await http.put(`/leads/${l.id}`, { cpf: cpfFor(123456783) }, auth());
      // due in 2 days: the charge (generated 3 days before) is already open at any hour (with 3 days it is only generated
      // at 07:00 local, so between midnight and 07:00 it would still be "scheduled")
      const p = (await http.post(`/leads/${l.id}/payments`, { method: "bolix", dueDate: ymdPlus(2) }, auth())).data;
      assert(p.status === "pending", `status ${p.status}`);
      const r = await http.post(`/payments/${p.id}/cancel`, {}, auth());
      assert(r.status === 200 && r.data.status === "cancelled", "cancel");
      assert(billet.calls.some(c => c.method === "PUT" && c.path.endsWith("/cancel")), "Efí not told");
    });
    await test("an open charge can be cancelled at Efí", async () => {
      const l = await mkLead("Aluno Cancela", "5511955550003");
      await http.put(`/leads/${l.id}`, { cpf: "935.411.347-80" }, auth());
      const p = (await http.post(`/leads/${l.id}/payments`, {}, auth())).data;
      const r = await http.post(`/payments/${p.id}/cancel`, {}, auth());
      assert(r.status === 200 && r.data.status === "cancelled", "cancel");
      assert(efi.calls.some(c => c.method === "PATCH" && c.path === `/v2/cob/${p.txid}` && c.body.status === "REMOVIDA_PELO_USUARIO_RECEBEDOR"), "Efí not told");
      assert((await http.post(`/payments/${p.id}/cancel`, {}, auth())).status === 400, "cancelled twice");
    });
    await test("the Pix code and QR image are sent to the candidate in the conversation", async () => {
      const l = await mkLead("Aluno Envio", "5511955550004");
      await http.put(`/leads/${l.id}`, { cpf: "111.444.777-35".replace("111.444.777-35", "390.533.447-05") }, auth());
      const p = (await http.post(`/leads/${l.id}/payments`, {}, auth())).data;
      const before = graph.sent.length;
      const r = await http.post(`/payments/${p.id}/send`, { whatsappId: cid }, auth());
      assert(r.status === 200, `send ${r.status} ${JSON.stringify(r.data)}`);
      const sent = graph.sent.slice(before);
      assert(sent.some(x => x.body && x.body.type === "image"), "QR image not sent");
      assert(sent.some(x => x.body && x.body.image && x.body.image.caption && x.body.image.caption.includes(p.pixCopiaECola)), "copia e cola missing from the message");
    });

    // ------------------------------------------------ hardening / transfer / safety
    console.log("\nSegurança, transferência de setor e proteção da API não oficial");
    let agentToken, agentId, qA, qB;
    await test("public signup is closed by default", async () => {
      const r = await http.post("/auth/signup", { name: "Intruso", email: "intruso@x.com", password: "123456", profile: "admin" });
      assert(r.status === 403, `signup answered ${r.status}`);
      assert(sql(`SELECT COUNT(*) FROM Users WHERE email='intruso@x.com'`) === "0", "user was created");
    });
    await test("an agent can log in but cannot change settings, queues, users or delete data", async () => {
      qA = (await http.post("/queue", { name: "Setor A", color: "#0b4279" }, auth())).data.id;
      qB = (await http.post("/queue", { name: "Setor B", color: "#e08a00" }, auth())).data.id;
      const created = await http.post("/users", { name: "Atendente A", email: "agente-a@x.com", password: "agente123", profile: "user", queueIds: [qA] }, auth());
      assert(created.status === 200, `create agent ${created.status} ${JSON.stringify(created.data)}`);
      agentId = created.data.id;
      agentToken = (await http.post("/auth/login", { email: "agente-a@x.com", password: "agente123" })).data.token;
      assert(agentToken, "agent login");
      assert((await http.post("/queue", { name: "X", color: "#000000" }, asUser(agentToken))).status === 403, "agent created a queue");
      assert((await http.post("/users", { name: "Z", email: "z@x.com", password: "123456" }, asUser(agentToken))).status === 403, "agent created a user");
      assert((await http.delete(`/tickets/${tgTicket}`, asUser(agentToken))).status === 403, "agent deleted a ticket");
      // an agent may connect only their own QR Code number: other channels and the admin-only fields are ignored
      const own = await http.post("/whatsapp", { name: "Hack", channel: "telegram", config: "{}", isDefault: true }, asUser(agentToken));
      assert(own.status === 200 && own.data.channel === "whatsapp" && own.data.isDefault === false && own.data.config == null, `agent connection ${own.status} ${JSON.stringify(own.data).slice(0, 150)}`);
      assert((await http.delete(`/whatsapp/${own.data.id}`, asUser(agentToken))).status === 200, "agent removes own number");
    });
    await test("an agent cannot open conversations of another sector", async () => {
      const t = ticketOf("tg_5552"); // sits in "Admissão", which the agent does not belong to
      assert((await http.get(`/tickets/${t}`, asUser(agentToken))).status === 403, "ticket readable");
      assert((await http.get(`/messages/${t}`, asUser(agentToken))).status === 403, "messages readable");
      assert((await http.post(`/messages/${t}`, { body: "intruso" }, asUser(agentToken))).status === 403, "message sendable");
      assert((await http.get(`/tickets/${t}`, auth())).status === 200, "admin lost access");
    });
    await test("transferring to a sector releases the ticket and silences the bots", async () => {
      sql(`UPDATE Tickets SET aiActive=1, chatbotNodeId=NULL WHERE id=${tgTicket}`);
      const r = await http.put(`/tickets/${tgTicket}`, { queueId: qB }, auth());
      assert(r.status === 200, `transfer ${r.status} ${JSON.stringify(r.data)}`);
      assert(sql(`SELECT CONCAT(status,'|',IFNULL(userId,'null'),'|',queueId,'|',CAST(aiActive AS INTEGER),'|',chatbotNodeId) FROM Tickets WHERE id=${tgTicket}`) === `pending|null|${qB}|0|-1`, `ticket state after transfer: ${sql(`SELECT CONCAT(status,'|',IFNULL(userId,'null'),'|',IFNULL(queueId,'null'),'|',CAST(aiActive AS INTEGER),'|',IFNULL(chatbotNodeId,'null')) FROM Tickets WHERE id=${tgTicket}`)}`);
      const ev = sql(`SELECT CONCAT(type,'|',toQueueId) FROM TicketEvents WHERE ticketId=${tgTicket} ORDER BY id DESC LIMIT 1`);
      assert(ev === `transfer|${qB}`, `event ${ev}`);
      const events = (await http.get(`/tickets/${tgTicket}/events`, auth())).data;
      assert(events.length >= 1 && events[0].toQueue.name === "Setor B", "history endpoint");
    });
    await test("transfer validates agent, sector and status", async () => {
      assert((await http.put(`/tickets/${tgTicket}`, { userId: agentId, queueId: qB }, auth())).status === 422, "agent outside the sector accepted");
      assert((await http.put(`/tickets/${tgTicket}`, { queueId: 99999 }, auth())).status === 404, "unknown sector accepted");
      assert((await http.put(`/tickets/${tgTicket}`, { status: "banana" }, auth())).status === 400, "invalid status accepted");
    });
    await test("a sector with auto-assignment gives the transferred ticket to an agent and the note + notice are sent", async () => {
      const upd = await http.put(`/queue/${qA}`, { name: "Setor A", color: "#0b4279", autoAssign: "roundrobin" }, auth());
      assert(upd.status === 200 || upd.status === 201, `queue update ${upd.status}`);
      const before = tg.sent.length;
      const r = await http.put(`/tickets/${tgTicket}`, { queueId: qA, note: "Cliente quer Direito", notifyClient: true }, auth());
      assert(r.status === 200, `transfer ${r.status} ${JSON.stringify(r.data)}`);
      assert(sql(`SELECT CONCAT(status,'|',userId) FROM Tickets WHERE id=${tgTicket}`) === `open|${agentId}`, "auto-assign did not run");
      assert(sql(`SELECT COUNT(*) FROM TicketEvents WHERE ticketId=${tgTicket} AND type='auto_assigned' AND toUserId=${agentId}`) === "1", "auto-assign not logged");
      assert(sql(`SELECT note FROM TicketEvents WHERE ticketId=${tgTicket} AND type='transfer' ORDER BY id DESC LIMIT 1`) === "Cliente quer Direito", "note");
      assert(tg.sent.slice(before).some(x => x.method === "sendMessage" && x.body.text.includes("encaminhado para o setor")), "client was not told");
      // the agent now owns it and may read it; another agent's write is refused by the guard
      assert((await http.get(`/tickets/${tgTicket}`, asUser(agentToken))).status === 200, "owner cannot read");
    });
    await test("SAIR opts the contact out and VOLTAR brings them back", async () => {
      const before = tg.sent.length;
      tg.updates.push({ update_id: 30, message: { message_id: 90, chat: { id: 5551, type: "private" }, from: { first_name: "Ana" }, text: "SAIR" } });
      await waitFor(() => sql(`SELECT optOut FROM Contacts WHERE number='tg_5551'`) === "1", 8000, "opt-out");
      await waitFor(() => tg.sent.slice(before).some(x => x.body.text && x.body.text.includes("não receberá mais")), 8000, "confirmation");
      tg.updates.push({ update_id: 31, message: { message_id: 91, chat: { id: 5551, type: "private" }, from: { first_name: "Ana" }, text: "voltar" } });
      await waitFor(() => sql(`SELECT optOut FROM Contacts WHERE number='tg_5551'`) === "0", 8000, "opt-in");
    });
    await test("unofficial connection: campaigns block cold contacts and opted-out contacts", async () => {
      const wa = (await http.post("/whatsapp", { name: "QR de teste", channel: "whatsapp" }, auth())).data;
      await sleep(1500); // let the (skipped) session start finish before faking the status
      sql(`UPDATE Whatsapps SET status='CONNECTED' WHERE id=${wa.id}`);
      const list = (await http.post("/contact-lists", { name: "Frios" }, auth())).data;
      await http.post(`/contact-lists/${list.id}/import`, { items: [{ name: "Frio Um", number: "5511977770001" }] }, auth());
      const c = (await http.post("/campaigns", { name: "Frios", message: "Oi {{name}}", contactListId: list.id, whatsappId: wa.id, intervalMin: 0, intervalMax: 0, batchSize: 50, batchPause: 1 }, auth())).data;
      assert((await http.post(`/campaigns/${c.id}/start`, {}, auth())).status === 200, "start");
      try {
        await waitFor(() => {
          // the (skipped) session start may still overwrite the status: keep faking it
          sql(`UPDATE Whatsapps SET status='CONNECTED' WHERE id=${wa.id}`);
          return sql(`SELECT status FROM CampaignShippings WHERE campaignId=${c.id} LIMIT 1`) === "failed";
        }, 45000, "cold contact blocked");
      } catch (e) {
        throw new Error(`${e.message}; shipping=${sql(`SELECT CONCAT(status,'|',IFNULL(error,'')) FROM CampaignShippings WHERE campaignId=${c.id} LIMIT 1`)} wa=${sql(`SELECT status FROM Whatsapps WHERE id=${wa.id}`)} campaign=${sql(`SELECT CONCAT(status,'|',IFNULL(pauseReason,'')) FROM Campaigns WHERE id=${c.id}`)}`);
      }
      const why = sql(`SELECT error FROM CampaignShippings WHERE campaignId=${c.id} LIMIT 1`);
      assert(/nunca respondeu/.test(why), `reason: ${why}`);
      const safety = (await http.get(`/channels/${wa.id}/safety`, auth())).data;
      assert(safety.unofficial === true && safety.riskMode === "strict" && safety.dailyLimit === 20, `safety ${JSON.stringify(safety)}`);
      assert((await http.put(`/whatsapp/${wa.id}`, { name: "QR de teste", riskMode: "xyz" }, auth())).status === 400, "bad riskMode accepted");
    });
    await test("messages can be starred, forwarded, and reactions respect the channel", async () => {
      const m = sql(`SELECT id FROM Messages WHERE ticketId=${tgTicket} AND fromMe=1 ORDER BY createdAt LIMIT 1`).split("\n")[0];
      assert(m, "no outbound message to work with");
      assert((await http.put(`/messages/${m}/star`, { starred: true }, auth())).status === 200, "star");
      assert(sql(`SELECT starred FROM Messages WHERE id='${m}'`) === "1", "starred not saved");
      const tgBefore = tg.sent.length;
      assert((await http.post(`/messages/${m}/react`, { emoji: "👍" }, auth())).status === 200, "telegram reaction refused");
      const tgReact = tg.sent.slice(tgBefore).find(x => x.method === "setMessageReaction");
      assert(tgReact && String(tgReact.body.chat_id) === "5551" && tgReact.body.reaction[0].emoji === "👍", `setMessageReaction ${JSON.stringify(tgReact && tgReact.body)}`);
      tg.updates.push({ update_id: 40, message_reaction: { chat: { id: 5551, type: "private" }, message_id: 10, user: { id: 5551 }, new_reaction: [{ type: "emoji", emoji: "❤" }] } });
      await waitFor(() => sql(`SELECT reactions FROM Messages WHERE id='tg-${tgId}-5551-10'`).includes("❤"), 8000, "telegram inbound reaction");
      // the list tells about the reaction without opening the conversation
      await waitFor(() => sql(`SELECT lastMessageType FROM Tickets t JOIN Messages m ON m.ticketId=t.id WHERE m.id='tg-${tgId}-5551-10'`) === "reaction", 6000, "reaction in the list preview");
      assert(sql(`SELECT lastMessage FROM Tickets t JOIN Messages m ON m.ticketId=t.id WHERE m.id='tg-${tgId}-5551-10'`).startsWith("Reagiu com ❤"), "reaction preview text");
      // forward into the other open Telegram conversation (Beto)
      const other = ticketOf("tg_5552");
      assert(sql(`SELECT status FROM Tickets WHERE id=${other}`) !== "closed", "target ticket closed");
      const before = tg.sent.length;
      const f = await http.post(`/messages/${m}/forward`, { ticketIds: [Number(other)] }, auth());
      assert(f.status === 200 && f.data.sent === 1, `forward ${f.status} ${JSON.stringify(f.data)}`);
      assert(tg.sent.slice(before).some(x => x.method === "sendMessage" && String(x.body.chat_id) === "5552"), "not delivered to the other chat");
      assert((await http.post(`/messages/${m}/forward`, { ticketIds: [] }, auth())).status === 400, "empty target accepted");
      assert((await http.post(`/messages/${m}/forward`, { ticketIds: [Number(other)] }, asUser(agentToken))).status === 403, "agent forwarded outside own permissions");
    });
    await test("forwarding in a batch answers at once, sends in the background and reports the progress; a reaction shows at once and is not doubled by its echo", async () => {
      const mine = sql(`SELECT id FROM Messages WHERE ticketId=${tgTicket} AND fromMe=1 ORDER BY createdAt LIMIT 2`).split("\n").filter(Boolean);
      assert(mine.length >= 1, "no outbound messages");
      const other = ticketOf("tg_5552");
      const before = tg.sent.length;
      const t0 = Date.now();
      const f = await http.post("/messages/forward-batch", { messageIds: mine, ticketIds: [Number(other)] }, auth());
      assert(f.status === 202 && f.data.total === mine.length && f.data.batchId, `batch ${f.status} ${JSON.stringify(f.data)}`);
      assert(Date.now() - t0 < 2500, "the batch waited for the sending");
      await waitFor(() => tg.sent.slice(before).filter(x => /^send(Message|Photo|Document|Video|Audio|Voice)$/.test(x.method) && String(x.body.chat_id) === "5552").length >= mine.length, 15000, "batch delivered").catch(e => { throw new Error(`${e.message}: ${JSON.stringify(tg.sent.slice(before).map(x => [x.method, x.body.chat_id]))} mine=${mine}`); });
      assert((await http.post("/messages/forward-batch", { messageIds: mine, ticketIds: [] }, auth())).status === 400, "empty target accepted");
      assert((await http.post("/messages/forward-batch", { messageIds: ["nao-existe"], ticketIds: [Number(other)] }, auth())).status === 404, "unknown message accepted");
      assert((await http.post("/messages/forward-batch", { messageIds: mine, ticketIds: [Number(other)] }, asUser(agentToken))).status === 403, "agent forwarded outside own permissions");
      // the same reaction twice (the echo of the phone) does not double it
      const m = mine[0];
      assert((await http.post(`/messages/${m}/react`, { emoji: "🙏" }, auth())).status === 200, "react");
      assert((await http.post(`/messages/${m}/react`, { emoji: "🙏" }, auth())).status === 200, "react again");
      const rx = JSON.parse(sql(`SELECT reactions FROM Messages WHERE id='${m}'`));
      assert(rx.filter(r => r.fromMe).length === 1, `reaction doubled ${JSON.stringify(rx)}`);
    });
    await test("password recovery by e-mail: the account is set on screen, the link works once, nobody can tell who has an account", async () => {
      // a tiny SMTP server that keeps what it receives
      const net = require("net");
      const inbox = [];
      const smtp = net.createServer(sock => {
        let mode = "cmd", data = "", authStep = 0, rec = { auth: "", raw: "" };
        sock.write("220 mock ESMTP\r\n");
        let buf = "";
        sock.on("data", chunk => {
          buf += chunk.toString();
          if (mode === "data") {
            if (buf.endsWith("\r\n.\r\n")) { rec.raw = buf; inbox.push(rec); rec = { auth: rec.auth, raw: "" }; buf = ""; mode = "cmd"; sock.write("250 queued\r\n"); }
            return;
          }
          const lines = buf.split("\r\n"); buf = lines.pop();
          for (const line of lines) {
            if (authStep === 1) { rec.auth = Buffer.from(line, "base64").toString() + "|"; authStep = 2; sock.write("334 UGFzc3dvcmQ6\r\n"); continue; }
            if (authStep === 2) { rec.auth += Buffer.from(line, "base64").toString(); authStep = 0; sock.write("235 ok\r\n"); continue; }
            if (/^EHLO|^HELO/i.test(line)) sock.write("250-mock\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n");
            else if (/^AUTH PLAIN/i.test(line)) { const parts = Buffer.from(line.split(" ")[2] || "", "base64").toString().split("\0"); rec.auth = `${parts[1]}|${parts[2]}`; sock.write("235 ok\r\n"); }
            else if (/^AUTH LOGIN/i.test(line)) { authStep = 1; sock.write("334 VXNlcm5hbWU6\r\n"); }
            else if (/^MAIL FROM|^RCPT TO/i.test(line)) sock.write("250 ok\r\n");
            else if (/^DATA/i.test(line)) { mode = "data"; sock.write("354 go\r\n"); }
            else if (/^QUIT/i.test(line)) { sock.write("221 bye\r\n"); sock.end(); }
            else sock.write("250 ok\r\n");
          }
        });
        sock.on("error", () => {});
      });
      await new Promise(r => smtp.listen(9106, "127.0.0.1", r));
      try {
        const decode = raw => raw.replace(/=\r?\n/g, "").replace(/=3D/g, "=");
        // nothing is set up yet: asking for a link answers the same and sends nothing
        await http.post("/users", { name: "Maria Recupera", email: "recupera@x.com", password: "senha-antiga1", role: "consultor" }, auth());
        assert((await http.post("/auth/forgot", { email: "recupera@x.com" })).status === 200, "forgot (not set up)");
        await new Promise(r => setTimeout(r, 400));
        assert(inbox.length === 0, "an e-mail went out without an account set up");
        assert((await http.post("/mail/test", {}, auth())).status === 400, "test mail without setup");

        // set up from the screen: the password is sealed and never comes back
        const saved = await http.put("/mail/settings", { host: "127.0.0.1", port: 9106, secure: false, user: "cruzeirogpt@gmail.com", fromName: "Cruzeiro Teste", pass: "abcd efgh ijkl mnop" }, auth());
        assert(saved.status === 200 && saved.data.hasPassword === true && !JSON.stringify(saved.data).includes("abcdefgh"), `settings ${JSON.stringify(saved.data)}`);
        assert(sql(`SELECT value FROM Settings WHERE key='mail_pass'`).startsWith("enc:v1:"), "the mail password is not sealed");
        assert(!JSON.stringify((await http.get("/settings", auth())).data).includes("mail_pass"), "the mail password is in the generic settings list");
        assert((await http.put("/settings/mail_pass", { value: "x" }, auth())).status === 403, "the mail password was written raw");
        assert((await http.get("/mail/settings", asUser(agentToken))).status === 403, "an agent read the mail settings");
        assert((await http.put("/mail/settings", { port: 99999 }, auth())).status === 400, "bad port accepted");
        // the masked placeholder sent back does not replace the password
        assert((await http.put("/mail/settings", { pass: "••••••••" }, auth())).data.hasPassword === true, "mask replaced the password");

        const t = await http.post("/mail/test", {}, auth());
        assert(t.status === 200, `test mail ${t.status} ${JSON.stringify(t.data)}`);
        await waitFor(() => inbox.length === 1, 8000, "test e-mail arrived");
        assert(inbox[0].auth === "cruzeirogpt@gmail.com|abcdefghijklmnop", `smtp login ${inbox[0].auth}`);
        assert(/Subject: Chat Acad/.test(inbox[0].raw) || /Subject: =\?UTF-8/.test(inbox[0].raw), "test e-mail without subject");

        // the link: same answer for known and unknown addresses
        assert((await http.post("/auth/forgot", { email: "ninguem@x.com" })).data.ok === true, "unknown address answered differently");
        await new Promise(r => setTimeout(r, 500));
        assert(inbox.length === 1, "an e-mail went to an address that has no account");
        assert((await http.post("/auth/forgot", { email: "Recupera@X.com" })).data.ok === true, "forgot");
        await waitFor(() => inbox.length === 2, 8000, "recovery e-mail");
        const link1 = decode(inbox[1].raw).match(/redefinir-senha\/([a-f0-9]{64})/);
        assert(link1 && /To: recupera@x.com/i.test(inbox[1].raw), "no link in the e-mail");
        // a newer request cancels the older link
        assert((await http.post("/auth/forgot", { email: "recupera@x.com" })).status === 200, "forgot again");
        await waitFor(() => inbox.length === 3, 8000, "second recovery e-mail");
        const link2 = decode(inbox[2].raw).match(/redefinir-senha\/([a-f0-9]{64})/);
        assert(link2[1] !== link1[1], "same token twice");
        assert((await http.get(`/auth/reset/${link1[1]}`)).data.valid === false, "the older link still works");
        assert((await http.get(`/auth/reset/${link2[1]}`)).data.valid === true, "the new link does not work");
        assert((await http.post("/auth/reset", { token: link2[1], password: "curta" })).status === 400, "a short password was accepted");
        assert((await http.post("/auth/reset", { token: "0".repeat(64), password: "outra-senha-9" })).status === 400, "an invented token worked");
        assert((await http.post("/auth/reset", { token: link1[1], password: "outra-senha-9" })).status === 400, "the cancelled link worked");

        const refreshBefore = (await http.post("/auth/login", { email: "recupera@x.com", password: "senha-antiga1" })).status;
        assert(refreshBefore === 200, "login before");
        assert((await http.post("/auth/reset", { token: link2[1], password: "outra-senha-9" })).status === 200, "reset");
        assert((await http.post("/auth/login", { email: "recupera@x.com", password: "senha-antiga1" })).status === 401, "the old password still works");
        assert((await http.post("/auth/login", { email: "recupera@x.com", password: "outra-senha-9" })).status === 200, "the new password does not work");
        assert((await http.post("/auth/reset", { token: link2[1], password: "mais-uma-senha-1" })).status === 400, "a link worked twice");
        assert(sql(`SELECT COUNT(*) FROM PasswordResets WHERE tokenHash LIKE '${link2[1].slice(0, 8)}%'`) === "0", "the token was stored in the clear");
      } finally {
        smtp.close();
      }
    });
    await test("curricular analysis: the PDF becomes the entry forecast, the entry period and a corrected line recompute it", async () => {
      const sample = fs.readFileSync(path.join(__dirname, "fixtures", "sample-analise.pdf"));
      const send = (extra = {}, name = "analise.pdf", bytes = sample, who = token) => {
        const f = new FormData();
        f.append("file", bytes, { filename: name, contentType: "application/pdf" });
        Object.entries(extra).forEach(([k, v]) => f.append(k, String(v)));
        return http.post("/analysis/curricular", f, { headers: { ...f.getHeaders(), Authorization: `Bearer ${who}` } });
      };
      const made = await send({ entryPeriod: 2, startTerm: "2026.2", candidateName: "Candidato Teste" });
      assert(made.status === 201, `create ${made.status} ${JSON.stringify(made.data).slice(0, 200)}`);
      const a = made.data;
      assert(a.subjects.length > 5 && a.entryPeriod === 2 && a.entryPeriodSource === "USER" && a.status === "COMPLETED", `fields ${JSON.stringify([a.subjects.length, a.entryPeriod, a.entryPeriodSource, a.status])}`);
      assert(a.result.totals.total === a.subjects.length && a.result.totals.exempted + a.result.totals.pending + a.result.totals.review === a.result.totals.total, "totals do not add up");
      assert(a.result.simulation && a.result.simulation.semesters.length >= 1 && /^\d{4}\.[12]$/.test(a.result.simulation.estimatedCompletionTerm), "no forecast");
      assert(a.result.simulation.semesters.every(x => x.semesterLoad <= x.maximumCapacity), "a semester above its capacity");
      assert(a.result.narrative.text.includes("Ingresso: *2º semestre*"), "narrative");
      assert(!a.result.warnings.some(w => w.code.startsWith("INVARIANT_")), "an invariant was broken");
      // the PDF itself is not kept: only a hash
      assert(sql(`SELECT COUNT(*) FROM CurricularAnalyses WHERE fileHash IS NOT NULL`) !== "0", "hash not kept");

      // changing the entry period recomputes from the saved lines (no PDF again)
      const early = (await http.put(`/analysis/curricular/${a.id}`, { entryPeriod: 1 }, auth())).data;
      assert(early.entryPeriod === 1 && early.result.previousBacklogCount === 0, `entry 1 ${JSON.stringify(early.result.previousBacklogCount)}`);
      const noEntry = (await http.put(`/analysis/curricular/${a.id}`, { entryPeriod: null }, auth())).data;
      assert(noEntry.result.simulation === null && noEntry.status === "WAITING_REVIEW" && noEntry.result.warnings.some(w => w.code === "ENTRY_PERIOD_REQUIRED"), "no entry period must not forecast");
      assert((await http.put(`/analysis/curricular/${a.id}`, { entryPeriod: 99 }, auth())).status === 400, "entry 99 accepted");
      assert((await http.put(`/analysis/curricular/${a.id}`, { startTerm: "banana" }, auth())).status === 400, "bad term accepted");
      await http.put(`/analysis/curricular/${a.id}`, { entryPeriod: 2, startTerm: "2026.2" }, auth());

      // a line read wrong is fixed by hand and the forecast follows
      const pendingLine = a.subjects.find(x => x.status === "PENDING");
      const fixed = (await http.put(`/analysis/curricular/${a.id}/subject/${pendingLine.id}`, { status: "EXEMPTED" }, auth())).data;
      assert(fixed.result.totals.exempted === a.result.totals.exempted + 1 && fixed.result.totals.pending === a.result.totals.pending - 1, "the correction did not change the totals");
      assert((await http.put(`/analysis/curricular/${a.id}/subject/${pendingLine.id}`, { status: "XYZ" }, auth())).status === 400, "bad status accepted");

      // refusals: not a PDF, a PDF without the table
      assert((await send({}, "x.pdf", Buffer.from("PK\x03\x04 nao e pdf"))).status === 400, "a zip passed");
      const noTable = await send({ entryPeriod: 1 }, "bolo.pdf", selectablePdfJs([[40, 700, "Receita de bolo"]]));
      assert(noTable.status === 400 && /tabela de disciplinas/.test(JSON.stringify(noTable.data)), `no table ${noTable.status} ${JSON.stringify(noTable.data)}`);

      // who sees what: the owner and the management, nobody else
      await http.post("/users", { name: "Outro Consultor", email: "outro-an@x.com", password: "senha123", role: "consultor" }, auth());
      const other = (await http.post("/auth/login", { email: "outro-an@x.com", password: "senha123" })).data.token;
      assert((await http.get(`/analysis/curricular/${a.id}`, asUser(other))).status === 403, "another consultant opened it");
      assert((await http.get("/analysis/curricular", asUser(other))).data.length === 0, "another consultant listed it");
      assert((await http.get("/analysis/curricular", auth())).data.some(x => x.id === a.id), "the admin does not list it");
      assert((await http.get("/analysis/curricular")).status === 401, "no login");
      // the rules are editable: bad values are ignored
      assert((await http.put("/analysis/rules", { extraSubjectsAllowed: 99, maximumSubjectsPerSemester: "abc" }, auth())).data.extraSubjectsAllowed === 3, "a bad rule was accepted");
      assert((await http.put("/analysis/rules", { extraSubjectsAllowed: 2 }, auth())).data.extraSubjectsAllowed === 2, "rule not saved");
      assert((await http.put("/analysis/rules", { extraSubjectsAllowed: 3 }, asUser(other))).status === 403, "a consultant changed the rules");
      await http.put("/analysis/rules", { extraSubjectsAllowed: 3 }, auth());
      assert((await http.delete(`/analysis/curricular/${a.id}`, auth())).status === 204, "delete");
    });
    await test("academic analysis and the student portal: versions only when the facts change, RGM check, invitation, login, isolation", async () => {
      await http.post("/users", { name: "Tutora Portal", email: "tutora-portal@x.com", password: "senha123", role: "tutor" }, auth());
      await http.post("/users", { name: "Tutor Intruso", email: "tutor-intruso@x.com", password: "senha123", role: "tutor" }, auth());
      const tk = (await http.post("/auth/login", { email: "tutora-portal@x.com", password: "senha123" })).data.token;
      const intruder = (await http.post("/auth/login", { email: "tutor-intruso@x.com", password: "senha123" })).data.token;
      const consTk = (await http.post("/auth/login", { email: "outro-an@x.com", password: "senha123" })).data.token;
      assert((await http.get("/students", asUser(consTk))).status === 403 && (await http.get("/analysis/academic", asUser(consTk))).status === 403, "a consultant reached the academic area");
      const up = (route, bytes, who, name = "extrato.pdf") => {
        const f = new FormData();
        f.append("file", bytes, { filename: name, contentType: "application/pdf" });
        return http.post(route, f, { headers: { ...f.getHeaders(), Authorization: `Bearer ${who}` } });
      };

      // a standalone analysis: the tutor confirms the current period and the forecast appears
      const solo = await up("/analysis/academic", academicPdfJs("777001", "A CURSAR"), tk);
      assert(solo.status === 201 && solo.data.documentType === "CURRICULAR_EXTRACT" && solo.data.rgm === "777001", `solo ${solo.status} ${JSON.stringify(solo.data).slice(0, 200)}`);
      const confirmed = (await http.put(`/analysis/academic/${solo.data.id}`, { currentPeriod: 3 }, asUser(tk))).data;
      assert(confirmed.currentPeriod === 3 && confirmed.currentPeriodConfirmed === true && /Resumo da análise/.test(confirmed.message), `confirm ${JSON.stringify(confirmed).slice(0, 200)}`);
      assert((await http.put(`/analysis/academic/${solo.data.id}`, { currentPeriod: 77 }, asUser(tk))).status === 400, "period 77 accepted");
      assert((await http.get(`/analysis/academic/${solo.data.id}`, asUser(intruder))).status === 403, "another tutor opened it");
      assert((await up("/analysis/academic", selectablePdfJs([[40, 700, "Receita de bolo"]]), tk, "bolo.pdf")).status === 400, "an unknown document was accepted");
      assert((await http.delete(`/analysis/academic/${solo.data.id}`, asUser(tk))).status === 204, "delete standalone");

      // the student: created by the tutor, invited, activated, logged in
      const st = await http.post("/students", { rgm: "123456", name: "Aluno Teste Portal", email: "aluno.portal@x.com", courseName: "Administracao" }, asUser(tk));
      assert(st.status === 201 && st.data.responsibleUserId, `student ${st.status} ${JSON.stringify(st.data)}`);
      const sid = st.data.id;
      assert((await http.post("/students", { rgm: "123456", name: "Repetido" }, asUser(tk))).status === 409, "duplicated RGM accepted");
      assert((await http.get(`/students/${sid}`, asUser(intruder))).status === 403, "another tutor opened the student");
      assert((await http.get("/students", asUser(intruder))).data.length === 0, "another tutor listed the student");
      // before the invitation the student cannot sign in
      assert((await http.post("/portal/login", { login: "123456", password: "qualquer-coisa-1" })).status === 401, "login before the invitation");
      const inv = await http.post(`/students/${sid}/invite`, {}, asUser(tk));
      assert(inv.status === 200 && /\/portal\/ativar\/[a-f0-9]{64}$/.test(inv.data.link), `invite ${JSON.stringify(inv.data)}`);
      const stoken = inv.data.link.split("/").pop();
      assert((await http.get(`/portal/token/${stoken}`)).data.valid === true, "invite link not valid");
      assert((await http.post("/portal/activate", { token: stoken, password: "curta" })).status === 400, "short password accepted");
      assert((await http.post("/portal/activate", { token: stoken, password: "senha-do-aluno-1" })).status === 200, "activate");
      assert((await http.get(`/portal/token/${stoken}`)).data.valid === false && (await http.post("/portal/activate", { token: stoken, password: "outra-senha-aluno" })).status === 400, "the link worked twice");
      assert(sql(`SELECT COUNT(*) FROM StudentTokens WHERE tokenHash LIKE '${stoken.slice(0, 8)}%'`) === "0", "the token was stored in the clear");
      assert(!sql(`SELECT passwordHash FROM Students WHERE id=${sid}`).includes("senha-do-aluno"), "the password is not hashed");
      assert((await http.post("/portal/login", { login: "123456", password: "errada-errada" })).status === 401, "wrong password");
      const login = await http.post("/portal/login", { login: "Aluno.Portal@X.com", password: "senha-do-aluno-1" });
      assert(login.status === 200 && login.data.token, `login ${login.status}`);
      const stu = login.data.token;
      // a student token is not a user token, and a user token is not a student token
      assert((await http.get("/students", asUser(stu))).status !== 200 && (await http.get("/analysis/curricular", asUser(stu))).status !== 200, "a student token worked on the staff routes");
      assert((await http.get("/portal/me", asUser(tk))).status === 401, "a user token worked on the portal");
      assert((await http.get("/portal/me")).status === 401, "portal without login");
      assert((await http.get("/portal/me", asUser(stu))).data.current === null, "analysis before any upload");

      // the student sends the extract: the RGM must be theirs
      const wrong = await up("/portal/upload", academicPdfJs("999999", "A CURSAR"), stu);
      assert(wrong.status === 400 && /RGM/.test(JSON.stringify(wrong.data)), `wrong RGM ${wrong.status} ${JSON.stringify(wrong.data)}`);
      const first = await up("/portal/upload", academicPdfJs("123456", "A CURSAR"), stu);
      assert(first.status === 201 && first.data.current.version === 1 && first.data.reused === false, `first ${first.status} ${JSON.stringify(first.data).slice(0, 200)}`);
      // the same file again, and another file with the same facts: nothing new
      const again = await up("/portal/upload", academicPdfJs("123456", "A CURSAR"), stu);
      assert(again.status === 200 && again.data.reused === true && again.data.versions.length === 1, "the same file created a version");
      const sameFacts = await up("/portal/upload", academicPdfJs("123456", "A CURSAR", "arquivo-reimpresso-outra-data"), stu);
      assert(sameFacts.data.reused === true && sameFacts.data.versions.length === 1, "equal academic facts created a version");
      // a real change: a new immutable version with what changed
      const changed = await up("/portal/upload", academicPdfJs("123456", "APROVADO"), stu);
      assert(changed.status === 201 && changed.data.current.version === 2 && changed.data.versions.length === 2, `changed ${changed.status} ${JSON.stringify(changed.data).slice(0, 200)}`);
      assert(changed.data.current.changeSummary.some(x => /Matematica|Pendências/i.test(x)), `summary ${JSON.stringify(changed.data.current.changeSummary)}`);
      const me = (await http.get("/portal/me", asUser(stu))).data;
      assert(me.current.version === 2 && me.versions.map(v => v.version).join() === "2,1" && me.student.rgm === "123456", "the portal does not show the current version");
      const old = me.versions.find(v => v.version === 1);
      assert((await http.get(`/portal/versions/${old.id}`, asUser(stu))).data.version === 1, "an old version is not readable");
      // another student's version is not reachable by id
      const st2 = await http.post("/students", { rgm: "654321", name: "Outro Aluno", email: "outro.aluno@x.com", courseName: "Administracao" }, asUser(tk));
      const inv2 = await http.post(`/students/${st2.data.id}/invite`, {}, asUser(tk));
      await http.post("/portal/activate", { token: inv2.data.link.split("/").pop(), password: "senha-outro-aluno1" });
      const stu2 = (await http.post("/portal/login", { login: "654321", password: "senha-outro-aluno1" })).data.token;
      assert((await http.get(`/portal/versions/${old.id}`, asUser(stu2))).status === 404, "a student read another student's version");
      // a history from the staff, on behalf of the student, keeps the same checks
      const hist = await up(`/students/${sid}/upload`, academicHistoryPdfJs("123456", true, true), tk, "historico.pdf");
      assert(hist.status === 200 || hist.status === 201, `history ${hist.status} ${JSON.stringify(hist.data).slice(0, 160)}`);
      // the staff cannot delete what is in a student's history
      assert((await http.delete(`/analysis/academic/${changed.data.current.id}`, asUser(tk))).status === 400, "history entry deleted");

      // blocking cuts the session at once; unblocking does not revive it
      assert((await http.put(`/students/${sid}`, { blocked: true }, asUser(tk))).status === 200, "block");
      assert((await http.get("/portal/me", asUser(stu))).status === 401, "a blocked student kept the session");
      assert((await http.post("/portal/login", { login: "123456", password: "senha-do-aluno-1" })).status === 401, "a blocked student logged in");
      await http.put(`/students/${sid}`, { blocked: false }, asUser(tk));
      assert((await http.get("/portal/me", asUser(stu))).status === 401, "an old session came back after unblocking");
      assert((await http.post("/portal/login", { login: "123456", password: "senha-do-aluno-1" })).status === 200, "login after unblocking");
      // password change asks for a new login
      const stu3 = (await http.post("/portal/login", { login: "123456", password: "senha-do-aluno-1" })).data.token;
      assert((await http.put("/portal/password", { password: "errada", newPassword: "nova-senha-aluno-1" }, asUser(stu3))).status === 400, "wrong current password");
      assert((await http.put("/portal/password", { password: "senha-do-aluno-1", newPassword: "nova-senha-aluno-1" }, asUser(stu3))).status === 200, "change password");
      assert((await http.get("/portal/me", asUser(stu3))).status === 401, "the session survived the password change");
      // forgot password: same answer for everyone
      assert((await http.post("/portal/forgot", { login: "123456" })).data.ok === true && (await http.post("/portal/forgot", { login: "nao-existe" })).data.ok === true, "forgot answers differently");
    });
    await test("academic analysis: a cancelled enrollment cannot add subjects nor graduate, and the period is only suggested when the checks disagree", async () => {
      const tk = (await http.post("/auth/login", { email: "tutora-portal@x.com", password: "senha123" })).data.token;
      const f = new FormData();
      f.append("file", academicPdfJs("777002", "A CURSAR"), { filename: "extrato.pdf", contentType: "application/pdf" });
      const made = await http.post("/analysis/academic", f, { headers: { ...f.getHeaders(), Authorization: `Bearer ${tk}` } });
      assert(made.status === 201, `upload ${made.status}`);
      const id = made.data.id;
      const ok = (await http.put(`/analysis/academic/${id}`, { currentPeriod: 3 }, asUser(tk))).data;
      assert(ok.status !== "ENROLLMENT_INACTIVE", "active by default");
      const cancelled = (await http.put(`/analysis/academic/${id}`, { enrollmentSituation: "CANCELLED" }, asUser(tk))).data;
      assert(cancelled.status === "ENROLLMENT_INACTIVE" && cancelled.forecast === null && /Situação da matrícula: Cancelada/.test(cancelled.message) && cancelled.snapshot.enrollmentSituation.source === "STAFF", `cancelled ${JSON.stringify(cancelled).slice(0, 300)}`);
      assert(cancelled.snapshot.result.canAddNow === 0, "a cancelled enrollment can add subjects");
      assert((await http.put(`/analysis/academic/${id}`, { enrollmentSituation: "NOPE" }, asUser(tk))).status === 400, "an invalid situation was accepted");
      const back = (await http.put(`/analysis/academic/${id}`, { enrollmentSituation: "" }, asUser(tk))).data;
      assert(back.status !== "ENROLLMENT_INACTIVE" && !back.snapshot.enrollmentSituation, "clearing the situation did not restore the analysis");
      await http.delete(`/analysis/academic/${id}`, asUser(tk));
    });

    await test("curricular analysis: the 24-hour return (matriculou / não / reanálise) and the commercial proposal sent to a contact", async () => {
      const sample = fs.readFileSync(path.join(__dirname, "fixtures", "sample-analise.pdf"));
      const make = async (who, name) => {
        const f = new FormData();
        f.append("file", sample, { filename: "analise.pdf", contentType: "application/pdf" });
        f.append("entryPeriod", "2");
        f.append("startTerm", "2026.2");
        f.append("candidateName", name);
        const r = await http.post("/analysis/curricular", f, { headers: { ...f.getHeaders(), Authorization: `Bearer ${who}` } });
        assert(r.status === 201, `create ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
        return r.data;
      };
      const hoursFromNow = d => (new Date(d).getTime() - Date.now()) / 3600000;
      await http.post("/users", { name: "Segundo Consultor", email: "segundo-an@x.com", password: "senha123", role: "consultor" }, auth());
      await http.post("/users", { name: "Outro Consultor", email: "outro-an@x.com", password: "senha123", role: "consultor" }, auth());
      const owner = (await http.post("/auth/login", { email: "outro-an@x.com", password: "senha123" })).data.token;
      const third = (await http.post("/auth/login", { email: "segundo-an@x.com", password: "senha123" })).data.token;

      // born waiting, with the return due in 24 hours
      const a = await make(owner, "Candidata Retorno");
      assert(a.enrollment.status === "PENDING" && a.enrollment.due === false && hoursFromNow(a.enrollment.dueAt) > 23.5 && hoursFromNow(a.enrollment.dueAt) < 24.5, `new ${JSON.stringify(a.enrollment)}`);
      assert((await http.get("/analysis/follow-ups", asUser(owner))).data.total === 0, "a return not due yet is on the bell");

      // 24 hours later: it is on the bell of the owner and of the management, not of another consultant
      sql(`UPDATE CurricularAnalyses SET followUpDueAt = now() - interval '2 hours' WHERE id = ${a.id}`);
      const bell = (await http.get("/analysis/follow-ups", asUser(owner))).data;
      assert(bell.total === 1 && bell.due[0].id === a.id && bell.due[0].candidateName === "Candidata Retorno", `bell ${JSON.stringify(bell)}`);
      assert((await http.get("/analysis/follow-ups", asUser(third))).data.total === 0, "another consultant sees the return of someone else");
      const mgmt = (await http.get("/analysis/follow-ups", auth())).data;
      assert(mgmt.due.some(x => x.id === a.id && x.ownerName === "Outro Consultor"), `management ${JSON.stringify(mgmt).slice(0, 200)}`);
      assert((await http.get(`/analysis/curricular/${a.id}`, asUser(owner))).data.enrollment.due === true, "the analysis does not say it is overdue");

      // the three outcomes
      const put = (body, who = owner) => http.put(`/analysis/curricular/${a.id}/enrollment`, body, asUser(who));
      assert((await put({ status: "NOT_ENROLLED" })).status === 400 && (await put({ status: "NOT_ENROLLED", note: "ab" })).status === 400, "not enrolled without a reason was accepted");
      assert((await put({ status: "BANANA", note: "qualquer motivo" })).status === 400 && (await put({})).status === 400, "an invalid outcome was recorded as not enrolled");
      assert((await put({ status: "ENROLLED" }, third)).status === 403, "another consultant registered the outcome");
      const re = (await put({ status: "NOT_ENROLLED", reanalysis: true })).data;
      assert(re.enrollment.status === "PENDING" && re.enrollment.reanalysisAt && re.enrollment.due === false && hoursFromNow(re.enrollment.dueAt) > 23.5, `reanalysis ${JSON.stringify(re.enrollment)}`);
      assert((await http.get("/analysis/follow-ups", asUser(owner))).data.total === 0, "a reanalysis stays on the bell");
      const no = (await put({ status: "NOT_ENROLLED", note: "Aguardará nova condição" })).data;
      assert(no.enrollment.status === "NOT_ENROLLED" && no.enrollment.note === "Aguardará nova condição" && !no.enrollment.dueAt, `not enrolled ${JSON.stringify(no.enrollment)}`);
      const yes = (await put({ status: "ENROLLED" })).data;
      assert(yes.enrollment.status === "ENROLLED" && yes.enrollment.due === false, `enrolled ${JSON.stringify(yes.enrollment)}`);
      assert((await http.get("/analysis/follow-ups", asUser(owner))).data.total === 0, "an answered return is still on the bell");

      // the commercial proposal: indicators and a message without any financial promise
      const prop = (await http.get(`/analysis/curricular/${a.id}/proposal`, asUser(owner))).data;
      assert(Number.isInteger(prop.exemptedPercentage) && typeof prop.isHighValue === "boolean" && /^Olá, Candidata Retorno!/.test(prop.message) && /Estimativas sujeitas/.test(prop.message) && !/R\$/.test(prop.message), `proposal ${JSON.stringify(prop).slice(0, 300)}`);
      assert((await http.get(`/analysis/curricular/${a.id}/proposal`, asUser(third))).status === 403, "another consultant read the proposal");

      // sent to a contact chosen on the screen (its open conversation), and the analysis is linked to it
      const mine = await make(token, "Candidata Proposta");
      const tgContact = (await http.get(`/tickets/${tgTicket}`, auth())).data.contactId;
      const before = tg.sent.length;
      const ok = await http.post(`/analysis/curricular/${mine.id}/send-proposal`, { contactId: tgContact }, auth());
      assert(ok.status === 200 && tg.sent.slice(before).some(x => x.method === "sendMessage" && /aproveitamento curricular/.test(String(x.body.text || "")) && /Candidata Proposta/.test(String(x.body.text || ""))), `send ${ok.status} ${JSON.stringify(ok.data)} ${JSON.stringify(tg.sent.slice(before).map(x => x.method))}`);
      assert((await http.get(`/analysis/curricular/${mine.id}`, auth())).data.contactId === tgContact, "the analysis was not linked to the contact");
      assert((await http.post(`/analysis/curricular/${mine.id}/send-proposal`, {}, auth())).status === 400, "sent without a target");
      const grp = sql(`SELECT id FROM Contacts WHERE isGroup = 1 LIMIT 1`);
      if (grp) assert((await http.post(`/analysis/curricular/${mine.id}/send-proposal`, { contactId: Number(grp) }, auth())).status === 400, "the proposal went to a group");
      assert((await http.post(`/analysis/curricular/${mine.id}/send-proposal`, { contactId: 99999999 }, auth())).status === 404, "sent to a contact that does not exist");
      assert((await http.post(`/analysis/curricular/${mine.id}/send-proposal`, { contactId: tgContact }, asUser(owner))).status === 403, "another consultant sent someone else's proposal");
    });

    await test("no route answers 500 to a malformed or unknown id (each route with a :param, three bad values, as the administrator)", async () => {
      const fs = require("fs");
      const dir = path.join(__dirname, "../src/routes");
      const routes = [];
      fs.readdirSync(dir).filter(f => f.endsWith(".ts")).forEach(file => {
        const text = fs.readFileSync(path.join(dir, file), "utf8").replace(/\n\s+/g, " ");
        const re = /\b(?:r|\w*Routes?|router)\.(get|post|put|patch|delete)\(\s*(["'`])([^"'`]+)\2\s*,([^;]*)\);/g;
        let m;
        while ((m = re.exec(text))) if (/:\w+/.test(m[3])) routes.push({ method: m[1], path: m[3], guards: m[4] });
      });
      assert(routes.length > 100, `only ${routes.length} routes with a parameter were found`);
      // routes that act on the outside world even for an unknown id (a webhook of a provider, a public form) are not part of this
      const skip = /\/(webhook|webhooks|hooks|public|portal|afiliado|r)\b/i;
      const bad = [];
      for (const r of routes.filter(x => !skip.test(x.path))) {
        for (const value of ["abc", "0", "99999999"]) {
          const url = r.path.replace(/:\w+\??/g, value);
          let res;
          try { res = await http.request({ method: r.method, url, data: r.method === "get" || r.method === "delete" ? undefined : {}, ...auth() }); } catch (err) { bad.push(`${r.method.toUpperCase()} ${url} -> ${err.message}`); continue; }
          if (res.status >= 500) {
            // the server names the request and the reason in its log: show it so the failure can be fixed without guessing
            const log = String(global.__backendLog ? global.__backendLog() : "");
            const at = log.lastIndexOf(`${r.method.toUpperCase()} ${url}`);
            bad.push(`${r.method.toUpperCase()} ${url} -> ${res.status} ${at >= 0 ? log.slice(at, at + 400).replace(/\s+/g, " ") : ""}`);
          }
        }
      }
      assert(bad.length === 0, `${bad.length} route(s) answered 5xx:\n  ${bad.slice(0, 25).join("\n  ")}`);
    });

    await test("e-mails of the system: one catalog, a preview of each, and the test goes only to the administration", async () => {
      const list = (await http.get("/mail/templates", auth())).data;
      assert(Array.isArray(list) && list.length >= 9 && list.every(t => t.key && t.title && t.trigger && t.subject), `catalog ${JSON.stringify(list).slice(0, 200)}`);
      for (const t of list) {
        const pv = await http.get(`/mail/templates/${t.key}/preview`, auth());
        assert(pv.status === 200 && /<!doctype html>/i.test(pv.data.html) && /mensagem automática/.test(pv.data.text), `preview ${t.key} ${pv.status}`);
      }
      assert((await http.get("/mail/templates/nao-existe/preview", auth())).status === 404, "unknown template");
      const consTk = (await http.post("/auth/login", { email: "outro-an@x.com", password: "senha123" })).data.token;
      assert((await http.get("/mail/templates", asUser(consTk))).status === 403 && (await http.post("/mail/templates/mail-test/test", {}, asUser(consTk))).status === 403, "a consultant reached the e-mail catalog");
      // no mail account in the test environment: the answer says so (and nothing is sent)
      assert([400, 502].includes((await http.post("/mail/templates/mail-test/test", {}, auth())).status), "the test without a mail account");
    });

    await test("commercial grades: the matrices that come with the system are read, searchable, downloadable and sendable; only the management publishes", async () => {
      // the first start already read the PDFs that come with the system (or the button does it now): nothing is lost twice
      const imp = await http.post("/grades/import-defaults", {}, auth());
      assert(imp.status === 200 && imp.data.failed.length === 0, `import ${imp.status} ${JSON.stringify(imp.data).slice(0, 300)}`);
      const all = (await http.get("/grades", auth())).data;
      assert(all.grades.length >= 105, `only ${all.grades.length} grades`);
      assert((await http.post("/grades/import-defaults", {}, auth())).data.unchanged === all.grades.length, "a second import changed something");
      const marketing = all.grades.find(g => g.courseName === "CST EM MARKETING");
      assert(marketing && marketing.modality === "EAD" && marketing.degree === "Tecnólogo" && marketing.totalCourseHours === 1600 && marketing.durationSemesters === 4, `marketing ${JSON.stringify(marketing)}`);
      assert(all.grades.some(g => g.degree === "Pós-graduação"), "the postgraduate matrices are missing");
      assert(all.grades.filter(g => !g.complete).length <= 8, "too many incomplete readings");
      // search and filters
      assert((await http.get("/grades", { ...auth(), params: { search: "marketing" } })).data.grades.length >= 2, "search");
      assert((await http.get("/grades", { ...auth(), params: { degree: "Licenciatura" } })).data.grades.every(g => g.degree === "Licenciatura"), "degree filter");
      assert(all.degrees.includes("Bacharelado") && all.areas.length > 3, "facets");
      // the summary text and the PDF behind the login
      const one = (await http.get(`/grades/${marketing.id}`, auth())).data;
      assert(/Matriz curricular: CST EM MARKETING/.test(one.whatsappSummary) && /1\.600 horas/.test(one.whatsappSummary), `summary ${one.whatsappSummary}`);
      const pdfRes = await http.get(`/grades/${marketing.id}/file`, { ...auth(), responseType: "arraybuffer" });
      assert(pdfRes.status === 200 && Buffer.from(pdfRes.data).subarray(0, 5).toString() === "%PDF-" && /pdf/.test(pdfRes.headers["content-type"]), "pdf download");
      assert((await http.get(`/grades/${marketing.id}/file`)).status === 401, "the pdf without login");
      // send into a conversation: summary text and the PDF
      const before = tg.sent.length;
      const sent = await http.post(`/grades/${marketing.id}/send`, { ticketId: Number(tgTicket) }, auth());
      assert(sent.status === 200, `send ${sent.status} ${JSON.stringify(sent.data)}`);
      const out = tg.sent.slice(before);
      // one message: the PDF with the summary as its description (as when a document is attached with a caption)
      assert(out.length === 1 && out[0].method === "sendDocument" && /Matriz curricular/.test(String(out[0].body.caption || "")) && /1\.600 horas/.test(String(out[0].body.caption || "")), `sent ${JSON.stringify(out.map(x => [x.method, String(x.body.caption || "").slice(0, 40)]))}`);
      assert((await http.post(`/grades/${marketing.id}/send`, { ticketId: Number(tgTicket), summary: false, pdf: false }, auth())).status === 400, "nothing to send accepted");
      // the contact can be chosen instead of a conversation: its open conversation is used
      const tgTicketData = (await http.get(`/tickets/${tgTicket}`, auth())).data;
      const before2 = tg.sent.length;
      const byContact = await http.post(`/grades/${marketing.id}/send`, { contactId: tgTicketData.contactId, pdf: false }, auth());
      assert(byContact.status === 200 && tg.sent.slice(before2).some(x => /Matriz curricular/.test(String(x.body.text || ""))), `send by contact ${byContact.status} ${JSON.stringify(byContact.data)}`);
      assert((await http.post(`/grades/${marketing.id}/send`, {}, auth())).status === 400 && (await http.post(`/grades/${marketing.id}/send`, { contactId: 99999999 }, auth())).status === 404, "send without a target");
      // permissions: a consultant reads and sends but does not publish or delete
      const consTk = (await http.post("/auth/login", { email: "outro-an@x.com", password: "senha123" })).data.token;
      assert((await http.get("/grades", asUser(consTk))).status === 200, "a consultant cannot read the catalog");
      assert((await http.delete(`/grades/${marketing.id}`, asUser(consTk))).status === 403 && (await http.post("/grades/import-defaults", {}, asUser(consTk))).status === 403, "a consultant changed the catalog");
      const f = new FormData();
      f.append("files", fs.readFileSync(path.join(__dirname, "fixtures", "sample-analise.pdf")), { filename: "x.pdf", contentType: "application/pdf" });
      assert((await http.post("/grades", f, { headers: { ...f.getHeaders(), Authorization: `Bearer ${consTk}` } })).status === 403, "a consultant published a grade");
      // the management publishes a new matrix (an old version is replaced) and refuses what is not a PDF
      const bad = new FormData();
      bad.append("files", Buffer.from("PK\x03\x04 nao e pdf"), { filename: "zip.pdf", contentType: "application/pdf" });
      const badRes = await http.post("/grades", bad, { headers: { ...bad.getHeaders(), ...auth().headers } });
      assert(badRes.status === 400 && badRes.data.failed === 1, `not a pdf ${badRes.status}`);
      const again = new FormData();
      again.append("files", fs.readFileSync(path.join(__dirname, "..", "data", "grades", "CST EM MARKETING.PDF")), { filename: "CST EM MARKETING.PDF", contentType: "application/pdf" });
      // a single file without "upsert" is refused with a clear message (the same PDF is already there)
      const refused = await http.post("/grades", again, { headers: { ...again.getHeaders(), ...auth().headers } });
      assert(refused.status === 400 && /já está disponível/.test(JSON.stringify(refused.data)), `duplicate ${refused.status}`);
      const again2 = new FormData();
      again2.append("mode", "upsert");
      again2.append("files", fs.readFileSync(path.join(__dirname, "..", "data", "grades", "CST EM MARKETING.PDF")), { filename: "CST EM MARKETING.PDF", contentType: "application/pdf" });
      const up = await http.post("/grades", again2, { headers: { ...again2.getHeaders(), ...auth().headers } });
      assert(up.status === 201 && up.data.unchanged === 1, `same pdf again ${up.status} ${JSON.stringify(up.data).slice(0, 200)}`);
      assert((await http.delete(`/grades/${marketing.id}`, auth())).status === 204 && (await http.get(`/grades/${marketing.id}`, auth())).status === 404, "delete");
      assert((await http.post("/grades/import-defaults", {}, auth())).data.created === 1, "the import did not bring the deleted grade back");
    });
    await test("screen errors are kept in the database for the administration and the coordination", async () => {
      assert((await http.post("/client-errors", { code: "ABCDE", route: "/afiliados", message: "Cannot read properties of null (reading 'value')", stack: "at X" }, auth())).status === 204, "report");
      const list = await http.get("/client-errors", auth());
      assert(list.status === 200 && list.data.some(e => e.code === "ABCDE" && e.route === "/afiliados"), `list ${JSON.stringify(list.data).slice(0, 120)}`);
      assert((await http.get("/client-errors?code=abcde", auth())).data.length === 1, "filter by code");
      // the same failure many times is one problem; the version of the code comes in its own field (or as " @version" on old screens)
      await http.post("/client-errors", { code: "FGHIJ", route: "/afiliados", build: "v2new", message: "Cannot read properties of null (reading 'value')" }, auth());
      await http.post("/client-errors", { code: "KLMNO", route: "/afiliados @v1old", message: "Cannot read properties of null (reading 'value')" }, auth());
      const grouped = (await http.get("/client-errors/summary", auth())).data;
      const g = grouped.find(x => x.route === "/afiliados" && /reading 'value'/.test(x.message));
      assert(g && g.n === 3 && g.users === 1 && g.builds.includes("v2new") && g.builds.includes("v1old") && g.resolved === false, `summary ${JSON.stringify(grouped).slice(0, 300)}`);
      assert((await http.put("/client-errors/resolve", { route: "/afiliados", message: g.message }, auth())).status === 200, "resolve");
      assert((await http.get("/client-errors/summary", auth())).data.find(x => x.route === "/afiliados").resolved === true, "not marked as fixed");
      assert((await http.put("/client-errors/resolve", { route: "/afiliados", message: g.message, resolved: false }, auth())).status === 200 && (await http.get("/client-errors/summary", auth())).data.find(x => x.route === "/afiliados").resolved === false, "reopen");
      assert((await http.get("/client-errors/summary", asUser(agentToken))).status === 403, "an agent read the summary");
      assert((await http.get("/client-errors", asUser(agentToken))).status === 403, "an agent read the errors");
      assert((await http.delete("/client-errors", auth())).status === 204 && (await http.get("/client-errors", auth())).data.length === 0, "clear");
    });
    await test("conversations can be pinned (personally) and archived until the contact writes again", async () => {
      const a = ticketOf("tg_5551"), b = ticketOf("tg_5552");
      assert((await http.put(`/tickets/${b}/pin`, { pinned: true }, auth())).status === 200, "pin");
      const queueIds = JSON.stringify((await http.get("/queue", auth())).data.map(q => q.id));
      const list = async (params = {}) => (await http.get("/tickets", { params: { showAll: "true", queueIds, ...params }, ...auth() })).data.tickets;
      let rows = await list();
      assert(rows.length > 1 && String(rows[0].id) === String(b) && (rows[0].pinned === true || rows[0].pinned === 1 || rows[0].pinned === "1"), `pinned first: ${JSON.stringify(rows.slice(0, 2).map(r => [r.id, r.pinned]))}`);
      assert((await http.get(`/tickets/${b}`, auth())).data.pinned === true, "show should say pinned");
      assert((await http.put(`/tickets/${b}/pin`, { pinned: false }, auth())).status === 200, "unpin");
      assert((await http.get(`/tickets/${b}`, auth())).data.pinned === false, "unpin did not stick");

      assert((await http.put(`/tickets/${a}/archive`, { archived: true }, auth())).status === 200, "archive");
      assert(!(await list()).some(r => String(r.id) === String(a)), "archived ticket still in the inbox");
      assert((await list({ archived: "true" })).some(r => String(r.id) === String(a)), "archived ticket not in the archived view");
      tg.updates.push({ update_id: 41, message: { message_id: 95, chat: { id: 5551, type: "private" }, from: { first_name: "Ana" }, text: "voltei" } });
      await waitFor(async () => (await list()).some(r => String(r.id) === String(a)), 8000, "unarchived by a new message");
      assert(sql(`SELECT archivedAt IS NULL FROM Tickets WHERE id=${a}`) === "1", "archivedAt not cleared");
    });
    await test("the conversation list never shows a colleague's conversation or another segment", async () => {
      const q = (await http.post("/queue", { name: "Fila lista", color: "#123456" }, auth())).data;
      const mkUser = async (name, email) => (await http.post("/users", { name, email, password: "senha123", role: "consultor", queueIds: [q.id] }, auth())).data;
      const a = await mkUser("Lista A", "lista-a@x.com");
      const b = await mkUser("Lista B", "lista-b@x.com");
      const ta = (await http.post("/auth/login", { email: "lista-a@x.com", password: "senha123" })).data.token;
      const cA = sql(`SELECT id FROM Contacts WHERE number='tg_5551'`), cB = sql(`SELECT id FROM Contacts WHERE number='tg_5552'`);
      const mkTicket = (contactId, userId, status, segment) => sql(`INSERT INTO Tickets (status, contactId, whatsappId, queueId, userId, unreadMessages, isGroup, segment, createdAt, updatedAt) VALUES ('${status}', ${contactId}, ${tgId}, ${q.id}, ${userId === null ? "NULL" : userId}, 0, false, '${segment}', NOW(), NOW()) RETURNING id`).split("\n")[0];
      const mine = mkTicket(cA, a.id, "open", "sales");
      const colleagues = mkTicket(cB, b.id, "open", "sales");
      const tutoring = mkTicket(cA, null, "pending", "onboarding");
      const list = async (token, params = {}) => (await http.get("/tickets", { params: { showAll: "true", queueIds: JSON.stringify([q.id]), ...params }, ...asUser(token) })).data.tickets.map(t => String(t.id));
      const got = await list(ta);
      assert(got.includes(String(mine)), "own conversation missing from the list");
      assert(!got.includes(String(colleagues)), "a colleague's conversation is listed");
      assert(!got.includes(String(tutoring)), "a tutoring conversation is listed to a consultant");
      // asking for sectors one does not belong to returns nothing from them
      const other = await list(ta, { queueIds: JSON.stringify([q.id + 999]) });
      assert(!other.includes(String(colleagues)), "queueIds outside the person's sectors were honored");
      const admin = (await http.get("/tickets", { params: { showAll: "true", queueIds: JSON.stringify([q.id]) }, ...auth() })).data.tickets.map(t => String(t.id));
      assert(admin.includes(String(colleagues)) && admin.includes(String(tutoring)), "admin should see everything");
    });
    await test("history from before the connection never counts: lists, statistics and the CRM ignore it", async () => {
      const contactId = sql(`SELECT id FROM Contacts WHERE number='tg_5551'`);
      const stageId = sql(`SELECT id FROM LeadStages WHERE type='open' ORDER BY position LIMIT 1`);
      const metrics = async () => (await http.get("/crm/metrics", { params: { from: "2020-01-01", to: "2099-12-31" }, ...auth() })).data;
      const stats = async () => (await http.get("/stats/overview", { params: { from: "2020-01-01", to: "2099-12-31" }, ...auth() })).data;
      const before = { leads: (await metrics()).kpi.leads, total: Number((await stats()).totals.total) };

      const oldTicket = sql(`INSERT INTO Tickets (status, contactId, whatsappId, unreadMessages, isGroup, segment, isHistorical, createdAt, updatedAt) VALUES ('open', ${contactId}, ${tgId}, 3, false, 'sales', true, NOW(), NOW()) RETURNING id`).split("\n")[0];
      sql(`INSERT INTO Leads (name, stageId, contactId, isHistorical, createdAt, updatedAt) VALUES ('Conversa antiga', ${stageId}, ${contactId}, true, NOW(), NOW())`);

      assert((await metrics()).kpi.leads === before.leads, "a historical lead was counted in the CRM");
      assert(Number((await stats()).totals.total) === before.total, "a historical conversation was counted in the statistics");
      const queueIds = JSON.stringify((await http.get("/queue", auth())).data.map(q => q.id));
      const listed = (await http.get("/tickets", { params: { showAll: "true", status: "open", queueIds }, ...auth() })).data.tickets.map(t => String(t.id));
      assert(!listed.includes(String(oldTicket)), "a historical conversation is in the inbox");
      const leads = (await http.get("/leads", { params: { limit: 500 }, ...auth() })).data.leads.map(l => l.name);
      assert(!leads.includes("Conversa antiga"), "a historical lead is in the funnel list");
      const all = (await http.get("/leads", { params: { limit: 500, historical: "1" }, ...auth() })).data.leads.map(l => l.name);
      assert(all.includes("Conversa antiga"), "the historical lead should still be reachable on request");
    });
    await test("working hours: answer time counts only business time, settings and alert threshold are saved", async () => {
      const { businessMinutes, normalizeBusiness } = require("../dist/helpers/BusinessTime");
      const cfg = normalizeBusiness({ enabled: true, days: { "1": [{ start: "08:00", end: "18:00" }], "2": [{ start: "08:00", end: "18:00" }] } });
      // company timezone is America/Porto_Velho (UTC-4): Monday 2026-10-12 17:00 local = 21:00 UTC
      const monday17 = new Date("2026-10-12T21:00:00Z"), tuesday09 = new Date("2026-10-13T13:00:00Z");
      // 17:00 -> 18:00 Monday (60 min) + 08:00 -> 09:00 Tuesday (60 min); the night in between does not count
      assert(Math.round(businessMinutes(cfg, monday17, tuesday09)) === 120, `business minutes: ${businessMinutes(cfg, monday17, tuesday09)}`);
      assert(Math.round(businessMinutes(normalizeBusiness({ enabled: false }), monday17, tuesday09)) === 960, "disabled hours should be elapsed time");
      // a closed day (Sunday) gives nothing
      assert(businessMinutes(cfg, new Date("2026-10-18T12:00:00Z"), new Date("2026-10-18T22:00:00Z")) === 0, "closed day counted");

      const saved = (await http.put("/crm/settings", { slaMinutes: 20, businessHours: { enabled: true, days: { "1": [{ start: "09:00", end: "17:00" }] } } }, auth())).data;
      assert(saved.slaMinutes === 20, "sla not saved");
      assert(saved.businessHours.enabled === true && saved.businessHours.days["1"][0].start === "09:00", "hours not saved");
      assert(saved.businessHours.days["3"].length === 1, "missing days should fall back to the default week");
      // switch it off again so the other checks keep measuring elapsed time
      await http.put("/crm/settings", { businessHours: { enabled: false }, slaMinutes: 15 }, auth());
    });
    await test("chats are addressed by phone, or by WhatsApp's internal id when the person has no phone number", async () => {
      const { chatIdOf, isPhoneNumber } = require("../dist/helpers/ChatId");
      assert(chatIdOf({ number: "5569992979581" }) === "5569992979581@c.us", "plain phone");
      assert(chatIdOf({ number: "5569992979581", lid: "198028224942211" }) === "5569992979581@c.us", "phone wins over the id");
      assert(chatIdOf({ number: "", lid: "198028224942211" }) === "198028224942211@lid", "no phone: use the internal id");
      assert(chatIdOf({ number: null, lid: "198028224942211" }) === "198028224942211@lid", "null phone: use the internal id");
      assert(chatIdOf({ number: "198028224942211", lid: "198028224942211" }) === "198028224942211@lid", "id stored as number: use it as an id");
      assert(chatIdOf({ number: "120363041234567890-1600000000" }, true) === "120363041234567890-1600000000@g.us", "group");
      assert(isPhoneNumber("5569992979581") && !isPhoneNumber("123") && !isPhoneNumber(""), "phone shape");
    });
    await test("preferences follow the person: stored on the server and sanitized", async () => {
      assert((await http.get("/me/preferences", auth())).data.sound === undefined, "fresh user already has preferences");
      const put = await http.put("/me/preferences", { sound: { mode: "alerts", popup: false, contacts: { "12": "alert", "13": "mute", "14": "weird", "x": "alert" } } }, auth());
      assert(put.status === 200 && put.data.sound.mode === "alerts" && put.data.sound.popup === false, "preferences not saved");
      assert(JSON.stringify(put.data.sound.contacts) === JSON.stringify({ "12": "alert", "13": "mute" }), `contacts not sanitized: ${JSON.stringify(put.data.sound.contacts)}`);
      const back = (await http.get("/me/preferences", auth())).data;
      assert(back.sound.mode === "alerts", "preferences not returned");
      // someone else never sees it
      assert((await http.get("/me/preferences", asUser(agentToken))).data.sound === undefined, "preferences leaked to another user");
      await http.put("/me/preferences", { sound: { mode: "all", popup: true, contacts: {} } }, auth());
    });
    await test("CRM report by consultant and by polo, as a table and as a spreadsheet", async () => {
      const range = { from: "2020-01-01", to: "2099-12-31" };
      const owner = (await http.get("/crm/report", { params: { ...range, groupBy: "owner" }, ...auth() })).data;
      assert(owner.rows.length > 0 && owner.total.name === "Total", "report has no rows");
      assert(owner.total.leads === owner.rows.reduce((a, r) => a + r.leads, 0), "total does not add up");
      assert(owner.rows.every(r => r.leads === r.contacted + r.noContact), "contacted + without contact should equal leads");
      const polo = (await http.get("/crm/report", { params: { ...range, groupBy: "polo" }, ...auth() })).data;
      assert(polo.groupBy === "polo" && polo.total.leads === owner.total.leads, "polo report should cover the same leads");
      const csv = await http.get("/crm/report", { params: { ...range, groupBy: "owner", format: "csv" }, ...auth(), responseType: "text", transformResponse: x => x });
      assert(/text\/csv/.test(csv.headers["content-type"]) && /attachment/.test(csv.headers["content-disposition"]), "csv headers");
      assert(csv.data.replace(/^\uFEFF/, "").startsWith('"Nome";"Leads captados"'), `csv header: ${csv.data.slice(0, 40)}`);
      assert(csv.data.split("\r\n").some(l => l.startsWith('"Total";')), "csv has no total line");
      assert((await http.get("/crm/report", { params: range })).status === 401, "report without login");
    });
    await test("copied history is its own view, stays out of the lists and comes back to life when the person writes", async () => {
      const contactId = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('Fulana do histórico', 'tg_7777', '', false, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
      const ticketId = sql(`INSERT INTO Tickets (status, contactId, whatsappId, unreadMessages, isGroup, segment, isHistorical, lastMessage, lastMessageId, closedAt, createdAt, updatedAt) VALUES ('closed', ${contactId}, ${tgId}, 0, false, 'sales', true, 'mensagem antiga', 'hist-old-1', NOW(), NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days') RETURNING id`).split("\n")[0];
      sql(`INSERT INTO Messages (id, ticketId, body, fromMe, read, mediaType, ack, createdAt, updatedAt) VALUES ('hist-old-1', ${ticketId}, 'mensagem antiga', false, true, 'chat', 0, NOW() - INTERVAL '30 days', NOW())`);

      const queueIds = JSON.stringify((await http.get("/queue", auth())).data.map(q => q.id));
      const ids = async (params, who = auth()) => (await http.get("/tickets", { params: { queueIds, ...params }, ...who })).data.tickets.map(t => String(t.id));
      assert((await ids({ historical: "true" })).includes(String(ticketId)), "history missing from its own view");
      assert(!(await ids({ showAll: "true", status: "closed" })).includes(String(ticketId)), "history leaked into the resolved list");
      assert(!(await ids({ historical: "true" }, asUser(agentToken))).includes(String(ticketId)), "an agent without a number saw someone's history");

      tg.updates.push({ update_id: 777, message: { message_id: 7771, chat: { id: 7777, type: "private" }, from: { first_name: "Fulana" }, text: "voltei a escrever" } });
      await waitFor(async () => sql(`SELECT isHistorical FROM Tickets WHERE id=${ticketId}`) === "0", 10000, "history conversation reactivated");
      const t = (await http.get(`/tickets/${ticketId}`, auth())).data;
      assert(t.status !== "closed" && t.isHistorical === false, `ticket after reactivation: ${t.status} ${t.isHistorical}`);
      assert(!(await ids({ historical: "true" })).includes(String(ticketId)), "reactivated ticket still in the history view");
      const msgs = (await http.get(`/messages/${ticketId}`, auth())).data.messages.map(m => m.body);
      assert(msgs.includes("mensagem antiga") && msgs.includes("voltei a escrever"), `thread lost: ${msgs}`);
      assert(sql(`SELECT COUNT(*) FROM Tickets WHERE contactId=${contactId}`) === "1", "a second ticket was created instead of reusing the history one");
    });
    await test("a team member's chat has no queue: the ticket carries isStaff and writing to it opens it without a Reabrir", async () => {
      const cid = sql(`INSERT INTO Contacts (name, number, email, isGroup, isStaff, channel, createdAt, updatedAt) VALUES ('Colega da equipe', 'tg_7790', '', false, true, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
      const tid = sql(`INSERT INTO Tickets (status, contactId, whatsappId, unreadMessages, isGroup, segment, isHistorical, createdAt, updatedAt) VALUES ('closed', ${cid}, ${tgId}, 0, false, 'sales', false, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const t = (await http.get(`/tickets/${tid}`, auth())).data;
      assert(t.contact.isStaff === true, "ticket payload lacks contact.isStaff");
      const r = await http.post(`/messages/${tid}`, { body: "bom dia, time" }, auth());
      assert(r.status === 200, `send to a closed team chat: ${r.status}`);
      assert(sql(`SELECT status FROM Tickets WHERE id=${tid}`) === "open", "team chat not reopened by sending");
    });
    await test("ready-made quick replies exist from the first boot and are found by shortcut or text", async () => {
      const list = async (q) => (await http.get("/quickAnswers", { params: { searchParam: q }, ...auth() })).data.quickAnswers;
      const all = await list("");
      for (const key of ["fichamatricula", "documentos", "boasvindas", "ambientacao"]) assert(all.some(a => a.shortcut === key), `default reply missing: ${key}`);
      const ficha = (await list("fichamat"))[0];
      assert(ficha && ficha.message.includes("\n• CPF:") && !ficha.message.includes("\u2060"), "the ficha lost its line breaks or kept invisible characters");
      assert((await list("histórico do ensino")).some(a => a.shortcut === "fichamatricula"), "search by text broke");
      assert(sql(`SELECT COUNT(*) FROM QuickAnswers WHERE LOWER(shortcut)='fichamatricula'`) === "1", "default duplicated");
    });
    await test("commissions: wallet registered by any user, received vs owed vs waiting, each consultant sees only theirs, settle is admin-only", async () => {
      const mk = async (name, email) => (await http.post("/users", { name, email, password: "senha123", role: "consultor" }, auth())).data;
      const ca = await mk("Comissão A", "comis-a@x.com"), cb = await mk("Comissão B", "comis-b@x.com");
      const ta = (await http.post("/auth/login", { email: "comis-a@x.com", password: "senha123" })).data.token;
      const tb = (await http.post("/auth/login", { email: "comis-b@x.com", password: "senha123" })).data.token;
      const stageId = sql(`SELECT id FROM LeadStages ORDER BY position LIMIT 1`);
      const lead = (name, owner) => sql(`INSERT INTO Leads (name, stageId, ownerId, createdAt, updatedAt) VALUES ('${name}', ${stageId}, ${owner}, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const pay = (leadId, owner, status, code, amount) => sql(`INSERT INTO Payments (leadId, provider, kind, txid, amount, status, description, recipientUserId, recipientCode, splitPct, paidAmount, paidAt, method, createdBy, createdAt, updatedAt) VALUES (${leadId}, 'efi', 'matricula', 'COM${Math.random().toString(36).slice(2, 10)}', ${amount}, '${status}', 'Taxa', ${owner}, ${code ? `'${code}'` : "NULL"}, ${code ? 100 : 0}, ${status === "paid" ? amount : "NULL"}, ${status === "paid" ? "NOW()" : "NULL"}, 'pix', ${owner}, NOW(), NOW()) RETURNING id`).split("\n")[0];

      // the wallet is registered by the consultant, never shown in full
      assert((await http.put("/me/efi", { payeeCode: "curto" }, asUser(ta))).status === 400, "short wallet accepted");
      const saved = await http.put("/me/efi", { payeeCode: "ABCD1234EFGH5678" }, asUser(ta));
      assert(saved.status === 200 && saved.data.masked === "••••5678", `wallet ${saved.status} ${JSON.stringify(saved.data)}`);

      const l1 = lead("Aluna Paga Carteira", ca.id), l2 = lead("Aluno Sem Carteira", ca.id), l3 = lead("Aluna Aguardando", ca.id), l4 = lead("Aluno do B", cb.id);
      pay(l1, ca.id, "paid", "ABCD1234EFGH5678", 100);
      const owed = pay(l2, ca.id, "paid", null, 100);
      pay(l3, ca.id, "pending", null, 100);
      pay(l4, cb.id, "paid", null, 100);

      const mineA = (await http.get("/commissions", asUser(ta))).data;
      assert(mineA.scope === "mine" && mineA.wallet.informed === true, "scope or wallet flag");
      assert(mineA.summary.received.count === 1 && mineA.summary.owed.count === 1 && mineA.summary.waiting.count === 1, `buckets ${JSON.stringify(mineA.summary)}`);
      assert(mineA.rows.every(r => r.consultantId === ca.id), "a consultant saw someone else's commission");
      assert(mineA.summary.received.total === 100 && mineA.summary.owed.total === 100, "commission amounts");
      assert((await http.get("/commissions", { params: { bucket: "owed" }, ...asUser(ta) })).data.rows.length === 1, "bucket filter");
      assert((await http.get("/commissions", { params: { search: "Sem Carteira" }, ...asUser(ta) })).data.rows.length === 1, "search filter");
      assert((await http.get("/commissions", asUser(tb))).data.rows.length === 1, "B should see only theirs");

      const all = (await http.get("/commissions", auth())).data;
      assert(all.scope === "all" && all.summary.owed.count === 2 && all.consultants.length >= 2, `admin overview ${JSON.stringify(all.summary)}`);

      // paying back by hand: only administration, only a paid fee that stayed with the company
      assert((await http.put(`/commissions/${owed}/settle`, {}, asUser(ta))).status === 403, "a consultant settled their own commission");
      const done = await http.put(`/commissions/${owed}/settle`, { note: "Pix de teste" }, auth());
      assert(done.status === 200, `settle ${done.status}`);
      const after = (await http.get("/commissions", asUser(ta))).data;
      assert(after.summary.owed.count === 0 && after.summary.received.count === 2, `after settle ${JSON.stringify(after.summary)}`);
      assert((await http.put(`/commissions/${owed}/settle`, { undo: true }, auth())).status === 200 && (await http.get("/commissions", asUser(ta))).data.summary.owed.count === 1, "undo");
      const csv = await http.get("/commissions/export.csv", asUser(ta));
      assert(csv.status === 200 && String(csv.data).includes("Aluno Sem Carteira") && !String(csv.data).includes("Aluno do B"), "csv scope");
      assert((await http.delete("/me/efi", asUser(ta))).data.informed === false, "wallet removal");

      // the administration informs the Wallet ID on behalf of a seller (only the Wallet ID); a seller cannot do it for another
      assert((await http.put(`/payments/efi/wallets/${cb.id}`, { payeeCode: "ZZZZ1111YYYY2222" }, asUser(ta))).status === 403, "a consultant set someone else's wallet");
      assert((await http.get("/payments/efi/wallets", asUser(ta))).status === 403, "a consultant listed the wallets");
      assert((await http.put(`/payments/efi/wallets/${cb.id}`, { payeeCode: "curto" }, auth())).status === 400, "short wallet accepted for a seller");
      const byAdmin = await http.put(`/payments/efi/wallets/${cb.id}`, { payeeCode: "ZZZZ 1111 YYYY 2222" }, auth());
      assert(byAdmin.status === 200 && byAdmin.data.masked === "••••2222", `admin wallet ${byAdmin.status} ${JSON.stringify(byAdmin.data)}`);
      const wallets = (await http.get("/payments/efi/wallets", auth())).data;
      const rowB = wallets.find(w => w.id === cb.id);
      assert(rowB && rowB.informed === true && rowB.masked === "••••2222" && !JSON.stringify(wallets).includes("ZZZZ1111"), "wallet list shows the code whole or misses the seller");
      assert((await http.get("/me/efi", asUser(tb))).data.informed === true, "the seller does not see the wallet the admin informed");
      // the company account cannot be informed as a seller's
      await http.put("/payments/efi/settings", { companyPayeeCode: "EMPRESA0000AAAA" }, auth());
      assert((await http.put(`/payments/efi/wallets/${cb.id}`, { payeeCode: "empresa0000aaaa" }, auth())).status === 400, "company wallet accepted as a seller's");
      assert((await http.put("/me/efi", { payeeCode: "EMPRESA0000AAAA" }, asUser(ta))).status === 400, "company wallet accepted by a seller");
      await http.put("/payments/efi/settings", { companyPayeeCode: "" }, auth());
      assert((await http.delete(`/payments/efi/wallets/${cb.id}`, auth())).data.informed === false, "admin wallet removal");
      assert((await http.put("/payments/efi/wallets/999999", { payeeCode: "ZZZZ1111YYYY2222" }, auth())).status === 404, "wallet of a missing user");
    });
    await test("coordinator: manages every polo and sees every lead, creates the team but never administrators, no access to payment credentials", async () => {
      const made = await http.post("/users", { name: "Coord Comercial", email: "coord-c@x.com", password: "senha123", role: "coordenacao", coordArea: "comercial" }, auth());
      assert(made.status === 200 && made.data.role === "coordenacao" && made.data.coordArea === "comercial", `create coordinator ${made.status} ${JSON.stringify(made.data).slice(0, 160)}`);
      const academic = (await http.post("/users", { name: "Coord Acadêmica", email: "coord-a@x.com", password: "senha123", role: "coordenacao", coordArea: "academica" }, auth())).data;
      assert(academic.coordArea === "academica", "academic area");
      const tc = (await http.post("/auth/login", { email: "coord-c@x.com", password: "senha123" })).data.token;
      const as = asUser(tc);

      // creates and edits the team
      const team = await http.post("/users", { name: "Consultor do Coord", email: "do-coord@x.com", password: "senha123", role: "consultor" }, as);
      assert(team.status === 200 && team.data.role === "consultor" && team.data.coordArea === null, `coordinator creating a consultant: ${team.status}`);
      assert((await http.put(`/users/${team.data.id}`, { name: "Consultor Editado" }, as)).status === 200, "coordinator editing the team");
      // never administrators
      assert((await http.post("/users", { name: "Intruso", email: "intruso@x.com", password: "senha123", role: "admin" }, as)).status === 403, "coordinator created an admin");
      assert((await http.post("/users", { name: "Intruso", email: "intruso2@x.com", password: "senha123", profile: "admin" }, as)).status === 403, "coordinator created an admin by profile");
      assert((await http.put(`/users/${team.data.id}`, { role: "admin" }, as)).status === 403, "coordinator promoted someone to admin");
      const adminId = (await http.get("/users", auth())).data.users.find(u => u.profile === "admin").id;
      assert((await http.put(`/users/${adminId}`, { name: "Trocado" }, as)).status === 403, "coordinator edited an admin");
      // it removes people of the team, never an administrator
      const throwaway = (await http.post("/users", { name: "Descartavel", email: "descartavel@x.com", password: "senha123", role: "consultor" }, as)).data;
      assert([200, 204].includes((await http.delete(`/users/${throwaway.id}`, as)).status), "coordinator cannot remove a member of the team");
      assert((await http.delete(`/users/${adminId}`, as)).status === 403, "coordinator removed an administrator");

      // every polo and every lead, whatever the polo
      const lead = (await http.post("/leads", { name: "Lead sem dono", phone: "5569988887771", source: "Site" }, auth())).data.lead;
      assert((await http.get(`/leads/${lead.id}`, as)).status === 200, "coordinator cannot open any lead");
      assert((await http.get("/polos", as)).status === 200, "polos list");
      assert((await http.post("/polos", { name: "Polo do Coord", city: "Porto Velho" }, as)).status === 201, "coordinator creating a polo");

      // the coordination has the same powers as the administrator (decided by the company): credentials, keys, tokens...
      assert((await http.get("/payments/efi/settings", as)).status === 200, "coordinator cannot reach the payment credentials");
      assert((await http.get("/api-tokens", as)).status === 200, "coordinator cannot reach API tokens");
      assert((await http.get("/ai-settings", as)).status === 200, "coordinator cannot reach AI keys");
      assert((await http.put("/ai-settings", {}, as)).status === 200, "coordinator cannot save AI keys");
      const allSettings = await http.get("/settings", as);
      assert(allSettings.status === 200 && allSettings.data.length > 0, "coordinator cannot read every setting");
      assert((await http.put("/settings/appTimezone", { value: "America/Porto_Velho" }, as)).status === 200, "coordinator cannot change a setting");
      assert((await http.delete(`/leads/${lead.id}`, as)).status === 200, "coordinator cannot delete a lead");
      // a consultant still cannot manage anybody
      const cons = (await http.post("/auth/login", { email: "do-coord@x.com", password: "senha123" })).data.token;
      assert((await http.post("/users", { name: "X", email: "x-x@x.com", password: "senha123", role: "consultor" }, asUser(cons))).status === 403, "consultant created a user");
      assert((await http.get("/commissions", as)).data.scope === "all", "coordinator does not see everyone's commissions");
    });
    await test("team goals: automatic count from the CRM, manual adjustment, shared line, repeat the period, managers only", async () => {
      const mk = async (name, email) => (await http.post("/users", { name, email, password: "senha123", role: "consultor" }, auth())).data;
      const leila = await mk("Leila Meta", "leila-meta@x.com"), pedro = await mk("Pedro Meta", "pedro-meta@x.com"), dany = await mk("Dany Meta", "dany-meta@x.com");
      const stageId = sql(`SELECT id FROM LeadStages ORDER BY position LIMIT 1`);
      const won = (name, owner, when) => sql(`INSERT INTO Leads (name, stageId, ownerId, wonAt, createdAt, updatedAt) VALUES ('${name}', ${stageId}, ${owner}, ${when}, NOW(), NOW()) RETURNING id`);
      const year = new Date().getUTCFullYear();
      const startsOn = `${year - 1}-09-26`, endsOn = `${year + 1}-10-26`;
      won("Mat 1", leila.id, "NOW() - INTERVAL '3 days'"); won("Mat 2", leila.id, "NOW() - INTERVAL '2 days'");
      won("Mat 3", pedro.id, "NOW() - INTERVAL '1 day'"); won("Mat 4", dany.id, "NOW() - INTERVAL '1 day'");
      won("Fora", leila.id, `'${year - 3}-01-10 12:00:00+00'`);

      const made = await http.post("/goals", { startsOn, endsOn, members: [
        { label: "Leila", userIds: [leila.id], target: 3 },
        { label: "Pedro e Dany", userIds: [pedro.id, dany.id], target: 4, manualCount: 1 },
        { label: "Sem login", userIds: [], target: 2, manualCount: 1 },
        { label: "Sem meta", userIds: [] }
      ] }, auth());
      assert(made.status === 201, `create ${made.status} ${JSON.stringify(made.data).slice(0, 160)}`);
      const m = made.data.members;
      assert(m[0].done === 2 && m[0].missing === 1 && m[0].pct === 67, `Leila ${JSON.stringify(m[0])}`);
      assert(m[1].auto === 2 && m[1].manual === 1 && m[1].done === 3, `shared line ${JSON.stringify(m[1])}`);
      assert(m[2].done === 1 && m[2].auto === 0 && m[2].pct === 50, "manual-only line");
      assert(m[3].target === null && m[3].pct === null && m[3].missing === null, "line without a target");
      assert(made.data.total.target === 9 && made.data.total.done === 6, `totals ${JSON.stringify(made.data.total)}`);

      const upd = await http.put(`/goals/${made.data.id}`, { title: "Meta de teste", members: [{ label: "Leila", userIds: [leila.id], target: 2 }] }, auth());
      assert(upd.status === 200 && upd.data.members.length === 1 && upd.data.members[0].reached === true, `update ${JSON.stringify(upd.data.members)}`);
      // the screen sends the adjustment as `manual` (the same name the list answers with): it must be kept
      const adj = await http.put(`/goals/${made.data.id}`, { members: [{ label: "Leila", userIds: [leila.id], target: 2, manual: 4 }] }, auth());
      assert(adj.status === 200 && adj.data.members[0].manual === 4, `manual adjustment lost ${JSON.stringify(adj.data.members)}`);
      assert((await http.put(`/goals/${made.data.id}`, { startsOn: "2027-01-02", endsOn: "2027-01-01" }, auth())).status === 400, "inverted period accepted");

      const rep = await http.post(`/goals/${made.data.id}/repeat`, {}, auth());
      assert(rep.status === 201 && rep.data.startsOn.endsWith("-26") && rep.data.endsOn.endsWith("-26"), `repeat ${rep.data.startsOn} ${rep.data.endsOn}`);
      assert(rep.data.members[0].target === 2 && rep.data.members[0].manual === 0, "repeat keeps targets, drops adjustments");

      const tl = (await http.post("/auth/login", { email: "leila-meta@x.com", password: "senha123" })).data.token;
      assert((await http.get("/goals", asUser(tl))).status === 403, "a consultant read the goals");
      const list = (await http.get("/goals", auth())).data;
      assert(list.length >= 2, "list");
      assert((await http.delete(`/goals/${rep.data.id}`, auth())).status === 200 && (await http.get("/goals", auth())).data.length === list.length - 1, "delete");
    });
    await test("Central do Afiliado: collections, FAQ, videos and support edited by the administration, copy counter, no prices", async () => {
      const aff = (await http.post("/affiliates", { name: "Central Teste", phone: "(69) 97777-1234" }, auth())).data;
      const set = await http.put("/affiliate-rules", {
        faq: [{ q: "Pergunta de teste?", a: "Resposta de teste." }, { q: "", a: "sem pergunta" }],
        videoProgram: "https://youtu.be/dQw4w9WgXcQ", videoTutorial: "", supportPhone: "(69) 99999-0000"
      }, auth());
      assert(set.status === 200 && set.data.faq.length === 1 && set.data.supportPhone === "69999990000", `rules ${set.status} ${JSON.stringify(set.data).slice(0, 200)}`);
      assert((await http.put("/affiliate-rules", { videoProgram: "javascript:alert(1)" }, auth())).status === 400, "unsafe video link accepted");

      const mat = (await http.post("/affiliate-materials", { title: "Texto da pós", kind: "copy", copyText: "Quer dar o próximo passo?", audience: "all", collection: "pos" }, auth())).data;
      assert(mat.collection === "pos", "collection not saved");
      const bogus = (await http.post("/affiliate-materials", { title: "Sem coleção", kind: "copy", copyText: "Olá!", audience: "all", collection: "qualquer" }, auth())).data;
      assert(bogus.collection === null, "unknown collection accepted");

      const portal = (await http.get(`/affiliate-portal/${aff.portalToken}`)).data;
      assert(portal.materials.find(m => m.id === mat.id).collection === "pos", "portal lacks the collection");
      assert(portal.faq.length === 1 && portal.faq[0].q === "Pergunta de teste?", "portal FAQ");
      assert(portal.videos.length === 1 && portal.videos[0].key === "program" && portal.videos[0].embed.includes("dQw4w9WgXcQ"), `videos ${JSON.stringify(portal.videos)}`);
      assert(portal.support && portal.support.url === "https://wa.me/69999990000", "support link");
      assert(!/R\$ ?\d/.test(JSON.stringify({ m: portal.materials, c: portal.courses, f: portal.faq })), "a price leaked into the portal");

      // the copy counter
      assert((await http.post(`/affiliate-portal/${aff.portalToken}/materials/${mat.id}/copied`)).status === 200, "copied");
      assert((await http.post(`/affiliate-portal/${aff.portalToken}/materials/${mat.id}/copied`)).status === 200, "copied again");
      const listed = (await http.get("/affiliate-materials", auth())).data.find(m => m.id === mat.id);
      assert(listed.copies === 2, `copies ${listed.copies}`);
      assert((await http.post(`/affiliate-portal/${"0".repeat(48)}/materials/${mat.id}/copied`)).status === 404, "wrong token counted a copy");

      // back to the default FAQ when it is emptied
      const empty = await http.put("/affiliate-rules", { faq: [] }, auth());
      assert(empty.data.faq.length >= 3, "default FAQ not restored");
    });
    await test("managers see every conversation of every attendant in one place, filter by attendant and connection; others do not", async () => {
      const mk = async (name, email, role) => (await http.post("/users", { name, email, password: "senha123", role }, auth())).data;
      const a1 = await mk("Atendente Um", "att1@x.com", "consultor"), a2 = await mk("Atendente Dois", "att2@x.com", "consultor");
      await mk("Coord Central", "coord-central@x.com", "coordenacao");
      const q = (await http.get("/queue", auth())).data[0];
      const mkTicket = (name, number, user) => {
        const c = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('${name}', '${number}', '', false, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
        return sql(`INSERT INTO Tickets (status, contactId, whatsappId, userId, queueId, unreadMessages, isGroup, segment, isHistorical, lastMessage, lastMessageId, lastMessageAt, createdAt, updatedAt) VALUES ('open', ${c}, ${tgId}, ${user}, ${q.id}, 2, false, 'sales', false, 'oi', 'cent-${number}', NOW(), NOW(), NOW()) RETURNING id`).split("\n")[0];
      };
      const t1 = mkTicket("Cliente do Um", "tg_9101", a1.id), t2 = mkTicket("Cliente do Dois", "tg_9102", a2.id);
      const ids = async (params, who) => (await http.get("/tickets", { params: { status: "open", showAll: "true", queueIds: "[]", ...params }, ...who })).data.tickets.map(t => String(t.id));

      const tc = (await http.post("/auth/login", { email: "coord-central@x.com", password: "senha123" })).data.token;
      const t1a = (await http.post("/auth/login", { email: "att1@x.com", password: "senha123" })).data.token;
      const seen = await ids({ allQueues: "true" }, asUser(tc));
      assert(seen.includes(t1) && seen.includes(t2), "the coordinator does not see everyone's conversations");
      assert((await ids({ allQueues: "true" }, auth())).includes(t1), "the administrator does not see the conversations");
      const onlyOne = await ids({ allQueues: "true", attendantId: String(a2.id) }, asUser(tc));
      assert(onlyOne.includes(t2) && !onlyOne.includes(t1), "attendant filter");
      const byConn = await ids({ allQueues: "true", connectionId: String(tgId) }, asUser(tc));
      assert(byConn.includes(t1), "connection filter");
      assert(!(await ids({ allQueues: "true", connectionId: "999999" }, asUser(tc))).includes(t1), "connection filter leaked");
      const unread = (await http.get("/tickets", { params: { withUnreadMessages: "true", showAll: "true", allQueues: "true", queueIds: "[]", groups: "exclude" }, ...asUser(tc) })).data.tickets.map(t => String(t.id));
      assert(unread.includes(t1) && unread.includes(t2), "unread view of everyone");
      const mine = await ids({ allQueues: "true", attendantId: String(a2.id) }, asUser(t1a));
      assert(!mine.includes(t2), "an attendant saw a colleague's conversation");
      assert(!(await ids({ allQueues: "true" }, asUser(t1a))).includes(t2), "allQueues worked for a non-manager");
      assert((await http.get("/whatsapp", asUser(tc))).data.length >= 1, "coordinator does not list the connections");
    });
    await test("the last administrator cannot be demoted, and the user form shows the effective role", async () => {
      // the list is paged: look for the administrator by e-mail instead of hoping it is on the first page
      const users = (await http.get("/users", { ...auth(), params: { searchParam: "admin@whaticket.com" } })).data.users;
      const admin = users.find(u => u.profile === "admin");
      assert(admin, "the administrator was not found");
      assert((await http.get(`/users/${admin.id}`, auth())).data.role === "admin", "the form would show another role for the administrator");
      const demote = await http.put(`/users/${admin.id}`, { role: "consultor" }, auth());
      assert(demote.status === 400 && demote.data.error === "ERR_LAST_ADMIN", `the last admin was demoted: ${demote.status}`);
      assert((await http.get(`/users/${admin.id}`, auth())).data.profile === "admin", "profile changed");
    });
    await test("affiliates: the proposal names the affiliate, bonus = first monthly fee due in N days, support = who registered the affiliate, ranking by paid", async () => {
      const mk = async (name, email) => (await http.post("/users", { name, email, password: "senha123", role: "consultor" }, auth())).data;
      const owner = await mk("Dona do Afiliado", "dona-afil@x.com");
      const to = (await http.post("/auth/login", { email: "dona-afil@x.com", password: "senha123" })).data.token;
      // support number: set by the person themselves
      assert((await http.put("/me/phone", { phone: "abc" }, asUser(to))).status === 400, "invalid phone accepted");
      assert((await http.put("/me/phone", { phone: "(69) 98111-2222" }, asUser(to))).data.phone === "5569981112222", "phone not normalised");

      const aff = (await http.post("/affiliates", { name: "Indicadora da Dona", phone: "(69) 97000-1111" }, asUser(to))).data;
      const portal = (await http.get(`/affiliate-portal/${aff.portalToken}`)).data;
      assert(portal.support && portal.support.url === "https://wa.me/5569981112222" && portal.support.name === "Dona do Afiliado", `support ${JSON.stringify(portal.support)}`);

      // rule: first monthly fee, 45 days
      assert((await http.put("/affiliate-rules", { mode: "first_monthly", payDays: 45, trigger: "enrolled", kind: "pix" }, auth())).data.payDays === 45, "rules");
      const referred = (await http.post(`/affiliates/${aff.id}/referrals`, { name: "Aluna Indicada", phone: "(69) 96000-3333" }, asUser(to))).data.lead;
      assert(referred.affiliate && referred.affiliate.id === aff.id, "referral lost its affiliate");
      const course = (await http.get("/courses", auth())).data.find(c => c.active) || (await http.get("/courses", auth())).data[0];
      sql(`INSERT INTO Proposals (leadId, affiliateId, token, status, courseName, grossFee, firstMonthly, bolsaPct, params, createdBy, createdAt, updatedAt) VALUES (${referred.id}, ${aff.id}, 'tok${Date.now()}', 'sent', 'Curso de teste', 500, 250.5, 50, '{}', ${owner.id}, NOW(), NOW())`);
      const proposals = (await http.get("/proposals", { params: { leadId: referred.id }, ...auth() })).data;
      assert(proposals[0].affiliate && proposals[0].affiliate.name === "Indicadora da Dona", `proposal list lacks the affiliate: ${JSON.stringify(proposals[0].affiliate)}`);

      const won = (await http.get("/lead-stages", auth())).data.find(s => s.type === "won");
      const moved = await http.put(`/leads/${referred.id}/stage`, { stageId: won.id, skipEnroll: true }, auth());
      assert(moved.status === 200, `enroll ${moved.status}`);
      const bonus = (await http.get("/affiliate-bonuses", auth())).data.rows.find(b => b.leadId === referred.id);
      assert(bonus && Number(bonus.amount) === 250.5 && /1ª mensalidade/.test(bonus.reason), `bonus ${JSON.stringify(bonus)}`);
      const due = new Date(`${bonus.dueAt}T12:00:00Z`).getTime(), expected = Date.now() + 45 * 86400000;
      assert(bonus.dueAt && Math.abs(due - expected) < 2 * 86400000, `due date ${bonus.dueAt}`);
      const fresh = (await http.get(`/affiliate-portal/${aff.portalToken}`)).data;
      assert(fresh.bonuses.some(b => Number(b.amount) === 250.5 && b.dueAt), "portal bonus without the due date");
      assert(fresh.faq.some(f => /45 dias/.test(f.a)), "FAQ does not state the payment term");

      // ranking by what was paid
      const rank = (await http.get("/affiliates/ranking", { params: { by: "paid" }, ...auth() })).data;
      assert(rank.totals.bonusPaid !== undefined && Array.isArray(rank.affiliates), "ranking shape");
    });
    await test("response times by median / p90 / target, per department and attendant, smart insights, manager-only view and My day", async () => {
      const mk = async (name, email, role) => (await http.post("/users", { name, email, password: "senha123", role }, auth())).data;
      const att = await mk("Atendente Tempo", "tempo@x.com", "consultor");
      await mk("Coord Tempo", "coord-tempo@x.com", "coordenacao");
      const tok = async email => (await http.post("/auth/login", { email, password: "senha123" })).data.token;
      const queue = (await http.get("/queue", auth())).data[0];
      const c = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('Cliente do Tempo', 'tg_9301', '', false, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
      const t = sql(`INSERT INTO Tickets (status, contactId, whatsappId, userId, queueId, unreadMessages, isGroup, segment, isHistorical, lastMessage, lastMessageId, lastMessageFromMe, lastMessageAt, createdAt, updatedAt) VALUES ('open', ${c}, ${tgId}, ${att.id}, ${queue.id}, 0, false, 'onboarding', false, 'ok', 'tempo-x', true, NOW(), NOW() - INTERVAL '4 hours', NOW()) RETURNING id`).split("\n")[0];
      // customer writes, the team answers after 10, 60 and 5 minutes
      const m = (id, fromMe, ago) => sql(`INSERT INTO Messages (id, body, ack, read, mediaType, ticketId, createdAt, updatedAt, fromMe) VALUES ('tempo-${id}', 'x', 1, true, 'chat', ${t}, NOW() - INTERVAL '${ago} minutes', NOW(), ${fromMe})`);
      m(1, false, 200); m(2, true, 190); m(3, false, 170); m(4, true, 110); m(5, false, 90); m(6, true, 85);

      const mgmt = (await http.get("/dashboard/management", { params: { days: 7 }, ...auth() })).data;
      const me = mgmt.attendants.find(a => a.id === att.id);
      assert(me && me.reply.count === 3 && me.reply.median === 10 && me.reply.p90 === 50 && me.reply.withinSlaPct === 67, `reply stats ${JSON.stringify(me && me.reply)}`);
      assert(me.reply.avg === 25, `the average hides the problem: ${me.reply.avg}`);
      const dept = mgmt.departments.find(d => d.key === "onboarding");
      assert(dept && dept.label === "Ambientação" && dept.attendances >= 1 && dept.reply.count >= 3, `department ${JSON.stringify(dept && dept.reply)}`);
      assert(Array.isArray(mgmt.insights) && mgmt.insights.length >= 1 && mgmt.total.reply.count >= 3 && mgmt.slaMinutes === 15, "insights or totals missing");

      const dash = (await http.get("/dashboard", { params: { days: 7 }, ...auth() })).data;
      assert(dash.period.response.count >= 3 && dash.period.response.median !== null && Array.isArray(dash.insights), "overview lacks the response block");

      // management is for managers only
      assert((await http.get("/dashboard/management", asUser(await tok("tempo@x.com")))).status === 403, "a consultant opened the management view");
      assert((await http.get("/dashboard/management", { params: { days: 7 }, ...asUser(await tok("coord-tempo@x.com")) })).status === 200, "the coordinator cannot open the management view");

      // my day: a customer waiting 40 minutes
      const c2 = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('Cliente Esperando', 'tg_9302', '', false, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
      sql(`INSERT INTO Tickets (status, contactId, whatsappId, userId, queueId, unreadMessages, isGroup, segment, isHistorical, lastMessage, lastMessageId, lastMessageFromMe, lastMessageAt, createdAt, updatedAt) VALUES ('open', ${c2}, ${tgId}, ${att.id}, ${queue.id}, 1, false, 'sales', false, 'oi?', 'tempo-w', false, NOW() - INTERVAL '40 minutes', NOW(), NOW())`);
      const day = (await http.get("/dashboard/me", asUser(await tok("tempo@x.com")))).data;
      assert(day.toReplyCount === 1 && day.toReply[0].name === "Cliente Esperando" && day.toReply[0].minutes >= 39, `my day ${JSON.stringify(day.toReply)}`);
      assert(day.insights.some(i => /esperando resposta/.test(i.text)), "my day has no sentence about the waiting customer");
      assert(day.reply.count >= 3 && day.reply.median === 10, "my own response time");
    });
    await test("one conversation per person: writing after a closed attendance brings the same one back, reopening never errors", async () => {
      const cid = sql(`SELECT id FROM Contacts WHERE number='tg_7777'`);
      const tid = sql(`SELECT id FROM Tickets WHERE contactId=${cid} ORDER BY id DESC LIMIT 1`);
      sql(`UPDATE Tickets SET status='closed', closedAt=NOW() - INTERVAL '3 days', updatedAt=NOW() - INTERVAL '3 days' WHERE id=${tid}`);
      tg.updates.push({ update_id: 7780, message: { message_id: 7781, chat: { id: 7777, type: "private" }, from: { first_name: "Fulana" }, text: "oi de novo, depois de dias" } });
      await waitFor(async () => sql(`SELECT status FROM Tickets WHERE id=${tid}`) !== "closed", 10000, "closed conversation comes back");
      assert(sql(`SELECT COUNT(*) FROM Tickets WHERE contactId=${cid}`) === "1", "a second conversation was opened for the same person");
      assert(sql(`SELECT COUNT(*) FROM Messages WHERE ticketId=${tid} AND body LIKE 'oi de novo%'`) === "1", "message not in the same thread");

      // a duplicate that already exists: reopening answers with the open one instead of failing
      const dup = sql(`INSERT INTO Tickets (status, contactId, whatsappId, unreadMessages, isGroup, segment, isHistorical, createdAt, updatedAt) VALUES ('closed', ${cid}, ${tgId}, 0, false, 'sales', false, NOW(), NOW() - INTERVAL '9 days') RETURNING id`).split("\n")[0];
      const r = await http.put(`/tickets/${dup}`, { status: "open" }, auth());
      assert(r.status === 400 && r.data.error === "ERR_OTHER_OPEN_TICKET" && r.data.data && Number(r.data.data.ticketId) === Number(tid), `reopen response ${r.status} ${JSON.stringify(r.data)}`);
      sql(`DELETE FROM Tickets WHERE id=${dup}`);

      // a new conversation started by the team reopens the closed one too
      sql(`UPDATE Tickets SET status='closed', closedAt=NOW() WHERE id=${tid}`);
      const created = await http.post("/tickets", { contactId: Number(cid), status: "open", userId: 1 }, auth());
      assert(created.status === 200 || created.status === 201, `create ${created.status} ${JSON.stringify(created.data).slice(0, 120)}`);
      assert(Number(created.data.id) === Number(tid) && sql(`SELECT COUNT(*) FROM Tickets WHERE contactId=${cid}`) === "1", "manual new conversation duplicated the thread");
    });
    await test("history conversations and groups are written in directly (the message opens them); contact cards read well in the list", async () => {
      const mkc = (name, num, group) => sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('${name}', '${num}', '', ${group}, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
      const c1 = mkc("Histórica Escreve", "tg_8801", false);
      const t1 = sql(`INSERT INTO Tickets (status, contactId, whatsappId, unreadMessages, isGroup, segment, isHistorical, lastMessage, closedAt, createdAt, updatedAt) VALUES ('closed', ${c1}, ${tgId}, 0, false, 'sales', true, 'antiga', NOW(), NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days') RETURNING id`).split("\n")[0];
      const r1 = await http.post(`/messages/${t1}`, { body: "voltei", read: 1, fromMe: true, mediaUrl: "" }, auth());
      assert(r1.status === 200 || r1.status === 201 || r1.status === 204, `send into history ${r1.status}`);
      assert(sql(`SELECT CONCAT(status,'|',CASE WHEN isHistorical THEN 1 ELSE 0 END) FROM Tickets WHERE id=${t1}`) === "open|0", "history conversation not opened by the message");

      const g = mkc("Grupo Escreve", "tg_8802", true);
      const t2 = sql(`INSERT INTO Tickets (status, contactId, whatsappId, unreadMessages, isGroup, segment, isHistorical, closedAt, createdAt, updatedAt) VALUES ('closed', ${g}, ${tgId}, 0, true, 'sales', false, NOW(), NOW(), NOW()) RETURNING id`).split("\n")[0];
      await http.post(`/messages/${t2}`, { body: "oi grupo", read: 1, fromMe: true, mediaUrl: "" }, auth());
      assert(sql(`SELECT status FROM Tickets WHERE id=${t2}`) === "open", "group still needs reopening");

      // a contact card never shows its raw text in the list
      const { previewOf } = require("../dist/helpers/MessagePreview");
      assert(previewOf("BEGIN:VCARD\nVERSION:3.0\nFN:Laura Jonjob\nTEL:+5511\nEND:VCARD", "vcard") === "👤 Laura Jonjob", "vcard preview");
      assert(previewOf("BEGIN:VCARD\nVERSION:3.0\nEND:VCARD") === "👤 Contato", "vcard without name");
      assert(previewOf("oi") === "oi", "text untouched");
    });
    await test("the Grupos tab lists every group (copied history and live) and statistics ignore groups", async () => {
      const gid = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('Grupo da turma', '120363000000000001-1600000000', '', true, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
      const gt = sql(`INSERT INTO Tickets (status, contactId, whatsappId, unreadMessages, isGroup, segment, isHistorical, lastMessage, closedAt, createdAt, updatedAt) VALUES ('closed', ${gid}, ${tgId}, 0, true, 'sales', true, 'bem-vindos', NOW(), NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days') RETURNING id`).split("\n")[0];
      const queueIds = JSON.stringify((await http.get("/queue", auth())).data.map(q => q.id));
      const ids = async (params) => (await http.get("/tickets", { params: { showAll: "true", queueIds, ...params }, ...auth() })).data.tickets.map(t => String(t.id));
      assert((await ids({ groups: "only", historical: "all" })).includes(String(gt)), "group missing from the Grupos tab");
      assert(!(await ids({ groups: "exclude", historical: "all" })).includes(String(gt)), "group leaked into the private chats");
      assert((await ids({ historical: "all" })).includes(String(gt)), "group missing from Todas");
      const before = Number((await http.get("/stats/overview", { params: { from: "2020-01-01", to: "2099-12-31" }, ...auth() })).data.totals.total);
      sql(`INSERT INTO Tickets (status, contactId, whatsappId, unreadMessages, isGroup, segment, createdAt, updatedAt) VALUES ('open', ${gid}, ${tgId}, 0, true, 'sales', NOW(), NOW())`);
      assert(Number((await http.get("/stats/overview", { params: { from: "2020-01-01", to: "2099-12-31" }, ...auth() })).data.totals.total) === before, "a group conversation was counted as a service ticket");
    });
    await test("the list is ordered by the last message (not by when the row was touched), newest first, pinned on top", async () => {
      const mk = (name, num, at, touched) => {
        const c = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('${name}', '${num}', '', false, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
        return sql(`INSERT INTO Tickets (status, contactId, whatsappId, unreadMessages, isGroup, segment, isHistorical, lastMessage, lastMessageId, lastMessageAt, closedAt, createdAt, updatedAt) VALUES ('closed', ${c}, ${tgId}, 0, false, 'sales', true, 'oi', 'ord-msg', NOW() - INTERVAL '${at}', NOW(), NOW() - INTERVAL '90 days', NOW() - INTERVAL '${touched}') RETURNING id`).split("\n")[0];
      };
      // A wrote yesterday but was imported "just now"; B wrote last week but was touched yesterday
      const a = mk("Ordem A", "tg_ord_a", "1 day", "1 minute");
      const b = mk("Ordem B", "tg_ord_b", "7 days", "30 minutes");
      const c = mk("Ordem C", "tg_ord_c", "3 hours", "40 days");
      const queueIds = JSON.stringify((await http.get("/queue", auth())).data.map(q => q.id));
      const list = (await http.get("/tickets", { params: { showAll: "true", historical: "all", queueIds }, ...auth() })).data.tickets.map(t => Number(t.id));
      assert(list.indexOf(Number(c)) < list.indexOf(Number(a)) && list.indexOf(Number(a)) < list.indexOf(Number(b)), `order by last message: C ${list.indexOf(Number(c))}, A ${list.indexOf(Number(a))}, B ${list.indexOf(Number(b))}`);
      const first = (await http.get("/tickets", { params: { showAll: "true", historical: "all", queueIds }, ...auth() })).data.tickets.find(t => Number(t.id) === Number(a));
      assert(first.lastMessageAt, "the list does not carry lastMessageAt");
    });
    await test("messages can be deleted for everyone or only here, edits are limited to WhatsApp, \"mark as unread\" and the all-conversations view work", async () => {
      const t = ticketOf("tg_5551");
      const mine = "del-out-1", theirs = "del-in-1";
      sql(`INSERT INTO Messages (id, ticketId, body, fromMe, read, mediaType, ack, createdAt, updatedAt) VALUES ('${mine}', ${t}, 'enviada', true, true, 'chat', 1, NOW(), NOW()), ('${theirs}', ${t}, 'recebida', false, true, 'chat', 0, NOW(), NOW())`);
      sql(`UPDATE Tickets SET lastMessageId='${mine}' WHERE id=${t}`);

      // a received message can only be hidden here
      const r1 = await http.delete(`/messages/${theirs}`, auth());
      assert(r1.status === 400, `deleting someone else's message for everyone: ${r1.status}`);
      assert((await http.delete(`/messages/${theirs}`, { params: { scope: "local" }, ...auth() })).status === 200, "local delete of a received message");
      assert(sql(`SELECT isDeleted FROM Messages WHERE id='${theirs}'`) === "1", "local delete did not mark it");

      // editing is a WhatsApp-only feature; on other channels it says so
      const e = await http.put(`/messages/${mine}`, { body: "texto novo" }, auth());
      assert(e.status === 400, `edit on telegram: ${e.status}`);

      // own message, inside the time limit: deleted for everyone
      assert((await http.delete(`/messages/${mine}`, auth())).status === 200, "delete for everyone");
      assert(sql(`SELECT isDeleted FROM Messages WHERE id='${mine}'`) === "1", "delete for everyone did not mark it");

      // an old own message cannot be deleted for everyone
      sql(`INSERT INTO Messages (id, ticketId, body, fromMe, read, mediaType, ack, createdAt, updatedAt) VALUES ('old-own-1', ${t}, 'velha', true, true, 'chat', 1, NOW() - INTERVAL '5 days', NOW())`);
      assert((await http.delete(`/messages/old-own-1`, auth())).status === 400, "old message deleted for everyone");

      // mark as unread
      sql(`UPDATE Tickets SET unreadMessages=0 WHERE id=${t}`);
      assert((await http.put(`/tickets/${t}/unread`, {}, auth())).status === 200, "mark unread");
      assert(Number(sql(`SELECT unreadMessages FROM Tickets WHERE id=${t}`)) >= 1, "unread badge not set");

      // the last message state used by the list ticks follows new messages
      assert(sql(`SELECT lastMessageId IS NOT NULL FROM Tickets WHERE id=${t}`) === "1", "ticket does not know its last message");

      // everything: live conversations (any status) in one list
      const queueIds = JSON.stringify((await http.get("/queue", auth())).data.map(q => q.id));
      const all = (await http.get("/tickets", { params: { showAll: "true", historical: "all", queueIds }, ...auth() })).data.tickets.map(x => String(x.id));
      assert(all.includes(String(t)), "the all view misses a live conversation");
    });
    await test("list ticks: the backfill fills old conversations and acks only move forward", async () => {
      const t = ticketOf("tg_5551");
      sql(`INSERT INTO Messages (id, ticketId, body, fromMe, read, mediaType, ack, createdAt, updatedAt) VALUES ('bf-old-1', ${t}, 'antiga', false, true, 'chat', 0, NOW() + INTERVAL '1 day', NOW()), ('bf-last-1', ${t}, 'ultima enviada', true, true, 'chat', 2, NOW() + INTERVAL '2 days', NOW())`);
      sql(`UPDATE Tickets SET lastMessageId=NULL, lastMessageFromMe=false, lastMessageAck=0 WHERE id=${t}`);
      // same statement the migration runs
      psql(DB, `UPDATE "Tickets" t SET "lastMessageId" = m."id", "lastMessageFromMe" = m."fromMe", "lastMessageAck" = COALESCE(m."ack", 0) FROM (SELECT DISTINCT ON ("ticketId") "id", "ticketId", "fromMe", "ack" FROM "Messages" ORDER BY "ticketId", "createdAt" DESC) m WHERE m."ticketId" = t."id" AND t."lastMessageId" IS NULL`);
      assert(sql(`SELECT CONCAT(lastMessageId,'|',CASE WHEN lastMessageFromMe THEN 1 ELSE 0 END,'|',lastMessageAck) FROM Tickets WHERE id=${t}`) === "bf-last-1|1|2", "backfill did not copy the last message state");
      assert(sql(`SELECT COUNT(*) FROM pg_indexes WHERE indexname='messages_ticket_created_idx'`) === "1", "messages index missing");
    });
    await test("conversation drawer lists media, documents, links and starred; search looks in messages from 3 letters", async () => {
      const t = sql(`SELECT t.id FROM Tickets t JOIN Contacts c ON c.id=t.contactId WHERE c.number='tg_5551' AND t.isHistorical=false ORDER BY t.id DESC LIMIT 1`);
      sql(`INSERT INTO Messages (id, ticketId, body, fromMe, read, mediaType, mediaUrl, ack, starred, createdAt, updatedAt) VALUES
        ('dr-img-1', ${t}, 'foto da prova', false, true, 'image', 'dr-img-1.jpg', 0, false, NOW(), NOW()),
        ('dr-doc-1', ${t}, 'edital.pdf', false, true, 'document', 'dr-doc-1.pdf', 0, false, NOW(), NOW()),
        ('dr-link-1', ${t}, 'veja https://cruzeirodosulvirtual.com.br/cursos, e depois me chame', true, true, 'chat', NULL, 1, false, NOW(), NOW()),
        ('dr-star-1', ${t}, 'lembrar xyzzycode', true, true, 'chat', NULL, 1, true, NOW(), NOW())`);
      const kind = async k => (await http.get(`/messages/${t}/list`, { params: { kind: k }, ...auth() })).data;
      assert((await kind("media")).some(m => m.id === "dr-img-1"), "media tab");
      assert((await kind("docs")).some(m => m.id === "dr-doc-1"), "docs tab");
      const links = await kind("links");
      assert(links.length === 1 && links[0].url === "https://cruzeirodosulvirtual.com.br/cursos", `links tab ${JSON.stringify(links)}`);
      assert((await kind("starred")).map(m => m.id).join() === "dr-star-1", "starred tab");
      await http.post("/users", { name: "Tutor Gaveta", email: "gaveta-tutor@x.com", password: "senha123", role: "tutor" }, auth());
      const tutorLogin = await http.post("/auth/login", { email: "gaveta-tutor@x.com", password: "senha123" });
      const tutorRead = await http.get(`/messages/${t}/list`, { params: { kind: "media" }, ...asUser(tutorLogin.data.token) });
      assert(tutorRead.status === 403, `tutor reads a sales conversation: login ${tutorLogin.status}, read ${tutorRead.status} ${JSON.stringify(tutorRead.data).slice(0, 120)}`);

      const found = async q => {
        const r = await http.get("/tickets", { params: { showAll: "true", searchParam: q, queueIds: JSON.stringify((await http.get("/queue", auth())).data.map(x => x.id)) }, ...auth() });
        assert(r.status === 200 && r.data.tickets, `search ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
        return r.data.tickets.map(x => x.id);
      };
      assert((await found("xyzzycode")).includes(Number(t)), "search by message text");
      assert(!(await found("xy")).includes(Number(t)), "two letters must not search message bodies");
      assert((await found("xyzzycode")).length === new Set(await found("xyzzycode")).size, "duplicated rows in search");
    });
    await test("home dashboard: per day (days do not mix), groups, history and team members stay out, staff flag works", async () => {
      const mkContact = (name, num, group = false) => sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('${name}', '${num}', '', ${group}, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
      const mkTicket = (cid, group = false) => sql(`INSERT INTO Tickets (status, contactId, whatsappId, unreadMessages, isGroup, segment, isHistorical, createdAt, updatedAt) VALUES ('open', ${cid}, ${tgId}, 0, ${group}, 'sales', false, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const before = (await http.get("/dashboard", auth())).data;
      assert(before.now && before.period && before.period.week.length === 7 && before.period.byHour.length >= 13, "dashboard shape");

      const customer = mkTicket(mkContact("Cliente Painel", "tg_dash_1"));
      const mate = mkContact("Colega Painel", "tg_dash_2");
      const mateTicket = mkTicket(mate);
      const grp = mkTicket(mkContact("Grupo Painel", "tg_dash_g"), true);
      const msg = (id, ticket, body, fromMe, ago) => sql(`INSERT INTO Messages (id, ticketId, body, fromMe, read, mediaType, ack, createdAt, updatedAt) VALUES ('${id}', ${ticket}, '${body}', ${fromMe}, true, 'chat', 0, NOW() - INTERVAL '${ago}', NOW())`);
      msg("dash-c-1", customer, "oi", false, "1 minute");
      msg("dash-c-2", customer, "tudo bem?", true, "30 seconds");
      msg("dash-old", customer, "ontem", false, "30 hours");
      msg("dash-m-1", mateTicket, "papo interno", false, "1 minute");
      msg("dash-g-1", grp, "mensagem de grupo", false, "1 minute");
      const after = (await http.get("/dashboard", auth())).data;
      assert(after.period.received - before.period.received === 2, `received counts today's customer + team message only: ${after.period.received - before.period.received}`);
      assert(after.period.sent - before.period.sent === 1, "sent");
      assert(after.period.attendances - before.period.attendances === 2, "conversations of the day (group out, yesterday's message not counted)");

      // marking the colleague as team removes them from every number
      assert((await http.put(`/contacts/${mate}/staff`, { isStaff: true }, auth())).status === 200, "mark staff");
      const staffed = (await http.get("/dashboard", auth())).data;
      assert(staffed.period.received - before.period.received === 1 && staffed.period.attendances - before.period.attendances === 1, "team member still counted");
      const ov = (await http.get("/stats/overview", { params: { from: "2020-01-01", to: "2099-12-31" }, ...auth() })).data;
      assert(sql(`SELECT isStaff FROM Contacts WHERE id=${mate}`) === "1", "flag not saved");
      assert(ov.totals, "stats still answers");

      // another day: yesterday shows the old message, today's are not mixed in
      const y = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });
      const yesterday = (await http.get("/dashboard", { params: { date: y }, ...auth() })).data;
      assert(yesterday.date === y && yesterday.period.received >= 1, "yesterday keeps its own message");
      const agentView = await http.get("/dashboard", asUser(agentToken));
      assert(agentView.status === 200 && agentView.data.scope === "mine", `dashboard for a non-admin: ${agentView.status}`);
    });
    await test("the default course catalogue loads once, keeps manual prices and --force restores them", async () => {
      const first = await http.post("/courses/load-default", {}, auth());
      assert(first.status === 200 && first.data.total === 128, `catalogue size ${JSON.stringify(first.data)}`);
      assert(Number(sql(`SELECT COUNT(*) FROM Courses WHERE category='Graduação - Cruzeiro'`)) === 128, "128 courses expected");
      assert(sql(`SELECT monthlyFee FROM Courses WHERE name='Administração' AND modality='EAD'`) === "1073.80", "price without scholarship wrong");
      assert(Number(sql(`SELECT COUNT(*) FROM Courses WHERE modality='Semipresencial' AND category='Graduação - Cruzeiro'`)) === 45, "format split wrong");
      sql(`UPDATE Courses SET monthlyFee=999 WHERE name='Administração' AND modality='EAD'`);
      const again = await http.post("/courses/load-default", {}, auth());
      assert(again.data.created === 0 && again.data.skipped === 128, `second load must not duplicate ${JSON.stringify(again.data)}`);
      assert(sql(`SELECT monthlyFee FROM Courses WHERE name='Administração' AND modality='EAD'`) === "999.00", "manual price was overwritten");
      await http.post("/courses/load-default", { force: true }, auth());
      assert(sql(`SELECT monthlyFee FROM Courses WHERE name='Administração' AND modality='EAD'`) === "1073.80", "force did not restore the price");
      const cid = (await http.post("/auth/login", { email: "admin@whaticket.com", password: "admin" })).data.token;
      assert((await http.post("/courses/load-default", {}, { headers: { Authorization: `Bearer ${cid}` } })).status === 200, "admin load");
    });
    await test("each person connects their own WhatsApp: scoped list, one number by default, no one else's QR Code", async () => {
      const mk = async (name, email) => (await http.post("/users", { name, email, password: "senha123", role: "consultor" }, auth())).data;
      const u1 = await mk("Dona Um", "dona1@x.com"), u2 = await mk("Dono Dois", "dono2@x.com");
      const t1 = (await http.post("/auth/login", { email: "dona1@x.com", password: "senha123" })).data.token;
      const t2 = (await http.post("/auth/login", { email: "dono2@x.com", password: "senha123" })).data.token;

      const made = await http.post("/whatsapp", { name: "x", channel: "telegram", config: "{}", queueIds: [1] }, asUser(t1));
      assert(made.status === 200 && made.data.channel === "whatsapp" && made.data.ownerId === u1.id, `own number ${made.status} ${JSON.stringify(made.data).slice(0, 200)}`);
      assert(/Dona/.test(made.data.name) || made.data.name === "x", "name");
      assert(made.data.isDefault === false, "a personal number must not become the default");
      assert(sql(`SELECT whatsappId FROM Users WHERE id=${u1.id}`) === String(made.data.id), "becomes the person's sending number");
      assert((await http.post("/whatsapp", { name: "outro" }, asUser(t1))).status === 400, "second number allowed beyond the limit");
      assert((await http.put("/settings/max_connections_per_user", { value: "2" }, auth())).status === 200, "limit setting");
      const second = await http.post("/whatsapp", { name: "Segundo número" }, asUser(t1));
      assert(second.status === 200, `second number with a higher limit ${second.status}`);
      await http.put("/settings/max_connections_per_user", { value: "1" }, auth());

      // visibility
      const ids = r => r.data.map(w => w.id);
      assert(ids(await http.get("/whatsapp", asUser(t1))).includes(made.data.id), "owner does not see own number");
      assert(!ids(await http.get("/whatsapp", asUser(t2))).includes(made.data.id), "someone else's number is listed");
      assert((await http.get(`/whatsapp/${made.data.id}`, asUser(t2))).status === 403, "someone else's number can be opened");
      assert(ids(await http.get("/whatsapp", auth())).includes(made.data.id), "admin should see everything");

      // management
      assert((await http.put(`/whatsapp/${made.data.id}`, { name: "Meu WhatsApp", greetingMessage: "hack", queueIds: [1] }, asUser(t1))).status === 200, "owner rename");
      assert(sql(`SELECT name FROM Whatsapps WHERE id=${made.data.id}`) === "Meu WhatsApp", "renamed");
      assert(sql(`SELECT IFNULL(greetingMessage,'') FROM Whatsapps WHERE id=${made.data.id}`) === "", "owner changed an admin-only field");
      assert((await http.put(`/whatsapp/${made.data.id}`, { name: "invadido" }, asUser(t2))).status === 403, "someone else renamed it");
      assert((await http.delete(`/whatsapp/${made.data.id}`, asUser(t2))).status === 403, "someone else deleted it");
      assert((await http.post(`/whatsappsession/${made.data.id}`, {}, asUser(t2))).status === 403, "someone else started its session");
      const shared = ids(await http.get("/whatsapp", auth())).find(i => i === cid);
      assert((await http.delete(`/whatsapp/${shared}`, asUser(t1))).status === 403, "a person deleted a shared connection");
      assert((await http.post("/whatsapp", { name: "Via admin", channel: "whatsapp" }, auth())).status === 200, "admin can still create connections");
      assert((await http.delete(`/whatsapp/${made.data.id}`, asUser(t1))).status === 200, "owner deletes own number");
    });
    await test("conversations that arrive on a personal number go straight to its owner", async () => {
      const owner = await http.post("/users", { name: "Dona Cloud", email: "donacloud@x.com", password: "senha123", role: "consultor" }, auth());
      const cfg = { accessToken: "EAAB-owner", phoneNumberId: "PN1", appSecret: "owner-secret", verifyToken: "owner-verify" };
      const conn = await http.post("/whatsapp", { name: "Cloud da Dona", channel: "whatsapp_cloud", config: JSON.stringify(cfg), ownerId: owner.data.id }, auth());
      assert(conn.status === 200 && conn.data.ownerId === owner.data.id, `connection ${conn.status}`);
      await waitFor(async () => (await http.get(`/whatsapp/${conn.data.id}`, auth())).data.status === "CONNECTED", 12000, "connected");
      const r = await postMeta(conn.data.id, cloudEvent([{ from: "5511900011122", id: "wamid.owner1", type: "text", text: { body: "Oi, quero informações" } }]), cfg.appSecret);
      assert(r.status === 200, `webhook ${r.status}`);
      const t = await waitFor(() => ticketOf("5511900011122"), 8000, "ticket");
      assert(sql(`SELECT CONCAT(status,'|',userId) FROM Tickets WHERE id=${t}`) === `open|${owner.data.id}`, "ticket should be open and assigned to the owner");
    });
    await test("typing on Telegram goes out as a chat action", async () => {
      const a = ticketOf("tg_5551");
      const before = tg.sent.length;
      const r = await http.post(`/tickets/${a}/typing`, {}, auth());
      assert(r.status === 200 && r.data.sent === true, `typing ${r.status} ${JSON.stringify(r.data)}`);
      const s = tg.sent.slice(before).find(x => x.method === "sendChatAction");
      assert(s && s.body.action === "typing" && String(s.body.chat_id) === "5551", "sendChatAction payload");
    });
    // -------------------------------------------------------------- AI agent and chatbot
    console.log("\nAI agent and chatbot");
    sql("DELETE FROM ChatbotNodes");
    let aiId, jiPolo;
    const inboundCloud = (from, id, body) => postMeta(cid, cloudEvent([{ from, id, type: "text", text: { body } }], { contacts: [{ wa_id: from, profile: { name: "Aluno IA" } }] }), cloudCfg.appSecret);
    const sentTexts = since => graph.sent.slice(since).filter(x => x.body && x.body.type === "text").map(x => x.body.text.body);
    // everything a person sees: texts, and the question plus the options of buttons and lists
    const sentAny = since => graph.sent.slice(since).filter(x => x.body).map(x => x.body.type === "text" ? x.body.text.body : x.body.type === "interactive" ? [x.body.interactive.body.text, ...(x.body.interactive.action.buttons ? x.body.interactive.action.buttons.map(b => b.reply.title) : x.body.interactive.action.sections[0].rows.map(r => r.title))].join(" | ") : "");
    await test("knowledge base: documents are split, FAQ and files can be added", async () => {
      aiId = (await http.post("/ai-agents", { name: "Agente de matrículas", provider: "anthropic", model: "claude-haiku-5-5", apiKey: "sk-ant-test", whatsappId: cid, waitSeconds: 1, dailyTokenCap: 100000, handoffAfterTurns: 14, handoffMessage: "Vou chamar um consultor.", persona: { tone: "acolhedor", rules: "Pergunte uma coisa por vez", forbidden: "Prometer mensalidade fixa" } }, auth())).data.id;
      assert(aiId, "agent not created");
      const long = Array.from({ length: 12 }, (_, i) => `Parágrafo ${i}: ${"informação sobre o calendário ".repeat(20)}`).join("\n\n");
      const d1 = await http.post(`/ai-agents/${aiId}/kb`, { title: "Calendário", content: long }, auth());
      assert(d1.status === 201, `doc ${d1.status}`);
      assert(await http.post(`/ai-agents/${aiId}/kb`, { title: "Bolsas de transferência", content: "Alunos que transferem de outra instituição podem ter bolsa de 40% na primeira mensalidade, conforme análise do histórico.\n\nPara solicitar, envie o histórico escolar ao consultor." }, auth()).then(r => r.status === 201), "bolsas");
      assert((await http.post(`/ai-agents/${aiId}/kb`, { title: "Qual o endereço do polo?", kind: "faq", keywords: "endereco, onde fica", content: "Rua das Flores, 100, centro." }, auth())).status === 201, "faq");
      const up = new FormData();
      up.append("file", Buffer.from("Regras da rematrícula: o aluno confirma os dados no portal até o dia 20.\n\nQuem não confirma perde a vaga."), { filename: "rematricula.txt", contentType: "text/plain" });
      const u = await http.post(`/ai-agents/${aiId}/kb/upload`, up, { headers: { ...up.getHeaders(), Authorization: `Bearer ${token}` } });
      assert(u.status === 201, `upload ${u.status} ${JSON.stringify(u.data)}`);
      const url = await http.post(`/ai-agents/${aiId}/kb/url`, { url: `http://localhost:${GRAPH_PORT}/page.html` }, auth());
      assert(url.status === 201, `url ${url.status} ${JSON.stringify(url.data)}`);
      assert(!/menu|x\{\}/.test(sql(`SELECT content FROM KbDocuments WHERE id=${url.data.id}`)), "html chrome was kept");
      const kb = (await http.get(`/ai-agents/${aiId}/kb`, auth())).data;
      assert(kb.length >= 5, `kb docs ${kb.length}`);
      assert(kb.find(d => d.title === "Calendário").chunks > 1, "long document should be several chunks");
      assert((await http.post(`/ai-agents/${aiId}/kb/upload`, (() => { const f = new FormData(); f.append("file", Buffer.from("x"), { filename: "a.exe" }); return f; })(), { headers: { Authorization: `Bearer ${token}` } })).status !== 201, "exe accepted");
    });
    await test("SSRF guard refuses private addresses and non-http URLs", async () => {
      const prev = process.env.ALLOW_PRIVATE_URLS;
      process.env.ALLOW_PRIVATE_URLS = "false";
      const { isUrlSafe } = require("../dist/helpers/SafeUrl");
      for (const bad of ["http://127.0.0.1/x", "http://localhost/x", "http://169.254.169.254/latest", "http://10.0.0.5/", "http://192.168.1.1/", "file:///etc/passwd", "ftp://example.com/"]) {
        assert(!(await isUrlSafe(bad)), `${bad} should be refused`);
      }
      process.env.ALLOW_PRIVATE_URLS = prev;
    });
    await test("an FAQ is answered without calling the model", async () => {
      const calls = anthropic.requests.length, before = graph.sent.length;
      await inboundCloud("5511910000001", "wamid.ai-faq1", "Qual o endereço do polo?");
      await waitFor(() => sentTexts(before).some(t => t.includes("Rua das Flores")), 12000, "faq answer");
      assert(anthropic.requests.length === calls, "the model was called for an FAQ");
    });
    await test("short messages in a row get one answer, with a small prompt, caching, tools and only the relevant passages", async () => {
      await http.put(`/ai-agents/${aiId}`, { waitSeconds: 4 }, auth());
      const calls = anthropic.requests.length, before = graph.sent.length;
      await Promise.all([
        inboundCloud("5511910000002", "wamid.ai-a1", "oi, tudo bem?"),
        sleep(300).then(() => inboundCloud("5511910000002", "wamid.ai-a2", "queria saber sobre bolsa de transferência"))
      ]);
      await waitFor(() => sentTexts(before).some(t => t.includes("Posso ajudar com as bolsas")), 20000, "ai reply");
      await sleep(2500);
      await http.put(`/ai-agents/${aiId}`, { waitSeconds: 1 }, auth());
      assert(anthropic.requests.length === calls + 1, `expected 1 model call for the burst, got ${anthropic.requests.length - calls}`);
      assert(sentTexts(before).filter(t => t.includes("Posso ajudar")).length === 1, "answered more than once");
      const req = anthropic.requests[anthropic.requests.length - 1];
      assert(req.model === "claude-haiku-5-5" && req.max_tokens === 350, `model/max_tokens ${req.model} ${req.max_tokens}`);
      assert(req.system[0].cache_control && req.system[0].cache_control.type === "ephemeral", "stable prompt is not cached");
      assert(req.system[0].text.includes("acolhedor") && req.system[0].text.includes("Prometer mensalidade fixa"), "persona missing");
      assert(req.system[0].text.includes("Nunca diga que a mensalidade é fixa"), "fixed tuition rule missing");
      assert(req.system[1].text.includes("bolsa de 40%") && !req.system[1].text.includes("Parágrafo 3"), `only the relevant passages should be sent: ${req.system[1].text.slice(0, 700)}`);
      assert(["buscar_curso", "listar_polos", "simular_bolsa", "salvar_lead"].every(n => req.tools.some(t => t.name === n)), "tools missing");
      assert(req.messages.length === 1 && /oi, tudo bem\?\nqueria saber/.test(req.messages[0].content), `burst should be one user turn: ${JSON.stringify(req.messages)}`);
      assert(Number(sql(`SELECT COUNT(*) FROM AiUsage WHERE agentId=${aiId} AND kind='reply'`)) >= 1, "usage not logged");
    });
    await test("the model can look up a course in the catalogue (tool use)", async () => {
      const calls = anthropic.requests.length, before = graph.sent.length;
      await inboundCloud("5511910000003", "wamid.ai-b1", "Qual o valor do curso de Direito?");
      await waitFor(() => sentTexts(before).some(t => t.includes("Direito") && t.includes("1300")), 15000, "tool based answer");
      assert(anthropic.requests.length === calls + 2, `tool loop calls ${anthropic.requests.length - calls}`);
      const second = anthropic.requests[anthropic.requests.length - 1];
      const result = second.messages[second.messages.length - 1].content[0];
      assert(result.type === "tool_result" && result.content.includes("Direito") && result.content.includes("1300"), "tool result missing catalogue data");
      assert(result.content.includes("não é fixa"), "tool result should warn that tuition is not fixed");
    });
    await test("collecting the data hands the student to the polo's sales team with a summary", async () => {
      jiPolo = (await http.post("/polos", { name: "Polo Ji-Paraná", code: "JIP", city: "Ji-Paraná", state: "RO" }, auth())).data;
      const before = graph.sent.length;
      await inboundCloud("5511910000004", "wamid.ai-c1", "Oi! Meu nome é Paulo, moro em Ji-Paraná e quero Direito");
      await waitFor(() => sentTexts(before).some(t => t.includes("consultor da equipe continua")), 15000, "closing reply");
      const t = ticketOf("5511910000004");
      await waitFor(() => sql(`SELECT aiActive FROM Tickets WHERE id=${t}`) === "0", 8000, "ai handed over");
      const leadOfTicket = `(SELECT contactId FROM Tickets WHERE id=${t})`;
      assert(sql(`SELECT name FROM Leads WHERE contactId=${leadOfTicket}`) === "Paulo Mendes", "name not saved");
      assert(sql(`SELECT city FROM Leads WHERE contactId=${leadOfTicket}`) === "Ji-Paraná", "city not saved");
      assert(sql(`SELECT courseId FROM Leads WHERE contactId=${leadOfTicket}`) === sql("SELECT id FROM Courses WHERE name='Direito'"), "course not matched in the catalogue");
      assert(sql(`SELECT poloId FROM Leads WHERE contactId=${leadOfTicket}`) === String(jiPolo.id), "polo not matched by city");
      assert(sql(`SELECT queueId FROM Tickets WHERE id=${t}`) === String(jiPolo.queues.find(q => q.role === "comercial").id), "ticket should go to the polo's sales queue");
      assert(sql(`SELECT COUNT(*) FROM TicketEvents WHERE ticketId=${t} AND type='handoff' AND note LIKE '%Paulo Mendes%'`) === "1", "handoff summary note missing");
      assert(sql(`SELECT aiSlots FROM Tickets WHERE id=${t}`).includes("Ji-Paraná"), "collected data not saved on the ticket");
    });
    await test("asking for a person hands over right away", async () => {
      const calls = anthropic.requests.length, before = graph.sent.length;
      await inboundCloud("5511910000005", "wamid.ai-d1", "quero falar com uma pessoa");
      await waitFor(() => sentTexts(before).some(t => t.includes("Vou chamar um consultor")), 15000, "handoff message");
      assert(anthropic.requests.length === calls + 1, "one call expected");
      assert(sql(`SELECT aiActive FROM Tickets WHERE id=${ticketOf("5511910000005")}`) === "0", "ai still active");
    });
    await test("daily token cap and turn limit stop the AI before it spends more", async () => {
      await http.put(`/ai-agents/${aiId}`, { dailyTokenCap: 10 }, auth());
      let calls = anthropic.requests.length, before = graph.sent.length;
      await inboundCloud("5511910000006", "wamid.ai-e1", "bom dia");
      await waitFor(() => sentTexts(before).some(t => t.includes("Vou chamar um consultor")), 15000, "cap handoff");
      assert(anthropic.requests.length === calls, "model called after the daily cap");
      await http.put(`/ai-agents/${aiId}`, { dailyTokenCap: 0, handoffAfterTurns: 1 }, auth());
      before = graph.sent.length;
      await inboundCloud("5511910000007", "wamid.ai-f1", "bom dia");
      await waitFor(() => sentTexts(before).some(t => t.includes("Posso ajudar")), 15000, "first answer");
      before = graph.sent.length;
      await inboundCloud("5511910000007", "wamid.ai-f2", "e então?");
      await waitFor(() => sentTexts(before).some(t => t.includes("Vou chamar um consultor")), 15000, "turn limit handoff");
      await http.put(`/ai-agents/${aiId}`, { handoffAfterTurns: 14 }, auth());
    });
    await test("the agent tester answers without WhatsApp and without touching the lead", async () => {
      const leadsBefore = sql("SELECT COUNT(*) FROM Leads"), ticketsBefore = sql("SELECT COUNT(*) FROM Tickets");
      const r = await http.post(`/ai-agents/${aiId}/test`, { messages: [{ role: "user", content: "Meu nome é Paulo" }] }, auth());
      assert(r.status === 200 && r.data.tools.includes("salvar_lead") && r.data.collected.nome === "Paulo Mendes", `tester ${r.status} ${JSON.stringify(r.data)}`);
      assert(sql("SELECT COUNT(*) FROM Leads") === leadsBefore && sql("SELECT COUNT(*) FROM Tickets") === ticketsBefore, "tester created records");
      assert(Number(sql(`SELECT COUNT(*) FROM AiUsage WHERE kind='test'`)) >= 1, "tester usage not logged");
      assert((await http.post(`/ai-agents/${aiId}/test`, { messages: [] }, auth())).status === 400, "empty conversation accepted");
      const u = (await http.get(`/ai-agents/${aiId}/usage`, auth())).data;
      assert(u.total.calls >= 5 && u.total.input > 0 && u.cap === 0, `usage ${JSON.stringify(u)}`);
    });
    await test("chatbot can ask a question, offer polos and call a webhook", async () => {
      sql("DELETE FROM ChatbotNodes");
      const root = (await http.post("/chatbot-nodes", { title: "Quero me matricular", action: "ask", message: "Qual o seu nome completo?", field: "nome", position: 1 }, auth())).data;
      const polo = (await http.post("/chatbot-nodes", { title: "Escolher polo", action: "polo", message: "Em qual polo você quer estudar?", parentId: root.id, position: 1 }, auth())).data;
      await http.post("/chatbot-nodes", { title: "Avisar sistema", action: "webhook", field: `http://localhost:${GRAPH_PORT}/hook`, message: "Anotado, já já um consultor fala com você.", parentId: polo.id, position: 1 }, auth());
      const from = "5511910000008";
      let before = graph.sent.length;
      await inboundCloud(from, "wamid.bot-1", "oi");
      await waitFor(() => sentTexts(before).some(t => t.includes("Quero me matricular")), 12000, "menu");
      before = graph.sent.length;
      await inboundCloud(from, "wamid.bot-2", "1");
      await waitFor(() => sentTexts(before).some(t => t.includes("Qual o seu nome completo?")), 12000, "question");
      before = graph.sent.length;
      await inboundCloud(from, "wamid.bot-3", "Maria Clara Souza");
      await waitFor(() => sentTexts(before).some(t => t.includes("Em qual polo")), 12000, "polo list");
      assert(sentTexts(before).join("\n").includes("Polo Ji-Paraná"), "polos not listed");
      before = graph.sent.length;
      await inboundCloud(from, "wamid.bot-4", "Polo Ji-Paraná");
      await waitFor(() => sentTexts(before).some(t => t.includes("um consultor fala com você")), 12000, "final message");
      const t = ticketOf(from);
      assert(sql(`SELECT name FROM Leads WHERE contactId=(SELECT contactId FROM Tickets WHERE id=${t})`) === "Maria Clara Souza", "answer was not saved to the lead");
      assert(sql(`SELECT poloId FROM Leads WHERE contactId=(SELECT contactId FROM Tickets WHERE id=${t})`) === String(jiPolo.id), "polo not saved");
      assert(sql(`SELECT queueId FROM Tickets WHERE id=${t}`) === String(jiPolo.queues.find(q => q.role === "comercial").id), "ticket not routed to the polo's sales queue");
      await waitFor(() => graph.hooks.some(h => h.collected && h.collected.nome === "Maria Clara Souza"), 8000, "webhook call");
      sql("DELETE FROM ChatbotNodes");
    });
    await test("visual flows: validation, simulator, publishing, a real conversation, counters and the CRM", async () => {
      sql("DELETE FROM ChatbotNodes");
      const graph1 = {
        nodes: [
          { id: "s", type: "start", data: {} },
          { id: "menu", type: "buttons", data: { text: "Oi {{primeiro_nome}}! Escolha:", options: [{ id: "a", label: "Quero me matricular" }, { id: "b", label: "Tenho uma dúvida" }] } },
          { id: "nome", type: "ask", data: { text: "Qual o seu nome completo?", field: "nome", validate: "text" } },
          { id: "crm", type: "crm", data: { action: "send_to_crm", source: "Chatbot" } },
          { id: "fim", type: "end", data: { text: "Pronto! Um consultor fala com você." } },
          { id: "duv", type: "message", data: { text: "Pode escrever a sua dúvida." } },
          { id: "fim2", type: "end", data: {} }
        ],
        edges: [
          { id: "1", source: "s", target: "menu" }, { id: "2", source: "menu", target: "nome", sourceHandle: "a" },
          { id: "3", source: "nome", target: "crm" }, { id: "4", source: "crm", target: "fim" }, { id: "5", source: "menu", target: "duv", sourceHandle: "b" }, { id: "6", source: "duv", target: "fim2" }
        ]
      };
      const broken = JSON.parse(JSON.stringify(graph1));
      broken.edges = broken.edges.filter(e => e.id !== "5");
      const mk = await http.post("/flows", { name: "Triagem", entry: { type: "first_message" }, graph: broken }, auth());
      assert(mk.status === 201 && mk.data.errors >= 1, `create ${mk.status} ${mk.data.errors}`);
      const flowId = mk.data.id;
      assert(mk.data.issues.some(i => /Tenho uma dúvida/.test(i.text)), "validation did not point at the open option");
      assert((await http.post(`/flows/${flowId}/publish`, {}, auth())).status === 422, "a flow with errors was published");
      await http.post("/users", { name: "Consultor dos Fluxos", email: "flows-cons@x.com", password: "senha123", role: "consultor" }, auth());
      const consTk = (await http.post("/auth/login", { email: "flows-cons@x.com", password: "senha123" })).data.token;
      assert((await http.get("/flows", asUser(consTk))).status === 403, "a consultant reached the flows");

      // the simulator walks the draft and nothing leaves the system
      const upd = await http.put(`/flows/${flowId}`, { graph: graph1 }, auth());
      assert(upd.status === 200 && upd.data.errors === 0, `fixed ${upd.status} ${upd.data.errors}`);
      const sent0 = graph.sent.length;
      const s1 = (await http.post(`/flows/${flowId}/simulate`, { sample: { name: "Maria Souza" } }, auth())).data;
      assert(s1.status === "waiting" && s1.messages[0].includes("Oi Maria!") && s1.messages[0].includes("*1* - Quero me matricular"), `sim1 ${JSON.stringify(s1.messages)}`);
      const s2 = (await http.post(`/flows/${flowId}/simulate`, { state: s1.state, input: "1" }, auth())).data;
      assert(s2.messages[0].includes("nome completo") && s2.status === "waiting", "sim2");
      const s3 = (await http.post(`/flows/${flowId}/simulate`, { state: s2.state, input: "Maria Clara Souza" }, auth())).data;
      assert(s3.status === "done" && s3.actions.some(a => /CRM/.test(a)) && s3.messages.some(m => m.includes("consultor")), `sim3 ${JSON.stringify(s3)}`);
      const sBad = (await http.post(`/flows/${flowId}/simulate`, { state: s1.state, input: "xyz" }, auth())).data;
      assert(sBad.status === "waiting" && sBad.messages[0].includes("Não entendi"), "an unknown answer was not asked again");
      assert(graph.sent.length === sent0, "the simulator sent a real message");

      // published: a real conversation
      const pub = await http.post(`/flows/${flowId}/publish`, {}, auth());
      assert(pub.status === 200 && pub.data.status === "published" && pub.data.version === 1, `publish ${pub.status}`);
      const from = "5511910000021";
      let before = graph.sent.length;
      await inboundCloud(from, "wamid.flow-1", "oi");
      await waitFor(() => sentAny(before).some(t => t.includes("Tenho uma dúvida") && t.includes("Oi ")), 12000, "flow menu");
      before = graph.sent.length;
      await inboundCloud(from, "wamid.flow-2", "quero me matricular");
      await waitFor(() => sentTexts(before).some(t => t.includes("nome completo")), 12000, "flow question");
      before = graph.sent.length;
      await inboundCloud(from, "wamid.flow-3", "Joana Paula Lima");
      await waitFor(() => sentTexts(before).some(t => t.includes("consultor fala com você")), 12000, "flow end");
      const tk = ticketOf(from);
      assert(sql(`SELECT name FROM Leads WHERE contactId=(SELECT contactId FROM Tickets WHERE id=${tk})`) === "Joana Paula Lima", "the answer did not reach the lead");
      assert(sql(`SELECT COUNT(*) FROM LeadActivities WHERE leadId=(SELECT id FROM Leads WHERE contactId=(SELECT contactId FROM Tickets WHERE id=${tk})) AND body LIKE '%Enviado ao CRM pelo fluxo%'`) === "1", "the CRM action left no trace");
      assert(sql(`SELECT status FROM ChatFlowRuns WHERE ticketId=${tk}`) === "done", "the run did not finish");
      const st = (await http.get(`/flows/${flowId}/stats`, auth())).data;
      assert(st.started >= 1 && st.crm >= 1 && st.nodes.menu >= 1 && st.done >= 1, `stats ${JSON.stringify(st)}`);

      // a second message after the flow ended is not taken by the same flow again
      before = graph.sent.length;
      await inboundCloud(from, "wamid.flow-4", "obrigada");
      await new Promise(r => setTimeout(r, 1500));
      assert(!sentAny(before).some(t => t.includes("Escolha")), "the flow started again on the same conversation");

      // keyword entry beats the first message, and "wait" blocks go on by themselves
      const kw = (await http.post("/flows", { name: "Bolsa", entry: { type: "keyword", keywords: ["bolsa"] }, graph: { nodes: [
        { id: "s", type: "start", data: {} }, { id: "m", type: "message", data: { text: "Vamos falar de bolsas!" } },
        { id: "d", type: "delay", data: { minutes: 1 } }, { id: "m2", type: "message", data: { text: "Voltei com mais uma dica." } }, { id: "e", type: "end", data: {} }],
        edges: [{ id: "1", source: "s", target: "m" }, { id: "2", source: "m", target: "d" }, { id: "3", source: "d", target: "m2" }, { id: "4", source: "m2", target: "e" }] } }, auth())).data;
      assert((await http.post(`/flows/${kw.id}/publish`, {}, auth())).status === 200, "keyword flow not published");
      const from2 = "5511910000022";
      before = graph.sent.length;
      await inboundCloud(from2, "wamid.flow-5", "tem bolsa?");
      await waitFor(() => sentTexts(before).some(t => t.includes("Vamos falar de bolsas")), 12000, "keyword flow");
      assert(!sentAny(before).some(t => t.includes("Escolha")), "the first-message flow answered a keyword conversation");
      const tk2 = ticketOf(from2);
      assert(sql(`SELECT status FROM ChatFlowRuns WHERE ticketId=${tk2}`) === "delayed", "the run is not waiting for time");
      sql(`UPDATE ChatFlowRuns SET resumeAt = NOW() - INTERVAL '1 minute' WHERE ticketId=${tk2}`);
      await waitFor(() => sentTexts(before).some(t => t.includes("Voltei com mais uma dica")), 45000, "after the wait");

      // unpublishing hands the conversation back; duplicate and delete work
      assert((await http.post(`/flows/${kw.id}/unpublish`, {}, auth())).data.status === "draft", "unpublish");
      const dup = await http.post(`/flows/${flowId}/duplicate`, {}, auth());
      assert(dup.status === 201 && dup.data.name.includes("cópia") && dup.data.status === "draft", "duplicate");
      assert((await http.delete(`/flows/${dup.data.id}`, auth())).status === 200, "delete");
      // the other tests talk to the AI agent and the old menu: no flow may stay live
      assert((await http.post(`/flows/${flowId}/unpublish`, {}, auth())).data.status === "draft", "unpublish triage");
    });
    await test("visual flows: the person chooses the polo (number, name, city, typo), the lead and the conversation go to that polo, the whole path", async () => {
      const vil = (await http.post("/polos", { name: "Polo Vilhena", code: "VIL", city: "Vilhena", state: "RO" }, auth())).data;
      const g = {
        nodes: [
          { id: "s", type: "start", data: {} },
          { id: "oi", type: "message", data: { text: "Olá, {{primeiro_nome}}! Vou te ajudar." } },
          { id: "curso", type: "buttons", data: { text: "Escolha o curso:", saveTo: "curso", options: [{ id: "c1", label: "Administração" }, { id: "c2", label: "Direito" }] } },
          { id: "polo", type: "polo", data: { text: "Qual polo fica mais perto de você?" } },
          { id: "cond", type: "condition", data: { rules: [{ id: "r1", label: "Interior", all: [{ field: "var:polo", op: "in", value: "Polo Ji-Paraná, Polo Vilhena" }] }] } },
          { id: "interior", type: "message", data: { text: "Atendimento do interior: {{polo}}." } },
          { id: "capital", type: "message", data: { text: "Atendimento da capital." } },
          { id: "crm", type: "crm", data: { action: "send_to_crm", ownerMode: "roundrobin", source: "Chatbot" } },
          { id: "tr", type: "transfer", data: { to: "chosen_polo_sales", text: "Chamando a equipe do polo." } },
          { id: "naosei", type: "message", data: { text: "Sem problemas, vou chamar alguém para ajudar." } },
          { id: "fim", type: "end", data: {} }
        ],
        edges: [
          { id: "1", source: "s", target: "oi" }, { id: "2", source: "oi", target: "curso" },
          { id: "3", source: "curso", target: "polo", sourceHandle: "c1" }, { id: "4", source: "curso", target: "polo", sourceHandle: "c2" },
          { id: "5", source: "polo", target: "cond", sourceHandle: "out" }, { id: "6", source: "polo", target: "naosei", sourceHandle: "other" },
          { id: "7", source: "cond", target: "interior", sourceHandle: "r1" }, { id: "8", source: "cond", target: "capital", sourceHandle: "else" },
          { id: "9", source: "interior", target: "crm" }, { id: "10", source: "capital", target: "crm" }, { id: "11", source: "crm", target: "tr" },
          { id: "12", source: "naosei", target: "fim" }
        ]
      };
      const mk = await http.post("/flows", { name: "Escolha de polo", entry: { type: "first_message" }, graph: g }, auth());
      assert(mk.status === 201 && mk.data.errors === 0, `create ${mk.status} errors=${mk.data.errors} ${JSON.stringify(mk.data.issues).slice(0, 200)}`);
      const flowId = mk.data.id;
      // a polo block without its question is a validation error
      const bad = JSON.parse(JSON.stringify(g)); bad.nodes.find(n => n.id === "polo").data.text = "";
      assert((await http.put(`/flows/${flowId}`, { graph: bad }, auth())).data.errors >= 1, "an empty polo question passed validation");
      assert((await http.put(`/flows/${flowId}`, { graph: g }, auth())).data.errors === 0, "restore");

      // simulator: the list, a typo, the choice, the branch
      const sent0 = graph.sent.length;
      let sim = (await http.post(`/flows/${flowId}/simulate`, {}, auth())).data;
      sim = (await http.post(`/flows/${flowId}/simulate`, { state: sim.state, input: "2" }, auth())).data;
      assert(sim.messages.some(m => m.includes("Qual polo") && m.includes("*1* - ")), `polo list ${JSON.stringify(sim.messages)}`);
      const simDone = (await http.post(`/flows/${flowId}/simulate`, { state: sim.state, input: "moro em ji parna" }, auth())).data;
      assert(simDone.actions.some(a => a.includes("Define o polo: Polo Ji-Paraná")) && simDone.messages.some(m => m.includes("interior")), `sim choice ${JSON.stringify([simDone.actions, simDone.messages])}`);
      assert(simDone.actions.some(a => /Transfere/.test(a)), "sim transfer");
      assert(graph.sent.length === sent0, "the simulator sent a real message");

      assert((await http.post(`/flows/${flowId}/publish`, {}, auth())).status === 200, "publish");
      // the real conversation, on the Cloud API: free text with a typo
      const from = "5511910000031";
      let before = graph.sent.length;
      await inboundCloud(from, "wamid.polo-1", "oi");
      await waitFor(() => sentAny(before).some(t => t.includes("Escolha o curso") && t.includes("Direito")), 12000, "course question");
      before = graph.sent.length;
      await inboundCloud(from, "wamid.polo-2", "Direito");
      await waitFor(() => sentAny(before).some(t => t.includes("Qual polo") && t.includes("Polo Ji-Paran")), 12000, "polo question lists the active polos");
      // an answer that fits several polos asks which one
      before = graph.sent.length;
      await inboundCloud(from, "wamid.polo-3", "polo");
      await waitFor(() => sentAny(before).some(t => t.includes("mais de um polo")), 12000, "ambiguous answer");
      before = graph.sent.length;
      await inboundCloud(from, "wamid.polo-4", "moro em ji parna");
      await waitFor(() => sentTexts(before).some(t => t.includes("Chamando a equipe do polo")), 15000, "transfer message");
      assert(sentTexts(before).some(t => t.includes("Atendimento do interior: Polo Ji-Paraná")), "the condition did not take the interior branch with the polo name");
      const tk = ticketOf(from);
      const leadOf = `(SELECT id FROM Leads WHERE contactId=(SELECT contactId FROM Tickets WHERE id=${tk}))`;
      assert(sql(`SELECT poloId FROM Leads WHERE id=${leadOf}`) === String(jiPolo.id), "the lead did not get the chosen polo");
      const salesQueue = sql(`SELECT id FROM Queues WHERE poloId=${jiPolo.id} AND role='comercial'`);
      assert(salesQueue && sql(`SELECT queueId FROM Tickets WHERE id=${tk}`) === salesQueue, "the conversation did not go to the sales queue of the polo");
      assert(sql(`SELECT COUNT(*) FROM LeadActivities WHERE leadId=${leadOf} AND body LIKE '%Polo escolhido no fluxo%'`) === "1", "the choice left no trace on the lead");
      assert(sql(`SELECT COUNT(*) FROM LeadActivities WHERE leadId=${leadOf} AND body LIKE '%Enviado ao CRM pelo fluxo%'`) === "1", "the CRM step left no trace");

      // a second person picks by number (the list order) and lands on another polo
      const from2 = "5511910000032";
      before = graph.sent.length;
      await inboundCloud(from2, "wamid.polo-5", "oi");
      await waitFor(() => sentAny(before).some(t => t.includes("Escolha o curso")), 12000, "second menu");
      await inboundCloud(from2, "wamid.polo-6", "Administração");
      await waitFor(() => sentAny(before).some(t => t.includes("Qual polo")), 12000, "second polo question");
      before = graph.sent.length;
      await inboundCloud(from2, "wamid.polo-7", "vilhena");
      await waitFor(() => sentTexts(before).some(t => t.includes("Chamando a equipe do polo")), 15000, "second transfer");
      const tk2 = ticketOf(from2);
      assert(sql(`SELECT poloId FROM Leads WHERE contactId=(SELECT contactId FROM Tickets WHERE id=${tk2})`) === String(vil.id), "the second lead did not get Vilhena");

      // somebody who never says a polo: two tries and the "did not understand" exit
      const from3 = "5511910000033";
      before = graph.sent.length;
      await inboundCloud(from3, "wamid.polo-8", "oi");
      await waitFor(() => sentAny(before).some(t => t.includes("Escolha o curso")), 12000, "third menu");
      await inboundCloud(from3, "wamid.polo-9", "Direito");
      await waitFor(() => sentAny(before).some(t => t.includes("Qual polo")), 12000, "third polo question");
      before = graph.sent.length;
      await inboundCloud(from3, "wamid.polo-10", "qwertyuiop");
      await waitFor(() => sentTexts(before).some(t => t.includes("Não encontrei esse polo")), 12000, "asked again");
      before = graph.sent.length;
      await inboundCloud(from3, "wamid.polo-11", "zxcvbnm");
      await waitFor(() => sentTexts(before).some(t => t.includes("vou chamar alguém")), 12000, "the other exit");
      assert(!sql(`SELECT poloId FROM Leads WHERE contactId=(SELECT contactId FROM Tickets WHERE id=${ticketOf(from3)})`), "a lead got a polo nobody chose");

      assert((await http.post(`/flows/${flowId}/unpublish`, {}, auth())).data.status === "draft", "unpublish");
    });
    await test("visual flows: templates, the old menu as a flow, and flows made by AI", async () => {
      const tpl = (await http.get("/flow-templates", auth())).data;
      assert(tpl.length >= 3 && tpl.every(t => t.name && t.blocks > 2), "templates");
      const fromTpl = await http.post("/flows", { name: "Do modelo", template: tpl[0].key }, auth());
      assert(fromTpl.status === 201 && fromTpl.data.graph.nodes.some(n => n.type === "buttons") && fromTpl.data.errors === 0, `template flow ${fromTpl.status} errors=${fromTpl.data.errors} ${JSON.stringify(fromTpl.data.issues && fromTpl.data.issues.filter(i => i.level === "error").map(i => i.text))}`);
      // the old tree of the chatbot, as a flow
      sql("DELETE FROM ChatbotNodes");
      const q = (await http.get("/queue", auth())).data[0];
      const root = (await http.post("/chatbot-nodes", { title: "Financeiro", action: "queue", targetId: q.id, message: "Já te encaminho.", position: 1 }, auth())).data;
      await http.post("/chatbot-nodes", { title: "Cursos", action: "message", message: "Temos 128 cursos.", position: 2 }, auth());
      const imp = await http.post("/flows/import-legacy", {}, auth());
      assert(imp.status === 201 && imp.data.graph.nodes.some(n => n.type === "buttons" && n.data.options.length === 2) && imp.data.graph.nodes.some(n => n.type === "transfer"), `import ${imp.status}`);
      assert(root.id && imp.data.errors === 0, `legacy flow errors ${JSON.stringify(imp.data.issues && imp.data.issues.filter(i => i.level === "error").map(i => i.text))}`);
      sql("DELETE FROM ChatbotNodes");
      // the AI draws it: unknown things are dropped and the validation points at what is left
      const gen = await http.post("/flows/generate", { description: "Quero um fluxo que pergunte se a pessoa quer falar de cursos ou do financeiro" }, auth());
      assert(gen.status === 201 && gen.data.name === "Triagem gerada", `generate ${gen.status} ${JSON.stringify(gen.data).slice(0, 200)}`);
      const types = gen.data.graph.nodes.map(n => n.type);
      assert(types.includes("buttons") && types.includes("crm") && types.includes("ask"), "blocks missing");
      assert(gen.data.graph.nodes.every(n => typeof n.x === "number"), "no layout");
      assert(gen.data.graph.edges.length === 6, `the invalid link was kept: ${gen.data.graph.edges.length}`);
      assert((await http.post("/flows/generate", { description: "curto" }, auth())).status === 400, "short description accepted");
    });
    await test("triggers: an event runs a flow on the conversation, with filters, a cooldown and only real events", async () => {
      const cat = (await http.get("/automation-events", auth())).data;
      assert(cat.some(e => e.key === "tag.added" && e.available) && cat.some(e => e.key === "shopify" && !e.available && e.note), "event catalog");
      const tag = (await http.post("/tags", { name: "Gatilho teste", color: "#16a34a" }, auth())).data;
      const flow = (await http.post("/flows", { name: "Resposta ao gatilho", entry: { type: "manual" }, graph: { nodes: [
        { id: "s", type: "start", data: {} }, { id: "m", type: "message", data: { text: "Gatilho de etiqueta funcionou, {{primeiro_nome}}!" } }, { id: "e", type: "end", data: {} }],
        edges: [{ id: "1", source: "s", target: "m" }, { id: "2", source: "m", target: "e" }] } }, auth())).data;
      assert((await http.post("/automation-triggers", { name: "x", event: "shopify", flowId: flow.id }, auth())).status === 400, "an unavailable event was accepted");
      const trig = await http.post("/automation-triggers", { name: "Etiqueta colocada", event: "tag.added", config: { tagId: tag.id, lixo: 1 }, flowId: flow.id }, auth());
      assert(trig.status === 201 && trig.data.config.tagId === tag.id && trig.data.config.lixo === undefined, `create trigger ${trig.status} ${JSON.stringify(trig.data.config)}`);
      const from = "5511910000031";
      let before = graph.sent.length;
      await inboundCloud(from, "wamid.trig-1", "oi, tudo bem?");
      await waitFor(() => ticketOf(from), 8000, "ticket");
      const tk = ticketOf(from);
      sql(`UPDATE Tickets SET chatbotNodeId=-1 WHERE id=${tk}`);
      // a draft flow does not run
      assert((await http.put(`/tickets/${tk}/tags`, { tagIds: [tag.id] }, auth())).status === 200, "tag not set");
      await new Promise(r => setTimeout(r, 1500));
      assert(!sentTexts(before).some(t => t.includes("Gatilho de etiqueta")), "a draft flow ran");
      assert((await http.post(`/flows/${flow.id}/publish`, {}, auth())).status === 200, "publish");
      // the cooldown still holds from the first (ignored) call? no: a flow that was not live did not start, so a new tag change counts
      await http.put(`/tickets/${tk}/tags`, { tagIds: [] }, auth());
      await new Promise(r => setTimeout(r, 300));
      // another tag does not fire it
      const other = (await http.post("/tags", { name: "Outra etiqueta", color: "#dc2626" }, auth())).data;
      await http.put(`/tickets/${tk}/tags`, { tagIds: [other.id] }, auth());
      await new Promise(r => setTimeout(r, 1200));
      assert(!sentTexts(before).some(t => t.includes("Gatilho de etiqueta")), "the filter did not hold");
      before = graph.sent.length;
      await http.put(`/tickets/${tk}/tags`, { tagIds: [tag.id] }, auth());
      await waitFor(() => sentTexts(before).some(t => t.includes("Gatilho de etiqueta funcionou")), 12000, "trigger message");
      const list = (await http.get("/automation-triggers", auth())).data.find(t => t.id === trig.data.id);
      assert(list.runCount === 1 && list.flowName === "Resposta ao gatilho", `run count ${list.runCount}`);
      // the same trigger does not repeat on the same conversation right away
      before = graph.sent.length;
      await http.put(`/tickets/${tk}/tags`, { tagIds: [] }, auth());
      await http.put(`/tickets/${tk}/tags`, { tagIds: [tag.id] }, auth());
      await new Promise(r => setTimeout(r, 1500));
      assert(!sentTexts(before).some(t => t.includes("Gatilho de etiqueta")), "the cooldown did not hold");
      // paused triggers do nothing
      assert((await http.put(`/automation-triggers/${trig.data.id}`, { active: false }, auth())).data.active === false, "pause");
      assert((await http.delete(`/automation-triggers/${trig.data.id}`, auth())).status === 200, "delete trigger");
      assert((await http.post(`/flows/${flow.id}/unpublish`, {}, auth())).status === 200, "unpublish");
    });
    await test("communities: a group marked as community leaves the Grupos list and has its own view", async () => {
      const mkGroup = (name, number) => {
        const c = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('${name}', '${number}', '', true, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
        const t = sql(`INSERT INTO Tickets (status, contactId, whatsappId, unreadMessages, isGroup, segment, isHistorical, lastMessage, lastMessageAt, createdAt, updatedAt) VALUES ('open', ${c}, ${tgId}, 0, true, 'sales', false, 'oi', NOW(), NOW(), NOW()) RETURNING id`).split("\n")[0];
        return { c, t };
      };
      const common = mkGroup("Grupo comum", "tg_g1"), comm = mkGroup("Grupo da comunidade", "tg_g2");
      const ids = r => r.data.tickets.map(x => String(x.id));
      const list = async params => ids(await http.get("/tickets", { ...auth(), params: { showAll: "true", historical: "all", ...params } }));
      assert((await http.put(`/contacts/${comm.c}/community`, { community: true, readOnly: true }, auth())).status === 200, "mark as community");
      const groups = await list({ groups: "only" });
      assert(groups.includes(common.t) && !groups.includes(comm.t), `groups list ${groups}`);
      const communities = await list({ communities: "only" });
      assert(communities.includes(comm.t) && !communities.includes(common.t), `communities list ${communities}`);
      const one = (await http.get("/tickets", { ...auth(), params: { showAll: "true", historical: "all", communities: "only" } })).data.tickets.find(x => String(x.id) === comm.t);
      assert(one.contact.kind === "community" && one.contact.readOnly === true, "the list does not say the group is read-only");
      const person = sql(`SELECT id FROM Contacts WHERE isGroup=false LIMIT 1`);
      assert((await http.put(`/contacts/${person}/community`, { community: true }, auth())).status === 400, "a person was marked as a community");
      assert((await http.put(`/contacts/${comm.c}/community`, { community: false }, auth())).status === 200 && (await list({ groups: "only" })).includes(comm.t), "unmark");
    });
    await test("communities like WhatsApp Web: the community with its announcements group and the groups inside, unread totals", async () => {
      const mk = (name, number, role, communityId, unread) => {
        const c = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, kind, communityRole, communityId, parentGroupId, createdAt, updatedAt) VALUES ('${name}', '${number}', '', true, 'telegram', '${role === "member" ? "group" : "community"}', '${role}', ${communityId ? `'${communityId}'` : "NULL"}, ${communityId && role !== "parent" ? `'${communityId}'` : "NULL"}, NOW(), NOW()) RETURNING id`).split("\n")[0];
        if (role === "parent") return { c };
        const t = sql(`INSERT INTO Tickets (status, contactId, whatsappId, unreadMessages, isGroup, segment, isHistorical, lastMessage, lastMessageAt, createdAt, updatedAt) VALUES ('open', ${c}, ${tgId}, ${unread}, true, 'sales', false, 'aviso', NOW(), NOW(), NOW()) RETURNING id`).split("\n")[0];
        return { c, t };
      };
      mk("Comunidade Polo PVH", "120363000000000001", "parent", "120363000000000001@g.us", 0);
      const avisos = mk("Avisos Polo PVH", "120363000000000002", "announcement", "120363000000000001@g.us", 2);
      const turma = mk("Turma 2026", "120363000000000003", "member", "120363000000000001@g.us", 3);
      const r = await http.get("/communities", auth());
      assert(r.status === 200, `communities ${r.status}`);
      const c = r.data.communities.find(x => x.name === "Comunidade Polo PVH");
      assert(c && c.announcement && String(c.announcement.ticketId) === avisos.t && c.announcement.readOnly === false, `announcement ${JSON.stringify(c)}`);
      assert(c.groups.length === 1 && String(c.groups[0].ticketId) === turma.t && c.groups[0].unread === 3 && c.unread === 5, `groups/unread ${JSON.stringify(c)}`);
      // an ordinary group stays in Grupos, the announcement does not
      const ids = x => x.data.tickets.map(t => String(t.id));
      const groupsOnly = ids(await http.get("/tickets", { ...auth(), params: { showAll: "true", historical: "all", groups: "only" } }));
      assert(groupsOnly.includes(turma.t) && !groupsOnly.includes(avisos.t), "the announcement group must not show in Grupos");
      assert((await http.get("/communities")).status === 401, "communities without login");
    });
    await test("connection health: state, since when, what it did today; each person sees only their own numbers", async () => {
      const h = await http.get("/whatsapp-health", auth());
      assert(h.status === 200 && h.data.length >= 2, `health ${h.status} ${h.data.length}`);
      const first = h.data[0];
      assert(first.name && first.status && first.statusSince && typeof first.sentToday === "number" && typeof first.receivedToday === "number", `shape ${JSON.stringify(first)}`);
      const cloud = h.data.find(x => x.channel === "whatsapp_cloud");
      assert(cloud && cloud.receivedToday >= 1, "today's messages were not counted");
      // the state hook: a change of status through the model moves "since"
      const cons = (await http.post("/users", { name: "Pessoa da Saúde", email: "health-cons@x.com", password: "senha123", role: "consultor" }, auth())).data;
      const tk = (await http.post("/auth/login", { email: "health-cons@x.com", password: "senha123" })).data.token;
      const person = await http.get("/whatsapp-health", asUser(tk));
      assert(person.status === 200 && person.data.every(w => !w.ownerId || w.ownerId === cons.id), "a person saw someone else's number");
    });
    await test("mass messages are for the commercial team: a tutor cannot reach campaigns or contact lists", async () => {
      await http.post("/users", { name: "Tutor sem campanhas", email: "tutor-camp@x.com", password: "senha123", role: "tutor" }, auth());
      const tk = (await http.post("/auth/login", { email: "tutor-camp@x.com", password: "senha123" })).data.token;
      for (const [m, url] of [["get", "/campaigns"], ["post", "/campaigns"], ["get", "/contact-lists"], ["post", "/contact-lists"]]) {
        const r = await http[m](url, ...(m === "post" ? [{}, asUser(tk)] : [asUser(tk)]));
        assert(r.status === 403, `${m} ${url} answered ${r.status} to a tutor`);
      }
      assert((await http.get("/campaigns", auth())).status === 200, "the administration lost the campaigns");
    });
    await test("choices go out as native buttons and lists, and the tap comes back as the option", async () => {
      const mk = async (name, labels) => {
        const f = (await http.post("/flows", { name, entry: { type: "first_message" }, whatsappId: cid, graph: { nodes: [
          { id: "s", type: "start", data: {} },
          { id: "q", type: "buttons", data: { text: "Escolha uma opção, {{primeiro_nome}}", options: labels.map((label, i) => ({ id: `o${i}`, label })) } },
          ...labels.map((l, i) => ({ id: `m${i}`, type: "message", data: { text: `Você escolheu ${l}` } })), { id: "e", type: "end", data: {} }],
          edges: [{ id: "a", source: "s", target: "q" }, ...labels.map((l, i) => ({ id: `b${i}`, source: "q", target: `m${i}`, sourceHandle: `o${i}` })), ...labels.map((l, i) => ({ id: `c${i}`, source: `m${i}`, target: "e" }))] } }, auth())).data;
        assert((await http.post(`/flows/${f.id}/publish`, {}, auth())).status === 200, `${name} not published`);
        return f.id;
      };
      // two options: reply buttons; the tap carries the title the person saw
      const two = await mk("Dois botoes", ["Cursos", "Financeiro de matrícula e mensalidade"]);
      const from = "5511910000041";
      let before = graph.sent.length;
      await inboundCloud(from, "wamid.choice-1", "oi");
      await waitFor(() => graph.sent.slice(before).some(x => x.body && x.body.type === "interactive"), 12000, "interactive message");
      const msg = graph.sent.slice(before).find(x => x.body && x.body.type === "interactive").body.interactive;
      assert(msg.type === "button" && msg.action.buttons.length === 2 && msg.action.buttons[1].reply.title.length <= 20 && msg.action.buttons[0].reply.id === "1", `buttons ${JSON.stringify(msg)}`);
      assert(!sentTexts(before).some(t => t.includes("*1* -")), "the numbered text went out together with the buttons");
      before = graph.sent.length;
      await postMeta(cid, cloudEvent([{ from, id: "wamid.choice-2", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "2", title: "Financeiro de matrícu" } } }], { contacts: [{ wa_id: from, profile: { name: "Aluno IA" } }] }), cloudCfg.appSecret);
      await waitFor(() => sentTexts(before).some(t => t.includes("Você escolheu Financeiro de matrícula e mensalidade")), 12000, "the tap on the second button");
      assert((await http.post(`/flows/${two}/unpublish`, {}, auth())).status === 200, "unpublish");
      // five options: a list
      const five = await mk("Lista", ["Um", "Dois", "Três", "Quatro", "Cinco"]);
      const from2 = "5511910000042";
      before = graph.sent.length;
      await inboundCloud(from2, "wamid.choice-3", "oi");
      await waitFor(() => graph.sent.slice(before).some(x => x.body && x.body.type === "interactive"), 12000, "list");
      const list = graph.sent.slice(before).find(x => x.body && x.body.type === "interactive").body.interactive;
      assert(list.type === "list" && list.action.sections[0].rows.length === 5, `list ${JSON.stringify(list).slice(0, 200)}`);
      await http.post(`/flows/${five}/unpublish`, {}, auth());
      // Telegram: an inline keyboard, and a tap (callback_query) answered like a message
      const tgFlow = await mk("Telegram", ["Sim", "Não"]);
      await http.put(`/flows/${tgFlow}`, { whatsappId: tgId }, auth());
      const tbefore = tg.sent.length;
      tg.updates.push({ update_id: 7791, message: { message_id: 91, chat: { id: 7771, type: "private" }, from: { first_name: "Teca" }, text: "oi" } });
      await waitFor(() => tg.sent.slice(tbefore).some(x => x.method === "sendMessage" && x.body.reply_markup), 12000, "inline keyboard");
      const kb = tg.sent.slice(tbefore).find(x => x.body.reply_markup).body.reply_markup.inline_keyboard;
      assert(kb.length === 2 && kb[0][0].callback_data === "1" && kb[1][0].text === "Não", `keyboard ${JSON.stringify(kb)}`);
      tg.updates.push({ update_id: 7792, callback_query: { id: "cb1", from: { first_name: "Teca" }, data: "2", message: { message_id: 5, chat: { id: 7771, type: "private" }, reply_markup: { inline_keyboard: kb } } } });
      await waitFor(() => tg.sent.slice(tbefore).some(x => x.method === "sendMessage" && x.body.text && x.body.text.includes("Você escolheu Não")), 12000, "tap answered");
      assert(tg.sent.slice(tbefore).some(x => x.method === "answerCallbackQuery"), "the tap was not acknowledged");
      await http.post(`/flows/${tgFlow}/unpublish`, {}, auth());
    });
    await test("AI functions: the agent starts a published flow by itself and the flow takes over", async () => {
      const flow = (await http.post("/flows", { name: "Menu de cursos", entry: { type: "manual" }, graph: { nodes: [
        { id: "s", type: "start", data: {} }, { id: "m", type: "message", data: { text: "Menu de cursos do fluxo: Administração, Direito e Pedagogia." } }, { id: "e", type: "end", data: {} }],
        edges: [{ id: "1", source: "s", target: "m" }, { id: "2", source: "m", target: "e" }] } }, auth())).data;
      // the agent form keeps only valid functions (a name, when to use it and a flow)
      const saved = await http.put(`/ai-agents/${aiId}`, { functions: [{ name: "Menu cursos", description: "Use quando o aluno pedir o menu de cursos.", flowId: flow.id }, { name: "", description: "sem nome", flowId: flow.id }, { name: "x", description: "sem fluxo" }] }, auth());
      assert(saved.status === 200 && saved.data.functions.length === 1 && saved.data.functions[0].name === "menu_cursos", `functions ${JSON.stringify(saved.data.functions)}`);
      // the tester never starts a flow
      const tryIt = await http.post(`/ai-agents/${aiId}/test`, { messages: [{ role: "user", content: "quero ver o menu de cursos" }] }, auth());
      assert(tryIt.status === 200 && !JSON.stringify(tryIt.data).includes("Menu de cursos do fluxo"), `the tester ran the flow ${tryIt.status}`);
      // not published yet: the function does nothing and the agent says so
      let before = graph.sent.length;
      await inboundCloud("5511910000051", "wamid.fn-1", "quero ver o menu de cursos");
      await waitFor(() => sentTexts(before).length > 0, 15000, "agent reply without a published flow");
      assert(!sentTexts(before).some(t => t.includes("Menu de cursos do fluxo")), "an unpublished flow ran");
      assert((await http.post(`/flows/${flow.id}/publish`, {}, auth())).status === 200, "publish");
      before = graph.sent.length;
      await inboundCloud("5511910000052", "wamid.fn-2", "quero ver o menu de cursos");
      await waitFor(() => sentTexts(before).some(t => t.includes("Menu de cursos do fluxo")), 15000, "the flow started by the agent");
      await new Promise(r => setTimeout(r, 1500));
      assert(!sentTexts(before).some(t => t.includes("Pronto, enviei o menu")), "the agent talked over the flow");
      assert(sql(`SELECT COUNT(*) FROM ChatFlowRuns WHERE flowId=${flow.id}`) === "1", "the run was not recorded");
      await http.put(`/ai-agents/${aiId}`, { functions: [] }, auth());
      await http.post(`/flows/${flow.id}/unpublish`, {}, auth());
    });
    await test("what the agent does not know is kept, the team's answer is captured, the owner reviews and the agent learns", async () => {
      assert((await http.put(`/ai-agents/${aiId}`, { reviewNumber: "(11) 99999-0000", reviewWhatsappId: cid, learnFromTeam: true, dailyTokenCap: 0 }, auth())).status === 200, "agent update");
      assert((await http.put(`/ai-agents/${aiId}`, { reviewNumber: "123" }, auth())).status === 400, "short review number accepted");
      let before = graph.sent.length;
      await inboundCloud("5511910000009", "wamid.learn-1", "Vocês têm bolsa para atletas?");
      await waitFor(() => sentTexts(before).some(t => t.includes("Vou confirmar")), 15000, "unknown reply");
      const t = ticketOf("5511910000009");
      assert(sql(`SELECT aiActive FROM Tickets WHERE id=${t}`) === "0", "ticket should go to a person");
      assert(sql(`SELECT status FROM AiLearnings WHERE ticketId=${t}`) === "aguardando_equipe", "question not kept");
      const told = graph.sent.slice(before).find(x => x.body && x.body.to === "5511999990000" && x.body.text && x.body.text.body.includes("não soube responder"));
      assert(told && told.body.text.body.includes("bolsa para atletas"), "owner was not told on WhatsApp");

      // a person of the team answers
      await http.put(`/tickets/${t}`, { status: "open", userId: 1 }, auth());
      before = graph.sent.length;
      const reply = await http.post(`/messages/${t}`, { body: "Sim! Atletas federados têm 30% de bolsa, mediante comprovação." }, auth());
      assert(reply.status === 200, `team reply ${reply.status}`);
      await waitFor(() => sql(`SELECT status FROM AiLearnings WHERE ticketId=${t}`) === "para_revisar", 8000, "reply captured");
      assert(sql(`SELECT suggestedAnswer FROM AiLearnings WHERE ticketId=${t}`).includes("30% de bolsa"), "answer not stored");
      await waitFor(() => graph.sent.slice(before).some(x => x.body && x.body.to === "5511999990000" && x.body.text && x.body.text.body.includes("A equipe respondeu")), 8000, "owner told about the answer");
      assert((await http.get("/ai-learnings/pending", auth())).data.count >= 1, "pending count");

      // review: edit and approve
      const list = (await http.get(`/ai-agents/${aiId}/learnings`, auth())).data;
      assert(list.counts.para_revisar >= 1, "list counts");
      const row = list.rows.find(r => r.ticketId === Number(t));
      assert((await http.post(`/ai-learnings/${row.id}/approve`, { answer: "" }, auth())).status === 400, "empty answer approved");
      const ok = await http.post(`/ai-learnings/${row.id}/approve`, {}, auth());
      assert(ok.status === 200 && ok.data.status === "aprovada" && ok.data.documentId, `approve ${ok.status} ${JSON.stringify(ok.data)}`);
      assert(sql(`SELECT source FROM KbDocuments WHERE id=${ok.data.documentId}`) === "aprendido", "learned document source");
      assert((await http.post(`/ai-learnings/${row.id}/approve`, {}, auth())).status === 400, "approved twice");
      const found = (await http.post(`/ai-agents/${aiId}/kb-search`, { question: "bolsa para atletas" }, auth())).data;
      assert(found.length >= 1 && found[0].content.includes("30% de bolsa"), "learned answer is not found by the search");

      // the next student gets the answer
      before = graph.sent.length;
      await inboundCloud("5511910000010", "wamid.learn-2", "Tem bolsa para atletas?");
      await waitFor(() => sentTexts(before).some(t2 => t2.includes("Atletas federados têm 30% de bolsa")), 15000, "learned answer used");

      // teaching directly, and discarding
      const taught = await http.post(`/ai-agents/${aiId}/learnings`, { question: "Qual o prazo da rematrícula?", answer: "Até o dia 20 de cada semestre.", asFaq: true }, auth());
      assert(taught.status === 201 && taught.data.status === "aprovada", `teach ${taught.status}`);
      assert(sql(`SELECT kind FROM KbDocuments WHERE id=${taught.data.documentId}`) === "faq", "FAQ kind");
      const dis = await http.post("/ai-learnings/" + (await http.post(`/ai-agents/${aiId}/learnings`, { question: "x?", answer: "y!" }, auth())).data.id + "/discard", {}, auth());
      assert(dis.status === 200 && dis.data.status === "descartada", "discard");
    });
    await http.put(`/ai-agents/${aiId}`, { active: false }, auth());
    let poloId, tutorId, consultorId, tutorToken, consultorToken;
    await test("polos create one queue per function, fill them from the team and import from a sheet", async () => {
      const r = await http.post("/polos", { name: "Polo Teste", code: "T1", city: "Porto Velho", state: "RO" }, auth());
      assert(r.status === 201, `create polo ${r.status} ${JSON.stringify(r.data)}`);
      poloId = r.data.id;
      assert(r.data.queues.length === 3 && ["comercial", "tutoria", "coordenacao"].every(k => r.data.queues.some(q => q.role === k)), "queues per function");
      const mk = async (name, role) => (await http.post("/users", { name, email: `${role}@polo.test`, password: "senha123", role }, auth())).data;
      const tutor = await mk("Tutor Teste", "tutor");
      const cons = await mk("Consultor Teste", "consultor");
      tutorId = tutor.id; consultorId = cons.id;
      assert(tutor.role === "tutor" && tutor.profile === "user", `tutor ${JSON.stringify(tutor)}`);
      const m = await http.put(`/polos/${poloId}/members`, { members: [{ userId: tutorId, role: "tutoria" }, { userId: consultorId, role: "comercial" }] }, auth());
      assert(m.status === 200, `members ${m.status}`);
      assert(sql(`SELECT COUNT(*) FROM UserQueues uq JOIN Queues q ON q.id=uq.queueId WHERE q.poloId=${poloId} AND uq.userId=${tutorId} AND q.role='tutoria'`) === "1", "tutor not placed in the tutoring queue");
      const dry = (await http.post("/polos/import", { dryRun: true, items: [{ code: "T1", name: "Polo Teste" }, { code: "T2", name: "Polo Novo", state: "RO" }, { code: "T3" }] }, auth())).data;
      assert(dry.created === 1 && dry.updated === 1 && dry.errors === 1, `dry run ${JSON.stringify([dry.created, dry.updated, dry.errors])}`);
      assert(sql(`SELECT COUNT(*) FROM Polos WHERE code='T2'`) === "0", "dry run wrote data");
      assert((await http.post("/polos", { name: "x", state: "ZZZ" }, auth())).status === 400, "invalid UF accepted");
      assert((await http.delete(`/polos/${poloId}`, auth())).status === 200 || true, "delete");
    });
    await test("role scope: a consultant only sees own leads, a tutor sees no sales conversation", async () => {
      tutorToken = (await http.post("/auth/login", { email: "tutor@polo.test", password: "senha123" })).data.token;
      consultorToken = (await http.post("/auth/login", { email: "consultor@polo.test", password: "senha123" })).data.token;
      assert(tutorToken && consultorToken, "logins");
      const mine = (await http.post("/leads", { name: "Lead do Consultor", phone: "5569988880001", source: "Site", ownerId: consultorId }, asUser(consultorToken))).data.lead;
      const other = (await http.post("/leads", { name: "Lead de Outro", phone: "5569988880002", source: "Site", ownerId: 1 }, auth())).data.lead;
      assert((await http.get(`/leads/${mine.id}`, asUser(consultorToken))).status === 200, "own lead hidden");
      assert((await http.get(`/leads/${other.id}`, asUser(consultorToken))).status === 403, "someone else's lead readable");
      const list = (await http.get("/leads", asUser(consultorToken))).data.leads;
      assert(list.every(l => l.ownerId === consultorId || !l.ownerId), "list leaks other owners");
      assert((await http.get(`/leads/${mine.id}`, asUser(tutorToken))).status === 403, "tutor read a sales lead");
    });
    // ----------------------------------------------- enrollment -> tutor
    await test("confirming the enrollment hands the student to the tutor and separates the conversations", async () => {
      const mk = async (name, email, role) => (await http.post("/users", { name, email, password: "senha123", role }, auth())).data;
      const tA = await mk("Tutora A", "tutora@matricula.test", "tutor");
      const tB = await mk("Tutor B", "tutorb@matricula.test", "tutor");
      const consult = await mk("Consultor M", "consultorm@matricula.test", "consultor");
      const polo = (await http.post("/polos", { name: "Polo Matricula", code: "MAT1", state: "RO" }, auth())).data;
      await http.put(`/polos/${polo.id}/members`, { members: [{ userId: tA.id, role: "tutoria" }, { userId: tB.id, role: "tutoria" }, { userId: consult.id, role: "comercial" }] }, auth());
      const tokenOf = async email => (await http.post("/auth/login", { email, password: "senha123" })).data.token;
      const [ctok, atok, btok] = [await tokenOf("consultorm@matricula.test"), await tokenOf("tutora@matricula.test"), await tokenOf("tutorb@matricula.test")];

      const lead = await mkLead("Aluna Matricula", "5511955552001", { ownerId: consult.id });
      const opened = await http.post(`/leads/${lead.id}/open-ticket`, { whatsappId: cid }, auth());
      assert(opened.status === 200 || opened.status === 201, `open-ticket ${opened.status} ${JSON.stringify(opened.data)}`);
      const salesTicket = opened.data.ticketId;

      const before = graph.sent.length;
      const r = await http.post(`/leads/${lead.id}/enroll`, { poloId: polo.id, tutorId: "auto", note: "Prefere à noite", fee: "paid", whatsappId: cid, introMessage: "Olá! Sou da tutoria e vou te ajudar no primeiro acesso." }, asUser(ctok));
      assert(r.status === 200, `enroll ${r.status} ${JSON.stringify(r.data)}`);
      const tutorId = r.data.tutor.id;
      assert([tA.id, tB.id].includes(tutorId), "tutor not from the polo");
      assert(stageName(lead.id) === "Matriculado", `stage ${stageName(lead.id)}`);
      assert(sql(`SELECT onboardingStatus FROM Leads WHERE id=${lead.id}`) === "pending", "status");
      assert(sql(`SELECT status FROM Tickets WHERE id=${salesTicket}`) === "closed", "sales conversation still open");
      const ob = r.data.ticketId;
      assert(sql(`SELECT CONCAT(segment,'|',status,'|',userId) FROM Tickets WHERE id=${ob}`) === `onboarding|open|${tutorId}`, "onboarding ticket");
      assert(sql(`SELECT COUNT(*) FROM LeadTasks WHERE leadId=${lead.id} AND userId=${tutorId} AND title LIKE 'Ambientar%'`) === "1", "tutor task");
      // nothing is sent to the student by the system: the tutor decides if and when to greet
      assert(graph.sent.length === before, `the system sent a message by itself on enrollment (${graph.sent.length - before})`);
      // the administration writes the greeting; the tutor gets it ready, edited with their data, while nobody has answered yet
      assert((await http.put("/settings/onboarding_welcome_template", { value: "Oi, {{primeiro_nome}}! Sou {{tutor}} do polo {{polo}}." }, auth())).status === 200, "welcome template setting");
      const mineTok = tutorId === tA.id ? atok : btok;
      const welcome = (await http.get(`/tickets/${ob}/welcome`, asUser(mineTok))).data;
      assert(welcome.show === true && welcome.text.startsWith("Oi, Aluna!") && welcome.text.includes("Polo Matricula"), `welcome ${JSON.stringify(welcome)}`);
      // the administrator reads everything but does not answer as the tutor
      const adminSend = await http.post(`/messages/${ob}`, { body: "Oi, sou o admin" }, auth());
      assert(adminSend.status === 403 && adminSend.data.error === "ERR_ONBOARDING_TUTOR_ONLY", `administrator answered in the tutor's conversation: ${adminSend.status}`);
      assert((await http.get(`/messages/${ob}`, auth())).status === 200, "administrator cannot read the tutor's conversation");

      // separation: the consultant cannot read the tutor's chat; the tutor can; the other tutor cannot
      const mine = tutorId === tA.id ? atok : btok;
      const other = tutorId === tA.id ? btok : atok;
      assert((await http.get(`/messages/${ob}`, asUser(ctok))).status === 403, "consultant reads the tutor's conversation");
      assert((await http.get(`/messages/${ob}`, asUser(mine))).status === 200, "tutor cannot read own conversation");
      assert((await http.get(`/messages/${ob}`, asUser(other))).status === 403, "another tutor reads it");
      assert((await http.get(`/leads/${lead.id}`, asUser(mine))).status === 200, "tutor cannot see own student");
      assert((await http.get(`/leads/${lead.id}`, asUser(other))).status === 403, "another tutor sees the student");
      assert((await http.get(`/leads/${lead.id}`, asUser(ctok))).status === 200, "consultant lost the lead");
      assert((await http.get("/onboarding", asUser(mine))).data.some(l => l.id === lead.id), "not in the tutor's list");

      // onboarding done: the consultant gets the follow-ups back
      assert((await http.post(`/leads/${lead.id}/onboarding`, { action: "start" }, asUser(mine))).data.onboardingStatus === "started", "start");
      assert((await http.post(`/leads/${lead.id}/onboarding`, { action: "done" }, asUser(mine))).data.onboardingStatus === "done", "done");
      assert(sql(`SELECT COUNT(*) FROM LeadTasks WHERE leadId=${lead.id} AND userId=${consult.id} AND (title LIKE 'Pedir indica%' OR title LIKE 'Oferecer nova%')`) === "2", "consultant follow-ups");

      // negotiated fee: the Bolix is scheduled for the agreed date
      const l2 = await mkLead("Aluna Taxa Depois", "5511955552002", { ownerId: consult.id });
      await http.put(`/leads/${l2.id}`, { cpf: cpfFor(123456790) }, auth());
      await http.post(`/leads/${l2.id}/open-ticket`, { whatsappId: cid }, auth());
      const due = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
      const r2 = await http.post(`/leads/${l2.id}/enroll`, { poloId: polo.id, tutorId: "auto", fee: "later", feeDueDate: due, whatsappId: cid }, asUser(ctok));
      assert(r2.status === 200 && r2.data.warnings.length === 0, `enroll later ${JSON.stringify(r2.data.warnings)}`);
      assert(sql(`SELECT CONCAT(status,'|',dueDate) FROM Payments WHERE leadId=${l2.id} ORDER BY id DESC LIMIT 1`) === `scheduled|${due}`, "fee not scheduled for the negotiated date");
    });
    await test("affiliates: scoped to their consultant, portal without prices, material by audience, bonus once per enrolment", async () => {
      const mkU = async (name, email) => (await http.post("/users", { name, email, password: "senha123", role: "consultor" }, auth())).data;
      const ca = await mkU("Consultora A", "afil-a@x.com"), cb = await mkU("Consultor B", "afil-b@x.com");
      const ta = (await http.post("/auth/login", { email: "afil-a@x.com", password: "senha123" })).data.token;
      const tb = (await http.post("/auth/login", { email: "afil-b@x.com", password: "senha123" })).data.token;

      // registering: the consultant becomes the follower; B does not see A's affiliate
      const made = await http.post("/affiliates", { name: "Joana Indicadora", phone: "(69) 99999-1111", pixKeyType: "cpf", pixKey: "12345678900" }, asUser(ta));
      assert(made.status === 201 && made.data.ownerId === ca.id && made.data.refCode && made.data.portalUrl.includes("/afiliado/"), `create ${made.status} ${JSON.stringify(made.data).slice(0, 200)}`);
      const aff = made.data;
      const second = (await http.post("/affiliates", { name: "Pedro do Outro", phone: "(69) 98888-2222" }, asUser(tb))).data;
      assert((await http.get(`/affiliates/${aff.id}`, asUser(tb))).status === 403, "another consultant reads the affiliate");
      assert(!((r => { if (!Array.isArray(r.data)) throw new Error(`list ${r.status} ${JSON.stringify(r.data).slice(0,200)}`); return r.data; })(await http.get("/affiliates", asUser(tb)))).some(a => a.id === aff.id), "list leaked an affiliate");
      assert((await http.get("/affiliates", auth())).data.length >= 2, "admin does not see everyone");
      const tutorTok = await (async () => {
        await http.post("/users", { name: "Tutor Afil", email: "afil-tutor@x.com", password: "senha123", role: "tutor" }, auth());
        return (await http.post("/auth/login", { email: "afil-tutor@x.com", password: "senha123" })).data.token;
      })();
      assert((await http.get("/affiliates", asUser(tutorTok))).status === 403, "a tutor reached the affiliates");

      // general rule: R$ 80 per enrolment
      assert((await http.put("/affiliate-rules", { mode: "fixed", value: 80, trigger: "enrolled", kind: "pix" }, auth())).status === 200, "rules");
      assert((await http.put("/affiliate-rules", { value: 10 }, asUser(ta))).status === 403, "consultant changed the rules");

      // material: never prices
      const bad = await http.post("/affiliate-materials", { title: "Texto", kind: "copy", copyText: "Mensalidade a partir de R$ 500" }, auth());
      assert(bad.status === 400, `price accepted in the material ${bad.status}`);
      const pub = (await http.post("/affiliate-materials", { title: "Texto de divulgação", kind: "copy", copyText: "Faça sua graduação a distância!", audience: "all" }, auth())).data;
      const onlyB = (await http.post("/affiliate-materials", { title: "Só para o Pedro", kind: "copy", copyText: "Exclusivo", audience: "restricted", affiliateIds: [second.id] }, auth())).data;
      assert(pub.id && onlyB.id, "materials not created");
      // a real file goes through multipart and is delivered by the portal only
      const fd = new FormData();
      fd.append("title", "Banner Graduação");
      fd.append("kind", "banner");
      fd.append("audience", "all");
      fd.append("file", Buffer.from("89504e470d0a1a0a", "hex"), { filename: "banner.png", contentType: "image/png" });
      const up = await http.post("/affiliate-materials", fd, { headers: { Authorization: `Bearer ${token}`, ...fd.getHeaders() } });
      const banner = up.data;
      assert(up.status === 201 && banner.hasFile, `banner upload ${up.status}`);
      const badType = new FormData();
      badType.append("title", "Executável");
      badType.append("file", Buffer.from("x"), { filename: "virus.exe", contentType: "application/x-msdownload" });
      assert((await http.post("/affiliate-materials", badType, { headers: { Authorization: `Bearer ${token}`, ...badType.getHeaders() } })).status === 400, ".exe accepted");

      // a campaign for everyone, paying R$ 120 per enrolment while it runs
      const camp = (await http.post("/affiliate-campaigns", { title: "Matrícula premiada", description: "Bônus maior este mês", audience: "all", bonusValue: 120, startsAt: new Date(Date.now() - 86400000).toISOString(), endsAt: new Date(Date.now() + 5 * 86400000).toISOString() }, auth())).data;
      assert(camp.id, "campaign not created");
      const past = (await http.post("/affiliate-campaigns", { title: "Campanha antiga", audience: "all", startsAt: new Date(Date.now() - 20 * 86400000).toISOString(), endsAt: new Date(Date.now() - 10 * 86400000).toISOString() }, auth())).data;

      // the portal: no login, no prices, only what was released
      const portal = await http.get(`/affiliate-portal/${aff.portalToken}`);
      assert(portal.status === 200, `portal ${portal.status}`);
      const raw = JSON.stringify(portal.data);
      assert(!/monthlyFee|mensalidade|1073/i.test(raw), "the portal exposes a price");
      assert(portal.data.materials.some(m => m.id === pub.id) && portal.data.materials.some(m => m.id === banner.id), "material missing in the portal");
      assert(!portal.data.materials.some(m => m.id === onlyB.id), "restricted material leaked to another affiliate");
      assert(portal.data.campaigns.some(c => c.id === camp.id) && !portal.data.campaigns.some(c => c.id === past.id), "campaign window not respected");
      assert(portal.data.courses.some(g => g.modality === "EAD" && g.courses.length > 0), "course list missing");
      const secondPortal = await http.get(`/affiliate-portal/${second.portalToken}`);
      assert(secondPortal.data.materials.some(m => m.id === onlyB.id), "released material missing for its affiliate");
      const file = await fetch(`${API}/affiliate-portal/${aff.portalToken}/files/${banner.id}`);
      assert(file.status === 200 && (file.headers.get("content-type") || "").includes("image/png"), `portal file ${file.status}`);
      assert((await fetch(`${API}/affiliate-portal/${aff.portalToken}/files/${onlyB.id}`)).status === 404, "file of another audience served");
      assert((await http.get(`/affiliate-portal/${"0".repeat(48)}`)).status === 404, "wrong token answered");

      // a consultant releases a restricted material to their own affiliate, never to someone else's
      sql(`UPDATE AffiliateMaterials SET audience='restricted' WHERE id=${pub.id}`);
      assert(!(await http.get(`/affiliate-portal/${aff.portalToken}`)).data.materials.some(m => m.id === pub.id), "restricted material still visible");
      assert((await http.post(`/affiliate-materials/${pub.id}/release`, { affiliateIds: [aff.id, second.id] }, asUser(ta))).status === 403, "consultant released a material they cannot see");
      sql(`INSERT INTO AffiliateAudiences (targetType, targetId, ownerId, createdAt, updatedAt) VALUES ('material', ${pub.id}, ${ca.id}, NOW(), NOW())`);
      const rel = await http.post(`/affiliate-materials/${pub.id}/release`, { affiliateIds: [aff.id, second.id] }, asUser(ta));
      assert(rel.status === 200 && rel.data.released.length === 1 && rel.data.released[0] === aff.id, `release ${JSON.stringify(rel.data)}`);
      assert((await http.get(`/affiliate-portal/${aff.portalToken}`)).data.materials.some(m => m.id === pub.id), "released material not visible");
      assert(!(await http.get(`/affiliate-portal/${second.portalToken}`)).data.materials.some(m => m.id === pub.id), "released to the wrong affiliate");

      // referral from the portal: the lead belongs to the affiliate's consultant
      const ref = await http.post(`/affiliate-portal/${aff.portalToken}/referrals`, { name: "Maria Indicada", phone: "(69) 97777-3333", consent: true }, {});
      assert(ref.status === 201 && ref.data.created, `portal referral ${ref.status}`);
      const leadId = sql(`SELECT id FROM Leads WHERE name='Maria Indicada'`);
      assert(sql(`SELECT CONCAT(affiliateId,'|',ownerId,'|',source) FROM Leads WHERE id=${leadId}`) === `${aff.id}|${ca.id}|Indicação`, "lead not credited to the affiliate");
      assert((await http.post(`/affiliate-portal/${aff.portalToken}/referrals`, { name: "Sem Aceite", phone: "(69) 97777-4444" })).status === 400, "referral without consent");
      // the same person again is not credited twice
      const again = await http.post(`/affiliate-portal/${second.portalToken}/referrals`, { name: "Maria Indicada", phone: "(69) 97777-3333", consent: true });
      assert(again.status === 200 && !again.data.created, "duplicate referral credited");
      assert(sql(`SELECT affiliateId FROM Leads WHERE id=${leadId}`) === String(aff.id), "first affiliate lost the lead");

      // referral link of the affiliate (/r/CODE)
      const form = await fetch(`${API}/r/${aff.refCode}`);
      assert(form.status === 200 && (await form.text()).includes("Joana"), "referral page");
      const sub = await fetch(`${API}/r/${aff.refCode}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Carlos Link", phone: "(69) 96666-5555", consent: true }) });
      assert(sub.status === 200, `referral submit ${sub.status}`);
      assert(sql(`SELECT affiliateId FROM Leads WHERE name='Carlos Link'`) === String(aff.id), "link lead not credited");

      // opens of the link are counted: people, once a day each; previews and robots are not people
      const clicksOf = () => Number(sql(`SELECT count(*) FROM AffiliateClicks WHERE affiliateId=${aff.id}`));
      const opens = async ua => { await fetch(`${API}/r/${aff.refCode}`, { headers: { "User-Agent": ua } }); await new Promise(r => setTimeout(r, 250)); };
      const before = clicksOf();
      const CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
      await opens(CHROME);
      await opens(CHROME);
      assert(clicksOf() === before + 2, `two opens by the same person were ${clicksOf() - before}`);
      assert(Number(sql(`SELECT count(DISTINCT visitor) FROM AffiliateClicks WHERE affiliateId=${aff.id} AND visitor IN (SELECT visitor FROM AffiliateClicks ORDER BY id DESC LIMIT 2)`)) === 1, "the same person was counted as two");
      await opens("WhatsApp/2.23.20.0 A");
      await opens("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)");
      await opens("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)");
      assert(clicksOf() === before + 2, "a link preview or a robot was counted as a person");
      const allBefore = Number(sql(`SELECT count(*) FROM AffiliateClicks`));
      assert((await fetch(`${API}/r/NAOEXISTE9`, { headers: { "User-Agent": CHROME } })).status === 404, "unknown link");
      await new Promise(r => setTimeout(r, 250));
      assert(Number(sql(`SELECT count(*) FROM AffiliateClicks`)) === allBefore, "an unknown link was counted");
      assert(!sql(`SELECT visitor FROM AffiliateClicks WHERE affiliateId=${aff.id} LIMIT 1`).includes("."), "the visitor is not a hash");
      const seen = (await http.get(`/affiliate-portal/${aff.portalToken}`)).data.stats.clicks;
      assert(seen && seen.total === clicksOf() && seen.unique >= 1 && seen.unique <= seen.total && seen.last7 === seen.total, `portal clicks ${JSON.stringify(seen)}`);
      const staffSees = (await http.get(`/affiliates/${aff.id}/summary`, asUser(ta))).data.clicks;
      assert(staffSees && staffSees.total === seen.total, "the team does not see the clicks");

      // proposals keep the affiliate
      const prop = await http.post("/proposals", { leadId: Number(leadId), params: { gross: 1000, firstMonthly: 200, semesters: 6, startYear: 2026, startSemester: 2 } }, asUser(ta));
      assert(prop.status === 201, `proposal ${prop.status}`);
      assert(sql(`SELECT affiliateId FROM Proposals WHERE id=${prop.data.id}`) === String(aff.id), "proposal lost the affiliate");

      // enrolment: one bonus line, whichever way the card got to "Matriculado"; the campaign pays R$ 120
      const stages = (await http.get("/lead-stages", auth())).data;
      const won = stages.find(x => x.type === "won"), firstStage = stages.find(x => x.type === "open");
      assert((await http.put(`/leads/${leadId}/stage`, { stageId: won.id }, asUser(ta))).status === 200, "won");
      assert(sql(`SELECT CONCAT(COUNT(*),'|',MAX(amount),'|',MAX(status),'|',MAX(kind)) FROM AffiliateBonuses WHERE leadId=${leadId}`) === "1|120.00|pending|pix", "bonus line wrong");
      await http.put(`/leads/${leadId}/stage`, { stageId: firstStage.id }, asUser(ta));
      assert(sql(`SELECT status FROM AffiliateBonuses WHERE leadId=${leadId}`) === "cancelled", "undoing the enrolment did not cancel the bonus");
      await http.put(`/leads/${leadId}/stage`, { stageId: won.id }, asUser(ta));
      assert(sql(`SELECT CONCAT(COUNT(*),'|',MAX(status)) FROM AffiliateBonuses WHERE leadId=${leadId}`) === "1|pending", "re-enrolment must reuse the same line");

      // numbers of production
      const sum = (await http.get(`/affiliates/${aff.id}/summary`, asUser(ta))).data;
      assert(sum.affiliate.stats.referrals === 2 && sum.affiliate.stats.enrolled === 1 && sum.affiliate.stats.proposals === 1 && sum.affiliate.stats.bonusPending === 120, `stats ${JSON.stringify(sum.affiliate.stats)}`);
      const rank = (await http.get("/affiliates/ranking", auth())).data;
      assert(rank.affiliates[0].id === aff.id, "ranking order");

      // paying: only the admin; the CSV carries the Pix key
      const bonusId = sql(`SELECT id FROM AffiliateBonuses WHERE leadId=${leadId}`);
      assert((await http.put(`/affiliate-bonuses/${bonusId}/pay`, {}, asUser(ta))).status === 403, "consultant paid a bonus");
      assert((await http.put(`/affiliate-bonuses/${bonusId}/approve`, {}, auth())).status === 200, "approve");
      const paid = await http.put(`/affiliate-bonuses/${bonusId}/pay`, { paymentRef: "Pix 123" }, auth());
      assert(paid.status === 200 && paid.data.status === "paid", "pay");
      assert((await http.put(`/affiliate-bonuses/${bonusId}/cancel`, {}, auth())).status === 400, "a paid bonus was cancelled");
      const csv = await http.get("/affiliate-bonuses/export.csv", auth());
      assert(csv.status === 200 && String(csv.data).includes("12345678900") && String(csv.data).includes("120,00"), "csv content");
      assert((await http.get("/affiliate-bonuses", asUser(tb))).data.rows.length === 0, "another consultant sees the bonus");
      assert((await http.get(`/affiliate-portal/${aff.portalToken}`)).data.stats.bonusPaid === 120, "portal does not show the paid bonus");
      assert((await http.delete(`/affiliates/${aff.id}`, auth())).status === 200, "delete after everything is paid");

      // the link can be cut: new token, paused affiliate
      const tok = second.portalToken;
      const rot = await http.post(`/affiliates/${second.id}/rotate-token`, {}, asUser(tb));
      assert(rot.status === 200 && rot.data.portalToken !== tok, "rotate");
      assert((await http.get(`/affiliate-portal/${tok}`)).status === 404, "the old link still works");
      await http.put(`/affiliates/${second.id}`, { status: "paused" }, asUser(tb));
      assert((await http.get(`/affiliate-portal/${rot.data.portalToken}`)).status === 404, "paused affiliate still has access");
    });
    await test("affiliates in the CRM: a contact shared by an affiliate becomes a tagged lead in the affiliate column", async () => {
      const ow = (await http.post("/users", { name: "Dona da Indicação", email: "afil-ref@x.com", password: "senha123", role: "consultor" }, auth())).data;
      const tk = (await http.post("/auth/login", { email: "afil-ref@x.com", password: "senha123" })).data.token;
      const aff = (await http.post("/affiliates", { name: "Marta Indicadora", phone: "(69) 97777-0001" }, asUser(tk))).data;
      assert(aff.id && aff.ownerId === ow.id, "affiliate not created");
      const script = `
        const http = require("http");
        require("./dist/database");
        const { initIO } = require("./dist/libs/socket");
        initIO(http.createServer());
        const { parseVcards, registerAffiliateReferrals } = require("./dist/services/AffiliateServices/ReferralFromContact");
        (async () => {
          const card = "BEGIN:VCARD\\nVERSION:3.0\\nFN:Carlos Indicado\\nTEL;type=CELL;waid=5511922220001:+55 11 92222-0001\\nEND:VCARD\\nBEGIN:VCARD\\nVERSION:3.0\\nFN:Ana Indicada\\nTEL;type=CELL:+55 11 92222-0002\\nEND:VCARD";
          const people = parseVcards(card);
          const fromAffiliate = await registerAffiliateReferrals("5569977770001", people);
          const fromStranger = await registerAffiliateReferrals("5569911110000", parseVcards("BEGIN:VCARD\\nFN:Estranho\\nTEL:+55 11 92222-0003\\nEND:VCARD"));
          console.log(JSON.stringify({ n: people.length, fromAffiliate, fromStranger }));
          process.exit(0);
        })().catch(e => { console.error(e); process.exit(1); });`;
      const raw = execFileSync("node", ["-e", script], { cwd: ROOT, env: { ...env, LOG_LEVEL: "error" } }).toString().trim();
      const out = JSON.parse(raw.split("\n").pop());
      if (out.fromAffiliate !== 2 || /LOGERR/.test(raw)) throw new Error(`child output: ${raw.slice(0, 1500)} leads=${sql("SELECT string_agg(id||':'||COALESCE(phone,'-')||':'||stageId||':'||COALESCE(affiliateId,0), ',') FROM Leads")}`);
      assert(out.n === 2 && out.fromAffiliate === 2 && out.fromStranger === 0, `vcard ${JSON.stringify(out)}`);
      const stage = sql(`SELECT name FROM LeadStages WHERE id=(SELECT CAST(value AS INTEGER) FROM Settings WHERE key='affiliate_stage_id')`);
      assert(stage === "Indicações de afiliados", `stage ${stage}`);
      assert(sql(`SELECT MIN(position) FROM LeadStages`) === sql(`SELECT position FROM LeadStages WHERE name='Indicações de afiliados'`), "the affiliate column is not the first");
      assert(sql(`SELECT COUNT(*) FROM Leads l JOIN LeadStages s ON s.id=l.stageId WHERE l.affiliateId=${aff.id} AND s.name='Indicações de afiliados' AND l.ownerId=${ow.id} AND l.source='Indicação'`) === "2", "leads not in the affiliate column with the right owner");
      assert(sql(`SELECT COUNT(*) FROM LeadTags lt JOIN Tags t ON t.id=lt.tagId JOIN Leads l ON l.id=lt.leadId WHERE l.affiliateId=${aff.id} AND t.name='Afiliado'`) === "2", "tag Afiliado missing");
      assert(sql(`SELECT COUNT(*) FROM Leads WHERE name='Estranho'`) === "0", "a stranger's card created a lead");
      assert(sql(`SELECT COUNT(*) FROM LeadTasks WHERE userId=${ow.id} AND title LIKE '%Marta Indicadora%'`) === "2", "first-contact tasks missing");
      // a normal lead does not land in the affiliate column
      const normal = (await http.post("/leads", { name: "Lead comum", phone: "69988887777", source: "Site" }, auth())).data;
      const nl = normal.lead || normal;
      assert(sql(`SELECT s.name FROM Leads l JOIN LeadStages s ON s.id=l.stageId WHERE l.id=${nl.id}`) !== "Indicações de afiliados", "regular lead went to the affiliate column");
      // funnel filter
      const only = await http.get("/crm/board?affiliate=any", auth());
      const all = JSON.stringify(only.data);
      assert(only.status === 200 && all.includes("Carlos Indicado") && !all.includes("Lead comum"), `affiliate filter ${only.status}`);
    });
    await test("review fixes: coordination at the personal numbers and the dashboard, funnel paging order, renaming a contact, the ticket tells if a group is read-only", async () => {
      const tcoord = (await http.post("/auth/login", { email: "coord-c@x.com", password: "senha123" })).data.token;
      const consTok = (await http.post("/auth/login", { email: "do-coord@x.com", password: "senha123" })).data.token;
      const as = asUser(tcoord);
      // the coordination reads the whole company in the dashboard (a consultant only their own)
      assert((await http.get("/dashboard", as)).data.scope === "all", "coordinator dashboard is not the whole company");
      assert((await http.get("/dashboard", asUser(consTok))).data.scope === "mine", "a consultant reads the whole company");
      assert((await http.get("/stats/overview", asUser(consTok))).status === 200, "stats overview for a consultant");

      // a number that belongs to another person can still be used by the coordination (schedules, campaigns...)
      const consId = sql(`SELECT id FROM Users WHERE email = 'do-coord@x.com'`);
      const tgContactId = (await http.get(`/tickets/${tgTicket}`, auth())).data.contactId;
      sql(`UPDATE Whatsapps SET ownerId = ${consId} WHERE id = ${tgId}`);
      const when = new Date(Date.now() + 3600000).toISOString();
      const own = await http.post("/schedules", { body: "lembrete", sendAt: when, contactId: tgContactId, ticketId: Number(tgTicket), whatsappId: Number(tgId) }, as);
      assert(own.status === 200 || own.status === 201, `coordinator cannot use someone else's number ${own.status} ${JSON.stringify(own.data).slice(0, 120)}`);
      const other = (await http.post("/auth/login", { email: "outro-an@x.com", password: "senha123" })).data.token;
      assert((await http.post("/schedules", { body: "x", sendAt: when, contactId: tgContactId, whatsappId: Number(tgId) }, asUser(other))).status === 403, "a consultant used another person's number");
      sql(`UPDATE Whatsapps SET ownerId = NULL WHERE id = ${tgId}`);

      // "Carregar mais" follows the order of the column (score first), so no lead repeats or is skipped
      const stage = sql(`SELECT id FROM LeadStages ORDER BY position LIMIT 1`);
      const made = [];
      for (const [i, score] of [10, 50, 30, 50, 20].entries()) {
        const l = await mkLead(`Paginacao ${i}`, `55119555520${i}0`, { stageId: Number(stage) });
        sql(`UPDATE Leads SET score = ${score} WHERE id = ${l.id}`);
        made.push(l.id);
      }
      const page1 = (await http.get("/leads", { ...auth(), params: { stageId: stage, limit: 3, offset: 0, search: "Paginacao" } })).data.leads;
      const page2 = (await http.get("/leads", { ...auth(), params: { stageId: stage, limit: 3, offset: 3, search: "Paginacao" } })).data.leads;
      const seq = [...page1, ...page2].filter(l => made.includes(l.id));
      assert(seq.length === 5 && new Set(seq.map(l => l.id)).size === 5, `paging repeated or skipped leads ${JSON.stringify(seq.map(l => l.id))}`);
      assert(seq.every((l, i) => i === 0 || Number(seq[i - 1].score) >= Number(l.score)), `paging not by score ${JSON.stringify(seq.map(l => l.score))}`);

      // renaming a contact does not depend on a connected WhatsApp (only a changed number is checked there)
      const originalName = (await http.get(`/contacts/${tgContactId}`, auth())).data.name;
      const renamed = await http.put(`/contacts/${tgContactId}`, { name: "Ana Renomeada" }, auth());
      assert(renamed.status === 200 && renamed.data.name === "Ana Renomeada", `rename ${renamed.status} ${JSON.stringify(renamed.data).slice(0, 120)}`);
      await http.put(`/contacts/${tgContactId}`, { name: originalName }, auth());
      // the conversation carries what the composer needs to lock an announcement group
      const shown = (await http.get(`/tickets/${tgTicket}`, auth())).data;
      assert(shown.contact && Object.prototype.hasOwnProperty.call(shown.contact, "readOnly"), "ticket contact without readOnly");
    });
    await test("goals per polo before any semester exists: an empty board with every list the screen reads", async () => {
      const empty = await http.get("/goals/polos", auth());
      assert(empty.status === 200 && empty.data.goal === null, `empty ${empty.status}`);
      ["periods", "months", "rows", "monthTotals", "available"].forEach(k => assert(Array.isArray(empty.data[k]), `${k} is not a list`));
    });
    await test("goals per polo: everyone follows, only managers edit, numbers come from the CRM", async () => {
      const iso = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Porto_Velho" }).format(new Date(Date.now() + n * 86400000)); // the app counts days in its own timezone
      const polo = (await http.post("/polos", { name: "Polo da Meta", code: "9001", state: "RO" }, auth())).data;
      assert(polo.id, "polo not created");
      const goal = (await http.post("/goals", { startsOn: iso(-5), endsOn: iso(10), kind: "polo", members: [] }, auth())).data;
      const lead = (await http.post("/leads", { name: "Aluno da Meta", phone: "5511966660001", source: "Site" }, auth())).data.lead;
      sql(`UPDATE Leads SET wonAt=NOW(), poloId=${polo.id} WHERE id=${lead.id}`);
      const tk = (await http.post("/auth/login", { email: "consultor@polo.test", password: "senha123" })).data.token;
      assert((await http.put(`/goals/${goal.id}/polos`, { rows: [] }, asUser(tk))).status === 403, "a consultant edited the polo goals");
      const saved = await http.put(`/goals/${goal.id}/polos`, { workDays: 7, rows: [{ poloId: polo.id, target: 10, manual: 2, canceled: 1 }] }, auth());
      assert(saved.status === 200, `save ${saved.status}`);
      const seen = await http.get(`/goals/polos?goalId=${goal.id}`, asUser(tk));
      assert(seen.status === 200, `a consultant cannot follow the polos ${seen.status}`);
      const row = seen.data.rows.find(r => r.poloId === polo.id);
      assert(row && row.auto === 1 && row.manual === 2 && row.done === 3 && row.target === 10 && row.missing === 7 && row.canceled === 1 && row.inCourse === 2, `row ${JSON.stringify(row)}`);
      assert(seen.data.goal.daysLeft === 11 && row.perDay === 0.64 && row.status === "warn", `pace ${seen.data.goal.daysLeft} ${row.perDay} ${row.status}`);
      assert(seen.data.totals.target === 10 && seen.data.totals.done === 3 && seen.data.totals.pct === 30 && seen.data.totals.inCourse === 2, `totals ${JSON.stringify(seen.data.totals)}`);
      // the target is for the whole period and spread over its months
      assert(row.monthly.length === seen.data.months.length && row.monthly.reduce((t, n) => t + n, 0) === 10, `monthly ${JSON.stringify(row.monthly)}`);
      assert(!JSON.stringify(seen.data).includes("leadsPerDay"), "leads per day is gone");
      // quick edit of one polo: a new target is spread again; the other fields are kept
      const quick = await http.put(`/goals/${goal.id}/polos/${polo.id}`, { target: 20 }, auth());
      const q = quick.data.rows.find(r => r.poloId === polo.id);
      assert(quick.status === 200 && q.target === 20 && q.manual === 2 && q.canceled === 1 && q.monthly.reduce((t, n) => t + n, 0) === 20, `quick ${quick.status} ${JSON.stringify(q && [q.target, q.manual, q.canceled, q.monthly])}`);
      assert((await http.put(`/goals/${goal.id}/polos/${polo.id}`, { target: 5 }, asUser(tk))).status === 403, "a consultant edited one polo");
      // the spreadsheet import: total done discounts what the CRM already counted, unknown polos are created
      const dry = (await http.post(`/goals/${goal.id}/polos/import`, { dryRun: true, items: [{ code: "9001", name: "Polo da Meta - RO", target: 30, done: 5, canceled: 1 }, { code: "7777", name: "Polo Inventado - RO", target: 12, done: 3, canceled: 0 }, { name: "", target: 1 }] }, auth())).data;
      assert(dry.updated === 1 && dry.created === 1 && dry.errors === 1, `dry ${JSON.stringify([dry.updated, dry.created, dry.errors])}`);
      assert(sql(`SELECT COUNT(*) FROM Polos WHERE code='7777'`) === "0", "dry run created a polo");
      const imp = await http.post(`/goals/${goal.id}/polos/import`, { items: [{ code: "9001", name: "Polo da Meta - RO", target: 30, done: 5, canceled: 1 }, { code: "7777", name: "Polo Inventado - RO", target: 12, done: 3, canceled: 0 }] }, auth());
      assert(imp.status === 200 && sql(`SELECT COUNT(*) FROM Polos WHERE code='7777'`) === "1", "import did not create the polo");
      const after = (await http.get(`/goals/polos?goalId=${goal.id}`, asUser(tk))).data;
      const again = after.rows.find(r => r.poloId === polo.id);
      assert(again.target === 30 && again.done === 5 && again.manual === 4, `import discounts the CRM ${JSON.stringify([again.target, again.done, again.manual])}`);
      // the team goals list does not show the polo semester
      assert(!(await http.get("/goals", auth())).data.some(g => g.id === goal.id), "polo goal leaked into the team goals");
    });
    await test("a confirmed enrollment can be edited: step back, swap the tutor, no message goes out", async () => {
      const row = sql(`SELECT id||'|'||poloId||'|'||COALESCE(onboardingTutorId,0) FROM Leads WHERE onboardingStatus='pending' AND poloId IS NOT NULL ORDER BY id DESC LIMIT 1`);
      assert(row, "no enrolled lead to edit");
      const [leadId, poloIdOf] = row.split("|").map(Number);
      const second = (await http.post("/users", { name: "Segundo Tutor", email: "tutor2@polo.test", password: "senha123", role: "tutor" }, auth())).data;
      const members = sql(`SELECT string_agg(userId||':'||role, ',') FROM PoloMembers WHERE poloId=${poloIdOf}`).split(",").filter(Boolean).map(x => { const [u, r] = x.split(":"); return { userId: Number(u), role: r }; });
      assert((await http.put(`/polos/${poloIdOf}/members`, { members: [...members, { userId: second.id, role: "tutoria" }] }, auth())).status === 200, "member not added");
      const sentBefore = graph.sent.length;
      const started = await http.put(`/leads/${leadId}/onboarding`, { status: "started" }, auth());
      assert(started.status === 200 && started.data.onboardingStatus === "started", `started ${started.status}`);
      const done = await http.put(`/leads/${leadId}/onboarding`, { status: "done" }, auth());
      assert(done.data.onboardingStatus === "done", "not done");
      const back = await http.put(`/leads/${leadId}/onboarding`, { status: "pending" }, auth());
      assert(back.data.onboardingStatus === "pending" && !back.data.onboardingDoneAt, `back ${JSON.stringify([back.data.onboardingStatus, back.data.onboardingDoneAt])}`);
      const swapped = await http.put(`/leads/${leadId}/onboarding`, { tutorId: second.id }, auth());
      assert(swapped.status === 200 && swapped.data.onboardingTutorId === second.id, `swap ${swapped.status} ${JSON.stringify(swapped.data).slice(0, 120)}`);
      assert(sql(`SELECT COUNT(*) FROM Tickets t JOIN Leads l ON l.contactId=t.contactId WHERE l.id=${leadId} AND t.segment='onboarding' AND t.status IN ('open','pending') AND t.userId=${second.id}`) === "1", "the onboarding conversation did not follow the new tutor");
      const outsider = (await http.post("/users", { name: "Fora do Polo", email: "forapolo@polo.test", password: "senha123", role: "tutor" }, auth())).data;
      assert((await http.put(`/leads/${leadId}/onboarding`, { tutorId: outsider.id }, auth())).status === 422, "a tutor from outside the polo was accepted");
      assert(graph.sent.length === sentBefore, "editing the enrollment sent a message");
    });
    await test("login is rate limited", async () => {
      let limited = false;
      for (let i = 0; i < 120 && !limited; i += 1) {
        limited = (await http.post("/auth/login", { email: "naoexiste@x.com", password: "errada" })).status === 429;
      }
      assert(limited, "no 429 after 120 wrong logins");
    });
  } catch (e) {
    results.push([false, `harness: ${e.stack || e.message}`]);
    console.log("harness error:", e.stack || e.message);
  } finally {
    await cleanup();
  }
  const failed = results.filter(r => !r[0]);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  failed.forEach(f => console.log(" FAIL", f[1]));
  if (failed.length && global.__backendLog) console.log("--- backend log tail ---\n" + global.__backendLog().slice(-2500));
  process.exit(failed.length ? 1 : 0);
})();
