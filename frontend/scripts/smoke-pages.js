/* eslint-disable */
// Sweeps every screen of the system as each role: opens it in a real (headless) Chrome, clicks its tabs and groups, and
// reports a screen that falls on the error page, a script error, a failed request (5xx) or an error toast.
// Usage (local stack running):  node scripts/smoke-pages.js [role ...]
//   env: BASE=http://localhost:3000 API=http://localhost:8080 ADMIN_EMAIL=... ADMIN_PASSWORD=... CHROME_BIN=... FUZZ=0 (skip typing in forms)
const path = require("path");
const fs = require("fs");
const axios = require(path.resolve(__dirname, "../../backend/node_modules/axios"));
const puppeteer = require(path.resolve(__dirname, "../../backend/node_modules/puppeteer"));

const BASE = process.env.BASE || "http://localhost:3000";
const API = process.env.API || "http://localhost:8080";
const ADMIN = { email: process.env.ADMIN_EMAIL || "admin@whaticket.com", password: process.env.ADMIN_PASSWORD || "admin" };
const PASS = "sweep-pass-1234";
const FUZZ = process.env.FUZZ !== "0";

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

const ROLES = {
  admin: { email: ADMIN.email, password: ADMIN.password },
  coordenacao: { email: "sweep-coord@x.com", role: "coordenacao", coordArea: "comercial" },
  consultor: { email: "sweep-consultor@x.com", role: "consultor" },
  tutor: { email: "sweep-tutor@x.com", role: "tutor" },
};

// every address of the private area (parameters filled with something that exists or does not)
const ROUTES = [
  "/tickets", "/tickets/1", "/contacts", "/connections", "/quickAnswers", "/schedules", "/reports", "/ambientacao",
  "/crm", "/crm/painel", "/crm/tarefas", "/crm/comissoes", "/crm/metas-polos", "/crm/metas", "/crm/config",
  "/afiliados", "/afiliados?aba=materiais", "/afiliados?aba=campanhas", "/afiliados?aba=bonificacoes", "/afiliados?aba=regras",
  "/campaigns", "/chatbot", "/chatbot/1", "/chatbot-antigo", "/ai-agents", "/monitor", "/integrations",
  "/users", "/polos", "/Queues", "/tags", "/configuracoes",
  "/grades", "/analise-curricular", "/analise-curricular/1", "/analise-academica", "/analise-academica/1", "/alunos",
];
const SETTINGS_GROUPS = ["geral", "horario", "atendimento", "tutoria", "captacao", "pagamentos", "cadastros", "regras", "email", "erros"];

async function ensureUsers(adminToken) {
  const auth = { headers: { Authorization: `Bearer ${adminToken}` } };
  for (const [name, def] of Object.entries(ROLES)) {
    if (name === "admin") continue;
    const r = await http.post("/users", { name: `Varredura ${name}`, email: def.email, password: PASS, role: def.role, coordArea: def.coordArea }, auth);
    if (![200, 201, 409, 422].includes(r.status)) console.log(`(could not create ${name}: ${r.status} ${JSON.stringify(r.data).slice(0, 100)})`);
  }
  return auth;
}

// some data so the screens are not empty (every call may fail: it is only a help)
async function seed(auth) {
  const tryPost = (url, body) => http.post(url, body, auth).catch(() => null);
  const polo = await tryPost("/polos", { name: "Polo Varredura", code: "VAR", city: "Porto Velho", state: "RO" });
  const aff = await tryPost("/affiliates", { name: "Afiliado Varredura", phone: "5569988880001", email: "afiliado.varredura@x.com", city: "Porto Velho" });
  await tryPost("/affiliates", { name: "Afiliado Sem Dados" });
  await tryPost("/tags", { name: "Varredura", color: "#0693E3" });
  await tryPost("/quickAnswers", { shortcut: "varredura", message: "Mensagem de teste" });
  await tryPost("/leads", { name: "Lead Varredura", phone: "5569977770001", source: "Site" });
  void polo;
  return aff && aff.data && aff.data.portalToken ? aff.data.portalToken : null;
}

// The public page of an affiliate (no login): every tab, the QR Code, and the art in both formats must come out as a
// real image. Page errors, 5xx answers and the error page are findings, like in the private area.
async function sweepPortal(browser, token) {
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
  } catch (e) { note("timeout", e.message); }
  await ctx.close();
  return issues;
}

async function sweepRole(browser, name, def) {
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
        const fields = await page.$$('[role="dialog"] input:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=hidden]), [role="dialog"] textarea, form input:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=password])');
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

  for (const route of ROUTES) {
    current = route;
    try {
      await page.goto(BASE + route, { waitUntil: "networkidle2", timeout: 40000 });
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
    try { await page.goto(`${BASE}/configuracoes?secao=${g}`, { waitUntil: "networkidle2", timeout: 40000 }); } catch (e) { note("timeout", e.message); }
    await check(`/configuracoes?secao=${g}`);
  }
  await ctx.close();
  return issues;
}

(async () => {
  const wanted = process.argv.slice(2);
  const login = await http.post("/auth/login", ADMIN);
  if (login.status !== 200) { console.log("cannot sign in as the administrator:", login.status); process.exit(2); }
  const auth = await ensureUsers(login.data.token);
  const portalToken = await seed(auth);
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const all = [];
  for (const [name, def] of Object.entries(ROLES)) {
    if (wanted.length && !wanted.includes(name)) continue;
    process.stdout.write(`> ${name}... `);
    const issues = await sweepRole(browser, name, def);
    console.log(`${issues.length} finding(s)`);
    all.push(...issues);
  }
  if (!wanted.length || wanted.includes("portal")) {
    process.stdout.write("> portal (público)... ");
    if (!portalToken) { console.log("no affiliate to open"); all.push({ role: "portal", route: "/afiliado", kind: "script", text: "could not create the affiliate of the sweep" }); }
    else { const issues = await sweepPortal(browser, portalToken); console.log(`${issues.length} finding(s)`); all.push(...issues); }
  }
  await browser.close();
  const lines = all.map((i) => `${i.role.padEnd(11)} ${i.route.padEnd(36)} ${i.kind.padEnd(11)} ${i.text}`);
  fs.writeFileSync(process.env.REPORT || "/tmp/smoke-report.txt", lines.join("\n") + "\n");
  console.log(lines.join("\n") || "no findings");
  process.exit(all.some((i) => ["ERROR PAGE", "script", "blank", "login"].includes(i.kind) || i.kind.startsWith("http")) ? 1 : 0);
})();
