/* eslint-disable */
// The screens never use the browser's own boxes (window.confirm / alert / prompt): they show the site's address ("… diz") and look out of
// place, above all on a phone. Use the system's dialog instead (src/components/ConfirmDialog: confirmDialog, promptDialog, copyDialog,
// noticeDialog).
//   node scripts/check-native-dialogs.js     (exit 1 when a screen calls one of them)
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../src");
const BOX = /(^|[^\w.$])(?:window\.)?(confirm|alert|prompt)\s*\(/;
const found = [];
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) { walk(full); continue; }
    if (!/\.(js|jsx|ts|tsx)$/.test(name)) continue;
    fs.readFileSync(full, "utf8").split("\n").forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "").replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');
      if (BOX.test(code)) {
        found.push(`${path.relative(path.resolve(__dirname, ".."), full)}:${i + 1}: ${line.trim().slice(0, 140)}`);
      }
    });
  }
};
walk(ROOT);
if (found.length) {
  console.error("Caixas do navegador encontradas (use src/components/ConfirmDialog):");
  found.forEach((f) => console.error(`  ${f}`));
  process.exit(1);
}
console.log("Nenhuma caixa do navegador (confirm, alert, prompt) nas telas.");
