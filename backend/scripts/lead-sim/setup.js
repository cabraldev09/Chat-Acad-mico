// Prepares a local API for the lead simulator: polos, a catalogue like the real one (the health courses the institution offers, one that is
// no longer offered, a few others), the rule of the MEC of the health courses and the commercial agent made from the template.
// Usage (API on 8080, started with ANTHROPIC_API_URL pointing to mock-model.js): node scripts/lead-sim/setup.js
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const API = process.env.API || "http://localhost:8080";
const http = axios.create({ baseURL: API, validateStatus: () => true });
(async () => {
  const login = await http.post("/auth/login", { email: process.env.ADMIN_EMAIL || "admin@whaticket.com", password: process.env.ADMIN_PASSWORD || "admin" });
  if (login.status !== 200) throw new Error(`login ${login.status}`);
  const auth = { headers: { Authorization: `Bearer ${login.data.token}` } };
  const polos = [];
  for (const [name, code, city] of [["Polo Porto Velho", "PVH", "Porto Velho"], ["Polo Buritis", "BUR", "Buritis"], ["Polo Ji-Paraná", "JIP", "Ji-Paraná"]]) {
    const r = await http.post("/polos", { name, code, city, state: "RO" }, auth);
    if (r.data && r.data.id) polos.push({ id: r.data.id, name, city });
  }
  const health = ["Biomedicina", "Farmácia", "Fisioterapia", "Fonoaudiologia", "Nutrição", "Terapia Ocupacional", "Educação Física", "Gerontologia", "Podologia", "Óptica e Optometria"];
  const others = [["Cst Em Análise e Desenvolvimento de Sistemas", "EAD", 5], ["Administração", "EAD", 8], ["Pedagogia", "EAD", 8], ["Cst Em Gestão de Recursos Humanos", "EAD", 4], ["Ciências Contábeis", "EAD", 8]];
  const ids = {};
  for (const name of health) {
    const r = await http.post("/courses", { name, modality: "Semipresencial", category: "Graduação - Cruzeiro", level: "Bacharelado", semesters: 8, monthlyFee: 500, active: true }, auth);
    ids[name] = r.data && r.data.id;
    if (ids[name]) await http.put(`/course-regulations/${ids[name]}`, { mecImpacted: true, regulation: "Portaria MEC 378/2025", teoriaAoVivo: true, praticaPresencial: true, cronogramaPraticasDefinido: false }, auth);
  }
  for (const [name, modality, semesters] of others) ids[name] = ((await http.post("/courses", { name, modality, category: "Graduação - Cruzeiro", semesters, monthlyFee: 400, active: true }, auth)).data || {}).id;
  // no longer offered: registered and turned off
  const rad = await http.post("/courses", { name: "Cst Em Radiologia", modality: "Semipresencial", category: "Graduação - Cruzeiro", semesters: 6, monthlyFee: 400, active: false }, auth);
  const made = await http.post("/ai-agents/from-template", { template: "graduacao_comercial_cruzeiro", name: "Comercial – Estela (simulador)" }, auth);
  if (made.status !== 201) throw new Error(`agent ${made.status} ${JSON.stringify(made.data).slice(0, 200)}`);
  await http.put(`/ai-agents/${made.data.agentId}`, { active: true, apiKey: "sk-ant-test", waitSeconds: 0, provider: "anthropic", model: "claude-haiku-5-5" }, auth);
  const out = { api: API, token: login.data.token, agentId: made.data.agentId, flowId: made.data.flowId, polos, courses: ids, radiologia: rad.data && rad.data.id };
  fs.writeFileSync(path.join(__dirname, ".sim.json"), JSON.stringify(out, null, 1));
  console.log(`pronto: agente ${out.agentId}, roteiro ${out.flowId}, ${Object.keys(ids).length} cursos, ${polos.length} polos`);
})().catch(e => { console.error(e.message); process.exit(1); });
