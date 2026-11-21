// Click sweep: opens every screen as the administrator, on a computer and on a phone, and clicks each button that only opens or
// changes what is shown (menus, tabs, filters, details, dialogs). Buttons that save, send, delete or leave are skipped by their
// text, and so are switches and checkboxes (they save). After each click it looks for what a person would see as broken:
//   - an error of the screen (a page error or the "Algo deu errado" boundary);
//   - an answer 500 from the API;
//   - the page wider than the screen (a sideways scroll);
//   - a menu or popover that opened outside the screen.
// Usage (the same stack as the screen sweep): BASE=http://localhost:3000 API=http://localhost:8080 node scripts/click-sweep.js
// env: ROUTES=/crm/painel,/estatisticas (only these), MAX=40 (clicks per screen), CHROME_BIN=...
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://localhost:3000";
const ADMIN = { email: process.env.ADMIN_EMAIL || "admin@whaticket.com", password: process.env.ADMIN_PASSWORD || "admin" };
const MAX = Number(process.env.MAX || 40);
const ROUTES = process.env.ROUTES ? process.env.ROUTES.split(",") : [
  "/tickets", "/contacts", "/connections", "/quickAnswers", "/schedules", "/reports", "/ambientacao",
  "/estatisticas", "/estatisticas?aba=consultores", "/estatisticas?aba=treinamento", "/estatisticas/captacao", "/estatisticas/tutoria", "/gestao-comercial", "/meus-alunos",
  "/crm", "/crm/painel", "/crm/tarefas", "/crm/comissoes", "/crm/metas-polos", "/crm/retencao",
  "/afiliados", "/cursos", "/campaigns", "/chatbot", "/ai-agents", "/users", "/polos", "/Queues", "/tags", "/grades",
  "/analise-curricular", "/analise-academica", "/alunos",
  "/configuracoes?secao=prontidao", "/configuracoes?secao=cadastros", "/configuracoes?secao=geral", "/configuracoes?secao=atendimento",
  "/configuracoes?secao=tutoria", "/configuracoes?secao=copiloto", "/configuracoes?secao=modelos", "/configuracoes?secao=meta",
  "/configuracoes?secao=captacao", "/configuracoes?secao=pagamentos", "/configuracoes?secao=regras", "/configuracoes?secao=email",
  "/configuracoes?secao=entregas", "/configuracoes?secao=erros",
];
// what would change data or leave the screen: never clicked here
const SKIP = /(excluir|remover|apagar|deletar|delete|sair|logout|desconect|encerrar|finalizar|enviar|disparar|revogar|resetar|redefinir|limpar|tirar do funil|não é lead|arquivar|bloquear|transferir|assumir|devolver|aprovar|recusar|confirmar|pagar|cobrar|gerar|importar|exportar|baixar|download|sincronizar|reiniciar|testar|conectar|reconectar|desligar|ligar|salvar|publicar|duplicar|copiar|aplicar|distribuir|marcar|concluir|registrar|autorizar|vincular|conferir de novo|usar|sugerir|qr|ia qualificar)/i;

(async () => {
  const browser = await chromium.launch(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {});
  const findings = [];
  let clicks = 0;
  for (const [device, viewport] of [["computador", { width: 1440, height: 900 }], ["celular", { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    let current = "";
    page.on("pageerror", (e) => findings.push(`${device.padEnd(10)} ${current.padEnd(38)} erro da tela: ${String(e.message || e).slice(0, 160)}`));
    page.on("response", (r) => { if (r.status() >= 500 && r.status() !== 502 && r.status() !== 503) findings.push(`${device.padEnd(10)} ${current.padEnd(38)} API ${r.status()} em ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`); });
    await page.goto(`${BASE}/login`);
    await page.fill('input[name="email"]', ADMIN.email);
    await page.fill('input[name="password"]', ADMIN.password);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2500);
    for (const route of ROUTES) {
      current = route;
      await page.goto(BASE + route);
      await page.waitForTimeout(1800);
      // the buttons of the content (not the side menu nor the top bar), by a stable index, read once
      const total = await page.evaluate(() => document.querySelectorAll("main button, main [role=tab], main [role=button]").length);
      let done = 0;
      for (let i = 0; i < total && done < MAX; i += 1) {
        const target = await page.evaluate(({ i, skip }) => {
          const el = document.querySelectorAll("main button, main [role=tab], main [role=button]")[i];
          if (!el) return null;
          const text = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim();
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height || el.disabled || el.getAttribute("aria-disabled") === "true") return null;
          if (new RegExp(skip, "i").test(text) || el.closest("[role=switch], label") || el.querySelector("input[type=checkbox]")) return null;
          if (el.closest("a[href]")) return null;
          el.setAttribute("data-sweep", String(i));
          return text.slice(0, 40) || `(ícone ${i})`;
        }, { i, skip: SKIP.source });
        if (!target) continue;
        done += 1;
        clicks += 1;
        try {
          await page.click(`[data-sweep="${i}"]`, { timeout: 2000 });
          await page.waitForTimeout(500);
          const issue = await page.evaluate(() => {
            const out = [];
            if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push("a página ficou mais larga que a tela");
            document.querySelectorAll(".MuiPopover-paper, .MuiMenu-paper, [role=menu], [role=listbox], .MuiDialog-paper").forEach((p) => {
              const r = p.getBoundingClientRect();
              if (r.width && (r.left < -1 || r.right > window.innerWidth + 1 || r.top < -1)) out.push(`menu ou janela fora da tela (${Math.round(r.left)},${Math.round(r.top)})`);
            });
            if (/Algo deu errado|Esta parte da tela falhou/.test(document.body.innerText) && document.querySelector("[data-error-boundary], .ui-boundary")) out.push("a parte da tela falhou");
            return out;
          });
          issue.forEach((t) => findings.push(`${device.padEnd(10)} ${route.padEnd(38)} depois de "${target}": ${t}`));
        } catch (e) { /* the screen changed under the click */ }
        await page.keyboard.press("Escape").catch(() => undefined);
        await page.waitForTimeout(150);
        if (!page.url().startsWith(BASE + route.split("?")[0])) { await page.goto(BASE + route); await page.waitForTimeout(1500); }
      }
    }
    await ctx.close();
  }
  await browser.close();
  const unique = [...new Set(findings)];
  console.log(`Varredura de cliques: ${ROUTES.length} telas, ${clicks} cliques, computador e celular.`);
  if (unique.length) { console.log(`\nAchados (${unique.length}):\n${unique.join("\n")}`); process.exit(1); }
  console.log("Nenhum problema: nenhum clique quebrou a tela.");
})().catch((e) => { console.error(e); process.exit(1); });
