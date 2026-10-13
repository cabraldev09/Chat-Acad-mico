/* eslint-disable */
// Keeps the product 100% in Portuguese. Fails (exit 1) when:
//  1. a backend error code (ERR_…) has no Portuguese text in frontend/src/translate/languages/pt.js
//  2. a screen shows an obviously English label, title, placeholder, button or toast
// Run: node scripts/i18n-check.js   (also part of CI)
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const walk = (dir, exts, out = []) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", "build", ".git"].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, exts, out);
    else if (exts.includes(path.extname(f.name))) out.push(p);
  }
  return out;
};

let problems = 0;
const fail = (msg) => { problems += 1; console.log("  ✗ " + msg); };

// ---------------------------------------------------------------- 1. error codes
console.log("Error codes with Portuguese text");
const pt = fs.readFileSync(path.join(ROOT, "frontend/src/translate/languages/pt.js"), "utf8");
const known = new Set([...pt.matchAll(/\b(ERR_[A-Z0-9_]+)\s*:/g)].map((m) => m[1]));
// ERR_FIELD_REQUIRED_<field> is turned into a sentence by toastError itself
const generic = /^ERR_FIELD_REQUIRED_/;
const used = new Map();
for (const file of walk(path.join(ROOT, "backend/src"), [".ts"])) {
  const text = fs.readFileSync(file, "utf8");
  for (const m of text.matchAll(/["'`](ERR_[A-Z0-9_]+)["'`]/g)) {
    if (!used.has(m[1])) used.set(m[1], path.relative(ROOT, file));
  }
}
const missing = [...used].filter(([code]) => !known.has(code) && !generic.test(code));
missing.forEach(([code, file]) => fail(`${code} (${file}) não tem texto em português`));
console.log(`  ${used.size} códigos usados, ${missing.length} sem tradução`);

// ---------------------------------------------------------------- 2. English on screen
console.log("English text on screens");
const WORDS = new Set(`a an the and or of to in on at for from with without by about as is are be was were it this that these those
your you my me we our us they their i not no yes ok please
save cancel delete remove edit add new create update confirm close open back next previous submit send reset clear search filter
name email password status type title description date time day days hours minutes seconds today yesterday tomorrow
loading error errors success warning info failed fail done
settings setting users user queues queue connections connection contacts contact tickets ticket messages message campaigns campaign
login logout sign signup register home dashboard report reports total all none other more less show hide select choose upload download
click here view details detail list table page pages first last yes active inactive enabled disabled enable disable
phone number address city state country company role admin agent customer client
are you sure want do this action cannot undone successfully saved deleted created updated`.split(/\s+/));
const BRAND = /^(whatsapp|telegram|messenger|instagram|facebook|google|pix|api|url|csv|pdf|ok|id|cpf|qr|code|webhook|token|sms|crm|ia|ead|enem|html|json|app|web|chat|bot|ai|email|e-mail|usuario)$/i;
const isEnglish = (s) => {
  const clean = s.replace(/\{\{[^}]*\}\}|\$\{[^}]*\}/g, " ").replace(/[^A-Za-zÀ-ÿ' -]/g, " ").trim();
  if (!clean || /[À-ÿ]/.test(clean)) return false;
  const tokens = clean.toLowerCase().split(/\s+/).filter((t) => t.length > 0 && !BRAND.test(t));
  if (!tokens.length) return false;
  // every word is an English UI word, and at least one is not also a Portuguese word
  const ptShared = new Set(["a", "e", "o", "as", "os", "no", "me", "ok", "do", "to", "all", "sim", "total", "admin", "status", "nome", "e-mail", "email", "tipo", "data", "cidade", "agent", "contato", "mensagem"]);
  return tokens.every((t) => WORDS.has(t)) && tokens.some((t) => !ptShared.has(t));
};
const SKIP_DIRS = ["translate", "icons"];
const hits = [];
for (const file of walk(path.join(ROOT, "frontend/src"), [".js", ".jsx"])) {
  if (SKIP_DIRS.some((d) => file.includes(`/${d}/`))) continue;
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);
  const check = (s, line) => { if (isEnglish(s)) hits.push(`${rel}:${line} "${s.trim()}"`); };
  const lineOf = (idx) => text.slice(0, idx).split("\n").length;
  // JSX text between tags
  for (const m of text.matchAll(/>\s*([A-Za-z][A-Za-z' ,.!?-]{1,60}?)\s*</g)) check(m[1], lineOf(m.index));
  // props and object keys that hold visible text
  for (const m of text.matchAll(/\b(label|title|placeholder|helperText|aria-label|primary|secondary|emptyText|addLabel|header|tooltip|description)\s*[=:]\s*\{?\s*["'`]([^"'`\n]{2,80})["'`]/g)) check(m[2], lineOf(m.index));
  // toasts
  for (const m of text.matchAll(/toast(?:\.(?:success|error|info|warn|warning))?\(\s*["'`]([^"'`\n]{2,120})["'`]/g)) check(m[1], lineOf(m.index));
}
hits.forEach((h) => fail(h));
console.log(`  ${hits.length} textos em inglês encontrados`);

// ---------------------------------------------------------------- 3. translation keys
console.log("Translation keys used by screens");
const loaded = (() => {
  const m = { exports: {} };
  new Function("module", pt.replace(/export\s*\{\s*messages\s*\};?/, "module.exports = { messages };"))(m);
  return m.exports.messages.pt.translations;
})();
const has = (key) => key.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), loaded) !== undefined;
let keys = 0;
const missingKeys = [];
for (const file of walk(path.join(ROOT, "frontend/src"), [".js", ".jsx"])) {
  if (file.includes("/translate/")) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const m of text.matchAll(/i18n\.t\(\s*["']([A-Za-z0-9_.]+)["']/g)) {
    keys += 1;
    if (!has(m[1])) missingKeys.push(`${path.relative(ROOT, file)} usa a chave "${m[1]}", que não existe em pt.js`);
  }
}
missingKeys.forEach((k) => fail(k));
console.log(`  ${keys} usos, ${missingKeys.length} chaves ausentes`);

console.log(problems ? `\n${problems} problema(s)` : "\nTudo em português.");
process.exit(problems ? 1 : 0);
