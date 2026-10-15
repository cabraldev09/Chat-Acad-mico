import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, IconButton, MenuItem, TextField, Typography } from "@material-ui/core";
import { RotateCcw, Send, X } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";

// the simulator talks to the DRAFT: nothing is sent to anyone and nothing is saved in the CRM
const OPTION = /^\*(\d+)\* - (.+)$/;

const splitBubble = (text) => {
  const lines = String(text).split("\n");
  const options = lines.map((l) => l.match(OPTION)).filter(Boolean).map((m) => ({ n: m[1], label: m[2] }));
  const body = lines.filter((l) => !OPTION.test(l)).join("\n").trim();
  return { body: body || text, options };
};

const Simulator = ({ flowId, getGraph, onPath, onClose }) => {
  const [log, setLog] = useState([]); // { who: "bot" | "me" | "act", text, options? }
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
        ...data.actions.map((a) => ({ who: "act", text: a })),
        ...(data.status === "delayed" ? [{ who: "act", text: `O fluxo espera ${data.resumeAfterMinutes} min e continua (no teste, clique em “Continuar”).` }] : []),
        ...(data.status === "done" ? [{ who: "act", text: "Fim do fluxo." }] : []),
        ...(data.status === "handoff" ? [{ who: "act", text: "A conversa passou para a equipe ou para a IA. Fim do fluxo." }] : []),
      ]);
      setState(data.state);
      setStatus(data.status);
      onPath(data.path);
    } catch (err) {
      toastError(err);
    }
    setBusy(false);
  }, [flowId, getGraph, state, name, hours, onPath]);

  const restart = () => { setLog([]); setState(null); setStatus("idle"); onPath([]); step({ restart: true }); };
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
        <b style={{ flex: 1 }}>Testar o fluxo</b>
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
      <div style={{ flex: 1, overflowY: "auto", padding: 14, background: "#efeae2", display: "flex", flexDirection: "column", gap: 8 }}>
        {log.map((m, i) => m.who === "act" ? (
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
      <Typography variant="caption" color="textSecondary" style={{ padding: "0 14px 10px" }}>Só um teste: nada é enviado e nada é salvo no CRM.</Typography>
    </div>
  );
};

export default Simulator;
