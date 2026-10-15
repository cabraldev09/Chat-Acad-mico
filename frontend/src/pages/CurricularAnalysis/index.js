import React, { useCallback, useEffect, useRef, useState } from "react";
import { useHistory, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import {
  Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, MenuItem, Paper, TextField, Typography,
} from "@material-ui/core";
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCopy, FilePlus2, Search, Trash2 } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { Kpi, copyText, errorText, useShared } from "../Analysis/shared";

// "Análise curricular": the PDF of the candidate's curricular analysis (SIAA) becomes the forecast of the entry,
// semester by semester, with the text ready for WhatsApp. The numbers come from the academic engine, never from an AI.

const RELIABILITY = { HIGH: ["Alta", "good"], REVIEW_RECOMMENDED: ["Revisão recomendada", "warn"], REVIEW_REQUIRED: ["Revisão obrigatória", "bad"] };
const STATUS_LABEL = { EXEMPTED: "Dispensada", PENDING: "Pendente", REVIEW: "Revisar" };

const suggestTerm = () => {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() < 6 ? `${y}.2` : `${y + 1}.1`;
};

const NewDialog = ({ open, onClose, onCreated }) => {
  const [file, setFile] = useState(null);
  const [entry, setEntry] = useState("");
  const [term, setTerm] = useState(suggestTerm());
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  useEffect(() => { if (open) { setFile(null); setEntry(""); setName(""); setTerm(suggestTerm()); setBusy(false); } }, [open]);

  const send = async () => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (entry) form.append("entryPeriod", entry);
      form.append("startTerm", term);
      if (name.trim()) form.append("candidateName", name.trim());
      const { data } = await api.post("/analysis/curricular", form);
      toast.success("Análise pronta.");
      onCreated(data);
    } catch (e) { toast.error(errorText(e), { autoClose: 9000 }); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Nova análise curricular</DialogTitle>
      <DialogContent>
        <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => setFile(e.target.files[0] || null)} />
        <Button variant="outlined" fullWidth startIcon={<FilePlus2 size={16} />} onClick={() => input.current && input.current.click()} style={{ justifyContent: "flex-start", marginBottom: 8 }}>
          {file ? file.name : "Escolher o PDF da análise curricular"}
        </Button>
        <TextField fullWidth size="small" variant="outlined" margin="dense" label="Nome do candidato (opcional)" value={name} onChange={(e) => setName(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField select fullWidth size="small" variant="outlined" margin="dense" label="Período de ingresso" value={entry} onChange={(e) => setEntry(e.target.value)} InputLabelProps={{ shrink: true }}
          helperText="Em qual semestre da grade o candidato entra. Se ficar em branco, uso o que o PDF informar.">
          <MenuItem value="">Usar o do PDF</MenuItem>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <MenuItem key={n} value={n}>{n}º período</MenuItem>)}
        </TextField>
        <TextField fullWidth size="small" variant="outlined" margin="dense" label="Primeiro semestre letivo" value={term} onChange={(e) => setTerm(e.target.value)} InputLabelProps={{ shrink: true }} helperText="Formato 2026.2" />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined" color="secondary" disabled={busy}>Cancelar</Button>
        <Button onClick={send} variant="contained" color="primary" disabled={!file || busy}>{busy ? <CircularProgress size={18} /> : "Analisar"}</Button>
      </DialogActions>
    </Dialog>
  );
};

const List = () => {
  const c = useShared();
  const history = useHistory();
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const load = useCallback(() => {
    api.get("/analysis/curricular", { params: { search: search.trim() || undefined } }).then(({ data }) => setRows(data)).catch((e) => { toastError(e); setRows([]); });
  }, [search]);
  useEffect(() => { clearTimeout(timer.current); timer.current = setTimeout(load, 250); return () => clearTimeout(timer.current); }, [load]);

  return (
    <MainContainer>
      <MainHeader>
        <Title>Análise curricular</Title>
        <MainHeaderButtonsWrapper>
          <TextField size="small" variant="outlined" placeholder="Buscar candidato ou curso" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 230 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }} />
          <Button variant="contained" color="primary" startIcon={<FilePlus2 size={16} />} onClick={() => setOpen(true)}>Nova análise</Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>
      <div className={c.body}>
        {rows === null ? <CircularProgress size={26} /> : rows.length === 0 ? (
          <Paper variant="outlined" className={c.card} style={{ maxWidth: 620 }}>
            <Typography style={{ fontWeight: 700 }}>Nenhuma análise ainda</Typography>
            <Typography variant="body2" color="textSecondary">Envie o PDF da análise curricular do candidato. O sistema lê a tabela, calcula quantas disciplinas faltam e mostra, semestre a semestre, quando ele termina o curso.</Typography>
          </Paper>
        ) : (
          <div className={c.grid}>
            {rows.map((r) => {
              const sim = r.result && r.result.simulation;
              const rel = r.result && RELIABILITY[r.result.reliability];
              return (
                <Paper key={r.id} variant="outlined" className={c.card} style={{ cursor: "pointer" }} onClick={() => history.push(`/analise-curricular/${r.id}`)}>
                  <Typography style={{ fontWeight: 700 }}>{r.candidateName || "Candidato sem nome"}</Typography>
                  <Typography variant="body2" color="textSecondary">{r.courseName || r.originalName}</Typography>
                  <div className={c.row}>
                    <span className={c.chip}>{r.entryPeriod ? `Ingresso: ${r.entryPeriod}º período` : "Ingresso pendente"}</span>
                    {sim && sim.estimatedCompletionTerm && <span className={c.chip}>Formatura: {sim.estimatedCompletionTerm}</span>}
                    {rel && <span className={c.chip}>{rel[0]}</span>}
                  </div>
                  <span className={c.muted}>{new Date(r.createdAt).toLocaleString("pt-BR")}</span>
                </Paper>
              );
            })}
          </div>
        )}
      </div>
      <NewDialog open={open} onClose={() => setOpen(false)} onCreated={(a) => { setOpen(false); history.push(`/analise-curricular/${a.id}`); }} />
    </MainContainer>
  );
};

const Detail = ({ id }) => {
  const c = useShared();
  const history = useHistory();
  const [a, setA] = useState(null);
  const [entry, setEntry] = useState("");
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);

  const apply = useCallback((data) => { setA(data); setEntry(data.entryPeriod || ""); setTerm(data.startTerm || ""); }, []);
  useEffect(() => { api.get(`/analysis/curricular/${id}`).then(({ data }) => apply(data)).catch((e) => { toastError(e); history.replace("/analise-curricular"); }); }, [id, apply, history]);

  const save = async () => {
    setBusy(true);
    try { const { data } = await api.put(`/analysis/curricular/${id}`, { entryPeriod: entry === "" ? null : Number(entry), startTerm: term }); apply(data); toast.success("Previsão recalculada."); } catch (e) { toast.error(errorText(e)); }
    setBusy(false);
  };
  const setStatus = async (s, status) => {
    try { const { data } = await api.put(`/analysis/curricular/${id}/subject/${s.id}`, { status }); apply(data); toast.success("Linha corrigida. A previsão foi recalculada."); } catch (e) { toast.error(errorText(e)); }
  };
  const remove = async () => { try { await api.delete(`/analysis/curricular/${id}`); toast.success("Análise excluída."); history.replace("/analise-curricular"); } catch (e) { toastError(e); } };

  if (!a) return <MainContainer><div style={{ padding: 24 }}><CircularProgress size={26} /></div></MainContainer>;
  const r = a.result || {};
  const sim = r.simulation;
  const totals = r.totals || { total: 0, exempted: 0, pending: 0, review: 0 };
  const rel = RELIABILITY[r.reliability];
  const dirty = String(entry) !== String(a.entryPeriod || "") || term !== (a.startTerm || "");
  const periods = {};
  (a.subjects || []).forEach((s) => { (periods[s.period] = periods[s.period] || []).push(s); });

  return (
    <MainContainer>
      <MainHeader>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <IconButton size="small" aria-label="Voltar" onClick={() => history.push("/analise-curricular")}><ArrowLeft size={20} /></IconButton>
          <Title>{a.candidateName || "Análise curricular"}</Title>
        </div>
        <MainHeaderButtonsWrapper>
          <Button variant="outlined" startIcon={<Trash2 size={16} />} onClick={() => setDel(true)}>Excluir</Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>
      <div className={c.body}>
        <div style={{ display: "grid", gap: 16, maxWidth: 1100 }}>
          <Paper variant="outlined" className={c.card}>
            <Typography style={{ fontWeight: 700, fontSize: 17 }}>{a.courseName || a.originalName}</Typography>
            <span className={c.muted}>{[a.matrixLabel, a.campus, a.modality].filter(Boolean).join(" · ")}</span>
            <div className={c.row} style={{ marginTop: 6 }}>
              <TextField select size="small" variant="outlined" label="Período de ingresso" value={entry} onChange={(e) => setEntry(e.target.value)} style={{ minWidth: 190 }} InputLabelProps={{ shrink: true }}>
                <MenuItem value="">Não informado</MenuItem>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <MenuItem key={n} value={n}>{n}º período</MenuItem>)}
              </TextField>
              <TextField size="small" variant="outlined" label="Primeiro semestre letivo" value={term} onChange={(e) => setTerm(e.target.value)} style={{ width: 190 }} InputLabelProps={{ shrink: true }} />
              <Button variant="contained" color="primary" onClick={save} disabled={busy || !dirty}>Recalcular</Button>
              {a.headerEntryPeriod && a.entryPeriod && a.headerEntryPeriod !== a.entryPeriod && <span className={c.muted}><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> O PDF indica o {a.headerEntryPeriod}º período.</span>}
            </div>
          </Paper>

          <div className={c.kpis}>
            <Kpi value={totals.total} label="Disciplinas na grade" />
            <Kpi value={totals.exempted} label="Dispensadas" tone="good" />
            <Kpi value={totals.pending} label="Pendentes" tone={totals.pending ? "warn" : undefined} />
            {totals.review > 0 && <Kpi value={totals.review} label="A revisar" tone="bad" />}
            <Kpi value={r.previousBacklogCount === null || r.previousBacklogCount === undefined ? "—" : r.previousBacklogCount} label="Pendências de períodos anteriores" />
            <Kpi value={sim && sim.estimatedCompletionTerm ? sim.estimatedCompletionTerm : "—"} label="Previsão de formatura" tone={sim && !sim.incomplete ? "good" : "warn"} />
            <Kpi value={sim ? sim.semesters.length : "—"} label="Semestres previstos" />
          </div>

          {rel && <div className={c.row}><CheckCircle2 size={17} color={rel[1] === "good" ? "#15803d" : "#b45309"} /><Typography variant="body2">Confiabilidade: <b>{rel[0]}</b>{r.reviewReasons && r.reviewReasons.length ? ` — ${r.reviewReasons.join("; ")}` : ""}</Typography></div>}

          {r.narrative && (
            <Paper variant="outlined" className={c.card}>
              <div className={c.row}>
                <Typography style={{ fontWeight: 700, flex: 1 }}>Texto para o WhatsApp</Typography>
                <Button size="small" variant="outlined" startIcon={<ClipboardCopy size={15} />} onClick={() => copyText(r.narrative.text, "Texto copiado. É só colar na conversa.")}>Copiar</Button>
              </div>
              <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit", fontSize: 14, lineHeight: 1.5 }}>{r.narrative.text}</pre>
            </Paper>
          )}

          {sim && (
            <Paper variant="outlined" className={c.card}>
              <Typography style={{ fontWeight: 700 }}>Semestre a semestre</Typography>
              <div className={c.tableWrap}>
                <table className={c.table}>
                  <thead><tr><th>Semestre</th><th>Período da grade</th><th>Disciplinas do período</th><th>Dispensadas</th><th>A cursar</th><th>Adaptações</th><th>Carga</th><th>Sobram</th></tr></thead>
                  <tbody>
                    {sim.semesters.map((s) => (
                      <tr key={s.index}>
                        <td><b>{s.term}</b>{s.isAdditional ? " (adicional)" : ""}</td>
                        <td>{s.periodNumber ? `${s.periodNumber}º` : "—"}</td>
                        <td>{s.subjectsInPeriod}</td>
                        <td>{s.exemptedInPeriod}</td>
                        <td>{s.regularSubjectsToTake}</td>
                        <td>{s.subjectsFromBacklog}</td>
                        <td>{s.semesterLoad} / {s.maximumCapacity}</td>
                        <td>{s.remainingBacklog}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <span className={c.muted}>A previsão depende de aprovação, rematrícula no prazo, oferta das disciplinas e regras da instituição.</span>
            </Paper>
          )}

          {(r.warnings || []).length > 0 && (
            <Paper variant="outlined" className={c.card}>
              <Typography style={{ fontWeight: 700 }}>Avisos</Typography>
              {r.warnings.map((w, i) => (
                <div key={i} className={c.row} style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                  <AlertTriangle size={16} color={w.severity === "CRITICAL" ? "#dc2626" : "#d97706"} style={{ flex: "none", marginTop: 2 }} />
                  <Typography variant="body2">{w.message}</Typography>
                </div>
              ))}
            </Paper>
          )}

          <Paper variant="outlined" className={c.card}>
            <Typography style={{ fontWeight: 700 }}>Disciplinas lidas do PDF</Typography>
            <span className={c.muted}>Se alguma linha foi lida errado, corrija a situação: a previsão é recalculada na hora.</span>
            {Object.keys(periods).sort((x, y) => Number(x) - Number(y)).map((p) => (
              <div key={p}>
                <Typography style={{ fontWeight: 600, margin: "8px 0 4px" }}>{p}º período</Typography>
                <div className={c.tableWrap}>
                  <table className={c.table}>
                    <tbody>
                      {periods[p].map((s) => (
                        <tr key={s.id}>
                          <td style={{ width: "46%" }}>{s.name}</td>
                          <td style={{ width: 70 }}>{s.workload} h</td>
                          <td style={{ color: "inherit", opacity: 0.75 }}>{s.usedSubject || "—"}</td>
                          <td style={{ width: 150 }}>
                            <TextField select size="small" variant="outlined" value={s.status} onChange={(e) => setStatus(s, e.target.value)}>
                              {Object.entries(STATUS_LABEL).map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
                            </TextField>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </Paper>
        </div>
      </div>
      <Dialog open={del} onClose={() => setDel(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Excluir esta análise?</DialogTitle>
        <DialogContent><Typography variant="body2">A análise de {a.candidateName || "este candidato"} sai da lista. O PDF não é guardado pelo sistema.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDel(false)} variant="outlined" color="secondary">Cancelar</Button>
          <Button onClick={remove} variant="contained" color="primary">Excluir</Button>
        </DialogActions>
      </Dialog>
    </MainContainer>
  );
};

const CurricularAnalysis = () => {
  const { id } = useParams();
  return id ? <Detail key={id} id={id} /> : <List />;
};

export default CurricularAnalysis;
