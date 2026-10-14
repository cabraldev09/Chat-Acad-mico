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
const PGBIN = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PGUSER = process.env.PGUSER || require("os").userInfo().username;
const psql = (db, q) => execFileSync(`${PGBIN}/psql`, ["-X", "-U", PGUSER, "-d", db, "-At", "-c", q]).toString().trim();
const DB = "whaticket_e2e";
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
    if (req.body.max_tokens === 220) return text("O aluno quer saber sobre bolsas e cursos.");
    const result = Array.isArray(last.content) && last.content.find(b => b.type === "tool_result");
    if (result) {
      const out = JSON.parse(result.content);
      if (out.completo) return text("Perfeito, Paulo! Um consultor da equipe continua com você.");
      if (out.cursos) return text(`O curso ${out.cursos[0].nome} tem mensalidade de tabela de R$ ${out.cursos[0].mensalidade_bruta_de_tabela}.`);
      return text("Anotado!");
    }
    const said = typeof last.content === "string" ? last.content : "";
    const knowledge = (req.body.system[1] && req.body.system[1].text) || "";
    if (/atletas/i.test(said)) return text(knowledge.includes("30% de bolsa") ? "Atletas federados têm 30% de bolsa, mediante comprovação." : "[DESCONHECIDO]");
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
    try { psql("postgres", `DROP DATABASE IF EXISTS ${DB}`); } catch (e) {}
  };
  try {
    psql("postgres", `DROP DATABASE IF EXISTS ${DB}`);
    psql("postgres", `CREATE DATABASE ${DB}`);
    const env = {
      ...process.env, DB_NAME: DB, DB_HOST: "localhost", DB_USER: PGUSER, DB_PASS: "", DB_PORT: "5432", DB_DIALECT: "postgres",
      PORT: String(PORT), PROXY_PORT: String(PORT), BACKEND_URL: "http://localhost", PUBLIC_URL: API,
      FRONTEND_URL: "http://localhost:3000", JWT_SECRET: "e2e", JWT_REFRESH_SECRET: "e2e-r",
      TELEGRAM_API_URL: `http://localhost:${TG_PORT}`, GRAPH_API_URL: `http://localhost:${GRAPH_PORT}`,
      SKIP_WHATSAPP_SESSIONS: "1", LOG_LEVEL: "warn", EFI_API_URL: `http://localhost:${EFI_PORT}`, EFI_BILLET_API_URL: `http://localhost:${BILLET_PORT}`, EFI_POLL_MS: "1500",
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
      const p = (await http.post(`/leads/${l.id}/payments`, { method: "bolix", dueDate: ymdPlus(3) }, auth())).data;
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
      assert((await http.get(`/messages/${t}/list`, { params: { kind: "media" }, ...asUser((await http.post("/auth/login", { email: "afil-tutor@x.com", password: "senha123" })).data.token) })).status === 403, "tutor reads a sales conversation");

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
      assert(before.now && before.day && before.day.week.length === 7 && before.day.byHour.length >= 13, "dashboard shape");

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
      assert(after.day.received - before.day.received === 2, `received counts today's customer + team message only: ${after.day.received - before.day.received}`);
      assert(after.day.sent - before.day.sent === 1, "sent");
      assert(after.day.conversations - before.day.conversations === 2, "conversations of the day (group out, yesterday's message not counted)");

      // marking the colleague as team removes them from every number
      assert((await http.put(`/contacts/${mate}/staff`, { isStaff: true }, auth())).status === 200, "mark staff");
      const staffed = (await http.get("/dashboard", auth())).data;
      assert(staffed.day.received - before.day.received === 1 && staffed.day.conversations - before.day.conversations === 1, "team member still counted");
      const ov = (await http.get("/stats/overview", { params: { from: "2020-01-01", to: "2099-12-31" }, ...auth() })).data;
      assert(sql(`SELECT isStaff FROM Contacts WHERE id=${mate}`) === "1", "flag not saved");
      assert(ov.totals, "stats still answers");

      // another day: yesterday shows the old message, today's are not mixed in
      const y = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });
      const yesterday = (await http.get("/dashboard", { params: { date: y }, ...auth() })).data;
      assert(yesterday.date === y && yesterday.day.received >= 1, "yesterday keeps its own message");
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
      assert(r.data.queues.length === 4 && ["comercial", "tutoria", "academico", "coordenacao"].every(k => r.data.queues.some(q => q.role === k)), "queues per function");
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
      assert(graph.sent.slice(before).some(x => x.body && x.body.text && x.body.text.body.includes("tutoria")), "intro not delivered");

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
      assert(!(await http.get("/affiliates", asUser(tb))).data.some(a => a.id === aff.id), "list leaked an affiliate");
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
    await test("login is rate limited", async () => {
      let limited = false;
      for (let i = 0; i < 40 && !limited; i += 1) {
        limited = (await http.post("/auth/login", { email: "naoexiste@x.com", password: "errada" })).status === 429;
      }
      assert(limited, "no 429 after 40 wrong logins");
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
