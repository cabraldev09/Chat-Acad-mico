/* eslint-disable */
// Runs before the migrations when the container starts. The Sequelize CLI prints just "ERROR:" when the
// database is unreachable, so this tells in Portuguese what is wrong and how to fix it, then exits with 1.
require("dotenv").config();
const { Client } = require("pg");

const url = process.env.DATABASE_URL;
const say = (m) => console.log(`[banco] ${m}`);

if ((process.env.DB_DIALECT || (url && /^postgres/.test(url) ? "postgres" : "mysql")) !== "postgres") {
  say("DB_DIALECT não é postgres: pulando a verificação.");
  process.exit(0);
}

let cfg;
if (url) {
  let u;
  try { u = new URL(url); } catch (e) {
    say("A variável DATABASE_URL não é um endereço válido. Copie de novo a string do Supabase (Connect → Session pooler) e, se a senha tiver símbolos como @ # / ?, troque-os por %40 %23 %2F %3F.");
    process.exit(1);
  }
  cfg = { host: u.hostname, port: u.port ? Number(u.port) : 5432, database: u.pathname.replace(/^\//, ""), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
} else {
  cfg = { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASS };
  if (!cfg.host) {
    say("DATABASE_URL não está definida neste serviço. Em Variables, crie DATABASE_URL com a string do Supabase (Connect → Session pooler, porta 5432) e DB_SSL=true.");
    process.exit(1);
  }
}

// obviously not a connection string (for example a documentation link pasted by mistake)
if (url && (/^(www\.)?supabase\.(com|co)$/.test(cfg.host) || !cfg.user || !cfg.password || /\//.test(cfg.database || ""))) {
  say(`A DATABASE_URL não é uma string de conexão: ela aponta para "${cfg.host}" e não traz usuário e senha de banco.`);
  say("O que fazer: no Supabase clique em Connect (botão no topo do projeto), escolha Session pooler e copie a linha que começa com postgresql://. Ela tem este formato:");
  say("  postgresql://postgres.CODIGO_DO_PROJETO:SUA_SENHA@aws-0-REGIAO.pooler.supabase.com:5432/postgres");
  process.exit(1);
}

say(`conectando em ${cfg.host}:${cfg.port}/${cfg.database} como ${cfg.user} (SSL ${process.env.DB_SSL === "true" ? "ligado" : "desligado"})`);

const hints = (text, code) => {
  const t = `${code || ""} ${text}`;
  if (/ENETUNREACH|EAI_AGAIN|ENOTFOUND|EHOSTUNREACH/.test(t)) return "O endereço não é alcançado pelo Railway. O endereço direto do Supabase (db.xxxx.supabase.co) usa só IPv6. Use o Session pooler (Connect → Session pooler), que tem host como aws-0-REGIÃO.pooler.supabase.com.";
  if (/ECONNREFUSED/.test(t)) return /127\.0\.0\.1|::1|localhost/.test(`${cfg.host}`) || !cfg.host ? "A conexão foi para o próprio servidor (localhost): DATABASE_URL não está chegando. Confira o nome da variável e se está no serviço certo." : "O servidor recusou a conexão. Confira o host e a porta (5432 no Session pooler).";
  if (/ETIMEDOUT/.test(t)) return "Tempo esgotado. Confira host e porta; no Supabase, a porta 5432 do pooler ou da conexão direta.";
  if (/password authentication failed/i.test(t)) return "Senha incorreta. No Supabase: Project Settings → Database → Reset database password, e atualize DATABASE_URL.";
  if (/Tenant or user not found/i.test(t)) return "No Session pooler o usuário precisa ser postgres.SEU_PROJETO (com o ponto e o código do projeto), não só postgres.";
  if (/SSL|self.signed|certificate|no encryption|pg_hba/i.test(t)) return "Falta SSL: crie a variável DB_SSL com o valor true.";
  if (/does not exist/i.test(t)) return "O nome do banco está errado: no Supabase é postgres.";
  return "Confira DATABASE_URL e DB_SSL=true.";
};

const client = new Client({ ...cfg, ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined, connectionTimeoutMillis: 12000 });
client.connect()
  .then(() => client.query("SELECT 1"))
  .then(() => { say("conexão ok."); return client.end(); })
  .then(() => process.exit(0))
  .catch((err) => {
    const inner = Array.isArray(err.errors) ? err.errors.map((e) => `${e.code || ""} ${e.address || ""}:${e.port || ""}`).join(" | ") : "";
    const text = `${err.message || ""} ${inner}`.trim();
    say(`FALHOU: ${err.code || ""} ${text}`);
    say(`O que fazer: ${hints(text, err.code)}`);
    process.exit(1);
  });
