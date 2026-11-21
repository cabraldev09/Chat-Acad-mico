// Calls every GET route of the API as the administrator, a consultant and a tutor, against a running API (the same stack as the
// screen sweep), and fails on what a person would hit as a broken screen:
//   - an answer 500 (or no answer);
//   - a route of the management (isManager / isAdmin) answering 200 to a consultant or a tutor (data of others leaking);
// slow answers (over 3 s) are listed, not failed (a cold database on the runner is slow by nature).
// The routes come from the route files (the same reading as audit-routes.js); ids in the path come from the database.
// Usage: API=http://localhost:8080 node scripts/route-sweep.js   (env: ADMIN_EMAIL, ADMIN_PASSWORD, PG* or DB_* for the ids)
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const axios = require("axios");

const API = process.env.API || "http://localhost:8080";
const ADMIN = { email: process.env.ADMIN_EMAIL || "admin@whaticket.com", password: process.env.ADMIN_PASSWORD || "admin" };
const PASS = "sweep-pass-1234";
const SLOW_MS = 3000;
// routes that are not pages of data: files, streams, sessions of WhatsApp, logout and exports (they work, but do other things)
const SKIP = /(logout|qrcode|export|download|\/file\b|\/files\/|stream|\/media\/|\.csv|webhook|whatsappsession|\/health|\/sweep|\/pdf\b|\/preview\b|\/image\b|\/avatar)/i;

const routes = [];
const dir = path.join(__dirname, "../src/routes");
fs.readdirSync(dir).filter(f => f.endsWith(".ts")).forEach(file => {
  const text = fs.readFileSync(path.join(dir, file), "utf8").replace(/\n\s+/g, " ");
  const re = /\b(?:r|\w*Routes?|router)\.(get)\(\s*(["'`])([^"'`]+)\2\s*,([^;]*)\);/g;
  let m;
  while ((m = re.exec(text))) {
    const guards = m[4].split(",").map(s => s.trim()).filter(a => /^[a-zA-Z]+$/.test(a));
    if (!guards.includes("isAuth")) continue; // public and API-token routes are other sweeps
    routes.push({ file, path: m[3], manager: guards.includes("isManager") || guards.includes("isAdmin") });
  }
});

const sql = q => {
  const env = { ...process.env, PGHOST: process.env.PGHOST || process.env.DB_HOST || "localhost", PGUSER: process.env.PGUSER || process.env.DB_USER || "postgres", PGDATABASE: process.env.PGDATABASE || process.env.DB_NAME || "telas" };
  if (process.env.DB_PASS) env.PGPASSWORD = process.env.DB_PASS;
  try { return execFileSync("psql", ["-At", "-c", q], { env }).toString().trim().split("\n")[0] || ""; } catch (e) { return ""; }
};
const firstId = table => sql(`SELECT id FROM "${table}" ORDER BY id LIMIT 1`) || "1";
const IDS = {
  ticketId: () => firstId("Tickets"), contactId: () => firstId("Contacts"), leadId: () => firstId("Leads"), userId: () => firstId("Users"),
  whatsappId: () => firstId("Whatsapps"), queueId: () => firstId("Queues"), poloId: () => firstId("Polos"), courseId: () => firstId("Courses"),
  tagId: () => firstId("Tags"), campaignId: () => firstId("Campaigns"), flowId: () => firstId("ChatFlows"), agentId: () => firstId("AiAgents"),
  studentId: () => firstId("Students"), stageId: () => firstId("LeadStages"),
};
const fill = p => p.replace(/:(\w+)\??/g, (_, name) => (IDS[name] ? IDS[name]() : "1"));

(async () => {
  const http = axios.create({ baseURL: API, validateStatus: () => true, timeout: 20000 });
  const login = async (email, password) => (await http.post("/auth/login", { email, password })).data.token;
  const admin = await login(ADMIN.email, ADMIN.password);
  if (!admin) { console.error("Não foi possível entrar como administrador."); process.exit(1); }
  const as = token => ({ headers: { Authorization: `Bearer ${token}` } });
  const people = { admin };
  for (const role of ["consultor", "tutor"]) {
    const email = `route-sweep-${role}@x.com`;
    await http.post("/users", { name: `Varredura de rotas ${role}`, email, password: PASS, role }, as(admin));
    people[role] = await login(email, PASS);
  }

  const failures = [];
  const slow = [];
  const external = [];
  let calls = 0;
  for (const r of routes) {
    if (SKIP.test(r.path)) continue;
    const url = fill(r.path);
    for (const [who, token] of Object.entries(people)) {
      if (!token) continue;
      const started = Date.now();
      let status;
      try { status = (await http.get(url, as(token))).status; } catch (e) { status = `sem resposta (${e.code || e.message})`; }
      calls += 1;
      const ms = Date.now() - started;
      // 502/503 is the answer for a service outside that refused (the Meta with a test token): told on the screen, not a failure of ours
      if (status === 502 || status === 503) external.push(`${who.padEnd(9)} GET ${url} → ${status}`);
      else if (typeof status !== "number" || status >= 500) failures.push(`${who.padEnd(9)} GET ${url} → ${status} (${r.file})`);
      else if (r.manager && who !== "admin" && status === 200) failures.push(`${who.padEnd(9)} GET ${url} → 200 numa rota da gestão (${r.file})`);
      if (ms > SLOW_MS) slow.push(`${who.padEnd(9)} GET ${url} → ${ms} ms`);
    }
  }
  console.log(`Varredura de rotas: ${routes.length} rotas GET com login, ${calls} chamadas (admin, consultor e tutor).`);
  if (external.length) console.log(`\nServiço externo indisponível (502/503, mensagem clara na tela):\n${external.join("\n")}`);
  if (slow.length) console.log(`\nLentas (acima de ${SLOW_MS / 1000} s):\n${slow.join("\n")}`);
  if (failures.length) {
    console.log(`\nFalhas (${failures.length}):\n${failures.join("\n")}`);
    process.exit(1);
  }
  console.log("\nNenhuma falha: nenhuma rota respondeu 500 e nenhuma rota da gestão abriu para consultor ou tutor.");
})().catch(e => { console.error(e); process.exit(1); });
