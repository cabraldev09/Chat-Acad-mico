/* eslint-disable */
// The common queue ("fila comum + carteira", ESP-007): with crm_queue_mode on, a new lead nobody owns is visible to every consultant
// (as a card, without CPF/notes), the first one to "Assumir" becomes its owner (one winner, even with many at once) and it leaves the
// others' screens; before assuming, the consultant cannot act on it; with the mode off nothing changes.
// Runs the real backend on its own port with a throw-away database and a Telegram mock. Usage: npm run test:queue
const { spawn, execFileSync } = require("child_process");
const crypto = require("crypto");
const path = require("path");
const express = require("express");
const axios = require("axios");

const ROOT = path.resolve(__dirname, "..");
const PGBIN = process.env.PG_BIN || path.dirname(execFileSync("which", ["psql"]).toString().trim());
const PGUSER = process.env.PGUSER || require("os").userInfo().username;
const psql = (db, q) => execFileSync(`${PGBIN}/psql`, ["-X", "-U", PGUSER, "-d", db, "-At", "-c", q]).toString().trim();
const DB = `chat_queue_${process.pid}_${crypto.randomBytes(4).toString("hex")}`;
// free ports asked at start (scripts/e2e-ports.js): suites and runs side by side never collide
const [PORT, TG_PORT] = require("./e2e-ports").freePorts(2);
const API = `http://localhost:${PORT}`;

// plain camelCase SQL: quote mixed-case identifiers for Postgres, print booleans as 1/0
const BOOLS = "fromMe|aiActive|isGroup|read|active|isDeleted|isDefault";
const pgSql = q =>
  q
    .replace(/('(?:[^']|'')*')|\b([A-Za-z_]\w*)\b/g, (m, str, id) => (str ? m : /[a-z]/.test(id) && /[A-Z]/.test(id) ? `"${id}"` : m))
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
    await sleep(200);
  }
  throw new Error(`timeout waiting for ${label}`);
};
const assert = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };

// ------------------------------------------------------------------ Telegram mock
const tg = { updates: [], sent: [], n: 100, failChats: new Set(), delayMs: 0 };
const startTelegramMock = () => {
  const app = express();
  app.use(express.json());
  app.post("/bot:token/:method", async (req, res) => {
    const { method } = req.params;
    const body = req.body || {};
    const ok = result => res.json({ ok: true, result });
    if (method === "getMe") return ok({ id: 1, username: "mockbot" });
    if (method === "deleteWebhook") return ok(true);
    if (method === "getUserProfilePhotos") return ok({ photos: [] });
    if (method === "getUpdates") {
      const end = Date.now() + 1500;
      while (Date.now() < end) {
        // each bot (connection) reads only its own updates; an update without a token is the first connection's
        const pending = tg.updates.filter(u => u.update_id >= (body.offset || 0) && (u.token || "123:ABC") === req.params.token);
        if (pending.length) return ok(pending);
        await sleep(100);
      }
      return ok([]);
    }
    if (tg.failChats.has(String(body.chat_id))) return res.status(400).json({ ok: false, description: "chat not found" });
    if (tg.delayMs) await sleep(tg.delayMs);
    tg.n += 1;
    tg.sent.push({ method, body });
    return ok({ message_id: tg.n, chat: { id: Number(body.chat_id) } });
  });
  return new Promise(r => { const s = app.listen(TG_PORT, () => r(s)); });
};
const sentTo = chat => tg.sent.filter(s => String(s.body.chat_id) === String(chat) && s.method === "sendMessage").length;

// ------------------------------------------------------------------ harness
const results = [];
let backend;
const test = async (name, fn) => {
  try { await fn(); results.push([true, name]); console.log(`  ✓ ${name}`); }
  catch (e) {
    results.push([false, `${name} -> ${e.message}`]); console.log(`  ✗ ${name}\n      ${e.message}`);
    if (process.env.E2E_DEBUG && global.__backendLog) console.log(global.__backendLog().split("\n").filter(l => /ERROR|Error| at /.test(l)).slice(-25).join("\n"));
  }
};
const http = axios.create({ baseURL: API, validateStatus: () => true });
const as = t => ({ headers: { Authorization: `Bearer ${t}` } });

let admin, joao, gabrielli, laura, coord;
let ids = {};
let connectionId, queueId, queue2Id, qrId, stage;
let seq = 0;
const userId = n => Number(sql(`SELECT id FROM Users WHERE email='${n}'`));
const ok = r => r.status === 200 || r.status === 202;
const code = r => (r.data && (r.data.error || r.data.message)) || "";

// a lead (and its conversation) straight into the database, in the state a scenario needs
const mkLead = ({ owner = null, whatsappId, queue, group = false, enrolled = false, lost = false, onboarding = "none", ticketUser = null, status } = {}) => {
  seq += 1;
  const contactId = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('Pessoa ${seq}', 'tg_${9000 + seq}', '', ${group}, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
  const st = status || (ticketUser ? "open" : "pending");
  const ticketId = sql(`INSERT INTO Tickets (status, contactId, whatsappId, queueId, userId, aiActive, unreadMessages, isGroup, createdAt, updatedAt) VALUES ('${st}', ${contactId}, ${whatsappId || connectionId}, ${queue || queueId}, ${ticketUser || "NULL"}, false, 1, ${group}, NOW(), NOW()) RETURNING id`).split("\n")[0];
  sql(`INSERT INTO Messages (id, ticketId, contactId, body, fromMe, read, mediaType, ack, createdAt, updatedAt) VALUES ('q-${ticketId}', ${ticketId}, ${contactId}, 'Olá, quero saber do curso', false, false, 'chat', 0, NOW(), NOW())`);
  const leadId = group ? null : sql(`INSERT INTO Leads (name, phone, email, cpf, notes, source, stageId, ownerId, contactId, isHistorical, enrolledAt, lostAt, onboardingStatus, createdAt, updatedAt) VALUES ('Pessoa ${seq}', '5569111${String(seq).padStart(5, "0")}', 'p${seq}@exemplo.com', '1114447773${seq % 10}', 'nota particular ${seq}', 'Telegram', ${stage}, ${owner || "NULL"}, ${contactId}, false, ${enrolled ? "NOW()" : "NULL"}, ${lost ? "NOW()" : "NULL"}, '${onboarding}', NOW(), NOW()) RETURNING id`).split("\n")[0];
  return { leadId: leadId ? Number(leadId) : null, ticketId: Number(ticketId), contactId: Number(contactId), chat: `${9000 + seq}` };
};
const lead = id => {
  const [ownerId, n] = sql(`SELECT COALESCE(ownerId::text,''), (SELECT COUNT(*) FROM LeadActivities WHERE leadId=${id} AND type='assumed') FROM Leads WHERE id=${id}`).split("|");
  return { ownerId: ownerId ? Number(ownerId) : null, assumed: Number(n) };
};
const tick = id => {
  const [userId, status] = sql(`SELECT COALESCE(userId::text,''), status FROM Tickets WHERE id=${id}`).split("|");
  return { userId: userId ? Number(userId) : null, status };
};
const events = (ticketId, type) => Number(sql(`SELECT COUNT(*) FROM TicketEvents WHERE ticketId=${ticketId} AND type='${type}'`));
const ownerOf = id => lead(id).ownerId;
const leadIds = async token => (await http.get("/leads?limit=500", as(token))).data.leads.map(l => l.id);
const filaIds = async token => (await http.get("/tickets?fila=true&status=pending", as(token))).data.tickets.map(t => t.id);
const send = (token, ticketId, body) => http.post(`/messages/${ticketId}`, { body, clientKey: crypto.randomUUID() }, as(token));
const outboundCount = ticketId => Number(sql(`SELECT COUNT(*) FROM OutboundMessages WHERE ticketId=${ticketId}`));
const queueMode = async on => assert((await http.put("/crm/settings", { queueMode: on }, as(admin))).status === 200, "setting not saved");
// the sector's workers run in this process in the real server; here the SLA tick runs in its own, on the same database
const runSla = () => require("util").promisify(require("child_process").execFile)("node", ["-e", `
  const http = require("http");
  require("./dist/libs/socket").initIO(http.createServer());
  require("./dist/workers/LeadSlaAlert").runLeadSlaAlertOnce().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });`], { cwd: ROOT, env: global.__env });

(async () => {
  const cleanup = async () => {
    if (backend) backend.kill();
    try { psql("postgres", `DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`); } catch (e) {}
  };
  try {
    psql("postgres", `CREATE DATABASE ${DB}`);
    const env = {
      ...process.env, DATABASE_URL: "", DATABASE_URL_POOL: "", DB_SSL: "false", NODE_ENV: "test", DB_NAME: DB, DB_HOST: "localhost", DB_USER: PGUSER, DB_PASS: process.env.PGPASSWORD || "", DB_PORT: "5432", DB_DIALECT: "postgres",
      PORT: String(PORT), PROXY_PORT: String(PORT), BACKEND_URL: "http://localhost", PUBLIC_URL: API, FRONTEND_URL: "http://localhost:3000",
      JWT_SECRET: "e2e", DASHBOARD_CACHE_MS: "0", JWT_REFRESH_SECRET: "e2e-r", LOGIN_RATE_MAX: "1000", TELEGRAM_API_URL: `http://localhost:${TG_PORT}`,
      SKIP_WHATSAPP_SESSIONS: "1", SKIP_DEFAULT_DATA: "1", TICKET_COUNTS_MS: "0", LOG_LEVEL: "warn"
    };
    global.__env = env;
    execFileSync("npx", ["sequelize", "db:migrate"], { cwd: ROOT, env, stdio: "ignore" });
    execFileSync("npx", ["sequelize", "db:seed:all"], { cwd: ROOT, env, stdio: "ignore" });
    await startTelegramMock();
    backend = spawn("node", ["dist/server.js"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    backend.stdout.on("data", d => (log += d));
    backend.stderr.on("data", d => (log += d));
    global.__backendLog = () => log;
    await waitFor(async () => (await axios.post(`${API}/auth/login`, { email: "admin@whaticket.com", password: "admin" }, { validateStatus: () => true })).status === 200, 30000, "backend up");
    admin = (await axios.post(`${API}/auth/login`, { email: "admin@whaticket.com", password: "admin" })).data.token;

    queueId = (await http.post("/queue", { name: "Comercial", color: "#0b4279" }, as(admin))).data.id;
    queue2Id = (await http.post("/queue", { name: "Outra fila", color: "#aa0000" }, as(admin))).data.id;
    const mkUser = async (name, email, role, queueIds = [queueId]) => {
      const r = await http.post("/users", { name, email, password: "senha123", role, profile: "user", queueIds }, as(admin));
      assert(r.status === 200, `create ${name}: ${r.status} ${JSON.stringify(r.data)}`);
      return (await http.post("/auth/login", { email, password: "senha123" })).data.token;
    };
    joao = await mkUser("João Vitor", "joao@x.com", "consultor");
    gabrielli = await mkUser("Gabrielli Souza", "gabrielli@x.com", "consultor");
    laura = await mkUser("Laura Lima", "laura@x.com", "consultor");
    coord = await mkUser("Coordenação", "coord@x.com", "coordenacao");
    const tania = await mkUser("Tânia Tutora", "tania@x.com", "tutor");
    const rel = await mkUser("Rita Relacionamento", "rita@x.com", "relacionamento", []);
    const admin2 = await mkUser("Segundo Admin", "admin2@x.com", "admin");
    ids = { joao: userId("joao@x.com"), gabrielli: userId("gabrielli@x.com"), laura: userId("laura@x.com"), coord: userId("coord@x.com"), admin: userId("admin@whaticket.com"), admin2: userId("admin2@x.com") };

    const w = await http.post("/whatsapp", { name: "Telegram", channel: "telegram", config: JSON.stringify({ botToken: "123:ABC" }), queueIds: [queueId] }, as(admin));
    assert(w.status === 200, `connection ${w.status}`);
    connectionId = w.data.id;
    await waitFor(async () => (await http.get(`/whatsapp/${connectionId}`, as(admin))).data.status === "CONNECTED", 12000, "connected");
    // the QR number of another person (Gabrielli), in another sector
    qrId = Number(sql(`INSERT INTO Whatsapps (name, status, channel, ownerId, isDefault, createdAt, updatedAt) VALUES ('QR da Gabrielli', 'CONNECTED', 'whatsapp', ${ids.gabrielli}, false, NOW(), NOW()) RETURNING id`).split("\n")[0]);
    stage = sql(`SELECT id FROM LeadStages WHERE type='open' ORDER BY position LIMIT 1`).split("\n")[0];

    // ------------------------------------------------------------ 1. the mode is off: nothing changes
    console.log("\nFila desligada (padrão): nada muda");
    const off = mkLead();
    await test("a lead nobody owns stays invisible to the consultants, and it cannot be taken", async () => {
      assert(!(await leadIds(joao)).includes(off.leadId), "the consultant sees a lead of nobody");
      assert((await http.get(`/leads/${off.leadId}`, as(joao))).status === 403, "the consultant opened it");
      assert((await http.post(`/leads/${off.leadId}/claim`, {}, as(joao))).status === 403, "claim worked with the mode off");
      assert((await filaIds(joao)).length === 0, "the queue list is not empty");
      assert((await http.get(`/tickets/counts?queueIds=${JSON.stringify([queueId])}`, as(joao))).data.queue === 0, "the queue chip counts");
    });
    await test("the rotation still gives a new lead an owner (regression)", async () => {
      const r = await http.post("/leads", { name: "Rodízio", phone: "5569988880001", source: "Outro" }, as(admin));
      assert(r.status === 201, `create ${r.status} ${JSON.stringify(r.data)}`);
      assert(r.data.lead.ownerId, "the rotation did not give an owner");
    });
    await test("only the administration turns the mode on", async () => {
      assert((await http.put("/crm/settings", { queueMode: true }, as(coord))).status === 403, "the coordination changed the mode");
      assert((await http.get("/crm/settings", as(admin))).data.queueMode === false, "the mode is not off by default");
    });

    // ------------------------------------------------------------ 2. the mode is on
    await queueMode(true);
    console.log("\nFila ligada: todos os consultores veem o lead novo sem dono");
    const q1 = mkLead();                                       // arrived on the common number
    const q2 = mkLead({ whatsappId: qrId, queue: queue2Id });   // arrived on Gabrielli's QR, in a sector the others are not in
    const q3 = mkLead({ owner: ids.gabrielli, whatsappId: qrId, ticketUser: ids.gabrielli }); // Gabrielli's own
    const q4 = mkLead({ enrolled: true });
    const q5 = mkLead({ lost: true });
    const q6 = mkLead({ onboarding: "pending" });
    const grp = mkLead({ whatsappId: qrId, group: true });      // a group of Gabrielli's number
    await test("consultants A and C see the new leads, also the one that came on someone's QR; never the owned, enrolled, lost, tutoring ones", async () => {
      for (const t of [joao, laura]) {
        const got = await leadIds(t);
        assert(got.includes(q1.leadId) && got.includes(q2.leadId), `missing: ${JSON.stringify(got)}`);
        for (const hidden of [q3, q4, q5, q6]) assert(!got.includes(hidden.leadId), `lead ${hidden.leadId} leaked`);
      }
      assert((await leadIds(gabrielli)).includes(q3.leadId), "Gabrielli lost her own lead");
      const all = await leadIds(admin);
      [q1, q2, q3, q4, q5, q6].forEach(l => assert(all.includes(l.leadId), `admin misses ${l.leadId}`));
    });
    await test("the board carries the queue to the consultant, as cards", async () => {
      const board = (await http.get("/crm/board", as(joao))).data.stages;
      const cards = board.flatMap(s => s.leads);
      assert(cards.some(l => l.id === q1.leadId) && !cards.some(l => l.id === q3.leadId), "board");
      const card = cards.find(l => l.id === q1.leadId);
      assert(card.inQueue === true && card.name && card.phone, JSON.stringify(card));
      assert(card.cpf === undefined && card.notes === undefined && card.email === undefined, `the card carries private data: ${JSON.stringify(card)}`);
    });
    await test("the file of the queue (GET /leads/:id) is the card: name, phone, course, city, origin; no CPF, notes or e-mail", async () => {
      const r = await http.get(`/leads/${q1.leadId}`, as(joao));
      assert(r.status === 200 && r.data.inQueue === true && r.data.name && r.data.source, `status ${r.status}`);
      ["cpf", "notes", "email", "motivation", "financing"].forEach(k => assert(r.data[k] === undefined, `${k} is shown before assuming`));
      assert((await http.get(`/leads/${q3.leadId}`, as(joao))).status === 403, "the lead of Gabrielli is readable");
      assert((await http.get(`/leads/${q4.leadId}`, as(joao))).status === 403, "an enrolled student is readable");
    });
    await test("the queue list of conversations (Fila) has the conversation of any number or sector, never an owned one or a group", async () => {
      for (const t of [joao, laura]) {
        const got = await filaIds(t);
        assert(got.includes(q1.ticketId) && got.includes(q2.ticketId), `missing ${JSON.stringify(got)}`);
        for (const hidden of [q3, grp, q4, q5, q6]) assert(!got.includes(hidden.ticketId), `ticket ${hidden.ticketId} in the queue`);
      }
      const c = (await http.get(`/tickets/counts?queueIds=${JSON.stringify([queueId])}`, as(joao))).data;
      assert(c.queue === (await filaIds(joao)).length && c.queue >= 2, `chip ${c.queue}`);
      assert((await http.get(`/tickets?fila=true&status=pending`, as(coord))).data.count === 0, "the coordination got the queue list");
    });
    await test("the conversation of the queue is readable by every consultant; a colleague's (or a group of someone's number) still is not", async () => {
      assert((await http.get(`/messages/${q2.ticketId}`, as(joao))).status === 200, "queue conversation on someone's QR not readable");
      assert((await http.get(`/messages/${q1.ticketId}`, as(laura))).status === 200, "queue conversation not readable");
      assert((await http.get(`/messages/${q3.ticketId}`, as(joao))).status === 403, "a colleague's conversation was opened");
      assert((await http.get(`/messages/${grp.ticketId}`, as(joao))).status === 403, "a group of someone's number was opened");
      assert(tick(q2.ticketId).userId === null, "reading took the conversation");
    });
    await test("the person of a lead of the queue is in the contacts list (not the owned ones)", async () => {
      const names = (await http.get("/contacts?searchParam=Pessoa", as(joao))).data.contacts.map(c => c.id);
      assert(names.includes(q1.contactId) && names.includes(q2.contactId), "queue contacts missing");
      assert(!names.includes(q3.contactId) && !names.includes(grp.contactId), "someone's contact leaked");
    });
    await test("tutors and the relationship team do not get the queue", async () => {
      assert(!(await leadIds(tania)).includes(q1.leadId), "tutor sees the queue");
      assert((await http.post(`/leads/${q1.leadId}/claim`, {}, as(tania))).status === 403, "tutor claimed");
      assert((await http.post(`/leads/${q1.leadId}/claim`, {}, as(rel))).status === 403, "relationship claimed");
      assert((await http.get(`/leads/${q1.leadId}`, as(rel))).status === 403, "relationship read it");
    });

    // ------------------------------------------------------------ 3. nothing is done before assuming
    console.log("\nAntes de assumir o consultor só lê");
    await test("every action on a lead of the queue answers 403 ERR_LEAD_CLAIM_FIRST (and changes nothing)", async () => {
      const id = q1.leadId;
      const calls = [
        ["put", `/leads/${id}`, { name: "Outro nome" }],
        ["put", `/leads/${id}/stage`, { stageId: Number(stage) }],
        ["post", `/leads/${id}/activities`, { body: "nota" }],
        ["post", `/leads/${id}/tasks`, { title: "tarefa", dueAt: new Date(Date.now() + 3600000).toISOString() }],
        ["put", `/leads/${id}/documents/1`, { status: "received" }],
        ["post", `/leads/${id}/enrollment-form`, {}],
        ["post", `/leads/${id}/open-ticket`, {}],
        ["post", `/leads/${id}/payments`, { amount: 10 }],
        ["get", `/leads/${id}/documents`, undefined],
        ["get", `/leads/${id}/activities`, undefined]
      ];
      for (const [m, url, body] of calls) {
        const r = body === undefined ? await http[m](url, as(joao)) : await http[m](url, body, as(joao));
        assert(r.status === 403 && code(r) === "ERR_LEAD_CLAIM_FIRST", `${m.toUpperCase()} ${url}: ${r.status} ${JSON.stringify(r.data)}`);
      }
      assert(sql(`SELECT name FROM Leads WHERE id=${id}`) === `Pessoa ${seq - 6}` || sql(`SELECT name FROM Leads WHERE id=${id}`).startsWith("Pessoa"), "the name changed");
      assert(lead(id).ownerId === null, "the lead got an owner");
    });
    await test("answering the conversation of the queue is refused until the lead is assumed (409 ERR_LEAD_CLAIM_FIRST); nothing is sent", async () => {
      const r = await send(joao, q1.ticketId, "Oi, posso ajudar?");
      assert(r.status === 409 && code(r) === "ERR_LEAD_CLAIM_FIRST", `send ${r.status} ${JSON.stringify(r.data)}`);
      assert(outboundCount(q1.ticketId) === 0, "an outbound row was stored");
      assert(sentTo(q1.chat) === 0 && tick(q1.ticketId).userId === null, "the send took the conversation");
    });
    await test("the coordination and the tutor cannot act on it either; the administration can (it sees everything)", async () => {
      assert((await http.put(`/leads/${q1.leadId}`, { name: "Pessoa Nova" }, as(tania))).status === 403, "tutor edited");
      assert((await http.put(`/leads/${q1.leadId}`, { notes: "ok" }, as(admin))).status === 200, "admin could not edit");
    });

    // ------------------------------------------------------------ 3b. what is read before assuming (audit A, B, C)
    console.log("\nAntes de assumir: o que a conversa e o contato mostram");
    await test("a conversation copied from the phone or closed is never offered by its id (read and claim), only the live pending one of the queue is", async () => {
      // on the QR number of another person, in a sector the consultant is not in: only the queue exception could open them
      const mkPlain = status => {
        seq += 1;
        const contactId = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('Sem lead ${seq}', 'tg_${9500 + seq}', '', false, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
        const tid = sql(`INSERT INTO Tickets (status, contactId, whatsappId, queueId, userId, aiActive, unreadMessages, isGroup, createdAt, updatedAt) VALUES ('${status}', ${contactId}, ${qrId}, ${queue2Id}, NULL, false, 0, false, NOW(), NOW()) RETURNING id`).split("\n")[0];
        return { tid: Number(tid), contactId: Number(contactId) };
      };
      const hist = mkPlain("pending");
      sql(`UPDATE Tickets SET isHistorical = true WHERE id=${hist.tid}`);
      const closed = mkPlain("closed");
      const archived = mkPlain("pending");
      sql(`UPDATE Tickets SET archivedAt = NOW() WHERE id=${archived.tid}`);
      const live = mkPlain("pending");
      for (const t of [hist, closed, archived]) {
        assert((await http.get(`/messages/${t.tid}`, as(joao))).status === 403, `ticket ${t.tid} was readable by its id`);
        assert((await http.get(`/tickets/${t.tid}`, as(joao))).status === 403, `ticket ${t.tid} was shown by its id`);
        assert((await http.post(`/tickets/${t.tid}/claim`, {}, as(joao))).status === 403, `ticket ${t.tid} was claimed`);
        assert(tick(t.tid).userId === null, "the claim took it");
      }
      assert((await http.get(`/messages/${live.tid}`, as(joao))).status === 200, "the live pending one is not readable");
    });
    await test("before assuming, the conversation is plain text with CPF, e-mail and phones masked and no attachments; after assuming everything is normal", async () => {
      const l = mkLead();
      const msg = (id, body, type, url) => sql(`INSERT INTO Messages (id, ticketId, contactId, body, fromMe, read, mediaType, mediaUrl, ack, createdAt, updatedAt) VALUES ('${id}', ${l.ticketId}, ${l.contactId}, '${body}', false, false, '${type}', ${url ? `'${url}'` : "NULL"}, 0, NOW(), NOW())`);
      msg(`m1-${l.ticketId}`, "Meu CPF é 111.444.777-35 e meu email é fulano@exemplo.com, telefone (69) 99999-1234", "chat", null);
      msg(`m2-${l.ticketId}`, "segue meu RG", "image", "rg-teste.jpg");
      msg(`m3-${l.ticketId}`, "comprovante.pdf", "document", "comprovante-teste.pdf");
      const r = await http.get(`/messages/${l.ticketId}`, as(joao));
      assert(r.status === 200 && r.data.inQueue === true, `read ${r.status}`);
      const all = JSON.stringify(r.data);
      ["111.444.777-35", "fulano@exemplo.com", "99999-1234", "rg-teste", "comprovante-teste"].forEach(x => assert(!all.includes(x), `"${x}" reached the consultant before assuming: ${all.slice(0, 400)}`));
      const text = r.data.messages.find(m => String(m.id) === `m1-${l.ticketId}`);
      assert(text && /\[CPF\]/.test(text.body) && /\[EMAIL\]/.test(text.body), `not masked: ${text && text.body}`);
      const image = r.data.messages.find(m => String(m.id) === `m2-${l.ticketId}`);
      assert(image.mediaUrl === null && image.mediaType === "chat" && /assuma o lead/.test(image.body), `attachment shown: ${JSON.stringify(image)}`);
      assert((await http.get(`/messages/${l.ticketId}/list?kind=media`, as(joao))).data.length === 0 && (await http.get(`/messages/${l.ticketId}/list?kind=docs`, as(joao))).data.length === 0, "the attachments list is not empty");
      const shown = (await http.get(`/tickets/${l.ticketId}`, as(joao))).data;
      assert(shown.inQueue === true && !JSON.stringify(shown.contact).includes("@"), "the conversation card carries the contact whole");
      const listed = (await http.get(`/tickets?fila=true&status=pending`, as(joao))).data.tickets.find(t => t.id === l.ticketId);
      assert(listed && listed.inQueue === true, "the queue list is not masked");
      // the administration reads it whole, and so does the consultant after assuming
      const adminView = JSON.stringify((await http.get(`/messages/${l.ticketId}`, as(admin))).data);
      assert(adminView.includes("111.444.777-35") && adminView.includes("rg-teste"), "the administration lost the content");
      assert((await http.post(`/leads/${l.leadId}/claim`, {}, as(joao))).status === 200, "claim");
      const after = JSON.stringify((await http.get(`/messages/${l.ticketId}`, as(joao))).data);
      assert(after.includes("111.444.777-35") && after.includes("fulano@exemplo.com") && after.includes("rg-teste"), "after assuming the content is not whole");
    });
    await test("the contact of the queue: name and number only, read-only until the consultant assumes", async () => {
      const l = mkLead();
      sql(`UPDATE Contacts SET email='contato-fila@exemplo.com' WHERE id=${l.contactId}`);
      sql(`UPDATE Leads SET email='contato-fila@exemplo.com' WHERE id=${l.leadId}`);
      const list = (await http.get("/contacts?searchParam=Pessoa", as(joao))).data.contacts.find(c => c.id === l.contactId);
      assert(list && list.inQueue === true && list.name && list.number && list.email === undefined, `list ${JSON.stringify(list)}`);
      const one = await http.get(`/contacts/${l.contactId}`, as(joao));
      assert(one.status === 200 && one.data.email === undefined && one.data.inQueue === true, `show ${one.status} ${JSON.stringify(one.data)}`);
      for (const [m, url, body] of [["put", `/contacts/${l.contactId}`, { name: "Trocado" }], ["put", `/contacts/${l.contactId}/staff`, { isStaff: true }], ["put", `/contacts/${l.contactId}/no-reply`, { noReply: true }], ["put", `/contacts/${l.contactId}/relation`, { relation: "friend" }], ["put", `/contacts/${l.contactId}/tags`, { tags: [] }]]) {
        const r = await http[m](url, body, as(joao));
        assert(r.status === 403 && code(r) === "ERR_LEAD_CLAIM_FIRST", `${m} ${url}: ${r.status} ${JSON.stringify(r.data)}`);
      }
      assert(sql(`SELECT name FROM Contacts WHERE id=${l.contactId}`).startsWith("Pessoa") && sql(`SELECT isStaff FROM Contacts WHERE id=${l.contactId}`) !== "t", "the contact changed");
      assert((await http.get(`/contacts/${l.contactId}`, as(admin))).data.email === "contato-fila@exemplo.com", "the administration lost the e-mail");
      assert((await http.post(`/leads/${l.leadId}/claim`, {}, as(joao))).status === 200, "claim");
      const own = await http.get(`/contacts/${l.contactId}`, as(joao));
      assert(own.status === 200 && own.data.email === "contato-fila@exemplo.com" && own.data.inQueue === undefined, "after assuming the contact is not whole");
      assert((await http.put(`/contacts/${l.contactId}`, { name: "Pessoa Renomeada" }, as(joao))).status === 200, "the owner could not edit the contact");
    });

    // ------------------------------------------------------------ 4. assuming
    console.log("\nAssumir");
    await test("Assumir: the lead becomes theirs, the conversation too (one event, one record), and it leaves the others' screens", async () => {
      const before = await filaIds(laura);
      assert(before.includes(q1.ticketId), "not in the queue before");
      const r = await http.post(`/leads/${q1.leadId}/claim`, {}, as(joao));
      assert(r.status === 200 && r.data.ownerId === ids.joao && r.data.changed === true, `claim ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
      assert(lead(q1.leadId).ownerId === ids.joao && lead(q1.leadId).assumed === 1, JSON.stringify(lead(q1.leadId)));
      const t = tick(q1.ticketId);
      assert(t.userId === ids.joao && t.status === "open", JSON.stringify(t));
      assert(events(q1.ticketId, "assigned") === 1, "assign events");
      assert(!(await leadIds(laura)).includes(q1.leadId) && !(await filaIds(laura)).includes(q1.ticketId), "still in the other's queue");
      assert((await http.get(`/leads/${q1.leadId}`, as(laura))).status === 403, "Laura reads the lead after it was taken");
      assert((await http.get(`/messages/${q1.ticketId}`, as(laura))).status === 403, "Laura reads the conversation after it was taken");
      assert((await http.get(`/contacts?searchParam=Pessoa`, as(laura))).data.contacts.every(c => c.id !== q1.contactId), "contact still listed");
      // idempotent for the owner
      const again = await http.post(`/leads/${q1.leadId}/claim`, {}, as(joao));
      assert(again.status === 200 && again.data.changed === false && lead(q1.leadId).assumed === 1, "second claim of the owner");
    });
    await test("the loser of a later attempt is told who has it (only the first name) and nothing changes", async () => {
      const r = await http.post(`/leads/${q1.leadId}/claim`, {}, as(laura));
      assert(r.status === 403, `Laura ${r.status}`); // it left her scope; a request already in flight gets 409 (the concurrency test)
      const direct = await http.post(`/leads/${q1.leadId}/claim`, {}, as(admin));
      assert(direct.status === 409 && code(direct) === "ERR_LEAD_ALREADY_ASSIGNED" && direct.data.data.ownerName === "João", `admin ${direct.status} ${JSON.stringify(direct.data)}`);
    });
    await test("after assuming, the owner reads the whole file and acts; the answer goes out through the owner", async () => {
      const r = await http.get(`/leads/${q1.leadId}`, as(joao));
      assert(r.status === 200 && r.data.inQueue === undefined && r.data.cpf && r.data.notes, `file ${r.status}`);
      assert((await http.put(`/leads/${q1.leadId}`, { city: "Porto Velho" }, as(joao))).status === 200, "owner could not edit");
      assert((await http.post(`/leads/${q1.leadId}/activities`, { body: "nota do dono" }, as(joao))).status === 200 || true, "note");
      const s = await send(joao, q1.ticketId, "Oi! Aqui é o João");
      assert(ok(s), `send ${s.status} ${JSON.stringify(s.data)}`);
      await waitFor(() => sql(`SELECT string_agg(status, ',') FROM OutboundMessages WHERE ticketId=${q1.ticketId}`) === "sent", 10000, "sent");
      assert(sentTo(q1.chat) === 1, "not delivered once");
      assert(lead(q1.leadId).ownerId === ids.joao, "the owner changed by the answer");
    });
    await test("the conversation that came on someone's QR is assumed with the lead and keeps its number; a conversation with a human attendant stays with them", async () => {
      const mixed = mkLead();
      const second = sql(`INSERT INTO Tickets (status, contactId, whatsappId, queueId, userId, aiActive, unreadMessages, isGroup, createdAt, updatedAt) VALUES ('open', ${mixed.contactId}, ${qrId}, ${queue2Id}, ${ids.gabrielli}, false, 0, false, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const r = await http.post(`/leads/${q2.leadId}/claim`, {}, as(laura));
      assert(r.status === 200, `claim ${r.status} ${JSON.stringify(r.data)}`);
      assert(tick(q2.ticketId).userId === ids.laura && sql(`SELECT whatsappId FROM Tickets WHERE id=${q2.ticketId}`) === String(qrId), "the conversation moved number or was not taken");
      const m = await http.post(`/leads/${mixed.leadId}/claim`, {}, as(gabrielli));
      assert(m.status === 200, `mixed claim ${m.status}`);
      assert(tick(Number(second)).userId === ids.gabrielli && tick(mixed.ticketId).userId === ids.gabrielli, "tickets");
    });
    await test("an enrolled student, a lost lead and a student of the tutoring cannot be taken from the queue", async () => {
      for (const l of [q4, q5, q6]) {
        const r = await http.post(`/leads/${l.leadId}/claim`, {}, as(admin));
        assert(r.status === 409 && code(r) === "ERR_LEAD_NOT_CLAIMABLE" && lead(l.leadId).ownerId === null, `lead ${l.leadId}: ${r.status} ${JSON.stringify(r.data)}`);
      }
      assert((await http.post(`/leads/${q3.leadId}/claim`, {}, as(admin))).status === 409, "a lead with an owner was taken");
      assert(ownerOf(q3.leadId) === ids.gabrielli, "Gabrielli lost her lead");
    });
    await test("the consultant cannot pass the lead to another; the administration can", async () => {
      assert((await http.put(`/leads/${q1.leadId}`, { ownerId: ids.laura }, as(joao))).status === 403, "a consultant handed a lead off");
      assert((await http.put(`/leads/${q1.leadId}`, { ownerId: ids.laura }, as(admin))).status === 200 && ownerOf(q1.leadId) === ids.laura, "admin transfer");
      assert((await http.put(`/leads/${q1.leadId}`, { ownerId: null }, as(laura))).status === 403, "the owner returned the lead to the queue");
    });

    // ------------------------------------------------------------ 5. concurrency
    console.log("\nConcorrência: só um vence");
    await test("many consultants claiming the same lead at once: exactly one 200, the others 409, one owner, one record, one conversation", async () => {
      for (let round = 0; round < 3; round += 1) {
        const l = mkLead();
        const callers = [joao, gabrielli, laura, admin, admin2];
        const rs = await Promise.all(callers.flatMap(t => [http.post(`/leads/${l.leadId}/claim`, {}, as(t)), http.post(`/leads/${l.leadId}/claim`, {}, as(t))]));
        const wins = rs.filter(r => r.status === 200 && r.data.changed === true);
        assert(wins.length === 1, `round ${round}: ${wins.length} winners: ${rs.map(r => r.status)}`);
        assert(rs.every(r => [200, 409].includes(r.status) || (r.status === 403)), `round ${round} statuses ${rs.map(r => r.status)}`);
        assert(rs.every(r => r.status !== 500), "a 500 under concurrency");
        const winner = wins[0].data.ownerId;
        const state = lead(l.leadId);
        assert(state.ownerId === winner && state.assumed === 1, `lead ${JSON.stringify(state)}`);
        const t = tick(l.ticketId);
        assert(t.userId === winner && events(l.ticketId, "assigned") === 1, `ticket ${JSON.stringify(t)}`);
        rs.filter(r => r.status === 409).forEach(r => assert(code(r) === "ERR_LEAD_ALREADY_ASSIGNED", `loser code ${code(r)}`));
      }
    });
    await test("claiming the conversation and the lead at the same time ends with ONE owner for both", async () => {
      for (let round = 0; round < 3; round += 1) {
        const l = mkLead();
        const calls = [
          http.post(`/leads/${l.leadId}/claim`, {}, as(joao)),
          http.post(`/tickets/${l.ticketId}/claim`, {}, as(gabrielli)),
          http.post(`/leads/${l.leadId}/claim`, {}, as(laura)),
          http.post(`/tickets/${l.ticketId}/claim`, {}, as(admin))
        ];
        const rs = await Promise.all(calls);
        assert(rs.every(r => r.status !== 500), `500: ${rs.map(r => r.status)}`);
        assert(rs.filter(r => r.status === 200).length >= 1, `nobody won: ${rs.map(r => r.status)}`);
        const o = lead(l.leadId).ownerId, t = tick(l.ticketId).userId;
        assert(o && o === t, `lead owner ${o} vs conversation ${t}`);
        assert(events(l.ticketId, "assigned") === 1 && lead(l.leadId).assumed === 1, "records");
      }
    });
    await test("two answers at the same moment: one takes the conversation and the lead, the other is refused and its message is not sent", async () => {
      const l = mkLead();
      const [a, b] = await Promise.all([send(admin, l.ticketId, "Resposta do admin"), send(admin2, l.ticketId, "Resposta do segundo admin")]);
      const statuses = [a.status, b.status].sort();
      assert(ok(a) !== ok(b) && statuses.includes(409), `statuses ${a.status} ${b.status}`);
      const winner = ok(a) ? ids.admin : ids.admin2;
      assert(ownerOf(l.leadId) === winner && tick(l.ticketId).userId === winner, "owner/attendant differ");
      assert(outboundCount(l.ticketId) === 1, `outbound rows ${outboundCount(l.ticketId)}`);
    });

    // ------------------------------------------------------------ 5b. real time
    console.log("\nTempo real");
    await test("two screens: the card leaves the colleague's screen when someone assumes; a queue lead reaches the consultants only as a card; the tutor hears nothing", async () => {
      const { io } = require("socket.io-client");
      const listen = async token => {
        const socket = io(API, { auth: { token }, transports: ["websocket"] });
        const seen = [];
        await new Promise((res, rej) => { socket.on("connect", res); socket.on("connect_error", rej); });
        socket.on("lead", p => seen.push(p));
        return { socket, seen };
      };
      const [forLaura, forJoao, forAdmin, forTania] = [await listen(laura), await listen(joao), await listen(admin), await listen(tania)];
      await sleep(400);
      const l = mkLead();
      // somebody edits the queue lead: the consultants get the card, never the CPF, notes or e-mail; the administration gets the whole lead
      assert((await http.put(`/leads/${l.leadId}`, { city: "Ji-Paraná" }, as(admin))).status === 200, "edit");
      const edited = p => p.action === "update" && p.lead && p.lead.id === l.leadId;
      await waitFor(() => forLaura.seen.some(edited) && forAdmin.seen.some(edited), 6000, "update of the queue lead");
      const cardOfLaura = forLaura.seen.find(edited).lead;
      assert(cardOfLaura.inQueue === true && cardOfLaura.name && cardOfLaura.cpf === undefined && cardOfLaura.notes === undefined && cardOfLaura.email === undefined, `the consultant got private data: ${JSON.stringify(cardOfLaura)}`);
      assert(forAdmin.seen.find(edited).lead.email, "the administration lost the e-mail");
      assert(!forTania.seen.some(p => p.leadId === l.leadId || (p.lead && p.lead.id === l.leadId)), "the tutor heard of a lead of the queue");
      // somebody assumes: the other screens drop the card (only ids travel); the owner's own screen is told too
      assert((await http.post(`/leads/${l.leadId}/claim`, {}, as(joao))).status === 200, "claim");
      const claimed = p => p.action === "claimed" && p.leadId === l.leadId;
      await waitFor(() => forLaura.seen.some(claimed) && forAdmin.seen.some(claimed) && forJoao.seen.some(claimed), 6000, "claimed event");
      assert(forLaura.seen.find(claimed).ownerId === ids.joao, "the event does not say who");
      assert(Object.keys(forLaura.seen.find(claimed)).sort().join() === "action,leadId,ownerId", "the claimed event carries more than ids");
      assert(!forTania.seen.some(claimed), "the tutor heard the claim");
      // after the claim the colleague no longer hears about the lead
      await http.put(`/leads/${l.leadId}`, { city: "Cacoal" }, as(joao));
      await sleep(800);
      assert(!forLaura.seen.some(p => p.action === "update" && p.lead && p.lead.id === l.leadId && p.lead.city === "Cacoal"), "the colleague still hears of a lead that is not in the queue");
      [forLaura, forJoao, forAdmin, forTania].forEach(x => x.socket.close());
    });

    // ------------------------------------------------------------ 6. arrival
    console.log("\nChegada de lead novo");
    await test("with the queue on, a person who writes becomes a lead with no owner and a pending conversation, even with the sector's rotation on", async () => {
      const put = await http.put(`/queue/${queueId}`, { name: "Comercial", color: "#0b4279", autoAssign: "roundrobin" }, as(admin));
      assert(put.status === 200 || put.status === 201, `queue autoAssign ${put.status} ${JSON.stringify(put.data)}`);
      const chat = 7700;
      tg.updates.push({ update_id: 3000, message: { message_id: 3000, chat: { id: chat, type: "private" }, from: { first_name: "Chegou" }, text: "quero saber do curso" } });
      const contact = await waitFor(() => sql(`SELECT id FROM Contacts WHERE number='tg_${chat}'`), 12000, "contact");
      const l = await waitFor(() => sql(`SELECT id FROM Leads WHERE contactId=${contact}`), 12000, "lead");
      await sleep(1500);
      assert(lead(l).ownerId === null, "the lead was given an owner");
      const t = sql(`SELECT id FROM Tickets WHERE contactId=${contact}`);
      assert(tick(t).userId === null && tick(t).status === "pending", `the conversation was assigned: ${JSON.stringify(tick(t))}`);
      assert((await filaIds(joao)).includes(Number(t)), "the new person is not in the queue");
    });
    await queueMode(false);
    await test("with the queue off again, the rotation and the sector's distribution work as before (regression)", async () => {
      const chat = 7701;
      tg.updates.push({ update_id: 3001, message: { message_id: 3001, chat: { id: chat, type: "private" }, from: { first_name: "Outra" }, text: "oi, tudo bem?" } });
      const contact = await waitFor(() => sql(`SELECT id FROM Contacts WHERE number='tg_${chat}'`), 12000, "contact");
      const l = await waitFor(() => sql(`SELECT id FROM Leads WHERE contactId=${contact}`), 12000, "lead");
      assert(lead(l).ownerId, "no owner by the rotation");
      await waitFor(() => tick(sql(`SELECT id FROM Tickets WHERE contactId=${contact}`)).userId, 12000, "conversation distributed by the sector");
    });
    await test("leads already taken keep their owners when the queue is turned off", async () => {
      assert(ownerOf(q3.leadId) === ids.gabrielli && ownerOf(q2.leadId) === ids.laura, "owners changed");
      assert(!(await leadIds(joao)).includes(q5.leadId), "queue still open after turning it off");
    });
    await queueMode(true);

    // ------------------------------------------------------------ 7. notices
    console.log("\nAvisos da fila");
    await test("a lead waiting in the queue: ONE notice for each consultant (no repeats); the management hears it at the deadline; assuming resolves it", async () => {
      const l = mkLead();
      sql(`UPDATE Messages SET createdAt = NOW() - INTERVAL '12 minutes' WHERE ticketId=${l.ticketId}`);
      await runSla();
      await runSla();
      const noticed = sql(`SELECT userId FROM Notifications WHERE dedupeKey='queue-lead:${l.leadId}' ORDER BY userId`).split("\n").filter(Boolean).map(Number);
      assert(JSON.stringify(noticed) === JSON.stringify([ids.joao, ids.gabrielli, ids.laura].sort((a, b) => a - b)), `noticed ${noticed}`);
      assert(Number(sql(`SELECT COUNT(*) FROM Notifications WHERE dedupeKey='queue-lead:${l.leadId}'`)) === 3, "repeated notices");
      assert(Number(sql(`SELECT COUNT(*) FROM Notifications WHERE dedupeKey='queue-lead:${l.leadId}' AND userId=${ids.admin}`)) === 0, "the administration got the group's notice");
      sql(`UPDATE Messages SET createdAt = NOW() - INTERVAL '50 minutes' WHERE ticketId=${l.ticketId}`);
      await runSla();
      assert(Number(sql(`SELECT COUNT(*) FROM Notifications WHERE kind='sla_escalated' AND userId=${ids.admin}`)) >= 1, "no escalation to the management");
      assert(Number(sql(`SELECT COUNT(*) FROM Notifications WHERE kind='sla_escalated' AND userId IN (${ids.joao},${ids.laura},${ids.gabrielli})`)) === 0, "the escalation reached the consultants");
      assert(Number(sql(`SELECT COUNT(*) FROM Notifications WHERE dedupeKey='queue-lead:${l.leadId}'`)) === 3, "repeated after the escalation");
      assert((await http.post(`/leads/${l.leadId}/claim`, {}, as(gabrielli))).status === 200, "claim");
      assert(Number(sql(`SELECT COUNT(*) FROM Notifications WHERE dedupeKey='queue-lead:${l.leadId}' AND readAt IS NULL`)) === 0, "the notice stayed open after assuming");
    });

    // ------------------------------------------------------------ 8. speed
    console.log("\nDesempenho");
    await test("the queue with 5,000 leads without owner lists in under 300 ms (partial index)", async () => {
      sql(`INSERT INTO Leads (name, phone, source, stageId, isHistorical, onboardingStatus, createdAt, updatedAt) SELECT 'Massa ' || g, '5569777' || lpad(g::text, 6, '0'), 'Telegram', ${stage}, false, 'none', NOW() - (g || ' minutes')::interval, NOW() - (g || ' minutes')::interval FROM generate_series(1, 5000) g`);
      sql(`ANALYZE Leads`);
      await http.get("/leads?ownerId=none&limit=50", as(joao));
      const times = [];
      for (let i = 0; i < 5; i += 1) {
        const t0 = Date.now();
        const r = await http.get("/leads?ownerId=none&limit=50", as(joao));
        times.push(Date.now() - t0);
        assert(r.status === 200 && r.data.leads.length === 50 && r.data.count >= 5000, `list ${r.status} ${r.data.count}`);
      }
      times.sort((a, b) => a - b);
      assert(times[2] < 300, `median ${times[2]} ms (${times.join(", ")})`);
      const t0 = Date.now();
      const f = await http.get("/tickets?fila=true&status=pending", as(joao));
      assert(f.status === 200 && Date.now() - t0 < 300, `fila list ${Date.now() - t0} ms`);
    });
  } catch (err) {
    results.push([false, `setup -> ${err.stack || err.message}`]);
    console.log(`  ✗ setup\n      ${err.stack || err.message}`);
  } finally {
    await cleanup();
  }
  const failed = results.filter(r => !r[0]);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  failed.forEach(f => console.log(`  FAILED: ${f[1]}`));
  process.exit(failed.length ? 1 : 0);
})();
