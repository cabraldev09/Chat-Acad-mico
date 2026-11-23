/* eslint-disable */
// Sweeps every screen of the system as each role: opens it in a real (headless) Chrome, clicks its tabs and groups, and
// reports a screen that falls on the error page, a script error, a failed request (5xx) or an error toast.
// Usage (local stack running):  node scripts/smoke-pages.js [role ...]
//   env: BASE=http://localhost:3000 API=http://localhost:8080 ADMIN_EMAIL=... ADMIN_PASSWORD=... CHROME_BIN=... FUZZ=0 (skip typing in forms)
const path = require("path");
const fs = require("fs");
const axios = require(path.resolve(__dirname, "../../backend/node_modules/axios"));
const puppeteer = require(path.resolve(__dirname, "../../backend/node_modules/puppeteer"));
const FormData = require(path.resolve(__dirname, "../../backend/node_modules/form-data"));

const BASE = process.env.BASE || "http://localhost:3000";
const API = process.env.API || "http://localhost:8080";
const ADMIN = { email: process.env.ADMIN_EMAIL || "admin@whaticket.com", password: process.env.ADMIN_PASSWORD || "admin" };
const PASS = "sweep-pass-1234";
const FUZZ = process.env.FUZZ !== "0";
const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const CORS_PROBE = process.argv.includes("--cors-probe");
const CORS_PROBE_ORIGIN = process.env.SMOKE_CORS_ORIGIN || "http://localhost:3000";
// TEST-NET keeps the deliberate limiter probe in its own bucket behind TRUST_PROXY=loopback.
// Vary the address per run so an earlier probe cannot leave this run starting in a spent bucket.
const CORS_PROBE_IP = process.env.SMOKE_CORS_PROBE_IP || `198.51.100.${1 + (Number(RUN_ID.split("-")[0]) % 254)}`;
const REFRESH_LIMIT = Number(process.env.SMOKE_REFRESH_LIMIT) || 400;
const PUBLIC_LIMIT = Number(process.env.SMOKE_PUBLIC_LIMIT) || 120;

const chromePath = () => {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  try {
    const env = fs.readFileSync(path.resolve(__dirname, "../../backend/.env"), "utf8");
    const m = env.match(/^CHROME_BIN=(.*)$/m);
    if (m) return m[1].trim();
  } catch (e) { /* no .env */ }
  return undefined;
};

const http = axios.create({ baseURL: API, validateStatus: () => true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rowsOf = (value, keys = []) => {
  if (Array.isArray(value)) return value;
  for (const key of keys) if (Array.isArray(value && value[key])) return value[key];
  return [];
};

const selectablePdf = (lines) => {
  const stream = lines.map(([x, y, text]) => `BT /F1 10 Tf ${x} ${y} Td (${text.replace(/[\\()]/g, "\\$&")}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let document = "%PDF-1.4\n% smoke fixture\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(document);
  document += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(document);
};

const academicPdf = () => selectablePdf([
  [30, 780, "Aluno: Aluno Teste Portal"], [30, 760, "RGM: 9000001"], [30, 740, "Curso: Administracao"], [30, 720, "Periodo atual: 3"],
  [30, 680, "Codigo"], [130, 680, "Disciplina"], [300, 680, "Periodo"], [390, 680, "Status"], [510, 680, "CH"],
  [30, 650, "001"], [130, 650, "Matematica"], [315, 650, "1"], [390, 650, "A CURSAR"], [510, 650, "40"],
  [30, 620, "002"], [130, 620, "Gestao"], [315, 620, "3"], [390, 620, "CURSANDO"], [510, 620, "60"],
  [30, 590, "003"], [130, 590, "Economia"], [315, 590, "2"], [390, 590, "AE"], [510, 590, "40"]
]);

const ROLES = {
  admin: { email: ADMIN.email, password: ADMIN.password },
  coordenacao: { email: `sweep-${RUN_ID}-coord@x.com`, role: "coordenacao", coordArea: "comercial" },
  consultor: { email: `sweep-${RUN_ID}-consultor@x.com`, role: "consultor" },
  tutor: { email: `sweep-${RUN_ID}-tutor@x.com`, role: "tutor" },
  academico: { email: `sweep-${RUN_ID}-academico@x.com`, role: "academico" },
  relacionamento: { email: `sweep-${RUN_ID}-relacionamento@x.com`, role: "relacionamento" },
};

// every address of the private area (parameters filled with something that exists or does not)
const ROUTES = [
  "/tickets", "/contacts", "/connections", "/quickAnswers", "/schedules", "/reports", "/ambientacao",
  "/estatisticas", "/meu-desempenho", "/estatisticas/tutoria", "/meus-alunos", "/crm/matriculas",
  "/crm", "/crm/painel", "/crm/tarefas", "/crm/comissoes", "/crm/metas-polos", "/crm/metas", "/crm/config",
  "/afiliados", "/afiliados?aba=materiais", "/afiliados?aba=campanhas", "/afiliados?aba=bonificacoes", "/afiliados?aba=regras",
  "/cursos", "/campaigns", "/chatbot", "/chatbot-antigo", "/ai-agents", "/monitor", "/integrations",
  "/users", "/polos", "/Queues", "/tags", "/configuracoes", "/crm/retencao",
  "/grades", "/analise-curricular", "/analise-academica", "/alunos",
];
const SETTINGS_GROUPS = ["prontidao", "modelos", "copiloto", "entregas", "meta", "geral", "atendimento", "tutoria", "captacao", "pagamentos", "cadastros", "regras", "email", "erros"];

// what the sweep itself created, erased at the end (the screens may still create a few things while forms are typed in)
const created = [];
// problems of the preparation: they fail the sweep (a screen swept without its data proves nothing)
const setupIssues = [];

async function ensureUsers(adminToken, adminId) {
  const auth = { headers: { Authorization: `Bearer ${adminToken}` } };
  const userIds = { admin: Number(adminId) || null };
  for (const [name, def] of Object.entries(ROLES)) {
    if (name === "admin") continue;
    const r = await http.post("/users", { name: `Varredura ${name}`, email: def.email, password: PASS, role: def.role, coordArea: def.coordArea }, auth);
    if ([200, 201].includes(r.status) && r.data && r.data.id) {
      userIds[name] = Number(r.data.id);
      created.push(`/users/${r.data.id}`);
    } else setupIssues.push({ role: name, route: "/users", kind: "setup", text: `could not create a fresh user: ${r.status} ${JSON.stringify(r.data).slice(0, 100)}` });
  }
  return { auth, userIds };
}

// some data so the screens are not empty (every call may fail: it is only a help)
async function seed(auth, userIds) {
  const tryPost = async (url, body) => {
    const r = await http.post(url, body, auth).catch(() => null);
    const id = r && r.data && (r.data.id || (r.data.lead && r.data.lead.id));
    if (r && [200, 201].includes(r.status) && id) created.push(`${url === "/leads" ? "/leads" : url}/${id}`);
    // already there from an earlier run (409/422) is fine; anything else means the screens are swept without their data
    else if (!r || ![409, 422].includes(r.status)) setupIssues.push({ role: "setup", route: url, kind: "setup", text: `could not create the sweep data: ${r ? r.status : "no answer"}` });
    return r;
  };
  const polo = await tryPost("/polos", { name: "Polo Varredura", code: "VAR", city: "Porto Velho", state: "RO" });
  const aff = await tryPost("/affiliates", { name: "Afiliado Varredura", phone: "5569988880001", email: "afiliado.varredura@x.com", city: "Porto Velho" });
  // an affiliate with only a name (the screens must cope with the missing data): it may be refused by the validation, that is fine
  await http.post("/affiliates", { name: "Afiliado Sem Dados" }, auth).then((r) => { if (r && r.data && r.data.id) created.push(`/affiliates/${r.data.id}`); }).catch(() => null);
  await tryPost("/tags", { name: "Varredura", color: "#0693E3" });
  await tryPost("/quickAnswers", { shortcut: "varredura", message: "Mensagem de teste" });
  await tryPost("/leads", { name: "Lead Varredura", phone: "5569977770001", source: "Site" });

  // A ticket detail needs a real connection and contact. Only prepare one when the local API
  // explicitly skips QR sessions; smoke setup must never initialize a real WhatsApp provider.
  const detailRoutesByRole = Object.fromEntries(Object.keys(ROLES).map((role) => [role, []]));
  if (process.env.SKIP_WHATSAPP_SESSIONS === "1") {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const connection = await tryPost("/whatsapp", { name: `Varredura ${suffix}`, channel: "whatsapp" });
    const whatsappId = connection && connection.data && connection.data.id;
    if (whatsappId) {
      for (const [role, userId] of Object.entries(userIds)) {
        const contact = await tryPost("/contacts", {
          name: `Contato Varredura ${role} ${suffix}`,
          number: `55699${String(Date.now() + Number(userId)).slice(-8)}`
        });
        const contactId = contact && contact.data && contact.data.id;
        const ticket = contactId && await tryPost("/tickets", { contactId, status: "open", userId });
        const ticketId = ticket && ticket.data && ticket.data.id;
        if (ticketId) detailRoutesByRole[role].push(`/tickets/${ticketId}`);
        else setupIssues.push({ role, route: "/tickets/:id", kind: "setup", text: "ticket fixture was not created for this profile" });
      }
    } else setupIssues.push({ role: "setup", route: "/tickets/:id", kind: "setup", text: "isolated WhatsApp fixture was not created" });
  } else {
    setupIssues.push({ role: "setup", route: "/tickets/:id", kind: "setup", text: "set SKIP_WHATSAPP_SESSIONS=1 to prepare a test ticket without starting a provider" });
  }

  const flowResult = await tryPost("/flows", { name: `Varredura ${Date.now()}`, kind: "flow" });
  const flowId = flowResult && flowResult.data && flowResult.data.id || null;
  if (flowId) ["admin", "coordenacao"].forEach((role) => detailRoutesByRole[role].push(`/chatbot/${flowId}`));
  else setupIssues.push({ role: "setup", route: "/chatbot/:id", kind: "setup", text: "flow fixture was not created" });

  const poloList = await http.get("/polos", auth).catch(() => null);
  const poloId = polo && polo.data && polo.data.id || rowsOf(poloList && poloList.data, ["rows", "polos"]).find((row) => row.code === "VAR" || row.name === "Polo Varredura")?.id;
  if (poloId) {
    const curricularForm = new FormData();
    curricularForm.append("file", fs.readFileSync(path.resolve(__dirname, "../../backend/scripts/fixtures/sample-analise.pdf")), { filename: "analise-smoke.pdf", contentType: "application/pdf" });
    curricularForm.append("entryPeriod", "2");
    curricularForm.append("startTerm", "2026.2");
    curricularForm.append("candidateName", `Candidato Smoke ${RUN_ID}`);
    curricularForm.append("poloId", String(poloId));
    const curricular = await http.post("/analysis/curricular", curricularForm, { headers: { ...auth.headers, ...curricularForm.getHeaders() } }).catch(() => null);
    if (curricular && [200, 201].includes(curricular.status) && curricular.data && curricular.data.id) {
      created.push(`/analysis/curricular/${curricular.data.id}`);
      ["admin", "coordenacao"].forEach((role) => detailRoutesByRole[role].push(`/analise-curricular/${curricular.data.id}`));
    } else setupIssues.push({ role: "setup", route: "/analise-curricular/:id", kind: "setup", text: `could not create a local fixture: ${curricular ? curricular.status : "no answer"}` });
  } else setupIssues.push({ role: "setup", route: "/analise-curricular/:id", kind: "setup", text: "no polo fixture exists for the curricular-analysis fixture" });

  const academicForm = new FormData();
  academicForm.append("file", academicPdf(), { filename: "historico-smoke.pdf", contentType: "application/pdf" });
  const academic = await http.post("/analysis/academic", academicForm, { headers: { ...auth.headers, ...academicForm.getHeaders() } }).catch(() => null);
  if (academic && [200, 201].includes(academic.status) && academic.data && academic.data.id) {
    created.push(`/analysis/academic/${academic.data.id}`);
    ["admin", "coordenacao"].forEach((role) => detailRoutesByRole[role].push(`/analise-academica/${academic.data.id}`));
  } else setupIssues.push({ role: "setup", route: "/analise-academica/:id", kind: "setup", text: `could not create a local fixture: ${academic ? academic.status : "no answer"}` });

  void polo;
  // a course to open its public page
  const courses = await http.get("/courses", auth).catch(() => null);
  const list = courses && Array.isArray(courses.data) ? courses.data : (courses && courses.data && (courses.data.courses || courses.data.rows)) || [];
  const course = list.find((c) => c.active !== false);
  return { token: aff && aff.data && aff.data.portalToken ? aff.data.portalToken : null, courseId: course ? course.id : null, detailRoutesByRole };
}

async function probeCorsLimits() {
  const health = await http.get("/health").catch(() => null);
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(API);
  if (!local || !(health && health.data && health.data.sweepable)) {
    throw new Error("CORS probe requires a local API marked sweepable by ALLOW_SWEEP=1");
  }
  const headers = { Origin: CORS_PROBE_ORIGIN, "X-Forwarded-For": CORS_PROBE_IP };
  let authResponse;
  for (let i = 0; i <= REFRESH_LIMIT; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    authResponse = await http.post("/auth/refresh_token", null, { headers });
    if (authResponse.status === 429) break;
  }
  let publicResponse;
  for (let i = 0; i <= PUBLIC_LIMIT; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    publicResponse = await http.get(`/public/courses/__smoke_cors_probe_${Date.now()}__`, { headers });
    if (publicResponse.status === 429) break;
  }
  const authOrigin = authResponse && authResponse.headers["access-control-allow-origin"];
  const publicOrigin = publicResponse && publicResponse.headers["access-control-allow-origin"];
  console.log(JSON.stringify({
    auth: { status: authResponse && authResponse.status, allowOrigin: authOrigin },
    public: { status: publicResponse && publicResponse.status, allowOrigin: publicOrigin }
  }));
  if (!authResponse || authResponse.status !== 429 || authOrigin !== CORS_PROBE_ORIGIN ||
      !publicResponse || publicResponse.status !== 429 || publicOrigin !== CORS_PROBE_ORIGIN) process.exit(1);
}

const clientNavigate = async (page, route) => {
  await page.evaluate((pathAndQuery) => {
    window.history.pushState({}, "", pathAndQuery);
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
  }, route);
};

// The public page of an affiliate (no login): every tab, the QR Code, and the art in both formats must come out as a
// real image. Page errors, 5xx answers and the error page are findings, like in the private area.
async function sweepPortal(browser, token, courseId) {
  const issues = [];
  let current = "/afiliado";
  const note = (kind, text) => issues.push({ role: "portal", route: current, kind, text: String(text).slice(0, 220) });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on("pageerror", (e) => note("script", e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon/.test(m.text())) note("console", m.text()); });
  page.on("response", (res) => { if (res.status() >= 500) note("http " + res.status(), res.url().replace(API, "")); });
  const base = `${BASE}/afiliado/${token}`;
  try {
    for (const tab of ["home", "materials", "campaigns", "learn", "referrals"]) {
      current = `/afiliado#${tab}`;
      await page.goto(`${base}#${tab}`, { waitUntil: "networkidle2", timeout: 40000 });
      await sleep(900);
      const text = await page.evaluate(() => document.body.innerText || "");
      if (/Não conseguimos abrir|Este link não está disponível|Não foi possível abrir esta tela/.test(text)) note("ERROR PAGE", text.slice(0, 80));
      if (text.trim().length < 40) note("blank", "empty page");
    }
    current = "/afiliado#home (QR Code e arte)";
    await page.goto(`${base}#home`, { waitUntil: "networkidle2", timeout: 40000 });
    await sleep(1200);
    const qrOpened = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /QR Code/.test(x.innerText));
      if (b) b.click();
      return !!b;
    });
    await sleep(500);
    if (!qrOpened || !(await page.$(".ca-qr-box canvas"))) note("script", "the QR Code did not open");
    await page.keyboard.press("Escape");
    await sleep(300);
    for (const format of ["Story", "Feed"]) {
      await page.evaluate((f) => { const b = [...document.querySelectorAll(".ca-chip")].find((x) => x.innerText.startsWith(f)); if (b) b.click(); }, format);
      await sleep(900);
      const size = await page.evaluate(async () => {
        const c = document.querySelector(".ca-art-canvas");
        if (!c) return -1;
        const blob = await new Promise((r) => c.toBlob(r, "image/png"));
        return blob ? blob.size : 0;
      });
      if (!(size > 20000)) note("script", `the art (${format}) did not come out as an image (size ${size})`);
    }
    const copy = await page.evaluate(() => [...document.querySelectorAll(".ca-idea .ca-copy, .ca-kit .ca-copy")].map((n) => n.innerText).join("\n"));
    if (/\{\{|\[\[|\]\]/.test(copy)) note("script", "a ready-made text came out with a variable that was not filled in");
    // the public page of a course: the name, the form and no price
    if (courseId) {
      current = "/curso";
      await page.goto(`${BASE}/curso/${courseId}-teste?utm_source=varredura`, { waitUntil: "networkidle2", timeout: 40000 });
      await sleep(900);
      const text = await page.evaluate(() => document.body.innerText || "");
      if (!/Quero saber mais/.test(text) || !(await page.$("form input[type=checkbox]"))) note("ERROR PAGE", "the course page did not open with its form");
      if (/R\$\s*\d|mensalidade/i.test(text)) note("script", "the public course page shows a price");
    }
  } catch (e) { note("timeout", e.message); }
  await ctx.close();
  return issues;
}

async function sweepRole(browser, name, def, detailRoutes = []) {
  const roleRoutes = [...ROUTES, ...detailRoutes];
  const issues = [];
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  let current = "(login)";
  const note = (kind, text) => issues.push({ role: name, route: current, kind, text: String(text).slice(0, 220) });
  page.on("pageerror", (e) => note("script", e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // failed loads of resources and expected 4xx answers are reported by the response hook
    if (/Failed to load resource|favicon|ResizeObserver|WebSocket connection/.test(t)) return;
    note("console", t);
  });
  page.on("response", (res) => {
    const s = res.status();
    if (s >= 500) note("http " + s, res.url().replace(API, ""));
  });

  // real login through the form: the session cookie is set like for a person
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2", timeout: 40000 });
  await page.type('input[name="email"]', def.email);
  await page.type('input[name="password"]', def.password || PASS);
  await Promise.all([page.keyboard.press("Enter"), page.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => null)]);
  await sleep(1500);
  if (page.url().includes("/login")) { note("login", "could not sign in"); await ctx.close(); return issues; }

  // One direct deep-link verifies the server fallback and refresh-cookie login. Keep the remaining
  // routes in the SPA so each page doesn't remount AuthProvider and renew the same cookie.
  try { await page.goto(`${BASE}/tickets`, { waitUntil: "networkidle2", timeout: 40000 }); }
  catch (e) { note("timeout", e.message); }

  const check = async (label) => {
    current = label;
    await sleep(1800);
    const info = await page.evaluate(() => {
      const text = document.body.innerText || "";
      return {
        boundary: /Não foi possível abrir esta tela/.test(text),
        code: (text.match(/Código do erro: ([A-Z0-9]+)/) || [])[1] || "",
        detail: (text.match(/Código do erro: [A-Z0-9]+\.\s*([^\n]{0,160})/) || [])[1] || "",
        toasts: [...document.querySelectorAll(".Toastify__toast--error")].map((n) => n.innerText.replace(/\s+/g, " ").slice(0, 120)),
        blank: text.trim().length < 20,
      };
    });
    if (info.boundary) note("ERROR PAGE", `código ${info.code} ${info.detail}`);
    if (info.blank) note("blank", "empty page");
    info.toasts.forEach((t) => note("toast", t));
    await page.evaluate(() => document.querySelectorAll(".Toastify__toast--error").forEach((n) => n.remove()));
  };

  // opens the forms of the screen ("Novo", "Adicionar", "Editar"...) and types fast in every field, as a person does:
  // React 16 batches the updates, which is where a handler that reads the event late breaks
  const fuzz = async (label) => {
    if (!FUZZ) return;
    const labels = await page.evaluate(() => [...new Set([...document.querySelectorAll("button, [role=button]")]
      .filter((b) => b.offsetParent && !b.disabled && /^(novo|nova|adicionar|editar|criar|cadastrar)\b/i.test((b.innerText || "").trim()))
      .map((b) => (b.innerText || "").trim().split("\n")[0]))].slice(0, 3)).catch(() => []);
    for (const text of labels) {
      try {
        const clicked = await page.evaluate((t) => {
          const b = [...document.querySelectorAll("button, [role=button]")].find((x) => x.offsetParent && !x.disabled && (x.innerText || "").trim().split("\n")[0] === t);
          if (b) b.click();
          return !!b;
        }, text);
        if (!clicked) continue;
        await sleep(700);
        // Fields that open a picker of the system (date, month, time, color...) are never touched: on a Mac they open a real calendar
        // window on top of whatever the person is doing. Only plain text fields are typed into.
        const PICKERS = ":not([type=date]):not([type=month]):not([type=week]):not([type=time]):not([type=datetime-local]):not([type=color]):not([type=range])";
        const fields = await page.$$(`[role="dialog"] input:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=hidden])${PICKERS}, [role="dialog"] textarea, form input:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=password])${PICKERS}`);
        for (const field of fields.slice(0, 8)) {
          try {
            await field.click({ clickCount: 3 });
            await page.keyboard.type("Teste 12 rapido", { delay: 0 });
          } catch (e) { /* the field closed or moved */ }
        }
        await check(`${label} › ${text} (digitando)`);
        await page.keyboard.press("Escape");
        await sleep(300);
      } catch (e) { /* the screen changed under the click */ }
    }
  };

  for (const route of roleRoutes) {
    current = route;
    try {
      await clientNavigate(page, route);
    } catch (e) { note("timeout", e.message); }
    await check(route);
    await fuzz(route);
    // the tabs and groups of the screen: open each one
    const tabCount = await page.$$eval('[role="tab"]', (n) => n.length).catch(() => 0);
    for (let i = 0; i < Math.min(tabCount, 8); i++) {
      try {
        const tabs = await page.$$('[role="tab"]');
        if (!tabs[i]) break;
        await tabs[i].click();
        await check(`${route} › aba ${i + 1}`);
      } catch (e) { /* the screen changed under the click */ }
    }
  }
  for (const g of SETTINGS_GROUPS) {
    try { await clientNavigate(page, `/configuracoes?secao=${g}`); } catch (e) { note("timeout", e.message); }
    await check(`/configuracoes?secao=${g}`);
  }
  // the phone (390×844): every screen again, looking for anything wider than the screen (the page or a box sticking out of it)
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    for (const route of [...roleRoutes, ...SETTINGS_GROUPS.map((g) => `/configuracoes?secao=${g}`)]) {
      current = `${route} (celular)`;
      try { await clientNavigate(page, route); } catch (e) { note("timeout", e.message); continue; }
      await sleep(1200);
      const wide = await page.evaluate(() => {
        const W = window.innerWidth;
        const main = document.querySelector("main");
        const out = [];
        if (document.documentElement.scrollWidth > W + 2) out.push(`page ${document.documentElement.scrollWidth}px`);
        if (main && main.scrollWidth > main.clientWidth + 4) {
          // the widest thing that is not inside a box that scrolls by itself
          const culprit = [...main.querySelectorAll("*")].find((el) => {
            const r = el.getBoundingClientRect();
            if (r.right <= W + 2 || !r.width) return false;
            for (let p = el.parentElement; p && p !== main; p = p.parentElement) { if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) return false; }
            return true;
          });
          if (culprit) out.push(`${culprit.tagName.toLowerCase()}.${String(culprit.className).split(" ")[0].slice(0, 30)} até ${Math.round(culprit.getBoundingClientRect().right)}px`);
        }
        return out;
      }).catch(() => []);
      wide.forEach((w) => note("mobile", w));
    }
  await ctx.close();
  return issues;
}

(async () => {
  const wanted = process.argv.slice(2);
  // never against a real server: the sweep creates users, polos, leads and types into forms. The API must say it is a test server
  // (ALLOW_SWEEP=1 in its environment) or the person running it must say so explicitly (SMOKE_ALLOW=1)
  const health = await http.get("/health").catch(() => null);
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(API);
  if (!(health && health.data && health.data.sweepable) && process.env.SMOKE_ALLOW !== "1") {
    console.log(`refused: ${API} did not say it is a test server (start the API with ALLOW_SWEEP=1, or run with SMOKE_ALLOW=1 if you are sure)`);
    process.exit(3);
  }
  if (!local && process.env.SMOKE_ALLOW !== "1") { console.log(`refused: ${API} is not local (SMOKE_ALLOW=1 to go on anyway)`); process.exit(3); }
  if (CORS_PROBE) {
    try { await probeCorsLimits(); process.exit(0); }
    catch (err) { console.error(err.message); process.exit(1); }
  }
  const login = await http.post("/auth/login", ADMIN);
  if (login.status !== 200) { console.log("cannot sign in as the administrator:", login.status); process.exit(2); }
  const { auth, userIds } = await ensureUsers(login.data.token, login.data.user && login.data.user.id);
  const { token: portalToken, courseId, detailRoutesByRole } = await seed(auth, userIds);
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const all = [];
  // the roles are independent (each one has its own browser context and session): they are swept at the same time, which is most of the
  // waiting of this check (every screen waits a moment to settle); SWEEP_PARALLEL=1 goes back to one after the other
  const roles = Object.entries(ROLES).filter(([name]) => !wanted.length || wanted.includes(name));
  const lanes = process.env.SWEEP_PARALLEL === "1" ? 1 : Math.max(1, Number(process.env.SWEEP_PARALLEL) || roles.length);
  const results = new Map();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(lanes, roles.length) }, async () => {
    while (next < roles.length) {
      const [name, def] = roles[next++];
      const issues = await sweepRole(browser, name, def, detailRoutesByRole[name]);
      console.log(`> ${name}... ${issues.length} finding(s)`);
      results.set(name, issues);
    }
  }));
  roles.forEach(([name]) => all.push(...(results.get(name) || [])));
  if (!wanted.length || wanted.includes("portal")) {
    process.stdout.write("> portal (público)... ");
    if (!portalToken) { console.log("no affiliate to open"); all.push({ role: "portal", route: "/afiliado", kind: "script", text: "could not create the affiliate of the sweep" }); }
    else { const issues = await sweepPortal(browser, portalToken, courseId); console.log(`${issues.length} finding(s)`); all.push(...issues); }
  }
  await browser.close();
  // erases what the sweep created (users last: they may own the rest)
  for (const url of [...created].reverse()) { await http.delete(url, auth).catch(() => null); }
  all.push(...setupIssues);
  const lines = all.map((i) => `${i.role.padEnd(11)} ${i.route.padEnd(36)} ${i.kind.padEnd(11)} ${i.text}`);
  fs.writeFileSync(process.env.REPORT || "/tmp/smoke-report.txt", lines.join("\n") + "\n");
  console.log(lines.join("\n") || "no findings");
  // what fails the check: an error page, a script error, a blank page, a failed login, a 5xx, a screen that did not open in time, a page
  // wider than the phone, a failed preparation, and an error toast that was not expected (console messages are only reported)
  const failing = all.filter((i) => ["ERROR PAGE", "script", "blank", "login", "timeout", "mobile", "setup"].includes(i.kind) || i.kind.startsWith("http") || i.kind === "toast");
  if (failing.length) console.log(`\n${failing.length} finding(s) fail the check.`);
  process.exit(failing.length ? 1 : 0);
})();
