import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, IconButton, MenuItem, TextField, Typography } from "@material-ui/core";
import { ChevronDown, ChevronRight, RotateCcw, Send, X } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { INTENT_LABEL, NEXT_LABEL, SLOT_LABEL, TEMP_COLOR, TEMP_LABEL, slotValue } from "../../utils/commercial";
import { FUNNEL_KEYS } from "./nodes";

// the simulator talks to the DRAFT: nothing is sent to anyone and nothing is saved in the CRM
const OPTION = /^\*(\d+)\* - (.+)$/;

const splitBubble = (text) => {
  const lines = String(text).split("\n");
  const options = lines.map((l) => l.match(OPTION)).filter(Boolean).map((m) => ({ n: m[1], label: m[2] }));
  const body = lines.filter((l) => !OPTION.test(l)).join("\n").trim();
  return { body: body || text, options };
};

const stageName = (k) => (k ? FUNNEL_KEYS[k] || k : "—");
const short = (v, n = 160) => { const s = typeof v === "string" ? v : JSON.stringify(v); return s && s.length > n ? `${s.slice(0, n)}…` : s; };
const Row = ({ label, children }) => (
  <div style={{ display: "flex", gap: 8, fontSize: 12.5, lineHeight: 1.45, padding: "2px 0" }}>
    <span style={{ width: 118, flexShrink: 0, opacity: 0.65 }}>{label}</span>
    <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{children}</span>
  </div>
);

// What the AI did in one turn, in plain words: what it understood, what it looked up, what the rules did to the CRM and what it cost
const Trace = ({ t }) => {
  const [open, setOpen] = useState(false);
  const c = t.commercial;
  const turn = c && c.commercial; // the rules of the turn (commercial agent)
  const crmBefore = c ? (c.crm ? c.crm.before : turn && turn.crmBefore) : null;
  const crmAfter = c ? (c.crm ? c.crm.after : turn && turn.crmAfter) : null;
  const changed = turn ? Object.entries(turn.changed || {}) : [];
  const tokens = t.tokens || { input: 0, output: 0, cacheRead: 0 };
  const fromSystem = c && c.deterministic;
  return (
    <div style={{ alignSelf: "stretch", background: "rgba(11,66,121,.07)", border: "1px solid rgba(11,66,121,.18)", borderRadius: 10, fontSize: 12.5 }}>
      <button type="button" onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", border: 0, background: "transparent", cursor: "pointer", padding: "6px 10px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, color: "#0B4279", textAlign: "left" }}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span style={{ flex: 1 }}>{c && c.block ? "O que este passo fez" : fromSystem ? "Respondido pelo sistema, sem IA" : "O que a IA fez neste turno"}</span>
        {turn && turn.intent && <span style={{ fontWeight: 600, opacity: 0.8 }}>{INTENT_LABEL[turn.intent] || turn.intent}</span>}
      </button>
      {open && (
        <div style={{ padding: "2px 10px 10px", color: "#111b21" }}>
          {c && c.userText ? <Row label="Mensagem">{c.userText}</Row> : null}
          {turn && <Row label="Entendeu">{INTENT_LABEL[turn.intent] || turn.intent || "—"}{c.entry ? ` · ${c.entry}` : ""}</Row>}
          {!c?.block && <Row label="IA">{fromSystem ? "Nenhuma chamada (o sistema respondeu sozinho)" : `${(c && c.llmCalls) || (tokens.input || tokens.output ? 1 : 0)} chamada(s) · entrada ${tokens.input} · saída ${tokens.output}${tokens.cacheRead ? ` · lida do cache ${tokens.cacheRead}` : ""}${c && c.latencyMs ? ` · ${c.latencyMs} ms` : ""}`}</Row>}
          {c && c.tools && c.tools.length > 0 && (
            <Row label="Ferramentas">
              {c.tools.map((x, i) => <div key={i}><b>{x.name}</b> {short(x.args, 90)}<div style={{ opacity: 0.7 }}>→ {short(x.result)}</div></div>)}
              {c.cacheHits ? <div style={{ opacity: 0.7 }}>{c.cacheHits} consulta(s) vieram do cache</div> : null}
            </Row>
          )}
          {!c && t.tools && t.tools.length > 0 && <Row label="Ferramentas">{t.tools.join(", ")}</Row>}
          {(t.sources || []).length > 0 && <Row label="Base usada">{t.sources.join(" · ")}</Row>}
          {Object.keys(t.collected || {}).length > 0 && !c && <Row label="Dados">{Object.entries(t.collected).map(([k, v]) => `${k}: ${v}`).join(" · ")}</Row>}
          {changed.length > 0 && (
            <Row label="Dados do lead">
              {changed.filter(([k]) => !["lastInboundAt", "lastOutboundAt", "lastIntent"].includes(k)).map(([k, [a, b]]) => <div key={k}>{SLOT_LABEL[k] || k}: <span style={{ opacity: 0.6 }}>{slotValue(k, a)}</span> → <b>{slotValue(k, b)}</b></div>)}
            </Row>
          )}
          {c && (crmBefore || crmAfter) && <Row label="Coluna do CRM">{stageName(crmBefore)}{crmAfter && crmAfter !== crmBefore ? <> → <b>{stageName(crmAfter)}</b></> : " (não mudou)"}</Row>}
          {turn && (
            <Row label="Lead">
              <span style={{ color: TEMP_COLOR[turn.temperature], fontWeight: 700 }}>{TEMP_LABEL[turn.temperature] || turn.temperature}</span> · pontuação {turn.score}
              {turn.nextAction ? ` · próxima ação: ${NEXT_LABEL[turn.nextAction] || turn.nextAction}` : ""}{turn.readyForProposal ? " · pronto para proposta" : ""}
            </Row>
          )}
          {c && (c.audit || (turn && turn.actions) || []).length > 0 && <Row label="Ações do sistema">{(c.audit || turn.actions).map((a, i) => <div key={i}>{a.text}</div>)}</Row>}
          {t.exit && <Row label="Saída escolhida">{t.exit}</Row>}
        </div>
      )}
    </div>
  );
};

// the lead of the test: what the rules know about it after the last answer
const World = ({ world }) => {
  const [open, setOpen] = useState(true);
  if (!world) return null;
  const s = world.state || {};
  const x = s.slots || {};
  const shown = ["leadName", "courseName", "city", "entryType", "courseExplained", "gradeSent", "analysisStatus"].filter((k) => x[k] !== undefined && x[k] !== null && x[k] !== "");
  return (
    <div style={{ margin: "0 14px 8px", border: "1px solid rgba(127,140,160,.3)", borderRadius: 10, fontSize: 12.5 }}>
      <button type="button" onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", border: 0, background: "transparent", cursor: "pointer", padding: "6px 10px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, textAlign: "left", color: "inherit" }}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<span style={{ flex: 1 }}>Lead do teste</span>
        <span style={{ color: TEMP_COLOR[s.temperature], fontWeight: 700 }}>{TEMP_LABEL[s.temperature] || ""}</span><span style={{ opacity: 0.7 }}>{s.commercialScore || 0} pts</span>
      </button>
      {open && (
        <div style={{ padding: "0 10px 8px" }}>
          <Row label="Coluna do CRM">{stageName(world.stageKey)}</Row>
          {shown.map((k) => <Row key={k} label={SLOT_LABEL[k] || k}>{slotValue(k, x[k])}</Row>)}
          <Row label="Próxima ação">{s.nextAction ? NEXT_LABEL[s.nextAction] || s.nextAction : "—"}</Row>
          <Row label="Tarefas">{(world.tasks || []).length ? world.tasks.length : "nenhuma"}</Row>
          <div style={{ opacity: 0.6, marginTop: 4 }}>Só no teste: nada disso é gravado no CRM de verdade.</div>
        </div>
      )}
    </div>
  );
};

const Simulator = ({ flowId, kind, getGraph, onPath, onClose }) => {
  const [log, setLog] = useState([]); // { who: "bot" | "me" | "act" | "trace", text, options? }
  const [world, setWorld] = useState(null);
  const [usage, setUsage] = useState({ calls: 0, input: 0, output: 0 });
  const [state, setState] = useState(null);
  const [status, setStatus] = useState("idle");
  const [input, setInput] = useState("");
  const [hours, setHours] = useState("open");
  const [name, setName] = useState("Maria Souza");
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  useEffect(() => { if (end.current && end.current.scrollIntoView) end.current.scrollIntoView({ block: "end" }); }, [log]);

  const step = useCallback(async (body, mine) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/flows/${flowId}/simulate`, { graph: getGraph(), state: body.restart ? null : state, input: body.input, restart: !!body.restart, sample: { name, hours } });
      setLog((l) => [
        ...l,
        ...(mine ? [{ who: "me", text: mine }] : []),
        ...data.messages.map((m) => ({ who: "bot", ...splitBubble(m) })),
        ...(data.traces || []).map((t) => ({ who: "trace", t })),
        ...data.actions.map((a) => ({ who: "act", text: a })),
        ...(data.status === "delayed" ? [{ who: "act", text: `O fluxo espera ${data.resumeAfterMinutes} min e continua (no teste, clique em “Continuar”).` }] : []),
        ...(data.status === "done" ? [{ who: "act", text: "Fim do fluxo." }] : []),
        ...(data.status === "handoff" ? [{ who: "act", text: "A conversa passou para a equipe ou para a IA. Fim do fluxo." }] : []),
      ]);
      setState(data.state);
      setWorld(data.state && data.state.vars ? data.state.vars.__commercial || null : null);
      setUsage((u) => (data.traces || []).reduce((a, t) => ({ calls: a.calls + (t.commercial && t.commercial.deterministic ? 0 : t.tokens && (t.tokens.input || t.tokens.output) ? 1 : 0), input: a.input + ((t.tokens || {}).input || 0), output: a.output + ((t.tokens || {}).output || 0) }), u));
      setStatus(data.status);
      onPath(data.path);
    } catch (err) {
      toastError(err);
    }
    setBusy(false);
  }, [flowId, getGraph, state, name, hours, onPath]);

  const restart = () => { setLog([]); setState(null); setWorld(null); setUsage({ calls: 0, input: 0, output: 0 }); setStatus("idle"); onPath([]); step({ restart: true }); };
  useEffect(() => { restart(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const send = (text, shown) => {
    const value = String(text ?? input).trim();
    if (!value || busy || status === "done" || status === "handoff") return;
    setInput("");
    step({ input: value }, shown || value);
  };
  const last = [...log].reverse().find((m) => m.who === "bot");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", gap: 8, borderBottom: "1px solid rgba(127,140,160,.25)" }}>
        <b style={{ flex: 1 }}>{kind === "agent" ? "Testar o agente" : "Testar o fluxo"}</b>
        <IconButton size="small" aria-label="Recomeçar" onClick={restart}><RotateCcw size={17} /></IconButton>
        <IconButton size="small" aria-label="Fechar o teste" onClick={onClose}><X size={18} /></IconButton>
      </div>
      <div style={{ display: "flex", gap: 8, padding: "8px 14px" }}>
        <TextField size="small" variant="outlined" label="Nome da pessoa" value={name} onChange={(e) => setName(e.target.value)} InputLabelProps={{ shrink: true }} style={{ flex: 1 }} />
        <TextField select size="small" variant="outlined" label="Horário" value={hours} onChange={(e) => setHours(e.target.value)} InputLabelProps={{ shrink: true }} style={{ width: 130 }}>
          <MenuItem value="open">Aberto</MenuItem>
          <MenuItem value="closed">Fechado</MenuItem>
        </TextField>
      </div>
      <World world={world} />
      <div style={{ flex: 1, overflowY: "auto", padding: 14, background: "#efeae2", display: "flex", flexDirection: "column", gap: 8 }}>
        {log.map((m, i) => m.who === "trace" ? (
          <Trace key={i} t={m.t} />
        ) : m.who === "act" ? (
          <div key={i} style={{ alignSelf: "center", fontSize: 12, background: "rgba(11,66,121,.12)", color: "#0B4279", borderRadius: 999, padding: "3px 12px", textAlign: "center" }}>{m.text}</div>
        ) : (
          <div key={i} style={{ alignSelf: m.who === "me" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
            <div style={{ background: m.who === "me" ? "#d9fdd3" : "#fff", color: "#111b21", borderRadius: 10, padding: "7px 10px", fontSize: 14, whiteSpace: "pre-wrap", boxShadow: "0 1px 1px rgba(0,0,0,.12)" }}>{m.who === "me" ? m.text : m.body}</div>
            {m.options && m.options.length > 0 && i === log.indexOf(last) && status === "waiting" && (
              <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
                {m.options.map((o) => (
                  <button key={o.n} type="button" disabled={busy} onClick={() => send(o.n, o.label)}
                    style={{ border: 0, background: "#fff", color: "#0B4279", fontWeight: 600, fontFamily: "inherit", fontSize: 13.5, padding: "8px 10px", borderRadius: 10, cursor: "pointer", boxShadow: "0 1px 1px rgba(0,0,0,.12)" }}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {status === "delayed" && <Button size="small" variant="outlined" onClick={() => step({ input: "" })}>Continuar depois da espera</Button>}
        <div ref={end} />
      </div>
      <div style={{ display: "flex", gap: 6, padding: 10, borderTop: "1px solid rgba(127,140,160,.25)" }}>
        <TextField fullWidth size="small" variant="outlined" placeholder={status === "waiting" ? "Responda como a pessoa" : "O fluxo terminou"} disabled={status !== "waiting" || busy}
          value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
        <IconButton color="primary" aria-label="Enviar" disabled={status !== "waiting" || busy || !input.trim()} onClick={() => send()}><Send size={18} /></IconButton>
      </div>
      <Typography variant="caption" color="textSecondary" style={{ padding: "0 14px 10px" }}>
        Só um teste: nada é enviado e nada é salvo no CRM.{usage.calls ? ` A IA respondeu de verdade ${usage.calls} vez(es) (${usage.input + usage.output} tokens).` : ""}
      </Typography>
    </div>
  );
};

export default Simulator;
