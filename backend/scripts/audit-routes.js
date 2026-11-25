// Lists every API route with who can call it, read from the route files. Run: node scripts/audit-routes.js
// The point is the "review" list: routes that change data and only ask for a login (any role, any person's data).
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "../src/routes");
const rows = [];
fs.readdirSync(dir).filter(f => f.endsWith(".ts")).forEach(file => {
  const text = fs.readFileSync(path.join(dir, file), "utf8").replace(/\n\s+/g, " ");
  const re = /\b(?:r|\w*Routes?|router)\.(get|post|put|patch|delete)\(\s*(["'`])([^"'`]+)\2\s*,([^;]*)\);/g;
  let m;
  while ((m = re.exec(text))) {
    const args = m[4].split(",").map(s => s.trim()).filter(Boolean);
    const guards = args.slice(0, -1).filter(a => /^[a-zA-Z]+$/.test(a));
    const who = guards.includes("isAuthApi") ? "token da API" : guards.includes("isSystemAdmin") ? "admin" : guards.includes("isAdmin") ? "admin" : guards.includes("isManager") ? "gestão" : guards.includes("isAuth") ? "logado" : "público";
    const scoped = guards.filter(g => !["isAuth", "isAdmin", "isSystemAdmin", "isManager", "cached"].includes(g) && !g.startsWith("upload") && !g.startsWith("rateLimit"));
    rows.push({ file, method: m[1].toUpperCase(), path: m[3], who, scoped: scoped.join(", ") });
  }
});
const mut = r => r.method !== "GET";
const count = k => rows.filter(r => r.who === k).length;
console.log(`# Rotas da API (${rows.length})\n`);
console.log(`Públicas: ${count("público")} · logado (qualquer perfil): ${count("logado")} · gestão: ${count("gestão")} · admin: ${count("admin")}\n`);
// the rule of the data behind the routes: who sees which leads (middleware/scope.ts). Written here so the generated file keeps it.
console.log(`## Quem vê quais leads no CRM (middleware/scope.ts)

| Perfil | Vê |
|---|---|
| admin | todos os leads, de todos os polos |
| coordenacao | só os leads dos polos em que está (Polos e equipes); sem polo, nenhum. Um lead ainda sem polo fica com a administração |
| consultor | só os leads em que é o responsável |
| tutor, academico | os leads em que é o responsável e os alunos dados a ele (Ambientação e Alunos da tutoria: também os do seu polo ainda sem tutor) |
| relacionamento | só os matriculados dos polos em que está; sem polo, nenhum |

A mesma regra vale em toda porta do CRM: lista, quadro, busca, ficha do lead e o que pende dela (atividades, tarefas, propostas,
cobranças, documentos), contagens do Painel do CRM, novos para conferir, tarefas da equipe, Relatório do CRM (CSV), Matrículas
realizadas, comissões, Alunos da tutoria e Avisos da tutoria, Retenção e os avisos em tempo real de lead, risco e satisfação.
A coordenação continua com os poderes da gestão (\`isAdminReq\`): o que muda é o que ela vê. Ela só muda a equipe dos polos em que está.
Conversas (Atendimento) seguem a regra das filas e setores (\`canAccessTicket.ts\`), não esta.
`);
console.log("## Públicas (sem login)\n");
rows.filter(r => r.who === "público").forEach(r => console.log(`- ${r.method} ${r.path} (${r.file})`));
console.log("\n## Para revisar: alteram dados e só pedem login, sem checagem de escopo\n");
rows.filter(r => r.who === "logado" && mut(r) && !r.scoped).forEach(r => console.log(`- ${r.method} ${r.path} (${r.file})`));
console.log("\n## Alteram dados com checagem de escopo\n");
rows.filter(r => r.who === "logado" && mut(r) && r.scoped).forEach(r => console.log(`- ${r.method} ${r.path} → ${r.scoped}`));
console.log("\n## Painel da gestão (admin e coordenação)\n");
rows.filter(r => r.who === "gestão" && r.path.startsWith("/dashboard/")).forEach(r => console.log(`- ${r.method} ${r.path} (${r.file})`));
