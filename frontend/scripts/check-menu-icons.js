/* eslint-disable */
// Every entry of the side menu has its own icon (a repeated icon makes two departments look like the same place):
//   node scripts/check-menu-icons.js     (exit 1 when an icon is used by more than one entry)
const fs = require("fs");
const path = require("path");

const file = path.resolve(__dirname, "../src/layout/MainListItems.js");
const code = fs.readFileSync(file, "utf8");

// import XIcon from "lucide-react/dist/esm/icons/name";  ->  XIcon => name
const names = {};
for (const m of code.matchAll(/import (\w+) from "(?:lucide-react\/dist\/esm\/icons\/([\w-]+)|@material-ui\/icons\/(\w+))";/g)) names[m[1]] = m[2] || m[3];

const used = {};
for (const m of code.matchAll(/<ListItemLink\b[\s\S]*?\/>/g)) {
  const label = (m[0].match(/primary=(?:"([^"]+)"|\{[^}]*?listItems\.(\w+)"?\)?\})/) || [])[1] || (m[0].match(/listItems\.(\w+)/) || [])[1] || "?";
  const comp = (m[0].match(/icon=\{<(\w+)/) || [])[1];
  if (!comp) { console.error(`Item "${label}" has no icon`); process.exitCode = 1; continue; }
  const icon = names[comp] || comp;
  (used[icon] = used[icon] || []).push(label);
}
let bad = false;
for (const [icon, labels] of Object.entries(used)) {
  if (labels.length > 1) { bad = true; console.error(`Icon "${icon}" repeated in: ${labels.join(", ")}`); }
}
if (bad) process.exit(1);
console.log(`Menu icons ok: ${Object.keys(used).length} entries, none repeated.`);
