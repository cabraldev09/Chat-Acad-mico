import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import {
  Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, MenuItem, TextField, Typography, makeStyles,
} from "@material-ui/core";
import { Autocomplete } from "@material-ui/lab";
import { Download, MessageSquare, Send } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { downloadFile } from "../../utils/saveBlob";
import WhatsPreview from "./Preview";

const useStyles = makeStyles((theme) => {
  const line = theme.palette.type === "dark" ? "rgba(255,255,255,.09)" : "#e3e9f1";
  return {
    card: { background: theme.palette.cards.background, border: `1px solid ${line}`, borderRadius: 16, padding: theme.spacing(2.25), marginBottom: theme.spacing(2) },
    hint: { fontSize: 13, color: theme.palette.text.secondary },
    toolbar: { display: "flex", gap: theme.spacing(1.25), flexWrap: "wrap", alignItems: "center", marginBottom: theme.spacing(1.5) },
    row: { display: "flex", gap: 12, padding: "12px 0", borderTop: `1px solid ${line}`, flexWrap: "wrap", alignItems: "flex-start", "&:first-of-type": { borderTop: 0 } },
    when: { width: 92, flex: "none", fontSize: 12.5, color: theme.palette.text.secondary, lineHeight: 1.35 },
    chip: { fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 999, display: "inline-block" },
    msg: { marginTop: 8 },
    grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: theme.spacing(2), [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr" } },
  };
});

export const KIND_LABEL = { nps: "Pesquisa de satisfação", risk: "Mensagem de retenção", remat: "Aviso de rematrícula", custom: "Mensagem escrita na hora" };
const KIND_STYLE = {
  nps: { background: "rgba(6,147,227,.14)", color: "#0b6bb5" },
  risk: { background: "rgba(234,88,12,.15)", color: "#c2410c" },
  remat: { background: "rgba(14,165,233,.15)", color: "#0369a1" },
  custom: { background: "rgba(100,116,139,.18)", color: "#475569" },
};
const when = (iso) => { const d = new Date(iso); return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`; };
const RANGES = [["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"], ["90", "Últimos 90 dias"], ["365", "Último ano"]];
const periodOf = (range) => {
  const day = (t) => t.toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });
  const to = new Date();
  return { from: day(new Date(to.getTime() - (Number(range) - 1) * 86400000)), to: day(to) };
};

// choosing who gets a message and seeing it before it goes
export const Composer = ({ open, onClose, onSent, manager, initialIds = [] }) => {
  const classes = useStyles();
  const [kind, setKind] = useState("nps");
  const [text, setText] = useState("");
  const [picked, setPicked] = useState([]);
  const [options, setOptions] = useState([]);
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => { if (open) { setKind("nps"); setText(""); setPicked([]); setResult(null); setPreview(null); } }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => { api.get("/retention/students", { params: { search } }).then(({ data }) => setOptions(data)).catch(() => undefined); }, 250);
    return () => clearTimeout(t);
  }, [open, search]);
  useEffect(() => {
    if (!open || !initialIds.length) return;
    api.get("/retention/students", { params: { search: "" } }).then(({ data }) => setPicked(data.filter((s) => initialIds.includes(s.id)))).catch(() => undefined);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // the message as it will arrive, for the first chosen students
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => {
      api.post("/retention/preview", { kind: kind === "remat" ? "remat" : kind, text, leadIds: picked.slice(0, 3).map((p) => p.id) })
        .then(({ data }) => setPreview(data)).catch(() => setPreview(null));
    }, 250);
    return () => clearTimeout(t);
  }, [open, kind, text, picked]);

  const addRisk = async () => {
    try {
      const { data } = await api.get("/retention/risk");
      const ids = new Set(picked.map((p) => p.id));
      const more = data.students.filter((s) => !ids.has(s.id)).slice(0, 50 - picked.length).map((s) => ({ id: s.id, name: s.name, polo: s.polo, tutor: s.tutor }));
      setPicked([...picked, ...more]);
      toast.info(more.length ? `${more.length} aluno${more.length === 1 ? "" : "s"} em risco adicionado${more.length === 1 ? "" : "s"}.` : "Ninguém em risco para adicionar.");
    } catch (err) { toastError(err); }
  };

  const send = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/retention/send", { kind, text: kind === "custom" ? text : undefined, leadIds: picked.map((p) => p.id) });
      setResult(data);
      onSent();
    } catch (err) { toastError(err); }
    setBusy(false);
  };

  const canSend = picked.length > 0 && (kind !== "custom" || text.trim().length > 0);
  const label = (s) => `${s.name}${s.polo ? ` · ${s.polo}` : ""}${s.tutor ? ` · tutor ${s.tutor}` : ""}`;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{result ? "Envio concluído" : "Novo envio"}</DialogTitle>
      <DialogContent dividers>
        {busy && <LinearProgress />}
        {result ? (
          <div>
            <Typography gutterBottom><b>{result.sent}</b> enviado{result.sent === 1 ? "" : "s"}{result.failed ? <> · <b style={{ color: "#dc2626" }}>{result.failed}</b> com problema</> : ""}.</Typography>
            {result.results.map((r) => (
              <div key={r.leadId} className={classes.row} style={{ padding: "6px 0" }}>
                <span style={{ flex: 1 }}>{r.name || `Aluno ${r.leadId}`}</span>
                <span className={classes.chip} style={r.ok ? { background: "rgba(22,163,74,.15)", color: "#15803d" } : { background: "rgba(220,38,38,.14)", color: "#b91c1c" }}>{r.ok ? "Enviada" : r.error}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className={classes.grid}>
            <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
              <TextField select size="small" variant="outlined" label="O que enviar" value={kind} onChange={(e) => setKind(e.target.value)}>
                <MenuItem value="nps">Pesquisa de satisfação (nota de 0 a 10)</MenuItem>
                <MenuItem value="risk">Mensagem de retenção (a das configurações)</MenuItem>
                <MenuItem value="custom">Escrever uma mensagem agora</MenuItem>
              </TextField>
              {kind === "custom" && (
                <TextField multiline rows={4} size="small" variant="outlined" label="Mensagem (use {{nome}} para o primeiro nome)" value={text} onChange={(e) => setText(e.target.value)} inputProps={{ maxLength: 1000 }} />
              )}
              {kind !== "custom" && <Typography className={classes.hint}>O texto vem das configurações{manager ? " (aba Configurar)" : ""}. A prévia ao lado mostra como o aluno vai receber.</Typography>}
              <Autocomplete
                multiple options={options} value={picked} onChange={(e, v) => setPicked(v.slice(0, 50))} getOptionLabel={label} getOptionSelected={(o, v) => o.id === v.id}
                onInputChange={(e, v, reason) => { if (reason === "input") setSearch(v); }} filterOptions={(x) => x} noOptionsText="Nenhum aluno encontrado"
                renderTags={(value, getTagProps) => value.map((o, i) => <Chip size="small" label={o.name} {...getTagProps({ index: i })} />)}
                renderInput={(params) => <TextField {...params} variant="outlined" size="small" label="Para quem" placeholder="Busque pelo nome ou telefone" />}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Button size="small" variant="outlined" onClick={addRisk}>Adicionar quem está em risco</Button>
                {picked.length > 0 && <Button size="small" onClick={() => setPicked([])}>Limpar</Button>}
                <span className={classes.hint}>{picked.length} escolhido{picked.length === 1 ? "" : "s"} (até 50)</span>
              </div>
            </div>
            <div>
              <Typography variant="subtitle2" gutterBottom>Como o aluno vai receber</Typography>
              {preview && preview.samples.map((sm) => (
                <div key={`${sm.leadId}-${sm.name}`} style={{ marginBottom: 10 }}>
                  <WhatsPreview text={sm.text} name={sm.name} buttons={preview.buttons} extra={{}} />
                </div>
              ))}
              {preview && preview.buttons.length > 0 && <Typography className={classes.hint}>Os botões aparecem na conexão da API oficial (Cloud). Nas demais, o aluno responde digitando a nota de 0 a 10.</Typography>}
              {picked.length > 3 && <Typography className={classes.hint}>E mais {picked.length - 3} aluno{picked.length - 3 === 1 ? "" : "s"} com a mesma mensagem.</Typography>}
            </div>
          </div>
        )}
      </DialogContent>
      <DialogActions>
        {result ? <Button variant="contained" color="primary" onClick={onClose}>Fechar</Button> : (
          <>
            <Button onClick={onClose}>Cancelar</Button>
            <Button variant="contained" color="primary" startIcon={<Send size={15} />} disabled={!canSend || busy} onClick={send}>
              {picked.length ? `Enviar para ${picked.length} aluno${picked.length === 1 ? "" : "s"}` : "Enviar"}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

// the log: what was sent, to whom, by whom, and how the student answered
const Envios = ({ manager, canCompose }) => {
  const classes = useStyles();
  const history = useHistory();
  const [range, setRange] = useState("30");
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState({});
  const [compose, setCompose] = useState(false);
  const period = useMemo(() => periodOf(range), [range]);

  const load = useCallback((p = 1, replace = true) => {
    api.get("/retention/log", { params: { ...period, kind: kind || undefined, search: search || undefined, page: p } })
      .then(({ data }) => { setTotal(data.total); setPage(p); setRows((cur) => (replace || !cur ? data.rows : [...cur, ...data.rows])); })
      .catch(toastError);
  }, [period, kind, search]);
  useEffect(() => { const t = setTimeout(() => load(1, true), search ? 300 : 0); return () => clearTimeout(t); }, [load, search]);

  return (
    <div>
      <Composer open={compose} onClose={() => setCompose(false)} onSent={() => load(1, true)} manager={manager} />
      <div className={classes.toolbar}>
        <TextField select size="small" variant="outlined" label="Período" value={range} onChange={(e) => setRange(e.target.value)} style={{ width: 170 }}>
          {RANGES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
        </TextField>
        <TextField select size="small" variant="outlined" label="Tipo" value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 220 }}>
          <MenuItem value="">Todos</MenuItem>
          {Object.entries(KIND_LABEL).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
        </TextField>
        <TextField size="small" variant="outlined" label="Buscar aluno" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 190 }} />
        <span style={{ flex: 1 }} />
        <Button size="small" variant="outlined" startIcon={<Download size={15} />} onClick={() => downloadFile("/retention/log.csv", { ...period, kind: kind || undefined, search: search || undefined }, "envios-retencao.csv")}>Baixar planilha</Button>
        {canCompose && <Button size="small" variant="contained" color="primary" startIcon={<Send size={15} />} onClick={() => setCompose(true)}>Novo envio</Button>}
      </div>
      <div className={classes.card}>
        {!rows && <LinearProgress />}
        {rows && rows.length === 0 && <Typography className={classes.hint}>Nenhum envio neste período. {canCompose ? "Use “Novo envio” para escolher os alunos e mandar uma mensagem." : ""}</Typography>}
        {rows && rows.map((r) => (
          <div key={r.id} className={classes.row}>
            <div className={classes.when}>{when(r.createdAt)}</div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className={classes.chip} style={KIND_STYLE[r.kind]}>{KIND_LABEL[r.kind]}</span>
                <b>{r.lead}</b>
                {r.status === "failed" && <span className={classes.chip} style={{ background: "rgba(220,38,38,.14)", color: "#b91c1c" }} title={r.error || ""}>Falhou</span>}
              </div>
              <div className={classes.hint}>
                {[r.polo, r.tutor ? `tutor: ${r.tutor}` : null, `enviado por ${r.sentBy || "o sistema (automático)"}`, r.withButtons ? "com botões" : null].filter(Boolean).join(" · ")}
              </div>
              {r.kind === "nps" && r.surveyStatus && (
                <div style={{ marginTop: 4, fontSize: 13 }}>
                  {r.surveyStatus === "answered"
                    ? <>Respondeu <b style={{ color: Number(r.score) >= 9 ? "#15803d" : Number(r.score) >= 7 ? "#b45309" : "#dc2626" }}>nota {r.score}</b>{r.comment ? ` · “${r.comment}”` : ""}</>
                    : <span className={classes.hint}>Ainda sem resposta</span>}
                </div>
              )}
              {open[r.id] && <div className={classes.msg}><WhatsPreview text={r.body} name={r.lead} note={r.status === "failed" ? `Não foi enviada: ${r.error || "erro ao enviar"}` : undefined} /></div>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Button size="small" onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}>{open[r.id] ? "Esconder" : "Ver mensagem"}</Button>
              {manager && <Button size="small" startIcon={<MessageSquare size={14} />} onClick={() => history.push(`/crm?lead=${r.leadId}`)}>Abrir lead</Button>}
            </div>
          </div>
        ))}
        {rows && rows.length < total && <Button style={{ marginTop: 8 }} onClick={() => load(page + 1, false)}>Mostrar mais ({total - rows.length})</Button>}
      </div>
    </div>
  );
};

export default Envios;
