/* eslint-disable */
// Commercial analytics: the management center and the consultant's own screen read the same numbers, the numbers count only what
// a person really did, and a consultant can never read another consultant's numbers.
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
const DB = `chat_analytics_${process.pid}_${crypto.randomBytes(4).toString("hex")}`;
const PORT = 8094;
const TG_PORT = 9112;
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


    const A = (token, p) => http.get(p, as(token));
    const strip = b => { const { period, ...rest } = b; return rest; };
    const KPIS = ["messagesSent", "attendances", "reactivated", "leadsWorked", "pendingReply", "inProgress", "tasksOpen", "tasksOverdue", "tasksDone", "followUpsDue", "proposalsSent", "proposalsViewed", "enrollments", "conversion"];
    const stages = (await http.get("/lead-stages", as(admin))).data;
    const stageWon = (Array.isArray(stages) ? stages : stages.stages).find(x => x.type === "won");
    assert(stageWon, "no won stage seeded");

    // ------------------------------------------------------------ the day of João
    console.log("\nProdução de João");
    const t1 = mkTicket({ owner: ids.joao }), t2 = mkTicket({ ai: true }), t3 = mkTicket({ owner: ids.joao });
    await test("João's real work: messages, attendances, leads, tasks, enrollment", async () => {
      // opening conversations is not work
      for (const t of [t1, t2, t3]) await http.get(`/messages/${t.ticketId}`, as(joao));
      const before = (await A(joao, "/analytics/me?range=today")).data.metrics;
      assert(before.messagesSent === 0 && before.attendances === 0, `opening counted: ${JSON.stringify(before)}`);
      // 3 messages in t1, 2 in t2 (free, claimed by sending), 1 in t3 → 6 messages, 3 attendances
      for (const [t, n] of [[t1, 3], [t2, 2], [t3, 1]]) for (let i = 0; i < n; i += 1) assert(ok(await send(joao, t.ticketId, `msg ${t.ticketId}-${i}`)), "send");
      // a robot message in the same conversation is never João's
      sql(`INSERT INTO Messages (id, ticketId, contactId, body, fromMe, read, mediaType, ack, createdAt, updatedAt) VALUES ('bot-${t1.ticketId}', ${t1.ticketId}, ${t1.contactId}, E'\\u200eOlá, sou a IA', true, true, 'chat', 1, NOW(), NOW())`);
      // a lead of João: note, task, enrollment
      const lead = (await http.post("/leads", { name: "Lead do João", phone: "5569999990001", stageId: undefined }, as(joao))).data.lead;
      assert(lead && lead.id, "lead not created");
      assert((await http.post(`/leads/${lead.id}/activities`, { type: "call", body: "liguei" }, as(joao))).status < 300, "note");
      const task = (await http.post(`/leads/${lead.id}/tasks`, { title: "Retornar", dueAt: new Date(Date.now() - 3600000).toISOString() }, as(joao))).data;
      assert(task.id, "task");
      assert((await http.put(`/leads/${lead.id}/stage`, { stageId: stageWon.id }, as(joao))).status === 200, "enroll");
      await sleep(300);
    });

    // ------------------------------------------------------------ the acceptance test: same period, same criteria, two doors
    console.log("\nConsistência: gestão × estatísticas pessoais");
    for (const range of ["today", "week", "month"]) {
      await test(`the management center and João's screen show the same numbers (${range})`, async () => {
        const mine = (await A(joao, `/analytics/me?range=${range}`)).data;
        const seen = (await A(admin, `/analytics/consultant/${ids.joao}?range=${range}`)).data;
        const team = (await A(admin, `/analytics/team?range=${range}`)).data;
        const inTeam = team.consultants.find(c => c.user.id === ids.joao);
        const coordTeam = (await A(coord, `/analytics/team?range=${range}`)).data.consultants.find(c => c.user.id === ids.joao);
        assert(mine.metrics && seen.metrics && inTeam && coordTeam, "a door answered without João");
        for (const k of KPIS) {
          assert(mine.metrics[k] === seen.metrics[k], `${k}: me=${mine.metrics[k]} manager=${seen.metrics[k]}`);
          assert(mine.metrics[k] === inTeam.metrics[k], `${k}: me=${mine.metrics[k]} team=${inTeam.metrics[k]}`);
          assert(mine.metrics[k] === coordTeam.metrics[k], `${k}: me=${mine.metrics[k]} coordination=${coordTeam.metrics[k]}`);
        }
        assert(JSON.stringify(mine.series) === JSON.stringify(seen.series) && JSON.stringify(mine.series) === JSON.stringify(inTeam.series), "history differs");
        assert(JSON.stringify(mine.goals) === JSON.stringify(seen.goals), "goals differ");
        assert(JSON.stringify(mine.presence.scheduleToday) === JSON.stringify(seen.presence.scheduleToday), "schedule differs");
      });
    }
    await test("the numbers are exactly what João did (6 human messages, 3 attendances, 1 enrollment; robot and opening never count)", async () => {
      const m = (await A(joao, "/analytics/me?range=today")).data.metrics;
      assert(m.messagesSent === 6, `messagesSent ${m.messagesSent}`);
      assert(m.attendances === 3, `attendances ${m.attendances}`);
      assert(m.leadsWorked >= 1, `leadsWorked ${m.leadsWorked}`);
      assert(m.enrollments === 1, `enrollments ${m.enrollments}`);
      assert(m.tasksOpen === 1 && m.tasksOverdue === 1, `tasks ${m.tasksOpen}/${m.tasksOverdue}`);
      assert(m.inProgress === 3, `inProgress ${m.inProgress}`);
      assert(m.conversion !== null && m.conversion > 0, `conversion ${m.conversion}`);
      const g = (await A(gabrielli, "/analytics/me?range=today")).data.metrics;
      assert(g.messagesSent === 0 && g.attendances === 0 && g.enrollments === 0, `Gabrielli got João's work: ${JSON.stringify(g)}`);
    });
    await test("a repeated send (same key) and a human message never count twice", async () => {
      const t = mkTicket();
      const key = crypto.randomUUID();
      await Promise.all([send(laura, t.ticketId, "uma", key), send(laura, t.ticketId, "uma", key)]);
      await sentOk(t.ticketId);
      const m = (await A(laura, "/analytics/me?range=today")).data.metrics;
      assert(m.messagesSent === 1 && m.attendances === 1, `${m.messagesSent}/${m.attendances}`);
    });
    await test("a message of a conversation that was refused (someone else's) is nobody's work", async () => {
      const t = mkTicket({ owner: ids.gabrielli });
      const r = await send(joao, t.ticketId, "intruso");
      assert(r.status === 403 || r.status === 409, `status ${r.status}`);
      const m = (await A(joao, "/analytics/me?range=today")).data.metrics;
      assert(m.messagesSent === 6, `refused send counted: ${m.messagesSent}`);
    });
    await test("a custom period gives the same answer through both doors, and an empty period is zero", async () => {
      const d = new Date().toISOString().slice(0, 10);
      const a = (await A(joao, `/analytics/me?range=custom&from=${d}&to=${d}`)).data.metrics;
      const b = (await A(admin, `/analytics/consultant/${ids.joao}?range=custom&from=${d}&to=${d}`)).data.metrics;
      assert(JSON.stringify(a) === JSON.stringify(b), "custom differs");
      const old = (await A(joao, "/analytics/me?range=custom&from=2020-01-01&to=2020-01-02")).data.metrics;
      assert(old.messagesSent === 0 && old.enrollments === 0, "old period is not empty");
    });

    // ------------------------------------------------------------ permissions
    console.log("\nPermissões");
    await test("João cannot read Gabrielli's or Laura's numbers by URL, query, headers or the team door", async () => {
      for (const target of [ids.gabrielli, ids.laura, ids.admin]) {
        assert((await A(joao, `/analytics/consultant/${target}?range=today`)).status === 403, `consultant/${target} open to a consultant`);
      }
      assert((await A(joao, "/analytics/team?range=today")).status === 403, "team door open to a consultant");
      assert((await A(joao, "/analytics/team/export.csv")).status === 403, "export open to a consultant");
      assert((await A(joao, "/analytics/config")).status === 403, "config readable by a consultant");
      assert((await http.put("/analytics/config", { dailyMessagesTarget: 1 }, as(joao))).status === 403, "config writable by a consultant");
      // the personal door ignores any attempt to choose another person
      const own = (await A(joao, `/analytics/me?range=today&userId=${ids.gabrielli}&user=${ids.gabrielli}`)).data;
      assert(own.user.id === ids.joao, "the personal door followed a userId");
      const ownH = (await http.get("/analytics/me?range=today", { headers: { Authorization: `Bearer ${joao}`, "X-User-Id": String(ids.gabrielli) }, validateStatus: () => true })).data;
      assert(ownH.user.id === ids.joao, "the personal door followed a header");
      assert((await http.get("/analytics/me")).status === 401, "anonymous read");
    });
    await test("the management sees only the consultants it may see; a consultant is never in the list", async () => {
      const team = (await A(admin, "/analytics/team?range=today")).data;
      const names = team.consultants.map(c => c.user.id);
      assert([ids.joao, ids.gabrielli, ids.laura].every(i => names.includes(i)), "consultants missing for the administration");
      assert(!names.includes(ids.admin), "the administrator is listed as a consultant");
      // a coordinator tied to a polo sees only the consultants of that polo
      const poloId = sql(`INSERT INTO Polos (code, name, active, createdAt, updatedAt) VALUES ('AN1', 'Polo AN1', true, NOW(), NOW()) RETURNING id`).split("\n")[0];
      sql(`INSERT INTO PoloMembers (poloId, userId, role, createdAt, updatedAt) VALUES (${poloId}, ${ids.coord}, 'coordenacao', NOW(), NOW()), (${poloId}, ${ids.joao}, 'consultor', NOW(), NOW())`);
      const scoped = (await A(coord, "/analytics/team?range=today")).data.consultants.map(c => c.user.id);
      assert(scoped.length === 1 && scoped[0] === ids.joao, `coordination scope: ${JSON.stringify(scoped)}`);
      assert((await A(coord, `/analytics/consultant/${ids.gabrielli}?range=today`)).status === 403, "coordinator read a consultant outside the polo");
      assert((await A(coord, `/analytics/consultant/${ids.joao}?range=today`)).status === 200, "coordinator cannot read their own polo");
      const csv = (await http.get("/analytics/team/export.csv?range=today", { ...as(coord), responseType: "text" })).data;
      assert(/João Vitor/.test(csv) && !/Gabrielli/.test(csv) && !/Laura/.test(csv), "the export leaked another polo");
    });

    // ------------------------------------------------------------ new leads to check: the responsible is who answers the conversation
    console.log("\nNovos para conferir");
    await test("a new lead goes to who ANSWERS the conversation (open ticket), not only to the owner of the lead; the management sees everybody", async () => {
      const stage = sql(`SELECT id FROM LeadStages WHERE type='open' ORDER BY id LIMIT 1`).split("\n")[0];
      assert(stage, "no open stage in the seed");
      const t = mkTicket({ owner: ids.joao });
      const leadId = sql(`INSERT INTO Leads (name, phone, source, stageId, ownerId, contactId, isHistorical, createdAt, updatedAt) VALUES ('Lead do Pedro', '5569000000001', 'WhatsApp', ${stage}, ${ids.laura}, ${t.contactId}, false, NOW() - INTERVAL '2 days', NOW()) RETURNING id`).split("\n")[0];
      // like in production: the ticket does NOT carry the lead id, the conversation is linked to the lead by the contact
      const mineJoao = (await A(joao, "/crm/triage")).data;
      assert(mineJoao.items.some(i => i.id === Number(leadId)), "the lead of the conversation of João is not in João's list");
      assert(mineJoao.items.find(i => i.id === Number(leadId)).late === true, "a lead of two days ago must be late");
      const mineLaura = (await A(laura, "/crm/triage")).data;
      assert(!mineLaura.items.some(i => i.id === Number(leadId)), "the owner of the lead, who does not answer it, still sees it as hers");
      const team = (await A(admin, `/crm/triage`)).data;
      assert(team.items.some(i => i.id === Number(leadId) && i.ownerId === ids.joao), "the management does not see the lead with its responsible");
      const only = (await A(admin, `/crm/triage?ownerId=${ids.laura}`)).data;
      assert(!only.items.some(i => i.id === Number(leadId)), "the filter by consultant ignored the responsible");
    });

    await test("the AI handoff task follows the conversation: it moves to whoever answers it, and is not listed for the one the robot picked first", async () => {
      const stage = sql(`SELECT id FROM LeadStages WHERE type='open' ORDER BY id LIMIT 1`).split("\n")[0];
      const t = mkTicket({ owner: ids.laura });
      const leadId = sql(`INSERT INTO Leads (name, phone, source, stageId, ownerId, contactId, isHistorical, createdAt, updatedAt) VALUES ('Lead tarefa', '5569000000002', 'WhatsApp', ${stage}, ${ids.laura}, ${t.contactId}, false, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const taskId = sql(`INSERT INTO LeadTasks (leadId, userId, type, title, dueAt, createdAt, updatedAt) VALUES (${leadId}, ${ids.laura}, 'whatsapp', 'Atender lead encaminhado pelo agente de IA', NOW() - INTERVAL '1 hour', NOW(), NOW()) RETURNING id`).split("\n")[0];
      const before = (await A(laura, `/analytics/me?range=today`)).data.metrics.tasksOverdue;
      // the conversation is transferred to João: the task goes with it
      const put = await http.put(`/tickets/${t.ticketId}`, { status: "open", userId: ids.joao }, as(admin));
      assert(put.status === 200, `transfer failed: ${put.status}`);
      await new Promise(r => setTimeout(r, 600));
      assert(sql(`SELECT userId FROM LeadTasks WHERE id=${taskId}`) === String(ids.joao), "the task did not move to who answers the conversation");
      const after = (await A(laura, `/analytics/me?range=today`)).data.metrics.tasksOverdue;
      assert(after === before - 1, `the person the robot picked first still has the task (${before} -> ${after})`);
    });

    await test("the first-contact time counts only a HUMAN contact: a lead only the robot touched is not an average", async () => {
      const stage = sql(`SELECT id FROM LeadStages WHERE type='open' ORDER BY id LIMIT 1`).split("\n")[0];
      const t = mkTicket({ owner: ids.gabrielli });
      sql(`INSERT INTO Leads (name, phone, source, stageId, ownerId, contactId, isHistorical, firstContactAt, createdAt, updatedAt) VALUES ('Lead so robo', '5569000000003', 'WhatsApp', ${stage}, ${ids.gabrielli}, ${t.contactId}, false, NOW(), NOW() - INTERVAL '3 minutes', NOW())`);
      const m = (await A(admin, `/analytics/consultant/${ids.gabrielli}?range=today`)).data.metrics;
      assert(m.firstContactMinutes === null, `the robot's contact became the person's average: ${m.firstContactMinutes}`);
    });

    // ------------------------------------------------------------ configuration
    console.log("\nConfiguração");
    await test("the management sets schedules and targets; presence and alerts follow; invalid values are refused or clamped", async () => {
      const all = [{ start: "00:00", end: "23:59" }];
      // every weekday: "today" depends on the zone of the app, not on the one of this machine
      const week = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [String(d), all]));
      // João has a connected number; Laura never connected one (a real alert, and no "idle" alert for a person that cannot receive anything)
      sql(`INSERT INTO Whatsapps (name, status, channel, ownerId, isDefault, createdAt, updatedAt) VALUES ('Número do João', 'CONNECTED', 'whatsapp', ${ids.joao}, false, NOW(), NOW())`);
      const r = await http.put("/analytics/config", { activeWindowMinutes: 15, dailyMessagesTarget: 50, dailyAttendancesTarget: 10, schedules: { [ids.joao]: week, [ids.laura]: week, x: { 9: [{ start: "99:00", end: "10:00" }] } } }, as(admin));
      assert(r.status === 200 && r.data.dailyMessagesTarget === 50 && !r.data.schedules.x, `config ${r.status} ${JSON.stringify(r.data)}`);
      const team = (await A(admin, "/analytics/team?range=today")).data;
      const joao_ = team.consultants.find(c => c.user.id === ids.joao), laura_ = team.consultants.find(c => c.user.id === ids.laura);
      assert(joao_.presence.state === "active" && joao_.presence.onSchedule, `joão presence ${JSON.stringify(joao_.presence)}`);
      assert(laura_.presence.onSchedule, "laura schedule");
      assert(joao_.presence.whatsapp.state === "connected" && laura_.presence.whatsapp.state === "none", `whatsapp state ${JSON.stringify([joao_.presence.whatsapp, laura_.presence.whatsapp])}`);
      assert(team.alerts.some(a => a.userId === ids.laura && a.code === "whatsapp_none"), "alert of the missing number is missing");
      // who uses the system now: João just made authenticated requests
      assert(joao_.presence.online === true && !!joao_.presence.lastSeenAt, `joão online ${JSON.stringify([joao_.presence.online, joao_.presence.lastSeenAt])}`);
      assert(team.alerts.filter(a => a.userId === ids.laura).length === 1, "a person without a number must have a single alert");
      assert(!team.alerts.some(a => a.userId === ids.laura && (a.code === "idle_on_schedule" || a.code === "below_messages_target")), "activity alert for a person without a number");
      assert(team.alerts.some(a => a.userId === ids.joao && a.code === "tasks_overdue"), "overdue alert missing");
      assert(team.alerts.some(a => a.userId === ids.joao && a.code === "below_messages_target"), "target alert missing");
      const mine = (await A(joao, "/analytics/me?range=today")).data;
      assert(mine.targets.dailyMessages === 50 && mine.presence.scheduleToday.length === 1, "João does not see his own schedule and target");
      assert((await http.put("/analytics/config", { dailyMessagesTarget: -5, activeWindowMinutes: 99999 }, as(admin))).data.activeWindowMinutes === 240, "window not clamped");
    });
    await test("shortcuts: the focus lists point at João's own leads, tasks and conversations only", async () => {
      const f = (await A(joao, "/analytics/me?range=today")).data.focus;
      assert(f.tasks.length >= 1 && f.tasks[0].link, "no task shortcut");
      assert(f.conversations.every(c => /^\/tickets\/\d+$/.test(c.link)), "conversation link");
      const g = (await A(gabrielli, "/analytics/me?range=today")).data.focus;
      assert(g.tasks.length === 0, "Gabrielli sees João's tasks");
    });

    // ------------------------------------------------------------ real time
    console.log("\nTempo real");
    await test("messages, tasks and enrollments reach João's and the management's screens at once, and nobody else's", async () => {
      const { io } = require("socket.io-client");
      const listen = async token => {
        const socket = io(API, { auth: { token }, transports: ["websocket"] });
        const seen = [];
        await new Promise((res, rej) => { socket.on("connect", res); socket.on("connect_error", rej); });
        socket.emit("joinNotification");
        socket.on("analytics", p => seen.push(p));
        return { socket, seen };
      };
      const [forJoao, forAdmin, forGabrielli, forCoord] = [await listen(joao), await listen(admin), await listen(gabrielli), await listen(coord)];
      await sleep(400);
      const before = (await A(joao, "/analytics/me?range=today")).data.metrics;
      const t = mkTicket({ ai: true });
      assert(ok(await send(joao, t.ticketId, "tempo real")), "send");
      await waitFor(() => forJoao.seen.some(p => p.userId === ids.joao), 5000, "João's screen told");
      await waitFor(() => forAdmin.seen.some(p => p.userId === ids.joao), 5000, "the management told");
      await waitFor(() => forCoord.seen.some(p => p.userId === ids.joao), 5000, "the coordinator of João's polo told");
      const after = (await A(joao, "/analytics/me?range=today")).data.metrics;
      assert(after.messagesSent === before.messagesSent + 1 && after.attendances === before.attendances + 1, "numbers did not move");
      const adminSees = (await A(admin, `/analytics/consultant/${ids.joao}?range=today`)).data.metrics;
      assert(adminSees.messagesSent === after.messagesSent, "doors differ after the event");
      // a task and an enrollment signal too
      const lead2 = (await http.post("/leads", { name: "Outro lead", phone: "5569999990002" }, as(joao))).data.lead;
      forJoao.seen.length = 0; forAdmin.seen.length = 0;
      await http.post(`/leads/${lead2.id}/tasks`, { title: "Nova", dueAt: new Date(Date.now() + 86400000).toISOString() }, as(joao));
      await waitFor(() => forAdmin.seen.some(p => p.userId === ids.joao), 5000, "task signal");
      forAdmin.seen.length = 0;
      await http.put(`/leads/${lead2.id}/stage`, { stageId: stageWon.id }, as(joao));
      await waitFor(() => forAdmin.seen.some(p => p.userId === ids.joao), 5000, "enrollment signal");
      const fin = (await A(joao, "/analytics/me?range=today")).data.metrics;
      assert(fin.enrollments === 2, `enrollments ${fin.enrollments}`);
      assert(!forGabrielli.seen.some(p => p.userId === ids.joao), "Gabrielli heard João's activity");
      [forJoao, forAdmin, forGabrielli, forCoord].forEach(x => x.socket.close());
    });
    await test("an open task follows whoever answers the lead, and a person is linked to a polo from the management screen", async () => {
      const lead3 = (await http.post("/leads", { name: "Lead que troca de dono", phone: "5569999990033", ownerId: ids.joao }, as(admin))).data.lead;
      const task = (await http.post(`/leads/${lead3.id}/tasks`, { title: "Ligar de volta", dueAt: new Date(Date.now() - 3600000).toISOString() }, as(admin))).data;
      assert(Number(sql(`SELECT userId FROM LeadTasks WHERE id = ${task.id}`).split("\n")[0]) === ids.joao, "the task did not start with the owner");
      const done = await http.put(`/leads/${lead3.id}`, { ownerId: ids.gabrielli }, as(admin));
      assert(done.status === 200, `owner change ${done.status}`);
      assert(Number(sql(`SELECT userId FROM LeadTasks WHERE id = ${task.id}`).split("\n")[0]) === ids.gabrielli, "the task stayed with the previous owner");
      // a task given on purpose to a third person stays
      const given = (await http.post(`/leads/${lead3.id}/tasks`, { title: "Do coordenador", userId: ids.coord, dueAt: new Date(Date.now() - 3600000).toISOString() }, as(admin))).data;
      await http.put(`/leads/${lead3.id}`, { ownerId: ids.joao }, as(admin));
      assert(Number(sql(`SELECT userId FROM LeadTasks WHERE id = ${given.id}`).split("\n")[0]) === ids.coord, "a task given to someone else moved");

      // a consultant who never connected a WhatsApp: the tasks the system gave them go to whoever answers the lead, or to nobody (and show on the management screen)
      const mk = await http.post("/users", { name: "Sem Numero", email: "semnumero@x.com", password: "senha123", role: "consultor", profile: "user", queueIds: [queueId] }, as(admin));
      assert(mk.status === 200, `create user ${mk.status}`);
      const noPhone = Number(sql(`SELECT id FROM Users WHERE email = 'semnumero@x.com'`).split("\n")[0]);
      const leadA = (await http.post("/leads", { name: "Lead sem atendente", phone: "5569999990044", ownerId: noPhone }, as(admin))).data.lead;
      const taskA = (await http.post(`/leads/${leadA.id}/tasks`, { title: "Sem ninguém", dueAt: new Date(Date.now() - 3600000).toISOString() }, as(admin))).data;
      const leadB = (await http.post("/leads", { name: "Lead atendido por outro", phone: "5569999990045", ownerId: noPhone }, as(admin))).data.lead;
      const taskB = (await http.post(`/leads/${leadB.id}/tasks`, { title: "Quem atende assume", dueAt: new Date(Date.now() - 3600000).toISOString() }, as(admin))).data;
      // the lead's conversation is open with João (a tickets links to its lead by the contact)
      const convB = mkTicket({ owner: ids.joao, status: "open" });
      sql(`UPDATE Leads SET contactId = ${convB.contactId} WHERE id = ${leadB.id}`);
      // a task the system made for the handoff follows whoever answers the lead, even when it sits with someone who is not the lead's owner
      const leadC = (await http.post("/leads", { name: "Lead do encaminhamento", phone: "5569999990046", ownerId: ids.joao }, as(admin))).data.lead;
      const taskC = (await http.post(`/leads/${leadC.id}/tasks`, { title: "Atender lead encaminhado pelo agente de IA", userId: ids.gabrielli, dueAt: new Date(Date.now() - 3600000).toISOString() }, as(admin))).data;
      assert(Number(sql(`SELECT userId FROM LeadTasks WHERE id = ${taskC.id}`).split("\n")[0]) === ids.gabrielli, "the task did not start with the person it was given to");
      // a conversation with someone who cannot answer (no WhatsApp number) goes to a colleague of the same queue who has one; their tasks follow
      const stuckConv = mkTicket({ owner: noPhone, status: "open" });
      sql(`INSERT INTO UserQueues (userId, queueId, createdAt, updatedAt) VALUES (${noPhone}, ${queueId}, NOW(), NOW()) ON CONFLICT DO NOTHING`);
      const sweep = await http.post("/lead-tasks/release-unreachable", {}, as(admin));
      assert(Number(sql(`SELECT userId FROM LeadTasks WHERE id = ${taskC.id}`).split("\n")[0]) === ids.joao, "the handoff task did not follow the lead's owner")
      assert(sweep.status === 200 && sweep.data.released >= 1 && sweep.data.aligned + sweep.data.moved >= 1, `sweep ${sweep.status} ${JSON.stringify(sweep.data)}`);
      assert(sweep.data.redistributed >= 1, `the conversation of a person without a number was not handed on: ${JSON.stringify(sweep.data)}`);
      assert(row(stuckConv.ticketId).userId === ids.joao, `the conversation went to ${row(stuckConv.ticketId).userId}, not to the colleague with a number`);
      assert(sql(`SELECT COALESCE(CAST(userId AS TEXT), 'null') FROM LeadTasks WHERE id = ${taskA.id}`).split("\n")[0] === "null", "the task of a lead nobody answers kept its owner");
      assert(Number(sql(`SELECT userId FROM LeadTasks WHERE id = ${taskB.id}`).split("\n")[0]) === ids.joao, "the task did not go to whoever answers the lead");
      const unassigned = (await A(admin, "/analytics/team?range=today")).data.unassigned;
      assert(unassigned && unassigned.open >= 1 && unassigned.overdue >= 1, `unassigned ${JSON.stringify(unassigned)}`);
      assert((await http.post("/lead-tasks/release-unreachable", {}, as(joao))).status === 403, "a consultant ran the sweep");
      const listed = (await http.get("/lead-tasks?scope=all&status=overdue&userId=0", as(admin))).data;
      assert(listed.some(t => t.id === taskA.id) && !listed.some(t => t.id === taskB.id), "the list of tasks without owner is wrong");

      const polo2 = sql(`INSERT INTO Polos (code, name, active, createdAt, updatedAt) VALUES ('AN2', 'Polo AN2', true, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const add = await http.post(`/polos/${polo2}/members/${ids.gabrielli}`, { role: "comercial" }, as(admin));
      assert(add.status === 200, `link ${add.status}`);
      const team = (await A(admin, "/analytics/team?range=today")).data;
      const g = team.consultants.find(b => b.user.id === ids.gabrielli);
      assert(g && g.user.poloIds.includes(Number(polo2)), "the polo does not show on the consultant");
      assert((await http.post(`/polos/${polo2}/members/${ids.gabrielli}`, { role: "comercial" }, as(admin))).status === 200, "linking twice must be harmless");
      assert((await http.post(`/polos/${polo2}/members/${ids.gabrielli}`, { role: "xx" }, as(admin))).status === 400, "an invalid function was accepted");
      assert((await http.post(`/polos/${polo2}/members/${ids.gabrielli}`, { role: "comercial" }, as(joao))).status === 403, "a consultant linked someone to a polo");
      const del = await http.delete(`/polos/${polo2}/members/${ids.gabrielli}`, as(admin));
      assert(del.status === 200, `unlink ${del.status}`);
      const team2 = (await A(admin, "/analytics/team?range=today")).data;
      assert(!team2.consultants.find(b => b.user.id === ids.gabrielli).user.poloIds.includes(Number(polo2)), "the link stayed after removing");
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
