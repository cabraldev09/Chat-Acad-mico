import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Tab, Tabs, TextField, Typography, makeStyles } from "@material-ui/core";
import { Trash2 } from "lucide-react";

import IconAction from "../../components/IconAction";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import MecDefaultsPanel from "./MecDefaultsPanel";
import CohortsPanel from "./CohortsPanel";
import NormsPanel from "./NormsPanel";

const useStyles = makeStyles((theme) => ({
  row: { display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: theme.border.divider },
  grid: { display: "grid", gap: theme.spacing(1), gridTemplateColumns: "1fr 1fr", [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr" } },
}));

const EMPTY = { intakeTerm: "", mecImpacted: "", regulation: "", percentualPresencial: "", percentualSincrono: "", teoriaAoVivo: "", praticaPresencial: "", cronogramaPraticasDefinido: "", transitionStatus: "", currentDelivery: "", futureDelivery: "", transitionNote: "", commercialApprovedText: "" };
const tri = (label, value, onChange) => (
  <TextField select size="small" variant="outlined" margin="dense" label={label} value={value === null || value === undefined ? "" : String(value)} onChange={(e) => onChange(e.target.value)} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}>
    <MenuItem value="">Não informado</MenuItem>
    <MenuItem value="true">Sim</MenuItem>
    <MenuItem value="false">Não</MenuItem>
  </TextField>
);

// What each course says about the change of modality (MEC). Without a rule the agent says nothing about it: the numbers are never invented.
const RegulationsDialog = ({ open, onClose }) => {
  const classes = useStyles();
  const [data, setData] = useState(null);
  const [courseId, setCourseId] = useState("");
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState(0);

  const load = useCallback(() => api.get("/course-regulations").then(({ data: d }) => setData(d)).catch(toastError), []);
  useEffect(() => { if (open) { setForm(null); setCourseId(""); load(); } }, [open, load]);

  const edit = (course, rule) => {
    setCourseId(course.id);
    setForm(rule ? { ...EMPTY, ...Object.fromEntries(Object.entries(rule).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v === null ? "" : v])) } : { ...EMPTY });
  };
  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/course-regulations/${courseId}`, form);
      toast.success("Regra salva.");
      setForm(null);
      load();
    } catch (e) { toastError(e); }
    setBusy(false);
  };
  const remove = async (r) => {
    if (!window.confirm("Apagar esta regra? O agente volta a não afirmar nada sobre o MEC para este curso.")) return;
    try { await api.delete(`/course-regulations/${r.id}`); load(); } catch (e) { toastError(e); }
  };
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const course = data && courseId ? data.courses.find((c) => c.id === courseId) : null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle>Regras de modalidade dos cursos (MEC)</DialogTitle>
      <DialogContent dividers>
        {!data && <CircularProgress size={22} />}
        {data && !form && (
          <Tabs value={tab} onChange={(e, v) => setTab(v)} indicatorColor="primary" textColor="primary" variant="scrollable" scrollButtons="auto" style={{ marginBottom: 8 }}>
            <Tab label="Por curso" />
            <Tab label="Padrão por área (Portaria 378/2025)" />
            <Tab label="Turmas" />
            <Tab label="Normas do MEC" />
          </Tabs>
        )}
        {data && !form && tab === 1 && <MecDefaultsPanel onChanged={load} />}
        {data && !form && tab === 2 && <CohortsPanel />}
        {data && !form && tab === 3 && <NormsPanel />}
        {data && !form && tab === 0 && (
          <>
            <Typography variant="body2" color="textSecondary" gutterBottom>
              O agente só fala de mudança de modalidade, aulas ao vivo, práticas presenciais e percentuais com o que estiver cadastrado aqui para o curso. Sem regra, ele diz que vai confirmar com um consultor.
            </Typography>
            <TextField fullWidth size="small" variant="outlined" placeholder="Buscar curso" value={q} onChange={(e) => setQ(e.target.value)} style={{ margin: "8px 0" }} />
            {data.courses.filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 80).map((c) => {
              const rules = data.rules.filter((r) => r.courseId === c.id);
              return (
                <div key={c.id} className={classes.row}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                    <div style={{ fontSize: 12.5, opacity: 0.7 }}>
                      {rules.length ? rules.map((r) => `${r.intakeTerm || "todos os ingressos"}${r.mecImpacted === true ? " · impactado pelo MEC" : r.mecImpacted === false ? " · não impactado" : ""}`).join(" | ") : "Sem regra cadastrada"}
                    </div>
                  </div>
                  {rules.map((r) => <IconAction key={r.id} title="Apagar a regra" onClick={() => remove(r)}><Trash2 size={15} /></IconAction>)}
                  <Button size="small" variant="outlined" onClick={() => edit(c, rules.find((r) => !r.intakeTerm))}>{rules.length ? "Editar" : "Cadastrar"}</Button>
                </div>
              );
            })}
          </>
        )}
        {data && form && (
          <>
            <Typography variant="subtitle1" style={{ fontWeight: 700 }}>{course ? course.name : ""}</Typography>
            <div className={classes.grid}>
              <TextField size="small" variant="outlined" margin="dense" label="Período de ingresso (vazio = todos)" value={form.intakeTerm} onChange={(e) => set("intakeTerm", e.target.value)} placeholder="2026/2" InputLabelProps={{ shrink: true }} />
              {tri("Impactado pelas regras do MEC", form.mecImpacted, (v) => set("mecImpacted", v))}
              <TextField size="small" variant="outlined" margin="dense" label="Regulação aplicável" value={form.regulation} onChange={(e) => set("regulation", e.target.value)} InputLabelProps={{ shrink: true }} />
              <TextField size="small" variant="outlined" margin="dense" label="Situação da transição" value={form.transitionStatus} onChange={(e) => set("transitionStatus", e.target.value)} InputLabelProps={{ shrink: true }} placeholder="em transição" />
              <TextField size="small" variant="outlined" margin="dense" label="% presencial (só se oficial)" value={form.percentualPresencial} onChange={(e) => set("percentualPresencial", e.target.value)} InputLabelProps={{ shrink: true }} />
              <TextField size="small" variant="outlined" margin="dense" label="% síncrono (só se oficial)" value={form.percentualSincrono} onChange={(e) => set("percentualSincrono", e.target.value)} InputLabelProps={{ shrink: true }} />
              {tri("Teoria com aulas ao vivo", form.teoriaAoVivo, (v) => set("teoriaAoVivo", v))}
              {tri("Práticas presenciais", form.praticaPresencial, (v) => set("praticaPresencial", v))}
              {tri("Cronograma das práticas definido", form.cronogramaPraticasDefinido, (v) => set("cronogramaPraticasDefinido", v))}
              <span />
              <TextField size="small" variant="outlined" margin="dense" label="Como é hoje (durante a transição)" value={form.currentDelivery} onChange={(e) => set("currentDelivery", e.target.value)} InputLabelProps={{ shrink: true }} placeholder="EAD" />
              <TextField size="small" variant="outlined" margin="dense" label="Como será depois" value={form.futureDelivery} onChange={(e) => set("futureDelivery", e.target.value)} InputLabelProps={{ shrink: true }} placeholder="Semipresencial" />
            </div>
            <TextField fullWidth multiline rows={2} size="small" variant="outlined" margin="dense" label="Observação da transição" value={form.transitionNote} onChange={(e) => set("transitionNote", e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField fullWidth multiline rows={3} size="small" variant="outlined" margin="dense" label="Texto aprovado para o comercial" value={form.commercialApprovedText} onChange={(e) => set("commercialApprovedText", e.target.value)} InputLabelProps={{ shrink: true }} helperText="O agente usa este texto, com estas palavras, quando o aluno perguntar sobre as mudanças." />
            <FormControlLabel control={<Checkbox checked disabled />} label="Nenhum valor é inventado: o que ficar “Não informado” o agente não afirma." />
          </>
        )}
      </DialogContent>
      <DialogActions>
        {form ? <Button variant="outlined" color="secondary" onClick={() => setForm(null)}>Voltar</Button> : <Button variant="outlined" color="secondary" onClick={onClose}>Fechar</Button>}
        {form && <Button variant="contained" color="primary" onClick={save} disabled={busy}>Salvar regra</Button>}
      </DialogActions>
    </Dialog>
  );
};

export default RegulationsDialog;
