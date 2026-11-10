import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, CircularProgress, FormControlLabel, MenuItem, Switch, TextField, Typography, makeStyles } from "@material-ui/core";
import { Trash2 } from "lucide-react";

import IconAction from "../../components/IconAction";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  row: { display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: theme.border.divider },
  grid: { display: "grid", gap: theme.spacing(1), gridTemplateColumns: "1fr 1fr", [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr" } },
  small: { fontSize: 12.5, color: theme.palette.text.secondary },
  tag: { fontSize: 11.5, padding: "1px 8px", borderRadius: 999, border: `1px solid ${theme.palette.divider}`, color: theme.palette.text.secondary },
  tagOn: { color: theme.palette.primary.main, borderColor: theme.palette.primary.main },
}));

const MODALITIES = [["EAD", "A distância (EaD)"], ["SEMIPRESENCIAL", "Semipresencial"], ["PRESENCIAL", "Presencial"]];
const REGIMES = [
  ["ead_pre_decreto", "EaD matriculada antes do novo marco (conclui no formato do contrato)"],
  ["semipresencial_transicao", "Semipresencial que ingressa durante a transição (currículo pode ser adaptado)"],
  ["semipresencial_pleno", "Semipresencial já no novo marco"],
  ["presencial", "Presencial"],
  ["nao_definido", "Ainda não definido"],
];
const ASSESSMENTS = [["nao_definido", "Ainda não definida"], ["parcial", "Parcialmente definida"], ["definido", "Definida"]];

const EMPTY = {
  label: "", poloId: "", intakeTerm: "", intakeDate: "", contractedModality: "", transitionRegime: "", transitionNote: "", expectedCalendar: "", presencialStart: "", syncRules: "",
  practiceSchedule: "", practiceDefined: "", assessmentsStatus: "", assessmentsNote: "", activityLocation: "", published: false,
};
const clean = (c) => Object.fromEntries(Object.entries(EMPTY).map(([k]) => [k, c[k] === null || c[k] === undefined ? EMPTY[k] : c[k]]));

// The classes (turmas) of a course and what the institution confirmed for each. What stays empty is "not confirmed": the agent says it was not
// announced yet and that the consultant confirms, instead of filling the gap.
const CohortsPanel = () => {
  const classes = useStyles();
  const [data, setData] = useState(null);
  const [courseId, setCourseId] = useState("");
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get("/course-cohorts").then(({ data: d }) => setData(d)).catch(toastError), []);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const field = (k, label, extra = {}) => <TextField size="small" variant="outlined" margin="dense" label={label} value={form[k]} onChange={(e) => set(k, e.target.value)} InputLabelProps={{ shrink: true }} {...extra} />;
  const longField = (k, label, helper, rows = 2) => <TextField fullWidth multiline rows={rows} size="small" variant="outlined" margin="dense" label={label} value={form[k]} onChange={(e) => set(k, e.target.value)} InputLabelProps={{ shrink: true }} helperText={helper} />;

  const save = async () => {
    setBusy(true);
    try {
      const body = { ...form, courseId };
      if (editing) await api.put(`/course-cohorts/${editing}`, body); else await api.post("/course-cohorts", body);
      toast.success("Turma salva.");
      setForm(null);
      setEditing(null);
      load();
    } catch (e) { toastError(e); }
    setBusy(false);
  };
  const remove = async (c) => {
    if (!window.confirm("Apagar esta turma? O agente volta a dizer que o calendário dela não foi confirmado.")) return;
    try { await api.delete(`/course-cohorts/${c.id}`); load(); } catch (e) { toastError(e); }
  };

  if (!data) return <CircularProgress size={22} />;
  const course = data.courses.find((c) => c.id === Number(courseId));
  const cohorts = data.cohorts.filter((c) => c.courseId === Number(courseId));

  if (form) {
    return (
      <>
        <Typography variant="subtitle1" style={{ fontWeight: 700 }}>{course ? course.name : ""}</Typography>
        <Typography variant="body2" color="textSecondary">Deixe em branco o que ainda não foi divulgado. O agente nunca preenche o que está vazio: ele diz que ainda não foi confirmado.</Typography>
        <div className={classes.grid}>
          {field("label", "Nome da turma", { placeholder: "Pedagogia 2026/2 — Porto Velho" })}
          <TextField select size="small" variant="outlined" margin="dense" label="Polo (vazio = todos)" value={form.poloId} onChange={(e) => set("poloId", e.target.value)} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}>
            <MenuItem value="">Todos os polos</MenuItem>
            {data.polos.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          {field("intakeTerm", "Período de ingresso", { placeholder: "2026/2" })}
          {field("intakeDate", "Data de ingresso", { type: "date" })}
          <TextField select size="small" variant="outlined" margin="dense" label="Modalidade contratada" value={form.contractedModality} onChange={(e) => set("contractedModality", e.target.value)} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}>
            <MenuItem value="">Não confirmada</MenuItem>
            {MODALITIES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
          </TextField>
          <TextField select size="small" variant="outlined" margin="dense" label="Regime de transição aplicável" value={form.transitionRegime} onChange={(e) => set("transitionRegime", e.target.value)} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}>
            <MenuItem value="">Não confirmado</MenuItem>
            {REGIMES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
          </TextField>
          {field("presencialStart", "Início das atividades presenciais", { type: "date" })}
          <TextField select size="small" variant="outlined" margin="dense" label="Cronograma das práticas definido" value={form.practiceDefined === "" || form.practiceDefined === null ? "" : String(form.practiceDefined)} onChange={(e) => set("practiceDefined", e.target.value)} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}>
            <MenuItem value="">Não informado</MenuItem>
            <MenuItem value="true">Sim</MenuItem>
            <MenuItem value="false">Ainda não</MenuItem>
          </TextField>
          <TextField select size="small" variant="outlined" margin="dense" label="Avaliações presenciais" value={form.assessmentsStatus} onChange={(e) => set("assessmentsStatus", e.target.value)} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}>
            <MenuItem value="">Não informado</MenuItem>
            {ASSESSMENTS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
          </TextField>
        </div>
        {longField("expectedCalendar", "Calendário previsto", "Só o que foi divulgado. Não escreva percentuais como se fossem aulas por semana.", 3)}
        {longField("syncRules", "Regras das aulas síncronas", "Dias, horários e como a presença é registrada, se já houver.")}
        {longField("practiceSchedule", "Cronograma das práticas", "Quando e como as práticas e estágios acontecem nesta turma.")}
        {longField("assessmentsNote", "Observações sobre as avaliações", "")}
        {longField("activityLocation", "Local das atividades presenciais", "Polo, campus ou outro espaço previsto no projeto pedagógico.")}
        {longField("transitionNote", "Observação da transição desta turma", "")}
        <FormControlLabel control={<Switch color="primary" checked={!!form.published} onChange={(e) => set("published", e.target.checked)} />} label="Publicada: o agente já pode usar estas informações com os leads" />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Button variant="outlined" color="secondary" onClick={() => { setForm(null); setEditing(null); }}>Voltar</Button>
          <Button variant="contained" color="primary" disableElevation onClick={save} disabled={busy || !form.label.trim()}>Salvar turma</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <Typography variant="body2" color="textSecondary" gutterBottom>
        Cada turma guarda o que a instituição confirmou: modalidade contratada, ingresso, regime de transição, calendário, início das atividades presenciais, aulas ao vivo, práticas, avaliações e local.
        {data.gaps.published ? ` ${data.gaps.published} turma(s) publicada(s), ${data.gaps.incomplete} com informação faltando.` : " Nenhuma turma publicada ainda: o agente fala só da regra nacional e diz que o resto o consultor confirma."}
      </Typography>
      <TextField select fullWidth size="small" variant="outlined" label="Curso" value={courseId} onChange={(e) => setCourseId(e.target.value)} style={{ margin: "8px 0" }} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}>
        <MenuItem value="">Escolha um curso</MenuItem>
        {data.courses.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
      </TextField>
      {course && (
        <>
          {cohorts.length === 0 && <Typography variant="body2" color="textSecondary">Nenhuma turma cadastrada para este curso.</Typography>}
          {cohorts.map((c) => (
            <div key={c.id} className={classes.row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.label}</div>
                <div className={classes.small}>{[c.intakeTerm, c.intakeDate && c.intakeDate.split("-").reverse().join("/"), c.contractedModality, c.poloId && (data.polos.find((p) => p.id === c.poloId) || {}).name].filter(Boolean).join(" · ") || "Sem dados"}</div>
              </div>
              <span className={`${classes.tag} ${c.published ? classes.tagOn : ""}`}>{c.published ? "Publicada" : "Rascunho"}</span>
              <IconAction title="Apagar a turma" onClick={() => remove(c)}><Trash2 size={15} /></IconAction>
              <Button size="small" variant="outlined" onClick={() => { setEditing(c.id); setForm(clean(c)); }}>Editar</Button>
            </div>
          ))}
          <Button size="small" variant="contained" color="primary" disableElevation style={{ marginTop: 12 }} onClick={() => { setEditing(null); setForm({ ...EMPTY, label: `${course.name} ` }); }}>Nova turma</Button>
        </>
      )}
    </>
  );
};

export default CohortsPanel;
