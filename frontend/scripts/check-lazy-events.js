/* eslint-disable */
// React 16 reuses the event object after the handler returns (event pooling): `event.target` becomes null. Reading it
// later (inside a state updater, a timeout, a promise, or after an `await`) breaks with
// "Cannot read properties of null (reading 'value')". This script finds those reads so they are fixed before they
// reach production:  node scripts/check-lazy-events.js     (exit 1 when something is found)
// Fix: read what you need first (`const v = e.target.value;`) or call `e.persist()` at the top of the handler.
// A line that is correct on purpose can carry the comment  // lazy-event-ok
const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const ROOT = path.resolve(__dirname, "../src");
const NAMES = /^(e|ev|evt|event)$/;
// members that only exist on events (so `error.message` or `edge.target` of other objects never count)
const EVENT_MEMBERS = new Set(["target", "currentTarget", "key", "keyCode", "which", "code", "clipboardData", "dataTransfer", "nativeEvent", "clientX", "clientY", "pageX", "pageY", "shiftKey", "ctrlKey", "metaKey", "altKey", "relatedTarget"]);

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== "node_modules") walk(full); }
    else if (/\.(js|jsx)$/.test(entry.name)) files.push(full);
  }
};
walk(ROOT);

const findings = [];
for (const file of files) {
  const code = fs.readFileSync(file, "utf8");
  const lines = code.split("\n");
  let ast;
  try {
    ast = parser.parse(code, { sourceType: "module", plugins: ["jsx", "classProperties", "optionalChaining", "nullishCoalescingOperator", "dynamicImport", "objectRestSpread"] });
  } catch (err) {
    findings.push({ file, line: 1, why: `could not parse: ${err.message}` });
    continue;
  }
  const isFn = (n) => n && (n.type === "ArrowFunctionExpression" || n.type === "FunctionExpression" || n.type === "FunctionDeclaration" || n.type === "ObjectMethod" || n.type === "ClassMethod");
  traverse(ast, {
    // every use of an event-like parameter as `param.member`
    MemberExpression(p) {
      const obj = p.node.object;
      if (obj.type !== "Identifier" || !NAMES.test(obj.name)) return;
      const prop = p.node.property;
      const name = p.node.computed ? (prop.type === "StringLiteral" ? prop.value : null) : prop.name;
      if (!name || !EVENT_MEMBERS.has(name)) return;
      const binding = p.scope.getBinding(obj.name);
      if (!binding || binding.kind !== "param") return;
      const owner = binding.scope.block; // the function that declares the event parameter
      if (!isFn(owner)) return;
      // the function that contains this read
      // walk up from the read to the handler: a function that only runs later (state updater, timer, promise callback)
      // between them makes the read late; callbacks that run on the spot (map, filter, find...) are harmless
      let late = false;
      let why = "";
      let fn = p.getFunctionParent();
      while (fn && fn.node !== owner) {
        const call = fn.parentPath && fn.parentPath.isCallExpression() && fn.parentPath.node.arguments.includes(fn.node) ? fn.parentPath.node : null;
        if (call) {
          const callee = call.callee;
          const calleeName = callee.type === "Identifier" ? callee.name : callee.type === "MemberExpression" && !callee.computed ? callee.property.name : "";
          if (/^set[A-Z]\w*$/.test(calleeName) || ["setState", "setTimeout", "setInterval", "requestAnimationFrame", "queueMicrotask", "then", "catch", "finally"].includes(calleeName)) {
            late = true;
            why = `inside a function given to ${calleeName}(), which runs after the handler returned`;
            break;
          }
        }
        fn = fn.getFunctionParent();
      }
      // after an `await` in the handler itself
      if (!late && owner.async) {
        let awaitedBefore = false;
        binding.scope.path.traverse({
          AwaitExpression(a) { if (a.node.start < p.node.start && a.getFunctionParent().node === owner) awaitedBefore = true; },
        });
        if (awaitedBefore) { late = true; why = "after an await in an async handler"; }
      }
      if (!late) return;
      // persisted at the top of the handler: e.persist()
      let persisted = false;
      binding.scope.path.traverse({
        CallExpression(c) {
          const cal = c.node.callee;
          if (cal.type === "MemberExpression" && cal.object.type === "Identifier" && cal.object.name === obj.name && cal.property.name === "persist" && c.getFunctionParent().node === owner) persisted = true;
        },
      });
      if (persisted) return;
      const line = p.node.loc.start.line;
      if (/lazy-event-ok/.test(lines[line - 1])) return;
      findings.push({ file, line, why, text: lines[line - 1].trim().slice(0, 140) });
    },
  });
}

if (!findings.length) { console.log("Nenhuma leitura tardia de evento encontrada."); process.exit(0); }
for (const f of findings) console.log(`${path.relative(path.resolve(__dirname, ".."), f.file)}:${f.line}  ${f.why}\n    ${f.text || ""}`);
console.log(`\n${findings.length} leitura(s) tardia(s) de evento. Leia o valor antes (const v = e.target.value) ou use e.persist().`);
process.exit(1);
