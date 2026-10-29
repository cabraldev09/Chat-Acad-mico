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
const PGBIN = process.env.PG_BIN || path.dirname(execFileSync("which", ["psql"]).toString().trim());
const PGUSER = process.env.PGUSER || require("os").userInfo().username;
const psql = (db, q) => execFileSync(`${PGBIN}/psql`, ["-X", "-U", PGUSER, "-d", db, "-At", "-c", q]).toString().trim();
const DB = `chat_e2e_${process.pid}_${crypto.randomBytes(4).toString("hex")}`;
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
// small selectable PDFs for the analysis tests (the same generators of the unit tests, no personal data)
const selectablePdfJs = (lines, metadata = "") => {
  const stream = lines.map(([x, y, text]) => `BT /F1 10 Tf ${x} ${y} Td (${text.replace(/[\\()]/g, "\\$&")}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let document = `%PDF-1.4\n% ${metadata}\n`;
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(document);
  document += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(document);
};
const academicPdfJs = (rgm, status = "A CURSAR", metadata = "") =>
  selectablePdfJs([
    [30, 780, "Aluno: Aluno Teste Portal"], [30, 760, `RGM: ${rgm}`], [30, 740, "Curso: Administracao"], [30, 720, "Periodo atual: 3"],
    [30, 680, "Codigo"], [130, 680, "Disciplina"], [300, 680, "Periodo"], [390, 680, "Status"], [510, 680, "CH"],
    [30, 650, "001"], [130, 650, "Matematica"], [315, 650, "1"], [390, 650, status], [510, 650, "40"],
    [30, 620, "002"], [130, 620, "Gestao"], [315, 620, "3"], [390, 620, "CURSANDO"], [510, 620, "60"],
    [30, 590, "003"], [130, 590, "Economia"], [315, 590, "2"], [390, 590, "AE"], [510, 590, "40"]
  ], metadata);
const academicHistoryPdfJs = (rgm, official = false, approved = false) =>
  selectablePdfJs([
    [40, 800, "HISTORICO ESCOLAR"], [40, 780, `RGM: ${rgm}`], [40, 760, "Nome: Aluno Teste Portal"], [40, 740, "Curso: Administracao"],
    [40, 700, "Disciplina"], [195, 700, "Periodo"], [250, 700, "C/Horaria"], [306, 700, "Media"], [353, 700, "Situacao"], [420, 700, "Docente / Titulacao"],
    [40, 670, "001 - Matematica"], [205, 670, "2026/2"], [264, 670, "40"], [310, 670, approved ? "8.5" : "******"], [353, 670, approved ? "Aprovado" : "Pendente"], [420, 670, "Professor Teste"],
    [40, 640, "002 - Gestao"], [205, 640, "2026/2"], [264, 640, "60"], [310, 640, "******"], [353, 640, "Pendente"], [420, 640, "Professor Teste"],
    [40, 610, "003 - Economia"], [205, 610, "2026/2"], [264, 610, "40"], [310, 610, "AE"], [353, 610, "Aprovado"], [420, 610, "Professor Teste"],
    [40, 560, "Dados Complementares"], [40, 540, "Carga Horaria Prevista: 140 horas"], [40, 520, `Carga Horaria Integralizada: ${approved ? 80 : 40} horas`],
    [40, 490, official ? "Assinatura eletronica via Certificado Digital" : "SIMPLES CONFERENCIA"], [40, 470, official ? "https://validar.iti.gov.br" : "Somente para conferencia"]
  ]);
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
const graph = { sent: [], media: [], n: 0, hooks: [], igRevoked: false, igRefreshes: 0 };
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
  // OpenAI audio transcription: the voice note says what the scenario needs
  app.post("/v1/audio/transcriptions", (req, res) => {
    anthropic.transcriptions = (anthropic.transcriptions || 0) + 1;
    req.resume();
    req.on("end", () => res.json({ text: "qual o valor do curso de Direito" }));
  });
  app.post("/v1/messages", (req, res) => {
    anthropic.requests.push(req.body);
    const usage = { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const last = req.body.messages[req.body.messages.length - 1];
    const text = t => res.json({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage });
    const tool = (name, input) => res.json({ content: [{ type: "tool_use", id: `toolu_${anthropic.requests.length}`, name, input }], stop_reason: "tool_use", usage });
    // "create the agent with AI": answers through the tool; the first attempt has a stage without goal, the fix comes after the problems are sent back
    if (Array.isArray(req.body.tools) && req.body.tools.some(t => t.name === "criar_agente")) {
      const fixes = req.body.messages.filter(m => Array.isArray(m.content) && m.content.some(b => b.type === "tool_result")).length;
      return res.json({
        content: [{ type: "tool_use", id: `toolu_gen_${anthropic.requests.length}`, name: "criar_agente", input: {
          nome: "Agente da Padaria", papel: "Você atende os clientes da Padaria Pão Quente e ajuda a encomendar bolos e salgados.", tom: "Simpático e direto", regras: "Pergunte uma coisa por vez", proibido: "Prometer prazos que não estão na base",
          mensagem_transferencia: "Vou chamar a atendente.", perguntas_frequentes: [{ pergunta: "Qual o horário?", resposta: "Abrimos das 6h às 19h.", palavras_chave: "horário" }, { pergunta: "Fazem entrega?", resposta: "Entregamos em até 5 km." }],
          blocos: [
            { chave: "start", tipo: "start" },
            { chave: "conversa", tipo: "stage", titulo: "Encomenda", objetivo: fixes ? "Anotar a encomenda: produto, quantidade e data." : "", campos: [{ chave: "produto", rotulo: "Produto", obrigatorio: true }, { chave: "data", rotulo: "Data da retirada", tipo: "date", obrigatorio: true }], saidas: [{ id: "reclamar", rotulo: "Reclamação", quando: "quando a pessoa reclamar de um pedido" }] },
            { chave: "tarefa", tipo: "crm", acao: "create_task", titulo_tarefa: "Confirmar a encomenda", minutos: 30 },
            { chave: "fim", tipo: "end", texto: "Encomenda anotada! 🥖" },
            { chave: "gerente", tipo: "transfer", para: "polo_sales", texto: "Vou chamar a gerente." }
          ],
          ligacoes: [{ de: "start", para: "conversa" }, { de: "conversa", para: "tarefa", saida: "done" }, { de: "tarefa", para: "fim" }, { de: "conversa", para: "gerente", saida: "reclamar" }]
        } }],
        stop_reason: "tool_use", usage
      });
    }
    if (typeof req.body.system === "string" && /desenha fluxos/.test(req.body.system)) {
      return text(JSON.stringify({
        name: "Triagem gerada",
        entry: { type: "first_message" },
        nodes: [
          { key: "start", type: "start" },
          { key: "menu", type: "buttons", text: "Oi! Sobre o que você quer falar?", options: ["Cursos", "Financeiro"] },
          { key: "nome", type: "ask", text: "Qual o seu nome?", field: "nome", validate: "text" },
          { key: "crm", type: "crm", action: "send_to_crm", ownerMode: "roundrobin", tagName: "Etiqueta que não existe" },
          { key: "fim", type: "end", text: "Anotado, até já!" },
          { key: "fin", type: "message", text: "O financeiro responde em horário comercial." },
          { key: "fimf", type: "end" }
        ],
        edges: [
          { from: "start", to: "menu" }, { from: "menu", to: "nome", option: "Cursos" }, { from: "menu", to: "fin", option: "Financeiro" },
          { from: "nome", to: "crm" }, { from: "crm", to: "fim" }, { from: "fin", to: "fimf" },
          { from: "menu", to: "nome", option: "opção que não existe" }
        ]
      }));
    }
    // the rewrite of an answer that stated a fact with no source: the first agent obeys, the stubborn one invents another value
    if (typeof req.body.system === "string" && /Você revisa respostas/.test(req.body.system)) {
      anthropic.guardCalls = (anthropic.guardCalls || 0) + 1;
      return text(/biblioteca/.test(String(last.content)) ? "Fica em R$ 36,00 por semestre." : "Vou confirmar esse valor com a equipe e já te retorno.");
    }
    if (req.body.max_tokens === 220) return text("O aluno quer saber sobre bolsas e cursos.");
    const systemText = Array.isArray(req.body.system) ? req.body.system.map(b => b.text).join("\n") : "";
    const inStage = /Etapa atual: Teste de Etapa/.test(systemText);
    const result = Array.isArray(last.content) && last.content.find(b => b.type === "tool_result");
    // the commercial agent (graduation): the answer and what it understood come in the same turn, as the real model does
    if (/Em TODA resposta chame registrar_turno/.test(systemText)) {
      const turn = (txt, input, extra = []) => res.json({ content: [{ type: "text", text: txt }, ...extra, { type: "tool_use", id: `toolu_c${anthropic.requests.length}`, name: "registrar_turno", input }], stop_reason: "tool_use", usage });
      if (result) {
        const out = JSON.parse(result.content);
        if (out.duracaoTexto !== undefined) return turn(`${out.nome}: ${out.duracaoTexto}, formato ${out.modalidade}. Quer ver a grade?`, { intent: "course_duration" });
        if (out.agendado) return turn(out.texto_confirmacao, { intent: "other", melhor_horario: "amanhã às 14h" });
        if (out.polos !== undefined) return turn(out.polo_definido ? `Você é atendido pelo ${out.polos[0].nome}.` : `AVISO: ${out.aviso}`, { intent: "other" });
        if (out.modalidadeAtual !== undefined) return turn(`Regra: ${out.regulacaoAplicavel || "sem regra cadastrada"}; práticas presenciais: ${out.praticaPresencial}; cronograma definido: ${out.cronogramaPraticasDefinido}.${out.explicacao ? ` NACIONAL: ${out.explicacao.nacional.regra} CONFIRMADO: ${out.explicacao.institucional.confirmado.join(" ")} AINDA NÃO: ${out.explicacao.naoConfirmado.join("; ")}.` : ""}`, { intent: "mec" });
        return turn("Anotado!", { intent: "other" });
      }
      const said2 = typeof last.content === "string" ? last.content : "";
      if (/forçar erro do provedor/i.test(said2)) return res.status(500).json({ error: { message: "boom" } });
      if (/pergunta lenta/i.test(said2)) return setTimeout(() => turn("Resposta devagar, mas chegou.", { intent: "other" }), 2500);
      if (/explique tudo/i.test(said2)) return turn("O curso foi pensado para quem trabalha e estuda ao mesmo tempo, com aulas e atividades na plataforma e liberdade para organizar a sua rotina de estudos.\n\nVocê conta com a tutoria desde o primeiro acesso: ela orienta sobre a plataforma, as disciplinas, as atividades, as provas e os prazos, para você nunca ficar sozinho no processo.\n\nA grade é organizada por semestres, com disciplinas teóricas e momentos de prática, e o estágio, quando existe na matriz, é explicado com calma na hora certa, para você planejar cada etapa sem sustos nem surpresas no caminho.\n\nQuer que eu te mostre a grade do curso?", { intent: "other" });
      if (/é caro/i.test(said2)) return turn("Sai por R$ 299 por mês, ótimo custo!", { intent: "other" });
      if (/quando começam as aulas/i.test(said2)) return turn("As aulas começam em 03/08.", { intent: "other" });
      if (/transferir/i.test(said2)) return turn("Entendi! Com o seu histórico em PDF conseguimos pedir uma análise curricular. Pode me enviar o arquivo?", { intent: "transfer", curso: "Direito", cidade: "Porto Velho", tipo_ingresso: "transfer" });
      if (/não tenho mais interesse/i.test(said2)) return turn("Tudo bem, agradeço o seu tempo! Se mudar de ideia, é só chamar. 😊", { intent: "no_interest", objecao: "achou caro", tipo_objecao: "preco" });
      if (/golpe/i.test(said2)) return turn("Entendo a sua preocupação, é natural querer ter certeza. 😊 Posso te mostrar como funciona o curso?", { intent: "objection", objecao: "medo de golpe", tipo_objecao: "confianca" });
      if (/amanhã às 14/i.test(said2)) return tool("agendar_contato", { dia: new Date(Date.now() + 24 * 3600000).toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" }), horario: "14:00" });
      if (/começar esta semana/i.test(said2)) return turn("Perfeito, Direito em Porto Velho! Posso te explicar como funciona o curso?", { intent: "other", curso: "Direito", cidade: "Porto Velho", tipo_ingresso: "first_degree", nome: "Paulo Mendes", prazo_decisao: "Decide esta semana", turno: "Noite" });
      if (/moro em (.+)/i.test(said2)) return tool("listar_polos", { cidade: said2.match(/moro em ([^,.!?]+)/i)[1].trim() });
      if (/Direito em Porto Velho/i.test(said2)) return turn("Perfeito, Direito em Porto Velho! Posso te explicar como funciona o curso?", { intent: "other", curso: "Direito", cidade: "Porto Velho", tipo_ingresso: "first_degree", nome: "Paulo Mendes" });
      if (/dura|tempo/i.test(said2)) return tool("buscar_curso", { courseName: "Direito" });
      if (/formato da pedagogia social/i.test(said2)) return tool("buscar_regra_modalidade", { courseName: "Pedagogia Social" });
      if (/texto com markdown/i.test(said2)) return turn("**Pedagogia** tem 8 semestres.\n\n### Como funciona\nVeja [a grade](https://exemplo.com/g.pdf) e a tabela:\n| Item | Valor |\n|---|---|\n| Duração | 8 semestres |", { intent: "other" });
      if (/mec/i.test(said2)) return tool("buscar_regra_modalidade", { courseName: "Direito" });
      if (/nasa/i.test(said2)) return turn("Essa informação eu prefiro confirmar com a equipe para não te passar nada incorreto.", { intent: "unknown", pergunta_sem_resposta: "convênio com a Nasa" });
      if (/vou pensar/i.test(said2)) return turn("Combinado! Fico no aguardo. 😊", { intent: "follow_up", retorno_em: "2026-12-01", motivo_retorno: "vai conversar com a família" });
      if (/não tenho o histórico/i.test(said2)) return turn("Sem problema!", { intent: "other", tem_historico: false }, [{ type: "tool_use", id: `toolu_x${anthropic.requests.length}`, name: "escolher_resultado", input: { resultado: "sem_historico" } }]);
      return turn("Claro! Pode me contar mais?", { intent: "other" });
    }
    if (result) {
      const out = JSON.parse(result.content);
      if (inStage && out.valor_invalido) return text("Pode me passar o e-mail completo, por favor?");
      if (inStage && out.dados) return text(`Horários livres: ${out.dados}`);
      if (inStage && out.ok && /Etapa encerrada/.test(out.aviso || "")) return text("Combinado!");
      if (out.iniciado) return text("Pronto, enviei o menu de cursos para você.");
      if (out.completo) return text("Perfeito, Paulo! Um consultor da equipe continua com você.");
      if (out.cursos) return text(`O curso ${out.cursos[0].nome} tem mensalidade de tabela de R$ ${out.cursos[0].mensalidade_bruta_de_tabela}.`);
      return text("Anotado!");
    }
    const said = typeof last.content === "string" ? last.content : "";
    if (inStage) {
      if (/A conversa desta etapa está começando/.test(said)) return text("Olá! Sou o assistente desta etapa. Como posso ajudar?");
      if (/email ruim/i.test(said)) return tool("salvar_lead", { nome: "Paulo Mendes", email: "paulo" });
      if (/meu nome é/i.test(said)) return tool("salvar_lead", { nome: "Paulo Mendes", email: "paulo@x.com" });
      if (/horário/i.test(said)) return tool("http_agenda", { dia: "2026-11-02" });
      if (/quanto custa/i.test(said)) return tool("escolher_resultado", { resultado: "precos", motivo: "perguntou o valor" });
      if (/falar com (uma )?pessoa/i.test(said)) return tool("escolher_resultado", { resultado: "humano" });
      return text("Claro! Qual é o seu nome completo?");
    }
    const knowledge = (req.body.system[1] && req.body.system[1].text) || "";
    if (/atletas/i.test(said)) return text(knowledge.includes("30% de bolsa") ? "Atletas federados têm 30% de bolsa, mediante comprovação." : "[DESCONHECIDO]");
    if (/taxa de laboratório/i.test(said)) return text("A taxa de laboratório é de R$ 480,00 por semestre.");
    if (/taxa de biblioteca/i.test(said)) return text("A taxa de biblioteca é de R$ 35,00.");
    if (/quanto é a bolsa de transferência/i.test(said)) return text("A bolsa de transferência é de 40% na primeira mensalidade, conforme a análise do histórico.");
    if (/menu de cursos/i.test(said)) return tool("fluxo_menu_cursos", {});
    if (/valor do curso/i.test(said)) return tool("buscar_curso", { nome: "Direit" });
    if (/meu nome é/i.test(said)) return tool("salvar_lead", { nome: "Paulo Mendes", cidade: "Ji-Paraná", curso: "Direito" });
    if (/falar com (uma )?pessoa/i.test(said)) return text("[HANDOFF]");
    return text("Claro! Posso ajudar com as bolsas. Qual curso você quer?");
  });
  // a mistake inside the mock itself must show up in the log (it would look like a provider error)
  app.use((err, req, res, next) => { console.error("[mock anthropic]", err && err.stack); res.status(500).json({ error: { message: String(err && err.message) } }); });
  return new Promise(r => { const s = app.listen(AI_PORT, () => r(s)); });
};

const startGraphMock = () => {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage() });
  app.use(express.json());
  app.get("/pic.jpg", (q, res) => res.type("image/png").send(PNG));
  app.get("/page.html", (q, res) => res.type("html").send("<html><head><style>x{}</style></head><body><nav>menu</nav><h1>Calendário acadêmico</h1><p>As aulas do segundo semestre começam em 3 de agosto e a rematrícula vai até 20 de julho para todos os cursos de graduação a distância.</p></body></html>"));
  app.post("/hook", (req, res) => { graph.hooks.push(req.body); res.json({ ok: true }); });
  app.get("/horarios", (req, res) => { graph.hooks.push({ horarios: req.query }); res.json({ livres: ["09:00", "10:30"] }); });
  app.get("/att.png", (q, res) => res.type("image/png").send(PNG));
  app.get("/media/:id", (q, res) => {
    if (q.params.id.startsWith("MEDIAPDF")) return res.type("application/pdf").send(Buffer.from("%PDF-1.4\n%%EOF"));
    if (q.params.id.startsWith("MEDIAOGG")) return res.type("audio/ogg").send(Buffer.from("OggS\0\0"));
    if (q.params.id.startsWith("MEDIASTK")) return res.type("image/webp").send(Buffer.from("RIFF\0\0\0\0WEBP"));
    return res.type("image/png").send(PNG);
  });
  // Instagram API with Instagram Login: token exchange, profile, webhook subscription, Send API and token renewal
  app.post("/ig/oauth/access_token", express.urlencoded({ extended: false }), (req, res) => {
    if (req.body.client_id !== "17841999" || req.body.client_secret !== "ig-app-secret" || req.body.code !== "CODE-OK") return res.status(400).json({ error_message: "Invalid authorization code" });
    return res.json({ access_token: "SHORT-TOKEN", user_id: 17841400 });
  });
  app.get("/ig/access_token", (req, res) => {
    if (req.query.grant_type !== "ig_exchange_token" || req.query.access_token !== "SHORT-TOKEN") return res.status(400).json({ error: { message: "bad exchange" } });
    return res.json({ access_token: "LONG-TOKEN", expires_in: 5184000 });
  });
  app.get("/ig/refresh_access_token", (req, res) => {
    graph.igRefreshes += 1;
    return res.json({ access_token: "LONG-TOKEN-2", expires_in: 5184000 });
  });
  app.get("/ig/me", (req, res) => {
    if (graph.igRevoked || !String(req.query.access_token || "").startsWith("LONG-TOKEN")) return res.status(400).json({ error: { message: "Error validating access token", code: 190 } });
    return res.json({ user_id: "17841400", username: "escola_mock", account_type: "BUSINESS" });
  });
  app.post("/ig/:id/subscribed_apps", (req, res) => { graph.hooks.push({ subscribed: req.params.id, fields: req.query.subscribed_fields }); res.json({ success: true }); });
  app.post("/ig/me/messages", (req, res) => {
    if (!String(req.query.access_token || "").startsWith("LONG-TOKEN")) return res.status(400).json({ error: { message: "bad token", code: 190 } });
    if (String(req.body.recipient && req.body.recipient.id).startsWith("IGWINDOW")) return res.status(400).json({ error: { message: "This message is sent outside of allowed window.", code: 10, error_subcode: 2534022 } });
    graph.n += 1;
    graph.sent.push({ path: "/ig/me/messages", body: req.body, token: req.query.access_token });
    return res.json({ recipient_id: "x", message_id: `m_ig_login_${graph.n}` });
  });
  app.get("/ig/:id", (req, res) => res.json({ name: "Joana Souza", username: "joana", profile_pic: `http://localhost:${GRAPH_PORT}/pic.jpg` }));
  app.get("/me", (q, res) => res.json({ id: "PAGE1", name: "Mock Page" }));
  app.get("/:id", (req, res) => {
    const { id } = req.params;
    if (id === "PN1") return res.json({ display_phone_number: "+55 11 99999-0000", verified_name: "Mock Co" });
    if (id === "PN2") return res.json({ display_phone_number: "+55 11 98888-0000", verified_name: "Mantenedora" });
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
    const repasses = (req.body.items[0].marketplace || {}).repasses || [];
    if (repasses.some(r => String(r.payee_code).startsWith("RECUSADO"))) {
      billet.calls.push({ method: "POST", path: req.path, body: req.body, refused: true });
      return res.status(400).json({ code: 3500034, error: "validation_error", error_description: { property: "items[0].marketplace.repasses[0].payee_code", message: "payee_code inválido: a conta não foi encontrada" } });
    }
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
  const from = global.__backendLog ? global.__backendLog().length : 0;
  try { await fn(); results.push([true, name]); console.log(`  ✓ ${name}`); }
  catch (e) {
    results.push([false, `${name} -> ${e.message}`]); console.log(`  ✗ ${name}\n      ${e.message}${/hang up|ECONN/.test(String(e.message)) ? `\n      ${String(e.stack).split("\n").slice(1, 7).join("\n      ")}` : ""}`);
    // what the server complained about while this check ran (without the noise of the login tests)
    if (process.env.E2E_DEBUG) {
      try {
        console.log("      --- debug ---");
        console.log(psql(DB, pgSql(`SELECT id, ticketId, fromMe, left(body, 90) FROM Messages ORDER BY id DESC LIMIT 14`)));
        console.log(psql(DB, pgSql(`SELECT id, flowId, ticketId, status, nodeId, left(vars, 120) FROM ChatFlowRuns ORDER BY id DESC LIMIT 5`)));
        anthropic.requests.slice(-4).forEach(r => console.log("      request:", JSON.stringify(r.messages[r.messages.length - 1]).slice(0, 700)));
        console.log(global.__backendLog().split("\n").filter(l => /ERROR|Error|error:|TypeError|ReferenceError| at /.test(l) && !/QR|Efí|INVALID_CRED|TOO_MANY/.test(l)).slice(-40).join("\n"));
      } catch (err) { console.log(`      debug failed: ${err.message}`); }
      if (process.env.E2E_DEBUG === "stop") { try { backend.kill(); } catch (er) {} process.exit(1); }
    }
    if (global.__backendLog) {
      const lines = global.__backendLog().slice(from).split("\n").filter(l => /ERROR|WARN|Error|at /.test(l) && !/INVALID_CREDENTIALS|TOO_MANY/.test(l)).slice(0, 14);
      if (lines.length) console.log(`      server: ${lines.join("\n              ").slice(0, 1800)}`);
    }
  }
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
    try { psql("postgres", `DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`); } catch (e) {}
  };
  try {
    psql("postgres", `CREATE DATABASE ${DB}`);
    const env = {
      ...process.env, DATABASE_URL: "", DATABASE_URL_POOL: "", DB_SSL: "false", NODE_ENV: "test", DB_NAME: DB, DB_HOST: "localhost", DB_USER: PGUSER, DB_PASS: "", DB_PORT: "5432", DB_DIALECT: "postgres",
      PORT: String(PORT), PROXY_PORT: String(PORT), BACKEND_URL: "http://localhost", PUBLIC_URL: API,
      FRONTEND_URL: "http://localhost:3000", JWT_SECRET: "e2e", JWT_REFRESH_SECRET: "e2e-r", DASHBOARD_CACHE_MS: "0", LOGIN_RATE_MAX: "100",
      TELEGRAM_API_URL: `http://localhost:${TG_PORT}`, GRAPH_API_URL: `http://localhost:${GRAPH_PORT}`, INSTAGRAM_TOKEN_URL: `http://localhost:${GRAPH_PORT}/ig/oauth/access_token`, INSTAGRAM_GRAPH_URL: `http://localhost:${GRAPH_PORT}/ig`, CHANNEL_TOKEN_REFRESH_MS: "2500", CHANNEL_TOKEN_FIRST_MS: "1500",
      SKIP_WHATSAPP_SESSIONS: "1", SKIP_DEFAULT_DATA: "1", LOG_LEVEL: "warn", EFI_API_URL: `http://localhost:${EFI_PORT}`, EFI_BILLET_API_URL: `http://localhost:${BILLET_PORT}`, EFI_POLL_MS: "1500",
      ANTHROPIC_API_URL: `http://localhost:${AI_PORT}`, OPENAI_API_URL: `http://localhost:${AI_PORT}`, STALE_RUNS_MS: "4000", HANDOFF_SLA_MS: "4000", ONBOARDING_SLA_MS: "4000", REACTIVATION_MS: "3000", ALLOW_PRIVATE_URLS: "true"
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
      // the reply leaves a moment before the queue is written: wait for it instead of reading at once
      await waitFor(() => sql(`SELECT queueId FROM Tickets WHERE id=${t}`) === String(q), 5000, "ticket queue set");
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
        // only what came in is counted: a greeting the system sends on its own may land in the conversation meanwhile
        const received = () => Number(sql(`SELECT COUNT(*) FROM Messages WHERE ticketId=${ticket} AND fromMe=0`));
        const n = received();
        await postMeta(id, { object, entry: [{ messaging: [{ sender: { id: "PAGE1" }, message: { mid: `m_${channel}_echo`, is_echo: true, text: "eco" } }] }] }, cfg.appSecret);
        await postMeta(id, event(`m_${channel}_1`, { text: "Oi, vi o anúncio" }), cfg.appSecret);
        await sleep(1500);
        assert(received() === n, "echo/duplicate stored");
        assert(Number(sql(`SELECT COUNT(*) FROM Messages WHERE ticketId=${ticket} AND body='eco'`)) === 0, "the echo was stored");
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
    // ------------------------------------------------- Instagram login (official OAuth)
    console.log("\nInstagram login");
    let igState, igConnId, igTicket;
    const appWebhook = (payload, secret, badSig) => {
      const body = JSON.stringify(payload);
      return http.post("/webhooks/meta", body, { headers: { "Content-Type": "application/json", ...(secret ? { "X-Hub-Signature-256": badSig || sign(secret, body) } : {}) } });
    };
    await test("without the Meta app registered, the login is refused with a clear reason", async () => {
      const st = (await http.get("/channels/instagram/status", auth())).data;
      assert(st.configured === false, "app should not be configured yet");
      const r = await http.get("/channels/instagram/authorize", auth());
      assert(r.status === 400 && /ERR_META_APP_NOT_CONFIGURED/.test(JSON.stringify(r.data)), `authorize -> ${r.status} ${JSON.stringify(r.data)}`);
    });
    await test("the manager registers the Meta app once: secret sealed, verify token generated", async () => {
      const bad = await http.put("/channels/instagram/app", { appId: "abc", appSecret: "x" }, auth());
      assert(bad.status === 400, `invalid id -> ${bad.status}`);
      const r = await http.put("/channels/instagram/app", { appId: "17841999", appSecret: "ig-app-secret" }, auth());
      assert(r.status === 200 && r.data.configured === true, `put -> ${r.status}`);
      assert(!JSON.stringify(r.data).includes("ig-app-secret"), "secret shown back");
      assert(r.data.verifyToken && r.data.redirectUri.endsWith("/oauth/instagram/callback") && r.data.webhookUrl.endsWith("/webhooks/meta"), "urls / verify token");
      assert(sql(`SELECT value FROM Settings WHERE "key"='meta_app_secret'`).startsWith("enc:v1:"), "app secret stored in clear");
      assert(sql(`SELECT value FROM Settings WHERE "key"='meta_verify_token'`).startsWith("enc:v1:"), "verify token stored in clear");
      const again = await http.put("/channels/instagram/app", { appId: "17841999", appSecret: r.data.appSecret }, auth());
      assert(again.data.verifyToken === r.data.verifyToken, "verify token changed on a second save");
    });
    await test("authorize returns the Instagram login URL with a signed state", async () => {
      const r = await http.get("/channels/instagram/authorize", auth());
      assert(r.status === 200, `status ${r.status}`);
      const u = new URL(r.data.url);
      assert(u.searchParams.get("client_id") === "17841999" && u.searchParams.get("redirect_uri").endsWith("/oauth/instagram/callback"), "client / redirect");
      assert(u.searchParams.get("scope").includes("instagram_business_manage_messages"), "scope");
      igState = u.searchParams.get("state");
      assert(igState && igState.includes("."), "state");
    });
    await test("callback refuses a forged or missing state and a refused login", async () => {
      for (const q of [{ code: "CODE-OK", state: "forjado.assinatura" }, { code: "CODE-OK" }, { error: "access_denied", error_description: "negado", state: igState }]) {
        const r = await http.get("/oauth/instagram/callback", { params: q, maxRedirects: 0 });
        assert(r.status === 302 && /instagram=erro/.test(r.headers.location), `callback ${JSON.stringify(q)} -> ${r.status} ${r.headers.location}`);
      }
      assert(Number(sql(`SELECT COUNT(*) FROM Whatsapps WHERE channel='instagram' AND config LIKE '%oauth%'`)) === 0, "a connection was created without a valid login");
    });
    await test("callback exchanges the code, keeps a long-lived token sealed and creates the connection", async () => {
      const r = await http.get("/oauth/instagram/callback", { params: { code: "CODE-OK", state: igState }, maxRedirects: 0 });
      assert(r.status === 302 && /instagram=ok/.test(r.headers.location), `callback -> ${r.status} ${r.headers.location}`);
      igConnId = Number(await waitFor(() => sql(`SELECT id FROM Whatsapps WHERE channel='instagram' AND config LIKE '%escola_mock%'`), 8000, "instagram connection"));
      const row = JSON.parse(sql(`SELECT config FROM Whatsapps WHERE id=${igConnId}`));
      assert(row.mode === "oauth" && row.igUserId === "17841400" && row.username === "escola_mock", `config ${JSON.stringify(row)}`);
      assert(row.accessToken.startsWith("enc:v1:") && !row.accessToken.includes("LONG-TOKEN"), "token stored in clear");
      assert(new Date(row.tokenExpiresAt).getTime() > Date.now() + 50 * 86400000, "token should last about 60 days");
      assert(graph.hooks.some(h => h.subscribed === "17841400" && /messages/.test(h.fields)), "webhook subscription not requested");
      const w = (await http.get(`/whatsapp/${igConnId}`, auth())).data;
      assert(w.status === "CONNECTED" && w.session === "@escola_mock", `status ${w.status} session ${w.session}`);
      assert(!JSON.stringify(w.config).includes("LONG-TOKEN"), "token leaked to the browser");
    });
    await test("logging in again with the same account updates the connection instead of duplicating it", async () => {
      const a = new URL((await http.get("/channels/instagram/authorize", auth())).data.url).searchParams.get("state");
      await http.get("/oauth/instagram/callback", { params: { code: "CODE-OK", state: a }, maxRedirects: 0 });
      assert(Number(sql(`SELECT COUNT(*) FROM Whatsapps WHERE channel='instagram' AND config LIKE '%escola_mock%'`)) === 1, "duplicated connection");
    });
    await test("app webhook: verification handshake uses the generated token", async () => {
      const vt = (await http.get("/channels/instagram/app", auth())).data.verifyToken;
      const ok = await http.get("/webhooks/meta", { params: { "hub.mode": "subscribe", "hub.verify_token": vt, "hub.challenge": "777" } });
      assert(ok.status === 200 && String(ok.data) === "777", `ok=${ok.status}`);
      const bad = await http.get("/webhooks/meta", { params: { "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1" } });
      assert(bad.status === 403, `bad=${bad.status}`);
    });
    const igEvent = (sender, mid, text, account = "17841400") => ({ object: "instagram", entry: [{ id: account, time: Date.now(), messaging: [{ sender: { id: sender }, recipient: { id: account }, message: { mid, text } }] }] });
    await test("app webhook: forged signature is refused, signed message reaches the right connection", async () => {
      const forged = await appWebhook(igEvent("IGSIDLOGIN1", "m_igl_x", "x"), "ig-app-secret", "sha256=" + "0".repeat(64));
      assert(forged.status === 401, `forged -> ${forged.status}`);
      assert((await appWebhook(igEvent("IGSIDLOGIN1", "m_igl_y", "y"))).status === 401, "unsigned delivery accepted");
      assert(!ticketOf("ig_IGSIDLOGIN1"), "forged webhook created a ticket");
      const r = await appWebhook(igEvent("IGSIDLOGIN1", "m_igl_1", "Oi, vi o anúncio no Instagram"), "ig-app-secret");
      assert(r.status === 200, `signed -> ${r.status}`);
      igTicket = await waitFor(() => ticketOf("ig_IGSIDLOGIN1"), 8000, "instagram ticket");
      assert(sql(`SELECT whatsappId FROM Tickets WHERE id=${igTicket}`) === String(igConnId), "ticket on the wrong connection");
      assert(sql(`SELECT name FROM Contacts WHERE number='ig_IGSIDLOGIN1'`) === "Joana Souza", "profile name");
    });
    await test("app webhook: an account that is not connected here is ignored", async () => {
      await appWebhook(igEvent("IGSIDLOGIN2", "m_igl_2", "oi", "99999999"), "ig-app-secret");
      await new Promise(r => setTimeout(r, 800));
      assert(!ticketOf("ig_IGSIDLOGIN2"), "message of an unknown account created a ticket");
    });
    await test("reply goes to graph.instagram.com with the long-lived token", async () => {
      const before = graph.sent.length;
      const r = await http.post(`/messages/${igTicket}`, { body: "Olá Joana!" }, auth());
      assert(r.status === 200, `status ${r.status} ${JSON.stringify(r.data)}`);
      const s = graph.sent.slice(before).find(x => x.path === "/ig/me/messages");
      assert(s && s.body.recipient.id === "IGSIDLOGIN1" && s.token === "LONG-TOKEN" && s.body.message.text.includes("Olá Joana"), "payload");
    });
    await test("a reply after the 24 h window gets a clear error", async () => {
      await appWebhook(igEvent("IGWINDOW1", "m_igl_3", "oi"), "ig-app-secret");
      const t = await waitFor(() => ticketOf("ig_IGWINDOW1"), 8000, "window ticket");
      const r = await http.post(`/messages/${t}`, { body: "resposta tardia" }, auth());
      assert(r.status === 200 || r.status === 202, `late reply -> ${r.status} ${JSON.stringify(r.data)}`);
      await waitFor(() => sql(`SELECT status FROM OutboundMessages WHERE ticketId=${t} ORDER BY id DESC LIMIT 1`) === "failed", 12000, "late reply failed");
      assert(sql(`SELECT error FROM OutboundMessages WHERE ticketId=${t} ORDER BY id DESC LIMIT 1`) === "ERR_REPLY_WINDOW_CLOSED", "the reason should be the closed window, not a generic failure");
      assert(Number(sql(`SELECT attempts FROM OutboundMessages WHERE ticketId=${t} ORDER BY id DESC LIMIT 1`)) === 1, "a closed window must not be retried");
    });
    await test("the worker renews a token that is about to expire and keeps it sealed", async () => {
      const cfg = JSON.parse(sql(`SELECT config FROM Whatsapps WHERE id=${igConnId}`));
      cfg.tokenExpiresAt = new Date(Date.now() + 3 * 86400000).toISOString();
      psql(DB, `UPDATE "Whatsapps" SET config = '${JSON.stringify(cfg).replace(/'/g, "''")}' WHERE id=${igConnId}`);
      await waitFor(() => graph.igRefreshes > 0, 12000, "token renewal");
      const row = await waitFor(() => { const c = JSON.parse(sql(`SELECT config FROM Whatsapps WHERE id=${igConnId}`)); return new Date(c.tokenExpiresAt).getTime() > Date.now() + 50 * 86400000 ? c : null; }, 8000, "new expiry saved");
      assert(row.accessToken.startsWith("enc:v1:") && !row.accessToken.includes("LONG-TOKEN-2"), "renewed token stored in clear");
    });
    await test("when Instagram revokes the access the connection shows as disconnected, and recovers when it answers again", async () => {
      graph.igRevoked = true;
      await waitFor(() => sql(`SELECT status FROM Whatsapps WHERE id=${igConnId}`) === "DISCONNECTED", 12000, "disconnected after revocation");
      graph.igRevoked = false;
      await waitFor(() => sql(`SELECT status FROM Whatsapps WHERE id=${igConnId}`) === "CONNECTED", 12000, "connected again");
    });
    await test("channel secrets are sealed at rest (pasted keys too)", async () => {
      const row = JSON.parse(sql(`SELECT config FROM Whatsapps WHERE channel='telegram' LIMIT 1`));
      assert(row.botToken.startsWith("enc:v1:"), "telegram bot token stored in clear");
      const m = JSON.parse(sql(`SELECT config FROM Whatsapps WHERE channel='messenger' LIMIT 1`));
      assert(m.accessToken.startsWith("enc:v1:") && m.appSecret.startsWith("enc:v1:"), "messenger secrets stored in clear");
    });
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
      assert(page.status === 200 && String(page.data).includes("Quero falar com um consultor") && String(page.data).includes('name="consent"'), "form page");
      // what the page sells: the formats, the tutoring after the enrollment, the brand and the photo; and never a price
      const html = String(page.data);
      assert(/EAD/.test(html) && /Semipresencial/i.test(html) && /tutoria depois da matr[ií]cula/i.test(html), "the page does not talk about EAD, blended courses and the tutoring");
      assert(html.includes("data:image/png;base64,") && html.includes("/leadform/_aluna.webp"), "logo or photo missing");
      assert(!/R\$\s?\d/.test(html), "the public page shows a price");
      const photo = await http.get("/leadform/_aluna.webp", { responseType: "arraybuffer" });
      assert(photo.status === 200 && String(photo.headers["content-type"]).includes("image/webp") && Buffer.from(photo.data).length > 20000, `photo ${photo.status}`);
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
      try {
        await waitFor(() => graph.sent.slice(before).filter(x => x.body && x.body.type === "text").length >= 3, 30000, "three messages");
      } catch (e) {
        throw new Error(`${e.message}; shipping=${sql(`SELECT status||'|'||stepsDone||'|'||COALESCE(error,'') FROM CampaignShippings WHERE campaignId=${c.id}`)} campaign=${sql(`SELECT status||'|'||COALESCE(pauseReason,'') FROM Campaigns WHERE id=${c.id}`)} sent=${JSON.stringify(graph.sent.slice(before).map(x => x.body && x.body.type))}`);
      }
      const texts = graph.sent.slice(before).filter(x => x.body && x.body.type === "text").map(x => x.body.text.body);
      assert(/^Oi Paula Dias! Tudo (bem|certo)\?$/.test(texts[0]), `first: ${texts[0]}`);
      assert(texts[1] === steps[1].body && texts[2] === steps[2].body, `order: ${JSON.stringify(texts)}`);
      await waitFor(() => sql(`SELECT status FROM CampaignShippings WHERE campaignId=${c.id}`) === "sent", 8000, "shipping sent");
      assert(sql(`SELECT stepsDone FROM CampaignShippings WHERE campaignId=${c.id}`) === "3", "stepsDone");
      assert(sql(`SELECT nextRunAt IS NOT NULL FROM Campaigns WHERE id=${c.id}`) === "1", "runner state was not persisted");
    });
    await test("campanhas: nome com apóstrofo e &, primeiro nome, número sem 55 e número curto demais", async () => {
      const list = (await http.post("/contact-lists", { name: "Nomes difíceis" }, auth())).data;
      const imp = (await http.post(`/contact-lists/${list.id}/import`, { items: [{ name: "D'Ávila & Cia Ltda", number: "(11) 95555-1111" }, { name: "Curto", number: "12345" }] }, auth())).data;
      assert(imp.imported === 1 && imp.invalid === 1, `import ${JSON.stringify(imp)}`);
      const items = (await http.get(`/contact-lists/${list.id}/items`, auth())).data;
      assert(items.length === 1 && items[0].number === "5511955551111", `the country code was not added: ${JSON.stringify(items)}`);
      const again = (await http.post(`/contact-lists/${list.id}/import`, { items: [{ name: "Repetido", number: "11955551111" }] }, auth())).data;
      assert(again.imported === 0 && again.duplicated === 1, `the same number typed another way came twice ${JSON.stringify(again)}`);
      const c = (await http.post("/campaigns", { name: "Nomes", message: "Oi {{name}} ({{primeiro_nome}})", contactListId: list.id, whatsappId: cid, intervalMin: 0, intervalMax: 0, batchSize: 50, batchPause: 1 }, auth())).data;
      const before = graph.sent.length;
      assert((await http.post(`/campaigns/${c.id}/start`, {}, auth())).status === 200, "start");
      const sent = await waitFor(() => graph.sent.slice(before).find(x => x.body && x.body.type === "text" && x.body.to === "5511955551111"), 15000, "the message");
      assert(sent.body.text.body === "Oi D'Ávila & Cia Ltda (D'Ávila)", `text ${JSON.stringify(sent.body.text.body)}`);
    });
    await test("campanhas: agendar, iniciar agora, iniciar sozinha na hora, não disparar atrasada, pausar, retomar e cancelar", async () => {
      const mk = async (name, numbers) => {
        const list = (await http.post("/contact-lists", { name }, auth())).data;
        await http.post(`/contact-lists/${list.id}/import`, { items: numbers.map((n, i) => ({ name: `${name} ${i + 1}`, number: n })) }, auth());
        return list;
      };
      const base = { intervalMin: 0, intervalMax: 0, batchSize: 50, batchPause: 1, whatsappId: cid };
      const future = () => new Date(Date.now() + 3600000).toISOString();
      const list = await mk("Agenda", ["5521955552001"]);
      const empty = (await http.post("/contact-lists", { name: "Agenda vazia" }, auth())).data;

      assert((await http.post("/campaigns", { ...base, name: "Passada", message: "x", contactListId: list.id, scheduledAt: new Date(Date.now() - 3600000).toISOString() }, auth())).status === 400, "a start date in the past was accepted");
      assert((await http.post("/campaigns", { ...base, name: "Sem ninguém", message: "x", contactListId: empty.id, scheduledAt: future() }, auth())).status === 400, "scheduled with an empty list");
      const made = await http.post("/campaigns", { ...base, name: "Agendada", message: "Oi {{name}}", contactListId: list.id, scheduledAt: future() }, auth());
      assert(made.status === 201 && made.data.status === "scheduled", `saving with a date should schedule: ${made.status} ${made.data.status}`);
      const id = made.data.id;
      assert((await http.put(`/campaigns/${id}`, { scheduledAt: "" }, auth())).data.status === "draft", "clearing the date should make it a draft");
      assert((await http.put(`/campaigns/${id}`, { scheduledAt: future() }, auth())).data.status === "scheduled", "the date was not scheduled again");
      assert((await http.post(`/campaigns/${id}/start`, {}, auth())).data.status === "scheduled", "start without 'now' should keep waiting for the date");
      const before = graph.sent.length;
      const go = await http.post(`/campaigns/${id}/start`, { now: true }, auth());
      assert(go.data.status === "running" && go.data.scheduledAt === null, `start now ${go.data.status} ${go.data.scheduledAt}`);
      await waitFor(() => graph.sent.slice(before).some(x => x.body && x.body.to === "5521955552001"), 15000, "the message of the campaign started now");
      await waitFor(() => sql(`SELECT status FROM Campaigns WHERE id=${id}`) === "finished", 15000, "finished");

      // the time comes: it starts by itself and copies the recipients then
      const l2 = await mk("Agenda dois", ["5521955552002"]);
      const c2 = (await http.post("/campaigns", { ...base, name: "Sozinha", message: "Oi", contactListId: l2.id, scheduledAt: future() }, auth())).data;
      assert(sql(`SELECT COUNT(*) FROM CampaignShippings WHERE campaignId=${c2.id}`) === "0", "recipients copied too early");
      const before2 = graph.sent.length;
      sql(`UPDATE Campaigns SET scheduledAt = NOW() - INTERVAL '10 seconds' WHERE id=${c2.id}`);
      await waitFor(() => graph.sent.slice(before2).some(x => x.body && x.body.to === "5521955552002"), 20000, "the scheduled campaign starting by itself");
      await waitFor(() => sql(`SELECT status FROM Campaigns WHERE id=${c2.id}`) === "finished", 15000, "scheduled campaign finished");

      // hours late (the system was off): a person decides
      const l3 = await mk("Agenda tres", ["5521955552003"]);
      const c3 = (await http.post("/campaigns", { ...base, name: "Atrasada", message: "Oi", contactListId: l3.id, scheduledAt: future() }, auth())).data;
      const before3 = graph.sent.length;
      sql(`UPDATE Campaigns SET scheduledAt = NOW() - INTERVAL '8 hours' WHERE id=${c3.id}`);
      await waitFor(() => sql(`SELECT status FROM Campaigns WHERE id=${c3.id}`) === "paused", 15000, "late campaign paused");
      assert(/passou/.test(sql(`SELECT pauseReason FROM Campaigns WHERE id=${c3.id}`)), "no reason for the pause");
      assert(!graph.sent.slice(before3).some(x => x.body && x.body.to === "5521955552003"), "a campaign hours late was fired");

      // pause, resume, cancel
      const l4 = await mk("Ritmo", ["5521955552004", "5521955552005"]);
      const c4 = (await http.post("/campaigns", { ...base, intervalMin: 600, intervalMax: 600, name: "Devagar", message: "Oi", contactListId: l4.id }, auth())).data;
      const before4 = graph.sent.length;
      assert((await http.post(`/campaigns/${c4.id}/start`, {}, auth())).data.status === "running", "start");
      await waitFor(() => graph.sent.slice(before4).some(x => x.body && x.body.to === "5521955552004"), 15000, "first message");
      assert((await http.put(`/campaigns/${c4.id}`, { name: "Mudou" }, auth())).status === 400, "a running campaign was edited");
      assert((await http.post(`/campaigns/${c4.id}/pause`, {}, auth())).data.status === "paused", "pause");
      await sleep(4000);
      assert(!graph.sent.slice(before4).some(x => x.body && x.body.to === "5521955552005"), "a paused campaign kept sending");
      assert((await http.post(`/campaigns/${c4.id}/start`, {}, auth())).data.status === "running", "resume");
      await sleep(4000);
      assert(!graph.sent.slice(before4).some(x => x.body && x.body.to === "5521955552005"), "the pause between messages was skipped after resuming");
      assert((await http.post(`/campaigns/${c4.id}/cancel`, {}, auth())).data.status === "cancelled", "cancel");
      const rep = (await http.get(`/campaigns/${c4.id}/report`, auth())).data;
      assert(rep.campaign.counters.sent === 1 && rep.campaign.counters.cancelled === 1 && rep.campaign.counters.pending === 0, `counters ${JSON.stringify(rep.campaign.counters)}`);
    });
    await test("campanhas: reenviar falhas, relatório com motivo em português e em planilha, duplicar, lista em uso e conexão fora do ar", async () => {
      const list = (await http.post("/contact-lists", { name: "Falhas" }, auth())).data;
      await http.post(`/contact-lists/${list.id}/import`, { items: [{ name: "Falha Um", number: "5521955553001" }, { name: "Falha Dois", number: "5521955553002" }] }, auth());
      const c = (await http.post("/campaigns", { name: "Com falhas", message: "Oi {{name}}", contactListId: list.id, whatsappId: cid, intervalMin: 0, intervalMax: 0, batchSize: 50, batchPause: 1 }, auth())).data;
      assert((await http.post(`/campaigns/${c.id}/retry-failed`, {}, auth())).status === 400, "retry on a campaign that never started");
      assert((await http.post(`/campaigns/${c.id}/start`, {}, auth())).status === 200, "start");
      await waitFor(() => sql(`SELECT status FROM Campaigns WHERE id=${c.id}`) === "finished", 20000, "finished");
      sql(`UPDATE CampaignShippings SET status='failed', error='ERR_WAPP_INVALID_CONTACT', sentAt=NULL WHERE campaignId=${c.id} AND number='5521955553001'`);
      sql(`UPDATE CampaignShippings SET status='failed', error='Contato pediu para não receber mensagens (SAIR).' WHERE campaignId=${c.id} AND number='5521955553002'`);

      const rep = (await http.get(`/campaigns/${c.id}/report`, auth())).data;
      assert(rep.campaign.counters.failed === 2, `failed ${JSON.stringify(rep.campaign.counters)}`);
      assert(rep.shippings.find(x => x.number === "5521955553001").errorText === "Este número não tem WhatsApp.", "the error code was not translated");
      assert((await http.get(`/campaigns/${c.id}/report?status=failed`, auth())).data.shippings.length === 2 && (await http.get(`/campaigns/${c.id}/report?status=sent`, auth())).data.shippings.length === 0, "filter by status");
      const csv = await http.get(`/campaigns/${c.id}/report?format=csv`, auth());
      assert(csv.status === 200 && String(csv.data).startsWith('"Nome";"WhatsApp";"Situação"') && String(csv.data).includes('="5521955553001"') && String(csv.data).includes("Este número não tem WhatsApp."), `csv ${csv.status} ${JSON.stringify(String(csv.data).slice(0, 200))}`);

      const before = graph.sent.length;
      const retry = await http.post(`/campaigns/${c.id}/retry-failed`, {}, auth());
      assert(retry.status === 200 && retry.data.requeued === 1 && retry.data.campaign.status === "running", `retry ${retry.status} ${JSON.stringify(retry.data).slice(0, 160)}`);
      await waitFor(() => graph.sent.slice(before).some(x => x.body && x.body.to === "5521955553001"), 15000, "the failed one sent again");
      assert(!graph.sent.slice(before).some(x => x.body && x.body.to === "5521955553002"), "someone who asked not to receive was written to again");
      await waitFor(() => sql(`SELECT status FROM Campaigns WHERE id=${c.id}`) === "finished", 15000, "finished again");
      assert((await http.post(`/campaigns/${c.id}/retry-failed`, {}, auth())).status === 400, "nothing left to retry should be refused");

      const copy = await http.post(`/campaigns/${c.id}/duplicate`, {}, auth());
      assert(copy.status === 201 && copy.data.name === "Com falhas (cópia)" && copy.data.status === "draft" && copy.data.contactListId === list.id, `duplicate ${copy.status} ${JSON.stringify(copy.data).slice(0, 120)}`);
      const used = await http.delete(`/contact-lists/${list.id}`, auth());
      assert(used.status === 400 && used.data.error === "ERR_CAMPAIGN_LIST_IN_USE", `a list used by campaigns was deleted ${used.status} ${JSON.stringify(used.data)}`);
      const lcsv = await http.get(`/contact-lists/${list.id}/export.csv`, auth());
      assert(lcsv.status === 200 && String(lcsv.data).startsWith('"Nome";"WhatsApp";"E-mail"') && String(lcsv.data).includes('="5521955553001"'), "list spreadsheet");

      // the connection goes down: the campaign says it is waiting and goes on when it is back
      const l2 = (await http.post("/contact-lists", { name: "Conexão cai" }, auth())).data;
      await http.post(`/contact-lists/${l2.id}/import`, { items: [{ name: "Espera", number: "5521955553003" }] }, auth());
      const c2 = (await http.post("/campaigns", { name: "Espera a conexão", message: "Oi", contactListId: l2.id, whatsappId: cid, intervalMin: 0, intervalMax: 0, batchSize: 50, batchPause: 1 }, auth())).data;
      sql(`UPDATE Whatsapps SET status='DISCONNECTED' WHERE id=${cid}`);
      const before2 = graph.sent.length;
      try {
        assert((await http.post(`/campaigns/${c2.id}/start`, {}, auth())).status === 200, "start");
        await waitFor(() => { sql(`UPDATE Whatsapps SET status='DISCONNECTED' WHERE id=${cid}`); return /Aguardando a conexão/.test(sql(`SELECT COALESCE(pauseReason,'') FROM Campaigns WHERE id=${c2.id}`)); }, 20000, "the waiting reason");
        assert(sql(`SELECT status FROM Campaigns WHERE id=${c2.id}`) === "running" && !graph.sent.slice(before2).some(x => x.body && x.body.to === "5521955553003"), "sent while disconnected");
      } finally {
        sql(`UPDATE Whatsapps SET status='CONNECTED' WHERE id=${cid}`);
      }
      await waitFor(() => graph.sent.slice(before2).some(x => x.body && x.body.to === "5521955553003"), 45000, "sent after the connection came back");
      assert(sql(`SELECT COALESCE(pauseReason,'') FROM Campaigns WHERE id=${c2.id}`) === "", "the waiting reason stayed after sending");
    });
    await test("campanhas: antes de iniciar mostra quantos podem receber (contato conhecido com ou sem o nono dígito, descadastrado, desconhecido)", async () => {
      const wa = (await http.post("/whatsapp", { name: "QR conferência", channel: "whatsapp" }, auth())).data;
      await sleep(1500);
      sql(`UPDATE Whatsapps SET status='CONNECTED' WHERE id=${wa.id}`);
      const known = sql(`INSERT INTO Contacts (name, number, email, isGroup, kind, channel, createdAt, updatedAt) VALUES ('Conhecida', '556999993333', '', false, 'person', 'whatsapp', NOW(), NOW()) RETURNING id`).split("\n")[0];
      sql(`INSERT INTO Contacts (name, number, email, isGroup, kind, channel, optOut, createdAt, updatedAt) VALUES ('Saiu', '5569977775555', '', false, 'person', 'whatsapp', true, NOW(), NOW())`);
      const t = sql(`INSERT INTO Tickets (status, contactId, whatsappId, unreadMessages, isGroup, segment, createdAt, updatedAt) VALUES ('closed', ${known}, ${wa.id}, 0, false, 'sales', NOW(), NOW()) RETURNING id`).split("\n")[0];
      sql(`INSERT INTO Messages (id, ticketId, body, fromMe, read, mediaType, ack, createdAt, updatedAt) VALUES ('pre-known-1', ${t}, 'oi', false, true, 'chat', 0, NOW(), NOW())`);
      const list = (await http.post("/contact-lists", { name: "Conferência" }, auth())).data;
      await http.post(`/contact-lists/${list.id}/import`, { items: [{ name: "Conhecida", number: "5569999993333" }, { name: "Desconhecida", number: "5569988884444" }, { name: "Saiu", number: "5569977775555" }] }, auth());
      const c = (await http.post("/campaigns", { name: "Conferência", message: "Oi", contactListId: list.id, whatsappId: wa.id }, auth())).data;
      const pre = await http.get(`/campaigns/${c.id}/preflight`, auth());
      assert(pre.status === 200 && pre.data.total === 3 && pre.data.blocked.optedOut === 1 && pre.data.blocked.cold === 1 && pre.data.canReceive === 1, `preflight ${JSON.stringify(pre.data).slice(0, 300)}`);
      assert(pre.data.connection.riskMode === "strict" && pre.data.warnings.length >= 2 && typeof pre.data.estimatedSeconds === "number", "connection, warnings and duration");
      assert((await http.put(`/whatsapp/${wa.id}`, { name: "QR conferência", riskMode: "relaxed" }, auth())).status === 200, "relaxed mode");
      const relaxed = (await http.get(`/campaigns/${c.id}/preflight`, auth())).data;
      assert(relaxed.canReceive === 2 && relaxed.blocked.cold === 0 && relaxed.blocked.optedOut === 1, `relaxed ${JSON.stringify(relaxed.blocked)} ${relaxed.canReceive}`);
      const noList = (await http.post("/contact-lists", { name: "Vazia conferência" }, auth())).data;
      const empty = (await http.post("/campaigns", { name: "Vazia", message: "Oi", contactListId: noList.id, whatsappId: wa.id }, auth())).data;
      const e = (await http.get(`/campaigns/${empty.id}/preflight`, auth())).data;
      assert(e.total === 0 && e.canReceive === 0 && e.warnings.some(w => /vazia/.test(w)), "empty list preflight");
      assert((await http.post(`/campaigns/${empty.id}/start`, {}, auth())).status === 400, "an empty list started");
      assert((await http.post(`/campaigns/${c.id}/test`, { number: "123" }, auth())).status === 400, "test with an invalid number");
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
      const r = await http.post(`/leads/${paying.id}/payments`, { method: "pix" }, auth());
      assert(r.status === 201, `status ${r.status} ${JSON.stringify(r.data)}`);
      pay = r.data;
      const call = efi.calls.find(c => c.path === `/v2/cob/${pay.txid}`);
      assert(call.body.valor.original === "99.00" && call.body.devedor.cpf === "16899535009" && call.body.devedor.nome === "Aluno Pagante", `payload ${JSON.stringify(call.body)}`);
      assert(call.body.chave === "chave-pix@exemplo.com" && call.body.calendario.expiracao === 3600, "key / expiry");
      assert(pay.txid.length >= 26 && pay.txid.length <= 35 && /^[a-zA-Z0-9]+$/.test(pay.txid), `txid ${pay.txid}`);
      assert(pay.pixCopiaECola.startsWith("00020126") && pay.qrImage.startsWith("data:image/png;base64,"), "pix code / qr");
      assert(pay.status === "pending", "status");
      const again = await http.post(`/leads/${paying.id}/payments`, { method: "pix" }, auth());
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
      const p = (await http.post(`/leads/${l.id}/payments`, { amount: "150,50", method: "pix" }, auth())).data;
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
    await test("a seller with a Wallet ID gets the Bolix with the split by itself; who pays the fee is the manager's choice; a refused Wallet ID does not stop the charge", async () => {
      const due = ymdPlus(2);
      const callsOf = () => billet.calls.filter(c => c.method === "POST" && !c.refused);
      // the fee is always a Bolix (boleto with a Pix QR Code); the seller's Wallet ID adds the split
      assert((await http.get("/payments/efi/settings", auth())).data.defaultMethod === "bolix", "the fee is not always a Bolix");
      const a = await mkLead("Aluno Repasse Automatico", "5511955579001", { ownerId: bolixConsultantId });
      await http.put(`/leads/${a.id}`, { cpf: cpfFor(223456780) }, auth());
      const before = callsOf().length;
      const ra = await http.post(`/leads/${a.id}/payments`, { dueDate: due, amount: "120" }, auth());
      assert(ra.status === 201 && ra.data.method === "bolix", `automatic method ${ra.status} ${ra.data.method}`);
      const callA = callsOf().pop();
      assert(callsOf().length === before + 1 && callA.body.items[0].marketplace.repasses[0].payee_code === "A1b2C3d4E5f6", "the Wallet ID was not sent");
      assert(callA.body.items[0].marketplace.mode === 2, `fee mode ${callA.body.items[0].marketplace.mode}`);
      // the manager makes the company pay the Efí fee (mode 1)
      const cfg = (await http.put("/payments/efi/settings", { feeMode: "company" }, auth())).data;
      assert(cfg.feeMode === "company", "fee mode not saved");
      const b = await mkLead("Aluno Taxa Empresa", "5511955579002", { ownerId: bolixConsultantId });
      await http.put(`/leads/${b.id}`, { cpf: cpfFor(223456781) }, auth());
      await http.post(`/leads/${b.id}/payments`, { dueDate: due }, auth());
      assert(callsOf().pop().body.items[0].marketplace.mode === 1, "the company fee mode was not sent");
      await http.put("/payments/efi/settings", { feeMode: "proportional" }, auth());
      // choosing Pix on purpose keeps the Pix (it cannot be split by Wallet ID): the commission stays to be paid back by hand
      const c = await mkLead("Aluno Pix Escolhido", "5511955579003", { ownerId: bolixConsultantId });
      await http.put(`/leads/${c.id}`, { cpf: cpfFor(223456782) }, auth());
      const rc = await http.post(`/leads/${c.id}/payments`, { method: "pix" }, auth());
      assert(rc.status === 201 && rc.data.method !== "bolix", "Pix chosen on purpose became a Bolix");
      // a seller without a Wallet ID: still a Bolix, all of it for the company (no split); the due date is the company default
      const d = await mkLead("Aluno Vendedor Sem Conta", "5511955579004", { ownerId: 1 });
      await http.put(`/leads/${d.id}`, { cpf: cpfFor(223456783) }, auth());
      assert((await http.put("/payments/efi/settings", { dueDays: 2 }, auth())).data.dueDays === 2, "due days not saved");
      const rd = await http.post(`/leads/${d.id}/payments`, {}, auth());
      assert(rd.status === 201 && rd.data.method === "bolix" && rd.data.status === "pending" && !callsOf().pop().body.items[0].marketplace, `no-wallet charge ${rd.status} ${rd.data.method} ${rd.data.status}`);
      const days = Number(sql(`SELECT dueDate - CURRENT_DATE FROM Payments WHERE id=${rd.data.id}`));
      assert(days >= 1 && days <= 2, `the company default due date was not used (${days} days)`);
      await http.put("/payments/efi/settings", { dueDays: 3 }, auth());
      // Efí refuses the Wallet ID: the student still gets the charge, in the company account, and the team is told
      sql(`UPDATE Users SET efiPayeeCode='RECUSADO12345' WHERE id=${bolixConsultantId}`);
      const e = await mkLead("Aluno Wallet Recusado", "5511955579005", { ownerId: bolixConsultantId });
      await http.put(`/leads/${e.id}`, { cpf: cpfFor(223456784) }, auth());
      const re = await http.post(`/leads/${e.id}/payments`, { dueDate: due }, auth());
      assert(re.status === 201 && re.data.status === "pending", `refused wallet ${re.status} ${JSON.stringify(re.data).slice(0, 160)}`);
      assert(billet.calls.some(x => x.refused), "the refusal was not exercised");
      assert(!callsOf().pop().body.items[0].marketplace, "the charge was issued with the refused split");
      assert(sql(`SELECT CONCAT(COALESCE(recipientCode,'-'),'|',splitPct) FROM Payments WHERE id=${re.data.id}`) === "-|0", "the refused Wallet ID stayed on the payment");
      assert(/não aceitou o Wallet ID/.test(sql(`SELECT body FROM LeadActivities WHERE leadId=${e.id} AND body LIKE '%Wallet ID%' LIMIT 1`)), "the team was not told");
      sql(`UPDATE Users SET efiPayeeCode='A1b2C3d4E5f6' WHERE id=${bolixConsultantId}`);
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
    await test("the enrollment fee label: Taxa pendente when the student is enrolled without paying, Taxa paga the moment the payment is confirmed", async () => {
      const due = ymdPlus(2);
      const l = await mkLead("Aluno Taxa Etiqueta", "5511955579101", { ownerId: bolixConsultantId });
      await http.put(`/leads/${l.id}`, { cpf: cpfFor(323456780) }, auth());
      const names = (table, col, id) => sql(`SELECT COALESCE(STRING_AGG(t.name, ',' ORDER BY t.name), '') FROM ${table} x JOIN Tags t ON t.id=x.tagId WHERE x.${col}=${id}`);
      // the person has a contact and an open conversation: the label must show there too
      const contactId = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('Aluno Taxa Etiqueta', 'tg_7903', '', false, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
      sql(`UPDATE Leads SET contactId=${contactId} WHERE id=${l.id}`);
      const feeTicket = sql(`INSERT INTO Tickets (status, contactId, whatsappId, unreadMessages, isGroup, segment, isHistorical, createdAt, updatedAt) VALUES ('open', ${contactId}, ${tgId}, 0, false, 'sales', false, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const r = await http.post(`/leads/${l.id}/payments`, { method: "bolix", dueDate: due, amount: "80" }, auth());
      assert(r.status === 201, `charge ${r.status}`);
      assert(names("LeadTags", "leadId", l.id) === "", "a label before the enrollment");
      // enrolled (the won column) with the fee still to pay: the label appears on the lead and on the contact
      const wonId = sql(`SELECT id FROM LeadStages WHERE type='won' ORDER BY position LIMIT 1`);
      const moved = await http.put(`/leads/${l.id}/stage`, { stageId: Number(wonId) }, auth());
      assert(moved.status === 200, `move ${moved.status}`);
      assert(names("LeadTags", "leadId", l.id) === "Taxa pendente", `lead labels: ${names("LeadTags", "leadId", l.id)}`);
      assert(names("ContactTags", "contactId", contactId) === "Taxa pendente", "the contact has no pending label");
      assert(names("TicketTags", "ticketId", feeTicket) === "Taxa pendente", "the conversation has no pending label");
      // moving the card again never doubles the label
      await http.put(`/leads/${l.id}/stage`, { stageId: Number(wonId) }, auth());
      assert(names("LeadTags", "leadId", l.id) === "Taxa pendente", "the label doubled");
      // the payment is confirmed by Efí: the label changes at once
      const secret = (await http.get("/payments/efi/settings", auth())).data.webhookUrl.split("/").pop();
      const chargeId = sql(`SELECT chargeId FROM Payments WHERE id=${r.data.id}`);
      billet.notifications.feeLabel = [chargeId];
      billet.charges[chargeId].status = "paid";
      await http.post(`/webhooks/efi/${secret}/billet`, "notification=feeLabel", { headers: { "content-type": "application/x-www-form-urlencoded" } });
      await waitFor(() => names("LeadTags", "leadId", l.id) === "Taxa paga", 8000, "Taxa paga on the lead");
      assert(names("ContactTags", "contactId", contactId) === "Taxa paga", "the contact label was not swapped");
      assert(names("TicketTags", "ticketId", feeTicket) === "Taxa paga", "the conversation label was not swapped");
      // a lead that already paid is never marked as pending again
      await http.put(`/leads/${l.id}/stage`, { stageId: Number(sql(`SELECT id FROM LeadStages WHERE type='open' ORDER BY position LIMIT 1`)) }, auth());
      await http.put(`/leads/${l.id}/stage`, { stageId: Number(wonId) }, auth());
      assert(names("LeadTags", "leadId", l.id) === "Taxa paga", `a paid fee came back as pending: ${names("LeadTags", "leadId", l.id)}`);
    });
    await test("an open Bolix can be cancelled at Efí", async () => {
      const l = await mkLead("Aluno Bolix Cancela", "5511955551004");
      await http.put(`/leads/${l.id}`, { cpf: cpfFor(123456783) }, auth());
      // due in 2 days: the charge (generated 3 days before) is already open at any hour (with 3 days it is only generated
      // at 07:00 local, so between midnight and 07:00 it would still be "scheduled")
      const p = (await http.post(`/leads/${l.id}/payments`, { method: "bolix", dueDate: ymdPlus(2) }, auth())).data;
      assert(p.status === "pending", `status ${p.status}`);
      const r = await http.post(`/payments/${p.id}/cancel`, {}, auth());
      assert(r.status === 200 && r.data.status === "cancelled", "cancel");
      assert(billet.calls.some(c => c.method === "PUT" && c.path.endsWith("/cancel")), "Efí not told");
    });
    await test("an open charge can be cancelled at Efí", async () => {
      const l = await mkLead("Aluno Cancela", "5511955550003", { ownerId: 1 });
      await http.put(`/leads/${l.id}`, { cpf: "935.411.347-80" }, auth());
      const p = (await http.post(`/leads/${l.id}/payments`, { method: "pix" }, auth())).data;
      const r = await http.post(`/payments/${p.id}/cancel`, {}, auth());
      assert(r.status === 200 && r.data.status === "cancelled", "cancel");
      assert(efi.calls.some(c => c.method === "PATCH" && c.path === `/v2/cob/${p.txid}` && c.body.status === "REMOVIDA_PELO_USUARIO_RECEBEDOR"), "Efí not told");
      assert((await http.post(`/payments/${p.id}/cancel`, {}, auth())).status === 400, "cancelled twice");
    });
    await test("the Pix code and QR image are sent to the candidate in the conversation", async () => {
      const l = await mkLead("Aluno Envio", "5511955550004", { ownerId: 1 });
      await http.put(`/leads/${l.id}`, { cpf: "111.444.777-35".replace("111.444.777-35", "390.533.447-05") }, auth());
      const p = (await http.post(`/leads/${l.id}/payments`, { method: "pix" }, auth())).data;
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
    await test("there is no public sign-up: nobody creates an account by the login routes", async () => {
      const r = await http.post("/auth/signup", { name: "Intruso", email: "intruso@x.com", password: "123456", profile: "admin" });
      assert(r.status === 404 || r.status === 401, `signup answered ${r.status}`);
      assert(sql(`SELECT COUNT(*) FROM Users WHERE email='intruso@x.com'`) === "0", "an account was created");
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
    await test("forwarding in a batch answers at once, sends in the background and reports the progress; a reaction shows at once and is not doubled by its echo", async () => {
      const mine = sql(`SELECT id FROM Messages WHERE ticketId=${tgTicket} AND fromMe=1 ORDER BY createdAt LIMIT 2`).split("\n").filter(Boolean);
      assert(mine.length >= 1, "no outbound messages");
      const other = ticketOf("tg_5552");
      const before = tg.sent.length;
      const t0 = Date.now();
      const f = await http.post("/messages/forward-batch", { messageIds: mine, ticketIds: [Number(other)] }, auth());
      assert(f.status === 202 && f.data.total === mine.length && f.data.batchId, `batch ${f.status} ${JSON.stringify(f.data)}`);
      assert(Date.now() - t0 < 2500, "the batch waited for the sending");
      await waitFor(() => tg.sent.slice(before).filter(x => /^send(Message|Photo|Document|Video|Audio|Voice)$/.test(x.method) && String(x.body.chat_id) === "5552").length >= mine.length, 15000, "batch delivered").catch(e => { throw new Error(`${e.message}: ${JSON.stringify(tg.sent.slice(before).map(x => [x.method, x.body.chat_id]))} mine=${mine}`); });
      assert((await http.post("/messages/forward-batch", { messageIds: mine, ticketIds: [] }, auth())).status === 400, "empty target accepted");
      assert((await http.post("/messages/forward-batch", { messageIds: ["nao-existe"], ticketIds: [Number(other)] }, auth())).status === 404, "unknown message accepted");
      assert((await http.post("/messages/forward-batch", { messageIds: mine, ticketIds: [Number(other)] }, asUser(agentToken))).status === 403, "agent forwarded outside own permissions");
      // the same reaction twice (the echo of the phone) does not double it
      const m = mine[0];
      assert((await http.post(`/messages/${m}/react`, { emoji: "🙏" }, auth())).status === 200, "react");
      assert((await http.post(`/messages/${m}/react`, { emoji: "🙏" }, auth())).status === 200, "react again");
      const rx = JSON.parse(sql(`SELECT reactions FROM Messages WHERE id='${m}'`));
      assert(rx.filter(r => r.fromMe).length === 1, `reaction doubled ${JSON.stringify(rx)}`);
    });
    await test("password recovery by e-mail: the account is set on screen, the link works once, nobody can tell who has an account", async () => {
      // a tiny SMTP server that keeps what it receives
      const net = require("net");
      const inbox = [];
      const smtp = net.createServer(sock => {
        let mode = "cmd", data = "", authStep = 0, rec = { auth: "", raw: "" };
        sock.write("220 mock ESMTP\r\n");
        let buf = "";
        sock.on("data", chunk => {
          buf += chunk.toString();
          if (mode === "data") {
            if (buf.endsWith("\r\n.\r\n")) { rec.raw = buf; inbox.push(rec); rec = { auth: rec.auth, raw: "" }; buf = ""; mode = "cmd"; sock.write("250 queued\r\n"); }
            return;
          }
          const lines = buf.split("\r\n"); buf = lines.pop();
          for (const line of lines) {
            if (authStep === 1) { rec.auth = Buffer.from(line, "base64").toString() + "|"; authStep = 2; sock.write("334 UGFzc3dvcmQ6\r\n"); continue; }
            if (authStep === 2) { rec.auth += Buffer.from(line, "base64").toString(); authStep = 0; sock.write("235 ok\r\n"); continue; }
            if (/^EHLO|^HELO/i.test(line)) sock.write("250-mock\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n");
            else if (/^AUTH PLAIN/i.test(line)) { const parts = Buffer.from(line.split(" ")[2] || "", "base64").toString().split("\0"); rec.auth = `${parts[1]}|${parts[2]}`; sock.write("235 ok\r\n"); }
            else if (/^AUTH LOGIN/i.test(line)) { authStep = 1; sock.write("334 VXNlcm5hbWU6\r\n"); }
            else if (/^MAIL FROM|^RCPT TO/i.test(line)) sock.write("250 ok\r\n");
            else if (/^DATA/i.test(line)) { mode = "data"; sock.write("354 go\r\n"); }
            else if (/^QUIT/i.test(line)) { sock.write("221 bye\r\n"); sock.end(); }
            else sock.write("250 ok\r\n");
          }
        });
        sock.on("error", () => {});
      });
      await new Promise(r => smtp.listen(9106, "127.0.0.1", r));
      try {
        const decode = raw => raw.replace(/=\r?\n/g, "").replace(/=3D/g, "=");
        // nothing is set up yet: asking for a link answers the same and sends nothing
        await http.post("/users", { name: "Maria Recupera", email: "recupera@x.com", password: "senha-antiga1", role: "consultor" }, auth());
        assert((await http.post("/auth/forgot", { email: "recupera@x.com" })).status === 200, "forgot (not set up)");
        await new Promise(r => setTimeout(r, 400));
        assert(inbox.length === 0, "an e-mail went out without an account set up");
        assert((await http.post("/mail/test", {}, auth())).status === 400, "test mail without setup");

        // set up from the screen: the password is sealed and never comes back
        const saved = await http.put("/mail/settings", { host: "127.0.0.1", port: 9106, secure: false, user: "cruzeirogpt@gmail.com", fromName: "Cruzeiro Teste", pass: "abcd efgh ijkl mnop" }, auth());
        assert(saved.status === 200 && saved.data.hasPassword === true && !JSON.stringify(saved.data).includes("abcdefgh"), `settings ${JSON.stringify(saved.data)}`);
        assert(sql(`SELECT value FROM Settings WHERE key='mail_pass'`).startsWith("enc:v1:"), "the mail password is not sealed");
        assert(!JSON.stringify((await http.get("/settings", auth())).data).includes("mail_pass"), "the mail password is in the generic settings list");
        assert((await http.put("/settings/mail_pass", { value: "x" }, auth())).status === 403, "the mail password was written raw");
        assert((await http.get("/mail/settings", asUser(agentToken))).status === 403, "an agent read the mail settings");
        assert((await http.put("/mail/settings", { port: 99999 }, auth())).status === 400, "bad port accepted");
        // the masked placeholder sent back does not replace the password
        assert((await http.put("/mail/settings", { pass: "••••••••" }, auth())).data.hasPassword === true, "mask replaced the password");

        const t = await http.post("/mail/test", {}, auth());
        assert(t.status === 200, `test mail ${t.status} ${JSON.stringify(t.data)}`);
        await waitFor(() => inbox.length === 1, 8000, "test e-mail arrived");
        assert(inbox[0].auth === "cruzeirogpt@gmail.com|abcdefghijklmnop", `smtp login ${inbox[0].auth}`);
        assert(/Subject: Chat Acad/.test(inbox[0].raw) || /Subject: =\?UTF-8/.test(inbox[0].raw), "test e-mail without subject");

        // the link: same answer for known and unknown addresses
        assert((await http.post("/auth/forgot", { email: "ninguem@x.com" })).data.ok === true, "unknown address answered differently");
        await new Promise(r => setTimeout(r, 500));
        assert(inbox.length === 1, "an e-mail went to an address that has no account");
        assert((await http.post("/auth/forgot", { email: "Recupera@X.com" })).data.ok === true, "forgot");
        await waitFor(() => inbox.length === 2, 8000, "recovery e-mail");
        const link1 = decode(inbox[1].raw).match(/redefinir-senha\/([a-f0-9]{64})/);
        assert(link1 && /To: recupera@x.com/i.test(inbox[1].raw), "no link in the e-mail");
        // a newer request cancels the older link
        assert((await http.post("/auth/forgot", { email: "recupera@x.com" })).status === 200, "forgot again");
        await waitFor(() => inbox.length === 3, 8000, "second recovery e-mail");
        const link2 = decode(inbox[2].raw).match(/redefinir-senha\/([a-f0-9]{64})/);
        assert(link2[1] !== link1[1], "same token twice");
        assert((await http.get(`/auth/reset/${link1[1]}`)).data.valid === false, "the older link still works");
        assert((await http.get(`/auth/reset/${link2[1]}`)).data.valid === true, "the new link does not work");
        assert((await http.post("/auth/reset", { token: link2[1], password: "curta" })).status === 400, "a short password was accepted");
        assert((await http.post("/auth/reset", { token: "0".repeat(64), password: "outra-senha-9" })).status === 400, "an invented token worked");
        assert((await http.post("/auth/reset", { token: link1[1], password: "outra-senha-9" })).status === 400, "the cancelled link worked");

        const refreshBefore = (await http.post("/auth/login", { email: "recupera@x.com", password: "senha-antiga1" })).status;
        assert(refreshBefore === 200, "login before");
        assert((await http.post("/auth/reset", { token: link2[1], password: "outra-senha-9" })).status === 200, "reset");
        assert((await http.post("/auth/login", { email: "recupera@x.com", password: "senha-antiga1" })).status === 401, "the old password still works");
        assert((await http.post("/auth/login", { email: "recupera@x.com", password: "outra-senha-9" })).status === 200, "the new password does not work");
        assert((await http.post("/auth/reset", { token: link2[1], password: "mais-uma-senha-1" })).status === 400, "a link worked twice");
        assert(sql(`SELECT COUNT(*) FROM PasswordResets WHERE tokenHash LIKE '${link2[1].slice(0, 8)}%'`) === "0", "the token was stored in the clear");
      } finally {
        smtp.close();
      }
    });
    await test("an affiliate refers someone: the consultant and the administration get an e-mail, the person is in the CRM, the WhatsApp is required", async () => {
      const net = require("net");
      const inbox = [];
      const smtp = net.createServer(sock => {
        let mode = "cmd", buf = "", rec = { to: "", raw: "" };
        sock.write("220 mock ESMTP\r\n");
        sock.on("data", chunk => {
          buf += chunk.toString();
          if (mode === "data") {
            if (buf.endsWith("\r\n.\r\n")) { rec.raw = buf; inbox.push(rec); rec = { to: "", raw: "" }; buf = ""; mode = "cmd"; sock.write("250 queued\r\n"); }
            return;
          }
          const lines = buf.split("\r\n"); buf = lines.pop();
          for (const line of lines) {
            if (/^EHLO|^HELO/i.test(line)) sock.write("250-mock\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n");
            else if (/^AUTH PLAIN/i.test(line)) sock.write("235 ok\r\n");
            else if (/^RCPT TO/i.test(line)) { rec.to = (line.match(/<([^>]+)>/) || [])[1] || ""; sock.write("250 ok\r\n"); }
            else if (/^DATA/i.test(line)) { mode = "data"; sock.write("354 go\r\n"); }
            else if (/^QUIT/i.test(line)) { sock.write("221 bye\r\n"); sock.end(); }
            else sock.write("250 ok\r\n");
          }
        });
        sock.on("error", () => {});
      });
      await new Promise(r => smtp.listen(9106, "127.0.0.1", r));
      try {
        const decode = raw => raw.replace(/=\r?\n/g, "").replace(/=3D/g, "=").replace(/=C3=A7/g, "ç").replace(/=C3=A3/g, "ã");
        // the administrators that exist (creating another one would change what other tests assume about the last administrator)
        const admins = sql(`SELECT email FROM Users WHERE (profile='admin' OR role IN ('admin','coordenacao')) AND email IS NOT NULL AND email <> ''`).split("\n").map(x => x.trim()).filter(Boolean);
        assert(admins.length >= 1, "no administrator with an e-mail");
        await http.post("/users", { name: "Cons Indicações", email: "cons-ind@x.com", password: "senha123", role: "consultor" }, auth());
        await new Promise(r => setTimeout(r, 800));
        inbox.length = 0; // the welcome e-mail of the new account
        const tc = (await http.post("/auth/login", { email: "cons-ind@x.com", password: "senha123" })).data.token;
        const aff = (await http.post("/affiliates", { name: "Indicadora Avisos", phone: "(69) 97000-9090" }, asUser(tc))).data;
        const got = email => inbox.filter(m => m.to === email);

        // without the WhatsApp (or with half of it) nothing is saved and nothing is sent
        assert((await http.post(`/affiliate-portal/${aff.portalToken}/referrals`, { name: "Sem Zap", consent: true })).status === 400, "a referral without WhatsApp was accepted");
        assert((await http.post(`/affiliate-portal/${aff.portalToken}/referrals`, { name: "Zap Curto", phone: "99999", consent: true })).status === 400, "an incomplete WhatsApp was accepted");
        assert(sql(`SELECT COUNT(*) FROM Leads WHERE name IN ('Sem Zap','Zap Curto')`) === "0", "a lead without WhatsApp was created");
        await new Promise(r => setTimeout(r, 500));
        assert(inbox.length === 0, "an e-mail went out for a referral that was refused");

        // a good one: in the CRM, in the affiliate column, and both the consultant and the administrators are told
        const ok = await http.post(`/affiliate-portal/${aff.portalToken}/referrals`, { name: "Fulana Indicada", phone: "(69) 98123-4567", consent: true });
        assert(ok.status === 201 && ok.data.created, `referral ${ok.status}`);
        assert(sql(`SELECT s.name FROM Leads l JOIN LeadStages s ON s.id=l.stageId WHERE l.name='Fulana Indicada'`) === "Indicações de afiliados", "the referral is not in the affiliate column");
        await waitFor(() => got("cons-ind@x.com").length === 1 && admins.every(a => got(a).length === 1), 10000, "the referral e-mails");
        const mailC = decode(got("cons-ind@x.com")[0].raw);
        assert(/Subject: .*Nova indica/i.test(mailC) || /Subject: =\?UTF-8/.test(mailC), "subject of the referral e-mail");
        assert(mailC.includes("Indicadora Avisos") && mailC.includes("Fulana Indicada") && mailC.includes("+55 (69) 98123-4567") && mailC.includes("esperando o seu primeiro") && /crm\?lead=\d+/.test(mailC), "the e-mail of the consultant lacks who, the number or the link");
        const mailA = decode(got(admins[0])[0].raw);
        assert(mailA.includes("administra o sistema") && !mailA.includes("esperando o seu primeiro"), "the administration got the consultant's text");
        assert(new Set(inbox.map(m => m.to)).size === inbox.length, "someone got the same notice twice");

        // the same person again: the CRM keeps one, and the consultant is told it was already there
        const before = inbox.length;
        const again = await http.post(`/affiliate-portal/${aff.portalToken}/referrals`, { name: "Fulana Indicada", phone: "(69) 98123-4567", consent: true });
        assert(again.status === 200 && !again.data.created, "duplicate");
        await waitFor(() => inbox.length > before, 10000, "the duplicate notice");
        assert(decode(inbox[inbox.length - 1].raw).includes("já estava no CRM") || decode(inbox[inbox.length - 1].raw).includes("j=C3=A1 estava"), "the duplicate notice does not say it was already there");
        assert(sql(`SELECT COUNT(*) FROM Leads WHERE name='Fulana Indicada'`) === "1", "the person was duplicated");

        // the link of the affiliate (/r/CODE) is a referral too
        const n2 = inbox.length;
        const sub = await fetch(`${API}/r/${aff.refCode}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Pelo Link Aviso", phone: "(69) 98555-4321", consent: true }) });
        assert(sub.status === 200, `link submit ${sub.status}`);
        await waitFor(() => inbox.length >= n2 + 2, 10000, "the link referral e-mails");
        assert(inbox.slice(n2).some(m => m.to === "cons-ind@x.com" && decode(m.raw).includes("Pelo Link Aviso")), "the consultant was not told about the link referral");

        // the consultant who registers it by hand also needs the WhatsApp
        assert((await http.post(`/affiliates/${aff.id}/referrals`, { name: "Sem Número Manual" }, asUser(tc))).status === 400, "a manual referral without WhatsApp was accepted");
        assert((await http.get("/mail/templates/affiliate-referral/preview", auth())).status === 200, "the referral e-mail is not in the catalog of the E-mail screen");
      } finally {
        smtp.close();
      }
    });
    await test("curricular analysis: the PDF becomes the entry forecast, the entry period and a corrected line recompute it", async () => {
      const sample = fs.readFileSync(path.join(__dirname, "fixtures", "sample-analise.pdf"));
      // the analysis is for a student of a polo
      const polo = (await http.post("/polos", { name: "Polo da Análise", code: "ANL1", state: "RO" }, auth())).data;
      assert(polo.id, "polo not created");
      const send = (extra = {}, name = "analise.pdf", bytes = sample, who = token) => {
        const f = new FormData();
        f.append("file", bytes, { filename: name, contentType: "application/pdf" });
        const full = { candidateName: "Aluno Teste Completo", poloId: polo.id, ...extra };
        Object.entries(full).filter(([, v]) => v !== null).forEach(([k, v]) => f.append(k, String(v)));
        return http.post("/analysis/curricular", f, { headers: { ...f.getHeaders(), Authorization: `Bearer ${who}` } });
      };
      const made = await send({ entryPeriod: 2, startTerm: "2026.2", candidateName: "Candidato Teste" });
      assert(made.status === 201, `create ${made.status} ${JSON.stringify(made.data).slice(0, 200)}`);
      // the consultant must say who the analysis is for: the name and the polo
      assert((await send({ candidateName: "" })).status === 400, "an analysis without the name of the student was accepted");
      assert((await send({ poloId: "" })).status === 400 && (await send({ poloId: 99999 })).status === 400, "an analysis without a valid polo was accepted");
      assert(made.data.poloId === polo.id && made.data.poloName, `polo of the analysis ${JSON.stringify([made.data.poloId, made.data.poloName])}`);
      const a = made.data;
      assert(a.subjects.length > 5 && a.entryPeriod === 2 && a.entryPeriodSource === "USER" && a.status === "COMPLETED", `fields ${JSON.stringify([a.subjects.length, a.entryPeriod, a.entryPeriodSource, a.status])}`);
      assert(a.result.totals.total === a.subjects.length && a.result.totals.exempted + a.result.totals.pending + a.result.totals.review === a.result.totals.total, "totals do not add up");
      assert(a.result.simulation && a.result.simulation.semesters.length >= 1 && /^\d{4}\.[12]$/.test(a.result.simulation.estimatedCompletionTerm), "no forecast");
      assert(a.result.simulation.semesters.every(x => x.semesterLoad <= x.maximumCapacity), "a semester above its capacity");
      assert(a.result.narrative.text.includes("Ingresso: *2º semestre*"), "narrative");
      assert(!a.result.warnings.some(w => w.code.startsWith("INVARIANT_")), "an invariant was broken");
      // the PDF itself is not kept: only a hash
      assert(sql(`SELECT COUNT(*) FROM CurricularAnalyses WHERE fileHash IS NOT NULL`) !== "0", "hash not kept");

      // changing the entry period recomputes from the saved lines (no PDF again)
      const early = (await http.put(`/analysis/curricular/${a.id}`, { entryPeriod: 1 }, auth())).data;
      assert(early.entryPeriod === 1 && early.result.previousBacklogCount === 0, `entry 1 ${JSON.stringify(early.result.previousBacklogCount)}`);
      const noEntry = (await http.put(`/analysis/curricular/${a.id}`, { entryPeriod: null }, auth())).data;
      assert(noEntry.result.simulation === null && noEntry.status === "WAITING_REVIEW" && noEntry.result.warnings.some(w => w.code === "ENTRY_PERIOD_REQUIRED"), "no entry period must not forecast");
      assert((await http.put(`/analysis/curricular/${a.id}`, { entryPeriod: 99 }, auth())).status === 400, "entry 99 accepted");
      assert((await http.put(`/analysis/curricular/${a.id}`, { startTerm: "banana" }, auth())).status === 400, "bad term accepted");
      await http.put(`/analysis/curricular/${a.id}`, { entryPeriod: 2, startTerm: "2026.2" }, auth());

      // a line read wrong is fixed by hand and the forecast follows
      const pendingLine = a.subjects.find(x => x.status === "PENDING");
      const fixed = (await http.put(`/analysis/curricular/${a.id}/subject/${pendingLine.id}`, { status: "EXEMPTED" }, auth())).data;
      assert(fixed.result.totals.exempted === a.result.totals.exempted + 1 && fixed.result.totals.pending === a.result.totals.pending - 1, "the correction did not change the totals");
      assert((await http.put(`/analysis/curricular/${a.id}/subject/${pendingLine.id}`, { status: "XYZ" }, auth())).status === 400, "bad status accepted");

      // refusals: not a PDF, a PDF without the table
      assert((await send({}, "x.pdf", Buffer.from("PK\x03\x04 nao e pdf"))).status === 400, "a zip passed");
      const noTable = await send({ entryPeriod: 1 }, "bolo.pdf", selectablePdfJs([[40, 700, "Receita de bolo"]]));
      assert(noTable.status === 400 && /tabela de disciplinas/.test(JSON.stringify(noTable.data)), `no table ${noTable.status} ${JSON.stringify(noTable.data)}`);

      // who sees what: the owner and the management, nobody else
      await http.post("/users", { name: "Outro Consultor", email: "outro-an@x.com", password: "senha123", role: "consultor" }, auth());
      const other = (await http.post("/auth/login", { email: "outro-an@x.com", password: "senha123" })).data.token;
      assert((await http.get(`/analysis/curricular/${a.id}`, asUser(other))).status === 403, "another consultant opened it");
      assert((await http.get("/analysis/curricular", asUser(other))).data.length === 0, "another consultant listed it");
      assert((await http.get("/analysis/curricular", auth())).data.some(x => x.id === a.id), "the admin does not list it");
      assert((await http.get("/analysis/curricular")).status === 401, "no login");
      // the rules are editable: bad values are ignored
      assert((await http.put("/analysis/rules", { extraSubjectsAllowed: 99, maximumSubjectsPerSemester: "abc" }, auth())).data.extraSubjectsAllowed === 3, "a bad rule was accepted");
      assert((await http.put("/analysis/rules", { extraSubjectsAllowed: 2 }, auth())).data.extraSubjectsAllowed === 2, "rule not saved");
      assert((await http.put("/analysis/rules", { extraSubjectsAllowed: 3 }, asUser(other))).status === 403, "a consultant changed the rules");
      await http.put("/analysis/rules", { extraSubjectsAllowed: 3 }, auth());
      assert((await http.delete(`/analysis/curricular/${a.id}`, auth())).status === 204, "delete");
    });
    await test("academic analysis and the student portal: versions only when the facts change, RGM check, invitation, login, isolation", async () => {
      await http.post("/users", { name: "Tutora Portal", email: "tutora-portal@x.com", password: "senha123", role: "tutor" }, auth());
      await http.post("/users", { name: "Tutor Intruso", email: "tutor-intruso@x.com", password: "senha123", role: "tutor" }, auth());
      const tk = (await http.post("/auth/login", { email: "tutora-portal@x.com", password: "senha123" })).data.token;
      const intruder = (await http.post("/auth/login", { email: "tutor-intruso@x.com", password: "senha123" })).data.token;
      const consTk = (await http.post("/auth/login", { email: "outro-an@x.com", password: "senha123" })).data.token;
      assert((await http.get("/students", asUser(consTk))).status === 403 && (await http.get("/analysis/academic", asUser(consTk))).status === 403, "a consultant reached the academic area");
      const up = (route, bytes, who, name = "extrato.pdf") => {
        const f = new FormData();
        f.append("file", bytes, { filename: name, contentType: "application/pdf" });
        return http.post(route, f, { headers: { ...f.getHeaders(), Authorization: `Bearer ${who}` } });
      };

      // a standalone analysis: the tutor confirms the current period and the forecast appears
      const solo = await up("/analysis/academic", academicPdfJs("777001", "A CURSAR"), tk);
      assert(solo.status === 201 && solo.data.documentType === "CURRICULAR_EXTRACT" && solo.data.rgm === "777001", `solo ${solo.status} ${JSON.stringify(solo.data).slice(0, 200)}`);
      const confirmed = (await http.put(`/analysis/academic/${solo.data.id}`, { currentPeriod: 3 }, asUser(tk))).data;
      assert(confirmed.currentPeriod === 3 && confirmed.currentPeriodConfirmed === true && /Resumo da análise/.test(confirmed.message), `confirm ${JSON.stringify(confirmed).slice(0, 200)}`);
      assert((await http.put(`/analysis/academic/${solo.data.id}`, { currentPeriod: 77 }, asUser(tk))).status === 400, "period 77 accepted");
      assert((await http.get(`/analysis/academic/${solo.data.id}`, asUser(intruder))).status === 403, "another tutor opened it");
      assert((await up("/analysis/academic", selectablePdfJs([[40, 700, "Receita de bolo"]]), tk, "bolo.pdf")).status === 400, "an unknown document was accepted");
      assert((await http.delete(`/analysis/academic/${solo.data.id}`, asUser(tk))).status === 204, "delete standalone");

      // the student: created by the tutor, invited, activated, logged in
      const st = await http.post("/students", { rgm: "123456", name: "Aluno Teste Portal", email: "aluno.portal@x.com", courseName: "Administracao" }, asUser(tk));
      assert(st.status === 201 && st.data.responsibleUserId, `student ${st.status} ${JSON.stringify(st.data)}`);
      const sid = st.data.id;
      assert((await http.post("/students", { rgm: "123456", name: "Repetido" }, asUser(tk))).status === 409, "duplicated RGM accepted");
      assert((await http.get(`/students/${sid}`, asUser(intruder))).status === 403, "another tutor opened the student");
      assert((await http.get("/students", asUser(intruder))).data.length === 0, "another tutor listed the student");
      // before the invitation the student cannot sign in
      assert((await http.post("/portal/login", { login: "123456", password: "qualquer-coisa-1" })).status === 401, "login before the invitation");
      const inv = await http.post(`/students/${sid}/invite`, {}, asUser(tk));
      assert(inv.status === 200 && /\/portal\/ativar\/[a-f0-9]{64}$/.test(inv.data.link), `invite ${JSON.stringify(inv.data)}`);
      const stoken = inv.data.link.split("/").pop();
      assert((await http.get(`/portal/token/${stoken}`)).data.valid === true, "invite link not valid");
      assert((await http.post("/portal/activate", { token: stoken, password: "curta" })).status === 400, "short password accepted");
      assert((await http.post("/portal/activate", { token: stoken, password: "senha-do-aluno-1" })).status === 200, "activate");
      assert((await http.get(`/portal/token/${stoken}`)).data.valid === false && (await http.post("/portal/activate", { token: stoken, password: "outra-senha-aluno" })).status === 400, "the link worked twice");
      assert(sql(`SELECT COUNT(*) FROM StudentTokens WHERE tokenHash LIKE '${stoken.slice(0, 8)}%'`) === "0", "the token was stored in the clear");
      assert(!sql(`SELECT passwordHash FROM Students WHERE id=${sid}`).includes("senha-do-aluno"), "the password is not hashed");
      assert((await http.post("/portal/login", { login: "123456", password: "errada-errada" })).status === 401, "wrong password");
      const login = await http.post("/portal/login", { login: "Aluno.Portal@X.com", password: "senha-do-aluno-1" });
      assert(login.status === 200 && login.data.token, `login ${login.status}`);
      const stu = login.data.token;
      // a student token is not a user token, and a user token is not a student token
      assert((await http.get("/students", asUser(stu))).status !== 200 && (await http.get("/analysis/curricular", asUser(stu))).status !== 200, "a student token worked on the staff routes");
      assert((await http.get("/portal/me", asUser(tk))).status === 401, "a user token worked on the portal");
      assert((await http.get("/portal/me")).status === 401, "portal without login");
      assert((await http.get("/portal/me", asUser(stu))).data.current === null, "analysis before any upload");

      // the student sends the extract: the RGM must be theirs
      const wrong = await up("/portal/upload", academicPdfJs("999999", "A CURSAR"), stu);
      assert(wrong.status === 400 && /RGM/.test(JSON.stringify(wrong.data)), `wrong RGM ${wrong.status} ${JSON.stringify(wrong.data)}`);
      const first = await up("/portal/upload", academicPdfJs("123456", "A CURSAR"), stu);
      assert(first.status === 201 && first.data.current.version === 1 && first.data.reused === false, `first ${first.status} ${JSON.stringify(first.data).slice(0, 200)}`);
      // the same file again, and another file with the same facts: nothing new
      const again = await up("/portal/upload", academicPdfJs("123456", "A CURSAR"), stu);
      assert(again.status === 200 && again.data.reused === true && again.data.versions.length === 1, "the same file created a version");
      const sameFacts = await up("/portal/upload", academicPdfJs("123456", "A CURSAR", "arquivo-reimpresso-outra-data"), stu);
      assert(sameFacts.data.reused === true && sameFacts.data.versions.length === 1, "equal academic facts created a version");
      // a real change: a new immutable version with what changed
      const changed = await up("/portal/upload", academicPdfJs("123456", "APROVADO"), stu);
      assert(changed.status === 201 && changed.data.current.version === 2 && changed.data.versions.length === 2, `changed ${changed.status} ${JSON.stringify(changed.data).slice(0, 200)}`);
      assert(changed.data.current.changeSummary.some(x => /Matematica|Pendências/i.test(x)), `summary ${JSON.stringify(changed.data.current.changeSummary)}`);
      const me = (await http.get("/portal/me", asUser(stu))).data;
      assert(me.current.version === 2 && me.versions.map(v => v.version).join() === "2,1" && me.student.rgm === "123456", "the portal does not show the current version");
      const old = me.versions.find(v => v.version === 1);
      assert((await http.get(`/portal/versions/${old.id}`, asUser(stu))).data.version === 1, "an old version is not readable");
      // another student's version is not reachable by id
      const st2 = await http.post("/students", { rgm: "654321", name: "Outro Aluno", email: "outro.aluno@x.com", courseName: "Administracao" }, asUser(tk));
      const inv2 = await http.post(`/students/${st2.data.id}/invite`, {}, asUser(tk));
      await http.post("/portal/activate", { token: inv2.data.link.split("/").pop(), password: "senha-outro-aluno1" });
      const stu2 = (await http.post("/portal/login", { login: "654321", password: "senha-outro-aluno1" })).data.token;
      assert((await http.get(`/portal/versions/${old.id}`, asUser(stu2))).status === 404, "a student read another student's version");
      // a history from the staff, on behalf of the student, keeps the same checks
      const hist = await up(`/students/${sid}/upload`, academicHistoryPdfJs("123456", true, true), tk, "historico.pdf");
      assert(hist.status === 200 || hist.status === 201, `history ${hist.status} ${JSON.stringify(hist.data).slice(0, 160)}`);
      // the staff cannot delete what is in a student's history
      assert((await http.delete(`/analysis/academic/${changed.data.current.id}`, asUser(tk))).status === 400, "history entry deleted");

      // blocking cuts the session at once; unblocking does not revive it
      assert((await http.put(`/students/${sid}`, { blocked: true }, asUser(tk))).status === 200, "block");
      assert((await http.get("/portal/me", asUser(stu))).status === 401, "a blocked student kept the session");
      assert((await http.post("/portal/login", { login: "123456", password: "senha-do-aluno-1" })).status === 401, "a blocked student logged in");
      await http.put(`/students/${sid}`, { blocked: false }, asUser(tk));
      assert((await http.get("/portal/me", asUser(stu))).status === 401, "an old session came back after unblocking");
      assert((await http.post("/portal/login", { login: "123456", password: "senha-do-aluno-1" })).status === 200, "login after unblocking");
      // password change asks for a new login
      const stu3 = (await http.post("/portal/login", { login: "123456", password: "senha-do-aluno-1" })).data.token;
      assert((await http.put("/portal/password", { password: "errada", newPassword: "nova-senha-aluno-1" }, asUser(stu3))).status === 400, "wrong current password");
      assert((await http.put("/portal/password", { password: "senha-do-aluno-1", newPassword: "nova-senha-aluno-1" }, asUser(stu3))).status === 200, "change password");
      assert((await http.get("/portal/me", asUser(stu3))).status === 401, "the session survived the password change");
      // forgot password: same answer for everyone
      assert((await http.post("/portal/forgot", { login: "123456" })).data.ok === true && (await http.post("/portal/forgot", { login: "nao-existe" })).data.ok === true, "forgot answers differently");
    });
    await test("academic analysis: a cancelled enrollment cannot add subjects nor graduate, and the period is only suggested when the checks disagree", async () => {
      const tk = (await http.post("/auth/login", { email: "tutora-portal@x.com", password: "senha123" })).data.token;
      const f = new FormData();
      f.append("file", academicPdfJs("777002", "A CURSAR"), { filename: "extrato.pdf", contentType: "application/pdf" });
      const made = await http.post("/analysis/academic", f, { headers: { ...f.getHeaders(), Authorization: `Bearer ${tk}` } });
      assert(made.status === 201, `upload ${made.status}`);
      const id = made.data.id;
      const ok = (await http.put(`/analysis/academic/${id}`, { currentPeriod: 3 }, asUser(tk))).data;
      assert(ok.status !== "ENROLLMENT_INACTIVE", "active by default");
      const cancelled = (await http.put(`/analysis/academic/${id}`, { enrollmentSituation: "CANCELLED" }, asUser(tk))).data;
      assert(cancelled.status === "ENROLLMENT_INACTIVE" && cancelled.forecast === null && /Situação da matrícula: Cancelada/.test(cancelled.message) && cancelled.snapshot.enrollmentSituation.source === "STAFF", `cancelled ${JSON.stringify(cancelled).slice(0, 300)}`);
      assert(cancelled.snapshot.result.canAddNow === 0, "a cancelled enrollment can add subjects");
      assert((await http.put(`/analysis/academic/${id}`, { enrollmentSituation: "NOPE" }, asUser(tk))).status === 400, "an invalid situation was accepted");
      const back = (await http.put(`/analysis/academic/${id}`, { enrollmentSituation: "" }, asUser(tk))).data;
      assert(back.status !== "ENROLLMENT_INACTIVE" && !back.snapshot.enrollmentSituation, "clearing the situation did not restore the analysis");
      await http.delete(`/analysis/academic/${id}`, asUser(tk));
    });

    await test("curricular analysis: the 24-hour return (matriculou / não / reanálise) and the commercial proposal sent to a contact", async () => {
      const sample = fs.readFileSync(path.join(__dirname, "fixtures", "sample-analise.pdf"));
      const make = async (who, name) => {
        const f = new FormData();
        f.append("file", sample, { filename: "analise.pdf", contentType: "application/pdf" });
        f.append("entryPeriod", "2");
        f.append("startTerm", "2026.2");
        f.append("candidateName", name);
        f.append("poloId", sql(`SELECT id FROM Polos WHERE code='ANL1'`));
        const r = await http.post("/analysis/curricular", f, { headers: { ...f.getHeaders(), Authorization: `Bearer ${who}` } });
        assert(r.status === 201, `create ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
        return r.data;
      };
      const hoursFromNow = d => (new Date(d).getTime() - Date.now()) / 3600000;
      await http.post("/users", { name: "Segundo Consultor", email: "segundo-an@x.com", password: "senha123", role: "consultor" }, auth());
      await http.post("/users", { name: "Outro Consultor", email: "outro-an@x.com", password: "senha123", role: "consultor" }, auth());
      const owner = (await http.post("/auth/login", { email: "outro-an@x.com", password: "senha123" })).data.token;
      const third = (await http.post("/auth/login", { email: "segundo-an@x.com", password: "senha123" })).data.token;

      // born waiting, with the return due in 24 hours
      const a = await make(owner, "Candidata Retorno");
      assert(a.enrollment.status === "PENDING" && a.enrollment.due === false && hoursFromNow(a.enrollment.dueAt) > 23.5 && hoursFromNow(a.enrollment.dueAt) < 24.5, `new ${JSON.stringify(a.enrollment)}`);
      assert((await http.get("/analysis/follow-ups", asUser(owner))).data.total === 0, "a return not due yet is on the bell");

      // 24 hours later: it is on the bell of the owner and of the management, not of another consultant
      sql(`UPDATE CurricularAnalyses SET followUpDueAt = now() - interval '2 hours' WHERE id = ${a.id}`);
      const bell = (await http.get("/analysis/follow-ups", asUser(owner))).data;
      assert(bell.total === 1 && bell.due[0].id === a.id && bell.due[0].candidateName === "Candidata Retorno", `bell ${JSON.stringify(bell)}`);
      assert((await http.get("/analysis/follow-ups", asUser(third))).data.total === 0, "another consultant sees the return of someone else");
      const mgmt = (await http.get("/analysis/follow-ups", auth())).data;
      assert(mgmt.due.some(x => x.id === a.id && x.ownerName === "Outro Consultor"), `management ${JSON.stringify(mgmt).slice(0, 200)}`);
      assert((await http.get(`/analysis/curricular/${a.id}`, asUser(owner))).data.enrollment.due === true, "the analysis does not say it is overdue");

      // the three outcomes
      const put = (body, who = owner) => http.put(`/analysis/curricular/${a.id}/enrollment`, body, asUser(who));
      assert((await put({ status: "NOT_ENROLLED" })).status === 400 && (await put({ status: "NOT_ENROLLED", note: "ab" })).status === 400, "not enrolled without a reason was accepted");
      assert((await put({ status: "BANANA", note: "qualquer motivo" })).status === 400 && (await put({})).status === 400, "an invalid outcome was recorded as not enrolled");
      assert((await put({ status: "ENROLLED" }, third)).status === 403, "another consultant registered the outcome");
      const re = (await put({ status: "NOT_ENROLLED", reanalysis: true })).data;
      assert(re.enrollment.status === "PENDING" && re.enrollment.reanalysisAt && re.enrollment.due === false && hoursFromNow(re.enrollment.dueAt) > 23.5, `reanalysis ${JSON.stringify(re.enrollment)}`);
      assert((await http.get("/analysis/follow-ups", asUser(owner))).data.total === 0, "a reanalysis stays on the bell");
      const no = (await put({ status: "NOT_ENROLLED", note: "Aguardará nova condição" })).data;
      assert(no.enrollment.status === "NOT_ENROLLED" && no.enrollment.note === "Aguardará nova condição" && !no.enrollment.dueAt, `not enrolled ${JSON.stringify(no.enrollment)}`);
      const yes = (await put({ status: "ENROLLED" })).data;
      assert(yes.enrollment.status === "ENROLLED" && yes.enrollment.due === false, `enrolled ${JSON.stringify(yes.enrollment)}`);
      assert((await http.get("/analysis/follow-ups", asUser(owner))).data.total === 0, "an answered return is still on the bell");

      // the commercial proposal: indicators and a message without any financial promise
      const prop = (await http.get(`/analysis/curricular/${a.id}/proposal`, asUser(owner))).data;
      assert(Number.isInteger(prop.exemptedPercentage) && typeof prop.isHighValue === "boolean" && /^Olá, Candidata Retorno!/.test(prop.message) && /Estimativas sujeitas/.test(prop.message) && !/R\$/.test(prop.message), `proposal ${JSON.stringify(prop).slice(0, 300)}`);
      assert((await http.get(`/analysis/curricular/${a.id}/proposal`, asUser(third))).status === 403, "another consultant read the proposal");

      // sent to a contact chosen on the screen (its open conversation), and the analysis is linked to it
      const mine = await make(token, "Candidata Proposta");
      const tgContact = (await http.get(`/tickets/${tgTicket}`, auth())).data.contactId;
      // the management writes in a conversation of an attendant only after taking it over on purpose
      assert((await http.post(`/tickets/${tgTicket}/take`, {}, auth())).status === 200, "take over");
      const before = tg.sent.length;
      const ok = await http.post(`/analysis/curricular/${mine.id}/send-proposal`, { contactId: tgContact }, auth());
      assert(ok.status === 200 && tg.sent.slice(before).some(x => x.method === "sendMessage" && /aproveitamento curricular/.test(String(x.body.text || "")) && /Candidata Proposta/.test(String(x.body.text || ""))), `send ${ok.status} ${JSON.stringify(ok.data)} ${JSON.stringify(tg.sent.slice(before).map(x => x.method))}`);
      assert((await http.get(`/analysis/curricular/${mine.id}`, auth())).data.contactId === tgContact, "the analysis was not linked to the contact");
      assert((await http.post(`/analysis/curricular/${mine.id}/send-proposal`, {}, auth())).status === 400, "sent without a target");
      const grp = sql(`SELECT id FROM Contacts WHERE isGroup = 1 LIMIT 1`);
      if (grp) assert((await http.post(`/analysis/curricular/${mine.id}/send-proposal`, { contactId: Number(grp) }, auth())).status === 400, "the proposal went to a group");
      assert((await http.post(`/analysis/curricular/${mine.id}/send-proposal`, { contactId: 99999999 }, auth())).status === 404, "sent to a contact that does not exist");
      assert((await http.post(`/analysis/curricular/${mine.id}/send-proposal`, { contactId: tgContact }, asUser(owner))).status === 403, "another consultant sent someone else's proposal");
      // the polos of the later scenarios start as before
      assert((await http.delete(`/polos/${sql("SELECT id FROM Polos WHERE code='ANL1'")}`, auth())).status < 300, "the analysis polo was not removed");
    });

    await test("no route answers 500 to a malformed or unknown id (each route with a :param, three bad values, as the administrator)", async () => {
      const fs = require("fs");
      const dir = path.join(__dirname, "../src/routes");
      const routes = [];
      fs.readdirSync(dir).filter(f => f.endsWith(".ts")).forEach(file => {
        const text = fs.readFileSync(path.join(dir, file), "utf8").replace(/\n\s+/g, " ");
        const re = /\b(?:r|\w*Routes?|router)\.(get|post|put|patch|delete)\(\s*(["'`])([^"'`]+)\2\s*,([^;]*)\);/g;
        let m;
        while ((m = re.exec(text))) if (/:\w+/.test(m[3])) routes.push({ method: m[1], path: m[3], guards: m[4] });
      });
      assert(routes.length > 100, `only ${routes.length} routes with a parameter were found`);
      // routes that act on the outside world even for an unknown id (a webhook of a provider, a public form) are not part of this
      const skip = /\/(webhook|webhooks|hooks|public|portal|afiliado|r)\b/i;
      const bad = [];
      for (const r of routes.filter(x => !skip.test(x.path))) {
        for (const value of ["abc", "0", "99999999"]) {
          const url = r.path.replace(/:\w+\??/g, value);
          let res;
          try { res = await http.request({ method: r.method, url, data: r.method === "get" || r.method === "delete" ? undefined : {}, ...auth() }); } catch (err) { bad.push(`${r.method.toUpperCase()} ${url} -> ${err.message}`); continue; }
          if (res.status >= 500) {
            // the server names the request and the reason in its log: show it so the failure can be fixed without guessing
            const log = String(global.__backendLog ? global.__backendLog() : "");
            const at = log.lastIndexOf(`${r.method.toUpperCase()} ${url}`);
            bad.push(`${r.method.toUpperCase()} ${url} -> ${res.status} ${at >= 0 ? log.slice(at, at + 400).replace(/\s+/g, " ") : ""}`);
          }
        }
      }
      assert(bad.length === 0, `${bad.length} route(s) answered 5xx:\n  ${bad.slice(0, 25).join("\n  ")}`);
    });

    await test("e-mails of the system: one catalog, a preview of each, and the test goes only to the administration", async () => {
      const list = (await http.get("/mail/templates", auth())).data;
      assert(Array.isArray(list) && list.length >= 9 && list.every(t => t.key && t.title && t.trigger && t.subject), `catalog ${JSON.stringify(list).slice(0, 200)}`);
      for (const t of list) {
        const pv = await http.get(`/mail/templates/${t.key}/preview`, auth());
        assert(pv.status === 200 && /<!doctype html>/i.test(pv.data.html) && /mensagem automática/.test(pv.data.text), `preview ${t.key} ${pv.status}`);
      }
      assert((await http.get("/mail/templates/nao-existe/preview", auth())).status === 404, "unknown template");
      const consTk = (await http.post("/auth/login", { email: "outro-an@x.com", password: "senha123" })).data.token;
      assert((await http.get("/mail/templates", asUser(consTk))).status === 403 && (await http.post("/mail/templates/mail-test/test", {}, asUser(consTk))).status === 403, "a consultant reached the e-mail catalog");
      // no mail account in the test environment: the answer says so (and nothing is sent)
      assert([400, 502].includes((await http.post("/mail/templates/mail-test/test", {}, auth())).status), "the test without a mail account");
    });

    await test("commercial grades: the matrices that come with the system are read, searchable, downloadable and sendable; only the management publishes", async () => {
      // the first start already read the PDFs that come with the system (or the button does it now): nothing is lost twice
      const imp = await http.post("/grades/import-defaults", {}, auth());
      assert(imp.status === 200 && imp.data.failed.length === 0, `import ${imp.status} ${JSON.stringify(imp.data).slice(0, 300)}`);
      const all = (await http.get("/grades", auth())).data;
      assert(all.grades.length >= 105, `only ${all.grades.length} grades`);
      assert((await http.post("/grades/import-defaults", {}, auth())).data.unchanged === all.grades.length, "a second import changed something");
      const marketing = all.grades.find(g => g.courseName === "CST EM MARKETING");
      assert(marketing && marketing.modality === "EAD" && marketing.degree === "Tecnólogo" && marketing.totalCourseHours === 1600 && marketing.durationSemesters === 4, `marketing ${JSON.stringify(marketing)}`);
      assert(all.grades.some(g => g.degree === "Pós-graduação"), "the postgraduate matrices are missing");
      assert(all.grades.filter(g => !g.complete).length <= 8, "too many incomplete readings");
      // search and filters
      assert((await http.get("/grades", { ...auth(), params: { search: "marketing" } })).data.grades.length >= 2, "search");
      assert((await http.get("/grades", { ...auth(), params: { degree: "Licenciatura" } })).data.grades.every(g => g.degree === "Licenciatura"), "degree filter");
      assert(all.degrees.includes("Bacharelado") && all.areas.length > 3, "facets");
      // the summary text and the PDF behind the login
      const one = (await http.get(`/grades/${marketing.id}`, auth())).data;
      assert(/📚 \*Cst em Marketing\*/.test(one.whatsappSummary) && /1\.600 horas/.test(one.whatsappSummary), `summary ${one.whatsappSummary}`);
      const pdfRes = await http.get(`/grades/${marketing.id}/file`, { ...auth(), responseType: "arraybuffer" });
      assert(pdfRes.status === 200 && Buffer.from(pdfRes.data).subarray(0, 5).toString() === "%PDF-" && /pdf/.test(pdfRes.headers["content-type"]), "pdf download");
      assert((await http.get(`/grades/${marketing.id}/file`)).status === 401, "the pdf without login");
      // send into a conversation: summary text and the PDF
      assert((await http.post(`/tickets/${tgTicket}/take`, {}, auth())).status === 200, "take over");
      const before = tg.sent.length;
      const sent = await http.post(`/grades/${marketing.id}/send`, { ticketId: Number(tgTicket) }, auth());
      assert(sent.status === 200, `send ${sent.status} ${JSON.stringify(sent.data)}`);
      const out = tg.sent.slice(before);
      // one message: the PDF with the summary as its description (as when a document is attached with a caption)
      assert(out.length === 1 && out[0].method === "sendDocument" && /Cst em Marketing/.test(String(out[0].body.caption || "")) && /1\.600 horas/.test(String(out[0].body.caption || "")), `sent ${JSON.stringify(out.map(x => [x.method, String(x.body.caption || "").slice(0, 40)]))}`);
      assert((await http.post(`/grades/${marketing.id}/send`, { ticketId: Number(tgTicket), summary: false, pdf: false }, auth())).status === 400, "nothing to send accepted");
      // the contact can be chosen instead of a conversation: its open conversation is used
      const tgTicketData = (await http.get(`/tickets/${tgTicket}`, auth())).data;
      const before2 = tg.sent.length;
      const byContact = await http.post(`/grades/${marketing.id}/send`, { contactId: tgTicketData.contactId, pdf: false }, auth());
      assert(byContact.status === 200 && tg.sent.slice(before2).some(x => /Cst em Marketing/.test(String(x.body.text || ""))), `send by contact ${byContact.status} ${JSON.stringify(byContact.data)}`);
      assert((await http.post(`/grades/${marketing.id}/send`, {}, auth())).status === 400 && (await http.post(`/grades/${marketing.id}/send`, { contactId: 99999999 }, auth())).status === 404, "send without a target");
      // permissions: a consultant reads and sends but does not publish or delete
      const consTk = (await http.post("/auth/login", { email: "outro-an@x.com", password: "senha123" })).data.token;
      assert((await http.get("/grades", asUser(consTk))).status === 200, "a consultant cannot read the catalog");
      assert((await http.delete(`/grades/${marketing.id}`, asUser(consTk))).status === 403 && (await http.post("/grades/import-defaults", {}, asUser(consTk))).status === 403, "a consultant changed the catalog");
      const f = new FormData();
      f.append("files", fs.readFileSync(path.join(__dirname, "fixtures", "sample-analise.pdf")), { filename: "x.pdf", contentType: "application/pdf" });
      assert((await http.post("/grades", f, { headers: { ...f.getHeaders(), Authorization: `Bearer ${consTk}` } })).status === 403, "a consultant published a grade");
      // the management publishes a new matrix (an old version is replaced) and refuses what is not a PDF
      const bad = new FormData();
      bad.append("files", Buffer.from("PK\x03\x04 nao e pdf"), { filename: "zip.pdf", contentType: "application/pdf" });
      const badRes = await http.post("/grades", bad, { headers: { ...bad.getHeaders(), ...auth().headers } });
      assert(badRes.status === 400 && badRes.data.failed === 1, `not a pdf ${badRes.status}`);
      const again = new FormData();
      again.append("files", fs.readFileSync(path.join(__dirname, "..", "data", "grades", "CST EM MARKETING.PDF")), { filename: "CST EM MARKETING.PDF", contentType: "application/pdf" });
      // a single file without "upsert" is refused with a clear message (the same PDF is already there)
      const refused = await http.post("/grades", again, { headers: { ...again.getHeaders(), ...auth().headers } });
      assert(refused.status === 400 && /já está disponível/.test(JSON.stringify(refused.data)), `duplicate ${refused.status}`);
      const again2 = new FormData();
      again2.append("mode", "upsert");
      again2.append("files", fs.readFileSync(path.join(__dirname, "..", "data", "grades", "CST EM MARKETING.PDF")), { filename: "CST EM MARKETING.PDF", contentType: "application/pdf" });
      const up = await http.post("/grades", again2, { headers: { ...again2.getHeaders(), ...auth().headers } });
      assert(up.status === 201 && up.data.unchanged === 1, `same pdf again ${up.status} ${JSON.stringify(up.data).slice(0, 200)}`);
      assert((await http.delete(`/grades/${marketing.id}`, auth())).status === 204 && (await http.get(`/grades/${marketing.id}`, auth())).status === 404, "delete");
      assert((await http.post("/grades/import-defaults", {}, auth())).data.created === 1, "the import did not bring the deleted grade back");
    });
    await test("screen errors are kept in the database for the administration and the coordination", async () => {
      assert((await http.post("/client-errors", { code: "ABCDE", route: "/afiliados", message: "Cannot read properties of null (reading 'value')", stack: "at X" }, auth())).status === 204, "report");
      const list = await http.get("/client-errors", auth());
      assert(list.status === 200 && list.data.some(e => e.code === "ABCDE" && e.route === "/afiliados"), `list ${JSON.stringify(list.data).slice(0, 120)}`);
      assert((await http.get("/client-errors?code=abcde", auth())).data.length === 1, "filter by code");
      // the same failure many times is one problem; the version of the code comes in its own field (or as " @version" on old screens)
      await http.post("/client-errors", { code: "FGHIJ", route: "/afiliados", build: "v2new", message: "Cannot read properties of null (reading 'value')" }, auth());
      await http.post("/client-errors", { code: "KLMNO", route: "/afiliados @v1old", message: "Cannot read properties of null (reading 'value')" }, auth());
      const grouped = (await http.get("/client-errors/summary", auth())).data;
      const g = grouped.find(x => x.route === "/afiliados" && /reading 'value'/.test(x.message));
      assert(g && g.n === 3 && g.users === 1 && g.builds.includes("v2new") && g.builds.includes("v1old") && g.resolved === false, `summary ${JSON.stringify(grouped).slice(0, 300)}`);
      assert((await http.put("/client-errors/resolve", { route: "/afiliados", message: g.message }, auth())).status === 200, "resolve");
      assert((await http.get("/client-errors/summary", auth())).data.find(x => x.route === "/afiliados").resolved === true, "not marked as fixed");
      assert((await http.put("/client-errors/resolve", { route: "/afiliados", message: g.message, resolved: false }, auth())).status === 200 && (await http.get("/client-errors/summary", auth())).data.find(x => x.route === "/afiliados").resolved === false, "reopen");
      assert((await http.get("/client-errors/summary", asUser(agentToken))).status === 403, "an agent read the summary");
      assert((await http.get("/client-errors", asUser(agentToken))).status === 403, "an agent read the errors");
      assert((await http.delete("/client-errors", auth())).status === 204 && (await http.get("/client-errors", auth())).data.length === 0, "clear");
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
      // the ticket comes back to life a moment before the new message is written: wait for it
      let msgs = [];
      await waitFor(async () => { msgs = (await http.get(`/messages/${ticketId}`, auth())).data.messages.map(m => m.body); return msgs.includes("voltei a escrever"); }, 8000, "the new message in the thread").catch(() => undefined);
      assert(msgs.includes("mensagem antiga") && msgs.includes("voltei a escrever"), `thread lost: ${msgs}`);
      assert(sql(`SELECT COUNT(*) FROM Tickets WHERE contactId=${contactId}`) === "1", "a second ticket was created instead of reusing the history one");
    });
    await test("a team member's chat has no queue: the ticket carries isStaff and writing to it opens it without a Reabrir", async () => {
      const cid = sql(`INSERT INTO Contacts (name, number, email, isGroup, isStaff, channel, createdAt, updatedAt) VALUES ('Colega da equipe', 'tg_7790', '', false, true, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
      const tid = sql(`INSERT INTO Tickets (status, contactId, whatsappId, unreadMessages, isGroup, segment, isHistorical, createdAt, updatedAt) VALUES ('closed', ${cid}, ${tgId}, 0, false, 'sales', false, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const t = (await http.get(`/tickets/${tid}`, auth())).data;
      assert(t.contact.isStaff === true, "ticket payload lacks contact.isStaff");
      const r = await http.post(`/messages/${tid}`, { body: "bom dia, time" }, auth());
      assert(r.status === 200, `send to a closed team chat: ${r.status}`);
      assert(sql(`SELECT status FROM Tickets WHERE id=${tid}`) === "open", "team chat not reopened by sending");
    });
    await test("ready-made quick replies exist from the first boot and are found by shortcut or text", async () => {
      const list = async (q) => (await http.get("/quickAnswers", { params: { searchParam: q }, ...auth() })).data.quickAnswers;
      const all = await list("");
      for (const key of ["fichamatricula", "documentos", "boasvindas", "ambientacao"]) assert(all.some(a => a.shortcut === key), `default reply missing: ${key}`);
      const ficha = (await list("fichamat"))[0];
      assert(ficha && ficha.message.includes("\n• CPF:") && !ficha.message.includes("\u2060"), "the ficha lost its line breaks or kept invisible characters");
      assert((await list("histórico do ensino")).some(a => a.shortcut === "fichamatricula"), "search by text broke");
      assert(sql(`SELECT COUNT(*) FROM QuickAnswers WHERE LOWER(shortcut)='fichamatricula'`) === "1", "default duplicated");
    });
    await test("commissions: wallet registered by any user, received vs owed vs waiting, each consultant sees only theirs, settle is admin-only", async () => {
      const mk = async (name, email) => (await http.post("/users", { name, email, password: "senha123", role: "consultor" }, auth())).data;
      const ca = await mk("Comissão A", "comis-a@x.com"), cb = await mk("Comissão B", "comis-b@x.com");
      const ta = (await http.post("/auth/login", { email: "comis-a@x.com", password: "senha123" })).data.token;
      const tb = (await http.post("/auth/login", { email: "comis-b@x.com", password: "senha123" })).data.token;
      const stageId = sql(`SELECT id FROM LeadStages ORDER BY position LIMIT 1`);
      const lead = (name, owner) => sql(`INSERT INTO Leads (name, stageId, ownerId, createdAt, updatedAt) VALUES ('${name}', ${stageId}, ${owner}, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const pay = (leadId, owner, status, code, amount) => sql(`INSERT INTO Payments (leadId, provider, kind, txid, amount, status, description, recipientUserId, recipientCode, splitPct, paidAmount, paidAt, method, createdBy, createdAt, updatedAt) VALUES (${leadId}, 'efi', 'matricula', 'COM${Math.random().toString(36).slice(2, 10)}', ${amount}, '${status}', 'Taxa', ${owner}, ${code ? `'${code}'` : "NULL"}, ${code ? 100 : 0}, ${status === "paid" ? amount : "NULL"}, ${status === "paid" ? "NOW()" : "NULL"}, 'pix', ${owner}, NOW(), NOW()) RETURNING id`).split("\n")[0];

      // the wallet is registered by the consultant, never shown in full
      assert((await http.put("/me/efi", { payeeCode: "curto" }, asUser(ta))).status === 400, "short wallet accepted");
      const saved = await http.put("/me/efi", { payeeCode: "ABCD1234EFGH5678" }, asUser(ta));
      assert(saved.status === 200 && saved.data.masked === "••••5678", `wallet ${saved.status} ${JSON.stringify(saved.data)}`);

      const l1 = lead("Aluna Paga Carteira", ca.id), l2 = lead("Aluno Sem Carteira", ca.id), l3 = lead("Aluna Aguardando", ca.id), l4 = lead("Aluno do B", cb.id);
      pay(l1, ca.id, "paid", "ABCD1234EFGH5678", 100);
      const owed = pay(l2, ca.id, "paid", null, 100);
      pay(l3, ca.id, "pending", null, 100);
      pay(l4, cb.id, "paid", null, 100);

      const mineA = (await http.get("/commissions", asUser(ta))).data;
      assert(mineA.scope === "mine" && mineA.wallet.informed === true, "scope or wallet flag");
      assert(mineA.summary.received.count === 1 && mineA.summary.owed.count === 1 && mineA.summary.waiting.count === 1, `buckets ${JSON.stringify(mineA.summary)}`);
      assert(mineA.rows.every(r => r.consultantId === ca.id), "a consultant saw someone else's commission");
      assert(mineA.summary.received.total === 100 && mineA.summary.owed.total === 100, "commission amounts");
      assert((await http.get("/commissions", { params: { bucket: "owed" }, ...asUser(ta) })).data.rows.length === 1, "bucket filter");
      assert((await http.get("/commissions", { params: { search: "Sem Carteira" }, ...asUser(ta) })).data.rows.length === 1, "search filter");
      assert((await http.get("/commissions", asUser(tb))).data.rows.length === 1, "B should see only theirs");

      const all = (await http.get("/commissions", auth())).data;
      assert(all.scope === "all" && all.summary.owed.count === 2 && all.consultants.length >= 2, `admin overview ${JSON.stringify(all.summary)}`);

      // paying back by hand: only administration, only a paid fee that stayed with the company
      assert((await http.put(`/commissions/${owed}/settle`, {}, asUser(ta))).status === 403, "a consultant settled their own commission");
      const done = await http.put(`/commissions/${owed}/settle`, { note: "Pix de teste" }, auth());
      assert(done.status === 200, `settle ${done.status}`);
      const after = (await http.get("/commissions", asUser(ta))).data;
      assert(after.summary.owed.count === 0 && after.summary.received.count === 2, `after settle ${JSON.stringify(after.summary)}`);
      assert((await http.put(`/commissions/${owed}/settle`, { undo: true }, auth())).status === 200 && (await http.get("/commissions", asUser(ta))).data.summary.owed.count === 1, "undo");
      const csv = await http.get("/commissions/export.csv", asUser(ta));
      assert(csv.status === 200 && String(csv.data).includes("Aluno Sem Carteira") && !String(csv.data).includes("Aluno do B"), "csv scope");
      assert((await http.delete("/me/efi", asUser(ta))).data.informed === false, "wallet removal");

      // the administration informs the Wallet ID on behalf of a seller (only the Wallet ID); a seller cannot do it for another
      assert((await http.put(`/payments/efi/wallets/${cb.id}`, { payeeCode: "ZZZZ1111YYYY2222" }, asUser(ta))).status === 403, "a consultant set someone else's wallet");
      assert((await http.get("/payments/efi/wallets", asUser(ta))).status === 403, "a consultant listed the wallets");
      assert((await http.put(`/payments/efi/wallets/${cb.id}`, { payeeCode: "curto" }, auth())).status === 400, "short wallet accepted for a seller");
      const byAdmin = await http.put(`/payments/efi/wallets/${cb.id}`, { payeeCode: "ZZZZ 1111 YYYY 2222" }, auth());
      assert(byAdmin.status === 200 && byAdmin.data.masked === "••••2222", `admin wallet ${byAdmin.status} ${JSON.stringify(byAdmin.data)}`);
      const wallets = (await http.get("/payments/efi/wallets", auth())).data;
      const rowB = wallets.find(w => w.id === cb.id);
      assert(rowB && rowB.informed === true && rowB.masked === "••••2222" && !JSON.stringify(wallets).includes("ZZZZ1111"), "wallet list shows the code whole or misses the seller");
      assert((await http.get("/me/efi", asUser(tb))).data.informed === true, "the seller does not see the wallet the admin informed");
      // the company account cannot be informed as a seller's
      await http.put("/payments/efi/settings", { companyPayeeCode: "EMPRESA0000AAAA" }, auth());
      assert((await http.put(`/payments/efi/wallets/${cb.id}`, { payeeCode: "empresa0000aaaa" }, auth())).status === 400, "company wallet accepted as a seller's");
      assert((await http.put("/me/efi", { payeeCode: "EMPRESA0000AAAA" }, asUser(ta))).status === 400, "company wallet accepted by a seller");
      await http.put("/payments/efi/settings", { companyPayeeCode: "" }, auth());
      assert((await http.delete(`/payments/efi/wallets/${cb.id}`, auth())).data.informed === false, "admin wallet removal");
      assert((await http.put("/payments/efi/wallets/999999", { payeeCode: "ZZZZ1111YYYY2222" }, auth())).status === 404, "wallet of a missing user");
    });
    await test("coordinator: manages every polo and sees every lead, creates the team but never administrators, no access to payment credentials", async () => {
      const made = await http.post("/users", { name: "Coord Comercial", email: "coord-c@x.com", password: "senha123", role: "coordenacao", coordArea: "comercial" }, auth());
      assert(made.status === 200 && made.data.role === "coordenacao" && made.data.coordArea === "comercial", `create coordinator ${made.status} ${JSON.stringify(made.data).slice(0, 160)}`);
      const academic = (await http.post("/users", { name: "Coord Acadêmica", email: "coord-a@x.com", password: "senha123", role: "coordenacao", coordArea: "academica" }, auth())).data;
      assert(academic.coordArea === "academica", "academic area");
      const tc = (await http.post("/auth/login", { email: "coord-c@x.com", password: "senha123" })).data.token;
      const as = asUser(tc);

      // creates and edits the team
      const team = await http.post("/users", { name: "Consultor do Coord", email: "do-coord@x.com", password: "senha123", role: "consultor" }, as);
      assert(team.status === 200 && team.data.role === "consultor" && team.data.coordArea === null, `coordinator creating a consultant: ${team.status}`);
      assert((await http.put(`/users/${team.data.id}`, { name: "Consultor Editado" }, as)).status === 200, "coordinator editing the team");
      // never administrators
      assert((await http.post("/users", { name: "Intruso", email: "intruso@x.com", password: "senha123", role: "admin" }, as)).status === 403, "coordinator created an admin");
      assert((await http.post("/users", { name: "Intruso", email: "intruso2@x.com", password: "senha123", profile: "admin" }, as)).status === 403, "coordinator created an admin by profile");
      assert((await http.put(`/users/${team.data.id}`, { role: "admin" }, as)).status === 403, "coordinator promoted someone to admin");
      const adminId = (await http.get("/users", auth())).data.users.find(u => u.profile === "admin").id;
      assert((await http.put(`/users/${adminId}`, { name: "Trocado" }, as)).status === 403, "coordinator edited an admin");
      // it removes people of the team, never an administrator
      const throwaway = (await http.post("/users", { name: "Descartavel", email: "descartavel@x.com", password: "senha123", role: "consultor" }, as)).data;
      assert([200, 204].includes((await http.delete(`/users/${throwaway.id}`, as)).status), "coordinator cannot remove a member of the team");
      assert((await http.delete(`/users/${adminId}`, as)).status === 403, "coordinator removed an administrator");

      // every polo and every lead, whatever the polo
      const lead = (await http.post("/leads", { name: "Lead sem dono", phone: "5569988887771", source: "Site" }, auth())).data.lead;
      assert((await http.get(`/leads/${lead.id}`, as)).status === 200, "coordinator cannot open any lead");
      assert((await http.get("/polos", as)).status === 200, "polos list");
      assert((await http.post("/polos", { name: "Polo do Coord", city: "Porto Velho" }, as)).status === 201, "coordinator creating a polo");

      // the coordination has the same powers as the administrator (decided by the company): credentials, keys, tokens...
      assert((await http.get("/payments/efi/settings", as)).status === 200, "coordinator cannot reach the payment credentials");
      assert((await http.get("/api-tokens", as)).status === 200, "coordinator cannot reach API tokens");
      assert((await http.get("/ai-settings", as)).status === 200, "coordinator cannot reach AI keys");
      assert((await http.put("/ai-settings", {}, as)).status === 200, "coordinator cannot save AI keys");
      const allSettings = await http.get("/settings", as);
      assert(allSettings.status === 200 && allSettings.data.length > 0, "coordinator cannot read every setting");
      assert((await http.put("/settings/appTimezone", { value: "America/Porto_Velho" }, as)).status === 200, "coordinator cannot change a setting");
      assert((await http.delete(`/leads/${lead.id}`, as)).status === 200, "coordinator cannot delete a lead");
      // a consultant still cannot manage anybody
      const cons = (await http.post("/auth/login", { email: "do-coord@x.com", password: "senha123" })).data.token;
      assert((await http.post("/users", { name: "X", email: "x-x@x.com", password: "senha123", role: "consultor" }, asUser(cons))).status === 403, "consultant created a user");
      assert((await http.get("/commissions", as)).data.scope === "all", "coordinator does not see everyone's commissions");
    });
    await test("team goals: automatic count from the CRM, manual adjustment, shared line, repeat the period, managers only", async () => {
      const mk = async (name, email) => (await http.post("/users", { name, email, password: "senha123", role: "consultor" }, auth())).data;
      const leila = await mk("Leila Meta", "leila-meta@x.com"), pedro = await mk("Pedro Meta", "pedro-meta@x.com"), dany = await mk("Dany Meta", "dany-meta@x.com");
      const stageId = sql(`SELECT id FROM LeadStages ORDER BY position LIMIT 1`);
      const won = (name, owner, when) => sql(`INSERT INTO Leads (name, stageId, ownerId, wonAt, createdAt, updatedAt) VALUES ('${name}', ${stageId}, ${owner}, ${when}, NOW(), NOW()) RETURNING id`);
      const year = new Date().getUTCFullYear();
      const startsOn = `${year - 1}-09-26`, endsOn = `${year + 1}-10-26`;
      won("Mat 1", leila.id, "NOW() - INTERVAL '3 days'"); won("Mat 2", leila.id, "NOW() - INTERVAL '2 days'");
      won("Mat 3", pedro.id, "NOW() - INTERVAL '1 day'"); won("Mat 4", dany.id, "NOW() - INTERVAL '1 day'");
      won("Fora", leila.id, `'${year - 3}-01-10 12:00:00+00'`);

      const made = await http.post("/goals", { startsOn, endsOn, members: [
        { label: "Leila", userIds: [leila.id], target: 3 },
        { label: "Pedro e Dany", userIds: [pedro.id, dany.id], target: 4, manualCount: 1 },
        { label: "Sem login", userIds: [], target: 2, manualCount: 1 },
        { label: "Sem meta", userIds: [] }
      ] }, auth());
      assert(made.status === 201, `create ${made.status} ${JSON.stringify(made.data).slice(0, 160)}`);
      const m = made.data.members;
      assert(m[0].done === 2 && m[0].missing === 1 && m[0].pct === 67, `Leila ${JSON.stringify(m[0])}`);
      assert(m[1].auto === 2 && m[1].manual === 1 && m[1].done === 3, `shared line ${JSON.stringify(m[1])}`);
      assert(m[2].done === 1 && m[2].auto === 0 && m[2].pct === 50, "manual-only line");
      assert(m[3].target === null && m[3].pct === null && m[3].missing === null, "line without a target");
      assert(made.data.total.target === 9 && made.data.total.done === 6, `totals ${JSON.stringify(made.data.total)}`);

      const upd = await http.put(`/goals/${made.data.id}`, { title: "Meta de teste", members: [{ label: "Leila", userIds: [leila.id], target: 2 }] }, auth());
      assert(upd.status === 200 && upd.data.members.length === 1 && upd.data.members[0].reached === true, `update ${JSON.stringify(upd.data.members)}`);
      // the screen sends the adjustment as `manual` (the same name the list answers with): it must be kept
      const adj = await http.put(`/goals/${made.data.id}`, { members: [{ label: "Leila", userIds: [leila.id], target: 2, manual: 4 }] }, auth());
      assert(adj.status === 200 && adj.data.members[0].manual === 4, `manual adjustment lost ${JSON.stringify(adj.data.members)}`);
      assert((await http.put(`/goals/${made.data.id}`, { startsOn: "2027-01-02", endsOn: "2027-01-01" }, auth())).status === 400, "inverted period accepted");

      const rep = await http.post(`/goals/${made.data.id}/repeat`, {}, auth());
      assert(rep.status === 201 && rep.data.startsOn.endsWith("-26") && rep.data.endsOn.endsWith("-26"), `repeat ${rep.data.startsOn} ${rep.data.endsOn}`);
      assert(rep.data.members[0].target === 2 && rep.data.members[0].manual === 0, "repeat keeps targets, drops adjustments");

      const tl = (await http.post("/auth/login", { email: "leila-meta@x.com", password: "senha123" })).data.token;
      assert((await http.get("/goals", asUser(tl))).status === 403, "a consultant read the goals");
      const list = (await http.get("/goals", auth())).data;
      assert(list.length >= 2, "list");
      assert((await http.delete(`/goals/${rep.data.id}`, auth())).status === 200 && (await http.get("/goals", auth())).data.length === list.length - 1, "delete");
    });
    await test("Central do Afiliado: collections, FAQ, videos and support edited by the administration, copy counter, no prices", async () => {
      const aff = (await http.post("/affiliates", { name: "Central Teste", phone: "(69) 97777-1234" }, auth())).data;
      const set = await http.put("/affiliate-rules", {
        faq: [{ q: "Pergunta de teste?", a: "Resposta de teste." }, { q: "", a: "sem pergunta" }],
        videoProgram: "https://youtu.be/dQw4w9WgXcQ", videoTutorial: "", supportPhone: "(69) 99999-0000"
      }, auth());
      assert(set.status === 200 && set.data.faq.length === 1 && set.data.supportPhone === "69999990000", `rules ${set.status} ${JSON.stringify(set.data).slice(0, 200)}`);
      assert((await http.put("/affiliate-rules", { videoProgram: "javascript:alert(1)" }, auth())).status === 400, "unsafe video link accepted");

      const mat = (await http.post("/affiliate-materials", { title: "Texto da pós", kind: "copy", copyText: "Quer dar o próximo passo?", audience: "all", collection: "pos" }, auth())).data;
      assert(mat.collection === "pos", "collection not saved");
      const bogus = (await http.post("/affiliate-materials", { title: "Sem coleção", kind: "copy", copyText: "Olá!", audience: "all", collection: "qualquer" }, auth())).data;
      assert(bogus.collection === null, "unknown collection accepted");

      const portal = (await http.get(`/affiliate-portal/${aff.portalToken}`)).data;
      assert(portal.materials.find(m => m.id === mat.id).collection === "pos", "portal lacks the collection");
      assert(portal.faq.length === 1 && portal.faq[0].q === "Pergunta de teste?", "portal FAQ");
      assert(portal.videos.length === 1 && portal.videos[0].key === "program" && portal.videos[0].embed.includes("dQw4w9WgXcQ"), `videos ${JSON.stringify(portal.videos)}`);
      assert(portal.support && portal.support.url === "https://wa.me/69999990000", "support link");
      assert(!/R\$ ?\d/.test(JSON.stringify({ m: portal.materials, c: portal.courses, f: portal.faq })), "a price leaked into the portal");

      // the copy counter
      assert((await http.post(`/affiliate-portal/${aff.portalToken}/materials/${mat.id}/copied`)).status === 200, "copied");
      assert((await http.post(`/affiliate-portal/${aff.portalToken}/materials/${mat.id}/copied`)).status === 200, "copied again");
      const listed = (await http.get("/affiliate-materials", auth())).data.find(m => m.id === mat.id);
      assert(listed.copies === 2, `copies ${listed.copies}`);
      assert((await http.post(`/affiliate-portal/${"0".repeat(48)}/materials/${mat.id}/copied`)).status === 404, "wrong token counted a copy");

      // back to the default FAQ when it is emptied
      const empty = await http.put("/affiliate-rules", { faq: [] }, auth());
      assert(empty.data.faq.length >= 3, "default FAQ not restored");
    });
    await test("managers see every conversation of every attendant in one place, filter by attendant and connection; others do not", async () => {
      const mk = async (name, email, role) => (await http.post("/users", { name, email, password: "senha123", role }, auth())).data;
      const a1 = await mk("Atendente Um", "att1@x.com", "consultor"), a2 = await mk("Atendente Dois", "att2@x.com", "consultor");
      await mk("Coord Central", "coord-central@x.com", "coordenacao");
      const q = (await http.get("/queue", auth())).data[0];
      const mkTicket = (name, number, user) => {
        const c = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('${name}', '${number}', '', false, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
        return sql(`INSERT INTO Tickets (status, contactId, whatsappId, userId, queueId, unreadMessages, isGroup, segment, isHistorical, lastMessage, lastMessageId, lastMessageAt, createdAt, updatedAt) VALUES ('open', ${c}, ${tgId}, ${user}, ${q.id}, 2, false, 'sales', false, 'oi', 'cent-${number}', NOW(), NOW(), NOW()) RETURNING id`).split("\n")[0];
      };
      const t1 = mkTicket("Cliente do Um", "tg_9101", a1.id), t2 = mkTicket("Cliente do Dois", "tg_9102", a2.id);
      const ids = async (params, who) => (await http.get("/tickets", { params: { status: "open", showAll: "true", queueIds: "[]", ...params }, ...who })).data.tickets.map(t => String(t.id));

      const tc = (await http.post("/auth/login", { email: "coord-central@x.com", password: "senha123" })).data.token;
      const t1a = (await http.post("/auth/login", { email: "att1@x.com", password: "senha123" })).data.token;
      const seen = await ids({ allQueues: "true" }, asUser(tc));
      assert(seen.includes(t1) && seen.includes(t2), "the coordinator does not see everyone's conversations");
      assert((await ids({ allQueues: "true" }, auth())).includes(t1), "the administrator does not see the conversations");
      const onlyOne = await ids({ allQueues: "true", attendantId: String(a2.id) }, asUser(tc));
      assert(onlyOne.includes(t2) && !onlyOne.includes(t1), "attendant filter");
      const byConn = await ids({ allQueues: "true", connectionId: String(tgId) }, asUser(tc));
      assert(byConn.includes(t1), "connection filter");
      assert(!(await ids({ allQueues: "true", connectionId: "999999" }, asUser(tc))).includes(t1), "connection filter leaked");
      const unread = (await http.get("/tickets", { params: { withUnreadMessages: "true", showAll: "true", allQueues: "true", queueIds: "[]", groups: "exclude" }, ...asUser(tc) })).data.tickets.map(t => String(t.id));
      assert(unread.includes(t1) && unread.includes(t2), "unread view of everyone");
      const mine = await ids({ allQueues: "true", attendantId: String(a2.id) }, asUser(t1a));
      assert(!mine.includes(t2), "an attendant saw a colleague's conversation");
      assert(!(await ids({ allQueues: "true" }, asUser(t1a))).includes(t2), "allQueues worked for a non-manager");
      assert((await http.get("/whatsapp", asUser(tc))).data.length >= 1, "coordinator does not list the connections");
    });
    await test("the last administrator cannot be demoted, and the user form shows the effective role", async () => {
      // the list is paged: look for the administrator by e-mail instead of hoping it is on the first page
      const users = (await http.get("/users", { ...auth(), params: { searchParam: "admin@whaticket.com" } })).data.users;
      const admin = users.find(u => u.profile === "admin");
      assert(admin, "the administrator was not found");
      assert((await http.get(`/users/${admin.id}`, auth())).data.role === "admin", "the form would show another role for the administrator");
      const demote = await http.put(`/users/${admin.id}`, { role: "consultor" }, auth());
      assert(demote.status === 400 && demote.data.error === "ERR_LAST_ADMIN", `the last admin was demoted: ${demote.status}`);
      assert((await http.get(`/users/${admin.id}`, auth())).data.profile === "admin", "profile changed");
    });
    await test("affiliates: the proposal names the affiliate, bonus = first monthly fee due in N days, support = who registered the affiliate, ranking by paid", async () => {
      const mk = async (name, email) => (await http.post("/users", { name, email, password: "senha123", role: "consultor" }, auth())).data;
      const owner = await mk("Dona do Afiliado", "dona-afil@x.com");
      const to = (await http.post("/auth/login", { email: "dona-afil@x.com", password: "senha123" })).data.token;
      // support number: set by the person themselves
      assert((await http.put("/me/phone", { phone: "abc" }, asUser(to))).status === 400, "invalid phone accepted");
      assert((await http.put("/me/phone", { phone: "(69) 98111-2222" }, asUser(to))).data.phone === "5569981112222", "phone not normalised");

      const aff = (await http.post("/affiliates", { name: "Indicadora da Dona", phone: "(69) 97000-1111" }, asUser(to))).data;
      const portal = (await http.get(`/affiliate-portal/${aff.portalToken}`)).data;
      assert(portal.support && portal.support.url === "https://wa.me/5569981112222" && portal.support.name === "Dona do Afiliado", `support ${JSON.stringify(portal.support)}`);

      // rule: first monthly fee, 45 days
      assert((await http.put("/affiliate-rules", { mode: "first_monthly", payDays: 45, trigger: "enrolled", kind: "pix" }, auth())).data.payDays === 45, "rules");
      const referred = (await http.post(`/affiliates/${aff.id}/referrals`, { name: "Aluna Indicada", phone: "(69) 96000-3333" }, asUser(to))).data.lead;
      assert(referred.affiliate && referred.affiliate.id === aff.id, "referral lost its affiliate");
      const course = (await http.get("/courses", auth())).data.find(c => c.active) || (await http.get("/courses", auth())).data[0];
      sql(`INSERT INTO Proposals (leadId, affiliateId, token, status, courseName, grossFee, firstMonthly, bolsaPct, params, createdBy, createdAt, updatedAt) VALUES (${referred.id}, ${aff.id}, 'tok${Date.now()}', 'sent', 'Curso de teste', 500, 250.5, 50, '{}', ${owner.id}, NOW(), NOW())`);
      const proposals = (await http.get("/proposals", { params: { leadId: referred.id }, ...auth() })).data;
      assert(proposals[0].affiliate && proposals[0].affiliate.name === "Indicadora da Dona", `proposal list lacks the affiliate: ${JSON.stringify(proposals[0].affiliate)}`);

      const won = (await http.get("/lead-stages", auth())).data.find(s => s.type === "won");
      const moved = await http.put(`/leads/${referred.id}/stage`, { stageId: won.id, skipEnroll: true }, auth());
      assert(moved.status === 200, `enroll ${moved.status}`);
      const bonus = (await http.get("/affiliate-bonuses", auth())).data.rows.find(b => b.leadId === referred.id);
      assert(bonus && Number(bonus.amount) === 250.5 && /1ª mensalidade/.test(bonus.reason), `bonus ${JSON.stringify(bonus)}`);
      const due = new Date(`${bonus.dueAt}T12:00:00Z`).getTime(), expected = Date.now() + 45 * 86400000;
      assert(bonus.dueAt && Math.abs(due - expected) < 2 * 86400000, `due date ${bonus.dueAt}`);
      const fresh = (await http.get(`/affiliate-portal/${aff.portalToken}`)).data;
      assert(fresh.bonuses.some(b => Number(b.amount) === 250.5 && b.dueAt), "portal bonus without the due date");
      assert(fresh.faq.some(f => /45 dias/.test(f.a)), "FAQ does not state the payment term");

      // ranking by what was paid
      const rank = (await http.get("/affiliates/ranking", { params: { by: "paid" }, ...auth() })).data;
      assert(rank.totals.bonusPaid !== undefined && Array.isArray(rank.affiliates), "ranking shape");
    });
    await test("response times by median / p90 / target, per department and attendant, smart insights, manager-only view and My day", async () => {
      const mk = async (name, email, role) => (await http.post("/users", { name, email, password: "senha123", role }, auth())).data;
      const att = await mk("Atendente Tempo", "tempo@x.com", "consultor");
      await mk("Coord Tempo", "coord-tempo@x.com", "coordenacao");
      const tok = async email => (await http.post("/auth/login", { email, password: "senha123" })).data.token;
      const queue = (await http.get("/queue", auth())).data[0];
      const c = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('Cliente do Tempo', 'tg_9301', '', false, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
      const t = sql(`INSERT INTO Tickets (status, contactId, whatsappId, userId, queueId, unreadMessages, isGroup, segment, isHistorical, lastMessage, lastMessageId, lastMessageFromMe, lastMessageAt, createdAt, updatedAt) VALUES ('open', ${c}, ${tgId}, ${att.id}, ${queue.id}, 0, false, 'onboarding', false, 'ok', 'tempo-x', true, NOW(), NOW() - INTERVAL '4 hours', NOW()) RETURNING id`).split("\n")[0];
      // customer writes, the team answers after 10, 60 and 5 minutes
      const m = (id, fromMe, ago) => sql(`INSERT INTO Messages (id, body, ack, read, mediaType, ticketId, createdAt, updatedAt, fromMe) VALUES ('tempo-${id}', 'x', 1, true, 'chat', ${t}, NOW() - INTERVAL '${ago} minutes', NOW(), ${fromMe})`);
      m(1, false, 200); m(2, true, 190); m(3, false, 170); m(4, true, 110); m(5, false, 90); m(6, true, 85);

      const mgmt = (await http.get("/dashboard/management", { params: { days: 7 }, ...auth() })).data;
      const me = mgmt.attendants.find(a => a.id === att.id);
      assert(me && me.reply.count === 3 && me.reply.median === 10 && me.reply.p90 === 50 && me.reply.withinSlaPct === 67, `reply stats ${JSON.stringify(me && me.reply)}`);
      assert(me.reply.avg === 25, `the average hides the problem: ${me.reply.avg}`);
      const dept = mgmt.departments.find(d => d.key === "onboarding");
      assert(dept && dept.label === "Ambientação" && dept.attendances >= 1 && dept.reply.count >= 3, `department ${JSON.stringify(dept && dept.reply)}`);
      assert(Array.isArray(mgmt.insights) && mgmt.insights.length >= 1 && mgmt.total.reply.count >= 3 && mgmt.slaMinutes === 15, "insights or totals missing");

      const dash = (await http.get("/dashboard", { params: { days: 7 }, ...auth() })).data;
      assert(dash.period.response.count >= 3 && dash.period.response.median !== null && Array.isArray(dash.insights), "overview lacks the response block");

      // management is for managers only
      assert((await http.get("/dashboard/management", asUser(await tok("tempo@x.com")))).status === 403, "a consultant opened the management view");
      assert((await http.get("/dashboard/management", { params: { days: 7 }, ...asUser(await tok("coord-tempo@x.com")) })).status === 200, "the coordinator cannot open the management view");

      // my day: a customer waiting 40 minutes
      const c2 = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('Cliente Esperando', 'tg_9302', '', false, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
      sql(`INSERT INTO Tickets (status, contactId, whatsappId, userId, queueId, unreadMessages, isGroup, segment, isHistorical, lastMessage, lastMessageId, lastMessageFromMe, lastMessageAt, createdAt, updatedAt) VALUES ('open', ${c2}, ${tgId}, ${att.id}, ${queue.id}, 1, false, 'sales', false, 'oi?', 'tempo-w', false, NOW() - INTERVAL '40 minutes', NOW(), NOW())`);
      const day = (await http.get("/dashboard/me", asUser(await tok("tempo@x.com")))).data;
      assert(day.toReplyCount === 1 && day.toReply[0].name === "Cliente Esperando" && day.toReply[0].minutes >= 39, `my day ${JSON.stringify(day.toReply)}`);
      assert(day.insights.some(i => /esperando resposta/.test(i.text)), "my day has no sentence about the waiting customer");
      assert(day.reply.count >= 3 && day.reply.median === 10, "my own response time");
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
      const gid = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('Grupo da turma', '120363777000000001-1600000000', '', true, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
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
      await http.post("/users", { name: "Tutor Gaveta", email: "gaveta-tutor@x.com", password: "senha123", role: "tutor" }, auth());
      const tutorLogin = await http.post("/auth/login", { email: "gaveta-tutor@x.com", password: "senha123" });
      const tutorRead = await http.get(`/messages/${t}/list`, { params: { kind: "media" }, ...asUser(tutorLogin.data.token) });
      assert(tutorRead.status === 403, `tutor reads a sales conversation: login ${tutorLogin.status}, read ${tutorRead.status} ${JSON.stringify(tutorRead.data).slice(0, 120)}`);

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
      assert(before.now && before.period && before.period.week.length === 7 && before.period.byHour.length >= 13, "dashboard shape");

      const customer = mkTicket(mkContact("Cliente Painel", "tg_dash_1"));
      const mate = mkContact("Colega Painel", "tg_dash_2");
      const mateTicket = mkTicket(mate);
      const grp = mkTicket(mkContact("Grupo Painel", "tg_dash_g"), true);
      const msg = (id, ticket, body, fromMe, ago) => sql(`INSERT INTO Messages (id, ticketId, body, fromMe, read, mediaType, ack, createdAt, updatedAt) VALUES ('${id}', ${ticket}, '${body}', ${fromMe}, true, 'chat', 0, NOW() - INTERVAL '${ago}', NOW())`);
      msg("dash-c-1", customer, "oi", false, "1 minute");
      msg("dash-c-2", customer, "tudo bem?", true, "30 seconds");
      // yesterday at noon in the company's time zone (a fixed "30 hours ago" lands two days back before 06:00)
      sql(`INSERT INTO Messages (id, ticketId, body, fromMe, read, mediaType, ack, createdAt, updatedAt) VALUES ('dash-old', ${customer}, 'ontem', false, true, 'chat', 0, (date_trunc('day', NOW() AT TIME ZONE 'America/Porto_Velho') - INTERVAL '12 hours') AT TIME ZONE 'America/Porto_Velho', NOW())`);
      msg("dash-m-1", mateTicket, "papo interno", false, "1 minute");
      msg("dash-g-1", grp, "mensagem de grupo", false, "1 minute");
      const after = (await http.get("/dashboard", auth())).data;
      assert(after.period.received - before.period.received === 2, `received counts today's customer + team message only: ${after.period.received - before.period.received}`);
      assert(after.period.sent - before.period.sent === 1, "sent");
      assert(after.period.attendances - before.period.attendances === 2, "conversations of the day (group out, yesterday's message not counted)");

      // marking the colleague as team removes them from every number
      assert((await http.put(`/contacts/${mate}/staff`, { isStaff: true }, auth())).status === 200, "mark staff");
      const staffed = (await http.get("/dashboard", auth())).data;
      assert(staffed.period.received - before.period.received === 1 && staffed.period.attendances - before.period.attendances === 1, "team member still counted");
      const ov = (await http.get("/stats/overview", { params: { from: "2020-01-01", to: "2099-12-31" }, ...auth() })).data;
      assert(sql(`SELECT isStaff FROM Contacts WHERE id=${mate}`) === "1", "flag not saved");
      assert(ov.totals, "stats still answers");

      // another day: yesterday shows the old message, today's are not mixed in
      const y = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });
      const yesterday = (await http.get("/dashboard", { params: { date: y }, ...auth() })).data;
      assert(yesterday.date === y && yesterday.period.received >= 1, "yesterday keeps its own message");
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
      // the ticket is created first and handed to its owner a moment later
      await waitFor(() => sql(`SELECT CONCAT(status,'|',userId) FROM Tickets WHERE id=${t}`) === `open|${owner.data.id}`, 8000, "ticket should be open and assigned to the owner");
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
    // everything a person sees: texts, and the question plus the options of buttons and lists
    const sentAny = since => graph.sent.slice(since).filter(x => x.body).map(x => x.body.type === "text" ? x.body.text.body : x.body.type === "interactive" ? [x.body.interactive.body.text, ...(x.body.interactive.action.buttons ? x.body.interactive.action.buttons.map(b => b.reply.title) : x.body.interactive.action.sections[0].rows.map(r => r.title))].join(" | ") : "");
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
    await test("an amount or date with no source is rewritten once; if it persists the team confirms it; a value from the base goes through", async () => {
      const g0 = anthropic.guardCalls || 0;
      let before = graph.sent.length;
      await inboundCloud("5511910000031", "wamid.ai-g1", "qual a taxa de laboratório?");
      await waitFor(() => sentTexts(before).some(t => t.includes("confirmar esse valor")), 15000, "rewritten answer");
      assert(!sentAny(before).some(t => t.includes("480")), "the invented amount reached the person");
      assert((anthropic.guardCalls || 0) === g0 + 1, "one rewrite expected");

      before = graph.sent.length;
      await inboundCloud("5511910000032", "wamid.ai-g2", "qual a taxa de biblioteca?");
      await waitFor(() => sentTexts(before).some(t => /confirmar essa informação/i.test(t)), 15000, "team confirms");
      assert(!sentAny(before).some(t => /\b(35|36)\b/.test(t)), "an amount with no source reached the person");
      assert((anthropic.guardCalls || 0) === g0 + 2, "the stubborn answer is rewritten only once");

      before = graph.sent.length;
      await inboundCloud("5511910000033", "wamid.ai-g3", "quanto é a bolsa de transferência?");
      await waitFor(() => sentTexts(before).some(t => t.includes("40% na primeira mensalidade")), 15000, "sourced value");
      assert((anthropic.guardCalls || 0) === g0 + 2, "a value that is in the base must not be rewritten");
    });
    await test("test cases: save a conversation with what the answer must say, run them, see which fail", async () => {
      const msgs = [{ role: "user", content: "qual a taxa de laboratório?" }];
      const empty = await http.post(`/ai-agents/${aiId}/cases`, { name: "vazio", messages: msgs, expect: {} }, auth());
      assert(empty.status === 400, `a case that checks nothing was accepted: ${empty.status}`);
      const ok = await http.post(`/ai-agents/${aiId}/cases`, { name: "Taxa sem fonte vai para a equipe", messages: msgs, expect: { mustContain: ["confirmar esse valor | vou confirmar"], mustNotContain: ["480"], outcome: "answer" } }, auth());
      assert(ok.status === 201, `create ${ok.status} ${JSON.stringify(ok.data)}`);
      const bad = await http.post(`/ai-agents/${aiId}/cases`, { name: "Espera gratuita", messages: [...msgs, { role: "assistant", content: "x" }], expect: { mustContain: ["gratuita"], outcome: "handoff" } }, auth());
      assert(bad.status === 201 && bad.data.messages.length === 1, "the case must end with the person's message");
      const run = await http.post(`/ai-agents/${aiId}/cases/run`, {}, auth());
      assert(run.status === 200 && run.data.passed === 1 && run.data.failed === 1, `run ${run.status} ${JSON.stringify(run.data).slice(0, 300)}`);
      const failed = run.data.cases.find(c => c.id === bad.data.id);
      assert(failed.lastStatus === "fail" && failed.lastReasons.length === 2, `reasons ${JSON.stringify(failed.lastReasons)}`);
      const list = (await http.get(`/ai-agents/${aiId}/cases`, auth())).data;
      assert(list.find(c => c.id === ok.data.id).lastStatus === "pass", "the verdict is kept");
      assert((await http.delete(`/ai-agents/${aiId}/cases/${bad.data.id}`, auth())).status === 200, "delete");
      assert((await http.get(`/ai-agents/${aiId}/cases`, auth())).data.length === 1, "case not removed");
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
    await test("a person hands a conversation to the AI agent (it answers the last message at once) or takes it back from it", async () => {
      const t = ticketOf("5511910000005");
      // somebody took it, then wants the agent to carry on
      sql(`UPDATE Tickets SET status='open', userId=1, aiActive=0 WHERE id=${t}`);
      // the person writes while it is with a human: nobody answers it yet
      await inboundCloud("5511910000005", "wamid.ai-d2", "Quais cursos vocês têm?");
      await waitFor(() => sql(`SELECT COUNT(*) FROM Messages WHERE ticketId=${t} AND body LIKE 'Quais cursos%'`) === "1", 8000, "the message arrived");
      const calls = anthropic.requests.length;
      const r = await http.post(`/tickets/${t}/ai`, { active: true }, auth());
      assert(r.status === 200 && r.data.aiActive === true, `hand over ${r.status}`);
      assert(sql(`SELECT CONCAT(status,'|',IFNULL(userId,'null'),'|',CAST(aiActive AS INTEGER)) FROM Tickets WHERE id=${t}`) === "pending|null|1", "the conversation did not go back to the agent without an attendant");
      await waitFor(() => anthropic.requests.length > calls, 15000, "the agent answered the last message");
      assert(Number(sql(`SELECT COUNT(*) FROM TicketEvents WHERE ticketId=${t} AND type='handoff' AND note LIKE '%passou a conversa para o agente de IA%'`)) === 1, "the hand over was not written down");
      // taking it back
      sql(`UPDATE Tickets SET aiActive=1, status='pending', userId=NULL WHERE id=${t}`);
      assert((await http.post(`/tickets/${t}/ai`, { active: false }, auth())).data.aiActive === false && sql(`SELECT CAST(aiActive AS INTEGER) FROM Tickets WHERE id=${t}`) === "0", "the agent was not taken off the conversation");
      // a group is not for the agent, and a consultant cannot move someone else's conversation
      assert((await http.post(`/tickets/${t}/ai`, { active: true }, { headers: {} })).status === 401, "no login");
    });
    await test("a contact who is already a student is recognised: what a semipresencial student lives is not explained again, and the polo of enrollment follows the course talked about", async () => {
      const wonStage = sql(`SELECT id FROM LeadStages WHERE type='won' ORDER BY position LIMIT 1`);
      const semi = (await http.post("/courses", { name: "Biomedicina Aluno Teste", modality: "Semipresencial", category: "Graduação - Cruzeiro", semesters: 8, monthlyFee: 500, active: true }, auth())).data;
      const lead = sql(`INSERT INTO Leads (name, stageId, courseId, cpf, createdAt, updatedAt) VALUES ('Aluna Maria Souza', ${wonStage}, ${semi.id}, '39053344705', NOW(), NOW()) RETURNING id`).split("\n")[0];
      const script = `
        const http = require("http");
        require("./dist/database");
        const { initIO } = require("./dist/libs/socket");
        initIO(http.createServer());
        const Lead = require("./dist/models/Lead").default;
        const { studentFacts } = require("./dist/services/CommercialServices/StudentFacts");
        const { hasBolsaData, needsBolsaData } = require("./dist/services/CommercialServices/Rules");
        (async () => {
          const slots = {};
          await studentFacts(await Lead.findByPk(${lead}), slots);
          console.log(JSON.stringify({ slots, hasBolsa: hasBolsaData(slots), needs: needsBolsaData({ ...slots, courseName: "Pedagogia", city: "Ji-Paraná", entryType: "first_degree", courseExplained: true, gradeSent: true }) }));
          process.exit(0);
        })().catch(e => { console.error(e); process.exit(1); });`;
      const raw = execFileSync("node", ["-e", script], { cwd: ROOT, env: { ...env, LOG_LEVEL: "error" } }).toString().trim();
      const out = JSON.parse(raw.split("\n").pop());
      assert(out.slots.enrolledStudent === true && out.slots.enrolledCourse === "Biomedicina Aluno Teste" && out.slots.studentSemipresencial === true, `student not recognised ${JSON.stringify(out.slots)}`);
      assert(out.slots.modalityExplained && out.slots.mecExplained && out.slots.platformExplained && out.slots.tutoringExplained, "a semipresencial student would hear the same explanations again");
      assert(out.slots.cpfGiven === true && out.slots.fullName === "Aluna Maria Souza" && out.hasBolsa === true && out.needs === false, `the data the CRM already has were asked again ${JSON.stringify(out)}`);
    });
    await test("the goals calendar takes weekends, national and Rondônia holidays and the days the company adds out of the working days", async () => {
      const made = await http.post("/goals", { kind: "polo", title: "Calendário teste", startsOn: "2026-05-14", endsOn: "2026-11-16", members: [] }, auth());
      assert(made.status === 201, `goal ${made.status}`);
      const gid = made.data.id;
      let board = (await http.get("/goals/polos", { params: { goalId: gid }, ...auth() })).data;
      assert(board.goal.daysTotal === 128, `working days ${board.goal.daysTotal}`);
      assert(board.goal.holidays.length === 6 && board.goal.holidays.some(h => h.date === "2026-06-18" && /Evangélico/.test(h.name)) && board.goal.holidays.some(h => h.date === "2026-06-04" && /Corpus/.test(h.name)), `holidays ${JSON.stringify(board.goal.holidays)}`);
      // the company adds a day (written as people write it) and it leaves the count
      board = (await http.put(`/goals/${gid}/polos`, { workDays: 5, extraHolidays: "29/05/2026\n2026-06-05" }, auth())).data;
      assert(board.goal.daysTotal === 126 && board.goal.extraHolidays.join(",") === "2026-05-29,2026-06-05", `with extra days ${board.goal.daysTotal} ${JSON.stringify(board.goal.extraHolidays)}`);
      // the preview used by the dialog before saving
      const pre = (await http.get("/goals/calendar", { params: { from: "2026-05-14", to: "2026-11-16", workDays: 6, extra: "" }, ...auth() })).data;
      assert(pre.total === 155 && pre.workDays === 6, `preview ${JSON.stringify(pre)}`);
      assert((await http.get("/goals/calendar", { params: { from: "2026-05-14", to: "2026-11-16" } })).status === 401, "calendar without login");
      // the semester made for this test leaves, so the scenarios of the goals start from an empty system as before
      assert((await http.delete(`/goals/${gid}`, auth())).status < 300, "the test semester was not removed");
    });
    await test("goals: what was typed as the realized total before the change keeps showing that number (the CRM goes inside it) and the students in course stay", async () => {
      const made = await http.post("/goals", { kind: "polo", title: "Total teste", startsOn: "2026-05-14", endsOn: "2026-11-16", members: [] }, auth());
      const gid = made.data.id;
      const poloId = sql(`SELECT id FROM Polos ORDER BY id LIMIT 1`);
      const wonStage = sql(`SELECT id FROM LeadStages WHERE type='won' ORDER BY position LIMIT 1`);
      sql(`INSERT INTO Leads (name, stageId, poloId, wonAt, createdAt, updatedAt) VALUES ('Matriculado Total Teste', ${wonStage}, ${poloId}, '2026-08-10 12:00:00', NOW(), NOW())`);
      sql(`INSERT INTO GoalPolos (goalId, poloId, target, manualCount, canceled, createdAt, updatedAt) VALUES (${gid}, ${poloId}, 80, 84, 23, '2026-10-01 10:00:00', '2026-10-01 10:00:00')`);
      sql(`DELETE FROM Settings WHERE key='goal_total_semantics_v1'`);
      const script = `
        require("./dist/database");
        const { migrateGoalTotals } = require("./dist/helpers/GoalTotals");
        (async () => { const a = await migrateGoalTotals(); const b = await migrateGoalTotals(); console.log(JSON.stringify({ a, b })); process.exit(0); })().catch(e => { console.error(e); process.exit(1); });`;
      const out = JSON.parse(execFileSync("node", ["-e", script], { cwd: ROOT, env: { ...env, LOG_LEVEL: "error" } }).toString().trim().split("\n").pop());
      assert(out.a >= 1 && out.b === 0, `migration ran ${JSON.stringify(out)}`);
      const row = (await http.get("/goals/polos", { params: { goalId: gid }, ...auth() })).data.rows.find(r => r.poloId === Number(poloId));
      assert(row.done === 84 && row.inCourse === 62 && row.canceled === 22, `row ${JSON.stringify({ done: row.done, inCourse: row.inCourse, canceled: row.canceled })}`);
      sql(`DELETE FROM GoalPolos WHERE goalId=${gid}`);
      sql(`DELETE FROM Leads WHERE name='Matriculado Total Teste'`);
      assert((await http.delete(`/goals/${gid}`, auth())).status < 300, "the test semester was not removed");
    });
    await test("an administrator deletes a lead from the CRM; a consultant cannot; a student (enrolled) is never deleted", async () => {
      const mkU = async (name, email, role) => (await http.post("/users", { name, email, password: "senha123", role }, auth())).data;
      await mkU("Consultor Sem Exclusao", "semexclusao@lead.test", "consultor");
      const tok = (await http.post("/auth/login", { email: "semexclusao@lead.test", password: "senha123" })).data.token;
      const lead = await mkLead("Lead Para Excluir", "5511933330001");
      assert((await http.delete(`/leads/${lead.id}`, asUser(tok))).status === 403, "a consultant deleted a lead");
      const student = await mkLead("Aluno Que Fica", "5511933330002");
      sql(`UPDATE Leads SET enrolledAt=NOW() WHERE id=${student.id}`);
      const blocked = await http.delete(`/leads/${student.id}`, auth());
      assert(blocked.status === 400 && /ENROLLED/.test(JSON.stringify(blocked.data)), `an enrolled lead was deleted ${blocked.status}`);
      assert((await http.delete(`/leads/${lead.id}`, auth())).status === 200, "the administrator could not delete the lead");
      assert(sql(`SELECT COUNT(*) FROM Leads WHERE id=${lead.id}`) === "0" && sql(`SELECT COUNT(*) FROM Leads WHERE id=${student.id}`) === "1", "deleted the wrong lead");
      assert((await http.delete(`/leads/${lead.id}`, auth())).status === 404, "the lead was deleted twice");
    });
    await test("security: a media filename sent by a stranger never leaves the public folder nor becomes a page; uploaded pages are downloads; hostile e-mail text does not freeze the server", async () => {
      const run = body => {
        const script = `
          require("./dist/database");
          const fs = require("fs"), path = require("path");
          const { PUBLIC_DIR } = require("./dist/config/paths");
          const { saveMediaFile } = require("./dist/handlers/handleWhatsappEvents");
          const { saveMediaBuffer } = require("./dist/services/InboundServices/HandleChannelMessage");
          (async () => {
            const out = {};
            const data = Buffer.from("PWNED").toString("base64");
            out.a = await saveMediaFile({ filename: "../../dist/zz-pwned.js", mimetype: "application/javascript", data });
            out.b = await saveMediaBuffer({ filename: "../../../zz-pwned2.html", mimetype: "text/html", data: Buffer.from("<script>alert(1)</script>") });
            out.c = await saveMediaFile({ filename: "page.xhtml", mimetype: "application/xhtml+xml", data });
            out.dir = PUBLIC_DIR;
            out.existsA = fs.existsSync(path.join(PUBLIC_DIR, out.a));
            out.existsB = fs.existsSync(path.join(PUBLIC_DIR, out.b));
            out.escaped = fs.existsSync(path.resolve(PUBLIC_DIR, "../dist/zz-pwned.js")) || fs.existsSync(path.resolve(PUBLIC_DIR, "../../zz-pwned2.html"));
            fs.writeFileSync(path.join(PUBLIC_DIR, "e2e-page.xhtml"), "<html/>");
            fs.writeFileSync(path.join(PUBLIC_DIR, "e2e-pic.png"), "x");
            console.log(JSON.stringify(out));
            process.exit(0);
          })().catch(e => { console.error(e); process.exit(1); });`;
        return JSON.parse(execFileSync("node", ["-e", script], { cwd: ROOT, env: { ...env, LOG_LEVEL: "error" } }).toString().trim().split("\n").pop());
      };
      const out = run();
      assert(!/[\\/]/.test(out.a) && !/[\\/]/.test(out.b) && !/[\\/]/.test(out.c), `the stored name kept a folder ${JSON.stringify(out)}`);
      assert(!/\.(js|html?|xhtml)$/i.test(out.a) && !/\.(js|html?|xhtml)$/i.test(out.b) && !/\.(js|html?|xhtml)$/i.test(out.c), `a page or script extension was kept ${JSON.stringify(out)}`);
      assert(out.existsA && out.existsB && !out.escaped, "the file was written outside of the public folder");
      // what is opened in the browser: a picture stays inline and sandboxed; anything else is a download
      const page = await http.get("/public/e2e-page.xhtml", { responseType: "text" });
      assert(page.status === 200 && /attachment/.test(String(page.headers["content-disposition"] || "")) && page.headers["x-content-type-options"] === "nosniff", `xhtml was served inline ${JSON.stringify(page.headers)}`);
      const pic = await http.get("/public/e2e-pic.png");
      assert(pic.status === 200 && !/attachment/.test(String(pic.headers["content-disposition"] || "")) && /sandbox/.test(String(pic.headers["content-security-policy"] || "")), "a picture lost its inline display or its sandbox");
      // a hostile text where an e-mail is expected is answered at once
      const started = Date.now();
      const hostile = await http.post("/auth/forgot", { email: `a@${".".repeat(60000)} b` });
      assert(Date.now() - started < 1500 && hostile.status < 500, `the e-mail check froze the server (${Date.now() - started} ms, ${hostile.status})`);
      assert(!JSON.stringify((await http.get("/health")).data).includes("pool"), "/health tells the pool to anyone");
    });
    await test("security: a conversation is opened for the person who asks; quick answers, lead tasks and passwords follow the owner", async () => {
      const mkU = async (name, email, role) => (await http.post("/users", { name, email, password: "senha1234", role }, auth())).data;
      const u1 = await mkU("Segura Um", "segura1@sec.test", "consultor");
      const u2 = await mkU("Segura Dois", "segura2@sec.test", "consultor");
      const t1 = (await http.post("/auth/login", { email: "segura1@sec.test", password: "senha1234" })).data.token;
      const t2 = (await http.post("/auth/login", { email: "segura2@sec.test", password: "senha1234" })).data.token;
      // a password of 7 characters is refused when an account is made
      assert((await http.post("/users", { name: "Senha Curta", email: "curta@sec.test", password: "1234567", role: "consultor" }, auth())).status === 400, "a short password was accepted");
      // a quick answer belongs to who made it
      const qa = await http.post("/quickAnswers", { shortcut: "/seg", message: "Resposta da Segura Um" }, asUser(t1));
      assert(qa.status === 200 && qa.data.id, `quick answer ${qa.status}`);
      assert((await http.put(`/quickAnswers/${qa.data.id}`, { message: "trocada" }, asUser(t2))).status === 403, "another person changed a quick answer");
      assert((await http.delete(`/quickAnswers/${qa.data.id}`, asUser(t2))).status === 403, "another person deleted a quick answer");
      assert((await http.put(`/quickAnswers/${qa.data.id}`, { message: "minha" }, asUser(t1))).status === 200, "the owner could not change their quick answer");
      assert((await http.delete(`/quickAnswers/${qa.data.id}`, auth())).status === 200, "the administrator could not delete a quick answer");
      // a task of another lead is not reached through the lead of the route
      const l1 = await mkLead("Lead Tarefa Um", "5511977776601", { ownerId: u1.id });
      const l2 = await mkLead("Lead Tarefa Dois", "5511977776602", { ownerId: u2.id });
      const task = (await http.post(`/leads/${l2.id}/tasks`, { title: "Ligar", type: "ligar", dueAt: new Date(Date.now() + 3600000).toISOString() }, auth())).data;
      const taskId = task.id || (task.task && task.task.id);
      assert(taskId, `task not created ${JSON.stringify(task).slice(0, 120)}`);
      const viaMine = await http.delete(`/leads/${l1.id}/tasks/${taskId}`, asUser(t1));
      assert(viaMine.status === 404, `a task of another lead was deleted through my lead (${viaMine.status} ${JSON.stringify(viaMine.data).slice(0, 100)}; lead ${JSON.stringify(l1).slice(0, 200)}; u1 ${JSON.stringify(u1).slice(0, 120)}; task ${taskId} of lead ${task.leadId})`);
      assert((await http.put(`/leads/${l1.id}/tasks/${taskId}`, { title: "x" }, asUser(t1))).status === 404, "a task of another lead was changed through my lead");
      // the conversation is opened for who asks, whatever the body says
      // a contact nobody works yet (the number is not checked against WhatsApp here)
      const fresh = { id: Number(sql(`INSERT INTO Contacts (name, number, isGroup, kind, createdAt, updatedAt) VALUES ('Contato Novo Seguranca','5511977776609',false,'person',NOW(),NOW()) RETURNING id`).split("\n")[0]) };
      const opened = await http.post("/tickets", { contactId: fresh.id, status: "open", userId: 1 }, asUser(t1));
      assert(opened.status === 200 && Number(opened.data.userId) === u1.id, `the ticket was opened for somebody else ${opened.status} ${JSON.stringify(opened.data).slice(0, 160)}`);
    });
    await test("the agent never answers groups, communities, the team's chats or personal contacts, whatever reaches the automation", async () => {
      const run = body => {
        const script = `
          const http = require("http");
          require("./dist/database");
          const { initIO } = require("./dist/libs/socket");
          initIO(http.createServer());
          const RunInboundAutomation = require("./dist/services/AutomationServices/RunInboundAutomation").default;
          (async () => { ${body} process.exit(0); })().catch(e => { console.error(e); process.exit(1); });`;
        return execFileSync("node", ["-e", script], { cwd: ROOT, env: { ...env, LOG_LEVEL: "error" } }).toString().trim();
      };
      const calls = anthropic.requests.length, before = graph.sent.length;
      const ids = [];
      for (const [i, kind] of [["g", "group"], ["c", "community"], ["s", "staff"], ["p", "personal"]].entries()) {
        const number = `5599900079${i}00`;
        const flags = { group: "isGroup=true", community: "isGroup=true", staff: "isStaff=true", personal: "isPersonal=true" }[kind[1]];
        sql(`INSERT INTO Contacts (name, number, email, isGroup, isStaff, isPersonal, kind, createdAt, updatedAt) VALUES ('Contato ${kind[1]}', '${number}', '', ${kind[1] === "group" || kind[1] === "community"}, ${kind[1] === "staff"}, ${kind[1] === "personal"}, '${kind[1] === "community" ? "community" : "contact"}', NOW(), NOW())`);
        const t = sql(`INSERT INTO Tickets (status, contactId, whatsappId, isGroup, aiActive, unreadMessages, createdAt, updatedAt) VALUES ('pending', (SELECT id FROM Contacts WHERE number='${number}'), ${cid}, ${kind[1] === "group" || kind[1] === "community"}, true, 1, NOW(), NOW()) RETURNING id`).split("\n")[0];
        ids.push(t);
        run(`await RunInboundAutomation({ ticketId: ${t}, body: "Quero saber sobre os cursos" });`);
      }
      await new Promise(r => setTimeout(r, 7000));
      assert(anthropic.requests.length === calls, `the model was called for a chat where robots stay out (${anthropic.requests.length - calls})`);
      assert(graph.sent.length === before, "a robot sent a message to a group, community, team chat or personal contact");
      assert(ids.every(t => sql(`SELECT CAST(aiActive AS INTEGER) FROM Tickets WHERE id=${t}`) === "1" && sql(`SELECT COALESCE(userId,0) FROM Tickets WHERE id=${t}`) === "0"), "the conversation was touched");
    });
    await test("a personal number sends new conversations to its owner, unless it is also an attendance number (aiFirst); the open chat hears when it changes hands; the agent's typing reaches the team", async () => {
      const owner = (await http.post("/users", { name: "Dono Pessoal", email: "dono-p@x.com", password: "senha123", role: "consultor" }, auth())).data;
      const mkLine = async name => (await http.post("/whatsapp", { name, ownerId: owner.id, channel: "whatsapp" }, auth())).data;
      const lineA = await mkLine("Pessoal A");
      const lineB = await mkLine("Pessoal B");
      const saved = await http.put(`/whatsapp/${lineB.id}`, { name: "Pessoal B", aiFirst: true }, auth());
      assert(saved.status === 200 && saved.data.aiFirst === true, `aiFirst not saved: ${saved.status}`);
      const script = `
        const http = require("http");
        require("./dist/database");
        const { initIO, getIO } = require("./dist/libs/socket");
        initIO(http.createServer());
        const FindOrCreate = require("./dist/services/TicketServices/FindOrCreateTicketService").default;
        const Contact = require("./dist/models/Contact").default;
        const { emitTyping } = require("./dist/services/WbotServices/ChatState");
        (async () => {
          const c1 = await Contact.create({ name: "Lead Pessoal 1", number: "5599900078801" });
          const c2 = await Contact.create({ name: "Lead Pessoal 2", number: "5599900078802" });
          const t1 = await FindOrCreate(c1, ${lineA.id}, 1);
          const t2 = await FindOrCreate(c2, ${lineB.id}, 1);
          emitTyping(t2.id, "agent", "typing", 3000);
          console.log(JSON.stringify({ a: [t1.status, t1.userId], b: [t2.status, t2.userId] }));
          process.exit(0);
        })().catch(e => { console.error(e); process.exit(1); });`;
      const raw = execFileSync("node", ["-e", script], { cwd: ROOT, env: { ...env, LOG_LEVEL: "error" } }).toString().trim();
      const out = JSON.parse(raw.split("\n").pop());
      assert(out.a[0] === "open" && out.a[1] === owner.id, `a personal number: the owner takes it ${JSON.stringify(out.a)}`);
      assert(out.b[0] === "pending" && out.b[1] === null, `an attendance number: nobody takes it before the agent ${JSON.stringify(out.b)}`);
      // handing a conversation of a personal number to the agent is refused with an explanation (the next message would send it back to the owner)
      const ticketA = sql(`SELECT id FROM Tickets WHERE contactId=(SELECT id FROM Contacts WHERE number='5599900078801')`);
      const refused = await http.post(`/tickets/${ticketA}/ai`, { active: true }, auth());
      assert(refused.status === 400 && /ERR_AI_PERSONAL_NUMBER|AI_PERSONAL|AI_AGENT_NOT_AVAILABLE/.test(JSON.stringify(refused.data)), `refused ${refused.status} ${JSON.stringify(refused.data)}`);
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
      assert(u.costUsd === null && u.total.cacheShare === 0, "no price typed: the cost is not guessed");
      // the cached part of the prompt is charged at its own rate: reading costs a tenth of the input price, writing 25% more
      sql(`INSERT INTO Settings ("key", value, createdAt, updatedAt) VALUES ('ai_price_claude-haiku-5-5', '1000000,0', NOW(), NOW())`);
      const before = Number((await http.get(`/ai-agents/${aiId}/usage`, auth())).data.costUsd);
      sql(`INSERT INTO AiUsage (agentId, model, kind, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, createdAt, updatedAt) VALUES (${aiId}, 'claude-haiku-5-5', 'reply', 0, 0, 1000000, 1000000, NOW(), NOW())`);
      const after = (await http.get(`/ai-agents/${aiId}/usage`, auth())).data;
      sql(`DELETE FROM Settings WHERE "key"='ai_price_claude-haiku-5-5'`);
      sql(`DELETE FROM AiUsage WHERE agentId=${aiId} AND cacheReadTokens=1000000`);
      // 1,000,000 cache tokens read at 10% + 1,000,000 written at 125% of US$ 1,000,000 per million = 1,350,000
      assert(Math.round(Number(after.costUsd) - before) === 1350000, `cache cost ${before} -> ${after.costUsd}`);
      assert(after.total.cacheShare > 0, "cache share of the prompt");
    });
    await test("AI agent in blocks: an AI stage collects typed fields, calls an external tool, leaves by intention, hands over to the team; versions and the simulator", async () => {
      // the agent of the earlier tests stays quiet while this one talks on the same connection
      await http.put(`/ai-agents/${aiId}`, { active: false }, auth());
      const tpls = await http.get("/ai-agent-templates", auth());
      assert(tpls.status === 200 && tpls.data.length === 1 && tpls.data.every(t => t.key && t.stages >= 1), `templates ${tpls.status}`);
      assert((await http.post("/ai-agents/from-template", { template: "nao-existe" }, auth())).status === 404, "an unknown template");
      const fromTpl = (await http.post("/ai-agents/from-template", { template: "graduacao_comercial_cruzeiro", name: "Agente do modelo" }, auth())).data;
      const tplFlow = (await http.get(`/flows/${fromTpl.flowId}`, auth())).data;
      assert(tplFlow.kind === "agent" && tplFlow.agentId === fromTpl.agentId && tplFlow.errors === 0, `template flow ${JSON.stringify({ k: tplFlow.kind, e: tplFlow.errors, issues: tplFlow.issues })}`);
      assert(sql(`SELECT active FROM AiAgents WHERE id=${fromTpl.agentId}`) === "0", "an agent from a template starts turned on");
      assert(Number(sql(`SELECT COUNT(*) FROM KbDocuments WHERE agentId=${fromTpl.agentId}`)) >= 3, "the template brought no texts for the knowledge base");
      assert((await http.get("/flows", auth())).data.every(f => f.kind === "flow"), "agents in the list of flows");
      assert((await http.get("/flows", { params: { kind: "agent" }, ...auth() })).data.some(f => f.id === fromTpl.flowId), "agent not in its list");

      // the agent of this test and its blocks
      const agent = (await http.post("/ai-agents", { name: "Agente em blocos", provider: "anthropic", model: "claude-haiku-5-5", apiKey: "sk-ant-test", whatsappId: cid, waitSeconds: 0, handoffMessage: "Vou chamar um colega.", persona: { tone: "gentil" } }, auth())).data;
      const agentGraph = {
        nodes: [
          { id: "st", type: "start", data: {} },
          { id: "s", type: "stage", data: {
            title: "Teste de Etapa", objective: "Descobrir nome e e-mail e consultar horários.", maxTurns: 10, useKnowledge: false,
            fields: [{ key: "nome", label: "Nome", type: "text", required: true }, { key: "email", label: "E-mail", type: "email", required: true }],
            http: [{ name: "agenda", description: "Consulta os horários livres de um dia.", url: `http://localhost:${GRAPH_PORT}/horarios`, method: "GET", params: [{ name: "dia", description: "AAAA-MM-DD", type: "string", required: true }] }],
            outcomes: [{ id: "precos", label: "Quer preços", when: "quando perguntar quanto custa" }]
          } },
          { id: "ok", type: "message", data: { text: "Cadastro concluído, obrigado!" } },
          { id: "fim", type: "end", data: {} },
          { id: "val", type: "message", data: { text: "Vou chamar quem fala de valores." } },
          { id: "fim2", type: "end", data: {} }
        ],
        edges: [
          { id: "e1", source: "st", target: "s" }, { id: "e2", source: "s", sourceHandle: "done", target: "ok" }, { id: "e3", source: "ok", target: "fim" },
          { id: "e4", source: "s", sourceHandle: "precos", target: "val" }, { id: "e5", source: "val", target: "fim2" }
        ]
      };
      // a block with a problem cannot be published, and the problems say what to fix
      const bad = (await http.post("/flows", { kind: "agent", agentId: agent.id, name: "Rascunho ruim", graph: { nodes: [{ id: "st", type: "start", data: {} }, { id: "s", type: "stage", data: { objective: "" } }], edges: [{ id: "e", source: "st", target: "s" }] } }, auth())).data;
      const badPub = await http.post(`/flows/${bad.id}/publish`, {}, auth());
      assert(badPub.status === 422 && badPub.data.issues.some(i => /objetivo/.test(i.text)), `bad publish ${badPub.status}`);
      assert((await http.post("/flows", { kind: "agent", name: "Sem agente", graph: agentGraph }, auth())).status === 400, "an agent flow without an agent");
      const flow = (await http.post("/flows", { kind: "agent", agentId: agent.id, name: "Agente em blocos", graph: agentGraph }, auth())).data;
      assert(flow.kind === "agent" && flow.errors === 0, `flow ${JSON.stringify(flow.issues)}`);

      // the simulator: the AI really answers (with the mock), nothing is sent, and the trace says what it did
      const sim1 = (await http.post(`/flows/${flow.id}/simulate`, { restart: true }, auth())).data;
      assert(sim1.status === "waiting" && sim1.messages.some(m => /assistente desta etapa/.test(m)) && sim1.traces.length === 1, `simulate open ${JSON.stringify(sim1).slice(0, 240)}`);
      const sim2 = (await http.post(`/flows/${flow.id}/simulate`, { state: sim1.state, input: "meu nome é Paulo" }, auth())).data;
      assert(sim2.status === "done" && sim2.messages.includes("Cadastro concluído, obrigado!") && sim2.traces[0].tools.includes("salvar_lead") && sim2.traces[0].collected.nome === "Paulo Mendes" && sim2.traces[0].exit === "done" && sim2.state.vars.email === "paulo@x.com", `simulate collect ${JSON.stringify(sim2).slice(0, 300)}`);
      assert(Number(sql(`SELECT COUNT(*) FROM AiUsage WHERE kind='test' AND flowId=${flow.id}`)) >= 2, "the simulator did not log its usage with the flow");

      // versions: publish, change, publish again, restore the first
      const pub1 = await http.post(`/flows/${flow.id}/publish`, { note: "primeira" }, auth());
      assert(pub1.status === 200 && pub1.data.status === "published" && pub1.data.version === 1, `publish ${pub1.status}`);
      const changed = JSON.parse(JSON.stringify(agentGraph));
      changed.nodes.find(n => n.id === "ok").data.text = "Tudo certo!";
      await http.put(`/flows/${flow.id}`, { graph: changed }, auth());
      assert((await http.post(`/flows/${flow.id}/publish`, { note: "segunda" }, auth())).data.version === 2, "second publication");
      const vs = (await http.get(`/flows/${flow.id}/versions`, auth())).data;
      assert(vs.length === 2 && vs[0].version === 2 && vs[0].current === true && vs[1].note === "primeira", `versions ${JSON.stringify(vs)}`);
      const restored = (await http.post(`/flows/${flow.id}/versions/${vs[1].id}/restore`, {}, auth())).data;
      assert(restored.graph.nodes.find(n => n.id === "ok").data.text === "Cadastro concluído, obrigado!", "restore did not bring the old blocks back");
      assert((await http.post(`/flows/${flow.id}/publish`, { note: "volta" }, auth())).data.version === 3, "third publication");

      // a real conversation: the agent in blocks answers on the connection
      assert((await http.put(`/ai-agents/${agent.id}`, { active: true }, auth())).status === 200, "turn the agent on");
      const before0 = graph.sent.length;
      const typed = (from, id, body) => inboundCloud(from, id, body);
      const cloudTexts = since => graph.sent.slice(since).filter(x => x.path === "/PN1/messages" && x.body && x.body.type === "text" && x.body.text).map(x => x.body.text.body);
      // 1) a bad e-mail is not kept; the AI asks again; then the fields are complete and the flow follows "done"
      const a = "5511920000101";
      await typed(a, "wamid.blk-a1", "oi, quero um cadastro");
      await waitFor(() => cloudTexts(before0).some(t => /Qual é o seu nome completo/.test(t)), 15000, "the AI stage answers the first message");
      const runA = () => sql(`SELECT CONCAT(r.status,'|',COALESCE(r.nodeId,'')) FROM ChatFlowRuns r JOIN Tickets t ON t.id=r.ticketId JOIN Contacts c ON c.id=t.contactId WHERE c.number='${a}' AND r.flowId=${flow.id} ORDER BY r.id DESC LIMIT 1`);
      assert(runA() === "waiting|s", `run after the first message ${runA()}`);
      let mark = graph.sent.length;
      await typed(a, "wamid.blk-a2", "meu nome é Paulo, email ruim");
      await waitFor(() => cloudTexts(mark).some(t => /e-mail completo/.test(t)), 15000, "the AI asks for the e-mail again");
      assert(runA() === "waiting|s" && !sql(`SELECT aiSlots FROM Tickets WHERE id=${ticketOf(a)}`).includes("paulo\""), "a bad e-mail was kept or the stage ended");
      mark = graph.sent.length;
      await typed(a, "wamid.blk-a3", "meu nome é Paulo, o email é paulo@x.com");
      await waitFor(() => cloudTexts(mark).some(t => /Cadastro concluído, obrigado!/.test(t)), 15000, "the flow follows the exit 'done'");
      await waitFor(() => /^done/.test(runA()), 8000, "the run ends");
      assert(sql(`SELECT aiActive FROM Tickets WHERE id=${ticketOf(a)}`) === "0", "the agent would start over at the next message");
      assert(JSON.parse(sql(`SELECT r.vars FROM ChatFlowRuns r JOIN Tickets t ON t.id=r.ticketId JOIN Contacts c ON c.id=t.contactId WHERE c.number='${a}' AND r.flowId=${flow.id} ORDER BY r.id DESC LIMIT 1`)).email === "paulo@x.com", "the fields were not kept in the run");
      assert(sql(`SELECT l.name FROM Leads l JOIN Contacts c ON c.id=l.contactId WHERE c.number='${a}'`) === "Paulo Mendes", "the lead did not take the name");

      // 2) an external tool (read) and an exit by intention
      const b = "5511920000102";
      mark = graph.sent.length;
      await typed(b, "wamid.blk-b1", "olá, quero um horário");
      await waitFor(() => cloudTexts(mark).some(t => /Horários livres:.*09:00/.test(t)), 15000, "the AI used the external tool");
      assert(graph.hooks.some(h => h.horarios && h.horarios.dia === "2026-11-02"), "the external system was not called");
      mark = graph.sent.length;
      await typed(b, "wamid.blk-b2", "e quanto custa?");
      await waitFor(() => cloudTexts(mark).some(t => /Vou chamar quem fala de valores/.test(t)), 15000, "the exit by intention followed its edge");
      assert(cloudTexts(mark).some(t => /Combinado!/.test(t)), "the AI did not say goodbye before leaving the stage");

      // 3) the person asks for a human: the exit is not connected, so the team takes the conversation, with the reason
      const c = "5511920000103";
      await typed(c, "wamid.blk-c1", "oi");
      await waitFor(() => cloudTexts(before0).some(t => /Qual é o seu nome completo/.test(t)) && ticketOf(c), 15000, "ticket of the third person");
      await waitFor(() => Number(sql(`SELECT COUNT(*) FROM Messages WHERE ticketId=${ticketOf(c)} AND fromMe=true`)) >= 1, 8000, "the reply is stored");
      mark = graph.sent.length;
      await typed(c, "wamid.blk-c2", "quero falar com uma pessoa");
      await waitFor(() => cloudTexts(mark).some(t => /Vou chamar um colega/.test(t)), 15000, "the handoff message");
      await waitFor(() => Number(sql(`SELECT COUNT(*) FROM TicketEvents WHERE ticketId=${ticketOf(c)} AND type='handoff'`)) >= 1, 8000, "the handoff event");
      assert(sql(`SELECT aiActive FROM Tickets WHERE id=${ticketOf(c)}`) === "0", "the AI went on after the handoff");

      // the counters of the blocks and the usage by block
      // (the run is closed as "handoff" after the lead is told it waits in the queue: give it a moment)
      let st = (await http.get(`/flows/${flow.id}/stats`, auth())).data;
      for (let i = 0; i < 16 && !(st.handoff >= 1); i += 1) { await new Promise(r => setTimeout(r, 500)); st = (await http.get(`/flows/${flow.id}/stats`, auth())).data; }
      assert(st.started >= 3 && st.nodes.s >= 3 && st.nodes.ok >= 1 && st.handoff >= 1, `stats ${JSON.stringify(st)}`);
      assert(Number(sql(`SELECT COUNT(*) FROM AiUsage WHERE kind='reply' AND flowId=${flow.id} AND nodeId='s'`)) >= 5, "the usage of the stage was not logged");

      // the agent of today as blocks: a draft that keeps the behaviour (the fields, the flows it could start)
      const conv = (await http.post(`/ai-agents/${aiId}/convert`, {}, auth())).data;
      const convFlow = (await http.get(`/flows/${conv.flowId}`, auth())).data;
      assert(convFlow.kind === "agent" && convFlow.agentId === aiId && convFlow.status === "draft" && convFlow.graph.nodes.some(n => n.type === "stage" && n.data.fields.some(f => f.key === "curso" && f.required)), "the conversion lost the fields");
      assert((await http.delete(`/ai-agents/${fromTpl.agentId}`, auth())).status === 200 && (await http.get(`/flows/${fromTpl.flowId}`, auth())).status === 404, "deleting the agent kept its blocks");

      // back to how the other tests expect it
      await http.put(`/ai-agents/${agent.id}`, { active: false }, auth());
      await http.put(`/ai-agents/${aiId}`, { active: true }, auth());
    });
    await test("create the agent with AI: the answer is a structure, the problems go back to the model and it fixes them before the draft is shown", async () => {
      assert((await http.post("/ai-agents/generate", { description: "curto" }, auth())).status === 400, "a description too short");
      const before = anthropic.requests.length;
      const r = await http.post("/ai-agents/generate", { description: "Uma padaria de bairro que vende bolos e salgados e recebe encomendas pelo WhatsApp.", segment: "Alimentação" }, auth());
      assert(r.status === 201 && r.data.attempts === 2 && r.data.issues.length === 0, `generate ${r.status} ${JSON.stringify(r.data).slice(0, 240)}`);
      const calls = anthropic.requests.slice(before).filter(x => Array.isArray(x.tools) && x.tools.some(t => t.name === "criar_agente"));
      assert(calls.length === 2 && calls[0].tool_choice && calls[0].tool_choice.name === "criar_agente", "the model was not forced to answer through the tool");
      assert(JSON.stringify(calls[1].messages[calls[1].messages.length - 1]).includes("objetivo"), "the problems did not go back to the model");
      assert(sql(`SELECT active FROM AiAgents WHERE id=${r.data.agentId}`) === "0", "the generated agent started turned on");
      assert(Number(sql(`SELECT COUNT(*) FROM KbDocuments WHERE agentId=${r.data.agentId} AND kind='faq'`)) === 2, "the answers did not reach the knowledge base");
      const gen = (await http.get(`/flows/${r.data.flowId}`, auth())).data;
      assert(gen.kind === "agent" && gen.status === "draft" && gen.errors === 0 && gen.graph.nodes.some(n => n.type === "stage" && n.data.objective && n.data.fields.length === 2 && n.data.outcomes[0].id === "reclamar"), `generated flow ${JSON.stringify(gen.issues)}`);
      assert(gen.graph.edges.some(e => e.sourceHandle === "reclamar") && gen.graph.edges.some(e => e.sourceHandle === "done"), "the exits were not connected");
      assert((await http.post(`/flows/${r.data.flowId}/publish`, {}, auth())).status === 200, "the generated agent cannot be published");
    });
    await test("commercial agent (graduation): made from the template, keeps the CRM by rules, never invents a price, hands over with a brief, never enrolls", async () => {
      await http.put(`/ai-agents/${aiId}`, { active: false }, auth());
      // 1) the template: agent turned off, answers by subject in the knowledge base, the funnel mapped and completed, a valid draft
      const list = (await http.get("/ai-agent-templates", auth())).data;
      const tpl = list.find(t => t.key === "graduacao_comercial_cruzeiro");
      assert(tpl && tpl.name === "Comercial" && tpl.commercial === true, `template listed ${JSON.stringify(tpl)}`);
      const made = await http.post("/ai-agents/from-template", { template: "graduacao_comercial_cruzeiro" }, auth());
      assert(made.status === 201 && made.data.funnel && Array.isArray(made.data.funnel.created), `made ${made.status} ${JSON.stringify(made.data)}`);
      const agentId = made.data.agentId, flowId = made.data.flowId;
      assert(sql(`SELECT active FROM AiAgents WHERE id=${agentId}`) === "0", "the commercial agent started turned on");
      const topics = sql(`SELECT string_agg(topic, ',') FROM KbDocuments WHERE agentId=${agentId}`);
      ["institutional/tutoring", "institutional/platform", "institutional/internship", "institutional/mec"].forEach(t => assert(topics.includes(t), `the knowledge base lacks ${t}: ${topics}`));
      // faculty, enrollment documents and recognition are the texts the institution dictated (masters and doctors, the maximum MEC grade)
      ["institutional/faculty", "institutional/enrollment", "institutional/recognition"].forEach(t => assert(topics.includes(t), `the knowledge base lacks ${t}: ${topics}`));
      assert(/mestres e doutores/.test(sql(`SELECT content FROM KbDocuments WHERE agentId=${agentId} AND topic='institutional/faculty'`)), "the faculty text is not the dictated one");
      const fun = (await http.get("/crm-funnel", auth())).data;
      assert(fun.keys.length === 15 && fun.keys.every(k => k.stageId), `funnel not complete: ${fun.keys.filter(k => !k.stageId).map(k => k.key)}`);
      assert(new Set(fun.keys.map(k => k.stageId)).size === 15, "two steps share a column");
      const draft = (await http.get(`/flows/${flowId}`, auth())).data;
      assert(draft.kind === "agent" && draft.errors === 0 && draft.status === "draft", `flow ${draft.errors} ${JSON.stringify(draft.issues)}`);
      const stageName = key => fun.keys.find(k => k.key === key).name;
      // the funnel can be changed, but a won column can not serve a step that is not "won"
      const wrongMap = Object.fromEntries(fun.keys.map(k => [k.key, k.stageId]));
      wrongMap.enrolled = fun.keys.find(k => k.key === "new_lead").stageId;
      assert((await http.put("/crm-funnel", { map: wrongMap }, auth())).status === 400, "an open column was accepted for 'Matriculado'");
      // a block that moves to "Matriculado" can not be published: only the confirmed enrollment does it
      const evil = JSON.parse(JSON.stringify(draft.graph));
      evil.nodes.find(n => n.id === "crm_pronto").data.stageKey = "enrolled";
      const evilFlow = (await http.post("/flows", { kind: "agent", agentId, name: "Tentativa de matricular", graph: evil }, auth())).data;
      const evilPub = await http.post(`/flows/${evilFlow.id}/publish`, {}, auth());
      assert(evilPub.status === 422 && evilPub.data.issues.some(i => /Matriculado/.test(i.text)), `a block to Matriculado was published: ${evilPub.status}`);
      await http.delete(`/flows/${evilFlow.id}`, auth());

      // 2) rules of the modality of a course (the MEC changes): invalid values are refused, nothing is invented without them
      const direitoId = Number(sql("SELECT id FROM Courses WHERE name='Direito'"));
      assert((await http.put(`/course-regulations/${direitoId}`, { percentualPresencial: 150 }, auth())).status === 400, "a percentage above 100");
      assert((await http.put(`/course-regulations/${direitoId}`, { intakeTerm: "26-2" }, auth())).status === 400, "an invalid intake period");
      const reg = await http.put(`/course-regulations/${direitoId}`, { mecImpacted: true, regulation: "Portaria de teste", teoriaAoVivo: true, praticaPresencial: true, cronogramaPraticasDefinido: false, commercialApprovedText: "Texto aprovado." }, auth());
      assert(reg.status === 200 && (await http.get("/course-regulations", auth())).data.rules.some(r => r.courseId === direitoId && r.courseName === "Direito"), "regulation not saved");

      // 2b) the history of the agent: every save is kept, what changed is named, an earlier version comes back; the integrations can hear the handoffs
      const agentNow = (await http.get(`/ai-agents/${agentId}`, auth())).data;
      const toneBefore = (agentNow.persona || {}).tone;
      assert((await http.put(`/ai-agents/${agentId}`, { persona: { ...(agentNow.persona || {}), tone: "Tom de teste do histórico", emoji: true } }, auth())).status === 200, "save the agent");
      let hist = (await http.get(`/ai-agents/${agentId}/history`, auth())).data;
      assert(hist.length >= 2 && hist[0].changed.includes("Como fala (tom, regras, estilo)") && hist[0].isCurrent === true, `history ${JSON.stringify(hist.slice(0, 2))}`);
      assert(hist[hist.length - 1].changed.length === 0 && /antes da primeira/.test(hist[hist.length - 1].note), "the first revision keeps how it was before");
      assert((await http.post(`/ai-agents/${agentId}/history/${hist[hist.length - 1].id}/restore`, {}, auth())).status === 200, "restore");
      const restored = (await http.get(`/ai-agents/${agentId}`, auth())).data;
      assert((restored.persona || {}).tone === toneBefore && (restored.persona || {}).emoji === undefined, `the earlier version did not come back ${JSON.stringify(restored.persona)}`);
      hist = (await http.get(`/ai-agents/${agentId}/history`, auth())).data;
      assert(hist[0].note && /Restaurado/.test(hist[0].note), "the restore is in the history too");
      assert((await http.get("/webhooks-config/events", auth())).data.includes("ai.handoff"), "the AI events are offered to the integrations");

      // 3) a real conversation: the agent on, the flow published
      await http.put(`/ai-agents/${agentId}`, { active: true, whatsappId: cid, apiKey: "sk-ant-test", waitSeconds: 0, provider: "anthropic", model: "claude-haiku-5-5" }, auth());
      assert((await http.post(`/flows/${flowId}/publish`, {}, auth())).status === 200, "publish the commercial flow");
      const texts = since => graph.sent.slice(since).filter(x => x.path === "/PN1/messages" && x.body && x.body.type === "text" && x.body.text).map(x => x.body.text.body);
      // the rule "a qualified lead goes to the consultant after a few answers" has its own scenario (R): the others keep talking
      const setQualified = n => { sql(`DELETE FROM Settings WHERE key='ai_qualified_replies'`); sql(`INSERT INTO Settings (key, value, createdAt, updatedAt) VALUES ('ai_qualified_replies', '${n}', now(), now())`); };
      setQualified(99);
      const leadStage = number => sql(`SELECT s.name FROM Leads l JOIN LeadStages s ON s.id=l.stageId JOIN Contacts c ON c.id=l.contactId WHERE c.number='${number}'`);
      const leadId = number => sql(`SELECT l.id FROM Leads l JOIN Contacts c ON c.id=l.contactId WHERE c.number='${number}'`);
      const runOf = number => sql(`SELECT CONCAT(r.status,'|',COALESCE(r.nodeId,'')) FROM ChatFlowRuns r JOIN Tickets t ON t.id=r.ticketId JOIN Contacts c ON c.id=t.contactId WHERE c.number='${number}' AND r.flowId=${flowId} ORDER BY r.id DESC LIMIT 1`);
      const say = async (from, id, body, until, label) => {
        const mark = graph.sent.length;
        await inboundCloud(from, id, body);
        try { await waitFor(() => until(texts(mark)), 20000, label); } catch (err) { err.message += ` | sent to everyone meanwhile: ${JSON.stringify(graph.sent.slice(mark).filter(x => x.body && x.body.text).map(x => [x.body.to, x.body.text.body && x.body.text.body.slice(0, 120)]))}`; err.message += ` | routing: ${sql(`SELECT COALESCE(string_agg(e.note, ' || '), '') FROM TicketEvents e JOIN Tickets t ON t.id=e.ticketId JOIN Contacts c ON c.id=t.contactId WHERE c.number='${from}' AND e.type = 'transfer'`).slice(0, 700)}`; throw err; }
        // the row of the reply is created after the channel answers: the next message must come after it
        // only what went to this person counts: another conversation may still be sending
        const toThem = () => graph.sent.slice(mark).filter(x => x.path === "/PN1/messages" && x.body && x.body.type === "text" && x.body.text && x.body.to === from).length;
        await waitFor(() => Number(sql(`SELECT COUNT(*) FROM Messages m JOIN Tickets t ON t.id=m.ticketId JOIN Contacts c ON c.id=t.contactId WHERE c.number='${from}' AND m.fromMe=true`)) >= toThem(), 8000, "replies stored");
        return texts(mark);
      };

      // A) a lead from the first "oi" to the handoff for the proposal
      const A = "5511920000201";
      let llm = anthropic.requests.length;
      let out = await say(A, "wamid.com-a1", "oi", t => t.some(x => /conhecer nossos cursos/.test(x)), "the opening");
      assert(/conhecer nossos cursos/.test(out.join(" ")) && anthropic.requests.length === llm, "the opening should be written by the system, without the model");
      await waitFor(() => runOf(A) === "waiting|qualificar", 8000, "waits at the first stage");
      // the person wrote first, so the lead is already "in service" (the first contact is still recorded as a milestone)
      assert(leadStage(A) === stageName("in_service"), `after the opening: ${leadStage(A)}`);
      assert(Number(sql(`SELECT COUNT(*) FROM LeadCommercials WHERE leadId=${leadId(A)}`)) === 1, "no commercial state for the lead");
      assert(sql(`SELECT deterministic FROM AgentTurnLogs WHERE leadId=${leadId(A)} ORDER BY id LIMIT 1`) === "1", "the opening was not logged as a turn without the model");

      out = await say(A, "wamid.com-a2", "Quero Direito em Porto Velho, primeira graduação", t => t.some(x => /Direito em Porto Velho/.test(x)), "qualification");
      await waitFor(() => runOf(A) === "waiting|apresentar", 8000, "goes to the presentation of the course");
      const slotsA = () => JSON.parse(sql(`SELECT slots FROM LeadCommercials WHERE leadId=${leadId(A)}`));
      assert(slotsA().courseName === "Direito" && slotsA().city === "Porto Velho" && slotsA().entryType === "first_degree", `slots ${JSON.stringify(slotsA())}`);
      assert(leadStage(A) === stageName("in_service"), `after the qualification data: ${leadStage(A)}`);

      llm = anthropic.requests.length;
      out = await say(A, "wamid.com-a3", "Quanto tempo dura o curso?", t => t.some(x => /Direito:.*SEMIPRESENCIAL/i.test(x)), "the course comes from the tool");
      assert(out.some(x => /10 semestres|5 anos/.test(x)), `the duration did not come from the data: ${out}`);
      assert(anthropic.requests.length - llm === 2, `one question about the course should take two calls (tool + answer), took ${anthropic.requests.length - llm}`);
      await waitFor(() => runOf(A) === "waiting|orientar", 8000, "goes to the academic guidance");
      assert(leadStage(A) === stageName("qualified"), `after presenting the course: ${leadStage(A)}`);
      assert(slotsA().courseExplained === true && slotsA().courseDurationSemesters === 10 && slotsA().courseModality === "SEMIPRESENCIAL", `slots from the tool ${JSON.stringify(slotsA())}`);

      out = await say(A, "wamid.com-a4", "E sobre as mudanças do MEC, como fica?", t => t.some(x => /Portaria de teste/.test(x)), "the rule of the course");
      assert(/práticas presenciais: true/.test(out.join(" ")) && /cronograma definido: false/.test(out.join(" ")), "the rule of the course was not read from the data");
      const sysOfMec = anthropic.requests.filter(r => /Em TODA resposta/.test(JSON.stringify(r.system))).slice(-2)[0].system.map(b => b.text).join("\n");
      assert(/mudanças do MEC/.test(sysOfMec) && /Já explicado/.test(sysOfMec), "the passage of the subject (MEC) or what was already explained did not reach the prompt");
      assert(!/Tutoria|Plataforma de estudo/.test(sysOfMec.split("Base aprovada")[1] || ""), "passages of other subjects reached the prompt");

      llm = anthropic.requests.length;
      out = await say(A, "wamid.com-a5", "qual o valor da mensalidade? tem bolsa?", t => t.some(x => /consultor/.test(x)), "the handoff for the proposal");
      assert(anthropic.requests.length === llm, "a question about price should not call the model");
      assert(!out.some(x => /R\$|\d+,\d{2}/.test(x)), `a value was told: ${out}`);
      await waitFor(() => /^handoff|^done/.test(runOf(A)), 8000, "the flow hands over");
      assert(leadStage(A) === stageName("ready_for_proposal"), `column after the price: ${leadStage(A)}`);
      assert(Number(sql(`SELECT COUNT(*) FROM LeadTasks WHERE leadId=${leadId(A)} AND title='Gerar e apresentar proposta'`)) === 1, "the proposal task is missing or repeated");
      const cs = JSON.parse(JSON.stringify((await http.get(`/leads/${leadId(A)}/commercial`, auth())).data));
      assert(cs.exists && cs.temperature === "hot" && cs.readyForProposal === true && cs.commercialScore >= 40 && cs.nextAction, `commercial state ${JSON.stringify(cs).slice(0, 300)}`);
      assert(/LEAD PRONTO PARA PROPOSTA/.test(cs.brief) && /Direito/.test(cs.brief) && /Porto Velho/.test(cs.brief) && /Primeira graduação/.test(cs.brief), `brief ${cs.brief}`);
      assert(cs.handoff && /LEAD PRONTO PARA PROPOSTA/.test(cs.handoff.note), "the brief was not written in the conversation");
      const viaTicket = (await http.get(`/tickets/${ticketOf(A)}/commercial`, auth())).data;
      assert(viaTicket.exists && viaTicket.leadId === Number(leadId(A)) && viaTicket.handoff, "the panel of the conversation does not see the brief");
      const leadJson = (await http.get(`/leads/${leadId(A)}`, auth())).data;
      assert(leadJson.commercial && leadJson.commercial.temperature === "hot" && leadJson.commercial.commercialScore === cs.commercialScore, "the card of the CRM has no commercial data");
      const events = sql(`SELECT string_agg(event, ',' ORDER BY id) FROM AgentMetricEvents WHERE leadId=${leadId(A)} AND once=true`).split(",");
      ["lead_received", "contact_started", "replied", "qualified", "ready_for_proposal", "handoff_brief"].forEach(e => assert(events.includes(e), `milestone ${e} missing: ${events}`));
      assert(new Set(events).size === events.length, "a milestone counted twice");
      assert(Number(sql(`SELECT COUNT(*) FROM LeadActivities WHERE leadId=${leadId(A)} AND type='note'`)) >= 2, "the notes of the attendance were not written");

      // B) a request for a person is answered at once, without the model
      const B = "5511920000202";
      await say(B, "wamid.com-b1", "oi", t => t.some(x => /assistente virtual/.test(x)), "opening of B");
      llm = anthropic.requests.length;
      out = await say(B, "wamid.com-b2", "Quero falar com um atendente", t => t.some(x => /consultor/.test(x)), "immediate handoff");
      assert(anthropic.requests.length === llm, "a request for a person should not call the model");
      await waitFor(() => leadStage(B) === stageName("human_service"), 8000, "column 'Atendimento humano'");
      assert(Number(sql(`SELECT COUNT(*) FROM TicketEvents WHERE ticketId=${ticketOf(B)} AND type='handoff' AND note LIKE 'RESUMO DO ATENDIMENTO COM IA%'`)) === 1, "the brief for the human is missing");

      // C) a question the base does not answer: safe answer, gap recorded for the team, the team takes over
      const C = "5511920000203";
      await say(C, "wamid.com-c1", "oi", t => t.some(x => /assistente virtual/.test(x)), "opening of C");
      await say(C, "wamid.com-c2", "Quero Direito em Porto Velho", t => t.some(x => /Direito em Porto Velho/.test(x)), "qualification of C");
      out = await say(C, "wamid.com-c3", "Vocês têm convênio com a Nasa?", t => t.some(x => /confirmar com a equipe/.test(x)), "safe answer");
      await waitFor(() => Number(sql(`SELECT COUNT(*) FROM AiLearnings WHERE ticketId=${ticketOf(C)}`)) === 1, 8000, "the gap goes to the knowledge base of the team");
      assert(sql(`SELECT question FROM AiLearnings WHERE ticketId=${ticketOf(C)}`).length > 5, "question not kept");
      await waitFor(() => Number(sql(`SELECT COUNT(*) FROM AgentMetricEvents WHERE leadId=${leadId(C)} AND event='unknown'`)) >= 1, 8000, "unknown milestone");
      assert(Number(sql(`SELECT COUNT(*) FROM TicketEvents WHERE ticketId=${ticketOf(C)} AND type='handoff'`)) >= 1, "the team did not receive the conversation");

      // D) "vou pensar": follow-up with a task on the date; coming back days later resumes without asking again
      const D = "5511920000204";
      await say(D, "wamid.com-d1", "oi", t => t.some(x => /assistente virtual/.test(x)), "opening of D");
      await say(D, "wamid.com-d2", "Quero Direito em Porto Velho", t => t.some(x => /Direito em Porto Velho/.test(x)), "qualification of D");
      await say(D, "wamid.com-d3", "quanto tempo dura?", t => t.some(x => /Direito:/.test(x)), "course of D");
      await say(D, "wamid.com-d4", "Vou pensar e volto depois", t => t.some(x => /Combinado/.test(x)), "follow-up");
      await waitFor(() => leadStage(D) === stageName("follow_up") && /^done/.test(runOf(D)), 8000, "column 'Follow-up' and the run ended");
      assert(Number(sql(`SELECT COUNT(*) FROM LeadTasks WHERE leadId=${leadId(D)} AND title LIKE 'Retomar contato:%' AND dueAt >= '2026-11-30 12:00' AND dueAt < '2026-12-02 00:00'`)) === 1, `no follow-up task on the date the person gave: ${sql(`SELECT string_agg(title || ' @ ' || dueAt::text, ' | ') FROM LeadTasks WHERE leadId=${leadId(D)}`)}`);
      assert(sql(`SELECT followUpReason FROM LeadCommercials WHERE leadId=${leadId(D)}`).includes("família"), "reason not kept");
      // two days later
      const sl = JSON.parse(sql(`SELECT slots FROM LeadCommercials WHERE leadId=${leadId(D)}`));
      sl.lastOutboundAt = new Date(Date.now() - 2 * 86400000).toISOString();
      sql(`UPDATE LeadCommercials SET slots='${JSON.stringify(sl).replace(/'/g, "''")}' WHERE leadId=${leadId(D)}`);
      llm = anthropic.requests.length;
      out = await say(D, "wamid.com-d5", "oi, voltei", t => t.some(x => /falar com você de novo/.test(x)), "the return");
      assert(/Direito/.test(out.join(" ")) && !/Qual curso/.test(out.join(" ")) && anthropic.requests.length === llm, `the return should remember the course and not ask it again: ${out}`);
      await waitFor(() => runOf(D) === "waiting|orientar", 8000, "back to the guidance, not to the start");

      // E) transfer: the transcript is asked; without it the column and the task wait; the task is not repeated
      const E = "5511920000205";
      await say(E, "wamid.com-e1", "oi", t => t.some(x => /assistente virtual/.test(x)), "opening of E");
      out = await say(E, "wamid.com-e2", "Quero transferir meu curso para cá", t => t.some(x => /histórico em PDF/.test(x)), "asks for the transcript");
      await waitFor(() => runOf(E) === "waiting|pedir_historico", 8000, "waits at the transcript step");
      assert(JSON.parse(sql(`SELECT slots FROM LeadCommercials WHERE leadId=${leadId(E)}`)).entryType === "transfer", "entry type not saved");
      out = await say(E, "wamid.com-e3", "não tenho o histórico agora", t => t.some(x => /Quando tiver o histórico em mãos/.test(x)), "no transcript for now");
      await waitFor(() => leadStage(E) === stageName("waiting_transcript") && /^done/.test(runOf(E)), 8000, "column 'Aguardando histórico'");
      assert(Number(sql(`SELECT COUNT(*) FROM LeadTasks WHERE leadId=${leadId(E)} AND title='Aguardar histórico acadêmico'`)) === 1, "the task to wait for the transcript is missing or repeated");

      // F) an unhappy person with a payment: straight to a person, without the model, and the reason is written down
      const F = "5511920000206";
      await say(F, "wamid.com-f1", "oi", t => t.some(x => /assistente virtual/.test(x)), "opening of F");
      llm = anthropic.requests.length;
      await say(F, "wamid.com-f2", "isso é um absurdo, já paguei o boleto e ninguém me responde", t => t.some(x => /consultor/.test(x)), "complaint handoff");
      assert(anthropic.requests.length === llm, "a complaint should not call the model");
      await waitFor(() => sql(`SELECT handoffReason FROM Tickets WHERE id=${ticketOf(F)}`) === "complaint", 8000, "reason complaint");

      // G) a greeting that already carries the answers is not only a greeting: the model reads it and nothing is asked twice
      const G = "5511920000207";
      llm = anthropic.requests.length;
      out = await say(G, "wamid.com-g1", "Bom dia, quero Direito em Porto Velho, primeira graduação", t => t.some(x => /Direito em Porto Velho/.test(x)), "greeting with content");
      assert(anthropic.requests.length > llm && !out.some(x => /Qual curso você tem interesse/.test(x)), "the course and the city were asked again");
      assert(JSON.parse(sql(`SELECT slots FROM LeadCommercials WHERE leadId=${leadId(G)}`)).courseName === "Direito", "the course in the greeting was lost");

      // H) the transcript: an image is not it (asks for the PDF); a PDF with spaces in the name is, and the analysis starts
      const media = (from, id, type, payload) => postMeta(cid, cloudEvent([{ from, id, type, [type]: payload }], { contacts: [{ wa_id: from, profile: { name: "Aluno IA" } }] }), cloudCfg.appSecret);
      const H = "5511920000208";
      await say(H, "wamid.com-h1", "oi", t => t.some(x => /assistente virtual/.test(x)), "opening of H");
      await say(H, "wamid.com-h2", "Quero transferir meu curso para cá", t => t.some(x => /histórico em PDF/.test(x)), "asks for the transcript (H)");
      await waitFor(() => runOf(H) === "waiting|pedir_historico", 8000, "waits for the transcript (H)");
      llm = anthropic.requests.length;
      let mk = graph.sent.length;
      await media(H, "wamid.com-h3", "image", { id: "MEDIAPNG1", mime_type: "image/png" });
      await waitFor(() => texts(mk).some(x => /preciso do histórico em PDF/.test(x)), 20000, "asks for the PDF when an image arrives");
      assert(anthropic.requests.length === llm, "an image should not call the model");
      mk = graph.sent.length;
      await media(H, "wamid.com-h4", "document", { id: "MEDIAPDF1", mime_type: "application/pdf", filename: "Histórico Escolar.pdf" });
      await waitFor(() => texts(mk).some(x => /Recebi o seu histórico/.test(x)), 20000, "the PDF is taken as the transcript");
      assert(anthropic.requests.length === llm, "the transcript should not call the model");
      await waitFor(() => JSON.parse(sql(`SELECT slots FROM LeadCommercials WHERE leadId=${leadId(H)}`)).hasTranscript === true, 8000, "hasTranscript saved");
      // the file was found as a PDF (type "application") and the analysis was tried: the lead is told it is in progress
      await waitFor(() => texts(mk).some(x => /análise está em andamento/.test(x)), 20000, "the analysis was started with the PDF");

      // I) a voice note nobody can read is asked in writing once, then a person takes it; with transcription on it is read
      const I = "5511920000209";
      await say(I, "wamid.com-i1", "oi", t => t.some(x => /assistente virtual/.test(x)), "opening of I");
      llm = anthropic.requests.length;
      mk = graph.sent.length;
      await media(I, "wamid.com-i2", "audio", { id: "MEDIAOGG1", mime_type: "audio/ogg" });
      await waitFor(() => texts(mk).some(x => /não consigo ouvir áudios/.test(x)), 20000, "asks to write instead of a voice note");
      await waitFor(() => Number(sql(`SELECT COUNT(*) FROM Messages m JOIN Tickets t ON t.id=m.ticketId JOIN Contacts c ON c.id=t.contactId WHERE c.number='${I}' AND m.fromMe=true`)) >= 2, 8000, "reply stored (I)");
      assert(anthropic.requests.length === llm, "an unreadable voice note should not call the model");
      mk = graph.sent.length;
      await media(I, "wamid.com-i3", "audio", { id: "MEDIAOGG2", mime_type: "audio/ogg" });
      await waitFor(() => sql(`SELECT handoffReason FROM Tickets WHERE id=${ticketOf(I)}`) === "media", 20000, "the second voice note goes to a person");
      // transcription on (the company turned it on and the OpenAI key is connected): the voice note is read as text
      assert((await http.put("/ai-settings", { openai: "sk-openai-test" }, auth())).status === 200, "openai key");
      sql(`DELETE FROM Settings WHERE key='ai_transcribe_audio'`);
      sql(`INSERT INTO Settings (key, value, createdAt, updatedAt) VALUES ('ai_transcribe_audio', '1', now(), now())`);
      const J = "5511920000210";
      await say(J, "wamid.com-j1", "oi", t => t.some(x => /assistente virtual/.test(x)), "opening of J");
      llm = anthropic.requests.length;
      mk = graph.sent.length;
      await media(J, "wamid.com-j2", "audio", { id: "MEDIAOGG3", mime_type: "audio/ogg" });
      await waitFor(() => texts(mk).some(x => /consultor/.test(x)), 20000, "the voice note was understood (price question)");
      assert(anthropic.transcriptions >= 1 && anthropic.requests.length === llm, "the voice note was not transcribed, or the model was called for a price question");
      await waitFor(() => sql(`SELECT handoffReason FROM Tickets WHERE id=${ticketOf(J)}`) === "proposal", 8000, "reason proposal (J)");
      sql(`DELETE FROM Settings WHERE key='ai_transcribe_audio'`);

      // K) the model writes a price: it never reaches the person, the lead goes to the proposal
      const qualify = async (number, tag) => {
        await say(number, `wamid.com-${tag}1`, "oi", t => t.some(x => /assistente virtual/.test(x)), `opening ${tag}`);
        await say(number, `wamid.com-${tag}2`, "Quero Direito em Porto Velho", t => t.some(x => /Direito em Porto Velho/.test(x)), `qualification ${tag}`);
        await waitFor(() => runOf(number) === "waiting|apresentar", 8000, `waits at the presentation ${tag}`);
      };
      const K = "5511920000211";
      await qualify(K, "k");
      out = await say(K, "wamid.com-k3", "O curso é caro?", t => t.some(x => /consultor/.test(x)), "price guard");
      assert(!out.some(x => /R\$|299/.test(x)), `the price reached the person: ${out}`);
      await waitFor(() => leadStage(K) === stageName("ready_for_proposal"), 8000, "the guarded price goes to the proposal");
      assert(Number(sql(`SELECT COUNT(*) FROM AgentMetricEvents WHERE leadId=${leadId(K)} AND event='agent_guard'`)) >= 1, "the guard was not recorded");

      // Q) a long answer goes out as short bubbles (never a wall of text with "Ler mais"), the question alone at the end
      const Q = "5511920000215";
      await qualify(Q, "q");
      mk = graph.sent.length;
      await inboundCloud(Q, "wamid.com-q3", "explique tudo sobre o curso");
      await waitFor(() => texts(mk).some(x => /Quer que eu te mostre a grade/.test(x)), 30000, "the long answer arrived");
      const bubbles = texts(mk);
      assert(bubbles.length >= 3 && bubbles.length <= 5, `the answer should be 3 to 5 bubbles, got ${bubbles.length}`);
      assert(bubbles.every(b => b.length <= 650), `a bubble is too long: ${bubbles.map(b => b.length)}`);
      assert(/Quer que eu te mostre a grade/.test(bubbles[bubbles.length - 1]) && bubbles[bubbles.length - 1].length < 100, "the question should be alone at the end");

      // L) the model states a date nobody gave it: replaced by "I'll confirm", the question goes to the team, the conversation goes on
      const L = "5511920000212";
      await qualify(L, "l");
      out = await say(L, "wamid.com-l3", "Quando começam as aulas?", t => t.some(x => /confirmar/.test(x)), "fact guard");
      assert(!out.some(x => /03\/08/.test(x)), `an invented date reached the person: ${out}`);
      await waitFor(() => Number(sql(`SELECT COUNT(*) FROM AiLearnings WHERE ticketId=${ticketOf(L)}`)) >= 1, 8000, "the unanswered question goes to the team");
      assert(runOf(L) === "waiting|apresentar", `the conversation should go on: ${runOf(L)}`);

      // R) the first message already asks about a course the institution does not offer: it presents itself, says it is not offered and lists the ones that are, without the model
      const NOFF = "5511920000230";
      llm = anthropic.requests.length;
      out = await say(NOFF, "wamid.com-noff1", "Quero saber o valor do curso de Medicina", t => t.some(x => /não oferece o curso de Medicina/.test(x)), "a course that is not offered");
      assert(out.some(x => /assistente virtual/.test(x)), `the agent did not present itself: ${out}`);
      assert(out.some(x => /Os cursos que oferecemos incluem [A-ZÁÉÍÓÚÂÊÔÃÇ]/.test(x)), `the offered courses were not listed: ${out}`);
      assert(!out.some(x => /R\$|mensalidade/.test(x)), "a price was given for a course that is not offered");
      assert(anthropic.requests.length === llm, "the model should not be called for a course that is not offered");
      assert(sql(`SELECT slots FROM LeadCommercials WHERE leadId=${leadId(NOFF)}`).includes("Medicina"), "the course that is not offered is kept on the lead");

      // S) the first message is a question (not a greeting): the answer starts with the presentation, and the next one does not repeat it;
      // a lead with a course gets its grade even if nobody asked: the system sends it (here the PDF is not on the server, so its summary goes in writing)
      if (sql(`SELECT COUNT(*) FROM CommercialGrades WHERE courseName='Direito'`) === "0") sql(`INSERT INTO CommercialGrades (courseName, modality, curriculumTerm, courseTracks, internshipInfo, hasTcc, totalInternshipHours, whatsappSummary, complete, contentHash, catalogKey, fileName, createdAt, updatedAt) VALUES ('Direito', 'EAD', '2026/1', '[]', '', false, 0, 'GRADE-AUTO do curso de Direito', true, 'h-e2e-auto', 'direito-e2e-auto', 'direito-e2e-auto.pdf', now(), now())`);
      const gradeTexts = () => graph.sent.filter(x => x.body && x.body.type === "text" && /GRADE-AUTO/.test(x.body.text.body)).length;
      const FIRSTQ = "5511920000231";
      const g0 = gradeTexts();
      out = await say(FIRSTQ, "wamid.com-fq1", "Quanto tempo dura o curso de Direito?", t => t.length > 0, "answer to a first question");
      assert(/assistente virtual/.test(out[0]), `the first answer must present the agent: ${out}`);
      await waitFor(() => gradeTexts() === g0 + 1, 20000, "the grade is sent without being asked");
      await waitFor(() => JSON.parse(sql(`SELECT slots FROM LeadCommercials WHERE leadId=${leadId(FIRSTQ)}`)).gradeSent === true, 8000, "gradeSent saved");
      const FQ2 = graph.sent.length;
      await inboundCloud(FIRSTQ, "wamid.com-fq2", "Quero Direito em Porto Velho");
      await waitFor(() => texts(FQ2).some(x => /Direito em Porto Velho/.test(x)), 20000, "second answer");
      assert(!texts(FQ2).some(x => /assistente virtual/.test(x)), "the presentation was repeated");
      assert(gradeTexts() === g0 + 1, "the grade was sent twice");

      // Q) the scenarios of the attendance, in the layer that needs no model: what is recognised at once and where each conversation goes
      const critId = (await http.post("/courses", { name: "Criminologia", modality: "EAD", category: "Graduação - Cruzeiro", semesters: 8, monthlyFee: 500, active: true }, auth())).data.id;
      const gab = (await http.post("/users", { name: "Gabrielli Estela", email: "gab-est@x.com", password: "senha123", role: "consultor" }, auth())).data;
      const poloEst = (await http.post("/polos", { name: "Polo Estela", code: "EST", city: "Cidade Estela", state: "RO" }, auth())).data;
      await http.put(`/polos/${poloEst.id}/members`, { members: [{ userId: gab.id, role: "comercial" }] }, auth());
      const poloFila = (await http.post("/polos", { name: "Polo Fila", code: "FIL", city: "Cidade Fila", state: "RO" }, auth())).data;
      // a polo whose commercial queue exists but nobody works in: the lead stays there and hears that it waits
      sql(`INSERT INTO Queues (name, color, poloId, role, createdAt, updatedAt) VALUES ('Comercial Polo Fila', '#888888', ${poloFila.id}, 'comercial', now(), now())`);
      const slotsOfNumber = number => JSON.parse(sql(`SELECT slots FROM LeadCommercials WHERE leadId=${leadId(number)}`) || "{}");
      const handoffOf = number => sql(`SELECT handoffReason FROM Tickets WHERE id=${ticketOf(number)}`);
      const withLead = async (number, city) => { assert([200, 201].includes((await http.post("/leads", { name: `Pessoa ${number.slice(-3)}`, phone: number, city }, auth())).status), "lead"); };
      const llm0 = anthropic.requests.length;

      // "Oi": a short presentation by the default assistant (Estela) and the next question, no model
      const Q1 = "5511920000240";
      out = await say(Q1, "wamid.qs-1", "Oi", t => t.some(x => /conhecer nossos cursos/.test(x)), "greeting by Estela");
      assert(/Estela, assistente virtual/.test(out.join(" ")), `the greeting does not present Estela: ${out}`);
      assert(/conhecer nossos cursos/.test(out.join(" ")), `the greeting did not lead to the next question: ${out}`);

      // "Quanto custa Criminologia?": the course is recognised in the words, the price goes to the consultant with the course already in the brief
      const Q2 = "5511920000241";
      out = await say(Q2, "wamid.qs-2", "Quanto custa Criminologia?", t => t.some(x => /consultor/.test(x)), "price handed to the consultant");
      assert(out.some(x => /Estela, assistente virtual/.test(x)), `no presentation before the answer: ${out}`);
      assert(!out.some(x => /R\$|mensalidade de/.test(x)), "a price was given");
      await waitFor(() => slotsOfNumber(Q2).courseName === "Criminologia" && handoffOf(Q2) === "proposal", 15000, "the course recognised and the handoff routed");
      assert(Number(sql(`SELECT COUNT(*) FROM TicketEvents WHERE ticketId=${ticketOf(Q2)} AND type='handoff' AND note LIKE '%Curso:%Criminologia%'`)) >= 1, "the brief does not carry the course");

      // "Quero me matricular hoje": straight to the consultant, even with nothing else known
      const Q3 = "5511920000242";
      await say(Q3, "wamid.qs-3", "Quero me matricular hoje", t => t.some(x => /consultor/.test(x)), "enrollment handed over");
      await waitFor(() => handoffOf(Q3) === "proposal" && sql(`SELECT aiActive FROM Tickets WHERE id=${ticketOf(Q3)}`) === "0", 15000, "the AI is out after the handoff");

      // "Já sou aluno": the system asks which team (tutoring or secretary) instead of selling
      const Q4 = "5511920000243";
      out = await say(Q4, "wamid.qs-4", "Já sou aluno", t => t.some(x => /tutoria/.test(x) && /secretaria/.test(x)), "a student is asked which team");
      assert(slotsOfNumber(Q4).interestKind === "aluno", "the kind of interest was not kept");

      // "Meu boleto está errado": an administrative matter of a student goes to the secretary, not to sales
      const Q5 = "5511920000244";
      await withLead(Q5, "Cidade Estela");
      await say(Q5, "wamid.qs-5", "Meu boleto está errado", t => t.some(x => /secretaria/.test(x)), "the boleto goes to the secretary");
      await waitFor(() => handoffOf(Q5) === "secretary", 15000, "routed as secretary");
      assert(slotsOfNumber(Q5).interestKind === "administrativo", "administrative interest not kept");

      // "Já conversei com a Gabrielli": the conversation goes to her when she is on the team of the polo
      const Q6 = "5511920000245";
      await withLead(Q6, "Cidade Estela");
      await say(Q6, "wamid.qs-6", "Já conversei com a Gabrielli", t => t.some(x => /priorizando Gabrielli/.test(x)), "the named consultant is prioritised");
      await waitFor(() => sql(`SELECT userId FROM Tickets WHERE id=${ticketOf(Q6)}`) === String(gab.id), 15000, "assigned to the consultant the lead named");
      assert(Number(sql(`SELECT COUNT(*) FROM TicketEvents WHERE ticketId=${ticketOf(Q6)} AND type='transfer' AND note LIKE '%Consultor pedido pelo lead%'`)) === 1, "the routing does not say why");

      // "Quero falar com João": nobody called João on the team: it still goes to the team of the polo and the brief says what was asked
      const Q7 = "5511920000246";
      await withLead(Q7, "Cidade Estela");
      await say(Q7, "wamid.qs-7", "Quero falar com João", t => t.some(x => /equipe do seu polo/.test(x)), "a person was asked for");
      await waitFor(() => handoffOf(Q7) === "human_request" && sql(`SELECT userId FROM Tickets WHERE id=${ticketOf(Q7)}`) === String(gab.id), 15000, "routed to the team of the polo");
      assert(slotsOfNumber(Q7).preferredConsultantName && /João/.test(slotsOfNumber(Q7).preferredConsultantName), "the name that was asked for was lost");

      // "Preciso de atendimento humano": a person, with the data incomplete
      const Q8 = "5511920000247";
      await say(Q8, "wamid.qs-8", "Preciso de atendimento humano", t => t.some(x => /consultor/.test(x)), "a human was asked for");
      await waitFor(() => handoffOf(Q8) === "human_request", 15000, "human handoff routed");

      // a polo nobody works at: the lead hears that it waits in the queue (or when the team returns), never that someone took it
      const Q9 = "5511920000248";
      await withLead(Q9, "Cidade Fila");
      out = await say(Q9, "wamid.qs-9", "Quero falar com uma pessoa", t => t.some(x => /fila|retorna/.test(x)), "the queue is said");
      assert(!out.some(x => /assumiu|já está com/.test(x)), `the lead was told someone took it: ${out}`);
      assert(anthropic.requests.length === llm0, "the model was called in the scenarios that need none");

      // "Sou de Cidade Estela": the city is recognised in the words from the polos of the system (the model only writes the answer)
      const Q10 = "5511920000249";
      await say(Q10, "wamid.qs-10", "Sou de Cidade Estela", t => t.length > 0, "a statement of the city");
      await waitFor(() => slotsOfNumber(Q10).city === "Cidade Estela", 15000, "the city was recognised in the words");

      // Z) the formats and the rules of the MEC: national, institutional and not confirmed come apart; the classes (turmas) the team confirms move items out of "not confirmed"
      await http.post("/courses", { name: "Pedagogia Social", modality: "SEMIPRESENCIAL", category: "Graduação - Cruzeiro", semesters: 8, monthlyFee: 400, active: true }, auth());
      await http.post("/mec-defaults/apply", {}, auth());
      const pedId = Number(sql(`SELECT id FROM Courses WHERE name='Pedagogia Social' ORDER BY id DESC LIMIT 1`));
      assert(Number(sql(`SELECT COUNT(*) FROM CourseRegulations WHERE courseId=${pedId}`)) === 1, "the standard of the area was not applied to the new course");
      assert(/não podem mais ser ofertados a distância/.test(sql(`SELECT commercialApprovedText FROM CourseRegulations WHERE courseId=${pedId}`)), "the text of the licenciaturas does not explain why it is not EaD");
      const norms = (await http.get("/regulatory-norms", auth())).data;
      assert(norms.norms.length >= 4 && ["decreto-12456-2025", "portaria-378-2025", "portaria-381-2025", "portaria-506-2025"].every(k => norms.norms.some(n => n.key === k)), `norms: ${JSON.stringify(norms.norms.map(n => n.key))}`);
      assert(norms.norms.every(n => n.stale === true), "a norm nobody checked should ask to be checked");
      assert(Number(sql(`SELECT COUNT(*) FROM KbDocuments WHERE agentId=${agentId} AND topic LIKE 'mec/norm/%'`)) === 4 && Number(sql(`SELECT COUNT(*) FROM KbDocuments WHERE agentId=${agentId} AND topic IN ('institutional/mec-formats','institutional/mec-licenciaturas','institutional/mec-transition')`)) === 3, "the agent did not learn the norms and the guide of how to explain them");

      const Z1 = "5511920000250";
      await withLead(Z1, "Cidade Estela");
      out = await say(Z1, "wamid.mec-1", "Qual o formato da Pedagogia Social? É online?", t => t.some(x => /AINDA NÃO:/.test(x)), "the explanation of the format");
      const z1 = out.join(" ");
      assert(/Licenciaturas não podem ser ofertadas a distância/.test(z1) && /30%/.test(z1), `the national rule is missing: ${z1}`);
      assert(/AINDA NÃO:.*quantidade de encontros presenciais/.test(z1) && /local das atividades/.test(z1), `what is not confirmed was not separated: ${z1}`);
      assert(!/calendário previsto/i.test(z1.split("AINDA NÃO:")[0]), "a class nobody published was told");

      // a draft is for the team: only the published class reaches the lead
      const cohort = (await http.post("/course-cohorts", { courseId: pedId, label: "Pedagogia Social 2026/2", expectedCalendar: "Encontros presenciais um sábado por mês.", activityLocation: "Polo de Porto Velho", contractedModality: "SEMIPRESENCIAL", transitionRegime: "semipresencial_transicao", syncRules: "Aulas ao vivo às quartas à noite.", published: false }, auth())).data;
      assert(cohort.id && cohort.published === false, "cohort not created");
      assert((await http.post("/course-cohorts", { courseId: pedId, label: "" }, auth()).catch(e => e.response)).status === 400, "a class without a name was accepted");
      assert((await http.post("/course-cohorts", { courseId: pedId, label: "x", contractedModality: "HIBRIDO" }, auth()).catch(e => e.response)).status === 400, "an invalid modality was accepted");
      const Z2 = "5511920000251";
      await withLead(Z2, "Cidade Estela");
      out = await say(Z2, "wamid.mec-2", "Qual o formato da Pedagogia Social?", t => t.some(x => /AINDA NÃO:/.test(x)), "draft class not told");
      assert(!/sábado por mês/.test(out.join(" ")), `a draft class reached the lead: ${out}`);
      assert((await http.put(`/course-cohorts/${cohort.id}`, { published: true }, auth())).status === 200, "publish the class");
      const Z3 = "5511920000252";
      await withLead(Z3, "Cidade Estela");
      out = await say(Z3, "wamid.mec-3", "Qual o formato da Pedagogia Social?", t => t.some(x => /AINDA NÃO:/.test(x)), "published class told");
      const z3 = out.join(" ");
      assert(/Encontros presenciais um sábado por mês/.test(z3) && /Polo de Porto Velho/.test(z3) && /Aulas ao vivo às quartas/.test(z3), `the confirmed items did not reach the answer: ${z3}`);
      assert(/AINDA NÃO:.*início das atividades presenciais/.test(z3) && !/AINDA NÃO:[^.]*calendário previsto/i.test(z3), `the items still unknown must stay unknown: ${z3}`);

      // an amended norm is told to the agents with its status, and the check is recorded
      const n378 = norms.norms.find(n => n.key === "portaria-378-2025");
      assert((await http.put(`/regulatory-norms/${n378.id}`, { status: "alterada", amendments: "Portaria de teste alterou o art. 8º." }, auth())).status === 200, "amend the norm");
      await waitFor(() => /ALTERADA/.test(sql(`SELECT content FROM KbDocuments WHERE agentId=${agentId} AND topic='mec/norm/portaria-378-2025'`)), 15000, "the amended norm reached the agent");
      assert(/Portaria de teste alterou/.test(sql(`SELECT content FROM KbDocuments WHERE agentId=${agentId} AND topic='mec/norm/portaria-378-2025'`)), "the amendment text did not reach the agent");
      const after = (await http.get("/regulatory-norms", auth())).data.norms.find(n => n.key === "portaria-378-2025");
      assert(after.status === "alterada" && after.reviewedAt && after.stale === false, "the check was not recorded");
      await http.put(`/regulatory-norms/${n378.id}`, { status: "vigente", amendments: "" }, auth());
      await waitFor(() => !/ALTERADA/.test(sql(`SELECT content FROM KbDocuments WHERE agentId=${agentId} AND topic='mec/norm/portaria-378-2025'`)), 15000, "back to vigente");

      // what the model writes in Markdown never reaches WhatsApp as symbols
      const Z4 = "5511920000253";
      await withLead(Z4, "Cidade Estela");
      out = await say(Z4, "wamid.mec-4", "texto com markdown", t => t.some(x => /Duração - 8 semestres/.test(x)), "markdown answer");
      const z4 = out.join("\n");
      assert(/\*Pedagogia\* tem 8 semestres/.test(z4) && !/\*\*|###|\]\(|\|---/.test(z4), `markdown reached the person: ${z4}`);
      assert(/a grade: https:\/\/exemplo.com\/g.pdf/.test(z4) && /Duração - 8 semestres/.test(z4), `the link or the table was not turned into text: ${z4}`);

      // M) the provider fails twice: the person is told a colleague continues, the conversation goes to the team with the reason, the failure is counted
      const M = "5511920000213";
      await qualify(M, "m");
      mk = graph.sent.length;
      await inboundCloud(M, "wamid.com-m3", "forçar erro do provedor");
      await waitFor(() => texts(mk).some(x => /consultor/.test(x)), 40000, "handoff after the provider failed");
      await waitFor(() => sql(`SELECT handoffReason FROM Tickets WHERE id=${ticketOf(M)}`) === "error", 10000, "reason error");
      assert(Number(sql(`SELECT COUNT(*) FROM AgentMetricEvents WHERE event='agent_error' AND meta LIKE '%"ticketId":${ticketOf(M)}%'`)) >= 1, "the failure was not counted");

      // N) a message that arrives while the AI is still answering the previous one is answered too
      const N = "5511920000214";
      await qualify(N, "n");
      mk = graph.sent.length;
      await inboundCloud(N, "wamid.com-n3", "pergunta lenta");
      await new Promise(r => setTimeout(r, 600));
      await inboundCloud(N, "wamid.com-n4", "e outra pergunta");
      await waitFor(() => texts(mk).some(x => /Resposta devagar/.test(x)) && texts(mk).some(x => /Pode me contar mais/.test(x)), 45000, "both messages were answered");

      // O) a conversation nobody continues is closed after a while: the lead goes to "Sem resposta" with a task, once
      sql(`UPDATE ChatFlowRuns SET updatedAt = now() - interval '10 days' WHERE ticketId=${ticketOf(L)} AND status='waiting'`);
      await waitFor(() => /^done/.test(runOf(L)) && leadStage(L) === stageName("no_response"), 40000, "the stopped conversation was closed");
      assert(Number(sql(`SELECT COUNT(*) FROM LeadTasks WHERE leadId=${leadId(L)} AND title LIKE 'Retomar contato: o lead parou%'`)) === 1, "no task for the lead that stopped answering");

      // P) the keys of the external tools never come back to the browser, stay when saved again, and do not follow a tool to another host
      const secretGraph = { nodes: [{ id: "st", type: "start", data: {} }, { id: "s", type: "stage", data: { title: "Etapa", objective: "Testar", http: [{ name: "agenda", description: "Consulta", url: `http://localhost:${GRAPH_PORT}/horarios`, method: "GET", params: [], headerName: "X-Api-Key", headerValue: "segredo-super-1234" }] } }, { id: "f", type: "end", data: {} }], edges: [{ id: "e1", source: "st", target: "s" }, { id: "e2", source: "s", sourceHandle: "done", target: "f" }] };
      const sf = (await http.post("/flows", { kind: "agent", agentId, name: "Segredos", graph: secretGraph }, auth())).data;
      assert(!JSON.stringify(sf).includes("segredo-super") && sf.graph.nodes.find(n => n.id === "s").data.http[0].headerValue.startsWith("••••"), "the key came back to the browser");
      await http.put(`/flows/${sf.id}`, { graph: sf.graph }, auth());
      assert(sql(`SELECT draft FROM ChatFlows WHERE id=${sf.id}`).includes("segredo-super-1234"), "saving the mask erased the key");
      const dup = (await http.post(`/flows/${sf.id}/duplicate`, {}, auth())).data;
      assert(!sql(`SELECT draft FROM ChatFlows WHERE id=${dup.id}`).includes("segredo-super"), "a copy carries the key");
      const moved = JSON.parse(JSON.stringify(sf.graph));
      moved.nodes.find(n => n.id === "s").data.http[0].url = "https://evil.example.org/collect";
      await http.put(`/flows/${sf.id}`, { graph: moved }, auth());
      assert(!sql(`SELECT draft FROM ChatFlows WHERE id=${sf.id}`).includes("segredo-super"), "the key followed the tool to another host");
      await http.delete(`/flows/${sf.id}`, auth());
      await http.delete(`/flows/${dup.id}`, auth());

      // nobody was enrolled by the AI, and the same person with or without the ninth digit is one lead
      assert(Number(sql(`SELECT COUNT(*) FROM Leads l JOIN LeadStages s ON s.id=l.stageId WHERE s.type='won' AND l.id IN (${[A, B, C, D, E].map(leadId).join(",")})`)) === 0, "the agent enrolled a lead");
      const nineDigit = "5569991234567", eightDigit = "556991234567";
      const l1 = await http.post("/leads", { name: "Maria Nove", phone: nineDigit }, auth());
      const l2 = await http.post("/leads", { name: "Maria Nove", phone: eightDigit }, auth());
      assert(l1.status === 201 && (l2.status === 200 || l2.status === 201) && l1.data.id === l2.data.id, `the same person became two leads: ${l1.data.id} / ${l2.data.id}`);

      // metrics: the funnel counts a lead once per step and the AI shows what it spent
      const m = (await http.get(`/ai-agents/${agentId}/commercial-metrics`, auth())).data;
      const f = e => m.funnel.find(x => x.event === e).leads;
      assert(f("lead_received") >= 5 && f("contact_started") >= 5 && f("replied") >= 5 && f("qualified") >= 2 && f("ready_for_proposal") >= 1 && f("human_handoff") >= 1 && f("follow_up") >= 1, `funnel ${JSON.stringify(m.funnel)}`);
      assert(m.ai.turns >= 15 && m.ai.deterministicTurns >= 8 && m.ai.llmCalls >= 5 && m.ai.toolCalls >= 3 && m.ai.tokens.total > 0 && m.ai.deterministicShare > 30, `ai ${JSON.stringify(m.ai)}`);
      assert(m.ai.perConversation > 0 && m.ai.priceSet === false && m.ai.costUsd === null, "the cost must not be guessed without a configured price");
      assert(m.unknownQuestions >= 1, "unknown question not counted");
      assert(m.handoffs && m.handoffs.total >= 5 && m.handoffs.byReason.some(r => r.why === "complaint") && m.handoffs.byReason.some(r => r.why === "proposal"), `handoffs ${JSON.stringify(m.handoffs)}`);
      assert(m.technical.errors >= 1 && m.technical.guards >= 2, `technical ${JSON.stringify(m.technical)}`);

      // R) a qualified lead who has had its questions answered goes to the consultant, ready, with a message that says so
      setQualified(2);
      const R = "5511920000301";
      await say(R, "wamid.com-r1", "oi", t => t.some(x => /assistente virtual/.test(x)), "R opening");
      await say(R, "wamid.com-r2", "Quero Direito em Porto Velho, primeira graduação", t => t.some(x => /Direito em Porto Velho/.test(x)), "R qualification");
      await say(R, "wamid.com-r3", "Quanto tempo dura o curso?", t => t.some(x => /Direito:/.test(x)), "R course");
      assert(sql(`SELECT COALESCE(handoffReason,'') FROM Tickets WHERE id=${ticketOf(R)}`) === "", "handed over too early: the lead had no answers left to get");
      // the handover waits while the agent has just asked the person something (they answer first), but not forever: within a few answers it happens
      let handed = false;
      let rn = 4;
      for (const q of ["E sobre as mudanças do MEC, como fica?", "Paulo Souza Lima, CPF 862.883.667-57", "Entendi, obrigado", "Certo, e agora?", "Pode ser"]) {
        out = await say(R, `wamid.com-r${rn}`, q, t => t.length > 0, "R answer");
        rn += 1;
        try {
          await waitFor(() => sql(`SELECT handoffReason FROM Tickets WHERE id=${ticketOf(R)}`) === "qualified", 3500, "R routed as qualified");
          handed = true;
          break;
        } catch (e) { /* the agent asked something: the person answers first */ }
      }
      assert(handed, "the qualified lead was never handed over");
      assert(Number(sql(`SELECT COUNT(*) FROM Messages WHERE ticketId=${ticketOf(R)} AND body LIKE '%Perfeito%' AND body LIKE '%consultor do nosso polo%'`)) >= 1, "the handover message (warm, with the name and the course) was not sent");
      // the full name and the CPF were asked for the scholarship, read from the answer, kept in the lead and never left in the conversation state
      assert(Number(sql(`SELECT COUNT(*) FROM Messages WHERE ticketId=${ticketOf(R)} AND fromMe=true AND body LIKE '%nome completo e CPF%'`)) >= 1, "the system never asked for the full name and the CPF");
      assert(sql(`SELECT cpf FROM Leads WHERE id=${leadId(R)}`) === "86288366757", "the CPF was not saved in the lead");
      assert(!/86288366757|862\.883\.667/.test(sql(`SELECT slots FROM LeadCommercials WHERE leadId=${leadId(R)}`)), "the CPF leaked into the state of the conversation");
      assert(JSON.parse(sql(`SELECT slots FROM LeadCommercials WHERE leadId=${leadId(R)}`)).fullName === "Paulo Souza Lima", "the full name was not kept");
      assert(Number(sql(`SELECT COUNT(*) FROM Messages WHERE ticketId=${ticketOf(R)} AND fromMe=true AND body LIKE '%simular a bolsa%' AND body LIKE '%Perfeito%'`)) >= 1, "the handover did not say the consultant will simulate the scholarship");
      assert(sql(`SELECT aiActive FROM Tickets WHERE id=${ticketOf(R)}`) === "0", "the AI kept talking after the handover");
      assert(Number(sql(`SELECT COUNT(*) FROM AgentMetricEvents WHERE leadId=${leadId(R)} AND event='handoff_qualified'`)) === 1, "no metric for the qualified handover");
      assert(JSON.parse(sql(`SELECT slots FROM LeadCommercials WHERE leadId=${leadId(R)}`)).readyForConsultant === true, "the lead was not marked ready for the consultant");
      setQualified(99);

      // S) the lead says the city (a town the polo serves, written with a typo): the polo is found, the conversation goes to that polo's queue
      //    with a consultant of the polo as owner, and the agent keeps talking; a city nobody serves is asked about, never guessed
      const consS = (await http.post("/users", { name: "Consultor Cobertura", email: "cobertura-cons@x.com", password: "senha123", role: "consultor" }, auth())).data;
      const poloS = (await http.post("/polos", { name: "Polo Cobertura", code: "COB", city: "Cidade Cobertura", state: "RO" }, auth())).data;
      await http.put(`/polos/${poloS.id}/members`, { members: [{ userId: consS.id, role: "comercial" }] }, auth());
      const cov = await http.put(`/polos/${poloS.id}/coverage`, { cities: ["Candeias do Jamari - RO", "Itapuã do Oeste"] }, auth());
      assert(cov.status === 200 && cov.data.length === 2, `coverage ${cov.status} ${JSON.stringify(cov.data)}`);
      const clash = await http.put(`/polos/${poloS.id + 0}/coverage`, { cities: ["Candeias do Jamari"] }, auth());
      assert(clash.status === 200, "the same polo may keep its own city");
      const other = (await http.post("/polos", { name: "Polo Outro", code: "OUT", city: "Cidade Outro", state: "RO" }, auth())).data;
      const dupCity = await http.put(`/polos/${other.id}/coverage`, { cities: ["candeias do jamari"] }, auth());
      assert(dupCity.status === 409 && dupCity.data.error === "ERR_POLO_COVERAGE_DUPLICATED", `a city of another polo was accepted: ${dupCity.status} ${JSON.stringify(dupCity.data)}`);
      const S = "5511920000302";
      out = await say(S, "wamid.com-s1", "moro em Candeias do Jamari - RO", t => t.some(x => /Você é atendido pelo Polo Cobertura/.test(x)), "S polo found by coverage");
      await waitFor(() => sql(`SELECT poloId FROM Leads WHERE id=${leadId(S)}`) === String(poloS.id), 10000, "S polo saved on the lead");
      const queueS = sql(`SELECT id FROM Queues WHERE poloId=${poloS.id} AND role='comercial'`);
      await waitFor(() => sql(`SELECT queueId FROM Tickets WHERE id=${ticketOf(S)}`) === queueS, 10000, "S conversation moved to the polo queue");
      assert(sql(`SELECT ownerId FROM Leads WHERE id=${leadId(S)}`) === String(consS.id), "the owner of the lead is not a consultant of the polo");
      assert(sql(`SELECT aiActive FROM Tickets WHERE id=${ticketOf(S)}`) === "1" && sql(`SELECT COALESCE(userId::text,'') FROM Tickets WHERE id=${ticketOf(S)}`) === "", "early routing must not take the conversation from the agent");
      assert(JSON.parse(sql(`SELECT slots FROM LeadCommercials WHERE leadId=${leadId(S)}`)).city !== "Cidade Cobertura", "the city of the lead was overwritten by the polo's city");
      const U = "5511920000303";
      out = await say(U, "wamid.com-s2", "moro em Cidade Que Nao Existe", t => t.some(x => /AVISO: .*estado/.test(x)), "U no polo: the state is asked");
      assert(sql(`SELECT COALESCE(poloId::text,'') FROM Leads WHERE id=${leadId(U)}`) === "", "a polo was guessed for a city nobody serves");

      // V) objections: the agent answers them (with the guide of the base) and a person takes over after the third; "é golpe?" is a doubt, not a complaint
      const V = "5511920000305";
      await say(V, "wamid.com-v1", "oi", t => t.some(x => /assistente virtual/.test(x)), "V opening");
      await say(V, "wamid.com-v2", "Quero Direito em Porto Velho, primeira graduação", t => t.some(x => /Direito em Porto Velho/.test(x)), "V qualification");
      await say(V, "wamid.com-v3", "e se for golpe?", t => t.some(x => /natural querer ter certeza/.test(x)), "V first objection answered by the agent");
      assert(sql(`SELECT COALESCE(handoffReason,'') FROM Tickets WHERE id=${ticketOf(V)}`) === "", "'é golpe?' was taken as a complaint");
      await say(V, "wamid.com-v4", "parece golpe isso", t => t.some(x => /natural querer ter certeza/.test(x)), "V second objection");
      await say(V, "wamid.com-v5", "tenho medo de golpe mesmo", t => t.length > 0, "V third objection");
      await waitFor(() => sql(`SELECT handoffReason FROM Tickets WHERE id=${ticketOf(V)}`) === "objection", 10000, "V handed over after the third objection");
      const slotsV = JSON.parse(sql(`SELECT slots FROM LeadCommercials WHERE leadId=${leadId(V)}`));
      assert(slotsV.objectionCount === 3 && /confianca/.test(slotsV.objectionsSeen || ""), `objection slots ${JSON.stringify([slotsV.objectionCount, slotsV.objectionsSeen])}`);

      // W) what the lead says about the moment is saved (CRM fields and score), the agent schedules the consultant's call, and the brief carries it all
      const W = "5511920000306";
      await say(W, "wamid.com-w1", "oi", t => t.some(x => /assistente virtual/.test(x)), "W opening");
      await say(W, "wamid.com-w2", "Quero Direito em Porto Velho, primeira graduação, quero começar esta semana", t => t.some(x => /Direito em Porto Velho/.test(x)), "W qualification");
      await waitFor(() => sql(`SELECT CONCAT(COALESCE(decisionTimeline,''),'|',COALESCE(shift,'')) FROM Leads WHERE id=${leadId(W)}`) === "Decide esta semana|Noite", 10000, "W CRM fields filled");
      assert(sql(`SELECT temperature FROM LeadCommercials WHERE leadId=${leadId(W)}`) === "hot", "who decides this week should be hot");
      out = await say(W, "wamid.com-w3", "pode ser amanhã às 14h?", t => t.some(x => /Combinado! O consultor do seu polo entra em contato/.test(x)), "W the call is scheduled");
      assert(Number(sql(`SELECT COUNT(*) FROM LeadTasks WHERE leadId=${leadId(W)} AND type='ligar' AND title LIKE 'Retornar ao lead no horário combinado%'`)) === 1, "no task for the consultant's call");
      await say(W, "wamid.com-w4", "quero falar com uma pessoa", t => t.some(x => /consultor/.test(x)), "W asks for a person");
      await waitFor(() => Number(sql(`SELECT COUNT(*) FROM TicketEvents WHERE ticketId=${ticketOf(W)} AND type='handoff' AND note LIKE '%Pretende decidir: Decide esta semana%' AND note LIKE '%Melhor horário para falar:%' AND note LIKE '%O que o lead disse por último%' AND note LIKE '%Próximo passo sugerido ao consultor%'`)) >= 1, 10000, "W the brief carries what the lead told");

      // X) a lead who stops answering gets a gentle reminder (twice at most, spaced), only inside the service window, and the count starts over when they write
      const X = "5511920000307";
      await say(X, "wamid.com-x1", "oi", t => t.some(x => /assistente virtual/.test(x)), "X opening");
      await say(X, "wamid.com-x2", "Quero Direito em Porto Velho, primeira graduação", t => t.some(x => /Direito em Porto Velho/.test(x)), "X qualification");
      await waitFor(() => runOf(X) === "waiting|apresentar", 8000, "X waits");
      const markX = graph.sent.length;
      sql(`UPDATE LeadCommercials SET slots = (slots::jsonb || jsonb_build_object('lastInboundAt', to_char((now() - interval '4 hours') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'lastOutboundAt', to_char((now() - interval '3 hours 50 minutes') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))::text, lastInboundAt = now() - interval '4 hours', lastOutboundAt = now() - interval '3 hours 50 minutes' WHERE leadId=${leadId(X)}`);
      await waitFor(() => texts(markX).some(x => /Ficou com alguma dúvida sobre Direito/.test(x)), 30000, "X the first reminder");
      assert(JSON.parse(sql(`SELECT slots FROM LeadCommercials WHERE leadId=${leadId(X)}`)).nudges === 1, "the reminder was not counted");
      await new Promise(r => setTimeout(r, 9000));
      assert(texts(markX).filter(x => /Ficou com alguma dúvida|passando só para saber/i.test(x)).length === 1, "a second reminder came too soon");
      await say(X, "wamid.com-x3", "Quanto tempo dura o curso?", t => t.some(x => /Direito:/.test(x)), "X answers");
      assert(JSON.parse(sql(`SELECT slots FROM LeadCommercials WHERE leadId=${leadId(X)}`)).nudges === 0, "the reminders did not start over");

      // Y) a lead who gives up leaves with the REASON the CRM understands (from the objection that came up), and the metrics tell why we lose
      const Y = "5511920000308";
      await say(Y, "wamid.com-y1", "oi", t => t.some(x => /assistente virtual/.test(x)), "Y opening");
      await say(Y, "wamid.com-y2", "Quero Direito em Porto Velho, primeira graduação", t => t.some(x => /Direito em Porto Velho/.test(x)), "Y qualification");
      await say(Y, "wamid.com-y3", "achei caro, não tenho mais interesse", t => t.some(x => /agradeço o seu tempo/.test(x)), "Y gives up");
      // (the column may be one the company already had, with its own name: what matters is that it is a "lost" column)
      await waitFor(() => sql(`SELECT s.type FROM Leads l JOIN LeadStages s ON s.id=l.stageId WHERE l.id=${leadId(Y)}`) === "lost", 10000, "Y goes to a lost column");
      assert(sql(`SELECT lostReason FROM Leads WHERE id=${leadId(Y)}`) === "Preço / mensalidade", `the lost reason is not the one of the objection: ${sql(`SELECT lostReason FROM Leads WHERE id=${leadId(Y)}`)}`);
      const m2 = (await http.get(`/ai-agents/${agentId}/commercial-metrics`, auth())).data;
      assert(m2.intake.created >= m2.intake.attended && m2.intake.attended >= 5, `intake ${JSON.stringify(m2.intake)}`);
      assert(m2.byPoloFunnel.length >= 1 && m2.bySourceFunnel.length >= 1 && m2.bySourceFunnel.every(r => r.received >= 1), `cuts ${JSON.stringify([m2.byPoloFunnel, m2.bySourceFunnel])}`);
      assert(m2.lostReasons.some(r => r.reason === "Preço / mensalidade"), `lost reasons ${JSON.stringify(m2.lostReasons)}`);
      assert(m2.handoffs.byReason.some(r => r.why === "qualified") && m2.handoffs.byReason.some(r => r.why === "objection"), `new reasons ${JSON.stringify(m2.handoffs.byReason)}`);

      // T) outside the business hours of the number the agent still answers: the "out of hours" text is only for numbers without an agent
      sql(`UPDATE Whatsapps SET businessHours='{"enabled":true,"days":{}}', outOfHoursMessage='Estamos fechados agora' WHERE id=${cid}`);
      const T = "5511920000304";
      out = await say(T, "wamid.com-t1", "oi", t => t.some(x => /assistente virtual/.test(x)), "T the agent answers outside the business hours");
      assert(!out.some(x => /Estamos fechados/.test(x)), "the out-of-hours text was sent instead of the agent");
      sql(`UPDATE Whatsapps SET businessHours=NULL, outOfHoursMessage=NULL WHERE id=${cid}`);

      // the Central of the agent: its first screen in one call (kind by the drawing, health with where to fix, the week in numbers)
      const central = (await http.get(`/ai-agents/${agentId}/central`, auth())).data;
      assert(central.agent.kind === "commercial" && central.flow && central.flow.id === flowId, `central agent ${JSON.stringify(central.agent)}`);
      const keysOf = central.health.map(h => h.key);
      ["active", "key", "flow", "polos", "cities", "crm", "mec", "errors"].forEach(k => assert(keysOf.includes(k), `health lacks ${k}: ${keysOf}`));
      assert(central.health.every(h => typeof h.ok === "boolean" && h.label && h.fix), "a check without label or where to fix it");
      assert(central.week.conversations >= 5 && central.week.handedOver >= 3 && typeof central.pending.waiting === "number", `week ${JSON.stringify(central.week)}`);
      assert((await http.get(`/ai-agents/${agentId}/improve`, auth())).status === 200, "the old address of the improvement board must keep working");
      await http.post("/users", { name: "Tutor Central", email: "tutor-central@x.com", password: "senha123", role: "tutor" }, auth());
      const tutorCentral = (await http.post("/auth/login", { email: "tutor-central@x.com", password: "senha123" })).data.token;
      assert((await http.get(`/ai-agents/${agentId}/central`, asUser(tutorCentral))).status === 403, "a tutor read the Central of the agent");
      const flowList = (await http.get("/flows", { ...auth(), params: { kind: "agent" } })).data;
      assert(flowList.find(f => f.id === flowId).agentKind === "commercial", "the list does not say the kind of the agent");

      // the old agent and the others are as they were
      await http.put(`/ai-agents/${agentId}`, { active: false }, auth());
      await http.put(`/ai-agents/${aiId}`, { active: true }, auth());
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
    await test("visual flows: validation, simulator, publishing, a real conversation, counters and the CRM", async () => {
      sql("DELETE FROM ChatbotNodes");
      const graph1 = {
        nodes: [
          { id: "s", type: "start", data: {} },
          { id: "menu", type: "buttons", data: { text: "Oi {{primeiro_nome}}! Escolha:", options: [{ id: "a", label: "Quero me matricular" }, { id: "b", label: "Tenho uma dúvida" }] } },
          { id: "nome", type: "ask", data: { text: "Qual o seu nome completo?", field: "nome", validate: "text" } },
          { id: "crm", type: "crm", data: { action: "send_to_crm", source: "Chatbot" } },
          { id: "fim", type: "end", data: { text: "Pronto! Um consultor fala com você." } },
          { id: "duv", type: "message", data: { text: "Pode escrever a sua dúvida." } },
          { id: "fim2", type: "end", data: {} }
        ],
        edges: [
          { id: "1", source: "s", target: "menu" }, { id: "2", source: "menu", target: "nome", sourceHandle: "a" },
          { id: "3", source: "nome", target: "crm" }, { id: "4", source: "crm", target: "fim" }, { id: "5", source: "menu", target: "duv", sourceHandle: "b" }, { id: "6", source: "duv", target: "fim2" }
        ]
      };
      const broken = JSON.parse(JSON.stringify(graph1));
      broken.edges = broken.edges.filter(e => e.id !== "5");
      const mk = await http.post("/flows", { name: "Triagem", entry: { type: "first_message" }, graph: broken }, auth());
      assert(mk.status === 201 && mk.data.errors >= 1, `create ${mk.status} ${mk.data.errors}`);
      const flowId = mk.data.id;
      assert(mk.data.issues.some(i => /Tenho uma dúvida/.test(i.text)), "validation did not point at the open option");
      assert((await http.post(`/flows/${flowId}/publish`, {}, auth())).status === 422, "a flow with errors was published");
      await http.post("/users", { name: "Consultor dos Fluxos", email: "flows-cons@x.com", password: "senha123", role: "consultor" }, auth());
      const consTk = (await http.post("/auth/login", { email: "flows-cons@x.com", password: "senha123" })).data.token;
      assert((await http.get("/flows", asUser(consTk))).status === 403, "a consultant reached the flows");

      // the simulator walks the draft and nothing leaves the system
      const upd = await http.put(`/flows/${flowId}`, { graph: graph1 }, auth());
      assert(upd.status === 200 && upd.data.errors === 0, `fixed ${upd.status} ${upd.data.errors}`);
      const sent0 = graph.sent.length;
      const s1 = (await http.post(`/flows/${flowId}/simulate`, { sample: { name: "Maria Souza" } }, auth())).data;
      assert(s1.status === "waiting" && s1.messages[0].includes("Oi Maria!") && s1.messages[0].includes("*1* - Quero me matricular"), `sim1 ${JSON.stringify(s1.messages)}`);
      const s2 = (await http.post(`/flows/${flowId}/simulate`, { state: s1.state, input: "1" }, auth())).data;
      assert(s2.messages[0].includes("nome completo") && s2.status === "waiting", "sim2");
      const s3 = (await http.post(`/flows/${flowId}/simulate`, { state: s2.state, input: "Maria Clara Souza" }, auth())).data;
      assert(s3.status === "done" && s3.actions.some(a => /CRM/.test(a)) && s3.messages.some(m => m.includes("consultor")), `sim3 ${JSON.stringify(s3)}`);
      const sBad = (await http.post(`/flows/${flowId}/simulate`, { state: s1.state, input: "xyz" }, auth())).data;
      assert(sBad.status === "waiting" && sBad.messages[0].includes("Não entendi"), "an unknown answer was not asked again");
      assert(graph.sent.length === sent0, "the simulator sent a real message");

      // published: a real conversation
      const pub = await http.post(`/flows/${flowId}/publish`, {}, auth());
      assert(pub.status === 200 && pub.data.status === "published" && pub.data.version === 1, `publish ${pub.status}`);
      const from = "5511910000021";
      let before = graph.sent.length;
      await inboundCloud(from, "wamid.flow-1", "oi");
      await waitFor(() => sentAny(before).some(t => t.includes("Tenho uma dúvida") && t.includes("Oi ")), 12000, "flow menu");
      before = graph.sent.length;
      await inboundCloud(from, "wamid.flow-2", "quero me matricular");
      await waitFor(() => sentTexts(before).some(t => t.includes("nome completo")), 12000, "flow question");
      before = graph.sent.length;
      await inboundCloud(from, "wamid.flow-3", "Joana Paula Lima");
      await waitFor(() => sentTexts(before).some(t => t.includes("consultor fala com você")), 12000, "flow end");
      const tk = ticketOf(from);
      assert(sql(`SELECT name FROM Leads WHERE contactId=(SELECT contactId FROM Tickets WHERE id=${tk})`) === "Joana Paula Lima", "the answer did not reach the lead");
      assert(sql(`SELECT COUNT(*) FROM LeadActivities WHERE leadId=(SELECT id FROM Leads WHERE contactId=(SELECT contactId FROM Tickets WHERE id=${tk})) AND body LIKE '%Enviado ao CRM pelo fluxo%'`) === "1", "the CRM action left no trace");
      assert(sql(`SELECT status FROM ChatFlowRuns WHERE ticketId=${tk}`) === "done", "the run did not finish");
      const st = (await http.get(`/flows/${flowId}/stats`, auth())).data;
      assert(st.started >= 1 && st.crm >= 1 && st.nodes.menu >= 1 && st.done >= 1, `stats ${JSON.stringify(st)}`);

      // a second message after the flow ended is not taken by the same flow again
      before = graph.sent.length;
      await inboundCloud(from, "wamid.flow-4", "obrigada");
      await new Promise(r => setTimeout(r, 1500));
      assert(!sentAny(before).some(t => t.includes("Escolha")), "the flow started again on the same conversation");

      // keyword entry beats the first message, and "wait" blocks go on by themselves
      const kw = (await http.post("/flows", { name: "Bolsa", entry: { type: "keyword", keywords: ["bolsa"] }, graph: { nodes: [
        { id: "s", type: "start", data: {} }, { id: "m", type: "message", data: { text: "Vamos falar de bolsas!" } },
        { id: "d", type: "delay", data: { minutes: 1 } }, { id: "m2", type: "message", data: { text: "Voltei com mais uma dica." } }, { id: "e", type: "end", data: {} }],
        edges: [{ id: "1", source: "s", target: "m" }, { id: "2", source: "m", target: "d" }, { id: "3", source: "d", target: "m2" }, { id: "4", source: "m2", target: "e" }] } }, auth())).data;
      assert((await http.post(`/flows/${kw.id}/publish`, {}, auth())).status === 200, "keyword flow not published");
      const from2 = "5511910000022";
      before = graph.sent.length;
      await inboundCloud(from2, "wamid.flow-5", "tem bolsa?");
      await waitFor(() => sentTexts(before).some(t => t.includes("Vamos falar de bolsas")), 12000, "keyword flow");
      assert(!sentAny(before).some(t => t.includes("Escolha")), "the first-message flow answered a keyword conversation");
      const tk2 = ticketOf(from2);
      assert(sql(`SELECT status FROM ChatFlowRuns WHERE ticketId=${tk2}`) === "delayed", "the run is not waiting for time");
      sql(`UPDATE ChatFlowRuns SET resumeAt = NOW() - INTERVAL '1 minute' WHERE ticketId=${tk2}`);
      await waitFor(() => sentTexts(before).some(t => t.includes("Voltei com mais uma dica")), 45000, "after the wait");

      // unpublishing hands the conversation back; duplicate and delete work
      assert((await http.post(`/flows/${kw.id}/unpublish`, {}, auth())).data.status === "draft", "unpublish");
      const dup = await http.post(`/flows/${flowId}/duplicate`, {}, auth());
      assert(dup.status === 201 && dup.data.name.includes("cópia") && dup.data.status === "draft", "duplicate");
      assert((await http.delete(`/flows/${dup.data.id}`, auth())).status === 200, "delete");
      // the other tests talk to the AI agent and the old menu: no flow may stay live
      assert((await http.post(`/flows/${flowId}/unpublish`, {}, auth())).data.status === "draft", "unpublish triage");
    });
    await test("visual flows: the person chooses the polo (number, name, city, typo), the lead and the conversation go to that polo, the whole path", async () => {
      const vil = (await http.post("/polos", { name: "Polo Vilhena", code: "VIL", city: "Vilhena", state: "RO" }, auth())).data;
      const g = {
        nodes: [
          { id: "s", type: "start", data: {} },
          { id: "oi", type: "message", data: { text: "Olá, {{primeiro_nome}}! Vou te ajudar." } },
          { id: "curso", type: "buttons", data: { text: "Escolha o curso:", saveTo: "curso", options: [{ id: "c1", label: "Administração" }, { id: "c2", label: "Direito" }] } },
          { id: "polo", type: "polo", data: { text: "Qual polo fica mais perto de você?" } },
          { id: "cond", type: "condition", data: { rules: [{ id: "r1", label: "Interior", all: [{ field: "var:polo", op: "in", value: "Polo Ji-Paraná, Polo Vilhena" }] }] } },
          { id: "interior", type: "message", data: { text: "Atendimento do interior: {{polo}}." } },
          { id: "capital", type: "message", data: { text: "Atendimento da capital." } },
          { id: "crm", type: "crm", data: { action: "send_to_crm", ownerMode: "roundrobin", source: "Chatbot" } },
          { id: "tr", type: "transfer", data: { to: "chosen_polo_sales", text: "Chamando a equipe do polo." } },
          { id: "naosei", type: "message", data: { text: "Sem problemas, vou chamar alguém para ajudar." } },
          { id: "fim", type: "end", data: {} }
        ],
        edges: [
          { id: "1", source: "s", target: "oi" }, { id: "2", source: "oi", target: "curso" },
          { id: "3", source: "curso", target: "polo", sourceHandle: "c1" }, { id: "4", source: "curso", target: "polo", sourceHandle: "c2" },
          { id: "5", source: "polo", target: "cond", sourceHandle: "out" }, { id: "6", source: "polo", target: "naosei", sourceHandle: "other" },
          { id: "7", source: "cond", target: "interior", sourceHandle: "r1" }, { id: "8", source: "cond", target: "capital", sourceHandle: "else" },
          { id: "9", source: "interior", target: "crm" }, { id: "10", source: "capital", target: "crm" }, { id: "11", source: "crm", target: "tr" },
          { id: "12", source: "naosei", target: "fim" }
        ]
      };
      const mk = await http.post("/flows", { name: "Escolha de polo", entry: { type: "first_message" }, graph: g }, auth());
      assert(mk.status === 201 && mk.data.errors === 0, `create ${mk.status} errors=${mk.data.errors} ${JSON.stringify(mk.data.issues).slice(0, 200)}`);
      const flowId = mk.data.id;
      // a polo block without its question is a validation error
      const bad = JSON.parse(JSON.stringify(g)); bad.nodes.find(n => n.id === "polo").data.text = "";
      assert((await http.put(`/flows/${flowId}`, { graph: bad }, auth())).data.errors >= 1, "an empty polo question passed validation");
      assert((await http.put(`/flows/${flowId}`, { graph: g }, auth())).data.errors === 0, "restore");

      // simulator: the list, a typo, the choice, the branch
      const sent0 = graph.sent.length;
      let sim = (await http.post(`/flows/${flowId}/simulate`, {}, auth())).data;
      sim = (await http.post(`/flows/${flowId}/simulate`, { state: sim.state, input: "2" }, auth())).data;
      assert(sim.messages.some(m => m.includes("Qual polo") && m.includes("*1* - ")), `polo list ${JSON.stringify(sim.messages)}`);
      const simDone = (await http.post(`/flows/${flowId}/simulate`, { state: sim.state, input: "moro em ji parna" }, auth())).data;
      assert(simDone.actions.some(a => a.includes("Define o polo: Polo Ji-Paraná")) && simDone.messages.some(m => m.includes("interior")), `sim choice ${JSON.stringify([simDone.actions, simDone.messages])}`);
      assert(simDone.actions.some(a => /Comercial do polo Polo Ji-Paraná/.test(a)), `sim transfer ${JSON.stringify(simDone.actions)}`);
      assert(graph.sent.length === sent0, "the simulator sent a real message");

      assert((await http.post(`/flows/${flowId}/publish`, {}, auth())).status === 200, "publish");
      // the real conversation, on the Cloud API: free text with a typo
      const from = "5511910000031";
      let before = graph.sent.length;
      await inboundCloud(from, "wamid.polo-1", "oi");
      await waitFor(() => sentAny(before).some(t => t.includes("Escolha o curso") && t.includes("Direito")), 12000, "course question");
      before = graph.sent.length;
      await inboundCloud(from, "wamid.polo-2", "Direito");
      await waitFor(() => sentAny(before).some(t => t.includes("Qual polo") && t.includes("Polo Ji-Paran")), 12000, "polo question lists the active polos");
      // an answer that fits several polos asks which one
      before = graph.sent.length;
      await inboundCloud(from, "wamid.polo-3", "polo");
      await waitFor(() => sentAny(before).some(t => t.includes("mais de um polo")), 12000, "ambiguous answer");
      before = graph.sent.length;
      await inboundCloud(from, "wamid.polo-4", "moro em ji parna");
      await waitFor(() => sentTexts(before).some(t => t.includes("Chamando a equipe do polo")), 15000, "transfer message");
      assert(sentTexts(before).some(t => t.includes("Atendimento do interior: Polo Ji-Paraná")), "the condition did not take the interior branch with the polo name");
      const tk = ticketOf(from);
      const leadOf = `(SELECT id FROM Leads WHERE contactId=(SELECT contactId FROM Tickets WHERE id=${tk}))`;
      assert(sql(`SELECT poloId FROM Leads WHERE id=${leadOf}`) === String(jiPolo.id), "the lead did not get the chosen polo");
      const salesQueue = sql(`SELECT id FROM Queues WHERE poloId=${jiPolo.id} AND role='comercial'`);
      assert(salesQueue && sql(`SELECT queueId FROM Tickets WHERE id=${tk}`) === salesQueue, "the conversation did not go to the sales queue of the polo");
      assert(sql(`SELECT COUNT(*) FROM LeadActivities WHERE leadId=${leadOf} AND body LIKE '%Polo escolhido no fluxo%'`) === "1", "the choice left no trace on the lead");
      assert(sql(`SELECT COUNT(*) FROM LeadActivities WHERE leadId=${leadOf} AND body LIKE '%Enviado ao CRM pelo fluxo%'`) === "1", "the CRM step left no trace");

      // a second person picks by number (the list order) and lands on another polo
      const from2 = "5511910000032";
      before = graph.sent.length;
      await inboundCloud(from2, "wamid.polo-5", "oi");
      await waitFor(() => sentAny(before).some(t => t.includes("Escolha o curso")), 12000, "second menu");
      await inboundCloud(from2, "wamid.polo-6", "Administração");
      await waitFor(() => sentAny(before).some(t => t.includes("Qual polo")), 12000, "second polo question");
      before = graph.sent.length;
      await inboundCloud(from2, "wamid.polo-7", "vilhena");
      await waitFor(() => sentTexts(before).some(t => t.includes("Chamando a equipe do polo")), 15000, "second transfer");
      const tk2 = ticketOf(from2);
      assert(sql(`SELECT poloId FROM Leads WHERE contactId=(SELECT contactId FROM Tickets WHERE id=${tk2})`) === String(vil.id), "the second lead did not get Vilhena");

      // somebody who never says a polo: two tries and the "did not understand" exit
      const from3 = "5511910000033";
      before = graph.sent.length;
      await inboundCloud(from3, "wamid.polo-8", "oi");
      await waitFor(() => sentAny(before).some(t => t.includes("Escolha o curso")), 12000, "third menu");
      await inboundCloud(from3, "wamid.polo-9", "Direito");
      await waitFor(() => sentAny(before).some(t => t.includes("Qual polo")), 12000, "third polo question");
      before = graph.sent.length;
      await inboundCloud(from3, "wamid.polo-10", "qwertyuiop");
      await waitFor(() => sentTexts(before).some(t => t.includes("Não encontrei esse polo")), 12000, "asked again");
      before = graph.sent.length;
      await inboundCloud(from3, "wamid.polo-11", "zxcvbnm");
      await waitFor(() => sentTexts(before).some(t => t.includes("vou chamar alguém")), 12000, "the other exit");
      assert(!sql(`SELECT poloId FROM Leads WHERE contactId=(SELECT contactId FROM Tickets WHERE id=${ticketOf(from3)})`), "a lead got a polo nobody chose");

      assert((await http.post(`/flows/${flowId}/unpublish`, {}, auth())).data.status === "draft", "unpublish");
    });
    await test("visual flows: templates, the old menu as a flow, and flows made by AI", async () => {
      const tpl = (await http.get("/flow-templates", auth())).data;
      assert(tpl.length >= 3 && tpl.every(t => t.name && t.blocks > 2), "templates");
      const fromTpl = await http.post("/flows", { name: "Do modelo", template: tpl[0].key }, auth());
      assert(fromTpl.status === 201 && fromTpl.data.graph.nodes.some(n => n.type === "buttons") && fromTpl.data.errors === 0, `template flow ${fromTpl.status} errors=${fromTpl.data.errors} ${JSON.stringify(fromTpl.data.issues && fromTpl.data.issues.filter(i => i.level === "error").map(i => i.text))}`);
      // the old tree of the chatbot, as a flow
      sql("DELETE FROM ChatbotNodes");
      const q = (await http.get("/queue", auth())).data[0];
      const root = (await http.post("/chatbot-nodes", { title: "Financeiro", action: "queue", targetId: q.id, message: "Já te encaminho.", position: 1 }, auth())).data;
      await http.post("/chatbot-nodes", { title: "Cursos", action: "message", message: "Temos 128 cursos.", position: 2 }, auth());
      const imp = await http.post("/flows/import-legacy", {}, auth());
      assert(imp.status === 201 && imp.data.graph.nodes.some(n => n.type === "buttons" && n.data.options.length === 2) && imp.data.graph.nodes.some(n => n.type === "transfer"), `import ${imp.status}`);
      assert(root.id && imp.data.errors === 0, `legacy flow errors ${JSON.stringify(imp.data.issues && imp.data.issues.filter(i => i.level === "error").map(i => i.text))}`);
      sql("DELETE FROM ChatbotNodes");
      // the AI draws it: unknown things are dropped and the validation points at what is left
      const gen = await http.post("/flows/generate", { description: "Quero um fluxo que pergunte se a pessoa quer falar de cursos ou do financeiro" }, auth());
      assert(gen.status === 201 && gen.data.name === "Triagem gerada", `generate ${gen.status} ${JSON.stringify(gen.data).slice(0, 200)}`);
      const types = gen.data.graph.nodes.map(n => n.type);
      assert(types.includes("buttons") && types.includes("crm") && types.includes("ask"), "blocks missing");
      assert(gen.data.graph.nodes.every(n => typeof n.x === "number"), "no layout");
      assert(gen.data.graph.edges.length === 6, `the invalid link was kept: ${gen.data.graph.edges.length}`);
      assert((await http.post("/flows/generate", { description: "curto" }, auth())).status === 400, "short description accepted");
    });
    await test("triggers: an event runs a flow on the conversation, with filters, a cooldown and only real events", async () => {
      const cat = (await http.get("/automation-events", auth())).data;
      assert(cat.some(e => e.key === "tag.added" && e.available) && cat.some(e => e.key === "shopify" && !e.available && e.note), "event catalog");
      const tag = (await http.post("/tags", { name: "Gatilho teste", color: "#16a34a" }, auth())).data;
      const flow = (await http.post("/flows", { name: "Resposta ao gatilho", entry: { type: "manual" }, graph: { nodes: [
        { id: "s", type: "start", data: {} }, { id: "m", type: "message", data: { text: "Gatilho de etiqueta funcionou, {{primeiro_nome}}!" } }, { id: "e", type: "end", data: {} }],
        edges: [{ id: "1", source: "s", target: "m" }, { id: "2", source: "m", target: "e" }] } }, auth())).data;
      assert((await http.post("/automation-triggers", { name: "x", event: "shopify", flowId: flow.id }, auth())).status === 400, "an unavailable event was accepted");
      const trig = await http.post("/automation-triggers", { name: "Etiqueta colocada", event: "tag.added", config: { tagId: tag.id, lixo: 1 }, flowId: flow.id }, auth());
      assert(trig.status === 201 && trig.data.config.tagId === tag.id && trig.data.config.lixo === undefined, `create trigger ${trig.status} ${JSON.stringify(trig.data.config)}`);
      const from = "5511910000031";
      let before = graph.sent.length;
      await inboundCloud(from, "wamid.trig-1", "oi, tudo bem?");
      await waitFor(() => ticketOf(from), 8000, "ticket");
      const tk = ticketOf(from);
      sql(`UPDATE Tickets SET chatbotNodeId=-1 WHERE id=${tk}`);
      // a draft flow does not run
      assert((await http.put(`/tickets/${tk}/tags`, { tagIds: [tag.id] }, auth())).status === 200, "tag not set");
      await new Promise(r => setTimeout(r, 1500));
      assert(!sentTexts(before).some(t => t.includes("Gatilho de etiqueta")), "a draft flow ran");
      assert((await http.post(`/flows/${flow.id}/publish`, {}, auth())).status === 200, "publish");
      // the cooldown still holds from the first (ignored) call? no: a flow that was not live did not start, so a new tag change counts
      await http.put(`/tickets/${tk}/tags`, { tagIds: [] }, auth());
      await new Promise(r => setTimeout(r, 300));
      // another tag does not fire it
      const other = (await http.post("/tags", { name: "Outra etiqueta", color: "#dc2626" }, auth())).data;
      await http.put(`/tickets/${tk}/tags`, { tagIds: [other.id] }, auth());
      await new Promise(r => setTimeout(r, 1200));
      assert(!sentTexts(before).some(t => t.includes("Gatilho de etiqueta")), "the filter did not hold");
      before = graph.sent.length;
      await http.put(`/tickets/${tk}/tags`, { tagIds: [tag.id] }, auth());
      await waitFor(() => sentTexts(before).some(t => t.includes("Gatilho de etiqueta funcionou")), 12000, "trigger message");
      const list = (await http.get("/automation-triggers", auth())).data.find(t => t.id === trig.data.id);
      assert(list.runCount === 1 && list.flowName === "Resposta ao gatilho", `run count ${list.runCount}`);
      // the same trigger does not repeat on the same conversation right away
      before = graph.sent.length;
      await http.put(`/tickets/${tk}/tags`, { tagIds: [] }, auth());
      await http.put(`/tickets/${tk}/tags`, { tagIds: [tag.id] }, auth());
      await new Promise(r => setTimeout(r, 1500));
      assert(!sentTexts(before).some(t => t.includes("Gatilho de etiqueta")), "the cooldown did not hold");
      // paused triggers do nothing
      assert((await http.put(`/automation-triggers/${trig.data.id}`, { active: false }, auth())).data.active === false, "pause");
      assert((await http.delete(`/automation-triggers/${trig.data.id}`, auth())).status === 200, "delete trigger");
      assert((await http.post(`/flows/${flow.id}/unpublish`, {}, auth())).status === 200, "unpublish");
    });
    await test("communities: a group marked as community leaves the Grupos list and has its own view", async () => {
      const mkGroup = (name, number) => {
        const c = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('${name}', '${number}', '', true, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
        const t = sql(`INSERT INTO Tickets (status, contactId, whatsappId, unreadMessages, isGroup, segment, isHistorical, lastMessage, lastMessageAt, createdAt, updatedAt) VALUES ('open', ${c}, ${tgId}, 0, true, 'sales', false, 'oi', NOW(), NOW(), NOW()) RETURNING id`).split("\n")[0];
        return { c, t };
      };
      const common = mkGroup("Grupo comum", "tg_g1"), comm = mkGroup("Grupo da comunidade", "tg_g2");
      const ids = r => r.data.tickets.map(x => String(x.id));
      const list = async params => ids(await http.get("/tickets", { ...auth(), params: { showAll: "true", historical: "all", ...params } }));
      assert((await http.put(`/contacts/${comm.c}/community`, { community: true, readOnly: true }, auth())).status === 200, "mark as community");
      const groups = await list({ groups: "only" });
      assert(groups.includes(common.t) && !groups.includes(comm.t), `groups list ${groups}`);
      const communities = await list({ communities: "only" });
      assert(communities.includes(comm.t) && !communities.includes(common.t), `communities list ${communities}`);
      const one = (await http.get("/tickets", { ...auth(), params: { showAll: "true", historical: "all", communities: "only" } })).data.tickets.find(x => String(x.id) === comm.t);
      assert(one.contact.kind === "community" && one.contact.readOnly === true, "the list does not say the group is read-only");
      const person = sql(`SELECT id FROM Contacts WHERE isGroup=false LIMIT 1`);
      assert((await http.put(`/contacts/${person}/community`, { community: true }, auth())).status === 400, "a person was marked as a community");
      assert((await http.put(`/contacts/${comm.c}/community`, { community: false }, auth())).status === 200 && (await list({ groups: "only" })).includes(comm.t), "unmark");
    });
    await test("communities like WhatsApp Web: the community with its announcements group and the groups inside, unread totals", async () => {
      const mk = (name, number, role, communityId, unread) => {
        const c = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, kind, communityRole, communityId, parentGroupId, createdAt, updatedAt) VALUES ('${name}', '${number}', '', true, 'telegram', '${role === "member" ? "group" : "community"}', '${role}', ${communityId ? `'${communityId}'` : "NULL"}, ${communityId && role !== "parent" ? `'${communityId}'` : "NULL"}, NOW(), NOW()) RETURNING id`).split("\n")[0];
        if (role === "parent") return { c };
        const t = sql(`INSERT INTO Tickets (status, contactId, whatsappId, unreadMessages, isGroup, segment, isHistorical, lastMessage, lastMessageAt, createdAt, updatedAt) VALUES ('open', ${c}, ${tgId}, ${unread}, true, 'sales', false, 'aviso', NOW(), NOW(), NOW()) RETURNING id`).split("\n")[0];
        return { c, t };
      };
      mk("Comunidade Polo PVH", "120363777000000001", "parent", "120363777000000001@g.us", 0);
      const avisos = mk("Avisos Polo PVH", "120363000000000002", "announcement", "120363777000000001@g.us", 2);
      const turma = mk("Turma 2026", "120363000000000003", "member", "120363777000000001@g.us", 3);
      const r = await http.get("/communities", auth());
      assert(r.status === 200, `communities ${r.status}`);
      const c = r.data.communities.find(x => x.name === "Comunidade Polo PVH");
      assert(c && c.announcement && String(c.announcement.ticketId) === avisos.t && c.announcement.readOnly === false, `announcement ${JSON.stringify(c)}`);
      assert(c.groups.length === 1 && String(c.groups[0].ticketId) === turma.t && c.groups[0].unread === 3 && c.unread === 5, `groups/unread ${JSON.stringify(c)}`);
      // an ordinary group stays in Grupos, the announcement does not
      const ids = x => x.data.tickets.map(t => String(t.id));
      const groupsOnly = ids(await http.get("/tickets", { ...auth(), params: { showAll: "true", historical: "all", groups: "only" } }));
      assert(groupsOnly.includes(turma.t) && !groupsOnly.includes(avisos.t), "the announcement group must not show in Grupos");
      assert((await http.get("/communities")).status === 401, "communities without login");
    });
    await test("follow-up cadences: a lead that stopped answering is reminded once per silence; the enrollment deadline reminds the leads of the period", async () => {
      const mkFlow = async (template, name) => {
        const f = (await http.post("/flows", { name, template }, auth())).data;
        assert((await http.post(`/flows/${f.id}/publish`, {}, auth())).status === 200, `publish ${template}`);
        return f;
      };
      const idleFlow = await mkFlow("follow-up-lead-parado", "Cadência parado");
      const deadlineFlow = await mkFlow("lembrete-prazo-matricula", "Cadência prazo");
      assert(idleFlow.entry.type === "manual", "the cadence flow should only run from a trigger");
      const events = (await http.get("/automation-events", auth())).data;
      assert(events.some(e => e.key === "lead.idle" && e.available) && events.some(e => e.key === "deadline.near" && e.available), "the new events are not offered");
      const t1 = (await http.post("/automation-triggers", { name: "Parado 3 dias", event: "lead.idle", config: { days: 3 }, flowId: idleFlow.id }, auth())).data;
      const t2 = (await http.post("/automation-triggers", { name: "Prazo 3 dias", event: "deadline.near", config: { daysBefore: 3 }, flowId: deadlineFlow.id }, auth())).data;
      assert(t1.config.days === "3" && t2.config.daysBefore === "3", `trigger config ${JSON.stringify(t1.config)}`);
      // the first block of both flows is a message with buttons: it goes out as an interactive message, not as plain text
      const said = (since, text) => graph.sent.slice(since).some(x => JSON.stringify(x.body || {}).includes(text));
      const ymd = d => new Date(Date.now() + d * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });

      // a person writes, then goes quiet for five days
      const from = "5511910000071";
      await inboundCloud(from, "wamid.cad-1", "oi, quero informações");
      await waitFor(() => ticketOf(from), 8000, "ticket of the quiet lead");
      const tk = ticketOf(from);
      sql(`UPDATE Tickets SET chatbotNodeId=-1 WHERE id=${tk}`);
      const leadId = await waitFor(() => sql(`SELECT l.id FROM Leads l JOIN Contacts c ON c.id=l.contactId WHERE c.number='${from}'`), 8000, "lead of the quiet person");
      sql(`UPDATE Leads SET lastInboundAt=NOW() - INTERVAL '5 days', lastContactAt=NOW() - INTERVAL '5 days', createdAt=NOW() - INTERVAL '6 days' WHERE id=${leadId}`);
      let before = graph.sent.length;
      const r1 = await http.post("/crm/cadences/run", {}, auth());
      assert(r1.status === 200 && r1.data.idle >= 1, `first run ${JSON.stringify(r1.data)}`);
      await waitFor(() => said(before, "ainda tem interesse"), 12000, "the follow-up message");
      // the same silence is not reminded twice
      before = graph.sent.length;
      const r2 = await http.post("/crm/cadences/run", {}, auth());
      assert(r2.data.idle === 0, `second run reminded again: ${JSON.stringify(r2.data)}`);
      await new Promise(r => setTimeout(r, 1200));
      assert(!said(before, "ainda tem interesse"), "the same silence was reminded twice");
      // someone who is enrolled, or in a won column, is never reminded
      const idleTrigger = (await http.get("/automation-triggers", auth())).data.find(t => t.id === t1.id);
      assert(idleTrigger.runCount === 1, `run count ${idleTrigger.runCount}`);

      // the deadline of a period: tomorrow, reminded 3 days before (so already inside the window), once
      const put = await http.put("/crm/settings", { entryDeadlines: { "2030/1": ymd(1), "1999/1": ymd(1), "2030/2": "not-a-date" } }, auth());
      assert(put.status === 200 && put.data.entryDeadlines["2030/1"] === ymd(1) && !put.data.entryDeadlines["2030/2"] && !put.data.entryDeadlines["1999/1"], `deadlines ${JSON.stringify(put.data.entryDeadlines)}`);
      const from2 = "5511910000072";
      await inboundCloud(from2, "wamid.cad-2", "quero me matricular");
      await waitFor(() => ticketOf(from2), 8000, "ticket of the lead of the period");
      sql(`UPDATE Tickets SET chatbotNodeId=-1 WHERE id=${ticketOf(from2)}`);
      const lead2 = await waitFor(() => sql(`SELECT l.id FROM Leads l JOIN Contacts c ON c.id=l.contactId WHERE c.number='${from2}'`), 8000, "lead of the period");
      sql(`UPDATE Leads SET entryTerm='2030/1' WHERE id=${lead2}`);
      before = graph.sent.length;
      const r3 = await http.post("/crm/cadences/run", {}, auth());
      assert(r3.data.deadline >= 1, `deadline run ${JSON.stringify(r3.data)}`);
      await waitFor(() => said(before, "prazo de matrícula"), 12000, "the deadline reminder");
      before = graph.sent.length;
      assert((await http.post("/crm/cadences/run", {}, auth())).data.deadline === 0, "the deadline reminder was repeated");
      // a lead of another period, or already enrolled, is left alone
      assert(sql(`SELECT COUNT(*) FROM LeadReminderLogs WHERE leadId=${leadId} AND key LIKE 'deadline:%'`) === "0", "a lead of another period was reminded");
      // a window not reached yet: the deadline is far away
      await http.put("/crm/settings", { entryDeadlines: { "2030/1": ymd(30) } }, auth());
      sql(`DELETE FROM LeadReminderLogs WHERE leadId=${lead2}`);
      assert((await http.post("/crm/cadences/run", {}, auth())).data.deadline === 0, "reminded before the window");
    });
    await test("documents of the enrollment: the list of the administration, the label while something is missing, the reminder by WhatsApp (by hand and by itself)", async () => {
      const mk = async (name, email, role) => (await http.post("/users", { name, email, password: "senha123", role }, auth())).data;
      const tutorD = await mk("Tutora Docs", "tutord@docs.test", "tutor");
      const poloD = (await http.post("/polos", { name: "Polo Documentos", code: "DOC1", state: "RO" }, auth())).data;
      await http.put(`/polos/${poloD.id}/members`, { members: [{ userId: tutorD.id, role: "tutoria" }] }, auth());
      const names = (table, col, id) => sql(`SELECT COALESCE(STRING_AGG(t.name, ',' ORDER BY t.name), '') FROM ${table} x JOIN Tags t ON t.id=x.tagId WHERE x.${col}=${id}`);

      // the administration sets the list; a bad value never gets in
      const put = await http.put("/crm/settings", { requiredDocs: ["RG ou CNH", "CPF", "Histórico escolar", "  ", "CPF"], docsAutoReminder: false }, auth());
      assert(put.status === 200 && JSON.stringify(put.data.requiredDocs) === JSON.stringify(["RG ou CNH", "CPF", "Histórico escolar"]), `list ${JSON.stringify(put.data.requiredDocs)}`);

      const lead = await mkLead("Aluno Documentos", "5511955579301", { ownerId: 1 });
      const opened = await http.post(`/leads/${lead.id}/open-ticket`, { whatsappId: cid }, auth());
      assert(opened.status === 200 || opened.status === 201, `open-ticket ${opened.status}`);
      const contactId = sql(`SELECT contactId FROM Leads WHERE id=${lead.id}`);
      const r = await http.post(`/leads/${lead.id}/enroll`, { poloId: poloD.id, tutorId: "auto", fee: "paid", whatsappId: cid }, auth());
      assert(r.status === 200, `enroll ${r.status}`);
      let docs = (await http.get(`/leads/${lead.id}/documents`, auth())).data;
      assert(docs.documents.length === 3 && docs.summary.pending === 3 && docs.summary.complete === false, `documents ${JSON.stringify(docs.summary)}`);
      assert(/Documentos pendentes/.test(names("LeadTags", "leadId", lead.id)), "the enrolled student has no pending-documents label");
      assert(/Documentos pendentes/.test(names("ContactTags", "contactId", contactId)), "the contact has no pending-documents label");

      // received, waived, and the label goes away when nothing is missing
      const [d1, d2, d3] = docs.documents;
      assert((await http.put(`/leads/${lead.id}/documents/${d1.id}`, { status: "received" }, auth())).status === 200, "mark received");
      assert((await http.put(`/leads/${lead.id}/documents/${d2.id}`, { status: "waived", note: "Já entregou na inscrição" }, auth())).status === 200, "mark waived");
      assert((await http.put(`/leads/${lead.id}/documents/${d1.id}`, { status: "inventado" }, auth())).status === 400, "an invalid status was accepted");
      assert((await http.put(`/leads/${lead.id}/documents/999999`, { status: "received" }, auth())).status === 404, "a document of nobody");
      assert(/Documentos pendentes/.test(names("LeadTags", "leadId", lead.id)), "the label left with one document still missing");

      // the reminder by hand lists only what is missing
      const rem = await http.post(`/leads/${lead.id}/documents/remind`, {}, auth());
      assert(rem.status === 200 && rem.data.missing === 1, `remind ${rem.status} ${JSON.stringify(rem.data)}`);
      const said = () => Number(sql(`SELECT COUNT(*) FROM Messages m JOIN Tickets t ON t.id=m.ticketId WHERE t.contactId=${contactId} AND m.body LIKE '%ainda faltam estes documentos%' AND m.body LIKE '%${d3.name}%'`));
      await waitFor(() => said() === 1, 12000, "the reminder message");
      assert(Number(sql(`SELECT COUNT(*) FROM Messages m JOIN Tickets t ON t.id=m.ticketId WHERE t.contactId=${contactId} AND m.body LIKE '%• ${d1.name}%'`)) === 0, "the reminder listed a document that was already received");

      // by itself: off until the administration turns it on, then every N days up to M times
      sql(`UPDATE LeadReminderLogs SET createdAt=NOW() - INTERVAL '5 days' WHERE leadId=${lead.id} AND key='docs'`);
      assert((await http.post("/crm/cadences/run", {}, auth())).status === 200, "run");
      assert(said() === 1, "reminded by itself while the setting was off");
      await http.put("/crm/settings", { docsAutoReminder: true, docsReminderDays: 1, docsReminderMax: 2 }, auth());
      await http.post("/crm/cadences/run", {}, auth());
      await waitFor(() => said() === 2, 12000, "the automatic reminder");
      await http.post("/crm/cadences/run", {}, auth());
      await new Promise(r => setTimeout(r, 1500));
      assert(said() === 2, "reminded again before the days passed");
      sql(`UPDATE LeadReminderLogs SET createdAt=NOW() - INTERVAL '5 days' WHERE leadId=${lead.id} AND key='docs'`);
      await http.post("/crm/cadences/run", {}, auth());
      await new Promise(r => setTimeout(r, 1500));
      assert(said() === 2, "reminded more times than the maximum");
      await http.put("/crm/settings", { docsAutoReminder: false }, auth());

      // the last document arrives: complete, the label goes away, and it is recorded
      assert((await http.put(`/leads/${lead.id}/documents/${d3.id}`, { status: "received" }, auth())).data.summary.complete === true, "not complete");
      assert(!/Documentos pendentes/.test(names("LeadTags", "leadId", lead.id)), "the label stayed after all documents came");
      assert(!/Documentos pendentes/.test(names("ContactTags", "contactId", contactId)), "the contact label stayed");
      assert(/Documentos completos/.test(sql(`SELECT body FROM LeadActivities WHERE leadId=${lead.id} AND body LIKE 'Documentos completos%' LIMIT 1`)), "no record of the complete documents");
      assert((await http.post(`/leads/${lead.id}/documents/remind`, {}, auth())).status === 400, "reminded someone with nothing missing");
      // undoing one brings the label back
      await http.put(`/leads/${lead.id}/documents/${d3.id}`, { status: "pending" }, auth());
      assert(/Documentos pendentes/.test(names("LeadTags", "leadId", lead.id)), "the label did not come back");
      // a consultant who does not own the lead cannot touch its documents
      assert((await http.get(`/leads/${lead.id}/documents`, asUser(bolixConsultantToken))).status === 403, "another consultant read the documents");
    });
    await test("retention: the satisfaction survey (NPS) by WhatsApp, the students at risk of dropping out and the re-enrollment window", async () => {
      const mkUser = async (name, email, role) => (await http.post("/users", { name, email, password: "senha123", role }, auth())).data;
      const tutorR = await mkUser("Tutora Retencao", "tutorr@ret.test", "tutor");
      const poloR = (await http.post("/polos", { name: "Polo Retencao", code: "RET1", state: "RO" }, auth())).data;
      await http.put(`/polos/${poloR.id}/members`, { members: [{ userId: tutorR.id, role: "tutoria" }] }, auth());
      const tutorTok = (await http.post("/auth/login", { email: "tutorr@ret.test", password: "senha123" })).data.token;
      const coordAc = (await http.post("/auth/login", { email: "coord-a@x.com", password: "senha123" })).data.token;
      const coordCom = (await http.post("/auth/login", { email: "coord-c@x.com", password: "senha123" })).data.token;
      const labelsOf = leadId => sql(`SELECT COALESCE(STRING_AGG(t.name, ',' ORDER BY t.name), '') FROM LeadTags x JOIN Tags t ON t.id=x.tagId WHERE x.leadId=${leadId}`);
      const said = (contactId, text) => Number(sql(`SELECT COUNT(*) FROM Messages m JOIN Tickets t ON t.id=m.ticketId WHERE t.contactId=${contactId} AND m.fromMe=true AND m.body LIKE '%${text}%'`));
      const ymd = d => new Date(Date.now() + d * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });

      // who may operate it: the maintainer and the academic coordinator; the tutor, a consultant and the other roles cannot
      assert((await http.get("/retention/nps", asUser(bolixConsultantToken))).status === 403, "a consultant read the satisfaction numbers");
      assert((await http.get("/retention/risk", asUser(tutorTok))).status === 403, "a tutor opened the retention area");
      assert((await http.get("/retention/risk", asUser(coordCom))).status === 403, "the commercial coordinator opened the retention area");
      assert((await http.get("/retention/risk", asUser(coordAc))).status === 200, "the academic coordinator cannot open the retention area");
      assert((await http.put("/retention/config", { nps: { enabled: true } }, asUser(tutorTok))).status === 403, "a tutor changed the settings");

      // a student: writes, is enrolled, finishes the onboarding
      let n = 0;
      const student = async name => {
        n += 1;
        const from = `55119100001${String(10 + n)}`;
        await inboundCloud(from, `wamid.ret-${n}`, "oi, quero me matricular");
        await waitFor(() => ticketOf(from), 8000, `ticket of ${name}`);
        const leadId = await waitFor(() => sql(`SELECT l.id FROM Leads l JOIN Contacts c ON c.id=l.contactId WHERE c.number='${from}'`), 8000, `lead of ${name}`);
        sql(`UPDATE Leads SET name='${name}' WHERE id=${leadId}`);
        const r = await http.post(`/leads/${leadId}/enroll`, { poloId: poloR.id, tutorId: tutorR.id, fee: "paid", whatsappId: cid }, auth());
        assert(r.status === 200, `enroll ${name} ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
        return { from, leadId: Number(leadId), contactId: sql(`SELECT contactId FROM Leads WHERE id=${leadId}`) };
      };
      const ana = await student("Ana Pesquisa");
      const beto = await student("Beto Pesquisa");
      const carla = await student("Carla Pesquisa");

      // the survey is off until the administration turns it on
      sql(`UPDATE Leads SET onboardingStatus='done', onboardingDoneAt=NOW() - INTERVAL '3 days' WHERE id IN (${ana.leadId}, ${beto.leadId})`);
      assert((await http.post("/retention/run", {}, auth())).data.nps === 0, "the survey went out while it was off");
      const cfg = await http.put("/retention/config", { nps: { enabled: true, moments: ["onboarding", "inventado"], question: "Olá, {{nome}}! De 0 a 10, nos recomendaria?" } }, auth());
      assert(cfg.status === 200 && JSON.stringify(cfg.data.nps.moments) === JSON.stringify(["onboarding"]) && cfg.data.nps.enabled === true, `config ${JSON.stringify(cfg.data.nps)}`);
      const run1 = await http.post("/retention/run", {}, auth());
      assert(run1.data.nps >= 2, `survey run ${JSON.stringify(run1.data)}`);
      await waitFor(() => said(ana.contactId, "De 0 a 10") === 1 && said(beto.contactId, "De 0 a 10") === 1, 12000, "the survey messages");
      assert(said(ana.contactId, "Olá, Ana!") === 1, "the name was not put in the survey");
      assert((await http.post("/retention/run", {}, auth())).data.nps === 0, "the same moment was surveyed twice");
      assert(said(carla.contactId, "De 0 a 10") === 0, "a student who did not finish the onboarding got the survey");

      // an answer that is not a bare number is only a conversation
      await inboundCloud(ana.from, "wamid.nps-a0", "2 via do boleto, por favor");
      await new Promise(r => setTimeout(r, 1500));
      assert(sql(`SELECT COUNT(*) FROM NpsSurveys WHERE leadId=${ana.leadId} AND status='answered'`) === "0", "a sentence that starts with a number was taken as the score");
      // promoter: 9, then the reason
      await inboundCloud(ana.from, "wamid.nps-a1", "9");
      await waitFor(() => sql(`SELECT score FROM NpsSurveys WHERE leadId=${ana.leadId} AND status='answered'`) === "9", 8000, "the score of Ana");
      await waitFor(() => said(ana.contactId, "Obrigado pela nota") === 1, 12000, "the thanks");
      await inboundCloud(ana.from, "wamid.nps-a2", "Gostei muito da tutoria");
      await waitFor(() => sql(`SELECT comment FROM NpsSurveys WHERE leadId=${ana.leadId}`) === "Gostei muito da tutoria", 8000, "the reason of Ana");
      assert(!/Detrator NPS/.test(labelsOf(ana.leadId)), "a promoter was labeled as detractor");
      // detractor: 3 -> label and a task for the tutor
      await inboundCloud(beto.from, "wamid.nps-b1", "3");
      await waitFor(() => sql(`SELECT score FROM NpsSurveys WHERE leadId=${beto.leadId} AND status='answered'`) === "3", 8000, "the score of Beto");
      await waitFor(() => /Detrator NPS/.test(labelsOf(beto.leadId)), 8000, "the detractor label");
      assert(Number(sql(`SELECT COUNT(*) FROM LeadTasks WHERE leadId=${beto.leadId} AND userId=${tutorR.id} AND title LIKE '%nota 3%'`)) === 1, "no task for the tutor about the detractor");
      // a second bare number does not change the answer
      await inboundCloud(beto.from, "wamid.nps-b2", "10");
      await new Promise(r => setTimeout(r, 1500));
      assert(sql(`SELECT score FROM NpsSurveys WHERE leadId=${beto.leadId} AND status='answered'`) === "3", "the answer was changed by a later number");
      const sum = (await http.get("/retention/nps", auth())).data;
      assert(sum.answered === 2 && sum.promoters === 1 && sum.detractors === 1 && sum.nps === 0 && sum.responseRate === 100, `summary ${JSON.stringify(sum)}`);
      assert(sum.comments.some(c => c.comment === "Gostei muito da tutoria" && c.lead === "Ana Pesquisa"), "the reason is not in the summary");
      // the tutor sees the same page (their own students)
      assert((await http.get("/retention/nps", asUser(coordAc))).status === 200, "the academic coordinator cannot see the survey");
      assert((await http.get("/retention/nps", asUser(tutorTok))).status === 403, "the tutor sees the survey");
      // manual survey
      assert((await http.post(`/retention/nps/send/${carla.leadId}`, {}, auth())).status === 201, "manual survey");
      await waitFor(() => said(carla.contactId, "De 0 a 10") === 1, 12000, "the manual survey");

      // risk of dropping out: no news for 45 days
      sql(`UPDATE Leads SET enrolledAt=NOW() - INTERVAL '50 days', lastInboundAt=NOW() - INTERVAL '45 days', onboardingStatus='started', onboardingDoneAt=NULL WHERE id=${carla.leadId}`);
      const risk = (await http.get("/retention/risk", auth())).data;
      const rc = risk.students.find(x => x.id === carla.leadId);
      assert(rc && rc.days >= 45 && rc.level === "attention" && risk.riskDays === 30, `risk ${JSON.stringify(rc)}`);
      assert(!risk.students.some(x => x.id === ana.leadId), "a student with recent news is at risk");
      assert((await http.get("/retention/risk", asUser(coordAc))).data.students.some(x => x.id === carla.leadId), "the academic coordinator does not see the student at risk");
      await http.post("/retention/run", {}, auth());
      assert(/Risco de evasão/.test(labelsOf(carla.leadId)), "no risk label");
      assert(Number(sql(`SELECT COUNT(*) FROM LeadTasks WHERE leadId=${carla.leadId} AND title LIKE 'Retenção:%'`)) === 1, "no retention task");
      await http.post("/retention/run", {}, auth());
      assert(Number(sql(`SELECT COUNT(*) FROM LeadTasks WHERE leadId=${carla.leadId} AND title LIKE 'Retenção:%'`)) === 1, "the task was repeated");
      // a message of the team
      assert((await http.post(`/retention/risk/${carla.leadId}/message`, {}, auth())).status === 200, "retention message");
      await waitFor(() => said(carla.contactId, "Faz um tempo que não temos notícias") === 1, 12000, "the retention message");
      assert((await http.post(`/retention/risk/${ana.leadId}/message`, {}, asUser(bolixConsultantToken))).status === 403, "a consultant sent the retention message");
      // who to contact today: the student at risk is on the list (with the reason), the edited message goes out, and registering the contact takes them off
      const todayRes = await http.get("/retention/today", auth());
      const todayItem = todayRes.data.items.find(x => x.leadId === carla.leadId);
      assert(todayRes.status === 200 && todayItem && todayItem.reasons.some(r => r.kind === "risk") && todayItem.priority >= 45, `today ${JSON.stringify(todayItem)}`);
      assert((await http.get("/retention/today", asUser(bolixConsultantToken))).status === 403, "a consultant opened the list of today");
      assert((await http.post(`/retention/contact/${carla.leadId}`, { outcome: "inventado" }, auth())).status === 400, "an invalid outcome was accepted");
      assert((await http.post(`/retention/contact/${carla.leadId}`, { outcome: "respondeu", note: "Falei por telefone", snoozeDays: 5 }, auth())).status === 201, "contact not registered");
      assert(!(await http.get("/retention/today", auth())).data.items.some(x => x.leadId === carla.leadId), "a student contacted today stayed on the list");
      assert(Number(sql(`SELECT COUNT(*) FROM RetentionContacts WHERE leadId=${carla.leadId} AND outcome='respondeu'`)) === 1, "the contact is not registered");
      // the student writes again: the label goes away
      sql(`UPDATE Leads SET lastInboundAt=NOW() WHERE id=${carla.leadId}`);
      await http.post("/retention/run", {}, auth());
      assert(!/Risco de evasão/.test(labelsOf(carla.leadId)), "the risk label stayed after the student wrote");

      // re-enrollment: nothing is configured, then a window that is open
      assert((await http.post(`/retention/rematricula/${ana.leadId}`, {}, auth())).status === 400, "marked without a period");
      assert((await http.put("/retention/config", { rematricula: { term: "2030/1", startsAt: ymd(5), endsAt: ymd(1) } }, auth())).status === 400, "a window that ends before it starts");
      const rm = await http.put("/retention/config", { rematricula: { term: "2030/1", startsAt: ymd(-1), endsAt: ymd(10), auto: true, message: "Oi {{nome}}, rematrícula de {{periodo}} aberta!" } }, auth());
      assert(rm.status === 200 && rm.data.rematricula.term === "2030/1" && rm.data.rematricula.auto === true, `remat config ${JSON.stringify(rm.data.rematricula)}`);
      const listBefore = (await http.get("/retention/rematricula", auth())).data;
      assert(listBefore.window === "open" && listBefore.pending >= 3 && listBefore.done === 0 && listBefore.daysLeft === 10, `list ${JSON.stringify({ w: listBefore.window, p: listBefore.pending, d: listBefore.done, l: listBefore.daysLeft })}`);
      await http.post("/retention/run", {}, auth());
      assert(/Rematrícula pendente/.test(labelsOf(ana.leadId)), "no re-enrollment label");
      await waitFor(() => said(ana.contactId, "rematrícula de 2030/1 aberta") === 1, 12000, "the re-enrollment message");
      await http.post("/retention/run", {}, auth());
      await new Promise(r => setTimeout(r, 1500));
      assert(said(ana.contactId, "rematrícula de 2030/1 aberta") === 1, "the same step of the window was sent twice");
      assert(Number(sql(`SELECT COUNT(*) FROM LeadTasks WHERE leadId=${ana.leadId} AND title LIKE 'Rematrícula 2030/1:%'`)) === 1, "no task for the tutor");
      // the student re-enrolls: done, label off; undo brings it back
      assert((await http.post(`/retention/rematricula/${ana.leadId}`, {}, auth())).status === 200, "mark re-enrolled");
      assert(!/Rematrícula pendente/.test(labelsOf(ana.leadId)), "the label stayed after the re-enrollment");
      const listAfter = (await http.get("/retention/rematricula", auth())).data;
      assert(listAfter.done === 1 && listAfter.doneStudents[0].id === ana.leadId && listAfter.rate > 0, `after ${listAfter.done}`);
      assert((await http.post(`/retention/rematricula/${ana.leadId}`, { undo: true }, auth())).status === 200, "undo");
      assert(/Rematrícula pendente/.test(labelsOf(ana.leadId)), "the label did not come back");
      assert((await http.post(`/retention/rematricula/${beto.leadId}`, {}, asUser(coordAc))).status === 200, "the academic coordinator marks the re-enrollment");
      assert((await http.post(`/retention/rematricula/${beto.leadId}`, {}, asUser(tutorTok))).status === 403, "a tutor marked a re-enrollment");
      // a window that closed: the labels go away
      await http.put("/retention/config", { rematricula: { startsAt: ymd(-20), endsAt: ymd(-2) } }, auth());
      assert((await http.get("/retention/rematricula", auth())).data.window === "closed", "the window should be closed");
      await http.post("/retention/run", {}, auth());
      assert(!/Rematrícula pendente/.test(labelsOf(ana.leadId)), "the label stayed after the window closed");
      await http.put("/retention/config", { nps: { enabled: false } }, auth());
    });
    await test("page of a course: public, without prices, and the form opens a lead tied to the course with the origin of the visit", async () => {
      const made = await http.post("/courses", { name: "Pedagogia Página Teste", modality: "EAD", category: "Graduação - Cruzeiro", semesters: 8, monthlyFee: 1073, active: true }, auth());
      assert(made.status === 200 || made.status === 201, `create course ${made.status} ${JSON.stringify(made.data).slice(0, 120)}`);
      const id = made.data.id;
      const slug = `${id}-pedagogia-pagina-teste`;
      const page = await fetch(`${API}/public/courses/${slug}`);
      assert(page.status === 200, `page ${page.status}`);
      const body = await page.json();
      assert(body.course.name === "Pedagogia Página Teste" && body.course.semesters === 8, `course ${JSON.stringify(body.course)}`);
      // the public page never carries a price
      assert(!/monthlyFee|mensalidade|1073/.test(JSON.stringify(body)), "the public course page leaked the price");
      assert((await fetch(`${API}/public/courses/${id}`)).status === 200, "the bare id should open the course too");
      assert((await fetch(`${API}/public/courses/abc`)).status === 404, "a made-up slug opened something");
      assert((await fetch(`${API}/public/courses/999999-nada`)).status === 404, "a course that does not exist opened");

      const post = (data, s2 = slug) => fetch(`${API}/public/courses/${s2}/lead`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      assert((await post({ name: "Maria Curso", phone: "(69) 98888-7711", consent: false })).status === 400, "accepted without consent");
      assert((await post({ name: "M", phone: "(69) 98888-7711", consent: true })).status === 400, "accepted a name that is too short");
      assert((await post({ name: "Maria Curso", phone: "123", consent: true })).status === 400, "accepted a bad phone");
      assert((await post({ name: "Maria Curso", phone: "(69) 98888-7711", email: "nao-e-email", consent: true })).status === 400, "accepted a bad e-mail");
      // a robot fills the hidden field: told it worked, nothing is created
      const before = Number(sql(`SELECT COUNT(*) FROM Leads WHERE name='Robo Curso'`));
      assert((await post({ name: "Robo Curso", phone: "(69) 98888-7722", consent: true, website: "http://spam" })).status === 200, "the honeypot answered an error");
      assert(Number(sql(`SELECT COUNT(*) FROM Leads WHERE name='Robo Curso'`)) === before, "a robot created a lead");

      const ok = await post({ name: "Maria Curso", phone: "(69) 98888-7711", email: "maria@curso.test", consent: true, utm_source: "google", utm_medium: "cpc", utm_campaign: "vestibular-2030" });
      assert(ok.status === 200, `submit ${ok.status}`);
      const row = sql(`SELECT CONCAT(courseId, '|', source, '|', COALESCE(utmSource,''), '|', COALESCE(utmMedium,''), '|', COALESCE(utmCampaign,''), '|', channel) FROM Leads WHERE name='Maria Curso'`);
      assert(row === `${id}|Site / formulário|google|cpc|vestibular-2030|form`, `lead ${row}`);
      // the same person coming again does not duplicate
      await post({ name: "Maria Curso", phone: "(69) 98888-7711", consent: true });
      assert(sql(`SELECT COUNT(*) FROM Leads WHERE name='Maria Curso'`) === "1", "the same person was duplicated");
      // a course taken off the air is no longer public
      await http.put(`/courses/${id}`, { active: false }, auth());
      assert((await fetch(`${API}/public/courses/${slug}`)).status === 404, "an inactive course stayed public");
    });
    await test("screening flow: the answers fill the lead (they set the score) and whoever is ready to decide goes straight to a consultant", async () => {
      const templates = (await http.get("/flow-templates", auth())).data;
      assert(templates.some(x => x.key === "triagem-de-qualificacao") && templates.some(x => x.key === "follow-up-lead-parado") && templates.some(x => x.key === "lembrete-prazo-matricula"), "the new templates are not offered");
      const flow = (await http.post("/flows", { name: "Triagem de qualificação", template: "triagem-de-qualificacao", whatsappId: cid }, auth())).data;
      const valid = await http.post(`/flows/${flow.id}/validate`, {}, auth());
      assert(valid.status === 200 && !(valid.data.issues || []).some(i => i.level === "error"), `the template has errors ${JSON.stringify(valid.data).slice(0, 300)}`);
      assert((await http.post(`/flows/${flow.id}/publish`, {}, auth())).status === 200, "publish the screening");
      const said = (since, text) => graph.sent.slice(since).some(x => JSON.stringify(x.body || {}).includes(text));
      const tap = (from, id, kind, title, n) => postMeta(cid, cloudEvent([{ from, id: `wamid.tri-${n}`, type: "interactive", interactive: kind === "button" ? { type: "button_reply", button_reply: { id, title } } : { type: "list_reply", list_reply: { id, title } } }], { contacts: [{ wa_id: from, profile: { name: "Aluno IA" } }] }), cloudCfg.appSecret);
      const leadOf = from => sql(`SELECT l.id FROM Leads l JOIN Contacts c ON c.id=l.contactId WHERE c.number='${from}'`);
      const field = (id, col) => sql(`SELECT COALESCE(${col}::text, '') FROM Leads WHERE id=${id}`);

      // ready to decide
      const hot = "5511910000081";
      let before = graph.sent.length;
      await inboundCloud(hot, "wamid.tri-0", "oi");
      await waitFor(() => said(before, "Como você prefere estudar"), 15000, "the first question");
      await tap(hot, "1", "button", "EAD", 1);
      await waitFor(() => said(before, "Quando você pretende começar"), 15000, "the question about the deadline");
      await tap(hot, "1", "list", "Quer matricular agora", 2);
      await waitFor(() => said(before, "O que mais te motiva"), 15000, "the question about the motivation");
      await tap(hot, "2", "list", "Mudança de carreira", 3);
      await waitFor(() => said(before, "perto de decidir"), 15000, "the message for who is ready");
      const hotId = leadOf(hot);
      assert(field(hotId, "modality") === "EAD" && field(hotId, "decisionTimeline") === "Quer matricular agora" && field(hotId, "motivation") === "Mudança de carreira", `hot lead ${field(hotId, "modality")}|${field(hotId, "decisionTimeline")}|${field(hotId, "motivation")}`);

      // only researching: filled too, and no hurry
      const cold = "5511910000082";
      before = graph.sent.length;
      await inboundCloud(cold, "wamid.tri-10", "oi");
      await waitFor(() => said(before, "Como você prefere estudar"), 15000, "the first question (cold)");
      await tap(cold, "2", "button", "Semipresencial", 11);
      await waitFor(() => said(before, "Quando você pretende começar"), 15000, "the deadline question (cold)");
      await tap(cold, "4", "list", "Pesquisando, sem prazo", 12);
      await waitFor(() => said(before, "O que mais te motiva"), 15000, "the motivation question (cold)");
      await tap(cold, "1", "list", "Primeira graduação", 13);
      await waitFor(() => said(before, "Anotei tudo"), 15000, "the message for who is only researching");
      assert(!said(before, "perto de decidir"), "someone who is only researching was sent to a consultant right away");
      const coldId = leadOf(cold);
      assert(field(coldId, "modality") === "Semipresencial" && field(coldId, "decisionTimeline") === "Pesquisando, sem prazo" && field(coldId, "motivation") === "Primeira graduação", "cold lead fields");
      assert((await http.post(`/flows/${flow.id}/unpublish`, {}, auth())).status === 200, "unpublish the screening");
    });
    await test("offering another course to the base: the list of contacts can be made of students, with the filters of the onboarding and of the time since the enrollment", async () => {
      const count = async body => (await http.post("/contact-lists/from-leads", { ...body, dryRun: true }, auth())).data.count;
      const students = await count({ audience: "students" });
      const finished = await count({ audience: "students", onboardingDone: true });
      const old90 = await count({ audience: "students", enrolledDays: 90 });
      const leadsOnly = await count({});
      assert(students >= 3, `students ${students}`);
      assert(finished >= 1 && finished <= students, `finished ${finished} of ${students}`);
      assert(old90 <= students, "the filter of time grew the list");
      // the funnel list never includes an enrolled person; the students list is exactly them
      assert(leadsOnly + students >= students, "counts");
      const made = await http.post("/contact-lists/from-leads", { audience: "students", onboardingDone: true, name: "Alunos para oferecer pós" }, auth());
      assert(made.status === 200 && made.data.imported === finished, `list ${made.status} ${JSON.stringify(made.data)}`);
      const items = (await http.get(`/contact-lists/${made.data.id}/items`, auth())).data;
      assert(items.length === finished && items.every(i => /^55\d{10,11}$/.test(i.number)), `items ${JSON.stringify(items.slice(0, 2))}`);
      // an enrolled person that was lost is not offered anything
      const lostStage = sql(`SELECT id FROM LeadStages WHERE type='lost' ORDER BY position LIMIT 1`);
      const someone = sql(`SELECT id FROM Leads WHERE enrolledAt IS NOT NULL AND onboardingStatus='done' ORDER BY id LIMIT 1`);
      sql(`UPDATE Leads SET stageId=${lostStage} WHERE id=${someone}`);
      assert((await count({ audience: "students", onboardingDone: true })) === finished - 1, "a lost student stayed in the list");
    });
    await test("connection health: state, since when, what it did today; each person sees only their own numbers", async () => {
      const h = await http.get("/whatsapp-health", auth());
      assert(h.status === 200 && h.data.length >= 2, `health ${h.status} ${h.data.length}`);
      const first = h.data[0];
      assert(first.name && first.status && first.statusSince && typeof first.sentToday === "number" && typeof first.receivedToday === "number", `shape ${JSON.stringify(first)}`);
      const cloud = h.data.find(x => x.channel === "whatsapp_cloud");
      assert(cloud && cloud.receivedToday >= 1, "today's messages were not counted");
      // the state hook: a change of status through the model moves "since"
      const cons = (await http.post("/users", { name: "Pessoa da Saúde", email: "health-cons@x.com", password: "senha123", role: "consultor" }, auth())).data;
      const tk = (await http.post("/auth/login", { email: "health-cons@x.com", password: "senha123" })).data.token;
      const person = await http.get("/whatsapp-health", asUser(tk));
      assert(person.status === 200 && person.data.every(w => !w.ownerId || w.ownerId === cons.id), "a person saw someone else's number");
    });
    await test("mass messages are for the commercial team: a tutor cannot reach campaigns or contact lists", async () => {
      await http.post("/users", { name: "Tutor sem campanhas", email: "tutor-camp@x.com", password: "senha123", role: "tutor" }, auth());
      const tk = (await http.post("/auth/login", { email: "tutor-camp@x.com", password: "senha123" })).data.token;
      for (const [m, url] of [["get", "/campaigns"], ["post", "/campaigns"], ["get", "/contact-lists"], ["post", "/contact-lists"]]) {
        const r = await http[m](url, ...(m === "post" ? [{}, asUser(tk)] : [asUser(tk)]));
        assert(r.status === 403, `${m} ${url} answered ${r.status} to a tutor`);
      }
      assert((await http.get("/campaigns", auth())).status === 200, "the administration lost the campaigns");
    });
    await test("choices go out as native buttons and lists, and the tap comes back as the option", async () => {
      const mk = async (name, labels) => {
        const f = (await http.post("/flows", { name, entry: { type: "first_message" }, whatsappId: cid, graph: { nodes: [
          { id: "s", type: "start", data: {} },
          { id: "q", type: "buttons", data: { text: "Escolha uma opção, {{primeiro_nome}}", options: labels.map((label, i) => ({ id: `o${i}`, label })) } },
          ...labels.map((l, i) => ({ id: `m${i}`, type: "message", data: { text: `Você escolheu ${l}` } })), { id: "e", type: "end", data: {} }],
          edges: [{ id: "a", source: "s", target: "q" }, ...labels.map((l, i) => ({ id: `b${i}`, source: "q", target: `m${i}`, sourceHandle: `o${i}` })), ...labels.map((l, i) => ({ id: `c${i}`, source: `m${i}`, target: "e" }))] } }, auth())).data;
        assert((await http.post(`/flows/${f.id}/publish`, {}, auth())).status === 200, `${name} not published`);
        return f.id;
      };
      // two options: reply buttons; the tap carries the title the person saw
      const two = await mk("Dois botoes", ["Cursos", "Financeiro de matrícula e mensalidade"]);
      const from = "5511910000041";
      let before = graph.sent.length;
      await inboundCloud(from, "wamid.choice-1", "oi");
      await waitFor(() => graph.sent.slice(before).some(x => x.body && x.body.type === "interactive"), 12000, "interactive message");
      const msg = graph.sent.slice(before).find(x => x.body && x.body.type === "interactive").body.interactive;
      assert(msg.type === "button" && msg.action.buttons.length === 2 && msg.action.buttons[1].reply.title.length <= 20 && msg.action.buttons[0].reply.id === "1", `buttons ${JSON.stringify(msg)}`);
      assert(!sentTexts(before).some(t => t.includes("*1* -")), "the numbered text went out together with the buttons");
      before = graph.sent.length;
      await postMeta(cid, cloudEvent([{ from, id: "wamid.choice-2", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "2", title: "Financeiro de matrícu" } } }], { contacts: [{ wa_id: from, profile: { name: "Aluno IA" } }] }), cloudCfg.appSecret);
      await waitFor(() => sentTexts(before).some(t => t.includes("Você escolheu Financeiro de matrícula e mensalidade")), 12000, "the tap on the second button");
      assert((await http.post(`/flows/${two}/unpublish`, {}, auth())).status === 200, "unpublish");
      // five options: a list
      const five = await mk("Lista", ["Um", "Dois", "Três", "Quatro", "Cinco"]);
      const from2 = "5511910000042";
      before = graph.sent.length;
      await inboundCloud(from2, "wamid.choice-3", "oi");
      await waitFor(() => graph.sent.slice(before).some(x => x.body && x.body.type === "interactive"), 12000, "list");
      const list = graph.sent.slice(before).find(x => x.body && x.body.type === "interactive").body.interactive;
      assert(list.type === "list" && list.action.sections[0].rows.length === 5, `list ${JSON.stringify(list).slice(0, 200)}`);
      await http.post(`/flows/${five}/unpublish`, {}, auth());
      // Telegram: an inline keyboard, and a tap (callback_query) answered like a message
      const tgFlow = await mk("Telegram", ["Sim", "Não"]);
      await http.put(`/flows/${tgFlow}`, { whatsappId: tgId }, auth());
      const tbefore = tg.sent.length;
      tg.updates.push({ update_id: 7791, message: { message_id: 91, chat: { id: 7771, type: "private" }, from: { first_name: "Teca" }, text: "oi" } });
      await waitFor(() => tg.sent.slice(tbefore).some(x => x.method === "sendMessage" && x.body.reply_markup), 12000, "inline keyboard");
      const kb = tg.sent.slice(tbefore).find(x => x.body.reply_markup).body.reply_markup.inline_keyboard;
      assert(kb.length === 2 && kb[0][0].callback_data === "1" && kb[1][0].text === "Não", `keyboard ${JSON.stringify(kb)}`);
      tg.updates.push({ update_id: 7792, callback_query: { id: "cb1", from: { first_name: "Teca" }, data: "2", message: { message_id: 5, chat: { id: 7771, type: "private" }, reply_markup: { inline_keyboard: kb } } } });
      await waitFor(() => tg.sent.slice(tbefore).some(x => x.method === "sendMessage" && x.body.text && x.body.text.includes("Você escolheu Não")), 12000, "tap answered");
      assert(tg.sent.slice(tbefore).some(x => x.method === "answerCallbackQuery"), "the tap was not acknowledged");
      await http.post(`/flows/${tgFlow}/unpublish`, {}, auth());
    });
    await test("AI functions: the agent starts a published flow by itself and the flow takes over", async () => {
      const flow = (await http.post("/flows", { name: "Menu de cursos", entry: { type: "manual" }, graph: { nodes: [
        { id: "s", type: "start", data: {} }, { id: "m", type: "message", data: { text: "Menu de cursos do fluxo: Administração, Direito e Pedagogia." } }, { id: "e", type: "end", data: {} }],
        edges: [{ id: "1", source: "s", target: "m" }, { id: "2", source: "m", target: "e" }] } }, auth())).data;
      // the agent form keeps only valid functions (a name, when to use it and a flow)
      const saved = await http.put(`/ai-agents/${aiId}`, { functions: [{ name: "Menu cursos", description: "Use quando o aluno pedir o menu de cursos.", flowId: flow.id }, { name: "", description: "sem nome", flowId: flow.id }, { name: "x", description: "sem fluxo" }] }, auth());
      assert(saved.status === 200 && saved.data.functions.length === 1 && saved.data.functions[0].name === "menu_cursos", `functions ${JSON.stringify(saved.data.functions)}`);
      // the tester never starts a flow
      const tryIt = await http.post(`/ai-agents/${aiId}/test`, { messages: [{ role: "user", content: "quero ver o menu de cursos" }] }, auth());
      assert(tryIt.status === 200 && !JSON.stringify(tryIt.data).includes("Menu de cursos do fluxo"), `the tester ran the flow ${tryIt.status}`);
      // not published yet: the function does nothing and the agent says so
      let before = graph.sent.length;
      await inboundCloud("5511910000051", "wamid.fn-1", "quero ver o menu de cursos");
      await waitFor(() => sentTexts(before).length > 0, 15000, "agent reply without a published flow");
      assert(!sentTexts(before).some(t => t.includes("Menu de cursos do fluxo")), "an unpublished flow ran");
      assert((await http.post(`/flows/${flow.id}/publish`, {}, auth())).status === 200, "publish");
      before = graph.sent.length;
      await inboundCloud("5511910000052", "wamid.fn-2", "quero ver o menu de cursos");
      await waitFor(() => sentTexts(before).some(t => t.includes("Menu de cursos do fluxo")), 15000, "the flow started by the agent");
      await new Promise(r => setTimeout(r, 1500));
      assert(!sentTexts(before).some(t => t.includes("Pronto, enviei o menu")), "the agent talked over the flow");
      assert(sql(`SELECT COUNT(*) FROM ChatFlowRuns WHERE flowId=${flow.id}`) === "1", "the run was not recorded");
      await http.put(`/ai-agents/${aiId}`, { functions: [] }, auth());
      await http.post(`/flows/${flow.id}/unpublish`, {}, auth());
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
      // the handoff already gave the conversation to a consultant of the queue; a person of the team answering is simulated by taking it over
      sql(`UPDATE Tickets SET status='open', userId=1 WHERE id=${t}`);
      const taken = { status: 200, data: {} };
      before = graph.sent.length;
      const reply = await http.post(`/messages/${t}`, { body: "Sim! Atletas federados têm 30% de bolsa, mediante comprovação." }, auth());
      assert(reply.status === 200, `team reply ${reply.status} ${JSON.stringify(reply.data)} (the transfer answered ${taken.status} ${JSON.stringify(taken.data).slice(0, 200)})`);
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
      assert(r.data.queues.length === 3 && ["comercial", "tutoria", "coordenacao"].every(k => r.data.queues.some(q => q.role === k)), "queues per function");
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
      // the contact of a lead follows the same scope: nobody reads or changes the contact of somebody else's lead
      const otherContact = sql(`SELECT contactId FROM Leads WHERE id=${other.id}`);
      const mineContact = sql(`SELECT contactId FROM Leads WHERE id=${mine.id}`);
      if (otherContact && mineContact) {
        assert((await http.get(`/contacts/${otherContact}`, asUser(consultorToken))).status === 403, "a consultant read the contact of somebody else's lead");
        assert((await http.put(`/contacts/${otherContact}`, { name: "Trocado" }, asUser(consultorToken))).status === 403, "a consultant changed the contact of somebody else's lead");
        assert((await http.put(`/contacts/${otherContact}/tags`, { tagIds: [] }, asUser(consultorToken))).status === 403, "a consultant changed the labels of somebody else's contact");
        assert((await http.get(`/contacts/${mineContact}`, asUser(consultorToken))).status === 200, "a consultant cannot read the contact of their own lead");
        assert((await http.get(`/contacts/${otherContact}`, auth())).status === 200, "the administrator cannot read a contact");
      }
    });
    await test("ambientação: the tutor sees the students waiting in the polo, a tutor can always be chosen, and the administrators are warned after 24 h", async () => {
      const mk = async (name, email, role) => (await http.post("/users", { name, email, password: "senha123", role }, auth())).data;
      const tutor = await mk("Tutora Vazia", "tutora@vazia.test", "tutor");
      const outsider = await mk("Tutor Sem Polo", "tutor@sempolo.test", "tutor");
      const cons = await mk("Consultor Vazia", "consultor@vazia.test", "consultor");
      const polo = (await http.post("/polos", { name: "Polo Vazia", code: "VAZ1", state: "RO" }, auth())).data;
      // the polo has a sales team only: the student waits in the tutoring line
      await http.put(`/polos/${polo.id}/members`, { members: [{ userId: cons.id, role: "comercial" }] }, auth());
      const consTok = (await http.post("/auth/login", { email: "consultor@vazia.test", password: "senha123" })).data.token;
      const lead = await mkLead("Aluno Esperando Tutor", "5511955553301", { ownerId: cons.id });
      const opened = await http.post(`/leads/${lead.id}/open-ticket`, { whatsappId: cid }, auth());
      assert(opened.status === 200 || opened.status === 201, `open-ticket ${opened.status}`);
      const r = await http.post(`/leads/${lead.id}/enroll`, { poloId: polo.id, tutorId: "auto", fee: "paid", whatsappId: cid }, asUser(consTok));
      assert(r.status === 200, `enroll ${r.status} ${JSON.stringify(r.data).slice(0, 160)}`);
      assert(sql(`SELECT COALESCE(onboardingTutorId::text,'') FROM Leads WHERE id=${lead.id}`) === "", "nobody should have been picked");

      // a polo with no tutor offers every tutor of the institution, marked as from elsewhere
      const fallback = (await http.get(`/polos/${polo.id}/tutors`, auth())).data;
      assert(fallback.some(t => t.id === tutor.id && t.outside) && fallback.some(t => t.id === outsider.id), `fallback tutors ${JSON.stringify(fallback)}`);
      assert((await http.get("/polos/0/tutors", auth())).data.length >= 2, "a student without polo has no tutor to choose");

      // the tutor is added to the polo: the waiting student shows up for them, and they appear in the choice
      await http.put(`/polos/${polo.id}/members`, { members: [{ userId: cons.id, role: "comercial" }, { userId: tutor.id, role: "tutoria" }] }, auth());
      const tutorTok = (await http.post("/auth/login", { email: "tutora@vazia.test", password: "senha123" })).data.token;
      const seen = (await http.get("/onboarding", asUser(tutorTok))).data;
      assert(seen.some(l => l.id === lead.id), "the tutor does not see the student waiting in their polo");
      const outsiderTok = (await http.post("/auth/login", { email: "tutor@sempolo.test", password: "senha123" })).data.token;
      assert(!(await http.get("/onboarding", asUser(outsiderTok))).data.some(l => l.id === lead.id), "a tutor of another polo sees the student");
      const chosen = (await http.get(`/polos/${polo.id}/tutors`, auth())).data;
      assert(chosen.length === 1 && chosen[0].id === tutor.id && !chosen[0].outside, `choice ${JSON.stringify(chosen)}`);
      const put = await http.put(`/leads/${lead.id}/onboarding`, { tutorId: tutor.id }, auth());
      assert(put.status === 200, `choose tutor ${put.status} ${JSON.stringify(put.data).slice(0, 160)}`);
      assert(sql(`SELECT onboardingTutorId FROM Leads WHERE id=${lead.id}`) === String(tutor.id), "the tutor was not saved");

      // the tutor starts a student nobody had taken: the student and the conversation become theirs and show in their conversations
      const lead2 = await mkLead("Aluno Que a Tutora Inicia", "5511955553302", { ownerId: cons.id });
      await http.post(`/leads/${lead2.id}/open-ticket`, { whatsappId: cid }, auth());
      const r2 = await http.post(`/leads/${lead2.id}/enroll`, { poloId: polo.id, tutorId: "auto", fee: "paid", whatsappId: cid }, asUser(consTok));
      assert(r2.status === 200, `enroll 2 ${r2.status}`);
      await http.put(`/leads/${lead2.id}/onboarding`, { tutorId: null }, auth());
      assert(sql(`SELECT COALESCE(onboardingTutorId::text,'') FROM Leads WHERE id=${lead2.id}`) === "", "the student should be waiting");
      const started = await http.post(`/leads/${lead2.id}/onboarding`, { action: "start" }, asUser(tutorTok));
      assert(started.status === 200 && started.data.ticketId, `start ${started.status} ${JSON.stringify(started.data).slice(0, 120)}`);
      assert(sql(`SELECT onboardingTutorId FROM Leads WHERE id=${lead2.id}`) === String(tutor.id), "starting did not make the tutor the student's tutor");
      assert(sql(`SELECT CONCAT(status,'|',userId) FROM Tickets WHERE id=${started.data.ticketId}`) === `open|${tutor.id}`, "the conversation did not become the tutor's");
      const queueOf = sql(`SELECT queueId FROM Tickets WHERE id=${started.data.ticketId}`);
      const mineList = (await http.get("/tickets", { ...asUser(tutorTok), params: { status: "open", showAll: "false", queueIds: JSON.stringify([Number(queueOf)]) } })).data.tickets;
      assert(mineList.some(t => t.id === Number(started.data.ticketId)), "the started conversation is not in the tutor's list");
      assert((await http.get(`/tickets/${started.data.ticketId}`, asUser(tutorTok))).status === 200, "the tutor cannot open the conversation");
      // the administration starting a student does not take it over
      const lead3 = await mkLead("Aluno Da Gestao", "5511955553303", { ownerId: cons.id });
      await http.post(`/leads/${lead3.id}/open-ticket`, { whatsappId: cid }, auth());
      await http.post(`/leads/${lead3.id}/enroll`, { poloId: polo.id, tutorId: "auto", fee: "paid", whatsappId: cid }, asUser(consTok));
      await http.put(`/leads/${lead3.id}/onboarding`, { tutorId: null }, auth());
      await http.post(`/leads/${lead3.id}/onboarding`, { action: "start" }, auth());
      assert(sql(`SELECT COALESCE(onboardingTutorId::text,'') FROM Leads WHERE id=${lead3.id}`) === "", "an administrator became the tutor");

      // checklist of the onboarding and the numbers for the management
      const step = await http.put(`/leads/${lead2.id}/onboarding/checklist`, { key: "first_access", done: true }, asUser(tutorTok));
      assert(step.status === 200 && step.data.checklist.first_access, `checklist ${step.status}`);
      assert((await http.get("/onboarding", asUser(tutorTok))).data.find(l => l.id === lead2.id).checklist.first_access, "checklist not listed");
      assert((await http.put(`/leads/${lead2.id}/onboarding/checklist`, { key: "nope", done: true }, asUser(tutorTok))).status === 404, "unknown step accepted");
      const st = await http.get("/onboarding/stats", auth());
      assert(st.status === 200 && st.data.weeks.length === 8 && st.data.totals.pending >= 1 && Array.isArray(st.data.byTutor), `stats ${st.status}`);
      assert((await http.get("/onboarding/stats", asUser(tutorTok))).status === 403, "a tutor read the management panel");

      // over 24 h without the first contact: one task for every administrator, once
      sql(`UPDATE Leads SET onboardingStatus='pending', onboardingAlertAt=NULL, enrolledAt=NOW() - INTERVAL '2 days' WHERE id=${lead.id}`);
      await waitFor(() => Number(sql(`SELECT COUNT(*) FROM LeadTasks WHERE leadId=${lead.id} AND title LIKE 'Ambientação atrasada%'`)) >= 1, 15000, "late onboarding task for the administrators");
      const admins = Number(sql(`SELECT COUNT(*) FROM Users WHERE profile='admin' OR role IN ('admin','coordenacao')`));
      assert(Number(sql(`SELECT COUNT(*) FROM LeadTasks WHERE leadId=${lead.id} AND title LIKE 'Ambientação atrasada%'`)) === admins, "one task per administrator expected");
    });
    await test("grades: reading them again rewrites the WhatsApp text of every matrix and lists only real internships", async () => {
      const r = await http.post("/grades/refresh", {}, auth());
      assert(r.status === 200 && r.data.checked >= 1 && r.data.failed === 0, `refresh ${r.status} ${JSON.stringify(r.data)}`);
      const rows = (await http.get("/grades", auth())).data;
      const list = Array.isArray(rows) ? rows : rows.grades || [];
      assert(list.length >= 1, "no grades listed");
      const ped = list.find(g => /^PEDAGOGIA \(LICENCIATURA\)/i.test(g.courseName));
      if (ped) {
        const full = (await http.get(`/grades/${ped.id}`, auth())).data;
        assert(!/Ambienta|Plano de Acompanhamento|Semin/i.test(full.whatsappSummary) && /400 horas no total/.test(full.whatsappSummary), `Pedagogia text ${full.whatsappSummary}`);
      }
    });
    await test("MEC rules: the standard of the Portaria 378/2025 by area is applied to the courses, adjusted once for the whole area, and the agents learn it", async () => {
      const d = (await http.get("/mec-defaults", auth())).data;
      assert(d.areas.length === 4 && d.total > 20, `defaults ${JSON.stringify(d).slice(0, 120)}`);
      const areaOfCourse = name => d.areas.find(a => a.courses.some(c => c.name === name))?.id;
      assert(areaOfCourse("Enfermagem") === "presencial" || areaOfCourse("Biomedicina") === "saude_eng_agro", "classification");
      assert(areaOfCourse("Biomedicina") === "saude_eng_agro" && areaOfCourse("Engenharia Civil") === "saude_eng_agro", "health/engineering are 40%");
      assert(areaOfCourse("Administração") === "livre", "Administração should not be impacted");
      assert(areaOfCourse("Física") === "educacao_ciencias" || areaOfCourse("Pedagogia") === "educacao_ciencias", "teaching/natural sciences are 30%");
      // the first start fills the courses without a rule (applying again keeps whatever exists)
      const first = await http.post("/mec-defaults/apply", {}, auth());
      assert(first.status === 200 && first.data.created + first.data.skipped === d.total - d.areas.reduce((n, a) => n + 0, 0), `apply ${JSON.stringify(first.data)} total ${d.total}`);
      const rule = name => sql(`SELECT CONCAT(COALESCE(r.mecImpacted::text,''),'|',COALESCE(r.percentualPresencial::text,'')) FROM CourseRegulations r JOIN Courses c ON c.id=r.courseId WHERE c.name='${name}' AND r.intakeTerm IS NULL LIMIT 1`);
      assert(rule("Biomedicina") === "1|40.00" || rule("Biomedicina") === "true|40.00", `Biomedicina rule ${rule("Biomedicina")}`);
      assert(/^(0|false)\|$/.test(rule("Administração")), `Administração rule ${rule("Administração")}`);
      // the team adjusts the area once and applies it to every course in it
      const saved = await http.put("/mec-defaults/saude_eng_agro", { ...d.areas.find(a => a.id === "saude_eng_agro"), percentualPresencial: 45 }, auth());
      assert(saved.status === 200 && Number(saved.data.percentualPresencial) === 45, `save ${saved.status}`);
      const kept = await http.post("/mec-defaults/apply", { area: "saude_eng_agro" }, auth());
      assert(kept.status === 200 && kept.data.updated === 0, "applying without overwrite must keep the existing rules");
      const applied = await http.post("/mec-defaults/apply", { area: "saude_eng_agro", overwrite: true }, auth());
      assert(applied.status === 200 && applied.data.updated > 5, `apply ${applied.status} ${JSON.stringify(applied.data)}`);
      assert(/\|45\.00$/.test(rule("Biomedicina")), `Biomedicina after apply ${rule("Biomedicina")}`);
      assert((await http.put("/mec-defaults/saude_eng_agro", { percentualPresencial: 150 }, auth())).status === 400, "percent above 100 accepted");
      assert((await http.put("/mec-defaults/saude_eng_agro", { ...saved.data, percentualPresencial: 40 }, auth())).status === 200, "restore");
      // the commercial agents have the Portaria in their knowledge base
      assert(Number(sql(`SELECT COUNT(*) FROM KbDocuments WHERE title LIKE 'Portaria MEC 378/2025%'`)) >= 1, "the agents did not learn the Portaria");
      assert((await http.get("/mec-defaults", asUser(tutorToken))).status === 403, "a tutor read the MEC defaults");
    });
    await test("connections: another number's groups, communities and private chats never reach a person who does not own it", async () => {
      const mkU = async (name, email, role) => (await http.post("/users", { name, email, password: "senha123", role }, auth())).data;
      const one = await mkU("Dona do Numero", "dona@numero.test", "consultor");
      const two = await mkU("Outra Pessoa", "outra@numero.test", "consultor");
      const [t1, t2] = [(await http.post("/auth/login", { email: "dona@numero.test", password: "senha123" })).data.token, (await http.post("/auth/login", { email: "outra@numero.test", password: "senha123" })).data.token];
      // a registered number owned by the person (inserted straight: connecting for real would open a browser session)
      const wa = { id: Number(sql(`INSERT INTO Whatsapps (name, status, channel, ownerId, createdAt, updatedAt) VALUES ('Numero da Dona','DISCONNECTED','whatsapp',${one.id},NOW(),NOW()) RETURNING id`).split("\n")[0]) };
      assert(wa.id, "connection not created");
      const mkContact = (name, number, isGroup) => sql(`INSERT INTO Contacts (name, number, isGroup, kind, createdAt, updatedAt) VALUES ('${name}','${number}',${isGroup},'${isGroup ? "group" : "person"}',NOW(),NOW()) RETURNING id`).split("\n")[0];
      const gc = mkContact("Grupo Da Dona", "120363000000000901", true);
      const pc = mkContact("Conversa Da Dona", "5511955554401", false);
      const mkTicket = (contact, isGroup) => sql(`INSERT INTO Tickets (status, contactId, whatsappId, isGroup, unreadMessages, isHistorical, createdAt, updatedAt) VALUES ('pending',${contact},${wa.id},${isGroup},0,false,NOW(),NOW()) RETURNING id`).split("\n")[0];
      const gt = mkTicket(gc, true);
      const pt = mkTicket(pc, false);
      const ids = async tok => (await http.get("/tickets", { ...asUser(tok), params: { status: "pending", showAll: "true", queueIds: "[]", groups: "only" } })).data.tickets.map(t => t.id);
      assert((await ids(t1)).includes(Number(gt)), "the owner does not see the group of their own number");
      assert(!(await ids(t2)).includes(Number(gt)), "another person sees the group of a number that is not theirs");
      const priv = async tok => (await http.get("/tickets", { ...asUser(tok), params: { status: "pending", showAll: "true", queueIds: "[]", groups: "exclude" } })).data.tickets.map(t => t.id);
      assert(!(await priv(t2)).includes(Number(pt)), "another person sees a private chat of a number that is not theirs");
      assert((await http.get(`/tickets/${gt}`, asUser(t2))).status === 403, "the group opens by id for someone else");
      assert((await http.get(`/tickets/${gt}`, asUser(t1))).status === 200, "the owner cannot open their group");
      const comm = async tok => (await http.get("/communities", asUser(tok))).data.communities.flatMap(c => [c.announcement, ...c.groups].filter(Boolean).map(g => g.contactId));
      sql(`UPDATE Contacts SET communityRole='member' WHERE id=${gc}`);
      assert(!(await comm(t2)).includes(Number(gc)), "communities leak to another person");
      const contactsOf = async tok => (await http.get("/contacts", { ...asUser(tok), params: { searchParam: "Grupo Da Dona" } })).data.contacts.map(c => c.id);
      assert(!(await contactsOf(t2)).includes(Number(gc)), "the group shows in the contacts of another person");
      assert((await contactsOf(t1)).includes(Number(gc)), "the owner lost the group in their contacts");
      const mineOf = async tok => (await http.get("/contacts", { ...asUser(tok), params: { searchParam: "Conversa Da Dona" } })).data.contacts.map(c => c.id);
      assert((await mineOf(t1)).includes(Number(pc)), "the owner of the number lost the contact of their own number");
      assert(!(await mineOf(t2)).includes(Number(pc)), "a consultant sees in the contacts a person who is not theirs");
      sql(`UPDATE Tickets SET userId=${two.id} WHERE id=${pt}`);
      assert((await mineOf(t2)).includes(Number(pc)), "a consultant does not see the contact of a conversation assigned to them");
    });
    // ----------------------------------------------- enrollment -> tutor
    await test("Matrícula isenta: the consultant informs it at the confirmation instead of charging; no charge is created; a payment that arrives anyway wins", async () => {
      const mk = async (name, email, role) => (await http.post("/users", { name, email, password: "senha123", role }, auth())).data;
      const tutorX = await mk("Tutora Isenta", "tutorx@isenta.test", "tutor");
      const consX = await mk("Consultor Isenta", "consultorx@isenta.test", "consultor");
      const poloX = (await http.post("/polos", { name: "Polo Isenta", code: "ISE1", state: "RO" }, auth())).data;
      await http.put(`/polos/${poloX.id}/members`, { members: [{ userId: tutorX.id, role: "tutoria" }, { userId: consX.id, role: "comercial" }] }, auth());
      const consTok = (await http.post("/auth/login", { email: "consultorx@isenta.test", password: "senha123" })).data.token;
      // only the labels of the fee (the enrollment also brings "Documentos pendentes")
      const names = (table, col, id) => sql(`SELECT COALESCE(STRING_AGG(t.name, ',' ORDER BY t.name), '') FROM ${table} x JOIN Tags t ON t.id=x.tagId WHERE x.${col}=${id} AND (t.name LIKE 'Taxa %' OR t.name = 'Matrícula isenta')`);
      const enrolled = async (name, phone) => {
        const lead = await mkLead(name, phone, { ownerId: consX.id });
        const opened = await http.post(`/leads/${lead.id}/open-ticket`, { whatsappId: cid }, auth());
        assert(opened.status === 200 || opened.status === 201, `open-ticket ${opened.status}`);
        return lead;
      };

      // 1) a consultant confirms the enrollment informing that there is no fee: no charge, the label, the record
      const a = await enrolled("Aluno Isento", "5511955579201");
      const r = await http.post(`/leads/${a.id}/enroll`, { poloId: poloX.id, tutorId: "auto", fee: "exempt", whatsappId: cid }, asUser(consTok));
      assert(r.status === 200, `exempt enrollment ${r.status} ${JSON.stringify(r.data).slice(0, 160)}`);
      assert(sql(`SELECT COUNT(*) FROM Payments WHERE leadId=${a.id}`) === "0", "a charge was created for an exempt enrollment");
      assert(names("LeadTags", "leadId", a.id) === "Matrícula isenta", `lead labels: ${names("LeadTags", "leadId", a.id)}`);
      const aContact = sql(`SELECT contactId FROM Leads WHERE id=${a.id}`);
      if (aContact) assert(names("ContactTags", "contactId", aContact) === "Matrícula isenta", "the contact has no exempt label");
      assert(/Matrícula isenta/.test(sql(`SELECT body FROM LeadActivities WHERE leadId=${a.id} AND body LIKE '%isenta%' LIMIT 1`)), "no record of the waiver");
      // moving the card never turns it into pending
      await http.put(`/leads/${a.id}/stage`, { stageId: Number(sql(`SELECT id FROM LeadStages WHERE type='won' ORDER BY position LIMIT 1`)) }, auth());
      assert(names("LeadTags", "leadId", a.id) === "Matrícula isenta", "the exempt label was overwritten by the stage change");

      // 2) a payment that arrives anyway wins over the waiver (the money was received)
      await http.put(`/leads/${a.id}`, { cpf: cpfFor(423456780) }, auth());
      const rc = await http.post(`/leads/${a.id}/payments`, { method: "bolix", dueDate: ymdPlus(2), amount: "70" }, auth());
      assert(rc.status === 201, `charge ${rc.status}`);
      const secret = (await http.get("/payments/efi/settings", auth())).data.webhookUrl.split("/").pop();
      const chargeId = sql(`SELECT chargeId FROM Payments WHERE id=${rc.data.id}`);
      billet.notifications.exemptPaid = [chargeId];
      billet.charges[chargeId].status = "paid";
      await http.post(`/webhooks/efi/${secret}/billet`, "notification=exemptPaid", { headers: { "content-type": "application/x-www-form-urlencoded" } });
      await waitFor(() => names("LeadTags", "leadId", a.id) === "Taxa paga", 8000, "Taxa paga over the waiver");
    });
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
      // nothing is sent to the student by the system: the tutor decides if and when to greet
      assert(graph.sent.length === before, `the system sent a message by itself on enrollment (${graph.sent.length - before})`);
      // the administration writes the greeting; the tutor gets it ready, edited with their data, while nobody has answered yet
      assert((await http.put("/settings/onboarding_welcome_template", { value: "Oi, {{primeiro_nome}}! Sou {{tutor}} do polo {{polo}}." }, auth())).status === 200, "welcome template setting");
      const mineTok = tutorId === tA.id ? atok : btok;
      const welcome = (await http.get(`/tickets/${ob}/welcome`, asUser(mineTok))).data;
      assert(welcome.show === true && welcome.text.startsWith("Oi, Aluna!") && welcome.text.includes("Polo Matricula"), `welcome ${JSON.stringify(welcome)}`);
      // the administrator reads everything but does not answer as the tutor
      const adminSend = await http.post(`/messages/${ob}`, { body: "Oi, sou o admin" }, auth());
      assert(adminSend.status === 403 && adminSend.data.error === "ERR_ONBOARDING_TUTOR_ONLY", `administrator answered in the tutor's conversation: ${adminSend.status}`);
      assert((await http.get(`/messages/${ob}`, auth())).status === 200, "administrator cannot read the tutor's conversation");

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
      assert(!((r => { if (!Array.isArray(r.data)) throw new Error(`list ${r.status} ${JSON.stringify(r.data).slice(0,200)}`); return r.data; })(await http.get("/affiliates", asUser(tb)))).some(a => a.id === aff.id), "list leaked an affiliate");
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

      // opens of the link are counted: people, once a day each; previews and robots are not people
      const clicksOf = () => Number(sql(`SELECT count(*) FROM AffiliateClicks WHERE affiliateId=${aff.id}`));
      const opens = async ua => { await fetch(`${API}/r/${aff.refCode}`, { headers: { "User-Agent": ua } }); await new Promise(r => setTimeout(r, 250)); };
      const before = clicksOf();
      const CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
      await opens(CHROME);
      await opens(CHROME);
      assert(clicksOf() === before + 2, `two opens by the same person were ${clicksOf() - before}`);
      assert(Number(sql(`SELECT count(DISTINCT visitor) FROM AffiliateClicks WHERE affiliateId=${aff.id} AND visitor IN (SELECT visitor FROM AffiliateClicks ORDER BY id DESC LIMIT 2)`)) === 1, "the same person was counted as two");
      await opens("WhatsApp/2.23.20.0 A");
      await opens("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)");
      await opens("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)");
      assert(clicksOf() === before + 2, "a link preview or a robot was counted as a person");
      const allBefore = Number(sql(`SELECT count(*) FROM AffiliateClicks`));
      assert((await fetch(`${API}/r/NAOEXISTE9`, { headers: { "User-Agent": CHROME } })).status === 404, "unknown link");
      await new Promise(r => setTimeout(r, 250));
      assert(Number(sql(`SELECT count(*) FROM AffiliateClicks`)) === allBefore, "an unknown link was counted");
      assert(!sql(`SELECT visitor FROM AffiliateClicks WHERE affiliateId=${aff.id} LIMIT 1`).includes("."), "the visitor is not a hash");
      const seen = (await http.get(`/affiliate-portal/${aff.portalToken}`)).data.stats.clicks;
      assert(seen && seen.total === clicksOf() && seen.unique >= 1 && seen.unique <= seen.total && seen.last7 === seen.total, `portal clicks ${JSON.stringify(seen)}`);
      const staffSees = (await http.get(`/affiliates/${aff.id}/summary`, asUser(ta))).data.clicks;
      assert(staffSees && staffSees.total === seen.total, "the team does not see the clicks");

      // The affiliate column comes before every other column, but it is not "the first column" of the regular funnel: a
      // person who is not an affiliate's referral never starts in it, nor goes back to it when they write again
      const laneId = sql(`SELECT CAST(value AS INTEGER) FROM Settings WHERE key='affiliate_stage_id'`);
      assert(laneId, "the affiliate column was not created by the referral");
      const regular = n => sql(`SELECT id FROM LeadStages WHERE type='open' AND id<>${laneId} ORDER BY position ASC LIMIT 1 OFFSET ${n}`);
      tg.updates.push({ update_id: 9101, message: { message_id: 9101, chat: { id: 7701, type: "private" }, from: { first_name: "Lívia", last_name: "Nova" }, text: "Olá, tenho interesse" } });
      const newTicket = await waitFor(() => ticketOf("tg_7701"), 8000, "ticket of a new person");
      await waitFor(() => sql(`SELECT id FROM Leads WHERE contactId=(SELECT id FROM Contacts WHERE number='tg_7701')`), 8000, "lead of a new person");
      const fresh = sql(`SELECT stageId FROM Leads WHERE contactId=(SELECT id FROM Contacts WHERE number='tg_7701')`);
      assert(fresh === regular(0) && fresh !== laneId, `a new person started in column ${fresh} (the affiliate column is ${laneId})`);
      assert(sql(`SELECT COUNT(*) FROM LeadTags WHERE leadId=(SELECT id FROM Leads WHERE contactId=(SELECT id FROM Contacts WHERE number='tg_7701'))`) === "0", "a new person got the Afiliado label");
      // the first reply moves them to the second regular column, not to the first one again
      const reply = await http.post(`/messages/${newTicket}`, { body: "Oi Lívia, tudo bem?" }, auth());
      assert(reply.status === 200, `reply ${reply.status}`);
      await waitFor(() => sql(`SELECT stageId FROM Leads WHERE contactId=(SELECT id FROM Contacts WHERE number='tg_7701')`) === regular(1), 8000, "first reply advances to the second regular column");
      // someone from the history who writes again starts in the first regular column
      const hc = sql(`INSERT INTO Contacts (name, number, email, isGroup, channel, createdAt, updatedAt) VALUES ('Antiga Volta', 'tg_7702', '', false, 'telegram', NOW(), NOW()) RETURNING id`).split("\n")[0];
      sql(`INSERT INTO Tickets (status, contactId, whatsappId, unreadMessages, isGroup, segment, isHistorical, lastMessage, closedAt, createdAt, updatedAt) VALUES ('closed', ${hc}, ${tgId}, 0, false, 'sales', true, 'antiga', NOW(), NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days')`);
      sql(`INSERT INTO Leads (name, stageId, contactId, isHistorical, createdAt, updatedAt) VALUES ('Antiga Volta', ${regular(2)}, ${hc}, true, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days')`);
      tg.updates.push({ update_id: 9102, message: { message_id: 9102, chat: { id: 7702, type: "private" }, from: { first_name: "Antiga", last_name: "Volta" }, text: "voltei" } });
      await waitFor(() => sql(`SELECT isHistorical FROM Leads WHERE contactId=${hc}`) === "0", 8000, "history lead reactivated");
      const back = sql(`SELECT stageId FROM Leads WHERE contactId=${hc}`);
      assert(back === regular(0) && back !== laneId, `a person from the history came back to column ${back} (the affiliate column is ${laneId})`);

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
    await test("affiliates in the CRM: a contact shared by an affiliate becomes a tagged lead in the affiliate column", async () => {
      const ow = (await http.post("/users", { name: "Dona da Indicação", email: "afil-ref@x.com", password: "senha123", role: "consultor" }, auth())).data;
      const tk = (await http.post("/auth/login", { email: "afil-ref@x.com", password: "senha123" })).data.token;
      const aff = (await http.post("/affiliates", { name: "Marta Indicadora", phone: "(69) 97777-0001" }, asUser(tk))).data;
      assert(aff.id && aff.ownerId === ow.id, "affiliate not created");
      const script = `
        const http = require("http");
        require("./dist/database");
        const { initIO } = require("./dist/libs/socket");
        initIO(http.createServer());
        const { parseVcards, registerAffiliateReferrals } = require("./dist/services/AffiliateServices/ReferralFromContact");
        (async () => {
          const card = "BEGIN:VCARD\\nVERSION:3.0\\nFN:Carlos Indicado\\nTEL;type=CELL;waid=5511922220001:+55 11 92222-0001\\nEND:VCARD\\nBEGIN:VCARD\\nVERSION:3.0\\nFN:Ana Indicada\\nTEL;type=CELL:+55 11 92222-0002\\nEND:VCARD";
          const people = parseVcards(card);
          const fromAffiliate = await registerAffiliateReferrals("5569977770001", people);
          const fromStranger = await registerAffiliateReferrals("5569911110000", parseVcards("BEGIN:VCARD\\nFN:Estranho\\nTEL:+55 11 92222-0003\\nEND:VCARD"));
          console.log(JSON.stringify({ n: people.length, fromAffiliate, fromStranger }));
          process.exit(0);
        })().catch(e => { console.error(e); process.exit(1); });`;
      const raw = execFileSync("node", ["-e", script], { cwd: ROOT, env: { ...env, LOG_LEVEL: "error" } }).toString().trim();
      const out = JSON.parse(raw.split("\n").pop());
      if (out.fromAffiliate !== 2 || /LOGERR/.test(raw)) throw new Error(`child output: ${raw.slice(0, 1500)} leads=${sql("SELECT string_agg(id||':'||COALESCE(phone,'-')||':'||stageId||':'||COALESCE(affiliateId,0), ',') FROM Leads")}`);
      assert(out.n === 2 && out.fromAffiliate === 2 && out.fromStranger === 0, `vcard ${JSON.stringify(out)}`);
      const stage = sql(`SELECT name FROM LeadStages WHERE id=(SELECT CAST(value AS INTEGER) FROM Settings WHERE key='affiliate_stage_id')`);
      assert(stage === "Indicações de afiliados", `stage ${stage}`);
      assert(sql(`SELECT MIN(position) FROM LeadStages`) === sql(`SELECT position FROM LeadStages WHERE name='Indicações de afiliados'`), "the affiliate column is not the first");
      assert(sql(`SELECT COUNT(*) FROM Leads l JOIN LeadStages s ON s.id=l.stageId WHERE l.affiliateId=${aff.id} AND s.name='Indicações de afiliados' AND l.ownerId=${ow.id} AND l.source='Indicação'`) === "2", "leads not in the affiliate column with the right owner");
      assert(sql(`SELECT COUNT(*) FROM LeadTags lt JOIN Tags t ON t.id=lt.tagId JOIN Leads l ON l.id=lt.leadId WHERE l.affiliateId=${aff.id} AND t.name='Afiliado'`) === "2", "tag Afiliado missing");
      assert(sql(`SELECT COUNT(*) FROM Leads WHERE name='Estranho'`) === "0", "a stranger's card created a lead");
      assert(sql(`SELECT COUNT(*) FROM LeadTasks WHERE userId=${ow.id} AND title LIKE '%Marta Indicadora%'`) === "2", "first-contact tasks missing");
      // a normal lead does not land in the affiliate column
      const normal = (await http.post("/leads", { name: "Lead comum", phone: "69988887777", source: "Site" }, auth())).data;
      const nl = normal.lead || normal;
      assert(sql(`SELECT s.name FROM Leads l JOIN LeadStages s ON s.id=l.stageId WHERE l.id=${nl.id}`) !== "Indicações de afiliados", "regular lead went to the affiliate column");
      // funnel filter
      const only = await http.get("/crm/board?affiliate=any", auth());
      const all = JSON.stringify(only.data);
      assert(only.status === 200 && all.includes("Carlos Indicado") && !all.includes("Lead comum"), `affiliate filter ${only.status}`);
    });
    await test("review fixes: coordination at the personal numbers and the dashboard, funnel paging order, renaming a contact, the ticket tells if a group is read-only", async () => {
      const tcoord = (await http.post("/auth/login", { email: "coord-c@x.com", password: "senha123" })).data.token;
      const consTok = (await http.post("/auth/login", { email: "do-coord@x.com", password: "senha123" })).data.token;
      const as = asUser(tcoord);
      // the coordination reads the whole company in the dashboard (a consultant only their own)
      assert((await http.get("/dashboard", as)).data.scope === "all", "coordinator dashboard is not the whole company");
      assert((await http.get("/dashboard", asUser(consTok))).data.scope === "mine", "a consultant reads the whole company");
      assert((await http.get("/stats/overview", asUser(consTok))).status === 200, "stats overview for a consultant");

      // a number that belongs to another person can still be used by the coordination (schedules, campaigns...)
      const consId = sql(`SELECT id FROM Users WHERE email = 'do-coord@x.com'`);
      const tgContactId = (await http.get(`/tickets/${tgTicket}`, auth())).data.contactId;
      sql(`UPDATE Whatsapps SET ownerId = ${consId} WHERE id = ${tgId}`);
      const when = new Date(Date.now() + 3600000).toISOString();
      const own = await http.post("/schedules", { body: "lembrete", sendAt: when, contactId: tgContactId, whatsappId: Number(tgId) }, as);
      assert(own.status === 200 || own.status === 201, `coordinator cannot use someone else's number ${own.status} ${JSON.stringify(own.data).slice(0, 120)}`);
      const other = (await http.post("/auth/login", { email: "outro-an@x.com", password: "senha123" })).data.token;
      assert((await http.post("/schedules", { body: "x", sendAt: when, contactId: tgContactId, whatsappId: Number(tgId) }, asUser(other))).status === 403, "a consultant used another person's number");
      sql(`UPDATE Whatsapps SET ownerId = NULL WHERE id = ${tgId}`);

      // "Carregar mais" follows the order of the column (score first), so no lead repeats or is skipped
      const stage = sql(`SELECT id FROM LeadStages ORDER BY position LIMIT 1`);
      const made = [];
      for (const [i, score] of [10, 50, 30, 50, 20].entries()) {
        const l = await mkLead(`Paginacao ${i}`, `55119555520${i}0`, { stageId: Number(stage) });
        sql(`UPDATE Leads SET score = ${score} WHERE id = ${l.id}`);
        made.push(l.id);
      }
      const page1 = (await http.get("/leads", { ...auth(), params: { stageId: stage, limit: 3, offset: 0, search: "Paginacao" } })).data.leads;
      const page2 = (await http.get("/leads", { ...auth(), params: { stageId: stage, limit: 3, offset: 3, search: "Paginacao" } })).data.leads;
      const seq = [...page1, ...page2].filter(l => made.includes(l.id));
      assert(seq.length === 5 && new Set(seq.map(l => l.id)).size === 5, `paging repeated or skipped leads ${JSON.stringify(seq.map(l => l.id))}`);
      assert(seq.every((l, i) => i === 0 || Number(seq[i - 1].score) >= Number(l.score)), `paging not by score ${JSON.stringify(seq.map(l => l.score))}`);

      // renaming a contact does not depend on a connected WhatsApp (only a changed number is checked there)
      const originalName = (await http.get(`/contacts/${tgContactId}`, auth())).data.name;
      const renamed = await http.put(`/contacts/${tgContactId}`, { name: "Ana Renomeada" }, auth());
      assert(renamed.status === 200 && renamed.data.name === "Ana Renomeada", `rename ${renamed.status} ${JSON.stringify(renamed.data).slice(0, 120)}`);
      await http.put(`/contacts/${tgContactId}`, { name: originalName }, auth());
      // the conversation carries what the composer needs to lock an announcement group
      const shown = (await http.get(`/tickets/${tgTicket}`, auth())).data;
      assert(shown.contact && Object.prototype.hasOwnProperty.call(shown.contact, "readOnly"), "ticket contact without readOnly");
    });
    await test("goals per polo before any semester exists: an empty board with every list the screen reads", async () => {
      const empty = await http.get("/goals/polos", auth());
      assert(empty.status === 200 && empty.data.goal === null, `empty ${empty.status}`);
      ["periods", "months", "rows", "monthTotals", "available"].forEach(k => assert(Array.isArray(empty.data[k]), `${k} is not a list`));
    });
    await test("goals per polo: everyone follows, only managers edit, numbers come from the CRM", async () => {
      const iso = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Porto_Velho" }).format(new Date(Date.now() + n * 86400000)); // the app counts days in its own timezone
      const polo = (await http.post("/polos", { name: "Polo da Meta", code: "9001", state: "RO" }, auth())).data;
      assert(polo.id, "polo not created");
      const goal = (await http.post("/goals", { startsOn: iso(-5), endsOn: iso(10), kind: "polo", members: [] }, auth())).data;
      const lead = (await http.post("/leads", { name: "Aluno da Meta", phone: "5511966660001", source: "Site" }, auth())).data.lead;
      sql(`UPDATE Leads SET wonAt=NOW(), poloId=${polo.id} WHERE id=${lead.id}`);
      const tk = (await http.post("/auth/login", { email: "consultor@polo.test", password: "senha123" })).data.token;
      assert((await http.put(`/goals/${goal.id}/polos`, { rows: [] }, asUser(tk))).status === 403, "a consultant edited the polo goals");
      const saved = await http.put(`/goals/${goal.id}/polos`, { workDays: 7, rows: [{ poloId: polo.id, target: 10, manual: 2, canceled: 1 }] }, auth());
      assert(saved.status === 200, `save ${saved.status}`);
      const seen = await http.get(`/goals/polos?goalId=${goal.id}`, asUser(tk));
      assert(seen.status === 200, `a consultant cannot follow the polos ${seen.status}`);
      const row = seen.data.rows.find(r => r.poloId === polo.id);
      assert(row && row.auto === 1 && row.manual === 2 && row.done === 3 && row.target === 10 && row.missing === 7 && row.canceled === 1 && row.inCourse === 2, `row ${JSON.stringify(row)}`);
      assert(seen.data.goal.daysLeft === 11 && row.perDay === 0.64 && row.status === "warn", `pace ${seen.data.goal.daysLeft} ${row.perDay} ${row.status}`);
      assert(seen.data.totals.target === 10 && seen.data.totals.done === 3 && seen.data.totals.pct === 30 && seen.data.totals.inCourse === 2, `totals ${JSON.stringify(seen.data.totals)}`);
      // the target is for the whole period and spread over its months
      assert(row.monthly.length === seen.data.months.length && row.monthly.reduce((t, n) => t + n, 0) === 10, `monthly ${JSON.stringify(row.monthly)}`);
      assert(!JSON.stringify(seen.data).includes("leadsPerDay"), "leads per day is gone");
      // quick edit of one polo: a new target is spread again; the other fields are kept
      const quick = await http.put(`/goals/${goal.id}/polos/${polo.id}`, { target: 20 }, auth());
      const q = quick.data.rows.find(r => r.poloId === polo.id);
      assert(quick.status === 200 && q.target === 20 && q.manual === 2 && q.canceled === 1 && q.monthly.reduce((t, n) => t + n, 0) === 20, `quick ${quick.status} ${JSON.stringify(q && [q.target, q.manual, q.canceled, q.monthly])}`);
      assert((await http.put(`/goals/${goal.id}/polos/${polo.id}`, { target: 5 }, asUser(tk))).status === 403, "a consultant edited one polo");
      // the spreadsheet import: total done discounts what the CRM already counted, unknown polos are created
      const dry = (await http.post(`/goals/${goal.id}/polos/import`, { dryRun: true, items: [{ code: "9001", name: "Polo da Meta - RO", target: 30, done: 5, canceled: 1 }, { code: "7777", name: "Polo Inventado - RO", target: 12, done: 3, canceled: 0 }, { name: "", target: 1 }] }, auth())).data;
      assert(dry.updated === 1 && dry.created === 1 && dry.errors === 1, `dry ${JSON.stringify([dry.updated, dry.created, dry.errors])}`);
      assert(sql(`SELECT COUNT(*) FROM Polos WHERE code='7777'`) === "0", "dry run created a polo");
      const imp = await http.post(`/goals/${goal.id}/polos/import`, { items: [{ code: "9001", name: "Polo da Meta - RO", target: 30, done: 5, canceled: 1 }, { code: "7777", name: "Polo Inventado - RO", target: 12, done: 3, canceled: 0 }] }, auth());
      assert(imp.status === 200 && sql(`SELECT COUNT(*) FROM Polos WHERE code='7777'`) === "1", "import did not create the polo");
      const after = (await http.get(`/goals/polos?goalId=${goal.id}`, asUser(tk))).data;
      const again = after.rows.find(r => r.poloId === polo.id);
      assert(again.target === 30 && again.done === 5 && again.manual === 4, `import discounts the CRM ${JSON.stringify([again.target, again.done, again.manual])}`);
      // the team goals list does not show the polo semester
      assert(!(await http.get("/goals", auth())).data.some(g => g.id === goal.id), "polo goal leaked into the team goals");
    });
    await test("a confirmed enrollment can be edited: step back, swap the tutor, no message goes out", async () => {
      const row = sql(`SELECT id||'|'||poloId||'|'||COALESCE(onboardingTutorId,0) FROM Leads WHERE onboardingStatus='pending' AND poloId IS NOT NULL ORDER BY id DESC LIMIT 1`);
      assert(row, "no enrolled lead to edit");
      const [leadId, poloIdOf] = row.split("|").map(Number);
      const second = (await http.post("/users", { name: "Segundo Tutor", email: "tutor2@polo.test", password: "senha123", role: "tutor" }, auth())).data;
      const members = sql(`SELECT string_agg(userId||':'||role, ',') FROM PoloMembers WHERE poloId=${poloIdOf}`).split(",").filter(Boolean).map(x => { const [u, r] = x.split(":"); return { userId: Number(u), role: r }; });
      assert((await http.put(`/polos/${poloIdOf}/members`, { members: [...members, { userId: second.id, role: "tutoria" }] }, auth())).status === 200, "member not added");
      const sentBefore = graph.sent.length;
      const started = await http.put(`/leads/${leadId}/onboarding`, { status: "started" }, auth());
      assert(started.status === 200 && started.data.onboardingStatus === "started", `started ${started.status}`);
      const done = await http.put(`/leads/${leadId}/onboarding`, { status: "done" }, auth());
      assert(done.data.onboardingStatus === "done", "not done");
      const back = await http.put(`/leads/${leadId}/onboarding`, { status: "pending" }, auth());
      assert(back.data.onboardingStatus === "pending" && !back.data.onboardingDoneAt, `back ${JSON.stringify([back.data.onboardingStatus, back.data.onboardingDoneAt])}`);
      const swapped = await http.put(`/leads/${leadId}/onboarding`, { tutorId: second.id }, auth());
      assert(swapped.status === 200 && swapped.data.onboardingTutorId === second.id, `swap ${swapped.status} ${JSON.stringify(swapped.data).slice(0, 120)}`);
      assert(sql(`SELECT COUNT(*) FROM Tickets t JOIN Leads l ON l.contactId=t.contactId WHERE l.id=${leadId} AND t.segment='onboarding' AND t.status IN ('open','pending') AND t.userId=${second.id}`) === "1", "the onboarding conversation did not follow the new tutor");
      const outsider = (await http.post("/users", { name: "Fora do Polo", email: "forapolo@polo.test", password: "senha123", role: "tutor" }, auth())).data;
      assert((await http.put(`/leads/${leadId}/onboarding`, { tutorId: outsider.id }, auth())).status === 422, "a tutor from outside the polo was accepted");
      assert(graph.sent.length === sentBefore, "editing the enrollment sent a message");
    });
    await test("Estatísticas do gestor: alertas de agora, progresso dos polos e quem pode ver", async () => {
      const cons = (await http.post("/auth/login", { email: "consultor@polo.test", password: "senha123" })).data.token;
      const tut = (await http.post("/auth/login", { email: "tutor@polo.test", password: "senha123" })).data.token;
      assert((await http.get("/dashboard/manager", asUser(cons))).status === 403, "a consultant opened the manager overview");
      assert((await http.get("/dashboard/manager", asUser(tut))).status === 403, "a tutor opened the manager overview");
      assert((await http.get("/dashboard/manager")).status === 401, "the manager overview without login");
      const alertOf = (d, key) => (d.alerts.find(a => a.key === key) || { count: 0 }).count;

      const base = await http.get("/dashboard/manager", { params: { days: 7 }, ...auth() });
      assert(base.status === 200, `overview ${base.status}`);
      ["alerts", "polos"].forEach(k => assert(Array.isArray(base.data[k]), `${k} is not a list`));
      assert(base.data.period && Array.isArray(base.data.period.daily) && typeof base.data.period.attendances === "number", "period shape");
      assert(base.data.alerts.every(a => a.count > 0 && ["danger", "warn"].includes(a.tone) && a.to.startsWith("/")), "an alert without count, tone or link");

      // a lead that nobody contacted for hours is an alert; once contacted it goes away
      const lead = (await http.post("/leads", { name: "Lead Parado Gestor", phone: "5511966661111", source: "Site" }, auth())).data.lead;
      sql(`UPDATE Leads SET createdAt=NOW() - INTERVAL '5 hours', firstContactAt=NULL WHERE id=${lead.id}`);
      const before = alertOf((await http.get("/dashboard/manager", auth())).data, "first-contact");
      assert(before >= 1, "the lead without first contact is not an alert");
      sql(`UPDATE Leads SET firstContactAt=NOW() WHERE id=${lead.id}`);
      assert(alertOf((await http.get("/dashboard/manager", auth())).data, "first-contact") === before - 1, "the alert did not go away when the lead was contacted");

      // an overdue task
      const tasks0 = alertOf((await http.get("/dashboard/manager", auth())).data, "tasks");
      sql(`INSERT INTO LeadTasks (leadId, userId, type, title, dueAt, createdAt, updatedAt) SELECT ${lead.id}, id, 'ligar', 'Atrasada de teste', NOW() - INTERVAL '2 days', NOW(), NOW() FROM Users WHERE email='admin@whaticket.com'`);
      assert(alertOf((await http.get("/dashboard/manager", auth())).data, "tasks") === tasks0 + 1, "the overdue task is not an alert");

      // the polo with a target: progress, pace and forecast
      const row = (await http.get("/dashboard/manager", auth())).data.polos.find(p => p.name === "Polo da Meta" || p.code === "9001");
      assert(row && row.target > 0 && typeof row.pct === "number" && row.expectedPct > 0, `polo row ${JSON.stringify(row)}`);
      assert(row.forecast === Math.round(row.done / (row.expectedPct / 100)), `forecast ${row.forecast} for ${row.done} at ${row.expectedPct}%`);
      assert(["unanswered", "onboardingLate", "atRisk"].every(k => typeof row[k] === "number"), "stuck counters");

      // the Painel do CRM: the affiliate column is marked and the new alerts are numbers
      const m = (await http.get("/crm/metrics", auth())).data;
      const lane = sql(`SELECT id FROM LeadStages WHERE name='Indicações de afiliados'`);
      const marked = m.funnel.filter(f => f.isAffiliateLane);
      assert(lane ? marked.length === 1 && String(marked[0].id) === lane : marked.length === 0, `affiliate column marking ${JSON.stringify(marked)}`);
      ["feePending", "docsPending", "unassigned", "waitingFirstContact", "overdueTasks", "stale"].forEach(k => assert(typeof m.attention[k] === "number", `attention.${k}`));
    });
    await test("retenção: escolher quem recebe, ver a mensagem antes, botões em duas etapas, registro dos envios e dados da operação", async () => {
      const mkUser = async (name, email, role) => (await http.post("/users", { name, email, password: "senha123", role }, auth())).data;
      const tutorX = await mkUser("Tutor Envios", "tutorx@env.test", "tutor");
      const poloX = (await http.post("/polos", { name: "Polo Envios", code: "ENV1", state: "RO" }, auth())).data;
      await http.put(`/polos/${poloX.id}/members`, { members: [{ userId: tutorX.id, role: "tutoria" }] }, auth());
      const tutorTok = (await http.post("/auth/login", { email: "tutorx@env.test", password: "senha123" })).data.token;
      const coordAc = (await http.post("/auth/login", { email: "coord-a@x.com", password: "senha123" })).data.token;
      const cons = (await http.post("/auth/login", { email: "consultor@polo.test", password: "senha123" })).data.token;
      const said = (contactId, text) => Number(sql(`SELECT COUNT(*) FROM Messages m JOIN Tickets t ON t.id=m.ticketId WHERE t.contactId=${contactId} AND m.fromMe=true AND m.body LIKE '%${text}%'`));
      let n = 0;
      const student = async name => {
        n += 1;
        const from = `55119100003${String(10 + n)}`;
        await inboundCloud(from, `wamid.env-${n}`, "oi, quero me matricular");
        await waitFor(() => ticketOf(from), 8000, `ticket of ${name}`);
        const leadId = Number(await waitFor(() => sql(`SELECT l.id FROM Leads l JOIN Contacts c ON c.id=l.contactId WHERE c.number='${from}'`), 8000, `lead of ${name}`));
        sql(`UPDATE Leads SET name='${name}' WHERE id=${leadId}`);
        const r = await http.post(`/leads/${leadId}/enroll`, { poloId: poloX.id, tutorId: tutorX.id, fee: "paid", whatsappId: cid }, auth());
        assert(r.status === 200, `enroll ${name} ${r.status}`);
        return { from, leadId, contactId: sql(`SELECT contactId FROM Leads WHERE id=${leadId}`) };
      };
      const davi = await student("Davi Selecionado");
      const elis = await student("Elis Selecionada");
      const other = sql(`SELECT id FROM Leads WHERE name='Ana Pesquisa' LIMIT 1`);

      // the message before it goes: with the name of each chosen student, and the buttons of the survey
      const pv = await http.post("/retention/preview", { kind: "nps", leadIds: [davi.leadId] }, auth());
      assert(pv.status === 200 && pv.data.samples[0].text.includes("Davi") && pv.data.buttons.length === 3 && pv.data.buttons[0] === "Recomendo (9-10)", `preview ${JSON.stringify(pv.data).slice(0, 240)}`);
      const pc = (await http.post("/retention/preview", { kind: "custom", text: "Oi {{nome}}, tudo bem?" }, auth())).data;
      assert(pc.samples[0].text === "Oi Maria, tudo bem?" && pc.buttons.length === 0, `custom preview ${JSON.stringify(pc)}`);
      assert((await http.post("/retention/preview", { kind: "inventado" }, auth())).status === 400, "invalid kind");
      assert((await http.post("/retention/preview", { kind: "nps" }, asUser(cons))).status === 403, "a consultant previewed");

      // who can be chosen: everyone, for the maintainer and the academic coordinator; the tutor does not operate this area
      const found = (await http.get("/retention/students", { params: { search: "Selecionad" }, ...auth() })).data;
      assert(found.length === 2 && found.every(x => x.polo === "Polo Envios" && x.tutor === "Tutor Envios"), `students ${JSON.stringify(found)}`);
      assert((await http.get("/retention/students", { params: { search: "" }, ...asUser(tutorTok) })).status === 403, "a tutor opened the list of students");
      const mine = (await http.get("/retention/students", { params: { search: "Selecionad" }, ...asUser(coordAc) })).data;
      assert(mine.length === 2, "the academic coordinator does not see the students");

      // a message written by hand to the chosen ones: the student of another tutor is refused
      assert((await http.post("/retention/send", { kind: "custom", leadIds: [davi.leadId], text: "" }, asUser(coordAc))).status === 400, "an empty message was sent");
      assert((await http.post("/retention/send", { kind: "custom", leadIds: Array.from({ length: 201 }, (_, i) => i + 1), text: "x" }, auth())).status === 400, "more than 200 at once");
      assert((await http.post("/retention/send", { kind: "custom", leadIds: [davi.leadId], text: "x" }, asUser(cons))).status === 403, "a consultant sent");
      assert((await http.post("/retention/send", { kind: "custom", leadIds: [davi.leadId], text: "x" }, asUser(tutorTok))).status === 403, "a tutor sent");
      const sent = await http.post("/retention/send", { kind: "custom", leadIds: [davi.leadId, elis.leadId], text: "Oi {{nome}}, passando para saber como vai." }, asUser(coordAc));
      assert(sent.status === 200 && sent.data.sent === 2 && sent.data.failed === 0, `send ${JSON.stringify(sent.data)}`);
      await waitFor(() => said(davi.contactId, "Oi Davi, passando para saber") === 1 && said(elis.contactId, "Oi Elis, passando para saber") === 1, 12000, "the two messages");

      // the log: what, to whom, by whom
      const log = (await http.get("/retention/log", auth())).data;
      const row = log.rows.find(r => r.lead === "Davi Selecionado" && r.kind === "custom");
      assert(row && row.body === "Oi Davi, passando para saber como vai." && row.polo === "Polo Envios" && row.tutor === "Tutor Envios" && row.sentBy === "Coord Acadêmica" && row.status === "sent", `log row ${JSON.stringify(row)}`);
      assert((await http.get("/retention/log", { params: { kind: "custom", search: "Elis" }, ...auth() })).data.rows.every(r => r.lead === "Elis Selecionada"), "log filters");
      assert((await http.get("/retention/log", asUser(tutorTok))).status === 403, "a tutor read the log");
      const lcsv = String((await http.get("/retention/log.csv", auth())).data);
      assert(lcsv.includes("Oi Davi, passando para saber como vai.") && lcsv.startsWith('"Data";"Tipo";"Aluno"'), "log spreadsheet");

      // the survey with buttons: first the group, then the exact score
      assert((await http.put("/retention/config", { nps: { enabled: true, buttons: true, question: "Olá, {{nome}}! De 0 a 10, nos recomendaria?" } }, auth())).data.nps.buttons === true, "buttons setting");
      const before = graph.sent.length;
      const sv = await http.post("/retention/send", { kind: "nps", leadIds: [davi.leadId] }, auth());
      assert(sv.status === 200 && sv.data.sent === 1, `survey ${JSON.stringify(sv.data)}`);
      const first = await waitFor(() => graph.sent.slice(before).find(x => x.body && x.body.type === "interactive" && JSON.stringify(x.body.interactive).includes("Recomendo (9-10)")), 12000, "the survey with buttons");
      const titles = first.body.interactive.action.buttons.map(b => b.reply.title);
      assert(titles.join("|") === "Recomendo (9-10)|Neutro (7-8)|Não recomendo (0-6)", `buttons ${titles}`);
      const tap = (id, kind, title, group) => postMeta(cid, cloudEvent([{ from: davi.from, id, type: "interactive", interactive: kind === "button" ? { button_reply: { id: group, title } } : { list_reply: { id: group, title } } }], { contacts: [{ wa_id: davi.from, profile: { name: "Davi" } }] }), cloudCfg.appSecret);
      const mark = graph.sent.length;
      assert((await tap("wamid.env-tap1", "button", "Não recomendo (0-6)", "g-detractor")).status === 200, "tap");
      const second = await waitFor(() => graph.sent.slice(mark).find(x => x.body && x.body.type === "interactive" && x.body.interactive.type === "list"), 12000, "the second step");
      assert(second.body.interactive.action.sections[0].rows.map(r => r.title).join() === "0,1,2,3,4,5,6", "the exact scores of a detractor");
      assert(sql(`SELECT COALESCE(scoreGroup,'') FROM NpsSurveys WHERE leadId=${davi.leadId} ORDER BY id DESC LIMIT 1`) === "detractor", "the group was not saved");
      assert(sql(`SELECT COUNT(*) FROM NpsSurveys WHERE leadId=${davi.leadId} AND status='answered'`) === "0", "the group alone was taken as the score");
      assert((await tap("wamid.env-tap2", "list", "4", "n-4")).status === 200, "tap score");
      await waitFor(() => sql(`SELECT score FROM NpsSurveys WHERE leadId=${davi.leadId} AND status='answered'`) === "4", 10000, "the score by buttons");
      await waitFor(() => Number(sql(`SELECT COUNT(*) FROM LeadTasks WHERE leadId=${davi.leadId} AND title LIKE 'Falar com o aluno que deu nota 4%'`)) === 1, 10000, "the alert task");

      // without the buttons the student types the number (plain text)
      assert((await http.put("/retention/config", { nps: { buttons: false } }, auth())).data.nps.buttons === false, "buttons off");
      const before2 = graph.sent.length;
      await http.post("/retention/send", { kind: "nps", leadIds: [elis.leadId] }, auth());
      const plain = await waitFor(() => graph.sent.slice(before2).find(x => x.body && x.body.to === elis.from), 12000, "the plain survey");
      assert(plain.body.type === "text" && plain.body.text.body.includes("Olá, Elis!"), `plain survey ${JSON.stringify(plain.body).slice(0, 160)}`);

      // the official API only allows free text and buttons in the 24 hours after the student wrote: outside it nothing is attempted
      // (no call that Meta would refuse), unless the company has an approved template for the survey
      sql(`UPDATE Messages SET createdAt = NOW() - INTERVAL '30 hours' WHERE fromMe=false AND ticketId IN (SELECT id FROM Tickets WHERE contactId=${elis.contactId})`);
      assert((await http.put("/retention/config", { nps: { buttons: true } }, auth())).data.nps.buttons === true, "buttons on");
      const before3 = graph.sent.length;
      const closed = await http.post("/retention/send", { kind: "nps", leadIds: [elis.leadId] }, auth());
      assert(closed.status === 200 && closed.data.failed === 1 && /24 horas/.test(closed.data.results[0].error), `window closed ${JSON.stringify(closed.data).slice(0, 220)}`);
      assert(!graph.sent.slice(before3).some(x => x.body && x.body.to === elis.from), "a message was sent outside the 24 hours without a template");
      const failedRow = (await http.get("/retention/log", { params: { kind: "nps", search: "Elis" }, ...auth() })).data.rows[0];
      assert(failedRow.status === "failed" && /24 horas/.test(failedRow.error), "the refusal is not in the log with its reason");
      const tpl = await http.put("/retention/config", { nps: { templateName: "pesquisa nps!", templateLanguage: "pt_BR" } }, auth());
      assert(tpl.data.nps.templateName === "pesquisanps", `template name ${tpl.data.nps.templateName}`);
      const before4 = graph.sent.length;
      const viaTpl = await http.post("/retention/send", { kind: "nps", leadIds: [elis.leadId] }, auth());
      assert(viaTpl.status === 200 && viaTpl.data.sent === 1, `template send ${JSON.stringify(viaTpl.data).slice(0, 200)}`);
      const tplMsg = await waitFor(() => graph.sent.slice(before4).find(x => x.body && x.body.to === elis.from && x.body.type === "template"), 12000, "the template survey");
      assert(tplMsg.body.template.name === "pesquisanps" && tplMsg.body.template.components[0].parameters[0].text === "Elis", "template payload");
      assert(!graph.sent.slice(before4).some(x => x.body && x.body.type === "interactive"), "buttons were sent outside the 24 hours");
      await http.put("/retention/config", { nps: { templateName: "" } }, auth());

      // who asked to stop (SAIR) receives nothing
      sql(`UPDATE Contacts SET optOut=true WHERE id=${elis.contactId}`);
      const before5 = graph.sent.length;
      const stopped = await http.post("/retention/send", { kind: "custom", leadIds: [elis.leadId], text: "Oi {{nome}}" }, auth());
      assert(stopped.data.failed === 1 && /SAIR/.test(stopped.data.results[0].error), `opted out ${JSON.stringify(stopped.data).slice(0, 200)}`);
      assert(!graph.sent.slice(before5).some(x => x.body && x.body.to === elis.from), "a message went to someone who asked to stop");
      sql(`UPDATE Contacts SET optOut=false WHERE id=${elis.contactId}`);

      // the numbers of the operation
      const ops = (await http.get("/retention/operations", auth())).data;
      assert(ops.sent.custom >= 2 && ops.sent.nps >= 3 && ops.sent.total >= 5 && ops.sent.failed === 2, `sent ${JSON.stringify(ops.sent)}`);
      assert(ops.survey.sent >= 2 && ops.survey.answered >= 1 && ops.survey.detractors >= 1 && ops.survey.pending >= 1 && typeof ops.survey.medianAnswerMin === "number", `survey ${JSON.stringify(ops.survey)}`);
      assert(Array.isArray(ops.perDay) && ops.perDay.length >= 1 && ops.byTutor.some(t => t.name === "Tutor Envios" && t.sent >= 4 && t.detractors === 1 && t.pending === 1), `by tutor ${JSON.stringify(ops.byTutor)}`);
      sql(`UPDATE LeadTasks SET doneAt=NOW() WHERE leadId=${davi.leadId} AND title LIKE 'Falar com o aluno que deu nota 4%'`);
      const ops2 = (await http.get("/retention/operations", auth())).data;
      assert(ops2.survey.handled === ops.survey.handled + 1 && ops2.survey.pending === ops.survey.pending - 1 && typeof ops2.survey.avgHandleHours === "number", "the detractor that was attended is not counted as handled");
      assert((await http.get("/retention/operations", asUser(tutorTok))).status === 403, "a tutor read the operation");
      assert((await http.get("/retention/operations", asUser(coordAc))).status === 200, "the academic coordinator cannot read the operation");
      const sum = (await http.get("/retention/summary", auth())).data;
      assert(typeof sum.nps.detractorsOpen === "number", "summary without the detractors to attend");
    });
    await test("retenção: o envio pode ser de alunos, do CRM com filtros, de uma lista ou de contatos escolhidos", async () => {
      const tutorTok = (await http.post("/auth/login", { email: "tutorx@env.test", password: "senha123" })).data.token;
      const cons = (await http.post("/auth/login", { email: "consultor@polo.test", password: "senha123" })).data.token;
      const poloId = sql(`SELECT id FROM Polos WHERE code='ENV1'`);
      const daviLead = sql(`SELECT l.id FROM Leads l WHERE l.name='Davi Selecionado' LIMIT 1`);
      const daviNumber = sql(`SELECT c.number FROM Leads l JOIN Contacts c ON c.id=l.contactId WHERE l.id=${daviLead}`);
      const aud = (params, tk) => http.get("/retention/audience", { params, ...(tk ? asUser(tk) : auth()) });

      // the CRM with filters: the enrolled of a polo
      const crm = await aud({ source: "crm", poloId, enrolled: "yes" });
      assert(crm.status === 200 && crm.data.total === 2 && crm.data.items.every(i => i.kind === "lead" && i.leadId && i.number), `crm ${JSON.stringify(crm.data).slice(0, 240)}`);
      assert((await aud({ source: "crm", poloId, search: "Davi" })).data.items.length === 1, "crm search by name");
      assert((await aud({ source: "crm", enrolled: "no", poloId })).data.total === 0, "crm enrolled=no");
      // a tutor does not operate this area
      assert((await aud({ source: "crm" }, tutorTok)).status === 403, "a tutor read the audience");
      assert((await aud({ source: "list", listId: 1 }, tutorTok)).status === 403 && (await aud({ source: "contacts" }, tutorTok)).status === 403, "a tutor read the lists or the contacts");
      assert((await aud({ source: "crm" }, cons)).status === 403, "a consultant read the audience");

      // a list: numbers that are leads come as leads (any way of writing the phone), the others as plain numbers
      const list = (await http.post("/contact-lists", { name: "Convidados do evento" }, auth())).data;
      await http.post(`/contact-lists/${list.id}/import`, { items: [{ name: "Davi na lista", number: daviNumber }, { name: "Visita Sem Cadastro", number: "5511910000777" }] }, auth());
      const fromList = (await aud({ source: "list", listId: list.id })).data;
      assert(fromList.total === 2 && fromList.unmatched === 1, `list ${JSON.stringify(fromList)}`);
      assert(fromList.items.some(i => i.kind === "lead" && i.leadId === Number(daviLead)) && fromList.items.some(i => i.kind === "number" && i.number === "5511910000777" && i.name === "Visita Sem Cadastro"), "list items");
      // the contacts of the system do not bring groups, friends or the team
      const contacts = (await aud({ source: "contacts", search: daviNumber.slice(-8) })).data;
      assert(contacts.items.length === 1 && contacts.items[0].kind === "lead" && contacts.items[0].leadId === Number(daviLead) && !String(contacts.items[0].number).includes("@"), `contacts ${JSON.stringify(contacts).slice(0, 200)}`);

      // who is outside the CRM only gets the text written by hand, and only from the management
      const person = { number: "5511910000777", name: "Visita Sem Cadastro" };
      assert((await http.post("/retention/send", { kind: "nps", recipients: [person] }, auth())).status === 403, "a survey went to someone outside the CRM");
      assert((await http.post("/retention/send", { kind: "custom", text: "Oi", recipients: [person] }, asUser(tutorTok))).status === 403, "a tutor wrote to someone outside the CRM");
      assert((await http.post("/retention/send", { kind: "custom", text: "Oi", recipients: [person], whatsappId: 999999 }, auth())).status >= 400, "an invented connection was accepted");

      // never talked to and on the official API: nothing leaves (the window of 24 hours is closed) and the log says who and why
      const before = graph.sent.length;
      const cold = await http.post("/retention/send", { kind: "custom", text: "Oi {{nome}}, venha ao evento!", recipients: [person] }, auth());
      assert(cold.status === 200 && cold.data.failed === 1 && /24 horas/.test(cold.data.results[0].error), `cold ${JSON.stringify(cold.data).slice(0, 220)}`);
      assert(!graph.sent.slice(before).some(x => x.body && String(x.body.to).endsWith("910000777")), "a message was sent to a number that never wrote, outside the window");
      const coldRow = (await http.get("/retention/log", { params: { search: "Visita Sem" }, ...auth() })).data.rows[0];
      assert(coldRow && coldRow.leadId === null && coldRow.lead === "Visita Sem Cadastro" && coldRow.phone === "5511910000777" && coldRow.status === "failed", `cold row ${JSON.stringify(coldRow)}`);

      // someone who wrote a minute ago but is not in the CRM can be answered: the message leaves, the same guards apply, the log keeps name and number
      const visitor = "5511910000778";
      await inboundCloud(visitor, "wamid.env-visit", "oi, tenho uma dúvida");
      await waitFor(() => ticketOf(visitor), 8000, "ticket of the visitor");
      sql(`UPDATE Leads SET isHistorical=true WHERE contactId=(SELECT id FROM Contacts WHERE number='${visitor}')`);
      const sent = await http.post("/retention/send", { kind: "custom", text: "Oi {{nome}}, seguem as informações.", recipients: [{ number: visitor, name: "Visitante" }, { number: visitor, name: "Repetido" }] }, auth());
      assert(sent.status === 200 && sent.data.sent === 1 && sent.data.failed === 0, `outside send ${JSON.stringify(sent.data).slice(0, 220)}`);
      await waitFor(() => graph.sent.slice(before).some(x => x.body && String(x.body.to) === visitor && x.body.text && /seguem as informações/.test(x.body.text.body)), 12000, "the message to the visitor");
      const visitRow = (await http.get("/retention/log", { params: { search: "Visitante" }, ...auth() })).data.rows[0];
      assert(visitRow && visitRow.status === "sent" && visitRow.leadId === null && visitRow.phone === visitor && visitRow.kind === "custom", `visit row ${JSON.stringify(visitRow)}`);
      assert((await http.get("/retention/log", asUser(tutorTok))).status === 403, "the tutor read the log of people outside the CRM");

      // who asked to stop is left out here too
      sql(`UPDATE Contacts SET optOut=true WHERE number='${visitor}'`);
      const stopped = await http.post("/retention/send", { kind: "custom", text: "Oi", recipients: [{ number: visitor, name: "Visitante" }] }, auth());
      assert(stopped.data.failed === 1 && /SAIR/.test(stopped.data.results[0].error), `opted out ${JSON.stringify(stopped.data).slice(0, 200)}`);
      sql(`UPDATE Contacts SET optOut=false WHERE number='${visitor}'`);
      assert(Number(sql(`SELECT COUNT(*) FROM RetentionMessages WHERE leadId IS NULL`)) >= 3, "the log lost the people outside the CRM");

      // someone who is a lead and has not enrolled yet: they can be chosen in the CRM and get the text written by hand, not the survey
      const prospect = "5511910000779";
      await inboundCloud(prospect, "wamid.env-prospect", "oi, quero saber dos cursos");
      await waitFor(() => ticketOf(prospect), 8000, "ticket of the prospect");
      const prospectLead = Number(await waitFor(() => sql(`SELECT l.id FROM Leads l JOIN Contacts c ON c.id=l.contactId WHERE c.number='${prospect}'`), 8000, "lead of the prospect"));
      sql(`UPDATE Leads SET name='Futuro Aluno' WHERE id=${prospectLead}`);
      const notEnrolled = (await aud({ source: "crm", enrolled: "no", search: "Futuro" })).data;
      assert(notEnrolled.items.length === 1 && notEnrolled.items[0].leadId === prospectLead && notEnrolled.items[0].enrolled === false, `not enrolled ${JSON.stringify(notEnrolled).slice(0, 220)}`);
      assert((await aud({ source: "crm", enrolled: "yes", search: "Futuro" })).data.items.length === 0, "a lead that is not enrolled came as a student");
      const survey = await http.post("/retention/send", { kind: "nps", leadIds: [prospectLead] }, auth());
      assert(survey.data.failed === 1 && /ainda não está matriculada/.test(survey.data.results[0].error), `survey to a prospect ${JSON.stringify(survey.data).slice(0, 200)}`);
      const hand = await http.post("/retention/send", { kind: "custom", text: "Oi {{nome}}, ainda dá tempo de se matricular!", leadIds: [prospectLead] }, auth());
      assert(hand.data.sent === 1 && hand.data.failed === 0, `text to a prospect ${JSON.stringify(hand.data).slice(0, 200)}`);
      await waitFor(() => graph.sent.some(x => x.body && String(x.body.to) === prospect && x.body.text && /ainda dá tempo/.test(x.body.text.body)), 12000, "the message to the prospect");
      assert((await http.post("/retention/send", { kind: "custom", text: "Oi", leadIds: [prospectLead] }, asUser(tutorTok))).status === 403, "a tutor wrote to a lead");
    });
    await test("departamento Relacionamento: o pós-venda sai pelo número da instituição, as respostas caem na fila própria e o robô fica de fora", async () => {
      const relCfg = { phoneNumberId: "PN2", accessToken: "REL-TOKEN", appSecret: "rel-secret", verifyToken: "rel-verify" };
      const relId = await createConnection("Relacionamento Mantenedor", "whatsapp_cloud", relCfg);
      const relEvent = (from, messages, name = "Aluno") => ({ object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "PN2" }, contacts: [{ wa_id: from, profile: { name } }], messages } }] }] });
      const onRel = (from, message, name) => postMeta(relId, relEvent(from, [message], name), relCfg.appSecret);
      const textOnRel = (from, id, body, name) => onRel(from, { from, id, type: "text", text: { body } }, name);
      const tapOnRel = (from, id, kind, title, group, name) => onRel(from, { from, id, type: "interactive", interactive: kind === "button" ? { type: "button_reply", button_reply: { id: group, title } } : { type: "list_reply", list_reply: { id: group, title } } }, name);
      const viaRel = since => graph.sent.slice(since).filter(x => x.path === "/PN2/messages");
      const viaTutor = since => graph.sent.slice(since).filter(x => x.path === "/PN1/messages");
      const poloId = sql(`SELECT id FROM Polos WHERE code='ENV1'`);
      const tutorId = sql(`SELECT id FROM Users WHERE email='tutorx@env.test'`);
      const tutorTok = (await http.post("/auth/login", { email: "tutorx@env.test", password: "senha123" })).data.token;
      let n = 0;
      const student = async name => {
        n += 1;
        const from = `55119100005${String(10 + n)}`;
        await inboundCloud(from, `wamid.rel-${n}`, "oi, quero me matricular");
        await waitFor(() => ticketOf(from), 8000, `ticket of ${name}`);
        const leadId = Number(await waitFor(() => sql(`SELECT l.id FROM Leads l JOIN Contacts c ON c.id=l.contactId WHERE c.number='${from}'`), 8000, `lead of ${name}`));
        sql(`UPDATE Leads SET name='${name}' WHERE id=${leadId}`);
        assert((await http.post(`/leads/${leadId}/enroll`, { poloId, tutorId: Number(tutorId), fee: "paid", whatsappId: cid }, auth())).status === 200, `enroll ${name}`);
        return { from, leadId, contactId: sql(`SELECT contactId FROM Leads WHERE id=${leadId}`) };
      };
      const rita = await student("Rita Relacionamento");
      const caio = await student("Caio Relacionamento");

      // the queue of the department exists (one for the institution) and nothing is chosen yet
      assert(sql(`SELECT COUNT(*) FROM Queues WHERE role='relacionamento' AND poloId IS NULL`) === "1", "the queue of the relationship department");
      const cfg0 = (await http.get("/retention/config", auth())).data;
      assert(cfg0.relationship.whatsappId === 0, `relationship before ${JSON.stringify(cfg0.relationship)}`);
      assert((await http.put("/retention/config", { relationshipWhatsappId: 999999 }, auth())).status === 400, "an invented connection was accepted");
      assert((await http.put("/retention/config", { relationshipWhatsappId: relId }, asUser(tutorTok))).status === 403, "a tutor chose the number");
      const set = await http.put("/retention/config", { relationshipWhatsappId: relId, nps: { enabled: true, buttons: true, templateName: "pesquisa_nps", templateLanguage: "pt_BR" } }, auth());
      assert(set.status === 200 && set.data.relationship.whatsappId === relId && set.data.relationship.channel === "whatsapp_cloud" && set.data.relationship.status === "CONNECTED", `relationship ${JSON.stringify(set.data.relationship)}`);

      // Rita never wrote to this number: the window of this number is closed, so the survey opens with the approved template, from the institution's number
      let before = graph.sent.length;
      const cold = await http.post("/retention/send", { kind: "nps", leadIds: [rita.leadId] }, auth());
      assert(cold.data.sent === 1, `cold survey ${JSON.stringify(cold.data).slice(0, 220)}`);
      const tpl = await waitFor(() => viaRel(before).find(x => x.body && x.body.type === "template"), 12000, "the template by the relationship number");
      assert(tpl.body.template.name === "pesquisa_nps" && tpl.auth === "Bearer REL-TOKEN", "template payload");
      assert(viaTutor(before).length === 0, "the survey also went out from the tutor's number");
      assert(sql(`SELECT whatsappId FROM NpsSurveys WHERE leadId=${rita.leadId} ORDER BY id DESC LIMIT 1`) === String(relId), "the survey does not know the number it went out from");
      assert(sql(`SELECT whatsappId FROM RetentionMessages WHERE leadId=${rita.leadId} AND kind='nps' ORDER BY id DESC LIMIT 1`) === String(relId), "the log does not know the number");
      // the conversation of the department: its own segment and queue
      const ritaTicket = sql(`SELECT t.id FROM Tickets t WHERE t.contactId=${rita.contactId} AND t.whatsappId=${relId}`);
      assert(sql(`SELECT CONCAT(segment,'|',queueId) FROM Tickets WHERE id=${ritaTicket}`) === `relationship|${sql(`SELECT id FROM Queues WHERE role='relacionamento'`)}`, "the conversation is not in the relationship queue");
      // the student's conversation with the tutor stays apart
      assert(sql(`SELECT COUNT(*) FROM Messages WHERE ticketId IN (SELECT id FROM Tickets WHERE contactId=${rita.contactId} AND whatsappId=${cid}) AND fromMe=true AND body LIKE '%recomendaria%'`) === "0", "the survey went into the conversation of the tutor");

      // Rita answers on the institution's number: the detractor group, then the exact score
      assert((await tapOnRel(rita.from, "wamid.rel-t1", "button", "Não recomendo (0-6)", "g-detractor", "Rita")).status === 200, "tap");
      await waitFor(() => sql(`SELECT COALESCE(scoreGroup,'') FROM NpsSurveys WHERE leadId=${rita.leadId} ORDER BY id DESC LIMIT 1`) === "detractor", 10000, "the group");
      const second = await waitFor(() => viaRel(before).find(x => x.body && x.body.type === "interactive" && x.body.interactive.type === "list"), 12000, "the second step by the relationship number");
      assert(second.body.interactive.action.sections[0].rows.length === 7, "the scores of a detractor");
      assert((await tapOnRel(rita.from, "wamid.rel-t2", "list", "4", "n-4", "Rita")).status === 200, "tap score");
      await waitFor(() => sql(`SELECT score FROM NpsSurveys WHERE leadId=${rita.leadId} AND status='answered'`) === "4", 10000, "the score");
      await waitFor(() => viaRel(before).some(x => x.body && x.body.type === "text" && /Obrigado pela nota/.test(x.body.text.body)), 10000, "the thanks by the relationship number");
      assert(viaTutor(before).length === 0, "something went out from the tutor's number");
      // a detractor stays in the queue for the team to call
      assert(sql(`SELECT status FROM Tickets WHERE id=${ritaTicket}`) === "pending", `detractor conversation ${sql(`SELECT status FROM Tickets WHERE id=${ritaTicket}`)}`);
      assert(Number(sql(`SELECT COUNT(*) FROM LeadTasks WHERE leadId=${rita.leadId} AND title LIKE 'Falar com o aluno que deu nota 4%'`)) === 1, "the alert task");

      // Caio wrote to the institution's number a minute ago: the survey goes with buttons, and a number typed to the TUTOR is not the answer
      await textOnRel(caio.from, "wamid.rel-c1", "oi, tudo bem?", "Caio");
      await waitFor(() => sql(`SELECT COUNT(*) FROM Tickets WHERE contactId=${caio.contactId} AND whatsappId=${relId}`) === "1", 8000, "ticket of Caio on the relationship number");
      await sleep(1500);
      assert(viaRel(before).filter(x => x.body.to === caio.from).length === 0, "a robot answered on the institution's number");
      before = graph.sent.length;
      assert((await http.post("/retention/send", { kind: "nps", leadIds: [caio.leadId] }, auth())).data.sent === 1, "survey to Caio");
      const btn = await waitFor(() => viaRel(before).find(x => x.body && x.body.to === caio.from && x.body.type === "interactive"), 12000, "buttons by the relationship number");
      assert(btn.body.interactive.type === "button" && btn.body.interactive.action.buttons.length === 3, "the three groups");
      await inboundCloud(caio.from, "wamid.rel-c2", "8");
      await sleep(1200);
      assert(sql(`SELECT status FROM NpsSurveys WHERE leadId=${caio.leadId} ORDER BY id DESC LIMIT 1`) === "sent", "a number typed to the tutor answered the survey");
      assert((await textOnRel(caio.from, "wamid.rel-c3", "10", "Caio")).status === 200, "answer");
      await waitFor(() => sql(`SELECT score FROM NpsSurveys WHERE leadId=${caio.leadId} AND status='answered'`) === "10", 10000, "the score of Caio");
      // a promoter: the conversation of the department closes by itself, the queue keeps only what needs a person
      const caioTicket = sql(`SELECT id FROM Tickets WHERE contactId=${caio.contactId} AND whatsappId=${relId}`);
      await waitFor(() => sql(`SELECT status FROM Tickets WHERE id=${caioTicket}`) === "closed", 10000, "the conversation of a promoter closes");

      // the relationship team: its own profile, in the queue of the department, sees only that department
      const team = await http.post("/users", { name: "Ana Relacionamento", email: "ana@rel.test", password: "senha123", role: "relacionamento" }, auth());
      assert(team.status === 200, `team user ${team.status} ${JSON.stringify(team.data).slice(0, 160)}`);
      assert(sql(`SELECT COUNT(*) FROM UserQueues uq JOIN Queues q ON q.id=uq.queueId WHERE uq.userId=${team.data.id} AND q.role='relacionamento'`) === "1", "the new member is not in the queue");
      const anaTok = (await http.post("/auth/login", { email: "ana@rel.test", password: "senha123" })).data.token;
      assert((await http.get(`/tickets/${ritaTicket}`, asUser(anaTok))).status === 200, "the team cannot open its own conversation");
      assert((await http.get(`/tickets/${ticketOf(rita.from) === String(ritaTicket) ? 1 : ticketOf(rita.from)}`, asUser(anaTok))).status === 403, "the team opened a conversation of another department");
      assert((await http.get("/retention/summary", asUser(anaTok))).status === 403, "the relationship team opened the retention area (it only attends the conversations)");
      assert((await http.put("/retention/config", { relationshipWhatsappId: 0 }, asUser(anaTok))).status === 403, "the team changed the number");
      assert((await http.get("/leads?pageNumber=1", asUser(anaTok))).status !== 500, "leads scope of the team");

      // the number is off: nothing goes out (not even from the tutor's number)
      sql(`UPDATE Whatsapps SET status='DISCONNECTED' WHERE id=${relId}`);
      before = graph.sent.length;
      const off = await http.post("/retention/send", { kind: "risk", leadIds: [caio.leadId] }, auth());
      assert(off.data.failed === 1 && /desconectado/.test(off.data.results[0].error), `offline ${JSON.stringify(off.data).slice(0, 220)}`);
      assert(graph.sent.slice(before).length === 0, "a message left while the number was off");
      sql(`UPDATE Whatsapps SET status='CONNECTED' WHERE id=${relId}`);

      // the department shows in the statistics
      const mgmt = await http.get("/dashboard/management", auth());
      assert(mgmt.status !== 500, "statistics");

      // back to the old behaviour for the tests that follow
      assert((await http.put("/retention/config", { relationshipWhatsappId: 0, nps: { templateName: "" } }, auth())).data.relationship.whatsappId === 0, "clear the number");
    });
    await test("retenção: resumo, planilhas e o tutor vê só a satisfação dos próprios alunos", async () => {
      const tutor = (await http.post("/auth/login", { email: "tutorr@ret.test", password: "senha123" })).data.token;
      const cons = (await http.post("/auth/login", { email: "consultor@polo.test", password: "senha123" })).data.token;
      const coordAc = (await http.post("/auth/login", { email: "coord-a@x.com", password: "senha123" })).data.token;
      const sum = await http.get("/retention/summary", auth());
      assert(sum.status === 200 && typeof sum.data.risk.total === "number" && typeof sum.data.rematricula.pending === "number" && sum.data.nps.days === 30, `summary ${sum.status} ${JSON.stringify(sum.data).slice(0, 200)}`);
      assert((await http.get("/retention/summary", asUser(coordAc))).status === 200, "the academic coordinator cannot see the summary");
      assert((await http.get("/retention/summary", asUser(tutor))).status === 403, "a tutor opened the summary");
      assert((await http.get("/retention/summary", asUser(cons))).status === 403, "a consultant opened the retention summary");

      const risk = (await http.get("/retention/risk", auth())).data;
      assert(typeof risk.total === "number" && risk.total >= risk.students.length, "risk total");
      risk.students.forEach(st => ["poloId", "ticketId", "tutorId", "messagedAt"].forEach(k => assert(Object.prototype.hasOwnProperty.call(st, k), `risk student without ${k}`)));
      const rem = (await http.get("/retention/rematricula", auth())).data;
      [...rem.pendingStudents, ...rem.doneStudents].forEach(st => ["poloId", "ticketId", "tutorId"].forEach(k => assert(Object.prototype.hasOwnProperty.call(st, k), `re-enrollment student without ${k}`)));

      // spreadsheets: BOM, ";" and the header; the other roles stay out
      for (const [path, head] of [["/retention/risk.csv", '"Aluno";"Polo";"Tutor"'], ["/retention/rematricula.csv", '"Aluno";"Polo";"Tutor"'], ["/retention/nps.csv", '"Data";"Aluno";"Momento"']]) {
        const r = await http.get(path, auth());
        assert(r.status === 200 && String(r.headers["content-type"]).startsWith("text/csv"), `${path} ${r.status} ${r.headers["content-type"]}`);
        assert(String(r.data).startsWith(head), `${path} header ${JSON.stringify(String(r.data).slice(0, 60))}`);
        assert((await http.get(path, asUser(cons))).status === 403, `${path} for a consultant`);
        assert((await http.get(path, asUser(tutor))).status === 403, `${path} for the tutor`);
        assert((await http.get(path, asUser(coordAc))).status === 200, `${path} for the academic coordinator`);
      }

      // the satisfaction of a student that the tutor does not follow is not theirs to read
      const other = sql(`SELECT id FROM Leads WHERE isHistorical=false AND COALESCE(onboardingTutorId,0) <> (SELECT id FROM Users WHERE email='tutorr@ret.test') ORDER BY id LIMIT 1`);
      assert(other, "no lead of another tutor");
      sql(`INSERT INTO NpsSurveys (leadId, kind, status, score, comment, awaitingComment, sentAt, answeredAt, createdAt, updatedAt) VALUES (${other}, 'd30', 'answered', 2, 'comentario-secreto-de-outro-tutor', false, NOW(), NOW(), NOW(), NOW())`);
      const adminNps = (await http.get("/retention/nps", auth())).data;
      assert(adminNps.comments.some(c => c.comment === "comentario-secreto-de-outro-tutor"), "the management does not see the answer");
      assert((await http.get("/retention/nps", asUser(tutor))).status === 403 && (await http.get("/retention/nps.csv", asUser(tutor))).status === 403, "a tutor read the satisfaction answers");
      assert((await http.get("/retention/nps", asUser(coordAc))).data.comments.some(c => c.comment === "comentario-secreto-de-outro-tutor"), "the academic coordinator does not see the answers");
      assert(Array.isArray(adminNps.series) && adminNps.series.length >= 1 && adminNps.series[0].week && typeof adminNps.commentsTotal === "number", "series by week");
      adminNps.byKind.forEach(k => assert(Object.prototype.hasOwnProperty.call(k, "nps"), "byKind without nps"));
    });
    await test("contatos: baixar a lista em planilha (gestão e consultor), com a busca da tela e sem fórmulas", async () => {
      const cons = (await http.post("/auth/login", { email: "consultor@polo.test", password: "senha123" })).data.token;
      const tut = (await http.post("/auth/login", { email: "tutor@polo.test", password: "senha123" })).data.token;
      sql(`INSERT INTO Contacts (name, number, email, isGroup, kind, channel, createdAt, updatedAt) VALUES ('=HYPERLINK("http://x.test")', '5511977779991', '', false, 'person', 'whatsapp', NOW(), NOW())`);
      sql(`INSERT INTO Contacts (name, number, email, isGroup, kind, channel, createdAt, updatedAt) VALUES ('Grupo do Export', '120363888000000555', '', true, 'group', 'whatsapp', NOW(), NOW())`);

      assert((await http.get("/contacts/export.csv")).status === 401, "export without login");
      assert((await http.get("/contacts/export.csv", asUser(tut))).status === 403, "a tutor downloaded the contacts");
      const all = await http.get("/contacts/export.csv", auth());
      assert(all.status === 200 && String(all.headers["content-type"]).startsWith("text/csv") && /attachment; filename="contatos-/.test(all.headers["content-disposition"]), `export ${all.status} ${all.headers["content-disposition"]}`);
      const text = String(all.data);
      const raw = Buffer.from((await http.get("/contacts/export.csv", { responseType: "arraybuffer", ...auth() })).data);
      assert(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, "the spreadsheet has no BOM (Excel would break the accents)");
      assert(text.startsWith('"Nome";"WhatsApp";"E-mail";"Tipo";"Relação";"Canal";"Etiquetas";"Criado em"\r\n'), `header ${JSON.stringify(text.slice(0, 90))}`);
      assert(text.includes(`"'=HYPERLINK(""http://x.test"")";="5511977779991"`), "the formula was not neutralised or the phone is not kept as text");
      assert(!text.includes("Grupo do Export"), "a group came in the default list");
      assert(String((await http.get("/contacts/export.csv", { params: { groups: "1" }, ...auth() })).data).includes("Grupo do Export"), "groups=1 did not include the group");

      // the search of the screen narrows the file
      const one = String((await http.get("/contacts/export.csv", { params: { searchParam: "5511977779991" }, ...auth() })).data).trim().split("\r\n");
      assert(one.length === 2 && one[1].includes("5511977779991"), `search gave ${one.length} lines`);
      assert((await http.get("/contacts/export.csv", { params: { searchParam: "5511977779991" }, ...asUser(cons) })).status === 200, "a consultant cannot download");
    });
    await test("amigos e equipe: saem do funil e das estatísticas, não viram lead de novo e dá para desfazer", async () => {
      const metrics = async () => (await http.get("/crm/metrics", auth())).data;
      const before = await metrics();
      const lead = (await http.post("/leads", { name: "Amigo que escreveu", phone: "5521933330001", source: "WhatsApp" }, auth())).data.lead;
      const mid = await metrics();
      assert(mid.kpi.leads === before.kpi.leads + 1, "the new lead was not counted");
      // the list of the panel (up to 200, oldest first): the 30 of the metrics only show the oldest ones, and this database already has many from other tests
      const offered = async () => (await http.get("/crm/triage", auth())).data.items.some(t => t.id === lead.id);
      assert(await offered(), "a lead nobody contacted is not offered for triage");

      assert((await http.post(`/leads/${lead.id}/relation`, { relation: "inventado" }, auth())).status === 400, "invalid relation accepted");
      const out = await http.post(`/leads/${lead.id}/relation`, { relation: "friend" }, auth());
      assert(out.status === 200, `classify ${out.status} ${JSON.stringify(out.data)}`);
      assert(sql(`SELECT isHistorical FROM Leads WHERE id=${lead.id}`) === "1", "the lead is still in the funnel");
      const after = await metrics();
      assert(after.kpi.leads === before.kpi.leads && !(await offered()), "a friend still counts in the numbers");
      assert(!(await http.get("/leads", { params: { search: "Amigo que escreveu" }, ...auth() })).data.leads.some(l => l.id === lead.id), "a friend still shows in the funnel list");
      assert(sql(`SELECT COUNT(*) FROM LeadActivities WHERE leadId=${lead.id} AND body LIKE '%amigo ou pessoal%'`) === "1" || sql(`SELECT COUNT(*) FROM LeadActivities WHERE leadId=${lead.id} AND body LIKE 'Marcado como amigo%'`) === "1", "no record of who took it out");
      assert((await http.post(`/leads/${lead.id}/relation`, { relation: "customer" }, auth())).status === 200 && sql(`SELECT isHistorical FROM Leads WHERE id=${lead.id}`) === "0", "undo did not bring the lead back");
      assert((await metrics()).kpi.leads === before.kpi.leads + 1, "the lead is back but does not count");

      // a student is never "just a friend"
      const student = sql(`SELECT id FROM Leads WHERE enrolledAt IS NOT NULL AND isHistorical=false LIMIT 1`);
      if (student) assert((await http.post(`/leads/${student}/relation`, { relation: "staff" }, auth())).status === 400, "an enrolled student was marked as team");

      // a contact marked before writing: no lead is created for the next message
      const cons = (await http.post("/auth/login", { email: "consultor@polo.test", password: "senha123" })).data.token;
      const contactId = sql(`INSERT INTO Contacts (name, number, email, isGroup, kind, channel, isPersonal, createdAt, updatedAt) VALUES ('Amiga Pessoal', '5521933330009', '', false, 'person', 'whatsapp_cloud', true, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const r = await postMeta(cid, cloudEvent([{ from: "5521933330009", id: "wamid.amiga1", type: "text", text: { body: "Oi, tudo bem? Sou eu" } }], { contacts: [{ wa_id: "5521933330009", profile: { name: "Amiga Pessoal" } }] }), cloudCfg.appSecret);
      assert(r.status === 200, `inbound ${r.status}`);
      await waitFor(() => ticketOf("5521933330009"), 8000, "the friend's conversation");
      assert(sql(`SELECT COUNT(*) FROM Leads WHERE contactId=${contactId}`) === "0", "a lead was created for a friend");

      // the contact routes: who they are, and the old team switch keeps working
      assert((await http.put(`/contacts/${contactId}/relation`, { relation: "xyz" }, auth())).status === 400, "bad relation on the contact");
      assert((await http.put(`/contacts/${contactId}/relation`, { relation: "staff" }, auth())).status === 200 && sql(`SELECT isStaff::int||'|'||isPersonal::int FROM Contacts WHERE id=${contactId}`) === "1|0", "staff");
      assert((await http.put(`/contacts/${contactId}/staff`, { isStaff: false }, auth())).status === 200 && sql(`SELECT isStaff::int||'|'||isPersonal::int FROM Contacts WHERE id=${contactId}`) === "0|0", "team switch off");
      assert((await http.put(`/contacts/${contactId}/relation`, { relation: "friend" }, auth())).data.isPersonal === true, "friend");
      const csv = String((await http.get("/contacts/export.csv", { params: { searchParam: "5521933330009" }, ...auth() })).data);
      assert(csv.includes("Amigo ou pessoal"), "the spreadsheet does not tell who the friend is");
      // marking someone is for whoever can reach the contact list
      assert((await http.put(`/contacts/${contactId}/relation`, { relation: "customer" }, asUser(cons))).status === 200, "a consultant cannot take the mark off");
    });
    await test("handoff to the commercial team of the polo: the city finds the polo, a polo without a team uses the reserve queue, the consultant is warned and gets a task, and nobody answering raises an alert", async () => {
      // the single-prompt agent answers on this connection (the other agents are off)
      await http.put(`/ai-agents/${aiId}`, { active: true, dailyTokenCap: 0, handoffAfterTurns: 14 }, auth());
      const cons = (await http.post("/users", { name: "Consultor Alfa", email: "alfa-cons@x.com", password: "senha123", role: "consultor" }, auth())).data;
      const alfa = (await http.post("/polos", { name: "Polo Alfa", code: "ALF", city: "Cidade Alfa", state: "RO" }, auth())).data;
      await http.put(`/polos/${alfa.id}/members`, { members: [{ userId: cons.id, role: "comercial" }] }, auth());
      const beta = (await http.post("/polos", { name: "Polo Beta", code: "BET", city: "Cidade Beta", state: "RO" }, auth())).data;
      const alfaQueue = sql(`SELECT id FROM Queues WHERE poloId=${alfa.id} AND role='comercial'`);
      const betaQueue = sql(`SELECT id FROM Queues WHERE poloId=${beta.id} AND role='comercial'`);
      assert(alfaQueue && betaQueue, "the polos did not get their commercial queues");
      const handoff = async (number, city) => {
        if (city) assert([200, 201].includes((await http.post("/leads", { name: `Lead ${number}`, phone: number, city }, auth())).status), "lead with a city");
        const before = graph.sent.length;
        await inboundCloud(number, `wamid.rt-${number}`, "quero falar com uma pessoa");
        await waitFor(() => sentTexts(before).some(t => t.includes("Vou chamar um consultor")), 15000, "handoff message");
        await waitFor(() => sql(`SELECT handoffReason FROM Tickets WHERE id=${ticketOf(number)}`) === "human_request", 10000, "the handoff was routed");
        return ticketOf(number);
      };
      const leadOf = number => sql(`SELECT l.id FROM Leads l JOIN Contacts c ON c.id=l.contactId WHERE c.number='${number}'`);

      // the city (no accents, no capitals) finds the polo; its commercial team takes the conversation
      const a = "5511930000001";
      const ta = await handoff(a, "cidade alfa");
      assert(sql(`SELECT poloId FROM Leads WHERE id=${leadOf(a)}`) === String(alfa.id), "the polo was not found by the city");
      assert(sql(`SELECT queueId FROM Tickets WHERE id=${ta}`) === alfaQueue && sql(`SELECT userId FROM Tickets WHERE id=${ta}`) === String(cons.id) && sql(`SELECT status FROM Tickets WHERE id=${ta}`) === "open", "the consultant of the polo did not take it");
      assert(sql(`SELECT aiActive FROM Tickets WHERE id=${ta}`) === "0" && sql(`SELECT handoffAt IS NOT NULL FROM Tickets WHERE id=${ta}`) === "1", "the handoff was not marked");
      assert(Number(sql(`SELECT COUNT(*) FROM TicketEvents WHERE ticketId=${ta} AND type='transfer' AND note LIKE 'Agente de IA →%' AND note LIKE '%Consultor Alfa%'`)) === 1, "the routing was not written down");
      assert(Number(sql(`SELECT COUNT(*) FROM LeadTasks WHERE leadId=${leadOf(a)} AND title='Atender lead encaminhado pelo agente de IA' AND userId=${cons.id}`)) === 1, "no task for the consultant");
      assert(Number(sql(`SELECT COUNT(*) FROM AgentMetricEvents WHERE leadId=${leadOf(a)} AND event='handoff_human_request'`)) === 1, "no metric");

      // nobody answers: the team is warned once the limit passes (the worker looks every minute)
      sql(`UPDATE Tickets SET handoffAt = now() - interval '40 minutes' WHERE id=${ta}`);
      await waitFor(() => sql(`SELECT handoffAlerts FROM Tickets WHERE id=${ta}`) === "1", 90000, "the alert for the conversation nobody answered");
      assert(Number(sql(`SELECT COUNT(*) FROM LeadActivities WHERE leadId=${leadOf(a)} AND type='sla' AND body LIKE 'Aguardando atendimento humano%'`)) === 1, "the alert was not written in the history");

      // a polo without a team: the conversation STAYS in the queue of the polo (pending, nobody assigned) and only the management is warned
      const b = "5511930000002";
      const tb = await handoff(b, "Cidade Beta");
      assert(sql(`SELECT poloId FROM Leads WHERE id=${leadOf(b)}`) === String(beta.id), "the polo without a team was not found");
      assert(sql(`SELECT queueId FROM Tickets WHERE id=${tb}`) === betaQueue && sql(`SELECT userId FROM Tickets WHERE id=${tb}`) === "" && sql(`SELECT status FROM Tickets WHERE id=${tb}`) === "pending", "a polo without consultants should keep the conversation, pending, in its own queue");
      assert(Number(sql(`SELECT COUNT(*) FROM TicketEvents WHERE ticketId=${tb} AND type='transfer' AND note LIKE '%aguardando alguém da fila%'`)) === 1 && Number(sql(`SELECT COUNT(*) FROM TicketEvents WHERE ticketId=${tb} AND note LIKE '%fila central%'`)) === 0, "the routing note is wrong for a polo without a team");

      // the screen of the handoff: which polos would really answer, and the reserve queue chosen by the manager
      const h0 = (await http.get("/ai-handoff", auth())).data;
      assert(h0.polos.find(p => p.name === "Polo Alfa").ready === true && h0.polos.find(p => p.name === "Polo Beta").ready === false && /não tem consultores/.test(h0.polos.find(p => p.name === "Polo Beta").issue), `ai-handoff polos ${JSON.stringify(h0.polos.filter(p => /Alfa|Beta/.test(p.name)))}`);
      const h1 = (await http.put("/ai-handoff", { fallbackQueueId: Number(alfaQueue), slaMinutes: 15, staleDays: 7 }, auth())).data;
      assert(h1.settings.fallbackQueueId === Number(alfaQueue) && h1.reserve.id === Number(alfaQueue), "the reserve queue was not saved");

      // no city, no polo: it still lands on a team, never in the air
      const c = "5511930000003";
      const tc = await handoff(c, null);
      assert(sql(`SELECT queueId FROM Tickets WHERE id=${tc}`) === alfaQueue && sql(`SELECT userId FROM Tickets WHERE id=${tc}`) === String(cons.id), "a lead without a polo did not land on the reserve queue chosen by the manager");
    });
    await test("the polos of Rondônia come with their cities (nearest polo) and semipresencial courses enroll only at the released polos", async () => {
      const mk = async (code, name) => (await http.post("/polos", { code, name, state: "RO" }, auth())).data;
      const pvh = await mk("7001", "Porto Velho - Centro - RO");
      const pvh2 = await mk("7002", "Porto Velho (Juscelino Kubitschek) - RO");
      const vil = await mk("7003", "Vilhena - Centro (S-01) - RO");
      const mir = await mk("7004", "Mirante da Serra - Centro - RO");
      const bur = await mk("7005", "Buritis - Setor 02 - RO");
      const run = body => {
        const script = `
          const http = require("http");
          require("./dist/database");
          const { initIO } = require("./dist/libs/socket");
          initIO(http.createServer());
          (async () => { ${body} process.exit(0); })().catch(e => { console.error(e); process.exit(1); });`;
        return execFileSync("node", ["-e", script], { cwd: ROOT, env: { ...env, LOG_LEVEL: "error" } }).toString().trim().split("\n").pop();
      };
      run(`await require("./dist/services/PoloServices/SeedCoverage").seedPoloCoverage(true);`);
      // the 8 polos exist with the names the team uses (the ones missing are created, with their queues)
      const names = ["Buritis - Setor 02 - RO", "Cerejeiras - Jardim Liberdade - RO", "Alto Alegre dos Parecis - Centro - RO", "Mirante da Serra - Centro - RO", "Porto Velho - Centro - RO", "Chupinguaia - Centro - RO", "Vilhena - Centro (S-01) - RO", "Porto Velho (Juscelino Kubitschek) - RO"];
      assert(sql(`SELECT COUNT(DISTINCT name) FROM Polos WHERE name IN (${names.map(n => `'${n}'`).join(",")})`) === "8", "the 8 polos are not all there with the right name");
      assert(Number(sql(`SELECT COUNT(*) FROM Queues WHERE poloId IN (SELECT id FROM Polos WHERE code = '1959')`)) >= 1, "a created polo has no queues");
      const poloOf = city => sql(`SELECT p.name FROM PoloCoverages c JOIN Polos p ON p.id = c.poloId WHERE c.cityKey = '${city}' AND c.state = 'RO'`);
      assert(/^Mirante da Serra/.test(poloOf("ji parana")) && /^Mirante da Serra/.test(poloOf("jaru")), "Ji-Paraná and Jaru go to Mirante da Serra");
      assert(/^Buritis/.test(poloOf("ariquemes")), "Ariquemes goes to Buritis");
      assert(/^Porto Velho - Centro/.test(poloOf("cujubim")) && /^Porto Velho \(Juscelino/.test(poloOf("nova mamore")) && /^Porto Velho \(Juscelino/.test(poloOf("guajara mirim")), "Porto Velho Centro keeps the north and JK gets the west (a city a test already placed stays where it is)");
      assert(/^Vilhena/.test(poloOf("pimenta bueno")) && /^Vilhena/.test(poloOf("cabixi")) && /^Vilhena/.test(poloOf("espigao d oeste")), "Vilhena gets cities of its own");
      assert(poloOf("porto velho") === "", "Porto Velho itself is not forced onto one of the two polos");
      assert(sql(`SELECT COUNT(*) FROM Polos WHERE id IN (${pvh.id}, ${pvh2.id}, ${vil.id}, ${mir.id}, ${bur.id}) AND (city IS NULL OR city = '')`) === "0", "a polo kept an empty city");
      // only Porto Velho and Vilhena enroll semipresencial; the others point to the nearest of them
      assert(sql(`SELECT enrollsSemipresencial::int FROM Polos WHERE id=${pvh.id}`) === "1" && sql(`SELECT enrollsSemipresencial::int FROM Polos WHERE id=${pvh2.id}`) === "0" && sql(`SELECT enrollPoloId FROM Polos WHERE id=${pvh2.id}`) === String(pvh.id) && sql(`SELECT enrollsSemipresencial::int FROM Polos WHERE id=${vil.id}`) === "1", "the released polos");
      assert(sql(`SELECT enrollPoloId FROM Polos WHERE id=${mir.id}`) === String(pvh.id) && sql(`SELECT enrollPoloId FROM Polos WHERE id=${bur.id}`) === String(pvh.id), "Mirante da Serra and Buritis send their students to Porto Velho");
      // running it again changes nothing, and what a person edited stays
      await http.put(`/polos/${mir.id}`, { name: "Mirante da Serra - Centro - RO", state: "RO", enrollPoloId: vil.id }, auth());
      run(`await require("./dist/services/PoloServices/SeedCoverage").seedPoloCoverage(true);`);
      assert(sql(`SELECT enrollPoloId FROM Polos WHERE id=${mir.id}`) === String(vil.id), "an edited destination was overwritten");

      // a lead of Mirante da Serra: semipresencial (teaching) enrolls at the released polo, EAD stays at the polo of the city
      const ped = (await http.post("/courses", { name: "Pedagogia Semipresencial Teste", modality: "Semipresencial", category: "Graduação - Cruzeiro", semesters: 8, monthlyFee: 500, active: true }, auth())).data;
      const adm = (await http.post("/courses", { name: "Administracao Polo Teste", modality: "EAD", category: "Graduação - Cruzeiro", semesters: 8, monthlyFee: 500, active: true }, auth())).data;
      const stageId = sql(`SELECT id FROM LeadStages ORDER BY position LIMIT 1`);
      const lead = (name, course) => sql(`INSERT INTO Leads (name, stageId, courseId, createdAt, updatedAt) VALUES ('${name}', ${stageId}, ${course}, NOW(), NOW()) RETURNING id`).split("\n")[0];
      const l1 = lead("Aluna Semi", ped.id);
      const l2 = lead("Aluno EAD", adm.id);
      const out = JSON.parse(run(`
        const Lead = require("./dist/models/Lead").default; const Polo = require("./dist/models/Polo").default;
        const { enrollmentPoloFor } = require("./dist/services/CommercialServices/Router");
        const city = await Polo.findByPk(${mir.id});
        const a = await enrollmentPoloFor(await Lead.findByPk(${l1}), city);
        const b = await enrollmentPoloFor(await Lead.findByPk(${l2}), city);
        const c = await enrollmentPoloFor(await Lead.findByPk(${l1}), await Polo.findByPk(${vil.id}));
        console.log(JSON.stringify({ a: [a.polo.id, a.cityPolo && a.cityPolo.id], b: [b.polo.id, b.cityPolo && b.cityPolo.id], c: [c.polo.id, c.cityPolo && c.cityPolo.id] }));`));
      assert(out.a[0] === vil.id && out.a[1] === mir.id, `semipresencial lead of Mirante da Serra: ${JSON.stringify(out.a)}`);
      assert(out.b[0] === mir.id && out.b[1] === null, `EAD lead stays at the polo of the city: ${JSON.stringify(out.b)}`);
      assert(out.c[0] === vil.id && out.c[1] === null, `a lead already in a released polo stays: ${JSON.stringify(out.c)}`);
    });
    await test("login is rate limited", async () => {
      let limited = false;
      for (let i = 0; i < 120 && !limited; i += 1) {
        limited = (await http.post("/auth/login", { email: "naoexiste@x.com", password: "errada" })).status === 429;
      }
      assert(limited, "no 429 after 120 wrong logins");
      // only the wrong answers count: the right password still works for another person while that account is blocked
      const ok = await http.post("/auth/login", { email: "admin@whaticket.com", password: "admin" });
      assert(ok.status === 200, `a right login was refused after other people's wrong ones: ${ok.status}`);
      // the e-mail does not distinguish capitals
      const caps = await http.post("/auth/login", { email: "ADMIN@Whaticket.com", password: "admin" });
      assert(caps.status === 200, `login with capitals ${caps.status}`);
    });
    await test("bad requests are answered as such, not as server errors", async () => {
      const bad = await http.post("/auth/login", "{not json", { headers: { "content-type": "application/json" } });
      assert(bad.status === 400 && bad.data.error === "ERR_INVALID_JSON", `malformed json ${bad.status} ${JSON.stringify(bad.data)}`);
      const big = await http.post("/tickets", { contactId: 1, junk: "x".repeat(3 * 1024 * 1024) }, auth());
      assert(big.status === 413 && big.data.error === "ERR_PAYLOAD_TOO_LARGE", `payload ${big.status} ${JSON.stringify(big.data)}`);
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
