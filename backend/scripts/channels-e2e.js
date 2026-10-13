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
const MARIADB = process.env.MARIADB_BIN || "/opt/homebrew/opt/mariadb/bin/mariadb";
const DB = "whaticket_e2e";
const PORT = 8091;
const TG_PORT = 9101;
const GRAPH_PORT = 9102;
const API = `http://localhost:${PORT}`;
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

const sql = q => execFileSync(MARIADB, ["-uroot", "--default-character-set=utf8mb4", "-N", "-B", DB, "-e", q]).toString().trim();
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
const graph = { sent: [], media: [], n: 0 };

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

const startGraphMock = () => {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage() });
  app.use(express.json());
  app.get("/pic.jpg", (q, res) => res.type("image/png").send(PNG));
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
    try { execFileSync(MARIADB, ["-uroot", "-e", `DROP DATABASE IF EXISTS ${DB}`]); } catch (e) {}
  };
  try {
    execFileSync(MARIADB, ["-uroot", "-e", `DROP DATABASE IF EXISTS ${DB}; CREATE DATABASE ${DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`]);
    const env = {
      ...process.env, DB_NAME: DB, DB_HOST: "localhost", DB_USER: "root", DB_PASS: "", DB_DIALECT: "mysql",
      PORT: String(PORT), PROXY_PORT: String(PORT), BACKEND_URL: "http://localhost", PUBLIC_URL: API,
      FRONTEND_URL: "http://localhost:3000", JWT_SECRET: "e2e", JWT_REFRESH_SECRET: "e2e-r",
      TELEGRAM_API_URL: `http://localhost:${TG_PORT}`, GRAPH_API_URL: `http://localhost:${GRAPH_PORT}`,
      SKIP_WHATSAPP_SESSIONS: "1", LOG_LEVEL: "warn"
    };
    execFileSync("npx", ["sequelize", "db:migrate"], { cwd: ROOT, env, stdio: "ignore" });
    execFileSync("npx", ["sequelize", "db:seed:all"], { cwd: ROOT, env, stdio: "ignore" });
    await startTelegramMock();
    await startGraphMock();
    backend = spawn("node", ["dist/server.js"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    backend.stdout.on("data", d => (log += d));
    backend.stderr.on("data", d => (log += d));
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
      assert(sql(`SELECT CONCAT(source,'|',utmSource,'|',utmCampaign,'|',consentAt IS NOT NULL) FROM Leads WHERE email='pedro@x.com'`) === "Site / formulário|instagram|vestibular|1", "form fields");
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
    await test("backfill registers contacts that have no lead yet", async () => {
      await http.post("/api/v1/contacts", { name: "Contato antigo", number: "5531977770000" }, { headers: { Authorization: `Bearer ${(await http.post("/api-tokens", { name: "bf" }, auth())).data.token}` } });
      assert(!leadOf("5531977770000"), "lead existed before backfill");
      const r = await http.post("/crm/backfill", {}, auth());
      assert(r.status === 200 && r.data.created >= 1, `backfill ${JSON.stringify(r.data)}`);
      assert(leadOf("5531977770000"), "backfill did not create the lead");
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
  } catch (e) {
    results.push([false, `harness: ${e.stack || e.message}`]);
    console.log("harness error:", e.stack || e.message);
  } finally {
    await cleanup();
  }
  const failed = results.filter(r => !r[0]);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  failed.forEach(f => console.log(" FAIL", f[1]));
  process.exit(failed.length ? 1 : 0);
})();
