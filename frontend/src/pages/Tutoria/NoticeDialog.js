import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, MenuItem, CircularProgress, makeStyles } from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";
import SendReleaseDialog, { QuotaLine } from "../../components/SendRelease";

const useStyles = makeStyles((theme) => ({
  kinds: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: theme.spacing(1), marginBottom: theme.spacing(2) },
  kind: {
    textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer", padding: theme.spacing(1.25, 1.5), borderRadius: 12,
    border: `1px solid ${theme.palette.divider}`, background: theme.palette.background.paper,
    "& b": { display: "block", fontSize: 14 }, "& span": { display: "block", fontSize: 12.5, color: theme.palette.text.secondary, marginTop: 2 },
    "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
  },
  kindOn: { borderColor: theme.palette.primary.main, boxShadow: `0 0 0 1px ${theme.palette.primary.main}` },
  grid: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "1fr 1fr", [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr" } },
  wide: { gridColumn: "1 / -1" },
  box: { marginTop: theme.spacing(2), padding: theme.spacing(1.5, 1.75), borderRadius: 12, background: theme.palette.action.hover, fontSize: 14 },
  nums: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: theme.spacing(1), [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr 1fr" } },
  num: { "& small": { display: "block", fontSize: 12, color: theme.palette.text.secondary }, "& strong": { fontSize: 20, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" } },
  sample: { marginTop: theme.spacing(1.5), padding: theme.spacing(1.25, 1.5), borderRadius: 10, background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, fontSize: 13.5, lineHeight: 1.5 },
  label: { fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, margin: theme.spacing(1.5, 0, 0.5) },
  block: { marginTop: theme.spacing(1.5), padding: theme.spacing(1, 1.5), borderRadius: 10, fontSize: 13.5, background: "rgba(217,119,6,.12)", color: theme.palette.type === "dark" ? "#fcd34d" : "#92400e" },
  note: { fontSize: 12.5, color: theme.palette.text.secondary, marginTop: theme.spacing(1) },
}));

const KINDS = [
  ["atividades", "Atividades do mês", "Um resumo das atividades e o prazo de entrega"],
  ["prova", "Lembrete de prova", "Na semana da prova, com a disciplina e a data"],
];
const today = () => new Date().toLocaleDateString("en-CA");
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const usd = (v) => `US$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Avisos da tutoria: the two notices of the month (activities and test), sent by the official tutoring number with a Utility template.
// The preview (how many students, the estimated cost, what blocks it) comes before the send, and the send asks for a confirmation.
export default function NoticeDialog({ open, onClose, manager, students = [], tutors = [], polos = [] }) {
  const c = useStyles();
  const [f, setF] = useState({ kind: "atividades", date: "", subject: "", note: "", poloId: "", courseId: "", tutorId: "" });
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => { if (open) { setPreview(null); setConfirming(false); } }, [open]);

  // the courses of the students on the screen (each one once)
  const courses = useMemo(() => {
    const seen = new Map();
    students.forEach((s) => { if (s.courseId && !seen.has(s.courseId)) seen.set(s.courseId, s.course); });
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [students]);

  const ready = !!f.date && (f.kind !== "prova" || f.subject.trim().length > 1);
  const payload = { kind: f.kind, date: f.date, subject: f.subject, note: f.note, ...(manager ? { poloId: f.poloId || null, tutorId: f.tutorId || null } : {}), courseId: f.courseId || null };

  // the preview follows what is typed (a short pause so each letter does not ask the server)
  useEffect(() => {
    if (!open || !ready) { setPreview(null); return undefined; }
    let alive = true;
    setLoading(true);
    setFailed(false);
    setConfirming(false);
    const t = setTimeout(() => {
      api.post("/tutoria/notices/preview", payload)
        .then(({ data }) => { if (alive) setPreview(data); })
        .catch((e) => { if (alive) { setPreview(null); setFailed(true); toastError(e); } })
        .finally(() => { if (alive) setLoading(false); });
    }, 450);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ready, f.kind, f.date, f.subject, f.note, f.poloId, f.courseId, f.tutorId]);

  const set = (k) => (e) => { const { value } = e.target; setF((x) => ({ ...x, [k]: value })); };

  const send = async () => {
    setSending(true);
    try {
      const { data } = await api.post("/tutoria/notices", { ...payload, confirm: true });
      toast.success(`Aviso em envio para ${data.people} ${data.people === 1 ? "aluno" : "alunos"}. Acompanhe em Campanhas.`);
      onClose(true);
    } catch (e) { toastError(e); }
    setSending(false);
  };

  const blockers = preview?.blockers || [];
  const cost = preview?.cost;
  const canSend = preview && !blockers.length && preview.canReceive > 0;
  const quota = preview && preview.quota;
  const overQuota = blockers.includes("ERR_SEND_QUOTA");
  const missing = quota && quota.limited ? Math.max(1, preview.canReceive - (quota.left || 0)) : 0;
  const askContext = preview ? { type: "aviso", name: `${preview.label}${f.date ? ` ${f.date.split("-").reverse().join("/")}` : ""}`, recipients: preview.canReceive } : null;

  return (
    <Dialog open={open} onClose={sending ? undefined : () => onClose(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Enviar aviso aos alunos</DialogTitle>
      <DialogContent>
        <div className={c.kinds} role="radiogroup" aria-label="Tipo do aviso">
          {KINDS.map(([k, title, hint]) => (
            <button key={k} type="button" role="radio" aria-checked={f.kind === k} className={`${c.kind}${f.kind === k ? ` ${c.kindOn}` : ""}`} onClick={() => setF((x) => ({ ...x, kind: k }))}>
              <b>{title}</b><span>{hint}</span>
            </button>
          ))}
        </div>

        <div className={c.grid}>
          <TextField id="notice-date" label={f.kind === "prova" ? "Data da prova" : "Entrega até"} type="date" variant="outlined" size="small" value={f.date} onChange={set("date")}
            InputLabelProps={{ shrink: true }} inputProps={{ min: today() }} required />
          {f.kind === "prova"
            ? <TextField id="notice-subject" label="Disciplina" variant="outlined" size="small" value={f.subject} onChange={set("subject")} inputProps={{ maxLength: 60 }} required />
            : <TextField id="notice-note" label="Orientação curta (opcional)" variant="outlined" size="small" value={f.note} onChange={set("note")} inputProps={{ maxLength: 120 }} placeholder="Ex.: faça primeiro o fórum" />}
          {manager && (
            <TextField id="notice-polo" select label="Polo" variant="outlined" size="small" InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }} value={f.poloId} onChange={set("poloId")}>
              <MenuItem value="">Todos os polos</MenuItem>
              {polos.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </TextField>
          )}
          {manager && (
            <TextField id="notice-tutor" select label="Tutor" variant="outlined" size="small" InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }} value={f.tutorId} onChange={set("tutorId")}>
              <MenuItem value="">Todos os tutores</MenuItem>
              {tutors.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
            </TextField>
          )}
          <TextField id="notice-course" select label="Curso" variant="outlined" size="small" InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }} value={f.courseId} onChange={set("courseId")} className={manager ? c.wide : undefined}>
            <MenuItem value="">Todos os cursos</MenuItem>
            {courses.map((x) => <MenuItem key={x.id} value={x.id}>{x.name}</MenuItem>)}
          </TextField>
        </div>

        {!ready && <p className={c.note}>{f.kind === "prova" ? "Informe a data e a disciplina para ver quantos alunos recebem e quanto custa." : "Informe a data para ver quantos alunos recebem e quanto custa."}</p>}
        {ready && loading && <div className={c.box} aria-live="polite"><CircularProgress size={16} style={{ marginRight: 8, verticalAlign: "middle" }} />Calculando a prévia...</div>}
        {ready && !loading && failed && <div className={c.block} role="alert">Não foi possível calcular a prévia. Confira a conexão e tente de novo.</div>}
        {ready && !loading && preview && (
          <div className={c.box} aria-live="polite">
            <div className={c.nums}>
              <div className={c.num}><small>Recebem</small><strong>{preview.canReceive}</strong></div>
              <div className={c.num}><small>Custo estimado</small><strong>{cost ? brl(cost.totalBrl) : "—"}</strong></div>
              <div className={c.num}><small>Sem consentimento</small><strong>{preview.noConsent}</strong></div>
            </div>
            {cost && (
              <p className={c.note}>
                {cost.category === "UTILITY" ? "Modelo de Utilidade" : cost.category === "MARKETING" ? "Modelo de Marketing (cerca de 9 vezes mais caro)" : "Modelo"}: {usd(cost.totalUsd)} no total.
                {cost.month.capUsd ? ` No mês: ${brl(cost.month.spentUsd * cost.month.usdBrl)} de ${brl(cost.month.capUsd * cost.month.usdBrl)} do teto.` : ""}
              </p>
            )}
            {preview.noConsent > 0 && <p className={c.note}>Alunos sem consentimento registrado ficam de fora.</p>}
            <div className={c.label}>Como o aluno recebe</div>
            <div className={c.sample}>{preview.sample}</div>
            {preview.connection && <p className={c.note}>Sai pelo número {preview.connection.name}.</p>}
            <QuotaLine quota={quota} />
            {blockers.map((b) => <div key={b} className={c.block} role="alert">{i18n.exists(`backendErrors.${b}`) ? i18n.t(`backendErrors.${b}`) : b}</div>)}
            {overQuota && !quota.pending && <Button style={{ marginTop: 10 }} variant="outlined" color="primary" onClick={() => setAsking(true)}>Pedir liberação à gestão</Button>}
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)} disabled={sending}>Cancelar</Button>
        {!confirming
          ? <Button color="primary" variant="contained" disabled={!canSend || loading} onClick={() => setConfirming(true)}>Revisar envio</Button>
          : <Button color="primary" variant="contained" disabled={sending} onClick={send}>{sending ? "Enviando..." : `Confirmar envio para ${preview.canReceive} ${preview.canReceive === 1 ? "aluno" : "alunos"}`}</Button>}
      </DialogActions>
      <SendReleaseDialog open={asking} suggested={missing} context={askContext} onClose={(q) => {
        setAsking(false);
        if (q) setPreview((p) => (p ? { ...p, quota: q } : p));
      }} />
    </Dialog>
  );
}
