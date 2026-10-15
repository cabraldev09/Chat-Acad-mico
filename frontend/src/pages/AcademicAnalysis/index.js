import React, { useCallback, useEffect, useRef, useState } from "react";
import { useHistory, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import {
  Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, MenuItem, Paper, TextField, Typography,
} from "@material-ui/core";
import { AlertTriangle, ArrowLeft, ClipboardCopy, FilePlus2, Search, Trash2 } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { Kpi, copyText, errorText, useShared } from "../Analysis/shared";

// "Análise acadêmica": the student's extract or history (official or simple) becomes where the student is, what is
// pending, how many disciplines can still be added and when the course ends. Deterministic: no AI decides anything.

export const DOC_LABEL = {
  OFFICIAL_ACADEMIC_HISTORY: "Histórico oficial",
  SIMPLE_ACADEMIC_HISTORY: "Histórico simples (conferência)",
  CURRICULAR_EXTRACT: "Extrato curricular",
  UNKNOWN_ACADEMIC_DOCUMENT: "Documento não identificado",
};
export const RESULT_LABEL = { NO_PENDING: ["Sem pendências", "good"], CAN_ADD: ["Pode incluir disciplinas", "good"], NEAR_LIMIT: ["Perto do limite", "warn"], LIMIT_REACHED: ["Limite atingido", "warn"], MANUAL_REVIEW_REQUIRED: ["Precisa de conferência", "bad"] };
const STATUSES = ["A CURSAR", "CURSANDO", "AE", "AE*", "APROVADO", "REPROVADO", "DISPENSADO", "CONCLUIDO"];

const NewDialog = ({ open, onClose, onCreated }) => {
  const [file, setFile] = useState(null);
  const [studentId, setStudentId] = useState("");
  const [students, setStudents] = useState([]);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  useEffect(() => {
    if (!open) return;
    setFile(null); setStudentId(""); setBusy(false);
    api.get("/students").then(({ data }) => setStudents(data)).catch(() => setStudents([]));
  }, [open]);
  const send = async () => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (studentId) form.append("studentId", studentId);
      const { data } = await api.post("/analysis/academic", form);
      toast.success(data.reused ? "Este documento já estava analisado: nada mudou." : "Análise pronta.");
      onCreated(data);
    } catch (e) { toast.error(errorText(e), { autoClose: 9000 }); }
    setBusy(false);
  };
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Nova análise acadêmica</DialogTitle>
      <DialogContent>
        <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => setFile(e.target.files[0] || null)} />
        <Button variant="outlined" fullWidth startIcon={<FilePlus2 size={16} />} onClick={() => input.current && input.current.click()} style={{ justifyContent: "flex-start", marginBottom: 8 }}>
          {file ? file.name : "Escolher o PDF (extrato ou histórico)"}
        </Button>
        <TextField select fullWidth size="small" variant="outlined" margin="dense" label="Aluno do portal (opcional)" value={studentId} onChange={(e) => setStudentId(e.target.value)} InputLabelProps={{ shrink: true }}
          helperText="Ligando a um aluno, a análise entra no histórico dele e aparece no Portal do Aluno.">
          <MenuItem value="">Sem aluno (análise avulsa)</MenuItem>
          {students.map((s) => <MenuItem key={s.id} value={s.id}>{s.name} · RGM {s.rgm}</MenuItem>)}
        </TextField>
        <Typography variant="caption" color="textSecondary">Aceita Extrato/Grade curricular, Histórico escolar oficial e Histórico simples para conferência. O PDF precisa ter texto selecionável.</Typography>
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
    api.get("/analysis/academic", { params: { search: search.trim() || undefined } }).then(({ data }) => setRows(data)).catch((e) => { toastError(e); setRows([]); });
  }, [search]);
  useEffect(() => { clearTimeout(timer.current); timer.current = setTimeout(load, 250); return () => clearTimeout(timer.current); }, [load]);
  return (
    <MainContainer>
      <MainHeader>
        <Title>Análise acadêmica</Title>
        <MainHeaderButtonsWrapper>
          <TextField size="small" variant="outlined" placeholder="Buscar aluno, RGM ou curso" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 230 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }} />
          <Button variant="contained" color="primary" startIcon={<FilePlus2 size={16} />} onClick={() => setOpen(true)}>Nova análise</Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>
      <div className={c.body}>
        {rows === null ? <CircularProgress size={26} /> : rows.length === 0 ? (
          <Paper variant="outlined" className={c.card} style={{ maxWidth: 640 }}>
            <Typography style={{ fontWeight: 700 }}>Nenhuma análise ainda</Typography>
            <Typography variant="body2" color="textSecondary">Envie o extrato ou o histórico do aluno. O sistema mostra o período atual, as pendências, quantas disciplinas ainda podem ser incluídas e a previsão de formatura.</Typography>
          </Paper>
        ) : (
          <div className={c.grid}>
            {rows.map((r) => {
              const res = RESULT_LABEL[r.status];
              return (
                <Paper key={r.id} variant="outlined" className={c.card} style={{ cursor: "pointer" }} onClick={() => history.push(`/analise-academica/${r.id}`)}>
                  <Typography style={{ fontWeight: 700 }}>{r.studentName || "Aluno sem nome"}</Typography>
                  <Typography variant="body2" color="textSecondary">{r.courseName || "Curso não identificado"} · RGM {r.rgm || "—"}</Typography>
                  <div className={c.row}>
                    <span className={c.chip}>{DOC_LABEL[r.documentType] || "Documento"}</span>
                    <span className={c.chip}>{r.currentPeriod ? `${r.currentPeriod}º período${r.currentPeriodConfirmed ? "" : " (a confirmar)"}` : "Período a confirmar"}</span>
                    {r.studentId && <span className={c.chip}>Portal · v{r.version}</span>}
                    {res && <span className={c.chip}>{res[0]}</span>}
                  </div>
                  <span className={c.muted}>{new Date(r.updatedAt).toLocaleString("pt-BR")}</span>
                </Paper>
              );
            })}
          </div>
        )}
      </div>
      <NewDialog open={open} onClose={() => setOpen(false)} onCreated={(a) => { setOpen(false); history.push(`/analise-academica/${a.id}`); }} />
    </MainContainer>
  );
};

const Detail = ({ id }) => {
  const c = useShared();
  const history = useHistory();
  const [a, setA] = useState(null);
  const [period, setPeriod] = useState("");
  const [del, setDel] = useState(false);

  const apply = useCallback((d) => { setA((old) => ({ ...(old || {}), ...d })); setPeriod(d.currentPeriod || ""); }, []);
  const load = useCallback(() => api.get(`/analysis/academic/${id}`).then(({ data }) => apply(data)).catch((e) => { toastError(e); history.replace("/analise-academica"); }), [id, apply, history]);
  useEffect(() => { load(); }, [load]);

  // a correction can create a new version for a student of the portal: the screen follows it
  const change = async (body) => {
    try {
      const { data } = await api.put(`/analysis/academic/${a.id}`, body);
      if (data.id !== a.id) history.replace(`/analise-academica/${data.id}`);
      else await load();
      toast.success("Pronto. A previsão foi recalculada.");
    } catch (e) { toast.error(errorText(e)); }
  };
  const remove = async () => { try { await api.delete(`/analysis/academic/${a.id}`); toast.success("Análise excluída."); history.replace("/analise-academica"); } catch (e) { toast.error(errorText(e)); } };

  if (!a || !a.snapshot) return <MainContainer><div style={{ padding: 24 }}><CircularProgress size={26} /></div></MainContainer>;
  const s = a.snapshot;
  const res = s.result || {};
  const label = RESULT_LABEL[res.status];
  const f = a.forecast;
  const unresolved = (s.disciplines || []).filter((d) => d.inMainCurriculum && (d.period === null || d.period === undefined)).length;

  return (
    <MainContainer>
      <MainHeader>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <IconButton size="small" aria-label="Voltar" onClick={() => history.push("/analise-academica")}><ArrowLeft size={20} /></IconButton>
          <Title>{a.studentName || "Análise acadêmica"}</Title>
        </div>
        <MainHeaderButtonsWrapper>
          {!a.studentId && <Button variant="outlined" startIcon={<Trash2 size={16} />} onClick={() => setDel(true)}>Excluir</Button>}
        </MainHeaderButtonsWrapper>
      </MainHeader>
      <div className={c.body}>
        <div style={{ display: "grid", gap: 16, maxWidth: 1100 }}>
          <Paper variant="outlined" className={c.card}>
            <Typography style={{ fontWeight: 700, fontSize: 17 }}>{a.courseName || "Curso não identificado"}</Typography>
            <span className={c.muted}>RGM {a.rgm || "—"} · {DOC_LABEL[a.documentType] || "Documento"}{a.studentId ? ` · versão ${a.version}${a.isCurrent ? " (atual)" : ""}` : ""}</span>
            <div className={c.row} style={{ marginTop: 6 }}>
              <TextField select size="small" variant="outlined" label="Período atual do aluno" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ minWidth: 220 }} InputLabelProps={{ shrink: true }}>
                <MenuItem value="">Não confirmado</MenuItem>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <MenuItem key={n} value={n}>{n}º período</MenuItem>)}
              </TextField>
              <Button variant="contained" color="primary" disabled={String(period) === String(a.currentPeriod || "") || period === ""} onClick={() => change({ currentPeriod: Number(period) })}>Confirmar período</Button>
              <span className={c.muted}>{a.currentPeriodConfirmed ? "Confirmado." : "A previsão só aparece depois de confirmar o período."}</span>
            </div>
          </Paper>

          <div className={c.kpis}>
            <Kpi value={label ? label[0] : "—"} label="Situação" tone={label ? label[1] : undefined} />
            <Kpi value={res.previousPending ?? "—"} label="Pendências de períodos anteriores" tone={res.previousPending ? "warn" : "good"} />
            <Kpi value={res.previousAlreadyAdded ?? "—"} label="Anteriores já em andamento" />
            <Kpi value={res.remainingExtraSlots ?? "—"} label="Vagas adicionais livres" />
            <Kpi value={res.canAddNow ?? "—"} label="Pode incluir agora" tone={res.canAddNow ? "good" : undefined} />
            {s.plannedWorkload ? <Kpi value={`${Math.round(((s.integralizedWorkload || 0) / s.plannedWorkload) * 100)}%`} label={`Carga integralizada (${s.integralizedWorkload || 0} de ${s.plannedWorkload} h)`} /> : null}
          </div>

          {f ? (
            <Paper variant="outlined" className={c.card}>
              <Typography style={{ fontWeight: 700 }}>Previsão de formatura</Typography>
              <Typography style={{ fontSize: 20, fontWeight: 700 }}>
                {f.completionTermMin ? (f.completionTermMin === f.completionTermMax ? `Período ${f.completionTermMin}` : `Entre ${f.completionTermMin} e ${f.completionTermMax}`) : `${f.semestersMin}${f.semestersMax !== f.semestersMin ? ` a ${f.semestersMax}` : ""} semestre(s) a partir do atual`}
              </Typography>
              {(f.incomplete || f.uncertainRows > 0 || (f.reasons || []).length > 0) && (
                <div style={{ display: "grid", gap: 4 }}>
                  {(f.reasons || []).map((m, i) => <div key={i} className={c.row} style={{ flexWrap: "nowrap", alignItems: "flex-start" }}><AlertTriangle size={15} color="#d97706" style={{ flex: "none", marginTop: 2 }} /><Typography variant="body2">{m}</Typography></div>)}
                  <Typography variant="caption" color="textSecondary">Com dúvidas na leitura, a previsão é só um rascunho: ela não entra no texto para o aluno.</Typography>
                </div>
              )}
              {(f.plan || []).length > 0 && (
                <div className={c.tableWrap}>
                  <table className={c.table}>
                    <thead><tr><th>Semestre</th><th>Período da grade</th><th>Disciplinas</th><th>Dispensas</th><th>Capacidade</th><th>Carga</th><th>Pendências que restam</th></tr></thead>
                    <tbody>
                      {f.plan.map((p, i) => (
                        <tr key={i}>
                          <td><b>{p.term || "—"}</b>{p.isAdditional ? " (adicional)" : ""}</td>
                          <td>{p.curriculumPeriod}º</td>
                          <td>{p.curriculumSubjects}</td>
                          <td>{p.exemptions}</td>
                          <td>{p.capacity}</td>
                          <td>{p.totalLoad}</td>
                          <td>{p.remainingBacklog}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Paper>
          ) : (
            <Paper variant="outlined" className={c.card}>
              <Typography style={{ fontWeight: 700 }}>Previsão de formatura</Typography>
              <Typography variant="body2" color="textSecondary">Ainda não dá para calcular com segurança. {res.warnings && res.warnings.length ? res.warnings.join(" ") : "Confirme o período atual e confira as disciplinas abaixo."}</Typography>
            </Paper>
          )}

          {a.message && (
            <Paper variant="outlined" className={c.card}>
              <div className={c.row}>
                <Typography style={{ fontWeight: 700, flex: 1 }}>Texto para o aluno</Typography>
                <Button size="small" variant="outlined" startIcon={<ClipboardCopy size={15} />} onClick={() => copyText(a.message, "Texto copiado. É só colar na conversa.")}>Copiar</Button>
              </div>
              <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit", fontSize: 14, lineHeight: 1.5 }}>{a.message}</pre>
            </Paper>
          )}

          {(s.extractionWarnings || []).length > 0 && (
            <Paper variant="outlined" className={c.card}>
              <Typography style={{ fontWeight: 700 }}>Conferência da leitura</Typography>
              {s.extractionWarnings.map((m, i) => <div key={i} className={c.row} style={{ flexWrap: "nowrap", alignItems: "flex-start" }}><AlertTriangle size={15} color="#d97706" style={{ flex: "none", marginTop: 2 }} /><Typography variant="body2">{m}</Typography></div>)}
            </Paper>
          )}

          <Paper variant="outlined" className={c.card}>
            <Typography style={{ fontWeight: 700 }}>Disciplinas ({(s.disciplines || []).length})</Typography>
            <span className={c.muted}>{unresolved ? `${unresolved} disciplina(s) sem período: informe o período da grade para entrar na previsão. ` : ""}Corrigir uma linha recalcula tudo{a.studentId ? " e cria uma nova versão no histórico do aluno" : ""}.</span>
            <div className={c.tableWrap}>
              <table className={c.table}>
                <thead><tr><th>Disciplina</th><th>Código</th><th>Período</th><th>Situação</th><th>C.H.</th><th>Na grade</th></tr></thead>
                <tbody>
                  {(s.disciplines || []).map((d, i) => (
                    <tr key={i}>
                      <td>{d.name}{d.manualEdited ? " ✎" : ""}{d.academicTerm ? <span className={c.muted}> · {d.academicTerm}</span> : null}</td>
                      <td>{d.code || "—"}</td>
                      <td style={{ width: 110 }}>
                        <TextField select size="small" variant="outlined" value={d.period === null || d.period === undefined ? "" : d.period} onChange={(e) => change({ discipline: { index: i, period: e.target.value === "" ? null : Number(e.target.value) } })}>
                          <MenuItem value="">—</MenuItem>
                          {Array.from({ length: 20 }, (_, k) => k + 1).map((n) => <MenuItem key={n} value={n}>{n}º</MenuItem>)}
                        </TextField>
                      </td>
                      <td style={{ width: 170 }}>
                        <TextField select size="small" variant="outlined" value={d.normalizedStatus} onChange={(e) => change({ discipline: { index: i, normalizedStatus: e.target.value } })}>
                          {[...new Set([d.normalizedStatus, ...STATUSES])].map((st) => <MenuItem key={st} value={st}>{st}</MenuItem>)}
                        </TextField>
                      </td>
                      <td>{d.workload ?? "—"}</td>
                      <td><Checkbox size="small" color="primary" checked={!!d.inMainCurriculum} onChange={(e) => change({ discipline: { index: i, inMainCurriculum: e.target.checked } })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Paper>

          {(a.versions || []).length > 1 && (
            <Paper variant="outlined" className={c.card}>
              <Typography style={{ fontWeight: 700 }}>Histórico do aluno</Typography>
              {a.versions.map((v) => (
                <div key={v.id} style={{ borderTop: "1px solid rgba(127,140,160,.25)", paddingTop: 8 }}>
                  <div className={c.row}>
                    <b>Versão {v.version}</b>{v.isCurrent && <span className={c.chip}>atual</span>}
                    <span className={c.muted}>{new Date(v.createdAt).toLocaleString("pt-BR")} · {v.origin === "STUDENT_UPLOAD" ? "enviado pelo aluno" : v.origin === "CORRECTION" ? "correção da equipe" : "enviado pela equipe"}</span>
                    {v.id !== a.id && <Button size="small" onClick={() => history.push(`/analise-academica/${v.id}`)}>Abrir</Button>}
                  </div>
                  <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>{(v.changeSummary || []).map((m, i) => <li key={i} className={c.muted}>{m}</li>)}</ul>
                </div>
              ))}
            </Paper>
          )}
        </div>
      </div>
      <Dialog open={del} onClose={() => setDel(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Excluir esta análise?</DialogTitle>
        <DialogContent><Typography variant="body2">A análise de {a.studentName || "este aluno"} sai da lista. O PDF não é guardado pelo sistema.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDel(false)} variant="outlined" color="secondary">Cancelar</Button>
          <Button onClick={remove} variant="contained" color="primary">Excluir</Button>
        </DialogActions>
      </Dialog>
    </MainContainer>
  );
};

const AcademicAnalysis = () => {
  const { id } = useParams();
  return id ? <Detail key={id} id={id} /> : <List />;
};

export default AcademicAnalysis;
