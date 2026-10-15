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
    const who = guards.includes("isAuthApi") ? "token da API" : guards.includes("isAdmin") ? "admin" : guards.includes("isManager") ? "gestão" : guards.includes("isAuth") ? "logado" : "público";
    const scoped = guards.filter(g => !["isAuth", "isAdmin", "isManager", "cached"].includes(g) && !g.startsWith("upload") && !g.startsWith("rateLimit"));
    rows.push({ file, method: m[1].toUpperCase(), path: m[3], who, scoped: scoped.join(", ") });
  }
});
const mut = r => r.method !== "GET";
const count = k => rows.filter(r => r.who === k).length;
console.log(`# Rotas da API (${rows.length})\n`);
console.log(`Públicas: ${count("público")} · logado (qualquer perfil): ${count("logado")} · gestão: ${count("gestão")} · admin: ${count("admin")}\n`);
console.log("## Públicas (sem login)\n");
rows.filter(r => r.who === "público").forEach(r => console.log(`- ${r.method} ${r.path} (${r.file})`));
console.log("\n## Para revisar: alteram dados e só pedem login, sem checagem de escopo\n");
rows.filter(r => r.who === "logado" && mut(r) && !r.scoped).forEach(r => console.log(`- ${r.method} ${r.path} (${r.file})`));
console.log("\n## Alteram dados com checagem de escopo\n");
rows.filter(r => r.who === "logado" && mut(r) && r.scoped).forEach(r => console.log(`- ${r.method} ${r.path} → ${r.scoped}`));
