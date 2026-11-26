/* eslint-disable */
// Commercial analytics: the management center and the consultant's own screen read the same numbers, the numbers count only what
// a person really did, and a consultant can never read another consultant's numbers.
// Runs the real backend on its own port with a throw-away database and a Telegram mock (a real channel path:
// the send goes through the outbound worker and the adapter). Usage: npm run test:assign
// every enrollment is confirmed with its own RGM (the registration number of the student): unique per call
let rgmSeq = 7100000;
const nextRgm = () => String(++rgmSeq);

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
// free ports asked at start (scripts/e2e-ports.js): suites and runs side by side never collide
const [PORT, TG_PORT, AI_PORT] = require("./e2e-ports").freePorts(3);
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
const aiMock = { requests: [], poloId: 0, transcriptions: 0 };
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
const startAiMock = () => {
  const app = express();
  app.use(express.json());
  // OpenAI audio transcription (simulated): what a voice note of a conversation between people said
  app.post("/v1/audio/transcriptions", (req, res) => {
    aiMock.transcriptions += 1;
    req.resume();
    req.on("end", () => res.json({ text: "Quero saber o valor da mensalidade de Direito", duration: 4 }));
  });
  app.post("/v1/chat/completions", (req, res) => {
    aiMock.requests.push(req.body);
    return res.json({
      choices: [{ message: { content: JSON.stringify({
        summary: "Amostra elegível conferida no ambiente de teste.",
        strengths: ["Atendimentos registrados"],
        risks: [{ poloId: aiMock.poloId, issue: "Fila de teste", action: "Revisar a fila" }],
        nextActions: ["Acompanhar o próximo período"],
        caveats: []
      }) } }],
      usage: { prompt_tokens: 80, completion_tokens: 40, total_tokens: 120 }
    });
  });
  return new Promise(r => { const s = app.listen(AI_PORT, () => r(s)); });
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
const mkTicket = ({ owner = null, queue = queueId, status, ai = false, unread = 1, closed = false } = {}) => {
  seq += 1;
  const chat = `${7000 + seq}`;
  const contactId = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('Lead ${seq}', 'tg_${chat}', '', false, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
  const st = status || (closed ? "closed" : owner ? "open" : "pending");
  const ticketId = sql(`INSERT INTO Tickets (status, contactId, whatsappId, queueId, userId, aiActive, unreadMessages, isGroup, createdAt, updatedAt) VALUES ('${st}', ${contactId}, ${connectionId}, ${queue}, ${owner || "NULL"}, ${ai}, ${unread}, false, NOW(), NOW()) RETURNING id`).split("\n")[0];
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
      JWT_SECRET: "e2e", DASHBOARD_CACHE_MS: "0", JWT_REFRESH_SECRET: "e2e-r", LOGIN_RATE_MAX: "1000", TELEGRAM_API_URL: `http://localhost:${TG_PORT}`, OPENAI_API_URL: `http://localhost:${AI_PORT}`,
      SKIP_WHATSAPP_SESSIONS: "1", SKIP_DEFAULT_DATA: "1", LOG_LEVEL: "warn",
      // the background transcription of voice notes is run by the scenario itself (one run at a time, at the moment it wants)
      HUMAN_TRANSCRIBE_MS: "86400000"
    };
    execFileSync("npx", ["sequelize", "db:migrate"], { cwd: ROOT, env, stdio: "ignore" });
    execFileSync("npx", ["sequelize", "db:seed:all"], { cwd: ROOT, env, stdio: "ignore" });
    await startTelegramMock();
    await startAiMock();
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
    const tutor = await mkUser("Tutor QA", "tutor@x.com", "tutor");
    const academico = await mkUser("Acadêmico QA", "academico@x.com", "academico");
    const relacionamento = await mkUser("Relacionamento QA", "relacionamento@x.com", "relacionamento");
    ids = { joao: userId("joao@x.com"), gabrielli: userId("gabrielli@x.com"), laura: userId("laura@x.com"), coord: userId("coord@x.com"), tutor: userId("tutor@x.com"), admin: userId("admin@whaticket.com") };

    const w = await http.post("/whatsapp", { name: "Telegram", channel: "telegram", config: JSON.stringify({ botToken: "123:ABC" }), queueIds: [queueId] }, as(admin));
    assert(w.status === 200, `connection ${w.status}`);
    connectionId = w.data.id;
    await waitFor(async () => (await http.get(`/whatsapp/${connectionId}`, as(admin))).data.status === "CONNECTED", 12000, "connected");


    const A = (token, p) => http.get(p, as(token));
    const strip = b => { const { period, ...rest } = b; return rest; };
    const KPIS = ["messagesSent", "attendances", "peopleContacted", "reactivated", "leadsWorked", "pendingReply", "inProgress", "tasksOpen", "tasksOverdue", "tasksDone", "followUpsDue", "proposalsSent", "proposalsViewed", "enrollments", "conversion"];
    await test("management dashboard and feedback enforce access for all six roles", async () => {
      const denied = [joao, tutor, academico, relacionamento];
      assert((await http.get("/dashboard/management", as(admin))).status === 200, "admin could not read management dashboard");
      assert((await http.get("/dashboard/management", as(coord))).status === 200, "coordination could not read management dashboard");
      for (const token of denied) {
        assert((await http.get("/dashboard/management", as(token))).status === 403, "a non-manager read the management dashboard");
        assert((await http.post("/dashboard/management/feedback", { days: 1 }, as(token))).status === 403, "a non-manager generated management feedback");
      }
    });

    // The channel OpenBot → management (docs/API-V1.md, POST /api/v1/insights): a token with the scope writes warnings with no personal data;
    // the administrators (only) get one notice in the bell and see them in the commercial center; the same subject lives once; a panel
    // holds at most 20; the coordination, the consultant and the tutor neither see nor get anything.
    await test("OpenBot → management channel: scope, no personal data, once per subject, only the administrators, dismiss, limits", async () => {
      const mkToken = async (scopes, poloIds) => { const r = await http.post("/api-tokens", { name: `insights ${scopes.join("+")}`, scopes, ...(poloIds ? { poloIds } : {}) }, as(admin)); assert(r.status === 201, `token ${r.status} ${JSON.stringify(r.data)}`); return r.data.token; };
      const call = (tok, body) => http.post("/api/v1/insights", body, { headers: { Authorization: `Bearer ${tok}` } });
      const rows = () => Number(sql(`SELECT COUNT(*) FROM OpenbotInsights`));
      const bell = async tok => ((await http.get("/notifications", as(tok))).data.notifications || []).filter(n => n.kind === "openbot");
      const panel = async tok => (await http.get("/analytics/team", { ...as(tok), params: { range: "today" } }));
      const base = { kind: "indicador", level: "warning", title: "Origem Instagram caiu 40% na semana", body: "Os contatos da origem Instagram caíram 40% em relação à semana anterior.", link: "/estatisticas", dedupeKey: "origem-instagram:2026-11-26" };

      // scope: without insights:write, 403 and nothing written; with only insights:write the token writes but reads nothing else
      const reader = await mkToken(["indicators:read"]);
      const noScope = await call(reader, base);
      assert(noScope.status === 403 && noScope.data.error === "ERR_API_TOKEN_SCOPE" && rows() === 0, `token without insights:write: ${noScope.status} ${JSON.stringify(noScope.data)}`);
      const writer = await mkToken(["insights:write"]);
      assert((await http.get("/api/v1/indicadores", { headers: { Authorization: `Bearer ${writer}` } })).status === 403, "a token with only insights:write read the indicators");

      // a valid body: 201 with no id; one notice for each administrator, marked OpenBot; shown in the panel with the origin
      const first = await call(writer, base);
      assert(first.status === 201 && JSON.stringify(first.data) === JSON.stringify({ aceito: true }), `valid insight: ${first.status} ${JSON.stringify(first.data)}`);
      assert(rows() === 1, "the insight was not recorded");
      const notices = await bell(admin);
      assert(notices.length === 1 && notices[0].title === `OpenBot: ${base.title}` && notices[0].level === "warning" && notices[0].link === "/estatisticas", `the administrator's bell: ${JSON.stringify(notices)}`);
      const adminPanel = await panel(admin);
      assert(adminPanel.status === 200 && adminPanel.data.openbotInsights.length === 1 && adminPanel.data.openbotInsights[0].source === "OpenBot" && adminPanel.data.openbotInsights[0].title === base.title, `the administrator's panel: ${JSON.stringify(adminPanel.data.openbotInsights)}`);
      assert(!("tokenId" in adminPanel.data.openbotInsights[0]) && !("dedupeKey" in adminPanel.data.openbotInsights[0]), "the panel leaked internal fields");

      // the coordination, the consultant and the tutor: no notice, no block (the coordination reads the panel, with an empty list)
      const coordPanel = await panel(coord);
      assert(coordPanel.status === 200 && Array.isArray(coordPanel.data.openbotInsights) && coordPanel.data.openbotInsights.length === 0, `the coordination saw the block: ${JSON.stringify(coordPanel.data.openbotInsights)}`);
      assert((await panel(joao)).status === 403, "a consultant read the management panel");
      for (const [who, tok] of [["coordination", coord], ["consultant", joao], ["tutor", tutor]]) assert((await bell(tok)).length === 0, `${who} got the notice of the OpenBot`);
      assert((await http.put("/openbot-insights/1/resolve", {}, as(coord))).status === 403 && (await http.put("/openbot-insights/1/resolve", {}, as(joao))).status === 403, "someone other than the administrator dismissed it");

      // the same subject again: 200 duplicate, one row, one notice (nothing new)
      const again = await call(writer, { ...base, title: "Outro texto", body: "Outro corpo" });
      assert(again.status === 200 && JSON.stringify(again.data) === JSON.stringify({ duplicado: true }) && rows() === 1 && (await bell(admin)).length === 1, `duplicate: ${again.status} ${JSON.stringify(again.data)}`);
      assert(Number(sql(`SELECT COUNT(*) FROM OpenbotInsights WHERE title = 'Outro texto'`)) === 0, "the duplicate changed the content");

      // no personal data (fictitious cases): 400 and nothing written; an external or unknown link: 400
      const refused = [
        { title: "Ligar para 69999990000" }, { body: "Falar com fulano@exemplo.com" }, { body: "CPF 000.000.000-00 pediu bolsa" },
        { title: "Contato (69) 99999-0000" }, { body: "RGM 1234567 desistiu" }, { body: "veja https://exemplo.com/painel" }
      ];
      for (const [i, extra] of refused.entries()) {
        const r = await call(writer, { ...base, dedupeKey: `pessoal-${i}`, ...extra });
        assert(r.status === 400 && r.data.error === "ERR_INSIGHT_PERSONAL_DATA", `personal data ${JSON.stringify(extra)}: ${r.status} ${JSON.stringify(r.data)}`);
      }
      for (const link of ["https://exemplo.com", "javascript:alert(1)", "/users", "//exemplo.com"]) {
        const r = await call(writer, { ...base, dedupeKey: "link-ruim", link });
        assert(r.status === 400 && r.data.error === "ERR_INSIGHT_INVALID_LINK", `link ${link}: ${r.status} ${JSON.stringify(r.data)}`);
      }
      assert(rows() === 1, "a refused insight was written");
      // HTML in the text is kept as plain text (the screen does not read HTML; a unit test of the screen proves it)
      const html = await call(writer, { ...base, dedupeKey: "html-1", title: "<b>Atenção</b>", body: "<img src=x onerror=alert(1)>" });
      assert(html.status === 201 && sql(`SELECT title FROM OpenbotInsights WHERE dedupeKey = 'html-1'`) === "<b>Atenção</b>", "HTML was not stored as plain text");

      // a token of some polos writes too, and the insights are not filtered by polo (they are about the whole operation)
      const poloId = sql(`INSERT INTO Polos (code, name, active, createdAt, updatedAt) VALUES ('INS', 'Polo Insights', true, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const ofPolo = await mkToken(["insights:write"], [Number(poloId)]);
      assert((await call(ofPolo, { ...base, dedupeKey: "do-polo-1", title: "Matrículas do mês abaixo da meta" })).status === 201, "a token of one polo could not write");
      assert((await panel(admin)).data.openbotInsights.length === 3, "the insights of a token of one polo were filtered or lost");

      // dismiss: the administrator hides it; the row stays with resolvedAt; the subject can come back as a new one
      const mine = (await panel(admin)).data.openbotInsights.find(i => i.title === base.title);
      assert((await http.put(`/openbot-insights/${mine.id}/resolve`, {}, as(admin))).status === 200, "the administrator could not dismiss");
      assert(!(await panel(admin)).data.openbotInsights.some(i => i.id === mine.id) && Number(sql(`SELECT COUNT(*) FROM OpenbotInsights WHERE id = ${mine.id} AND resolvedAt IS NOT NULL`)) === 1, "dismiss did not hide it and keep the row");
      assert((await http.put("/openbot-insights/999999/resolve", {}, as(admin))).status === 404, "dismissing an unknown insight was not a 404");
      assert((await call(writer, base)).status === 201, "a dismissed subject could not come back");
      // an expired one leaves the panel and frees its subject
      sql(`UPDATE OpenbotInsights SET expiresAt = NOW() - INTERVAL '1 day' WHERE dedupeKey = 'html-1'`);
      assert(!(await panel(admin)).data.openbotInsights.some(i => i.title === "<b>Atenção</b>"), "an expired insight stayed in the panel");
      assert((await call(writer, { ...base, dedupeKey: "html-1", title: "De novo", body: "Texto novo" })).status === 201, "an expired subject could not come back");

      // validity: at most 7 days
      assert((await call(writer, { ...base, dedupeKey: "valid-8", expiresInDays: 8 })).data.error === "ERR_INSIGHT_INVALID_EXPIRY", "8 days were accepted");
      assert((await call(writer, { ...base, dedupeKey: "valid-30", expiresInDays: 30 })).data.error === "ERR_INSIGHT_INVALID_EXPIRY", "30 days were accepted");

      // the bell rings once for each OCCURRENCE: the subject that comes back after being dismissed or after expiring rings again
      sql(`UPDATE OpenbotInsights SET resolvedAt = NOW() WHERE resolvedAt IS NULL`);
      const ringing = await mkToken(["insights:write"]);
      const bellBefore = (await bell(admin)).length;
      assert((await call(ringing, { ...base, dedupeKey: "volta:semana", title: "Assunto que volta" })).status === 201, "occurrence 1");
      assert((await call(ringing, { ...base, dedupeKey: "volta:semana", title: "Assunto que volta" })).status === 200, "the duplicate in force");
      assert((await bell(admin)).length === bellBefore + 1, "the duplicate in force rang the bell again");
      const back = (await panel(admin)).data.openbotInsights.find(i => i.title === "Assunto que volta");
      assert((await http.put(`/openbot-insights/${back.id}/resolve`, {}, as(admin))).status === 200, "dismiss before the return");
      assert((await call(ringing, { ...base, dedupeKey: "volta:semana", title: "Assunto que volta" })).status === 201, "occurrence 2");
      assert((await bell(admin)).length === bellBefore + 2, "the subject that came back did not ring the bell again");

      // one definition of administrator: the profile admin (with another role) gets the notice AND sees the block; the bell and the screens agree
      const adm2 = await http.post("/users", { name: "Admin Dois", email: "admin2@x.com", password: "senha123", profile: "admin", role: "consultor", queueIds: [queueId] }, as(admin));
      assert(adm2.status === 200, `second administrator ${adm2.status} ${JSON.stringify(adm2.data)}`);
      // (the screen creates people as profile "user"; an old account can still carry profile admin with another role)
      sql(`UPDATE Users SET profile = 'admin' WHERE email = 'admin2@x.com'`);
      const admin2 = (await http.post("/auth/login", { email: "admin2@x.com", password: "senha123" })).data.token;
      assert((await call(ringing, { ...base, dedupeKey: "para-admin-2", title: "Para os dois administradores" })).status === 201, "insight for two administrators");
      assert((await bell(admin2)).some(n => n.title === "OpenBot: Para os dois administradores"), `the administrator by profile got no notice: user ${sql("SELECT CONCAT(profile, '|', role) FROM Users WHERE email = 'admin2@x.com'")}, notices ${JSON.stringify((await bell(admin2)).map(n => n.title))}`);
      assert((await panel(admin2)).data.openbotInsights.some(i => i.title === "Para os dois administradores"), "the administrator by profile did not see the block");
      assert((await http.put("/openbot-insights/resolve-all", {}, as(admin2))).status === 200, "the administrator by profile could not dismiss");

      // "dispensar todos": only the administrator; clears everything in force, the rows stay
      assert((await call(ringing, { ...base, dedupeKey: "todos-1", title: "Um" })).status === 201 && (await call(ringing, { ...base, dedupeKey: "todos-2", title: "Dois" })).status === 201, "two to dismiss");
      assert((await http.put("/openbot-insights/resolve-all", {}, as(coord))).status === 403 && (await http.put("/openbot-insights/resolve-all", {}, as(joao))).status === 403, "someone other than the administrator dismissed all");
      const dismissedAll = await http.put("/openbot-insights/resolve-all", {}, as(admin));
      assert(dismissedAll.status === 200 && dismissedAll.data.dismissed === 2, `dismiss all: ${dismissedAll.status} ${JSON.stringify(dismissedAll.data)}`);
      assert((await panel(admin)).data.openbotInsights.length === 0 && Number(sql(`SELECT COUNT(*) FROM OpenbotInsights WHERE dedupeKey IN ('todos-1', 'todos-2') AND resolvedAt IS NOT NULL`)) === 2, "dismiss all did not clear the block and keep the rows");

      // limits: at most 8 in force for each token (429 ERR_INSIGHT_TOKEN_LIMIT), 20 in all (429 ERR_INSIGHT_LIMIT with Retry-After) and, apart,
      // 30 calls an hour per token (429 of the limiter)
      sql(`UPDATE OpenbotInsights SET resolvedAt = NOW() WHERE resolvedAt IS NULL`);
      const busy = await mkToken(["insights:write"]);
      for (let i = 0; i < 8; i++) { const r = await call(busy, { ...base, dedupeKey: `lote-${i}`, title: `Recomendação ${i}` }); assert(r.status === 201, `fill ${i}: ${r.status} ${JSON.stringify(r.data)}`); }
      const perToken = await call(busy, { ...base, dedupeKey: "lote-8", title: "Recomendação 8" });
      assert(perToken.status === 429 && perToken.data.error === "ERR_INSIGHT_TOKEN_LIMIT" && perToken.headers["retry-after"], `the 9th of one token: ${perToken.status} ${JSON.stringify(perToken.data)}`);
      assert((await call(busy, { ...base, dedupeKey: "lote-3", title: "Recomendação 3" })).status === 200, "a duplicate was refused by the token limit");
      // another token still has room: the panel is not taken by one token
      const second = await mkToken(["insights:write"]), third = await mkToken(["insights:write"]);
      for (let i = 0; i < 8; i++) assert((await call(second, { ...base, dedupeKey: `s-${i}`, title: `Segundo ${i}` })).status === 201, `second token ${i}`);
      for (let i = 0; i < 4; i++) assert((await call(third, { ...base, dedupeKey: `t-${i}`, title: `Terceiro ${i}` })).status === 201, `third token ${i}`);
      const over = await call(third, { ...base, dedupeKey: "t-4", title: "Terceiro 4" });
      assert(over.status === 429 && over.data.error === "ERR_INSIGHT_LIMIT" && over.headers["retry-after"], `the 21st in force: ${over.status} ${JSON.stringify(over.data)}`);
      assert(Number(sql(`SELECT COUNT(*) FROM OpenbotInsights WHERE resolvedAt IS NULL AND expiresAt > NOW()`)) === 20, "more than 20 in force");
      // 30 calls an hour: the 31st call of the token `busy` (8 + 1 refused + 1 duplicate so far) is limited by the limiter itself
      for (let i = 0; i < 20; i++) assert((await call(busy, { ...base, dedupeKey: `x-${i}` })).status === 429, "a limit let one in");
      const limited = await call(busy, { ...base, dedupeKey: "lote-y" });
      assert(limited.status === 429 && limited.data.error === "ERR_TOO_MANY_REQUESTS" && limited.headers["retry-after"], `the 31st call in an hour: ${limited.status} ${JSON.stringify(limited.data)}`);
    });

    await test("polo supervisor feedback skips OpenAI when the sample is insufficient", async () => {
      const response = await http.post("/dashboard/management/feedback", { days: 31 }, as(admin));
      assert(response.status === 200, `management feedback ${response.status} ${JSON.stringify(response.data)}`);
      assert(response.data.period.days === 31 && response.data.minimumSample === 5, "feedback period or minimum sample is wrong");
      assert(Array.isArray(response.data.base) && typeof response.data.summary === "string" && Array.isArray(response.data.risks), "feedback response shape");
      assert(response.data.summary.includes("Nenhum polo atingiu"), "the empty sample should not need an OpenAI agent");
      assert((await http.post("/dashboard/management/feedback", { days: 1 }, as(joao))).status === 403, "a consultant opened management feedback");
      assert((await http.post("/dashboard/management/feedback", { days: 32 }, as(admin))).status === 400, "feedback accepted a range longer than 31 days");
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      assert((await http.post("/dashboard/management/feedback", { date: tomorrow }, as(admin))).status === 400, "feedback accepted a future date");
      for (let i = 0; i < 2; i += 1) assert((await http.post("/dashboard/management/feedback", { days: 21 + i }, as(admin))).status === 200, "feedback was rate limited before the configured maximum");
      assert((await http.post("/dashboard/management/feedback", { days: 23 }, as(admin))).status === 429, "management feedback is not rate limited per manager");
    });

    await test("eligible polo feedback reaches the provider with aggregates and caches its result", async () => {
      const polo = await http.post("/polos", { name: "Polo QA Feedback", city: "Porto Velho", state: "RO" }, as(admin));
      assert(polo.status === 201, `create test polo ${polo.status} ${JSON.stringify(polo.data)}`);
      const salesQueue = (polo.data.queues || []).find(q => q.role === "comercial");
      assert(salesQueue, "test polo has no sales queue");
      aiMock.poloId = Number(polo.data.id);
      // the coordination asks about its own polos only: this coordinator belongs to the polo of the sample
      sql(`INSERT INTO PoloMembers (poloId, userId, role, createdAt, updatedAt) VALUES (${aiMock.poloId}, ${ids.coord}, 'coordenacao', NOW(), NOW())`);
      sql("UPDATE AiAgents SET active=false");
      const agent = await http.post("/ai-agents", { name: "Supervisor QA", provider: "openai", model: "gpt-4o-mini", apiKey: "sk-test-only", active: true, dailyTokenCap: 100000 }, as(admin));
      assert(agent.status === 201, `create test AI agent ${agent.status} ${JSON.stringify(agent.data)}`);
      const tickets = Array.from({ length: 5 }, () => mkTicket({ queue: salesQueue.id }));
      const first = await http.post("/dashboard/management/feedback", { days: 1 }, as(coord));
      assert(first.status === 200, `eligible feedback ${first.status} ${JSON.stringify(first.data)}`);
      assert(first.data.summary === "Amostra elegível conferida no ambiente de teste.", "eligible model response was not returned");
      assert(first.data.risks[0]?.polo === "Polo QA Feedback" && first.data.risks[0]?.evidence.includes("5 atendimentos"), "risk evidence does not match the numeric base");
      assert(first.data.base.some(row => row.poloId === aiMock.poloId && row.attendances === 5), "eligible polo metrics were not reflected in the response");
      assert(aiMock.requests.length === 1, `expected one provider request, got ${aiMock.requests.length}`);
      const prompt = JSON.stringify(aiMock.requests[0].messages);
      const userPrompt = (aiMock.requests[0].messages || []).find(message => message.role === "user")?.content || "";
      assert(userPrompt.includes(`\"poloId\":${aiMock.poloId}`) && userPrompt.includes("\"attendances\":5"), `provider did not receive eligible aggregate metrics: ${userPrompt}`);
      assert(!prompt.includes("Polo QA Feedback") && !prompt.includes("João Vitor") && !prompt.includes("5569999990001"), "provider prompt included names or contact data");
      const cached = await http.post("/dashboard/management/feedback", { days: 1 }, as(coord));
      assert(cached.status === 200 && aiMock.requests.length === 1, "feedback result was not cached");
      assert(tickets.length === 5, "expected five synthetic tickets");
    });
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
      // the late task is on another lead of João, still in the funnel (enrolling a lead closes the tasks of its sale by themselves)
      const other = (await http.post("/leads", { name: "Outro lead do João", phone: "5569999990012", stageId: undefined }, as(joao))).data.lead;
      const task = (await http.post(`/leads/${other.id}/tasks`, { title: "Retornar", dueAt: new Date(Date.now() - 3600000).toISOString() }, as(joao))).data;
      assert(task.id, "task");
      assert((await http.put(`/leads/${lead.id}/stage`, { skipEnroll: true, stageId: stageWon.id }, as(admin))).status === 200, "enroll");
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
        // a coordinator with no polo yet sees no consultant (the same rule of the CRM); the polo comes in the test below
        const coordTeam = (await A(coord, `/analytics/team?range=${range}`)).data.consultants;
        assert(coordTeam.length === 0, `coordination with no polo sees ${coordTeam.length} consultants`);
        assert(mine.metrics && seen.metrics && inTeam, "a door answered without João");
        for (const k of KPIS) {
          assert(mine.metrics[k] === seen.metrics[k], `${k}: me=${mine.metrics[k]} manager=${seen.metrics[k]}`);
          assert(mine.metrics[k] === inTeam.metrics[k], `${k}: me=${mine.metrics[k]} team=${inTeam.metrics[k]}`);
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
      assert(m.peopleContacted === 3, `peopleContacted ${m.peopleContacted}`);
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
    await test("each conversation counts once, however many messages; two conversations of the same person are one person contacted", async () => {
      const before = (await A(laura, "/analytics/me?range=today")).data.metrics;
      const first = mkTicket();
      for (let i = 0; i < 4; i += 1) assert(ok(await send(laura, first.ticketId, `parte ${i}`)), "send");
      await sentOk(first.ticketId);
      sql(`UPDATE Tickets SET status = 'closed' WHERE id = ${first.ticketId}`);
      // the same person on another number (one live conversation per person and per number: the second one is on another line)
      const other = await http.post("/whatsapp", { name: "Telegram 2", channel: "telegram", config: JSON.stringify({ botToken: "456:DEF" }), queueIds: [queueId] }, as(admin));
      assert(other.status === 200, `second connection ${other.status}`);
      await waitFor(async () => (await http.get(`/whatsapp/${other.data.id}`, as(admin))).data.status === "CONNECTED", 12000, "second connected");
      const again = sql(`INSERT INTO Tickets (status, contactId, whatsappId, queueId, userId, unreadMessages, isGroup, createdAt, updatedAt) VALUES ('pending', ${first.contactId}, ${other.data.id}, ${queueId}, NULL, 1, false, NOW(), NOW()) RETURNING id`).split("\n")[0];
      sql(`INSERT INTO Messages (id, ticketId, contactId, body, fromMe, read, mediaType, ack, createdAt, updatedAt) VALUES ('seed-${again}', ${again}, ${first.contactId}, 'Voltei', false, false, 'chat', 0, NOW(), NOW())`);
      assert(ok(await send(laura, Number(again), "de novo")), "send again");
      await sentOk(Number(again));
      const after = (await A(laura, "/analytics/me?range=today")).data;
      assert(after.metrics.messagesSent - before.messagesSent === 5, `messages ${after.metrics.messagesSent - before.messagesSent}`);
      assert(after.metrics.attendances - before.attendances === 2, `conversations ${after.metrics.attendances - before.attendances}`);
      assert(after.metrics.peopleContacted - before.peopleContacted === 1, `people ${after.metrics.peopleContacted - before.peopleContacted}`);
      const today = after.series[after.series.length - 1];
      assert(today.attendances === after.metrics.attendances && today.peopleContacted === after.metrics.peopleContacted, `series ${JSON.stringify(today)}`);
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
    await test("Equipe agora lists the whole team (tutors, academic and relationship too), each with its area; the coordination sees its polo", async () => {
      const team = (await A(admin, "/analytics/team?range=today")).data.team;
      const byId = new Map(team.map(m => [m.user.id, m]));
      const area = email => (byId.get(userId(email)) || {}).user?.area;
      assert(area("joao@x.com") === "comercial" && area("tutor@x.com") === "tutoria" && area("academico@x.com") === "tutoria" && area("relacionamento@x.com") === "relacionamento" && area("coord@x.com") === "gestao", `areas: ${JSON.stringify(team.map(m => [m.user.name, m.user.area]))}`);
      assert(team.every(m => m.presence && typeof m.presence.online === "boolean" && typeof m.ownNumber === "boolean"), "presence of the team");
      // the coordinator tied to the polo above sees the people of that polo (and itself), never the others
      const scoped = (await A(coord, "/analytics/team?range=today")).data.team.map(m => m.user.id);
      assert(scoped.includes(ids.joao) && !scoped.includes(ids.gabrielli) && !scoped.includes(ids.tutor), `coordination scope of the team: ${JSON.stringify(scoped)}`);
      assert((await A(joao, "/analytics/team?range=today")).status === 403, "a consultant read the team");
    });

    await test("esperando resposta: only what needs an answer (lead in negotiation, last 7 days, not ok or obrigado, not a reaction); older ones are esquecidas; the alert says how long the oldest waits; the same number in Responder agora", async () => {
      const before = (await A(joao, "/analytics/me?range=today")).data.metrics;
      const open = sql(`SELECT id FROM LeadStages WHERE type='open' ORDER BY position LIMIT 1`).split("\n")[0];
      const won = sql(`SELECT id FROM LeadStages WHERE type='won' ORDER BY position LIMIT 1`).split("\n")[0];
      const lastFrom = (t, text, ago, type = "chat") => sql(`UPDATE Tickets SET status='open', lastMessageFromMe=false, lastMessageId='lm-${t.ticketId}', lastMessage='${text}', lastMessageType='${type}', lastMessageAt=NOW() - INTERVAL '${ago}' WHERE id=${t.ticketId}`);
      const lead = (t, stage, enrolled = false) => sql(`INSERT INTO Leads (name, phone, source, stageId, ownerId, contactId, isHistorical, enrolledAt, createdAt, updatedAt) VALUES ('Lead ER ${t.ticketId}', '55699${t.ticketId}', 'WhatsApp', ${stage}, ${ids.joao}, ${t.contactId}, false, ${enrolled ? "NOW()" : "NULL"}, NOW(), NOW())`);
      // a question of a lead in negotiation, two hours ago: waits
      const asks = mkTicket({ owner: ids.joao }); lead(asks, open); lastFrom(asks, "Qual o valor da mensalidade?", "2 hours");
      // the sale was made: an enrolled lead (won stage) who wrote last does not wait
      const sold = mkTicket({ owner: ids.joao }); lead(sold, won, true); lastFrom(sold, "Recebi o boleto", "1 hour");
      // "Obrigada!" and a thumbs up close the subject; a reaction too
      const thanks = mkTicket({ owner: ids.joao }); lead(thanks, open); lastFrom(thanks, "Obrigada!", "3 hours");
      const thumbs = mkTicket({ owner: ids.joao }); lastFrom(thumbs, "👍", "3 hours");
      const reacted = mkTicket({ owner: ids.joao }); lastFrom(reacted, "", "3 hours", "reaction");
      // "ok, e o valor?" still waits (a question after the ok)
      const okq = mkTicket({ owner: ids.joao }); lastFrom(okq, "ok, e o valor?", "30 minutes");
      // a lost lead who writes again after the loss (came back, answered a recovery) waits; a lost lead who wrote before the loss does not
      const lost = sql(`SELECT id FROM LeadStages WHERE type='lost' ORDER BY position LIMIT 1`).split("\n")[0];
      const back = mkTicket({ owner: ids.joao }); lastFrom(back, "Mudei de ideia, ainda dá tempo?", "20 minutes");
      sql(`INSERT INTO Leads (name, phone, source, stageId, ownerId, contactId, isHistorical, lostAt, createdAt, updatedAt) VALUES ('Lead ER volta', '55698${back.ticketId}', 'WhatsApp', ${lost}, ${ids.joao}, ${back.contactId}, false, NOW() - INTERVAL '2 days', NOW(), NOW())`);
      const gone = mkTicket({ owner: ids.joao }); lastFrom(gone, "Não tenho interesse", "3 days");
      sql(`INSERT INTO Leads (name, phone, source, stageId, ownerId, contactId, isHistorical, lostAt, createdAt, updatedAt) VALUES ('Lead ER perdido', '55697${gone.ticketId}', 'WhatsApp', ${lost}, ${ids.joao}, ${gone.contactId}, false, NOW() - INTERVAL '1 day', NOW(), NOW())`);
      // an old lost lead and a new lead in negotiation for the same contact: waits
      const again = mkTicket({ owner: ids.joao }); lastFrom(again, "Quero tentar de novo", "40 minutes");
      sql(`INSERT INTO Leads (name, phone, source, stageId, ownerId, contactId, isHistorical, lostAt, createdAt, updatedAt) VALUES ('Lead ER antigo', '55696${again.ticketId}', 'WhatsApp', ${lost}, ${ids.joao}, ${again.contactId}, true, NOW() - INTERVAL '90 days', NOW() - INTERVAL '120 days', NOW())`);
      lead(again, open);
      // "Ok?" is a question, not a closing
      const okAsk = mkTicket({ owner: ids.joao }); lastFrom(okAsk, "Ok?", "15 minutes");
      // ten days without an answer: not "esperando", but "esquecida"
      const old = mkTicket({ owner: ids.joao }); lead(old, open); lastFrom(old, "Ainda tem vaga?", "10 days");
      const after = (await A(joao, "/analytics/me?range=today")).data;
      const named = { asks, sold, thanks, thumbs, reacted, okq, back, gone, again, okAsk, old };
      const which = (after.focus.conversations || []).map(c => Object.keys(named).find(k => named[k].ticketId === c.ticketId) || c.ticketId);
      assert(after.metrics.pendingReply - before.pendingReply === 5, `esperando: ${before.pendingReply} -> ${after.metrics.pendingReply} (the question, the ok with a question, the lost lead who came back, the new lead of a lost contact and the "Ok?"): ${JSON.stringify(which)}`);
      assert(after.metrics.forgottenReply - (before.forgottenReply || 0) === 1, `esquecidas: ${before.forgottenReply} -> ${after.metrics.forgottenReply}`);
      // Responder agora lists the same conversations
      const listed = (after.focus.conversations || []).map(c => c.ticketId);
      assert([asks, okq, back, again, okAsk].every(t => listed.includes(t.ticketId)), `Responder agora is missing what waits: ${JSON.stringify(listed)}`);
      assert(![sold, thanks, thumbs, reacted, old, gone].some(t => listed.includes(t.ticketId)), `Responder agora lists what does not wait: ${JSON.stringify(listed)}`);
      // the alert says how long the oldest waits, and the forgotten ones are a separate, lighter notice (João gets a connected number for
      // this check: someone without a number gets only the "no WhatsApp" alert)
      const own = sql(`INSERT INTO Whatsapps (name, status, channel, ownerId, isDefault, createdAt, updatedAt) VALUES ('Número do João ER', 'CONNECTED', 'whatsapp', ${ids.joao}, false, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const alerts = (await A(admin, "/analytics/team?range=today")).data.alerts.filter(a => a.userId === ids.joao);
      sql(`DELETE FROM Whatsapps WHERE id=${own}`);
      const waiting = alerts.find(a => a.code === "pending_reply");
      assert(waiting && /esperando resposta, o mais antigo há \d+ (h|min|dias)/.test(waiting.text), `alert of the waiting ones: ${JSON.stringify(alerts.map(a => a.text))}`);
      assert(alerts.some(a => a.code === "forgotten_reply" && a.level === "medium" && /parada|paradas/.test(a.text)), `alert of the forgotten ones: ${JSON.stringify(alerts.map(a => a.text))}`);
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
      // (moving a card to "Matriculado" now needs the confirmation of the enrollment, which this environment cannot make for lack of a tutor's channel: the
      // management records the win, and João's own work on the lead is what tells the screens)
      await http.put(`/leads/${lead2.id}/stage`, { skipEnroll: true, stageId: stageWon.id }, as(admin));
      await http.post(`/leads/${lead2.id}/activities`, { type: "note", body: "Matrícula confirmada com o aluno" }, as(joao));
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

    await test("ambientação: a consultant sees only the students THEY sent and cannot run the tutor's steps; a ticked task stays registered with who ticked it", async () => {
      const mine = (await http.post("/leads", { name: "Aluno do João", phone: "5569999990081", ownerId: ids.joao }, as(admin))).data.lead;
      const theirs = (await http.post("/leads", { name: "Aluno da Gabrielli", phone: "5569999990082", ownerId: ids.gabrielli }, as(admin))).data.lead;
      sql(`UPDATE Leads SET enrolledAt = NOW(), onboardingStatus = 'pending' WHERE id IN (${mine.id}, ${theirs.id})`);
      const seen = (await http.get("/onboarding", as(joao))).data;
      assert(seen.some(l => l.id === mine.id), "João does not see his own student");
      assert(!seen.some(l => l.id === theirs.id), "João sees a student another consultant sent");
      const all = (await http.get("/onboarding", as(admin))).data;
      assert(all.some(l => l.id === mine.id) && all.some(l => l.id === theirs.id), "the management must see everyone");
      assert((await http.post(`/leads/${mine.id}/onboarding`, { action: "start" }, as(joao))).status === 403, "a consultant started the ambientação");
      assert((await http.put(`/leads/${mine.id}/onboarding`, { tutorId: null }, as(joao))).status === 403, "a consultant changed the tutor");
      // tasks: the one ticked stays in "done", latest first, with who ticked it; unticking brings it back
      const t1 = (await http.post(`/leads/${mine.id}/tasks`, { title: "Primeira", dueAt: new Date(Date.now() + 3600000).toISOString() }, as(joao))).data;
      const t2 = (await http.post(`/leads/${mine.id}/tasks`, { title: "Segunda", dueAt: new Date(Date.now() + 7200000).toISOString() }, as(joao))).data;
      assert((await http.post(`/leads/${mine.id}/tasks/${t1.id}/toggle`, {}, as(joao))).status === 200, "tick 1");
      await sleep(30);
      assert((await http.post(`/leads/${mine.id}/tasks/${t2.id}/toggle`, {}, as(joao))).status === 200, "tick 2");
      const done = (await http.get("/lead-tasks?status=done&scope=mine", as(joao))).data;
      const idx = id => done.findIndex(t => t.id === id);
      assert(idx(t1.id) >= 0 && idx(t2.id) >= 0 && idx(t2.id) < idx(t1.id), "the done tasks are not listed latest first");
      assert(done.find(t => t.id === t2.id).doneBy && done.find(t => t.id === t2.id).doneBy.id === ids.joao, "who ticked is not registered");
      const open = (await http.get("/lead-tasks?status=open&scope=mine", as(joao))).data;
      assert(!open.some(t => t.id === t1.id), "a done task is still open");
      assert((await http.post(`/leads/${mine.id}/tasks/${t1.id}/toggle`, {}, as(joao))).status === 200, "untick");
      assert((await http.get("/lead-tasks?status=open&scope=mine", as(joao))).data.some(t => t.id === t1.id), "an unticked task did not come back");
    });

    await test("a student can enroll again: each enrollment counts for the consultant, the first stays, and the list shows all of them", async () => {
      const before = (await A(joao, "/analytics/me?range=today")).data.metrics.enrollments;
      const polo3 = sql(`INSERT INTO Polos (code, name, active, createdAt, updatedAt) VALUES ('AN3', 'Polo AN3', true, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const lead = (await http.post("/leads", { name: "Aluna de duas matrículas", phone: "5569999990077", ownerId: ids.joao }, as(admin))).data.lead;
      // the first enrollment (here by moving to the won stage: this environment has no WhatsApp channel for the tutor's chat)
      assert((await http.put(`/leads/${lead.id}/stage`, { skipEnroll: true, stageId: stageWon.id }, as(admin))).status === 200, "first enrollment");
      sql(`UPDATE Leads SET enrolledAt = NOW(), poloId = ${polo3} WHERE id = ${lead.id}`);
      assert((await http.post(`/leads/${lead.id}/enroll`, { rgm: nextRgm(), poloId: Number(polo3), additional: true }, as(joao))).status !== 500, "a consultant enrolling again must not crash");
      sql(`DELETE FROM LeadEnrollments WHERE leadId = ${lead.id}`);
      const second = await http.post(`/leads/${lead.id}/enroll`, { rgm: nextRgm(), poloId: Number(polo3), additional: true, courseName: "Pedagogia", fee: "exempt" }, as(admin));
      assert(second.status === 200 && second.data.enrollment && second.data.number === 2, `second enrollment ${second.status} ${JSON.stringify(second.data).slice(0, 300)}`);
      const third = await http.post(`/leads/${lead.id}/enroll`, { rgm: nextRgm(), poloId: Number(polo3), additional: true, courseName: "Administração" }, as(admin));
      assert(third.status === 200 && third.data.number === 3, "third enrollment");
      const list = (await http.get(`/leads/${lead.id}/enrollments`, as(admin))).data;
      assert(list.length === 3 && list[1].courseName === "Pedagogia" && list[2].courseName === "Administração", `list ${JSON.stringify(list)}`);
      const after = (await A(joao, "/analytics/me?range=today")).data.metrics.enrollments;
      assert(after === before + 3, `the three enrollments counted ${after - before}`);
      assert((await http.post(`/leads/${lead.id + 9999}/enroll`, { rgm: nextRgm(), poloId: Number(polo3), additional: true }, as(admin))).status === 404, "unknown lead");
    });

    await test("the print of the enrollment is kept with it, the management lists the enrollments inside the goal and postpones a goal with a reason", async () => {
      const FormData = require("form-data");
      const day = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });
      const now = new Date();
      const polo4 = sql(`INSERT INTO Polos (code, name, active, createdAt, updatedAt) VALUES ('AN4', 'Polo AN4', true, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const goalId = sql(`INSERT INTO Goals (title, startsOn, endsOn, status, kind, workDays, createdAt, updatedAt) VALUES ('Meta teste', '${day(new Date(now.getTime() - 5 * 864e5))}', '${day(new Date(now.getTime() + 30 * 864e5))}', 'active', 'polo', 5, NOW(), NOW()) RETURNING id`).split("\n")[0];
      sql(`INSERT INTO GoalPolos (goalId, poloId, target, manualCount, canceled, createdAt, updatedAt) VALUES (${goalId}, ${polo4}, 10, 0, 0, NOW(), NOW())`);
      const lead = (await http.post("/leads", { name: "Aluna com print", phone: "5569999990078", ownerId: ids.joao }, as(admin))).data.lead;
      assert((await http.put(`/leads/${lead.id}/stage`, { skipEnroll: true, stageId: stageWon.id }, as(admin))).status === 200, "won");
      sql(`UPDATE Leads SET enrolledAt = NOW(), poloId = ${polo4} WHERE id = ${lead.id}`);
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
      const form = new FormData();
      form.append("file", png, { filename: "matricula.png", contentType: "image/png" });
      const up = await http.post(`/leads/${lead.id}/enrollment-proof`, form, { headers: { ...form.getHeaders(), ...as(admin).headers } });
      assert(up.status === 200 && up.data.id && "reading" in up.data, `upload ${up.status} ${JSON.stringify(up.data).slice(0, 200)}`);
      const second = await http.post(`/leads/${lead.id}/enroll`, { rgm: nextRgm(), poloId: Number(polo4), additional: true, courseName: "Pedagogia", fee: "exempt", proofId: up.data.id }, as(admin));
      assert(second.status === 200, `enroll ${second.status}`);
      const file = await http.get(`/leads/${lead.id}/enrollment-proof/${up.data.id}/file`, as(admin));
      assert(file.status === 200 && String(file.headers["content-type"]).startsWith("image/png"), `proof file ${file.status}`);
      const list = await http.get(`/enrollments?from=${day(new Date(now.getTime() - 864e5))}&to=${day(new Date(now.getTime() + 864e5))}&poloId=${polo4}`, as(admin));
      assert(list.status === 200 && list.data.total === 2, `enrollments ${list.status} ${JSON.stringify(list.data).slice(0, 300)}`);
      const extra = list.data.rows.find(r => r.enrollmentId);
      assert(extra && extra.proofId === up.data.id && extra.inGoal === true && extra.goal === "Meta teste" && list.data.inGoal === 2, `inside the goal ${JSON.stringify(list.data.rows)}`);
      assert((await http.get("/enrollments", as(joao))).status === 403, "a consultant listed the enrollments");
      const later = day(new Date(now.getTime() + 60 * 864e5));
      assert((await http.post(`/goals/${goalId}/postpone`, { endsOn: later }, as(admin))).status === 400, "postponed without a reason");
      const moved = await http.post(`/goals/${goalId}/postpone`, { endsOn: later, reason: "Prorrogação do calendário" }, as(admin));
      assert(moved.status === 200 && moved.data.changed === true, `postpone ${moved.status}`);
      const changes = (await http.get(`/goals/${goalId}/changes`, as(admin))).data;
      assert(changes.length === 1 && changes[0].to === later && changes[0].reason === "Prorrogação do calendário" && changes[0].by, `history ${JSON.stringify(changes)}`);
    });

    await test("the goals of every polo: a consultant reads them (target, done and pace, never a person) and their own polos are marked", async () => {
      const r = await A(joao, "/dashboard/polos-progress");
      assert(r.status === 200 && r.data.goal && Array.isArray(r.data.polos) && r.data.polos.length >= 1, `polos progress ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
      const row = r.data.polos.find(p => p.target === 10);
      assert(row && typeof row.done === "number" && typeof row.pct === "number", `the polo with a goal of 10: ${JSON.stringify(r.data.polos)}`);
      const allowed = ["poloId", "name", "target", "done", "pct", "status", "missing", "perDay", "expectedPct", "forecast"];
      assert(r.data.polos.every(p => Object.keys(p).every(k => allowed.includes(k))), `a polo card carries more than the goal: ${JSON.stringify(r.data.polos[0])}`);
      const mine = sql(`SELECT string_agg(poloId::text, ',' ORDER BY poloId) FROM PoloMembers WHERE userId = ${ids.joao}`) || "";
      assert([...r.data.mine].sort((a, b) => a - b).join(",") === mine, `the polos of the consultant: ${JSON.stringify(r.data.mine)} vs ${mine}`);
      assert((await http.get("/dashboard/polos-progress")).status === 401, "the goals of the polos without login");
    });

    // ------------------------------------------------------------ Estatísticas → Comercial e Tutoria
    console.log("\nEstatísticas do comercial e da tutoria");
    await test("the commercial view: volume, sales by consultant, city and course, the leads stopped in a column, grades and the time in each column", async () => {
      const open = sql(`SELECT id FROM LeadStages WHERE type='open' ORDER BY position LIMIT 1`).split("\n")[0];
      const next = sql(`SELECT id FROM LeadStages WHERE type='open' ORDER BY position OFFSET 1 LIMIT 1`).split("\n")[0] || open;
      // a lead of Gabrielli open in the first column for 10 days (stopped), and one that spent 3 days there before moving on
      sql(`INSERT INTO Leads (name, phone, source, stageId, ownerId, isHistorical, createdAt, updatedAt) VALUES ('Parado', '5569000000101', 'WhatsApp', ${open}, ${ids.gabrielli}, false, NOW() - INTERVAL '10 days', NOW())`);
      const moved = sql(`INSERT INTO Leads (name, phone, source, stageId, ownerId, isHistorical, createdAt, updatedAt) VALUES ('Andou', '5569000000102', 'WhatsApp', ${next}, ${ids.gabrielli}, false, NOW() - INTERVAL '3 days', NOW()) RETURNING id`).split("\n")[0];
      sql(`INSERT INTO LeadActivities (leadId, userId, type, body, meta, createdAt, updatedAt) VALUES (${moved}, ${ids.gabrielli}, 'stage', 'A → B', '{"from":${open},"to":${next}}', NOW(), NOW())`);
      sql(`INSERT INTO LeadActivities (leadId, userId, type, body, createdAt, updatedAt) VALUES (${moved}, ${ids.gabrielli}, 'grade_sent', 'Grade enviada', NOW(), NOW())`);
      const r = await A(admin, "/analytics/commercial?range=month");
      assert(r.status === 200, `commercial ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
      const d = r.data;
      const jo = d.consultants.find(c => c.userId === ids.joao);
      const ga = d.consultants.find(c => c.userId === ids.gabrielli);
      assert(jo && jo.enrollments >= 1 && jo.conversations >= 3 && jo.peopleContacted >= 3, `João ${JSON.stringify(jo)}`);
      assert(ga && ga.stalled >= 1 && ga.gradesSent === 1, `Gabrielli ${JSON.stringify(ga)}`);
      assert(d.sales.byConsultant.some(x => x.userId === ids.joao) && d.sales.byCity.length >= 1 && d.sales.byCourse.length >= 1, `sales ${JSON.stringify(d.sales)}`);
      const first = d.stages.find(st => st.stageId === Number(open));
      assert(first && first.stalled >= 1 && first.byConsultant.some(x => x.userId === ids.gabrielli && x.stalled >= 1), `stalled ${JSON.stringify(first)}`);
      assert(d.volume.conversations >= jo.conversations && d.volume.peopleContacted >= jo.peopleContacted, `volume ${JSON.stringify(d.volume)}`);
      // one consultant narrows it; a polo narrows it
      const one = (await A(admin, `/analytics/commercial?range=month&userId=${ids.gabrielli}`)).data;
      assert(one.consultants.length === 1 && one.consultants[0].userId === ids.gabrielli, "the filter by consultant");
      // only her lead left the first column, after 3 days in it
      const hers = one.stages.find(st => st.stageId === Number(open));
      assert(hers && hers.avgDays !== null && hers.avgDays >= 2.5 && hers.avgDays <= 3.5, `time in the column ${hers && hers.avgDays}`);
    });
    await test("who skipped a step of the process: only the management reads the list (it names leads)", async () => {
      for (const who of [joao, tutor]) assert((await A(who, "/analytics/process/skipped?range=month&step=grade")).status === 403, "someone outside the management read who skipped a step");
      assert((await http.get("/analytics/process/skipped?range=month&step=grade")).status === 401, "the list without login");
      const r = await A(admin, "/analytics/process/skipped?range=month&step=an-unknown-step");
      assert(r.status === 200 && Array.isArray(r.data.rows) && r.data.rows.length === 0, `unknown step ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
      assert((await A(coord, "/analytics/process/skipped?range=month&step=grade")).status === 200, "the coordination could not read the list");
      const c = (await A(admin, "/analytics/commercial?range=month")).data;
      assert(typeof c.process.samples === "number", "the commercial view lost the number of conversations with a process");
    });
    await test("Estatísticas by university: the leads and conversations of another university leave the numbers of the default one", async () => {
      const made = await http.post("/institutions", { name: "Universidade Norte Estatísticas", shortName: "Norte Est" }, as(admin));
      assert(made.status === 201, `university ${made.status} ${JSON.stringify(made.data)}`);
      const north = made.data.id;
      const def = Number(sql(`SELECT id FROM Institutions WHERE isDefault = true`));
      // the stopped lead of Gabrielli is of the north university; the one that moved has no university (= the default)
      sql(`UPDATE Leads SET institutionId = ${north} WHERE phone = '5569000000101'`);
      const all = (await A(admin, `/analytics/commercial?range=month&userId=${ids.gabrielli}`)).data;
      const n = (await A(admin, `/analytics/commercial?range=month&userId=${ids.gabrielli}&institutionId=${north}`)).data;
      const d = (await A(admin, `/analytics/commercial?range=month&userId=${ids.gabrielli}&institutionId=${def}`)).data;
      const stalled = x => x.consultants[0] ? x.consultants[0].stalled : -1;
      assert(stalled(all) >= 1 && stalled(n) === 1 && stalled(d) === stalled(all) - 1, `stalled leads by university: all ${stalled(all)}, north ${stalled(n)}, default ${stalled(d)}`);
      // the north university has no conversation: its volume is zero, the default keeps the conversations with no university
      assert(n.volume.conversations === 0 && d.volume.conversations === all.volume.conversations, `conversations by university: ${JSON.stringify({ all: all.volume, north: n.volume, dflt: d.volume })}`);
      assert((await A(admin, "/analytics/commercial?range=month&institutionId=999999")).status === 404, "a university that does not exist");
      sql(`UPDATE Leads SET institutionId = NULL WHERE phone = '5569000000101'`);
      assert((await http.delete(`/institutions/${north}`, as(admin))).status === 200, "the test university was not removed");
    });
    await test("a consultant reads only their own commercial numbers, whatever the query says; the coordination only its polos", async () => {
      const mine = await A(joao, `/analytics/commercial?range=month&userId=${ids.gabrielli}&poloId=1`);
      assert(mine.status === 200 && mine.data.consultants.length === 1 && mine.data.consultants[0].userId === ids.joao, `consultant ${JSON.stringify(mine.data.consultants)}`);
      assert(!JSON.stringify(mine.data).includes("Gabrielli"), "a consultant saw someone else's name");
      assert((await A(coord, `/analytics/commercial?range=month&userId=${ids.gabrielli}`)).status === 403, "the coordination read a consultant outside its polos");
      assert((await A(joao, "/analytics/coaching")).status === 403, "a consultant read the training of the team");
    });
    await test("the tutoring view: the management sees every tutor, a consultant is refused", async () => {
      const t = await A(admin, "/analytics/tutoria?range=month");
      assert(t.status === 200 && t.data.scope === "all" && typeof t.data.totals.students === "number" && Array.isArray(t.data.onboardingStalled) && t.data.panel, `tutoria ${t.status} ${JSON.stringify(t.data).slice(0, 300)}`);
      assert((await A(joao, "/analytics/tutoria")).status === 403, "a consultant read the tutoring");
    });
    await test("insights: the management reads the team (the stopped lead of Gabrielli included), a consultant only their own; who is online is for the management", async () => {
      const team = await A(admin, "/analytics/insights");
      assert(team.status === 200 && Array.isArray(team.data.items), `insights ${team.status} ${JSON.stringify(team.data).slice(0, 300)}`);
      assert(team.data.items.every(i => i.title && i.detail && i.link && ["danger", "warn", "good", "info"].includes(i.tone)), `shape ${JSON.stringify(team.data.items).slice(0, 300)}`);
      assert(team.data.items.some(i => i.key === "stale"), `the stopped lead did not become an insight ${JSON.stringify(team.data.items.map(i => i.key))}`);
      const mine = await A(joao, "/analytics/insights");
      assert(mine.status === 200 && Array.isArray(mine.data.items) && !mine.data.items.some(i => i.key === "away_with_leads" || i.key === "unassigned"), `consultant ${JSON.stringify(mine.data).slice(0, 300)}`);
      const on = await A(admin, "/analytics/online");
      const me = on.data.users && on.data.users.find(u => u.id === ids.admin);
      assert(on.status === 200 && me && me.online === true && me.lastSeenAt, `online ${on.status} ${JSON.stringify(on.data).slice(0, 300)}`);
      assert((await A(joao, "/analytics/online")).status === 403, "a consultant read who is online");
    });
    await test("a second record with a name that exists is a clear refusal (409), never a server error", async () => {
      const once = await http.post("/tags", { name: "Etiqueta repetida", color: "#0693E3" }, { headers: { Authorization: `Bearer ${admin}` } });
      const twice = await http.post("/tags", { name: "Etiqueta repetida", color: "#0693E3" }, { headers: { Authorization: `Bearer ${admin}` } });
      assert([200, 201].includes(once.status) && twice.status === 409 && twice.data.error === "ERR_DUPLICATED", `tags ${once.status} ${twice.status} ${JSON.stringify(twice.data)}`);
    });
    await test("Meu desempenho: the consultant gets only their own numbers, leads, to-dos and results, whatever the query says", async () => {
      const mine = await A(joao, `/analytics/me/overview?range=month&userId=${ids.gabrielli}`);
      assert(mine.status === 200, `overview ${mine.status} ${JSON.stringify(mine.data).slice(0, 300)}`);
      const d = mine.data;
      assert(d.user.id === ids.joao && d.results && d.results.now && typeof d.results.now.enrollments === "number" && d.leads && Array.isArray(d.leads.stages) && Array.isArray(d.insights) && d.focus && Array.isArray(d.tips), `shape ${JSON.stringify(d).slice(0, 400)}`);
      const ownLeads = Number(sql(`SELECT COUNT(*) FROM Leads l JOIN LeadStages s ON s.id = l.stageId WHERE s.type='open' AND l.ownerId=${ids.joao} AND l.isHistorical=false`));
      assert(d.leads.open === ownLeads, `leads of João ${d.leads.open} vs ${ownLeads}`);
      assert(!JSON.stringify(d).includes("Gabrielli") && !d.insights.some(i => i.key === "away_with_leads" || i.key === "unassigned"), "a consultant saw someone else's data");
      const hers = (await A(gabrielli, "/analytics/me/overview?range=month")).data;
      assert(hers.user.id === ids.gabrielli && hers.leads.stages.some(st => st.n >= 1), `Gabrielli sees her own leads ${JSON.stringify(hers.leads)}`);
    });

    // ------------------------------------------------------------ Tarefas que fecham sozinhas e central de avisos
    console.log("\nTarefas e avisos");
    const openStage = () => sql(`SELECT id FROM LeadStages WHERE type='open' ORDER BY position LIMIT 1`).split("\n")[0];
    const mkLeadFor = (owner, name) => {
      const t = mkTicket({ owner });
      const id = sql(`INSERT INTO Leads (name, phone, source, stageId, ownerId, contactId, isHistorical, createdAt, updatedAt) VALUES ('${name}', '55690000${Math.floor(Math.random() * 90000 + 10000)}', 'WhatsApp', ${openStage()}, ${owner}, ${t.contactId}, false, NOW(), NOW()) RETURNING id`).split("\n")[0];
      return { leadId: Number(id), ticket: t };
    };
    const taskOf = id => { const [doneAt, reason, userId] = sql(`SELECT COALESCE(doneAt::text, ''), COALESCE(closedReason, ''), COALESCE(userId::text, '') FROM LeadTasks WHERE id=${id}`).split("|"); return { done: !!doneAt, reason, userId: userId ? Number(userId) : null }; };
    await test("tasks: non-managers own tasks they create and cannot link another lead's conversation", async () => {
      const { leadId, ticket } = mkLeadFor(ids.joao, "Lead da tutoria com tarefa própria");
      sql(`UPDATE Leads SET onboardingTutorId=${ids.tutor}, onboardingStatus='pending' WHERE id=${leadId}`);
      const inaccessible = await http.post(`/leads/${leadId}/tasks`, { title: "Tarefa com conversa fora do escopo", dueAt: new Date(Date.now() + 3600000).toISOString(), ticketId: ticket.ticketId }, as(tutor));
      assert(inaccessible.status === 403, `a tutor linked a conversation outside their role's scope: ${inaccessible.status}`);
      const own = await http.post(`/leads/${leadId}/tasks`, { title: "Tarefa da tutoria", dueAt: new Date(Date.now() + 3600000).toISOString() }, as(tutor));
      assert(own.status === 201 && own.data.userId === ids.tutor, `a task created by a tutor was assigned to someone else: ${own.status} ${JSON.stringify(own.data)}`);

      const linkedLead = mkLeadFor(ids.joao, "Lead com conversa vinculada");
      const valid = await http.post(`/leads/${linkedLead.leadId}/tasks`, { title: "Retorno da conversa certa", dueAt: new Date(Date.now() + 3600000).toISOString(), ticketId: linkedLead.ticket.ticketId }, as(joao));
      assert(valid.status === 201 && valid.data.ticketId === linkedLead.ticket.ticketId, `the matching conversation could not be linked: ${valid.status} ${JSON.stringify(valid.data)}`);

      const otherTicket = mkTicket({ owner: ids.joao });
      const wrong = await http.post(`/leads/${linkedLead.leadId}/tasks`, { title: "Conversa de outro lead", dueAt: new Date(Date.now() + 3600000).toISOString(), ticketId: otherTicket.ticketId }, as(joao));
      assert(wrong.status === 403, `a task linked to a different lead's conversation was accepted: ${wrong.status}`);
      const missing = await http.post(`/leads/${linkedLead.leadId}/tasks`, { title: "Conversa inexistente", dueAt: new Date(Date.now() + 3600000).toISOString(), ticketId: 999999999 }, as(joao));
      assert(missing.status === 404, `a task accepted a nonexistent conversation: ${missing.status}`);
    });
    await test("tasks: the tabs never count a task twice (Atrasadas, Hoje, Próximos) and concluding says which one it is", async () => {
      const { leadId } = mkLeadFor(ids.joao, "Lead das abas");
      const mk = async (minutes, title) => (await http.post(`/leads/${leadId}/tasks`, { title, type: "ligar", dueAt: new Date(Date.now() + minutes * 60000).toISOString() }, as(joao))).data;
      const late = await mk(-60, "Atrasada");
      const later = await mk(3 * 24 * 60, "Depois");
      const lists = {};
      for (const st of ["overdue", "today", "upcoming"]) lists[st] = (await http.get(`/lead-tasks?status=${st}&scope=mine`, as(joao))).data.map(t => t.id);
      assert(lists.overdue.includes(late.id) && !lists.today.includes(late.id) && !lists.upcoming.includes(late.id), `late task in ${JSON.stringify(lists)}`);
      assert(lists.upcoming.includes(later.id) && !lists.today.includes(later.id), "the task of next days");
      const c = (await http.get("/lead-tasks/counts?scope=mine", as(joao))).data;
      assert(c.overdue === lists.overdue.length && c.today === lists.today.length && c.upcoming === lists.upcoming.length && c.open === c.overdue + c.today + c.upcoming, `counts ${JSON.stringify(c)}`);
      // concluding twice keeps it concluded (it used to flip back); reopening is explicit
      for (let i = 0; i < 2; i += 1) assert((await http.put(`/leads/${leadId}/tasks/${late.id}/done`, { done: true }, as(joao))).status === 200, "done");
      assert(taskOf(late.id).done === true && taskOf(late.id).reason === "done", "a second click reopened the task");
      await http.put(`/leads/${leadId}/tasks/${late.id}/done`, { done: false }, as(joao));
      assert(taskOf(late.id).done === false, "reopen");
    });
    await test("tasks: only the management gives a task to someone else; a colleague cannot touch it; deleting is registered", async () => {
      const { leadId } = mkLeadFor(ids.joao, "Lead da permissão");
      const t = (await http.post(`/leads/${leadId}/tasks`, { title: "Ligar amanhã", type: "ligar", dueAt: new Date(Date.now() + 86400000).toISOString() }, as(joao))).data;
      assert((await http.put(`/leads/${leadId}/tasks/${t.id}`, { userId: ids.gabrielli }, as(joao))).status === 403, "a consultant handed a task to a colleague");
      assert((await http.post(`/leads/${leadId}/tasks`, { title: "Para outra", dueAt: new Date().toISOString(), userId: ids.gabrielli }, as(joao))).status === 403, "a consultant created a task for a colleague");
      assert((await http.put(`/leads/${leadId}/tasks/${t.id}`, { userId: ids.laura }, as(admin))).status === 200, "the management hands it");
      assert(taskOf(t.id).userId === ids.laura, "handed");
      // the new person has the notice in the bell; nobody else sees it
      const bell = (await http.get("/notifications", as(laura))).data;
      const notice = bell.notifications.find(n => n.kind === "task_assigned" && /Ligar amanhã/.test(n.title));
      assert(notice && !notice.readAt && bell.unread >= 1, `notice ${JSON.stringify(bell).slice(0, 300)}`);
      assert(!(await http.get("/notifications", as(gabrielli))).data.notifications.some(n => n.id === notice.id), "another person read the notice");
      assert((await http.put(`/notifications/${notice.id}/read`, {}, as(gabrielli))).data.updated === 0, "another person marked the notice");
      assert((await http.put(`/notifications/${notice.id}/read`, {}, as(laura))).data.updated === 1, "mark read");
      await http.put("/notifications/read-all", {}, as(laura));
      assert((await http.get("/notifications/count", as(laura))).data.unread === 0, "read all");
      // a colleague who neither created it nor has it cannot delete it; the person who created it can, and the lead keeps the record
      assert((await http.delete(`/leads/${leadId}/tasks/${t.id}`, as(gabrielli))).status === 403, "a colleague deleted the task");
      assert((await http.delete(`/leads/${leadId}/tasks/${t.id}`, as(joao))).status === 200, "delete");
      assert(Number(sql(`SELECT COUNT(*) FROM LeadActivities WHERE leadId=${leadId} AND body LIKE 'Tarefa apagada:%'`)) === 1, "deleting is not registered");
    });
    await test("tasks close by themselves: the AI handoff when the consultant answers, everything of the sale when the lead is enrolled", async () => {
      const { leadId, ticket } = mkLeadFor(ids.joao, "Lead do handoff");
      const handoff = sql(`INSERT INTO LeadTasks (leadId, userId, title, type, kind, priority, ticketId, dueAt, createdAt, updatedAt) VALUES (${leadId}, ${ids.joao}, 'Atender lead encaminhado pelo agente de IA', 'whatsapp', 'handoff', 'high', ${ticket.ticketId}, NOW() + INTERVAL '15 minutes', NOW(), NOW()) RETURNING id`).split("\n")[0];
      const manual = (await http.post(`/leads/${leadId}/tasks`, { title: "Enviar proposta", type: "proposta", dueAt: new Date(Date.now() + 3600000).toISOString() }, as(joao))).data;
      // the list shows it urgent and with its conversation
      const listed = (await http.get("/lead-tasks?status=open&scope=mine", as(joao))).data.find(t => t.id === Number(handoff));
      assert(listed && listed.priority === "high" && listed.ticketId === ticket.ticketId, `listed ${JSON.stringify(listed)}`);
      assert(ok(await send(joao, ticket.ticketId, "Oi! Já vou te ajudar")), "reply");
      await waitFor(() => taskOf(handoff).done, 10000, "the handoff task closed after the reply");
      assert(taskOf(handoff).reason === "replied", `reason ${taskOf(handoff).reason}`);
      assert(taskOf(manual.id).done === false, "the reply closed a task it should not");
      assert((await http.put(`/leads/${leadId}/stage`, { skipEnroll: true, stageId: stageWon.id }, as(admin))).status === 200, "won");
      await waitFor(() => taskOf(manual.id).done, 8000, "the sale task closed with the enrollment");
      assert(taskOf(manual.id).reason === "lead_won", `reason ${taskOf(manual.id).reason}`);
    });
    await test("the academic transcript: an analysis created for the lead closes 'Pedir o histórico' and takes the lead out of 'Aguardando histórico'", async () => {
      const ensureStage = (name, pos) => sql(`SELECT id FROM LeadStages WHERE name='${name}'`).split("\n")[0] || sql(`INSERT INTO LeadStages (name, color, position, type, createdAt, updatedAt) VALUES ('${name}', '#f59e0b', ${pos}, 'open', NOW(), NOW()) RETURNING id`).split("\n")[0];
      const waiting = ensureStage("Aguardando histórico", 40);
      const analysis = ensureStage("Análise curricular", 41);
      const { leadId } = mkLeadFor(ids.joao, "Lead do histórico");
      sql(`UPDATE Leads SET stageId=${waiting} WHERE id=${leadId}`);
      const task = sql(`INSERT INTO LeadTasks (leadId, userId, title, type, kind, dueAt, createdAt, updatedAt) VALUES (${leadId}, ${ids.joao}, 'Pedir o histórico acadêmico ao lead', 'documentos', 'transcript', NOW() + INTERVAL '2 days', NOW(), NOW()) RETURNING id`).split("\n")[0];
      const polo = sql(`SELECT id FROM Polos ORDER BY id LIMIT 1`).split("\n")[0] || sql(`INSERT INTO Polos (code, name, active, createdAt, updatedAt) VALUES ('TRX', 'Polo Histórico', true, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const FormData = require("form-data");
      const f = new FormData();
      f.append("file", require("fs").readFileSync(path.join(__dirname, "fixtures", "sample-analise.pdf")), { filename: "historico.pdf", contentType: "application/pdf" });
      f.append("candidateName", "Lead do histórico");
      f.append("poloId", polo);
      f.append("leadId", String(leadId));
      const r = await http.post("/analysis/curricular", f, { headers: { ...f.getHeaders(), ...as(admin).headers } });
      assert(r.status === 201, `analysis ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
      await waitFor(() => taskOf(task).done, 10000, "the transcript task closed");
      assert(taskOf(task).reason === "transcript_received", `reason ${taskOf(task).reason}`);
      await waitFor(() => sql(`SELECT stageId FROM Leads WHERE id=${leadId}`) === String(analysis), 8000, "the lead left Aguardando histórico");
    });
    await test("voice notes of the conversations between people: transcribed once in the background, only on WhatsApp numbers, never with the switch off or the cap reached, shown only to who sees the conversation", async () => {
      const fs = require("fs");
      const pub = path.join(ROOT, "public");
      fs.mkdirSync(pub, { recursive: true });
      const tag = `hv${process.pid}`;
      // run asynchronously: the simulated OpenAI lives in this process and must keep answering while the child waits for it
      const run = async () => {
        const { stdout } = await require("util").promisify(require("child_process").execFile)("node", ["-e", "require('./dist/services/AiServices/HumanTranscription').transcribePending().then(r => { process.stdout.write('\\n' + JSON.stringify(r) + '\\n'); process.exit(0); }, e => { console.error(e); process.exit(1); })"], { cwd: ROOT, env });
        return JSON.parse(String(stdout).trim().split("\n").pop());
      };
      const number = (channel) => sql(`INSERT INTO Whatsapps (name, status, channel, isDefault, createdAt, updatedAt) VALUES ('${channel} ${tag}', 'CONNECTED', '${channel}', false, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const cloud = number("whatsapp_cloud"), qr = number("whatsapp");
      let n = 0;
      const conversation = (whatsappId, { group = false, owner = ids.joao } = {}) => {
        n += 1;
        const contactId = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('Voz ${n}', '55690000${tag.length}${n}${process.pid % 1000}', '', ${group}, 'whatsapp', NOW(), NOW()) RETURNING id`).split("\n")[0];
        const ticketId = sql(`INSERT INTO Tickets (status, contactId, whatsappId, queueId, userId, aiActive, unreadMessages, isGroup, createdAt, updatedAt) VALUES ('open', ${contactId}, ${whatsappId}, ${queueId}, ${owner || "NULL"}, false, 0, ${group}, NOW(), NOW()) RETURNING id`).split("\n")[0];
        return { contactId, ticketId };
      };
      const voice = (c, id, { fromMe = false, minutesAgo = 5 } = {}) => {
        const f = `${tag}-${id}.ogg`;
        fs.writeFileSync(path.join(pub, f), Buffer.alloc(8000));
        sql(`INSERT INTO Messages (id, ticketId, contactId, body, fromMe, read, mediaType, mediaUrl, ack, createdAt, updatedAt) VALUES ('${tag}-${id}', ${c.ticketId}, ${c.contactId}, '${f}', ${fromMe}, true, 'audio', '${f}', 0, NOW() - INTERVAL '${minutesAgo} minutes', NOW())`);
        return f;
      };
      const transcriptOf = (id) => sql(`SELECT COALESCE(transcript, '') FROM Messages WHERE id='${tag}-${id}'`);
      const files = [];
      try {
        assert((await http.put("/ai-settings", { openai: "sk-openai-test" }, as(admin))).status === 200, "openai key");
        const lead = conversation(cloud), team = conversation(qr), group = conversation(cloud, { group: true }), telegram = conversation(connectionId);
        files.push(voice(lead, "lead"), voice(team, "team", { fromMe: true }), voice(group, "group"), voice(telegram, "telegram"), voice(lead, "fresh", { minutesAgo: 0 }));
        // off by default (the owner turns it on after telling the team and the leads): nothing is sent
        assert((await http.get("/ai-handoff", as(admin))).data.settings.transcribeHuman === false, "the transcription of the team should start off");
        assert((await run()).stopped === "off" && aiMock.transcriptions === 0, "transcribed while off by default");
        assert((await http.put("/ai-handoff", { transcribeHuman: true }, as(admin))).data.settings.transcribeHuman === true, "turn on");
        const first = await run();
        assert(first.transcribed === 2 && first.failed === 0, `first run ${JSON.stringify(first)}`);
        assert(aiMock.transcriptions === 2, `the OpenAI was called ${aiMock.transcriptions} times`);
        assert(transcriptOf("lead") === "Quero saber o valor da mensalidade de Direito" && transcriptOf("team") === "Quero saber o valor da mensalidade de Direito", "the transcript of the lead and of the team was not kept");
        // a group, another channel and a voice note that just arrived (left to the AI agent and to the download) are not sent
        assert(!transcriptOf("group") && !transcriptOf("telegram") && !transcriptOf("fresh"), "a voice note out of the rule was transcribed");
        // once: the next run sends nothing again
        const second = await run();
        assert(second.transcribed === 0 && aiMock.transcriptions === 2, `second run ${JSON.stringify(second)} / ${aiMock.transcriptions}`);
        // the cost is counted with no agent, as a reading of the conversation
        assert(Number(sql(`SELECT COUNT(*) FROM AiUsage WHERE kind='reading' AND agentId IS NULL AND model='whisper-1'`)) === 2, "the usage was not logged");

        // who sees the conversation sees the text; a colleague who does not, does not
        const shown = (await http.get(`/messages/${lead.ticketId}`, as(joao)));
        assert(shown.status === 200 && shown.data.messages.some(m => m.transcript === "Quero saber o valor da mensalidade de Direito"), "the owner does not see the transcript");
        assert((await http.get(`/messages/${lead.ticketId}`, as(gabrielli))).status === 403, "another consultant read the conversation");

        // the switch of the conversations between people off (only the management changes it): nothing is sent
        assert((await http.put("/ai-handoff", { transcribeHuman: false }, as(joao))).status === 403, "a consultant changed the switch");
        const off = await http.put("/ai-handoff", { transcribeHuman: false }, as(admin));
        assert(off.status === 200 && off.data.settings.transcribeHuman === false, `switch off ${JSON.stringify(off.data.settings)}`);
        files.push(voice(lead, "off"));
        assert((await run()).stopped === "off" && !transcriptOf("off") && aiMock.transcriptions === 2, "transcribed with the switch off");
        // on again, but the own cap of the day reached (8 seconds used of 0 minutes): nothing is sent and the voice note waits
        const capped = await http.put("/ai-handoff", { transcribeHuman: true, humanMinutes: 0 }, as(admin));
        assert(capped.status === 200 && capped.data.settings.humanMinutes === 0, "cap");
        assert((await run()).stopped === "own_cap" && !transcriptOf("off") && aiMock.transcriptions === 2, "transcribed with the cap reached");
        // room in the cap again: the one that waited is sent
        await http.put("/ai-handoff", { humanMinutes: 120 }, as(admin));
        assert((await run()).transcribed === 1 && transcriptOf("off") && aiMock.transcriptions === 3, "the voice note that waited was not transcribed");
      } finally {
        await http.put("/ai-settings", { openai: "" }, as(admin)).catch(() => null);
        files.forEach(f => fs.rmSync(path.join(pub, f), { force: true }));
      }
    });

    await test("retention of conversations and voice notes: off deletes nothing, the simulation deletes nothing, on deletes only what is allowed and keeps the transcript", async () => {
      const fs = require("fs");
      const pub = path.join(ROOT, "public");
      fs.mkdirSync(pub, { recursive: true });
      const tag = `ret${process.pid}`;
      const file = (n) => { const f = `${tag}-${n}`; fs.writeFileSync(path.join(pub, f), "x"); return f; };
      const has = (f) => fs.existsSync(path.join(pub, f));
      const OLD = "NOW() - INTERVAL '400 days'";
      const RECENT = "NOW() - INTERVAL '10 days'";
      let n = 0;
      const conversation = (status, when) => {
        n += 1;
        const contactId = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('Retenção ${n}', 'tg_${tag}_${n}', '', false, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
        return { contactId, ticketId: ticketIn(contactId, status, when) };
      };
      const ticketIn = (contactId, status, when, whatsappId = connectionId) => sql(`INSERT INTO Tickets (status, contactId, whatsappId, queueId, aiActive, unreadMessages, isGroup, lastMessage, lastMessageAt, createdAt, updatedAt)
        VALUES ('${status}', ${contactId}, ${whatsappId}, ${queueId}, false, 0, false, 'última mensagem', ${when}, ${when}, ${when}) RETURNING id`).split("\n")[0];
      // a second number of the company: the same contact can be in a conversation there (one conversation per contact and number)
      const otherNumber = sql(`INSERT INTO Whatsapps (name, status, channel, isDefault, createdAt, updatedAt) VALUES ('Outro número ${tag}', 'DISCONNECTED', 'telegram', false, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const msg = (c, id, { body = "", media = null, type = "chat", transcript = null, when = OLD } = {}) =>
        sql(`INSERT INTO Messages (id, ticketId, contactId, body, fromMe, read, mediaType, mediaUrl, transcript, ack, createdAt, updatedAt)
          VALUES ('${tag}-${id}', ${c.ticketId}, ${c.contactId}, '${body}', false, true, '${type}', ${media ? `'${media}'` : "NULL"}, ${transcript ? `'${transcript}'` : "NULL"}, 0, ${when}, ${when})`);
      const m = (id) => {
        const [body, media, transcript, bodyPurged, mediaPurged] = sql(`SELECT body, COALESCE(mediaUrl, ''), COALESCE(transcript, ''), CASE WHEN bodyPurgedAt IS NULL THEN 0 ELSE 1 END, CASE WHEN mediaPurgedAt IS NULL THEN 0 ELSE 1 END FROM Messages WHERE id='${tag}-${id}'`).split("|");
        return { body, media, transcript, bodyPurged: bodyPurged === "1", mediaPurged: mediaPurged === "1" };
      };
      const night = () => JSON.parse(execFileSync("node", ["-e", "require('./dist/services/SystemServices/ContentRetention').runContentRetention().then(r => { process.stdout.write('\\n' + JSON.stringify(r) + '\\n'); process.exit(0); }, e => { console.error(e); process.exit(1); })"], { cwd: ROOT, env }).toString().trim().split("\n").pop());

      // T1: closed, nothing for 400 days (goes); T2: closed and old, but the same contact has an open conversation (stays);
      // T3: closed and old, the lead was won and waits for the confirmation of the enrollment (stays, its old voice note too);
      // T4: closed 10 days ago (stays), with an old transcribed voice note (its file goes with the audio rule, the transcript stays) and
      // an old one never transcribed (stays); T5: open, with an old transcribed voice note and a recent one (both stay)
      const T1 = conversation("closed", OLD);
      const f1 = file("foto.jpg"), f2 = file("voz-antiga.ogg"), f4 = file("voz-aberta.ogg"), f5 = file("voz-recente.ogg");
      const f6 = file("voz-fechada.ogg"), f7 = file("voz-sem-texto.ogg"), f8 = file("voz-matricula.ogg");
      msg(T1, "t1-text", { body: "texto antigo" });
      msg(T1, "t1-photo", { body: f1, media: f1, type: "image" });
      msg(T1, "t1-voice", { body: f2, media: f2, type: "audio", transcript: "o que foi dito no áudio" });
      const T2 = conversation("closed", OLD);
      msg(T2, "t2-text", { body: "conversa de quem tem atendimento aberto" });
      ticketIn(T2.contactId, "open", RECENT, otherNumber);
      const T3 = conversation("closed", OLD);
      msg(T3, "t3-text", { body: "conversa da matrícula pendente" });
      msg(T3, "t3-voice", { body: f8, media: f8, type: "audio", transcript: "áudio da matrícula pendente" });
      const pendingLead = sql(`INSERT INTO Leads (name, phone, source, stageId, contactId, isHistorical, wonAt, createdAt, updatedAt) VALUES ('Lead retenção', '5569000000999', 'WhatsApp', ${stageWon.id}, ${T3.contactId}, false, ${OLD}, ${OLD}, ${OLD}) RETURNING id`).split("\n")[0];
      const T4 = conversation("closed", RECENT);
      msg(T4, "t4-text", { body: "conversa recente", when: RECENT });
      msg(T4, "t4-voice-old", { body: f6, media: f6, type: "audio", transcript: "áudio antigo transcrito" });
      msg(T4, "t4-voice-notr", { body: f7, media: f7, type: "audio" });
      const T5 = conversation("open", RECENT);
      msg(T5, "t5-voice-old", { body: f4, media: f4, type: "audio", transcript: "transcrição que fica" });
      msg(T5, "t5-voice-new", { body: f5, media: f5, type: "audio", when: RECENT });
      const activities = sql(`SELECT COUNT(*) FROM LeadActivities`);
      const leads = sql(`SELECT COUNT(*) FROM Leads`);
      const intact = () => ["t1-text", "t2-text", "t3-text", "t4-text"].every(id => !m(id).bodyPurged && m(id).body) && [f1, f2, f4, f5, f6, f7, f8].every(has) && m("t1-voice").transcript === "o que foi dito no áudio";

      // off by default: the night run does nothing at all
      const off = await http.get("/data-retention", as(admin));
      assert(off.status === 200 && off.data.audioDays === 0 && off.data.conversationDays === 0, `the rules should start off: ${JSON.stringify(off.data)}`);
      assert(off.data.suggested.conversationDays === 180 && off.data.suggested.audioDays === 90, "suggested days");
      assert(night().ran === false && intact(), "retention off deleted something");
      assert(sql(`SELECT COUNT(*) FROM DataPurgeRuns`) === "0", "a run was recorded while off");

      // only the administrator: coordination and the consultants are refused, and the generic settings route cannot turn it on
      for (const token of [coord, joao]) {
        assert((await http.get("/data-retention", as(token))).status === 403, "a non-admin read the retention");
        assert((await http.put("/data-retention", { audioDays: 90 }, as(token))).status === 403, "a non-admin changed the retention");
        assert((await http.post("/data-retention/simulate", {}, as(token))).status === 403, "a non-admin simulated");
      }
      for (const token of [admin, coord]) assert((await http.put("/settings/retention_audio_days", { value: "30" }, as(token))).status === 403, "the generic settings route changed the retention");
      // turning on without a simulation of the same days in the last 24 hours is refused
      for (const body of [{ audioDays: 90 }, { conversationDays: 180 }]) {
        const r = await http.put("/data-retention", body, as(admin));
        assert(r.status === 409 && r.data.error === "ERR_RETENTION_SIMULATION_REQUIRED", `turned on without a simulation: ${r.status} ${JSON.stringify(r.data)}`);
      }

      // the simulation counts by polo and by type and deletes nothing
      const sim = await http.post("/data-retention/simulate", { audioDays: 90, conversationDays: 180 }, as(admin));
      assert(sim.status === 200, `simulate ${sim.status} ${JSON.stringify(sim.data)}`);
      // the audio rule: only closed, unprotected conversations, and only the voice notes already transcribed (t1-voice, t4-voice-old)
      assert(sim.data.audio.files === 2 && sim.data.audio.withTranscript === 2 && sim.data.audio.withoutTranscript === 1, `audio simulation ${JSON.stringify(sim.data.audio)}`);
      const c = sim.data.conversations;
      assert(c.conversations === 1 && c.messages === 3 && c.byType.text === 1 && c.byType.image === 1 && c.byType.audio === 1, `conversation simulation ${JSON.stringify(c)}`);
      assert(c.kept.openElsewhere === 1 && c.kept.pendingEnrollment === 1, `protected conversations ${JSON.stringify(c.kept)}`);
      assert(Array.isArray(c.byPolo) && c.byPolo.length >= 1, "by polo");
      assert(intact(), "the simulation deleted something");
      assert(sql(`SELECT mode FROM DataPurgeRuns ORDER BY id`) === "simulation", "the simulation was not recorded");

      // out of range is refused; then both rules on (180 and 90 days)
      assert((await http.put("/data-retention", { audioDays: 5 }, as(admin))).status === 400, "5 days accepted");
      assert((await http.put("/data-retention", { audioDays: 100 }, as(admin))).status === 409, "turned on with days that were not simulated");
      const on = await http.put("/data-retention", { audioDays: 90, conversationDays: 180 }, as(admin));
      assert(on.status === 200 && on.data.audioDays === 90 && on.data.conversationDays === 180, `turn on ${JSON.stringify(on.data)}`);
      const run = night();
      assert(run.ran && !run.failed && run.conversations === 1 && run.conversationMessages === 3 && run.audioFiles === 1 && run.filesDeleted === 3, `run ${JSON.stringify(run)}`);

      // T1 lost its content (the record of each message stays), its files and the preview of the list
      ["t1-text", "t1-photo", "t1-voice"].forEach(id => { const x = m(id); assert(x.bodyPurged && x.body === "" && x.media === "" && x.transcript === "", `${id} was not cleared: ${JSON.stringify(x)}`); });
      assert(!has(f1) && !has(f2), "the files of the old conversation stayed");
      assert(sql(`SELECT lastMessage FROM Tickets WHERE id=${T1.ticketId}`) === "", "the preview of the old conversation stayed");
      // the protected and the recent ones are untouched
      ["t2-text", "t3-text", "t4-text"].forEach(id => assert(!m(id).bodyPurged && m(id).body, `${id} should stay`));
      // the old voice note lost only its file: the message and the transcript stay; the recent one is untouched
      // the old transcribed voice note of a closed conversation lost only its file: the message and the transcript stay
      const v = m("t4-voice-old");
      assert(v.mediaPurged && v.media === "" && v.transcript === "áudio antigo transcrito" && v.body === f6 && !v.bodyPurged && !has(f6), `old voice note ${JSON.stringify(v)}`);
      // the one never transcribed, the one of the open conversation, the one of the pending enrollment and the recent one stay
      assert(!m("t4-voice-notr").mediaPurged && has(f7), "a voice note without transcript lost its file");
      assert(!m("t5-voice-old").mediaPurged && m("t5-voice-old").media === f4 && has(f4), "a voice note of an open conversation lost its file");
      assert(!m("t3-voice").mediaPurged && has(f8), "a voice note of a lead waiting for the enrollment lost its file");
      assert(has(f5) && m("t5-voice-new").media === f5, "the recent voice note was touched");
      // nothing of the CRM is deleted
      assert(sql(`SELECT COUNT(*) FROM Leads`) === leads && sql(`SELECT COUNT(*) FROM LeadActivities`) === activities, "leads or the activity history changed");
      assert(sql(`SELECT wonAt IS NOT NULL FROM Leads WHERE id=${pendingLead}`) === "1", "the pending lead changed");
      // the run is recorded; the screen of the conversation shows it; the file is not brought back from the phone
      assert(sql(`SELECT mode || ':' || conversationMessages || ':' || audioFiles FROM DataPurgeRuns ORDER BY id DESC LIMIT 1`) === "run:3:1", "the run was not recorded");
      const shown = (await http.get(`/messages/${T1.ticketId}`, as(admin))).data.messages;
      assert(shown.length === 3 && shown.every(x => x.bodyPurgedAt && !x.body), "the conversation does not show the cleared messages");
      assert((await http.post(`/messages/${tag}-t4-voice-old/media`, {}, as(admin))).status === 410, "a purged file was offered again");
      // a second night finds nothing more
      const again = night();
      assert(again.conversationMessages === 0 && again.audioFiles === 0, `second night ${JSON.stringify(again)}`);
      [f4, f5, f7, f8].forEach(f => fs.rmSync(path.join(pub, f), { force: true }));
    });

    // The CRM by polo (middleware/scope): the coordination sees only the leads of the polos it belongs to, the relationship team only the
    // enrolled students of its polos, a coordinator with no polo sees no lead, the administration sees everything. Every door of the CRM
    // follows the same rule: the list, the counts of the board and of the panel, the search, the report (CSV), Matrículas realizadas,
    // the list of new leads, the tasks of the team and the record itself.
    await test("CRM by polo: coordination and relationship see only their polos, in lists, counts, search and exports", async () => {
      const poloA = sql(`INSERT INTO Polos (code, name, active, createdAt, updatedAt) VALUES ('SCA', 'Polo Escopo A', true, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const poloB = sql(`INSERT INTO Polos (code, name, active, createdAt, updatedAt) VALUES ('SCB', 'Polo Escopo B', true, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const coordA = await mkUser("Coordenação Escopo A", "coord-sca@x.com", "coordenacao");
      const coordNone = await mkUser("Coordenação sem polo", "coord-scn@x.com", "coordenacao");
      const relA = await mkUser("Relacionamento Escopo A", "rel-sca@x.com", "relacionamento");
      const coordAId = userId("coord-sca@x.com");
      sql(`INSERT INTO PoloMembers (poloId, userId, role, createdAt, updatedAt) VALUES (${poloA}, ${coordAId}, 'coordenacao', NOW(), NOW()), (${poloA}, ${userId("rel-sca@x.com")}, 'comercial', NOW(), NOW())`);
      const open = sql(`SELECT id FROM LeadStages WHERE type='open' ORDER BY position LIMIT 1`).split("\n")[0];
      const won = sql(`SELECT id FROM LeadStages WHERE type='won' ORDER BY position LIMIT 1`).split("\n")[0];
      const mk = (name, polo, enrolled) => sql(`INSERT INTO Leads (name, phone, source, stageId, ownerId, poloId, isHistorical, ${enrolled ? "enrolledAt, wonAt, " : ""}createdAt, updatedAt) VALUES ('${name}', '55690${Math.floor(Math.random() * 1e8)}', 'Escopo', ${enrolled ? won : open}, ${ids.joao}, ${polo}, false, ${enrolled ? "NOW(), NOW(), " : ""}NOW(), NOW()) RETURNING id`).split("\n")[0];
      const leadA = mk("SCOPEA aberto", poloA, false);
      const enrolledA = mk("SCOPEA matriculado", poloA, true);
      const leadB = mk("SCOPEB aberto", poloB, false);
      const enrolledB = mk("SCOPEB matriculado", poloB, true);
      sql(`INSERT INTO LeadTasks (leadId, userId, title, type, dueAt, createdAt, updatedAt) VALUES (${leadA}, ${ids.joao}, 'Tarefa SCOPEA', 'ligacao', NOW() + INTERVAL '1 day', NOW(), NOW()), (${leadB}, ${ids.joao}, 'Tarefa SCOPEB', 'ligacao', NOW() + INTERVAL '1 day', NOW(), NOW())`);
      const names = r => (r.data.leads || []).map(l => l.name).sort();

      // list and search
      const listA = await A(coordA, "/leads?search=SCOPE&limit=100");
      assert(listA.status === 200 && JSON.stringify(names(listA)) === JSON.stringify(["SCOPEA aberto", "SCOPEA matriculado"]) && listA.data.count === 2, `coordination A list ${listA.status} ${JSON.stringify(names(listA))}`);
      const searchB = await A(coordA, "/leads?search=SCOPEB");
      assert(searchB.status === 200 && searchB.data.count === 0, `coordination A found a lead of polo B by search: ${searchB.data.count}`);
      const adminList = await A(admin, "/leads?search=SCOPE&limit=100");
      assert(adminList.data.count === 4, `administration sees every polo: ${adminList.data.count}`);
      // the record itself and what hangs from it
      assert((await A(coordA, `/leads/${leadB}`)).status === 403, "coordination A opened a lead of polo B");
      assert((await A(coordA, `/leads/${leadB}/activities`)).status === 403, "coordination A read the history of a lead of polo B");
      assert((await A(coordA, `/leads/${leadA}`)).status === 200, "coordination A cannot open a lead of its polo");
      assert((await A(admin, `/leads/${leadB}`)).status === 200, "administration cannot open a lead of polo B");
      // counts: the board and the panel of the CRM
      const board = (await A(coordA, "/crm/board?search=SCOPE")).data.stages.reduce((t, st) => t + Number(st.count || 0), 0);
      assert(board === 2, `board count of coordination A: ${board}`);
      const kpi = (await A(coordA, "/crm/metrics")).data.kpi;
      assert(kpi.leads === 2, `panel count of coordination A: ${JSON.stringify(kpi)}`);
      const kpiNow = (await A(coordA, "/crm/metrics?now=1")).data.funnel.reduce((t, st) => t + Number(st.total || 0), 0);
      assert(kpiNow === 2, `funnel now of coordination A: ${kpiNow}`);
      assert((await A(admin, "/crm/metrics")).data.kpi.leads >= 4, "administration panel misses leads");
      const triage = (await A(coordA, "/crm/triage")).data.items.map(i => i.name);
      assert(triage.includes("SCOPEA aberto") && !triage.some(n => /SCOPEB/.test(n)), `new leads of coordination A: ${JSON.stringify(triage)}`);
      const tasks = (await A(coordA, "/lead-tasks?scope=all&status=open")).data.map(t => t.title);
      assert(tasks.includes("Tarefa SCOPEA") && !tasks.includes("Tarefa SCOPEB"), `team tasks of coordination A: ${JSON.stringify(tasks)}`);
      // exports: the report of the CRM (CSV) and Matrículas realizadas
      const csv = String((await http.get("/crm/report?groupBy=polo&format=csv", { ...as(coordA), responseType: "text" })).data);
      assert(csv.includes("Polo Escopo A") && !csv.includes("Polo Escopo B"), `report CSV of coordination A: ${csv.slice(0, 300)}`);
      const adminCsv = String((await http.get("/crm/report?groupBy=polo&format=csv", { ...as(admin), responseType: "text" })).data);
      assert(adminCsv.includes("Polo Escopo A") && adminCsv.includes("Polo Escopo B"), "administration report misses a polo");
      const enr = (await A(coordA, "/enrollments")).data.rows.map(r => r.name);
      assert(enr.includes("SCOPEA matriculado") && !enr.includes("SCOPEB matriculado"), `enrollments of coordination A: ${JSON.stringify(enr)}`);
      const enrAsked = (await A(coordA, `/enrollments?poloId=${poloB}`)).data.rows.length;
      assert(enrAsked === 0, `coordination A asked for polo B and got ${enrAsked} enrollments`);
      const enrAdmin = (await A(admin, "/enrollments")).data.rows.map(r => r.name);
      assert(enrAdmin.includes("SCOPEA matriculado") && enrAdmin.includes("SCOPEB matriculado"), "administration enrollments miss a polo");
      // the relationship team: the enrolled students of its polos, never the sales funnel
      const rel = await A(relA, "/leads?search=SCOPE&limit=100");
      assert(rel.status === 200 && JSON.stringify(names(rel)) === JSON.stringify(["SCOPEA matriculado"]), `relationship A: ${JSON.stringify(names(rel))}`);
      assert((await A(relA, `/leads/${enrolledB}`)).status === 403, "relationship A opened a student of polo B");
      // a coordinator with no polo sees no lead
      const none = await A(coordNone, "/leads?limit=5");
      assert(none.status === 200 && none.data.count === 0, `coordination with no polo sees ${none.data.count} leads`);
      assert((await A(coordNone, "/crm/metrics")).data.kpi.leads === 0, "coordination with no polo counts leads");
      // and the coordination does not put itself in another polo to see it
      assert((await http.post(`/polos/${poloB}/members/${coordAId}`, { role: "coordenacao" }, as(coordA))).status === 403, "coordination A joined polo B by itself");
      assert((await http.post(`/polos/${poloA}/members/${userId("rel-sca@x.com")}`, { role: "comercial" }, as(coordA))).status === 200, "coordination A cannot manage its own polo");
      assert(Number(sql(`SELECT COUNT(*) FROM PoloMembers WHERE poloId=${poloB} AND userId=${coordAId}`)) === 0, "coordination A is in polo B");
      // nor changes the data of polo B: the cities it serves decide the polo of the leads (it would pull them), its name, deleting it, importing over it
      assert((await http.put(`/polos/${poloB}/coverage`, { cities: ["Cidade Escopo - RO"] }, as(coordA))).status === 403, "coordination A changed the cities of polo B");
      assert((await http.put(`/polos/${poloB}`, { name: "Polo tomado" }, as(coordA))).status === 403, "coordination A edited polo B");
      assert((await http.delete(`/polos/${poloB}`, as(coordA))).status === 403, "coordination A deleted polo B");
      const imp = (await http.post("/polos/import", { items: [{ code: "SCB", name: "Polo tomado" }], dryRun: false }, as(coordA))).data;
      assert(imp.errors === 1 && imp.updated === 0, `coordination A imported over polo B: ${JSON.stringify(imp).slice(0, 200)}`);
      assert(sql(`SELECT name FROM Polos WHERE id=${poloB}`) === "Polo Escopo B" && Number(sql(`SELECT COUNT(*) FROM PoloCoverages WHERE poloId=${poloB}`)) === 0, "polo B changed");
      assert((await http.put(`/polos/${poloA}/coverage`, { cities: ["Cidade Escopo - RO"] }, as(coordA))).status === 200, "coordination A cannot set the cities of its polo");
      void enrolledA;
    });
    // Conversations, contacts, goals and panels by polo (helpers/TicketPoloScope): the coordination reads and changes only the conversations
    // of its polos (a queue of the polo or a contact who is a lead there) and the ones given to it; the relationship team only its enrolled
    // students; a conversation with no polo is the administration's. Everybody reads the goals of every polo; the coordination changes only
    // the lines of its polos.
    await test("conversations, contacts, goals and panels by polo: another polo's data is refused in the backend", async () => {
      const pA = sql(`INSERT INTO Polos (code, name, active, createdAt, updatedAt) VALUES ('CVA', 'Polo Conversa A', true, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const pB = sql(`INSERT INTO Polos (code, name, active, createdAt, updatedAt) VALUES ('CVB', 'Polo Conversa B', true, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const cA = await mkUser("Coordenação Conversa A", "coord-cva@x.com", "coordenacao");
      const cNone = await mkUser("Coordenação Conversa sem polo", "coord-cvn@x.com", "coordenacao");
      const rA = await mkUser("Relacionamento Conversa A", "rel-cva@x.com", "relacionamento");
      sql(`INSERT INTO PoloMembers (poloId, userId, role, createdAt, updatedAt) VALUES (${pA}, ${userId("coord-cva@x.com")}, 'coordenacao', NOW(), NOW()), (${pA}, ${userId("rel-cva@x.com")}, 'comercial', NOW(), NOW())`);
      let qn = 0;
      const queue = (name, polo) => sql(`INSERT INTO Queues (name, color, poloId, createdAt, updatedAt) VALUES ('${name}', '#12345${(qn += 1)}', ${polo || "NULL"}, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const qA = queue("Fila Conversa A", pA), qB = queue("Fila Conversa B", pB), q0 = queue("Fila Conversa sem polo", null);
      // the relationship team works in a queue with no polo (as the real Relacionamento queue): only the polo of the student separates them
      sql(`INSERT INTO UserQueues (userId, queueId, createdAt, updatedAt) VALUES (${userId("rel-cva@x.com")}, ${q0}, NOW(), NOW())`);
      const open = sql(`SELECT id FROM LeadStages WHERE type='open' ORDER BY position LIMIT 1`).split("\n")[0];
      let n = 0;
      const person = (name, polo, enrolled) => {
        n += 1;
        const number = `55699${String(77700000 + n)}`;
        const contact = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('${name}', '${number}', '', false, 'whatsapp', NOW(), NOW()) RETURNING id`).split("\n")[0];
        if (polo) sql(`INSERT INTO Leads (name, phone, source, stageId, poloId, contactId, isHistorical, ${enrolled ? "enrolledAt, wonAt, " : ""}createdAt, updatedAt) VALUES ('${name}', '${number}', 'Escopo', ${open}, ${polo}, ${contact}, false, ${enrolled ? "NOW(), NOW(), " : ""}NOW(), NOW())`);
        return { contact, number };
      };
      const ticket = (who, q, segment) => {
        const t = sql(`INSERT INTO Tickets (status, contactId, queueId, userId, unreadMessages, isGroup, segment, lastMessageAt, createdAt, updatedAt) VALUES ('pending', ${who.contact}, ${q}, NULL, 1, false, '${segment || "sales"}', NOW(), NOW(), NOW()) RETURNING id`).split("\n")[0];
        sql(`INSERT INTO Messages (id, ticketId, contactId, body, fromMe, read, mediaType, ack, createdAt, updatedAt) VALUES ('cv-${t}', ${t}, ${who.contact}, 'Oi CONVERSAESC', false, false, 'chat', 0, NOW(), NOW())`);
        return t;
      };
      const a = person("CONVERSAESC A", pA), b = person("CONVERSAESC B", pB), none = person("CONVERSAESC sem polo", null);
      const leadOfA = person("CONVERSAESC lead A fila geral", pA);
      const stA = person("CONVERSAESC aluno A", pA, true), stB = person("CONVERSAESC aluno B", pB, true);
      const tA = ticket(a, qA), tB = ticket(b, qB), t0 = ticket(none, q0), tLeadA = ticket(leadOfA, q0);
      const tStA = ticket(stA, q0, "relationship"), tStB = ticket(stB, q0, "relationship");
      const listed = async (token, extra = "") => ((await A(token, `/tickets?searchParam=CONVERSAESC&showAll=true&allQueues=true&status=pending${extra}`)).data.tickets || []).map(t => Number(t.id)).sort((x, y) => x - y);
      const sorted = arr => arr.map(Number).sort((x, y) => x - y);

      // the list (and the search inside it) and the counts
      assert(JSON.stringify(await listed(cA)) === JSON.stringify(sorted([tA, tLeadA, tStA])), `coordination A list: ${JSON.stringify(await listed(cA))}`);
      assert((await listed(cNone)).length === 0, "a coordination with no polo listed conversations");
      const adminList = await listed(admin);
      assert([tA, tB, t0, tLeadA, tStA, tStB].every(t => adminList.includes(Number(t))), "the administration misses a conversation");
      // one conversation, its messages, changing it, deleting it
      assert((await A(cA, `/tickets/${tA}`)).status === 200 && (await A(cA, `/messages/${tA}`)).status === 200, "coordination A cannot read its polo");
      for (const t of [tB, t0, tStB]) {
        assert((await A(cA, `/tickets/${t}`)).status === 403, `coordination A opened conversation ${t}`);
        assert((await A(cA, `/messages/${t}`)).status === 403, `coordination A read the messages of ${t}`);
      }
      assert((await http.put(`/tickets/${tB}`, { status: "open" }, as(cA))).status === 403, "coordination A changed a conversation of polo B");
      assert((await http.delete(`/tickets/${tB}`, as(cA))).status === 403, "coordination A deleted a conversation of polo B");
      assert(sql(`SELECT status FROM Tickets WHERE id=${tB}`) === "pending", "the conversation of polo B changed");
      assert((await A(admin, `/tickets/${t0}`)).status === 200, "the administration cannot read a conversation with no polo");
      // the relationship team: its enrolled students only
      assert((await A(rA, `/tickets/${tStA}`)).status === 200, "relationship A cannot read its student");
      assert((await A(rA, `/tickets/${tStB}`)).status === 403 && (await A(rA, `/messages/${tStB}`)).status === 403, "relationship A read a student of polo B");
      // (the screen sends the person's queues)
      const relList = await listed(rA, `&queueIds=${encodeURIComponent(JSON.stringify([Number(q0)]))}`);
      assert(relList.includes(Number(tStA)) && !relList.includes(Number(tStB)), `relationship A list: ${JSON.stringify(relList)}`);

      // contacts: list, spreadsheet, record, lookup by number, deleting
      const contactNames = async token => ((await A(token, "/contacts?searchParam=CONVERSAESC")).data.contacts || []).map(c => c.name);
      const seen = await contactNames(cA);
      assert(seen.includes("CONVERSAESC A") && seen.includes("CONVERSAESC lead A fila geral") && !seen.some(x => / B$|sem polo/.test(x)), `coordination A contacts: ${JSON.stringify(seen)}`);
      assert((await contactNames(cNone)).length === 0, "a coordination with no polo listed contacts");
      const csv = String((await http.get("/contacts/export.csv?searchParam=CONVERSAESC", { ...as(cA), responseType: "text" })).data);
      assert(csv.includes("CONVERSAESC A") && !csv.includes("CONVERSAESC B") && !csv.includes("CONVERSAESC sem polo"), `coordination A spreadsheet: ${csv.slice(0, 300)}`);
      assert((await A(cA, `/contacts/${b.contact}`)).status === 403, "coordination A opened a contact of polo B");
      assert((await A(cA, `/contacts/${a.contact}`)).status === 200, "coordination A cannot open a contact of its polo");
      assert((await http.post("/contact", { number: b.number }, as(cA))).status === 403, "coordination A looked up a contact of polo B by number");
      assert((await http.delete(`/contacts/${b.contact}`, as(cA))).status === 403, "coordination A deleted a contact of polo B");
      assert(Number(sql(`SELECT COUNT(*) FROM Contacts WHERE id=${b.contact}`)) === 1, "the contact of polo B is gone");
      assert((await contactNames(admin)).length >= 6, "the administration misses contacts");

      // goals: everybody reads every polo; the coordination changes only the lines of its polos
      const today = new Date();
      const d = days => new Date(today.getTime() + days * 864e5).toISOString().slice(0, 10);
      const goal = sql(`INSERT INTO Goals (title, startsOn, endsOn, status, kind, workDays, createdAt, updatedAt) VALUES ('Meta escopo', '${d(-3)}', '${d(30)}', 'active', 'polo', 5, NOW(), NOW()) RETURNING id`).split("\n")[0];
      sql(`INSERT INTO GoalPolos (goalId, poloId, target, manualCount, canceled, createdAt, updatedAt) VALUES (${goal}, ${pA}, 10, 0, 0, NOW(), NOW()), (${goal}, ${pB}, 10, 0, 0, NOW(), NOW())`);
      assert((await A(cA, `/goals/polos?goalId=${goal}`)).status === 200, "coordination A cannot read the goals");
      assert((await http.put(`/goals/${goal}/polos/${pB}`, { target: 99 }, as(cA))).status === 403, "coordination A changed the goal of polo B");
      assert((await http.put(`/goals/${goal}/polos/${pA}`, { target: 12 }, as(cA))).status === 200, "coordination A cannot change the goal of its polo");
      assert((await http.put(`/goals/${goal}/polos`, { rows: [{ poloId: pB, target: 1 }] }, as(cA))).status === 403, "coordination A replaced the lines of polo B");
      assert((await http.put(`/goals/${goal}/polos`, { workDays: 6 }, as(cA))).status === 403, "coordination A changed the working days of every polo");
      assert((await http.post(`/goals/${goal}/postpone`, { endsOn: d(40), reason: "teste" }, as(cA))).status === 403, "coordination A postponed the goal of every polo");
      assert(sql(`SELECT target FROM GoalPolos WHERE goalId=${goal} AND poloId=${pB}`) === "10" && sql(`SELECT target FROM GoalPolos WHERE goalId=${goal} AND poloId=${pA}`) === "12", "goal lines");
      const imp = (await http.post(`/goals/${goal}/polos/import`, { items: [{ code: "CVB", name: "Polo Conversa B", target: 50 }], dryRun: false }, as(cA))).data;
      assert(imp.errors === 1 && sql(`SELECT target FROM GoalPolos WHERE goalId=${goal} AND poloId=${pB}`) === "10", `coordination A imported over polo B: ${JSON.stringify(imp).slice(0, 200)}`);

      // panels: nothing of polo B (nor with no polo) reaches the coordination of A
      // (/dashboard/manager also carries the goals of every polo, which everybody reads: there only people and conversations are checked)
      for (const path of ["/dashboard", "/dashboard/management", "/dashboard/manager"]) {
        const body = JSON.stringify((await A(cA, path)).data);
        assert(!body.includes("CONVERSAESC B") && !body.includes("CONVERSAESC sem polo") && (path === "/dashboard/manager" || !body.includes("Polo Conversa B")), `${path} of coordination A shows another polo: ${body.slice(0, 300)}`);
      }
      const mgr = (await A(cA, "/dashboard/manager")).data;
      const lineB = (mgr.polos || []).find(x => Number(x.poloId) === Number(pB));
      assert(!lineB || (!lineB.unanswered && !lineB.onboardingLate && !lineB.atRisk), `the manager overview counts what is stuck in polo B: ${JSON.stringify(lineB)}`);
      void cNone;
    });
  } catch (err) {
    results.push([false, `setup -> ${err.stack || err.message}`]);
    console.log(`  ✗ setup\n      ${err.stack || err.message}`);
  } finally {
    await cleanup();
  }
  const failed = results.filter(r => !r[0]);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  require("./e2e-logs").save(__filename, global.__backendLog ? global.__backendLog() : "");
  failed.forEach(f => console.log(`  FAILED: ${f[1]}`));
  process.exit(failed.length ? 1 : 0);
})();
