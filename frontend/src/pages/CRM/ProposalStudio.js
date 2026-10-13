import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import {
  Dialog, IconButton, Button, TextField, MenuItem, Typography, makeStyles, Collapse,
  CircularProgress, DialogTitle, DialogContent, DialogActions,
} from "@material-ui/core";
import { Autocomplete } from "@material-ui/lab";
import { X, Save, Download, Link2, SendHorizonal, ChevronDown, SlidersHorizontal, Type, Plus, Trash2, GraduationCap, Wallet } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { termLabel } from "./LeadFields";

const useStyles = makeStyles((theme) => ({
  paper: { background: theme.palette.background.default },
  top: { display: "flex", alignItems: "center", gap: 12, padding: theme.spacing(1.25, 2.5), borderBottom: theme.border.divider, background: theme.palette.cards.background },
  title: { fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" },
  layout: { flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "480px 1fr", [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr", gridTemplateRows: "auto 1fr" } },
  form: { overflowY: "auto", overflowX: "hidden", padding: theme.spacing(2), borderRight: theme.border.divider, ...theme.scrollbarStyles },
  card: { background: theme.palette.cards.background, border: theme.border.divider, borderRadius: 14, padding: theme.spacing(2), marginBottom: theme.spacing(1.5) },
  cardHead: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, marginBottom: theme.spacing(1.25) },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: theme.spacing(1.25) },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: theme.spacing(1.25) },
  facts: { display: "flex", flexWrap: "wrap", gap: 6, margin: theme.spacing(0.25, 0, 1) },
  fact: { fontSize: 12.5, fontWeight: 500, padding: "2px 10px", borderRadius: 999, background: theme.palette.action.selected },
  note: { fontSize: 12.5, color: theme.palette.text.secondary, marginTop: 2 },
  adv: { cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, userSelect: "none", border: 0, background: "transparent", color: "inherit", fontFamily: "inherit", width: "100%", padding: 0 },
  stage: { overflow: "auto", padding: theme.spacing(2.5), background: theme.palette.type === "dark" ? "#050a12" : "#e9eef5", display: "flex", flexDirection: "column", alignItems: "center", gap: theme.spacing(1.5) },
  chips: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  chip: { background: theme.palette.cards.background, border: theme.border.divider, borderRadius: 999, padding: "3px 12px", fontSize: 13, fontWeight: 500 },
  sheetBox: { width: "100%", maxWidth: 860, flex: 1, minHeight: 0, position: "relative" },
  sheet: { width: 860, height: 1200, background: "#fff", borderRadius: 4, boxShadow: "0 18px 50px -20px rgba(11,66,121,.45)", border: 0, transition: "opacity .2s", transformOrigin: "top left", position: "absolute", top: 0, left: 0 },
  foot: { display: "flex", alignItems: "center", gap: 8, padding: theme.spacing(1.25, 2.5), borderTop: theme.border.divider, background: theme.palette.cards.background, flexWrap: "wrap" },
  err: { color: "#dc2626", fontSize: 13, textAlign: "center" },
}));

const ERR = {
  ERR_PROPOSAL_NO_GROSS: "Escolha o curso: a mensalidade bruta vem do catálogo.",
  ERR_PROPOSAL_FIRST_MONTHLY: "A primeira mensalidade precisa ser maior que zero e não pode passar da mensalidade bruta.",
  ERR_NO_PROPOSAL_TEMPLATE: "Cadastre um modelo de proposta em Configurar CRM.",
};

const toNum = (v) => { const n = Number(String(v ?? "").replace(/\./g, "").replace(",", ".")); return Number.isNaN(n) ? 0 : n; };
const money = (n) => (n === null || n === undefined ? "" : Number(n).toFixed(2).replace(".", ","));
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// backend params -> text inputs
const toForm = (p) => ({
  gross: money(p.gross), first: money(p.firstMonthly), bolsa: p.gross ? money(r2((1 - p.firstMonthly / p.gross) * 100)) : "",
  enrollmentFee: money(p.enrollmentFee), dueDay: String(p.dueDay), installments: String(p.installments), firstDueDate: p.firstDueDate || "",
  entryTerm: `${p.startYear}/${p.startSemester}`, entrySemester: p.entrySemester || 1, courseSemesters: p.courseSemesters || p.semesters, admissionType: p.admissionType || "",
  attend: String(p.semesters), attendAuto: true,
  bolsaFirst: money(p.bolsaFirst), bolsaNext: money(p.bolsaNext),
  punctualityPct: String(p.punctualityPct), lateFee1Pct: String(p.lateFee1Pct), lateFee2Pct: String(p.lateFee2Pct),
  annualMin: money(p.annualMin), annualMax: money(p.annualMax),
  schedule: (p.semestralSchedule || []).map((s) => ({ from: String(s.from), pct: money(s.pct) })),
});

// text inputs -> backend params
const toParams = (f) => {
  const [y, s] = String(f.entryTerm).split("/").map(Number);
  return {
    gross: toNum(f.gross), firstMonthly: toNum(f.first), enrollmentFee: toNum(f.enrollmentFee), dueDay: toNum(f.dueDay), installments: toNum(f.installments),
    firstDueDate: f.firstDueDate || null, startYear: y, startSemester: s === 1 ? 1 : 2,
    courseSemesters: Number(f.courseSemesters), entrySemester: Number(f.entrySemester) || 1, admissionType: f.admissionType || null,
    attendSemesters: toNum(f.attend) || null,
    bolsaFirst: toNum(f.bolsaFirst), bolsaNext: toNum(f.bolsaNext), punctualityPct: toNum(f.punctualityPct), lateFee1Pct: toNum(f.lateFee1Pct), lateFee2Pct: toNum(f.lateFee2Pct),
    annualMin: toNum(f.annualMin), annualMax: toNum(f.annualMax), semestralSchedule: f.schedule.map((x) => ({ from: toNum(x.from), pct: toNum(x.pct) })),
  };
};

const ProposalStudio = ({ lead, proposalId, ctx, onClose, onSaved }) => {
  const classes = useStyles();
  const { options } = ctx;
  const [courses, setCourses] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [courseId, setCourseId] = useState(null);
  const [templateId, setTemplateId] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [f, setF] = useState(null);
  const [html, setHtml] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [texts, setTexts] = useState(false);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [message, setMessage] = useState("");
  const loadSeq = useRef(0);
  const boxRef = useRef(null);
  const [scale, setScale] = useState(1);

  // the sheet is laid out at a fixed width and scaled down to fit narrow windows
  useEffect(() => {
    if (!f || !boxRef.current) return undefined;
    const fit = () => setScale(Math.min(1, boxRef.current.clientWidth / 860));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [f]);

  const loadDefaults = useCallback(async (cId, tId, keep) => {
    const { data } = await api.get("/proposals/defaults", { params: { leadId: lead.id, courseId: cId || undefined, templateId: tId || undefined } });
    setCourseId(data.courseId);
    setTemplateId(data.templateId);
    setSnapshot(data.snapshot);
    setF((prev) => {
      const next = toForm(data.params);
      if (keep && prev) {
        // switching course: keep the negotiated discount and the candidate's ingress choices
        if (toNum(prev.bolsa) > 0 && data.params.gross) {
          next.first = money(r2(data.params.gross * (1 - toNum(prev.bolsa) / 100)));
          next.bolsa = prev.bolsa;
        }
        next.entryTerm = prev.entryTerm; next.admissionType = prev.admissionType; next.firstDueDate = prev.firstDueDate;
        next.entrySemester = Math.min(prev.entrySemester, next.courseSemesters);
        if (!prev.attendAuto) { next.attend = prev.attend; next.attendAuto = false; }
      }
      return next;
    });
  }, [lead.id]);

  useEffect(() => {
    (async () => {
      try {
        const [c, t, i] = await Promise.all([api.get("/courses"), api.get("/proposal-templates"), api.get("/institutions")]);
        setCourses(c.data.filter((x) => x.active)); setTemplates(t.data); setInstitutions(i.data);
        if (proposalId) {
          const { data } = await api.get(`/proposals/${proposalId}`);
          setSaved(data); setCourseId(data.courseId); setTemplateId(data.templateId);
          setSnapshot(data.params.snapshot); setF(toForm(data.params.params));
        } else {
          await loadDefaults(lead.courseId, null, false);
        }
        setMessage(`Olá, ${lead.name.split(" ")[0]}! Segue a proposta do curso. Qualquer dúvida, estou à disposição.`);
      } catch (err) { toastError(err); onClose(); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // live preview, debounced
  useEffect(() => {
    if (!f || !snapshot) return undefined;
    const seq = (loadSeq.current += 1);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.post("/proposals/preview", { leadId: lead.id, courseId, templateId, params: toParams(f), snapshot });
        if (seq !== loadSeq.current) return;
        setHtml(data.html); setResult(data.result); setError("");
      } catch (err) {
        if (seq !== loadSeq.current) return;
        const code = err.response && err.response.data && err.response.data.error;
        setError(ERR[code] || code || "Não foi possível calcular.");
      }
    }, 280);
    return () => clearTimeout(t);
  }, [f, snapshot, courseId, templateId, lead.id]);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const field = (k, label, extra = {}) => (
    <TextField fullWidth variant="outlined" margin="dense" label={label} value={f[k]} onChange={set(k)} {...extra} />
  );
  const setBolsa = (e) => setF((p) => {
    const b = toNum(e.target.value);
    return { ...p, bolsa: e.target.value, first: money(r2(toNum(p.gross) * (1 - b / 100))) };
  });
  const setFirst = (e) => setF((p) => ({ ...p, first: e.target.value, bolsa: toNum(p.gross) ? money(r2((1 - toNum(e.target.value) / toNum(p.gross)) * 100)) : "" }));
  const setGross = (e) => setF((p) => {
    const g = toNum(e.target.value);
    return { ...p, gross: e.target.value, first: money(r2(g * (1 - toNum(p.bolsa) / 100))) };
  });

  const persist = async () => {
    const body = { leadId: lead.id, courseId, templateId, params: toParams(f), snapshot };
    const { data } = saved ? await api.put(`/proposals/${saved.id}`, body) : await api.post("/proposals", body);
    setSaved(data);
    onSaved && onSaved();
    return data;
  };
  const run = (name, fn) => async () => {
    setBusy(name);
    try { await fn(); } catch (err) { toastError(err); } finally { setBusy(""); }
  };

  const saveDraft = run("save", async () => { await persist(); toast.success("Rascunho salvo"); });
  const download = run("pdf", async () => {
    const p = await persist();
    const res = await api.get(`/proposals/${p.id}/pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url; a.download = `Proposta - ${lead.name}.pdf`; a.click();
    URL.revokeObjectURL(url);
  });
  const copyLink = run("link", async () => {
    const p = await persist();
    await navigator.clipboard.writeText(p.link);
    toast.success("Link copiado. Ele só abre depois que a proposta for enviada.");
  });
  const send = run("send", async () => {
    const p = await persist();
    await api.post(`/proposals/${p.id}/send`, { message });
    toast.success("Proposta enviada ao candidato");
    onSaved && onSaved();
    setSendOpen(false);
    onClose(true);
  });

  const locked = saved && saved.status !== "draft";
  const course = courses.find((c) => c.id === courseId);
  const institution = institutions.find((i) => i.id === (snapshot && snapshot.institutionId));
  const needsSemester = f && (options.admissionNeedsSemester || []).includes(f.admissionType);
  const remaining = f ? f.courseSemesters - f.entrySemester + 1 : 0;
  const attend = f ? toNum(f.attend) || remaining : 0;
  const extra = Math.max(0, attend - remaining);
  const terms = f ? [...new Set([...(options.entryTerms || []), f.entryTerm])] : [];

  return (
    <Dialog fullScreen open onClose={() => onClose()} classes={{ paper: classes.paper }}>
      <div className={classes.top}>
        <IconButton onClick={() => onClose()} aria-label="Fechar"><X /></IconButton>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={classes.title}>Proposta de bolsa{saved ? ` #${saved.id}` : ""}</div>
          <Typography variant="body2" color="textSecondary" noWrap>{lead.name}{institution ? ` · ${institution.name}` : ""}</Typography>
        </div>
        {locked && <span className={classes.chip}>Já enviada — duplique para alterar</span>}
      </div>

      {!f ? <div style={{ margin: "auto" }}><CircularProgress /></div> : (
        <div className={classes.layout}>
          <div className={classes.form}>
            <div className={classes.card}>
              <div className={classes.cardHead}><GraduationCap size={17} /> Curso e ingresso</div>
              <Autocomplete
                disabled={!!locked} options={courses} value={course || null} openOnFocus
                getOptionLabel={(c) => c.name} getOptionSelected={(a, b) => a.id === b.id} noOptionsText="Nenhum curso encontrado"
                groupBy={(c) => c.modality || "Outros"}
                renderOption={(c) => (
                  <div style={{ display: "flex", width: "100%", gap: 8 }}>
                    <span style={{ flex: 1 }}>{c.name}</span><span style={{ opacity: 0.6 }}>{c.monthlyFee ? brl(c.monthlyFee) : ""}</span>
                  </div>
                )}
                onChange={(e, c) => c && loadDefaults(c.id, templateId, true)}
                renderInput={(params) => <TextField {...params} variant="outlined" margin="dense" label="Curso" placeholder="Busque pelo nome" />}
              />
              {course && (
                <div className={classes.facts}>
                  {course.modality && <span className={classes.fact}>{course.modality}</span>}
                  <span className={classes.fact}>{course.semesters} semestres</span>
                  {course.category && <span className={classes.fact}>{course.category}</span>}
                </div>
              )}
              <div className={classes.grid2}>
                <TextField select fullWidth variant="outlined" margin="dense" label="Forma de ingresso" value={f.admissionType} disabled={!!locked}
                  onChange={(e) => setF((p) => {
                    const entry = (options.admissionNeedsSemester || []).includes(e.target.value) ? p.entrySemester : 1;
                    return { ...p, admissionType: e.target.value, entrySemester: entry, ...(p.attendAuto ? { attend: String(p.courseSemesters - entry + 1) } : {}) };
                  })}>
                  <MenuItem value="">—</MenuItem>
                  {(options.admissionTypes || []).map((t) => (<MenuItem key={t} value={t}>{t}</MenuItem>))}
                </TextField>
                <TextField select fullWidth variant="outlined" margin="dense" label="Período de ingresso" value={f.entryTerm} onChange={set("entryTerm")} disabled={!!locked}>
                  {terms.map((t) => (<MenuItem key={t} value={t}>{termLabel(t)}</MenuItem>))}
                </TextField>
              </div>
              {needsSemester && (
                <TextField select fullWidth variant="outlined" margin="dense" label="Semestre do curso em que ingressa" value={f.entrySemester} disabled={!!locked}
                  onChange={(e) => setF((p) => ({ ...p, entrySemester: Number(e.target.value), ...(p.attendAuto ? { attend: String(p.courseSemesters - Number(e.target.value) + 1) } : {}) }))}>
                  {Array.from({ length: f.courseSemesters }, (_, i) => (<MenuItem key={i + 1} value={i + 1}>{i + 1}º semestre{i === 0 ? " (início do curso)" : ""}</MenuItem>))}
                </TextField>
              )}
              <TextField fullWidth variant="outlined" margin="dense" label="Semestres a cursar" value={f.attend} disabled={!!locked} type="number"
                inputProps={{ min: 1, max: 20 }} onChange={(e) => setF((p) => ({ ...p, attend: e.target.value, attendAuto: false }))}
                helperText={extra > 0
                  ? `Currículo restante: ${remaining}. Inclui ${extra} semestre${extra > 1 ? "s" : ""} de adaptação além do que falta no curso.`
                  : attend < remaining ? `Menos que os ${remaining} restantes (aproveitamento de estudos).` : `Todos os ${remaining} semestres que faltam no currículo.`} />
              {!f.attendAuto && (
                <Button size="small" style={{ marginTop: 4 }} disabled={!!locked} onClick={() => setF((p) => ({ ...p, attend: String(p.courseSemesters - p.entrySemester + 1), attendAuto: true }))}>Voltar ao cálculo automático</Button>
              )}
            </div>

            <div className={classes.card}>
              <div className={classes.cardHead}><Wallet size={17} /> Condições comerciais</div>
              <div className={classes.grid2}>
                {field("gross", "Mensalidade bruta (R$)", { onChange: setGross, disabled: !!locked })}
                {field("bolsa", "Bolsa aplicada (%)", { onChange: setBolsa, disabled: !!locked })}
                {field("first", "Primeira mensalidade (R$)", { onChange: setFirst, disabled: !!locked })}
                {field("enrollmentFee", "Taxa de matrícula (R$)", { disabled: !!locked })}
                {field("dueDay", "Dia de vencimento", { disabled: !!locked })}
                {field("installments", "Parcelas deste semestre", { disabled: !!locked })}
              </div>
              <div className={classes.note}>Mude a primeira mensalidade ou a bolsa: o outro valor se ajusta.</div>
              {field("firstDueDate", "Vencimento da 1ª mensalidade (opcional)", { type: "date", InputLabelProps: { shrink: true }, disabled: !!locked })}
            </div>

            <div className={classes.card}>
              <button type="button" className={classes.adv} onClick={() => setAdvanced(!advanced)}>
                <SlidersHorizontal size={17} /> Bolsa, pontualidade e reajustes
                <ChevronDown size={16} style={{ marginLeft: "auto", transform: advanced ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
              </button>
              <Collapse in={advanced}>
                <div style={{ paddingTop: 12 }}>
                  <div className={classes.grid2}>
                    {field("bolsaFirst", "Bolsa no 1º semestre (%)", { disabled: !!locked })}
                    {field("bolsaNext", "Bolsa dos demais (%)", { disabled: !!locked })}
                  </div>
                  <div className={classes.grid3}>
                    {field("punctualityPct", "Pontualidade (%)", { disabled: !!locked })}
                    {field("lateFee1Pct", "Perde dias 11–25 (%)", { disabled: !!locked })}
                    {field("lateFee2Pct", "Perde após venc. (%)", { disabled: !!locked })}
                  </div>
                  <div className={classes.grid2}>
                    {field("annualMin", "Reajuste anual mínimo (%)", { disabled: !!locked })}
                    {field("annualMax", "Reajuste anual teto (%)", { disabled: !!locked })}
                  </div>
                  <div className={classes.note} style={{ marginTop: 8 }}>Reajuste semestral (a partir do semestre…)</div>
                  {f.schedule.map((s, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <TextField variant="outlined" margin="dense" label="Semestre" value={s.from} disabled={!!locked} style={{ width: 110 }}
                        onChange={(e) => setF((p) => ({ ...p, schedule: p.schedule.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) }))} />
                      <TextField variant="outlined" margin="dense" label="% por semestre" value={s.pct} disabled={!!locked} style={{ flex: 1 }}
                        onChange={(e) => setF((p) => ({ ...p, schedule: p.schedule.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)) }))} />
                      <IconButton size="small" disabled={!!locked} onClick={() => setF((p) => ({ ...p, schedule: p.schedule.filter((_, j) => j !== i) }))}><Trash2 size={16} /></IconButton>
                    </div>
                  ))}
                  <Button size="small" startIcon={<Plus size={14} />} disabled={!!locked} onClick={() => setF((p) => ({ ...p, schedule: [...p.schedule, { from: "", pct: "" }] }))}>Adicionar degrau</Button>
                  <div className={classes.grid2} style={{ marginTop: 8 }}>
                    <TextField select fullWidth variant="outlined" margin="dense" label="Modelo" value={templateId || ""} disabled={!!locked} onChange={(e) => loadDefaults(courseId, e.target.value, true)}>
                      {templates.map((t) => (<MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>))}
                    </TextField>
                    <TextField select fullWidth variant="outlined" margin="dense" label="Instituição" disabled={!!locked}
                      value={(snapshot && snapshot.institutionId) || ""} onChange={(e) => setSnapshot({ ...snapshot, institutionId: e.target.value || null })}>
                      <MenuItem value="">—</MenuItem>
                      {institutions.map((i) => (<MenuItem key={i.id} value={i.id}>{i.name}</MenuItem>))}
                    </TextField>
                  </div>
                </div>
              </Collapse>
            </div>

            <div className={classes.card}>
              <button type="button" className={classes.adv} onClick={() => setTexts(!texts)}>
                <Type size={17} /> Textos do documento
                <ChevronDown size={16} style={{ marginLeft: "auto", transform: texts ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
              </button>
              <Collapse in={texts}>
                <div style={{ paddingTop: 12 }}>
                  {[["observation", "Observação"], ["disclaimer", "Aviso da projeção"], ["finalMessage", "Mensagem final"], ["bolsaNote", "Nota da bolsa aplicada"]].map(([k, label]) => (
                    <TextField key={k} fullWidth multiline rows={2} variant="outlined" margin="dense" label={label} disabled={!!locked}
                      value={(snapshot.texts && snapshot.texts[k]) || ""} onChange={(e) => setSnapshot({ ...snapshot, texts: { ...snapshot.texts, [k]: e.target.value } })} />
                  ))}
                </div>
              </Collapse>
            </div>
          </div>

          <div className={classes.stage}>
            {result && (
              <div className={classes.chips}>
                <span className={classes.chip}>Bolsa <b>{result.bolsaApplied.toFixed(2).replace(".", ",")}%</b></span>
                <span className={classes.chip}>1ª mensalidade <b>{brl(toNum(f.first))}</b></span>
                <span className={classes.chip}>Até o dia {f.dueDay}: <b>{brl(result.tiers.onTime)}</b></span>
                <span className={classes.chip}>Última parcela (cenário teto): <b>{brl(result.rows[result.rows.length - 1].monthlyMax)}</b></span>
              </div>
            )}
            {error && <div className={classes.err}>{error}</div>}
            <div className={classes.sheetBox} ref={boxRef} style={{ height: 1200 * scale }}>
              <iframe title="Prévia da proposta" className={classes.sheet} srcDoc={html}
                style={{ opacity: error ? 0.45 : 1, transform: `scale(${scale})` }} />
            </div>
          </div>
        </div>
      )}

      <div className={classes.foot}>
        <span style={{ flex: 1 }} />
        <Button variant="outlined" startIcon={<Save size={16} />} disabled={!f || !!busy || !!locked || !!error} onClick={saveDraft}>Salvar rascunho</Button>
        <Button variant="outlined" startIcon={<Download size={16} />} disabled={!f || !!busy || !!locked || !!error} onClick={download}>{busy === "pdf" ? "Gerando…" : "Baixar PDF"}</Button>
        <Button variant="outlined" startIcon={<Link2 size={16} />} disabled={!f || !!busy || !!locked || !!error} onClick={copyLink}>Copiar link</Button>
        <Button variant="contained" color="primary" startIcon={<SendHorizonal size={16} />} disabled={!f || !!busy || !!locked || !!error} onClick={() => setSendOpen(true)}>Enviar ao candidato</Button>
      </div>

      <Dialog open={sendOpen} onClose={() => setSendOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Enviar proposta a {lead.name.split(" ")[0]}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            O PDF segue anexo na conversa (mesmo canal do atendimento), o lead vai para “Proposta enviada” e o atendimento fica com você.
          </Typography>
          <TextField fullWidth multiline rows={4} variant="outlined" label="Mensagem" value={message} onChange={(e) => setMessage(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="secondary" onClick={() => setSendOpen(false)}>Cancelar</Button>
          <Button variant="contained" color="primary" disabled={busy === "send"} startIcon={busy === "send" ? <CircularProgress size={16} /> : <SendHorizonal size={16} />} onClick={send}>Enviar agora</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};

export default ProposalStudio;
