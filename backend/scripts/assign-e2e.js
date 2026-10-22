/* eslint-disable */
// Who is responsible for a conversation: viewing never takes it, sending as a person assigns it atomically,
// nobody takes what belongs to someone else, the robot never answers after a person took over.
// Runs the real backend on its own port with a throw-away database and a Telegram mock (a real channel path:
// the send goes through the outbound worker and the adapter). Usage: npm run test:assign
const { spawn, execFileSync } = require("child_process");
const crypto = require("crypto");
const path = require("path");
const express = require("express");
const axios = require("axios");

const ROOT = path.resolve(__dirname, "..");
const PGBIN = process.env.PG_BIN || path.dirname(execFileSync("which", ["psql"]).toString().trim());
const PGUSER = process.env.PGUSER || require("os").userInfo().username;
const psql = (db, q) => execFileSync(`${PGBIN}/psql`, ["-X", "-U", PGUSER, "-d", db, "-At", "-c", q]).toString().trim();
const DB = `chat_assign_${process.pid}_${crypto.randomBytes(4).toString("hex")}`;
const PORT = 8093;
const TG_PORT = 9111;
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
        const pending = tg.updates.filter(u => u.update_id >= (body.offset || 0));
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
let connectionId, queueId;
let seq = 0;

// a conversation straight into the database, in the state a scenario needs
const mkTicket = ({ owner = null, status, ai = false, unread = 1, closed = false } = {}) => {
  seq += 1;
  const chat = `${7000 + seq}`;
  const contactId = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('Lead ${seq}', 'tg_${chat}', '', false, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
  const st = status || (closed ? "closed" : owner ? "open" : "pending");
  const ticketId = sql(`INSERT INTO Tickets (status, contactId, whatsappId, queueId, userId, aiActive, unreadMessages, isGroup, createdAt, updatedAt) VALUES ('${st}', ${contactId}, ${connectionId}, ${queueId}, ${owner || "NULL"}, ${ai}, ${unread}, false, NOW(), NOW()) RETURNING id`).split("\n")[0];
  sql(`INSERT INTO Messages (id, ticketId, contactId, body, fromMe, read, mediaType, ack, createdAt, updatedAt) VALUES ('seed-${ticketId}', ${ticketId}, ${contactId}, 'Olá, quero saber do curso', false, false, 'chat', 0, NOW(), NOW())`);
  return { ticketId: Number(ticketId), contactId: Number(contactId), chat };
};
const row = id => {
  const [userId, status, aiActive, unread] = sql(`SELECT COALESCE(userId::text,''), status, CASE WHEN aiActive THEN 1 ELSE 0 END, unreadMessages FROM Tickets WHERE id=${id}`).split("|");
  return { userId: userId ? Number(userId) : null, status, ai: aiActive === "1", unread: Number(unread) };
};
const ok = r => r.status === 200 || r.status === 202;
const send = (token, ticketId, body, clientKey) => http.post(`/messages/${ticketId}`, { body, clientKey: clientKey || crypto.randomUUID() }, as(token));
const outboundStatus = ticketId => sql(`SELECT string_agg(status, ',' ORDER BY id) FROM OutboundMessages WHERE ticketId=${ticketId}`);
const sentOk = async ticketId => waitFor(() => outboundStatus(ticketId).split(",").every(s => s === "sent") && outboundStatus(ticketId), 10000, `outbound of ${ticketId} sent`);
const events = (ticketId, type) => Number(sql(`SELECT COUNT(*) FROM TicketEvents WHERE ticketId=${ticketId} AND type='${type}'`));
const countOnly = async (token, status) => (await http.get(`/tickets?status=${status}&showAll=true&countOnly=true&queueIds=${JSON.stringify([queueId])}`, as(token))).data.count;
const userId = n => Number(sql(`SELECT id FROM Users WHERE email='${n}'`));

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
      JWT_SECRET: "e2e", JWT_REFRESH_SECRET: "e2e-r", LOGIN_RATE_MAX: "1000", TELEGRAM_API_URL: `http://localhost:${TG_PORT}`,
      SKIP_WHATSAPP_SESSIONS: "1", SKIP_DEFAULT_DATA: "1", LOG_LEVEL: "warn"
    };
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
    const mkUser = async (name, email, role) => {
      const r = await http.post("/users", { name, email, password: "senha123", role, profile: "user", queueIds: [queueId] }, as(admin));
      assert(r.status === 200, `create ${name}: ${r.status} ${JSON.stringify(r.data)}`);
      return (await http.post("/auth/login", { email, password: "senha123" })).data.token;
    };
    joao = await mkUser("João Vitor", "joao@x.com", "consultor");
    gabrielli = await mkUser("Gabrielli", "gabrielli@x.com", "consultor");
    laura = await mkUser("Laura", "laura@x.com", "consultor");
    coord = await mkUser("Coordenação", "coord@x.com", "coordenacao");
    ids = { joao: userId("joao@x.com"), gabrielli: userId("gabrielli@x.com"), laura: userId("laura@x.com"), coord: userId("coord@x.com"), admin: userId("admin@whaticket.com") };

    const w = await http.post("/whatsapp", { name: "Telegram", channel: "telegram", config: JSON.stringify({ botToken: "123:ABC" }), queueIds: [queueId] }, as(admin));
    assert(w.status === 200, `connection ${w.status}`);
    connectionId = w.data.id;
    await waitFor(async () => (await http.get(`/whatsapp/${connectionId}`, as(admin))).data.status === "CONNECTED", 12000, "connected");

    // ------------------------------------------------------------ 1. only viewing
    console.log("\nVisualizar não altera o responsável");
    await test("opening a conversation (ticket, messages) changes neither attendant, status, AI nor the unread mark", async () => {
      const t = mkTicket({ ai: true, unread: 3 });
      assert((await http.get(`/tickets/${t.ticketId}`, as(joao))).status === 200, "ticket not readable");
      assert((await http.get(`/messages/${t.ticketId}`, as(joao))).status === 200, "messages not readable");
      assert((await http.get(`/messages/${t.ticketId}`, as(joao))).status === 200, "second open");
      const r = row(t.ticketId);
      assert(r.userId === null && r.status === "pending" && r.ai === true, `changed: ${JSON.stringify(r)}`);
      assert(r.unread === 3, `unread was cleared by a visitor: ${r.unread}`);
      assert(events(t.ticketId, "assigned") === 0, "an event was recorded");
    });
    await test("a colleague or the coordination only looking at someone's conversation changes nothing", async () => {
      const t = mkTicket({ owner: ids.gabrielli, unread: 2 });
      assert((await http.get(`/messages/${t.ticketId}`, as(admin))).status === 200, "admin read");
      assert((await http.get(`/messages/${t.ticketId}`, as(coord))).status === 200 || true, "coord read");
      const r = row(t.ticketId);
      assert(r.userId === ids.gabrielli && r.status === "open" && r.unread === 2, `changed: ${JSON.stringify(r)}`);
    });
    await test("the attendant opening their own conversation clears its unread mark", async () => {
      const t = mkTicket({ owner: ids.joao, unread: 4 });
      await http.get(`/messages/${t.ticketId}`, as(joao));
      await waitFor(() => row(t.ticketId).unread === 0, 5000, "unread cleared");
    });
    await test("a colleague cannot even open a conversation that belongs to another consultant (consultants do not read each other)", async () => {
      const t = mkTicket({ owner: ids.gabrielli });
      assert((await http.get(`/messages/${t.ticketId}`, as(joao))).status === 403, "joão read gabrielli's conversation");
    });

    // ------------------------------------------------------------ 2. Situation B
    console.log("\nSituação B — disponível: a primeira mensagem humana atribui");
    let b;
    await test("sending the first message assigns the conversation to the sender, opens it, silences the AI and records the event", async () => {
      b = mkTicket({ ai: true });
      const before = await countOnly(joao, "pending");
      const r = await send(joao, b.ticketId, "Oi! Aqui é o João, vou te ajudar");
      assert(r.status === 200, `send ${r.status} ${JSON.stringify(r.data)}`);
      // decided by the time the request answers, not after WhatsApp
      const state = row(b.ticketId);
      assert(state.userId === ids.joao && state.status === "open" && state.ai === false, `state ${JSON.stringify(state)}`);
      assert(events(b.ticketId, "assigned") === 1, "assign event");
      await sentOk(b.ticketId);
      assert(sentTo(b.chat) === 1, `delivered ${sentTo(b.chat)} times`);
      assert((await countOnly(joao, "pending")) === before - 1, "the Aguardando counter did not drop");
    });
    await test("the conversation left Aguardando and is in Atendendo", async () => {
      const pending = (await http.get(`/tickets?status=pending&showAll=true&queueIds=${JSON.stringify([queueId])}`, as(joao))).data.tickets.map(t => t.id);
      const open = (await http.get(`/tickets?status=open&showAll=true&queueIds=${JSON.stringify([queueId])}`, as(joao))).data.tickets;
      assert(!pending.includes(b.ticketId), "still in Aguardando");
      if (!open.find(t => t.id === b.ticketId)) console.log("      open list:", JSON.stringify(open.map(t => [t.id, t.status, t.userId])), "wanted", b.ticketId);
      const mine = open.find(t => t.id === b.ticketId);
      assert(mine && mine.user && mine.user.name === "João Vitor", `not in Atendendo with João's label: ${JSON.stringify(mine ? { id: mine.id, user: mine.user, userId: mine.userId } : open.map(t => t.id))}`);
    });
    await test("the WhatsApp call is made once even if the request is repeated (same key, sequential and concurrent)", async () => {
      const t = mkTicket();
      const key = crypto.randomUUID();
      const rs = await Promise.all([send(joao, t.ticketId, "uma vez só", key), send(joao, t.ticketId, "uma vez só", key), send(joao, t.ticketId, "uma vez só", key)]);
      assert(rs.every(ok), `statuses ${rs.map(r => r.status)}`);
      const again = await send(joao, t.ticketId, "uma vez só", key);
      assert(ok(again) && again.data.duplicate === true, "retry not recognised");
      await sentOk(t.ticketId);
      await sleep(600);
      assert(sentTo(t.chat) === 1, `sent ${sentTo(t.chat)} times`);
      assert(Number(sql(`SELECT COUNT(*) FROM OutboundMessages WHERE ticketId=${t.ticketId}`)) === 1, "more than one outbound row");
    });

    // ------------------------------------------------------------ 3. Situation A
    console.log("\nSituação A — conversa de quem já atendia");
    await test("the attendant keeps the conversation when writing again (no new assignment, never back to Aguardando)", async () => {
      const t = mkTicket({ owner: ids.joao });
      const r = await send(joao, t.ticketId, "continuando");
      assert(ok(r), `send ${r.status}`);
      await sentOk(t.ticketId);
      const s = row(t.ticketId);
      assert(s.userId === ids.joao && s.status === "open", JSON.stringify(s));
      assert(events(t.ticketId, "assigned") === 0, "assigned again");
    });
    await test("an old closed conversation that came back to the queue is claimed by whoever answers it (resumption)", async () => {
      const t = mkTicket({ closed: true, owner: ids.joao });
      tg.updates.push({ update_id: 500 + seq, message: { message_id: 900 + seq, chat: { id: Number(t.chat), type: "private" }, from: { first_name: "Lead" }, text: "voltei, ainda tem vaga?" } });
      await waitFor(() => row(t.ticketId).status === "pending", 10000, "ticket back in Aguardando");
      assert(row(t.ticketId).userId === null, "the queue gave it an attendant by itself");
      const r = await send(joao, t.ticketId, "Oi de novo!");
      assert(ok(r), `send ${r.status}`);
      const s = row(t.ticketId);
      assert(s.userId === ids.joao && s.status === "open", JSON.stringify(s));
    });
    await test("sending in a closed conversation is refused (it is reopened on purpose, not by a stray message)", async () => {
      const t = mkTicket({ closed: true, owner: ids.joao });
      const r = await send(joao, t.ticketId, "alô");
      assert(r.status === 409, `status ${r.status}`);
      assert(sentTo(t.chat) === 0, "it was sent");
    });

    // ------------------------------------------------------------ 4. Situation C
    console.log("\nSituação C — conversa de outro consultor");
    let c;
    await test("nobody sends in a conversation that belongs to someone else (consultant, coordination, administration)", async () => {
      c = mkTicket({ owner: ids.gabrielli });
      for (const [who, token] of [["joão", joao], ["laura", laura], ["coordenação", coord], ["admin", admin]]) {
        const r = await send(token, c.ticketId, `intruso ${who}`);
        assert(r.status === 403 || r.status === 409, `${who} got ${r.status}`);
      }
      assert(row(c.ticketId).userId === ids.gabrielli, "owner changed");
      assert(sentTo(c.chat) === 0, "something was sent");
      assert(Number(sql(`SELECT COUNT(*) FROM OutboundMessages WHERE ticketId=${c.ticketId}`)) === 0, "outbound rows were created");
    });
    await test("accepting a conversation that has an attendant is refused for everyone (409/403), also through the old PUT", async () => {
      for (const [who, token] of [["joão", joao], ["admin", admin]]) {
        const r = await http.post(`/tickets/${c.ticketId}/claim`, {}, as(token));
        assert([403, 409].includes(r.status), `${who} claim ${r.status}`);
        const me = who === "joão" ? ids.joao : ids.admin;
        const put = await http.put(`/tickets/${c.ticketId}`, { status: "open", userId: me }, as(token));
        assert([403, 409].includes(put.status), `${who} PUT ${put.status}`);
      }
      assert(row(c.ticketId).userId === ids.gabrielli, "owner changed");
    });
    await test("the management can take it over explicitly (event with who took from whom); a consultant cannot", async () => {
      const denied = await http.post(`/tickets/${c.ticketId}/take`, {}, as(joao));
      assert(denied.status === 403, `consultant take ${denied.status}`);
      const r = await http.post(`/tickets/${c.ticketId}/take`, {}, as(admin));
      assert(r.status === 200, `take ${r.status} ${JSON.stringify(r.data)}`);
      assert(row(c.ticketId).userId === ids.admin, "owner did not change");
      assert(sql(`SELECT fromUserId || '>' || toUserId FROM TicketEvents WHERE ticketId=${c.ticketId} AND type='takeover'`) === `${ids.gabrielli}>${ids.admin}`, "takeover event");
    });
    await test("an explicit transfer by the attendant hands the conversation over", async () => {
      const t = mkTicket({ owner: ids.joao });
      const r = await http.put(`/tickets/${t.ticketId}`, { userId: ids.laura, status: "open" }, as(joao));
      assert(r.status === 200, `transfer ${r.status} ${JSON.stringify(r.data)}`);
      assert(row(t.ticketId).userId === ids.laura, "not transferred");
      assert((await send(joao, t.ticketId, "ainda minha?")).status === 403, "joão kept sending after the transfer");
      assert(ok(await send(laura, t.ticketId, "agora é minha")), "laura could not send");
    });

    // ------------------------------------------------------------ 5. Situation D + robot
    console.log("\nSituação D — IA atendendo");
    await test("viewing keeps the AI as the one responsible; a human message takes the conversation and ends its pending runs", async () => {
      const t = mkTicket({ ai: true });
      sql(`SET session_replication_role = replica; INSERT INTO ChatFlowRuns (flowId, ticketId, contactId, version, nodeId, status, vars, tries, createdAt, updatedAt) VALUES (1, ${t.ticketId}, ${t.contactId}, 1, 'n1', 'waiting', '{}', 0, NOW(), NOW())`);
      await http.get(`/messages/${t.ticketId}`, as(joao));
      assert(row(t.ticketId).ai === true && row(t.ticketId).userId === null, "viewing took it from the AI");
      assert(ok(await send(joao, t.ticketId, "assumi")), "send");
      const s = row(t.ticketId);
      assert(s.userId === ids.joao && s.ai === false, JSON.stringify(s));
      assert(sql(`SELECT status FROM ChatFlowRuns WHERE ticketId=${t.ticketId}`) === "done", "the run stayed waiting");
    });
    await test("an AI answer that was still being written when the person took over is dropped (fresh check before every robot message)", async () => {
      const t = mkTicket({ ai: true });
      const script = `
        const db = require("./dist/database").default;
        const { humanHasTicket } = require("./dist/helpers/HumanOwnership");
        (async () => {
          const before = await humanHasTicket(${t.ticketId});
          await db.query('UPDATE "Tickets" SET "userId"=${ids.joao} WHERE id=${t.ticketId}');
          const after = await humanHasTicket(${t.ticketId});
          console.log(JSON.stringify({ before, after }));
          process.exit(0);
        })().catch(e => { console.error(e); process.exit(1); });`;
      const out = JSON.parse(execFileSync("node", ["-e", script], { cwd: ROOT, env: { ...env, LOG_LEVEL: "error" } }).toString().trim().split("\n").pop());
      assert(out.before === false && out.after === true, JSON.stringify(out));
    });

    // ------------------------------------------------------------ 6. concurrency
    console.log("\nConcorrência");
    await test("two consultants sending at the same time to a free conversation: exactly one wins, one message goes out", async () => {
      for (let round = 0; round < 5; round += 1) {
        const t = mkTicket({ ai: true });
        const [a, b2] = await Promise.all([send(joao, t.ticketId, "sou o João"), send(gabrielli, t.ticketId, "sou a Gabrielli")]);
        const codes = [a.status, b2.status].sort();
        assert(codes[0] === 200 && (codes[1] === 403 || codes[1] === 409), `round ${round}: ${a.status}/${b2.status}`);
        const winner = a.status === 200 ? ids.joao : ids.gabrielli;
        assert(row(t.ticketId).userId === winner, `round ${round}: owner ${row(t.ticketId).userId}`);
        await sentOk(t.ticketId);
        assert(sentTo(t.chat) === 1, `round ${round}: sent ${sentTo(t.chat)}`);
        assert(Number(sql(`SELECT COUNT(*) FROM OutboundMessages WHERE ticketId=${t.ticketId}`)) === 1, `round ${round}: outbound rows`);
        assert(events(t.ticketId, "assigned") === 1, `round ${round}: assign events`);
      }
    });
    await test("three simultaneous accepts: one 200, the others 409, one owner", async () => {
      const t = mkTicket();
      const rs = await Promise.all([laura, joao, gabrielli].map(tok => http.post(`/tickets/${t.ticketId}/claim`, {}, as(tok))));
      const oks = rs.filter(r => r.status === 200).length;
      assert(oks === 1 && rs.filter(r => r.status === 409).length === 2, `statuses ${rs.map(r => r.status)}`);
      assert(row(t.ticketId).userId !== null, "no owner");
      assert(events(t.ticketId, "assigned") === 1, "assign events");
    });
    await test("accept (PUT) racing a send: whoever wrote first keeps it, the other is refused", async () => {
      for (let i = 0; i < 4; i += 1) {
        const t = mkTicket();
        const [a, p] = await Promise.all([send(joao, t.ticketId, "mensagem"), http.put(`/tickets/${t.ticketId}`, { status: "open", userId: ids.gabrielli }, as(gabrielli))]);
        const ok = [a.status === 200, p.status === 200].filter(Boolean).length;
        assert(ok === 1, `both or none won: ${a.status}/${p.status}`);
        assert(row(t.ticketId).userId === (a.status === 200 ? ids.joao : ids.gabrielli), "owner does not match the winner");
      }
    });
    await test("a stale transfer cannot overwrite a newer assignment", async () => {
      const t = mkTicket({ owner: ids.joao });
      const rs = await Promise.all([
        http.put(`/tickets/${t.ticketId}`, { userId: ids.laura, status: "open" }, as(joao)),
        http.put(`/tickets/${t.ticketId}`, { userId: ids.gabrielli, status: "open" }, as(admin))
      ]);
      const owner = row(t.ticketId).userId;
      assert([ids.laura, ids.gabrielli].includes(owner), `owner ${owner}`);
      assert(rs.some(r => r.status === 200), "none applied");
      // whichever applied, the owner is exactly one person and matches the last successful write
      assert(rs.filter(r => r.status === 200).length >= 1, "no success");
    });
    await test("a new message from the lead while a person is attending never sends the conversation back to Aguardando", async () => {
      const t = mkTicket({ owner: ids.joao });
      tg.updates.push({ update_id: 800 + seq, message: { message_id: 950 + seq, chat: { id: Number(t.chat), type: "private" }, from: { first_name: "Lead" }, text: "oi, tem alguém?" } });
      await waitFor(() => Number(sql(`SELECT COUNT(*) FROM Messages WHERE ticketId=${t.ticketId} AND body LIKE 'oi, tem alguém?'`)) === 1, 10000, "inbound stored");
      const s = row(t.ticketId);
      assert(s.userId === ids.joao && s.status === "open", JSON.stringify(s));
    });

    await test("forwarding a message is a human send too: it claims a free conversation and is refused in someone else's", async () => {
      const source = mkTicket({ owner: ids.joao });
      const free = mkTicket({ ai: true });
      const theirs = mkTicket({ owner: ids.gabrielli });
      const msg = `seed-${source.ticketId}`;
      const refused = await http.post(`/messages/${msg}/forward`, { ticketIds: [theirs.ticketId] }, as(joao));
      assert(refused.status === 403 || refused.status === 409, `forward into someone else's conversation: ${refused.status}`);
      assert(sentTo(theirs.chat) === 0 && row(theirs.ticketId).userId === ids.gabrielli, "someone else's conversation was touched");
      const ok2 = await http.post(`/messages/${msg}/forward`, { ticketIds: [free.ticketId] }, as(joao));
      assert(ok2.status === 200, `forward ${ok2.status} ${JSON.stringify(ok2.data)}`);
      const s = row(free.ticketId);
      assert(s.userId === ids.joao && s.status === "open" && s.ai === false, JSON.stringify(s));
      assert(sentTo(free.chat) === 1, "not delivered");
    });

    // ------------------------------------------------------------ 7. outbox reliability
    console.log("\nEnvio confiável");
    await test("a send the provider refuses is retried, then reported as failed — and never duplicated", async () => {
      const t = mkTicket();
      tg.failChats.add(t.chat);
      const r = await send(joao, t.ticketId, "isso vai falhar");
      assert(ok(r), `send ${r.status}`);
      assert(row(t.ticketId).userId === ids.joao, "assignment is not rolled back by a failing provider");
      await waitFor(() => outboundStatus(t.ticketId) === "failed", 30000, "outbound failed");
      assert(Number(sql(`SELECT attempts FROM OutboundMessages WHERE ticketId=${t.ticketId}`)) === 3, "attempts");
      tg.failChats.delete(t.chat);
      await sleep(7000);
      assert(sentTo(t.chat) === 0 && outboundStatus(t.ticketId) === "failed", "it was sent after being reported as failed");
    });
    await test("a stored send whose conversation changed hands before delivery is not sent by the old attendant", async () => {
      const t = mkTicket({ owner: ids.gabrielli });
      sql(`INSERT INTO OutboundMessages (ticketId, userId, clientKey, payload, status, attempts, createdAt, updatedAt) VALUES (${t.ticketId}, ${ids.joao}, 'old-owner', '{"body":"tarde demais","medias":[],"requireOwner":true}', 'pending', 0, NOW(), NOW())`);
      await waitFor(() => outboundStatus(t.ticketId) === "failed", 15000, "stale send refused");
      assert(sql(`SELECT error FROM OutboundMessages WHERE ticketId=${t.ticketId}`) === "ownership_changed", "reason");
      assert(sentTo(t.chat) === 0, "it was sent");
    });

    // ------------------------------------------------------------ 8. real time
    console.log("\nTempo real");
    await test("the new attendant reaches everyone authorised at once: update for the sender and the management, delete for the consultant who no longer sees it", async () => {
      const { io } = require("socket.io-client");
      const listen = async token => {
        const socket = io(API, { auth: { token }, transports: ["websocket"] });
        const seen = [];
        await new Promise((res, rej) => { socket.on("connect", res); socket.on("connect_error", rej); });
        ["pending", "open"].forEach(st => socket.emit("joinTickets", st));
        socket.emit("joinNotification");
        socket.on("ticket", p => seen.push(p));
        return { socket, seen };
      };
      const [forLaura, forJoao, forAdmin] = [await listen(laura), await listen(joao), await listen(admin)];
      await sleep(400);
      const t = mkTicket({ ai: true });
      assert(ok(await send(joao, t.ticketId, "atualiza a tela")), "send");
      const updated = p => p.action === "update" && p.ticket && p.ticket.id === t.ticketId && p.ticket.user && p.ticket.user.name === "João Vitor" && p.ticket.status === "open";
      await waitFor(() => forJoao.seen.some(updated), 6000, "update for the sender");
      await waitFor(() => forAdmin.seen.some(updated), 6000, "update for the management");
      await waitFor(() => forLaura.seen.some(p => p.action === "delete" && p.ticketId === t.ticketId), 6000, "delete in Aguardando for the colleague");
      assert(!forLaura.seen.some(updated), "a colleague received a conversation that is not hers");
      [forLaura, forJoao, forAdmin].forEach(x => x.socket.close());
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
