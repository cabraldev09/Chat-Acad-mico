// A stand-in for the AI provider, for the lead simulator (scripts/lead-sim): it answers every call of the agent with a short neutral
// text and registers what a model would understand from the words (kind of entry, objection, follow-up). The ORDER of the process is
// decided by the rules of the system, which is what the simulator checks; the wording of a free answer is not.
const express = require("express");
const plain = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const app = express();
app.use(express.json({ limit: "5mb" }));
let n = 0;
const lastUserText = messages => {
  const m = [...messages].reverse().find(x => x.role === "user");
  if (!m) return "";
  if (typeof m.content === "string") return m.content;
  const t = (m.content || []).find(c => c.type === "text");
  return t ? t.text : "";
};
app.post("/v1/messages", (req, res) => {
  const body = req.body || {};
  const system = (Array.isArray(body.system) ? body.system.map(b => b.text).join("\n") : String(body.system || ""));
  const msgs = body.messages || [];
  const last = msgs[msgs.length - 1] || {};
  const isToolResult = Array.isArray(last.content) && last.content.some(c => c.type === "tool_result");
  const said = plain(lastUserText(msgs).split("\n").pop());
  const usage = { input_tokens: 100, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const commercial = /Em TODA resposta chame registrar_turno/.test(system);
  const reply = (text, input) => res.json({
    id: `msg_${++n}`, type: "message", role: "assistant", model: body.model, usage,
    content: commercial ? [{ type: "text", text }, { type: "tool_use", id: `tu_${n}`, name: "registrar_turno", input }] : [{ type: "text", text }],
    stop_reason: commercial ? "tool_use" : "end_turn"
  });
  if (isToolResult) return res.json({ id: `msg_${++n}`, type: "message", role: "assistant", model: body.model, usage, content: [{ type: "text", text: "Anotado." }], stop_reason: "end_turn" });
  const input = { intent: "other" };
  if (/\b(transfer|outra faculdade|outra instituicao|estou cursando|tranquei|parei no)\b/.test(said)) { input.tipo_ingresso = "transfer"; input.intent = "transfer"; }
  else if (/\b(ja tenho (uma )?(graduacao|faculdade)|ja sou formad|sou formad|segunda graduacao|ja conclui|ja me formei|tenho diploma)\b/.test(said)) { input.tipo_ingresso = "second_degree"; input.intent = "second_degree"; }
  if (/\b(tenho o historico|estou com o historico)\b/.test(said)) input.tem_historico = true;
  if (/\b(vou pensar|depois eu vejo|te aviso)\b/.test(said)) input.intent = "follow_up";
  if (/\b(nao tenho (mais )?interesse|desisti)\b/.test(said)) input.intent = "no_interest";
  if (/\b(caro|sem tempo|golpe|confiavel)\b/.test(said)) { input.intent = "objection"; input.tipo_objecao = /caro/.test(said) ? "preco" : /tempo/.test(said) ? "tempo" : "confianca"; }
  // a model that misbehaves on purpose, to check the guards: "INVENTA" makes it name a course that is not offered
  if (/inventa/.test(said)) return reply("Temos Medicina e Enfermagem, os dois semipresenciais.", input);
  return reply("Entendi.", input);
});
app.post("/v1/chat/completions", (_req, res) => res.json({ id: `c_${++n}`, choices: [{ message: { role: "assistant", content: "Entendi." }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
app.listen(Number(process.env.MOCK_PORT || 9911), () => console.log("mock model on", process.env.MOCK_PORT || 9911));
