import React, { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Switch, TextField } from "@material-ui/core";
import { Check, Lightbulb, MessageSquare, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { ErrorState } from "../../components/ui";

// The audit of the tutoring, for the management of the academic side (the tutor does not see it): what the AI found left pending in the
// tutors' conversations, with an idea; the management writes the protocol and its name, and marks what is resolved.
const FILTERS = [["abertas", "Abertas"], ["registrada", "Com protocolo"], ["resolvida", "Resolvidas"], ["dispensada", "Dispensadas"]];
const KINDS = [["protocolo", "Chamado ou protocolo aberto"], ["retorno", "Retorno prometido"], ["documento", "Documento pedido"], ["acesso", "Acesso ou plataforma"], ["outro", "Outro"]];
const TONE = { aberta: "#d97706", registrada: "#0369a1", resolvida: "#15803d", dispensada: "#64748b" };
const STATUS_LABEL = { aberta: "Aberta", registrada: "Com protocolo", resolvida: "Resolvida", dispensada: "Dispensada" };

const useStyles = makeStyles((theme) => ({
  wrap: { display: "grid", gap: 12, paddingBottom: 16 },
  bar: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  chip: { minHeight: 34, padding: "0 12px", borderRadius: 999, border: "1px solid var(--line-strong)", background: "var(--surface)", color: "var(--text-1)", font: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 },
  chipOn: { background: "#0b4279", borderColor: "#0b4279", color: "#fff" },
  count: { fontVariantNumeric: "tabular-nums", opacity: 0.8 },
  note: { fontSize: 13, color: theme.palette.text.secondary, lineHeight: 1.5 },
  card: { border: "1px solid var(--line)", borderLeft: "4px solid var(--tone)", borderRadius: 12, background: "var(--surface)", padding: 14, display: "grid", gap: 10, minWidth: 0 },
  head: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13 },
  tag: { padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: "var(--tone)", background: "color-mix(in srgb, var(--tone) 12%, transparent)" },
  who: { fontWeight: 650, color: "var(--text-1)" },
  when: { marginLeft: "auto", color: theme.palette.text.secondary, fontSize: 12.5 },
  summary: { fontSize: 14.5, lineHeight: 1.5, color: "var(--text-1)", overflowWrap: "anywhere" },
  idea: { display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, lineHeight: 1.5, color: "var(--text-2)", background: "var(--surface-2)", borderRadius: 8, padding: "8px 10px" },
  form: { display: "grid", gridTemplateColumns: "minmax(0, 180px) minmax(0, 1fr) auto", gap: 8, alignItems: "center", [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr" } },
  input: { "& .MuiOutlinedInput-root": { height: 38 } },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  btn: { height: 38, textTransform: "none", borderRadius: 8, fontWeight: 600 },
  settings: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, color: "var(--text-2)", border: "1px dashed var(--line-strong)", borderRadius: 10, padding: "8px 12px" },
}));

const when = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

const IssueCard = ({ c, it, onSaved, onOpen }) => {
  const [number, setNumber] = useState(it.protocolNumber || "");
  const [name, setName] = useState(it.protocolName || "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNumber(it.protocolNumber || ""); setName(it.protocolName || ""); }, [it.id, it.protocolNumber, it.protocolName]);
  const save = async (patch, done) => {
    setBusy(true);
    try {
      await api.put(`/tutoria/issues/${it.id}`, patch);
      if (done) toast.success(done);
      onSaved();
    } catch (err) { toastError(err); }
    setBusy(false);
  };
  const closed = it.status === "resolvida" || it.status === "dispensada";
  const changed = number !== (it.protocolNumber || "") || name !== (it.protocolName || "");
  return (
    <article className={c.card} style={{ "--tone": TONE[it.status] || "#64748b" }}>
      <div className={c.head}>
        <span className={c.tag}>{STATUS_LABEL[it.status] || it.status}</span>
        <span>{it.kindLabel}</span>
        {it.student && <span className={c.who}>· {it.student}</span>}
        {it.tutor && <span>· tutor {it.tutor}</span>}
        <span className={c.when}>{it.source === "ia" ? "Visto pela IA" : "Registrado pela gestão"} em {when(it.detectedAt)}</span>
      </div>
      <div className={c.summary}>{it.summary}</div>
      {it.idea && <div className={c.idea}><Lightbulb size={16} style={{ flex: "none", marginTop: 2 }} /><span>{it.idea}</span></div>}
      {!closed && (
        <div className={c.form}>
          <TextField className={c.input} size="small" variant="outlined" placeholder="Nº do protocolo" value={number} onChange={(e) => setNumber(e.target.value)} inputProps={{ maxLength: 60, "aria-label": "Número do protocolo" }} />
          <TextField className={c.input} size="small" variant="outlined" placeholder="Nome ou assunto do protocolo" value={name} onChange={(e) => setName(e.target.value)} inputProps={{ maxLength: 160, "aria-label": "Nome ou assunto do protocolo" }} />
          <Button className={c.btn} variant="contained" color="primary" disableElevation disabled={busy || !changed} onClick={() => save({ protocolNumber: number, protocolName: name }, "Protocolo registrado.")}>Registrar</Button>
        </div>
      )}
      {closed && (it.protocolNumber || it.protocolName) && <div className={c.note}>Protocolo {it.protocolNumber || "sem número"}{it.protocolName ? ` · ${it.protocolName}` : ""}{it.resolvedAt ? ` · encerrada em ${when(it.resolvedAt)}` : ""}</div>}
      <div className={c.actions}>
        {!closed && <Button className={c.btn} size="small" variant="outlined" startIcon={<Check size={15} />} disabled={busy} onClick={() => save({ status: "resolvida" }, "Pendência resolvida.")}>Resolvida</Button>}
        {!closed && <Button className={c.btn} size="small" startIcon={<X size={15} />} disabled={busy} onClick={() => save({ status: "dispensada" }, "Pendência dispensada.")}>Não é pendência</Button>}
        {closed && <Button className={c.btn} size="small" disabled={busy} onClick={() => save({ status: it.protocolNumber ? "registrada" : "aberta" }, "Pendência reaberta.")}>Reabrir</Button>}
        {it.ticketId && <Button className={c.btn} size="small" startIcon={<MessageSquare size={15} />} onClick={() => onOpen(it.ticketId)}>Ver a conversa</Button>}
      </div>
    </article>
  );
};

export default function IssuesPanel({ onCount }) {
  const c = useStyles();
  const history = useHistory();
  const [status, setStatus] = useState("abertas");
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ kind: "protocolo", summary: "", protocolNumber: "", protocolName: "" });
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    api.get("/tutoria/issues", { params: { status } }).then(({ data: d }) => {
      setData(d);
      if (onCount) onCount((d.counts.aberta || 0) + (d.counts.registrada || 0));
    }).catch(() => setFailed(true));
  }, [status, onCount]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/tutoria/audit/settings").then(({ data: d }) => setCfg(d)).catch(() => setCfg(null)); }, []);

  const saveCfg = async (patch) => {
    try { const { data: d } = await api.put("/tutoria/audit/settings", patch); setCfg(d); } catch (err) { toastError(err); }
  };
  const runNow = async () => {
    setRunning(true);
    try {
      const { data: r } = await api.post("/tutoria/audit/run");
      toast.success(r.reason === "no_api_key" ? "Nenhuma chave de IA configurada: conecte um agente em Agentes de IA." : r.reason === "daily_limit" ? "O limite de conversas de hoje já foi lido." : `Leitura feita: ${r.read} conversa${r.read === 1 ? "" : "s"}, ${r.found} pendência${r.found === 1 ? "" : "s"} nova${r.found === 1 ? "" : "s"}.`);
      load();
    } catch (err) { toastError(err); }
    setRunning(false);
  };
  const add = async () => {
    try {
      await api.post("/tutoria/issues", draft);
      toast.success("Pendência registrada.");
      setAdding(false);
      setDraft({ kind: "protocolo", summary: "", protocolNumber: "", protocolName: "" });
      load();
    } catch (err) { toastError(err); }
  };

  const counts = (data && data.counts) || {};
  const countOf = (k) => (k === "abertas" ? (counts.aberta || 0) + (counts.registrada || 0) : counts[k] || 0);
  return (
    <div className={c.wrap}>
      <div className={c.note}>A IA lê as conversas da tutoria a cada meia hora, só quando há mensagem nova, e aponta o que ficou pendente: chamado ou protocolo aberto, retorno prometido, documento pedido ou problema de acesso. Os tutores não veem esta lista.</div>
      <div className={c.bar} role="group" aria-label="Situação">
        {FILTERS.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={status === k} className={`${c.chip} ${status === k ? c.chipOn : ""}`} onClick={() => setStatus(k)}>{l} <span className={c.count}>{countOf(k)}</span></button>
        ))}
        <span style={{ flex: 1 }} />
        <Button className={c.btn} size="small" variant="outlined" startIcon={running ? <CircularProgress size={14} /> : <Sparkles size={15} />} disabled={running} onClick={runNow}>Ler as conversas agora</Button>
        <Button className={c.btn} size="small" variant="contained" color="primary" disableElevation startIcon={<Plus size={15} />} onClick={() => setAdding(true)}>Nova pendência</Button>
      </div>
      {cfg && (
        <div className={c.settings}>
          <Switch size="small" color="primary" checked={cfg.enabled} onChange={(e) => saveCfg({ enabled: e.target.checked })} inputProps={{ "aria-label": "Leitura automática ligada" }} />
          <span>{cfg.enabled ? "Leitura automática ligada" : "Leitura automática desligada"}</span>
          <span>· até</span>
          <TextField size="small" variant="outlined" type="number" value={cfg.maxPerDay} style={{ width: 90 }} inputProps={{ min: 1, max: 500, "aria-label": "Conversas por dia" }}
            onChange={(e) => setCfg({ ...cfg, maxPerDay: e.target.value })} onBlur={() => saveCfg({ maxPerDay: cfg.maxPerDay })} />
          <span>conversas por dia, com o modelo mais barato da IA.</span>
        </div>
      )}
      {failed && !data ? <ErrorState onRetry={load} /> : !data ? (
        <div style={{ textAlign: "center", padding: 32 }}><CircularProgress size={24} /></div>
      ) : data.items.length === 0 ? (
        <div className={c.note} style={{ textAlign: "center", padding: "32px 12px", border: "1px dashed var(--line-strong)", borderRadius: 12 }}>
          {status === "abertas" ? "Nenhuma pendência aberta na tutoria." : "Nada aqui."}
          <div style={{ marginTop: 8 }}><Button size="small" startIcon={<RefreshCw size={14} />} onClick={load}>Atualizar</Button></div>
        </div>
      ) : data.items.map((it) => <IssueCard key={it.id} c={c} it={it} onSaved={load} onOpen={(id) => history.push(`/tickets/${id}`)} />)}

      <Dialog open={adding} onClose={() => setAdding(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova pendência da tutoria</DialogTitle>
        <DialogContent style={{ display: "grid", gap: 12 }}>
          <TextField select size="small" variant="outlined" label="Tipo" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
            {KINDS.map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
          </TextField>
          <TextField size="small" variant="outlined" label="O que está pendente" multiline minRows={2} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} inputProps={{ maxLength: 280 }} />
          <TextField size="small" variant="outlined" label="Nº do protocolo (opcional)" value={draft.protocolNumber} onChange={(e) => setDraft({ ...draft, protocolNumber: e.target.value })} inputProps={{ maxLength: 60 }} />
          <TextField size="small" variant="outlined" label="Nome ou assunto do protocolo (opcional)" value={draft.protocolName} onChange={(e) => setDraft({ ...draft, protocolName: e.target.value })} inputProps={{ maxLength: 160 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdding(false)}>Cancelar</Button>
          <Button variant="contained" color="primary" disableElevation disabled={!draft.summary.trim()} onClick={add}>Registrar</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
