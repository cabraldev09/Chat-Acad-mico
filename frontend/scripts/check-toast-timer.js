// The toasts (react-toastify 6) close when the animation of their progress bar ends. A rule that takes that bar out of the page
// (display: none) or cuts its animation leaves every toast on the screen until someone closes it. Run: node scripts/check-toast-timer.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "src");
const files = [];
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) walk(p);
  else if (/\.(css|js|jsx)$/.test(e.name)) files.push(p);
});
walk(root);

const problems = [];
files.forEach(file => {
  const text = fs.readFileSync(file, "utf8");
  // a rule for the bar that hides it with display: none or stops its animation
  const re = /Toastify__progress-bar[^{]*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(text))) {
    if (/display\s*:\s*none|animation\s*:\s*none|animation-name\s*:\s*none/i.test(m[1])) problems.push(`${path.relative(root, file)}: ${m[0].replace(/\s+/g, " ").slice(0, 140)}`);
  }
  // a global rule that shortens every animation must leave the bar out
  const globalCut = /(^|[\s,{"])\*(\s*[,{]|\s*"\s*:)[^}]*animation-?[dD]uration/g;
  if (/prefers-reduced-motion/.test(text) && globalCut.test(text) && !/\*:not\(\.Toastify__progress-bar\)/.test(text)) problems.push(`${path.relative(root, file)}: a regra de "reduzir movimento" para todos os elementos também corta o tempo do aviso; use *:not(.Toastify__progress-bar)`);
});

if (problems.length) {
  console.error("Avisos que não sumem sozinhos: a barra que conta o tempo do aviso foi escondida ou parada.");
  problems.forEach(p => console.error(`- ${p}`));
  process.exit(1);
}
console.log("Avisos: a barra que conta o tempo continua rodando.");
