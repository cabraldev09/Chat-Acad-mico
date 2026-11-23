// One message of a simulated lead to the commercial agent, through the simulator of the flow (nothing is sent, nothing is saved).
// The conversation of each persona is kept in a file, so a script or a person can talk turn by turn:
//   node scripts/lead-sim/chat.js <persona> "<mensagem>"      (--reset starts the conversation again; --name "Ana" sets the contact name)
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, ".sim.json"), "utf8"));
const args = process.argv.slice(2);
const flag = k => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const reset = args.includes("--reset"); if (reset) args.splice(args.indexOf("--reset"), 1);
const name = flag("--name");
const [persona, ...rest] = args;
const input = rest.join(" ");
if (!persona || (!input && !reset)) { console.error('uso: chat.js <persona> "<mensagem>" [--reset] [--name Nome]'); process.exit(1); }
const dir = path.join(__dirname, ".conversas"); fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${persona.replace(/[^a-z0-9_-]/gi, "_")}.json`);
if (reset && fs.existsSync(file)) fs.unlinkSync(file);
if (!input) process.exit(0);
const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { state: null, log: [], name: name || "Maria Teste" };
(async () => {
  if (saved.ended) { console.log(`[conversa encerrada: ${saved.ended}] use --reset para recomeçar`); return; }
  const r = await axios.post(`${cfg.api}/flows/${cfg.flowId}/simulate`, { state: saved.state, input, restart: !saved.state, sample: { name: saved.name, polos: cfg.polos } }, { headers: { Authorization: `Bearer ${cfg.token}` }, validateStatus: () => true });
  if (r.status !== 200) { console.log(`ERRO ${r.status}: ${JSON.stringify(r.data).slice(0, 400)}`); process.exit(2); }
  const texts = (r.data.messages || []).map(m => (typeof m === "string" ? m : m.text || `[${m.type || "arquivo"}${m.name ? `: ${m.name}` : ""}]`));
  const slots = (((r.data.state || {}).vars || {}).__commercial || {}).state ? r.data.state.vars.__commercial.state.slots : {};
  const tr = (r.data.traces || []).slice(-1)[0] || {};
  const keep = ["courseName", "city", "entryType", "courseChoosing", "courseExplained", "modalityExplained", "mecExplained", "gradeSent", "reuseExplained", "bolsaDataAsked", "fullName", "cpfGiven", "analysisStatus", "unofferedCourse"];
  console.log(`LEAD: ${input}`);
  texts.forEach(t => console.log(`ESTELA: ${t}`));
  if (!texts.length) console.log("ESTELA: (sem resposta)");
  console.log(`--- situação: ${r.data.status}${tr.commercial && tr.commercial.exitWhy ? ` | motivo: ${tr.commercial.exitWhy}` : ""}${(r.data.routes || []).length ? ` | encaminhado: ${JSON.stringify(r.data.routes).slice(0, 120)}` : ""} | modelo chamado: ${tr.llmCalls ? "sim" : "não"}`);
  console.log(`--- dados: ${keep.filter(k => slots[k] !== undefined && slots[k] !== null && slots[k] !== false && slots[k] !== 0 && slots[k] !== "unknown" && slots[k] !== "not_applicable").map(k => `${k}=${k === "fullName" ? "(informado)" : slots[k]}`).join(", ") || "(nenhum)"}`);
  saved.state = r.data.state; saved.log.push({ lead: input, estela: texts, status: r.data.status });
  if (r.data.status !== "waiting") saved.ended = r.data.status;
  fs.writeFileSync(file, JSON.stringify(saved));
})().catch(e => { console.error(e.message); process.exit(1); });
