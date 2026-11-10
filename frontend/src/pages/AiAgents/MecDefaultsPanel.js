import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, CircularProgress, MenuItem, TextField, Typography, makeStyles } from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  card: { border: theme.border.divider, borderRadius: 14, padding: theme.spacing(1.5, 2), marginTop: theme.spacing(1.5) },
  grid: { display: "grid", gap: theme.spacing(1), gridTemplateColumns: "1fr 1fr 1fr", [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr" } },
  small: { fontSize: 12.5, color: theme.palette.text.secondary },
}));

const tri = (label, value, onChange) => (
  <TextField select size="small" variant="outlined" margin="dense" label={label} value={value === null || value === undefined ? "" : String(value)} onChange={(e) => onChange(e.target.value)} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}>
    <MenuItem value="">Não informado</MenuItem>
    <MenuItem value="true">Sim</MenuItem>
    <MenuItem value="false">Não</MenuItem>
  </TextField>
);

// The standard of the MEC rules by area (Portaria MEC 378/2025): the team adjusts it once and applies it to every course of the area.
const MecDefaultsPanel = ({ onChanged }) => {
  const classes = useStyles();
  const [data, setData] = useState(null);
  const [forms, setForms] = useState({});
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => api.get("/mec-defaults").then(({ data: d }) => {
    setData(d);
    setForms(Object.fromEntries(d.areas.map((a) => [a.id, { ...a }])));
  }).catch(toastError), []);
  useEffect(() => { load(); }, [load]);

  const set = (id, k, v) => setForms((f) => ({ ...f, [id]: { ...f[id], [k]: v } }));
  const save = async (a) => {
    setBusy(`save-${a.id}`);
    try { await api.put(`/mec-defaults/${a.id}`, forms[a.id]); toast.success("Padrão salvo. Aplique aos cursos para valer."); await load(); } catch (e) { toastError(e); }
    setBusy("");
  };
  const apply = async (a, overwrite) => {
    const msg = overwrite
      ? `Aplicar este padrão a TODOS os ${a ? data.areas.find((x) => x.id === a.id).courses.length : data.total} cursos${a ? " desta área" : ""}? As regras já cadastradas deles serão substituídas (regras de um período de ingresso não mudam).`
      : "Preencher só os cursos que ainda não têm regra?";
    if (!window.confirm(msg)) return;
    setBusy(`apply-${a ? a.id : "all"}`);
    try {
      if (a) await api.put(`/mec-defaults/${a.id}`, forms[a.id]);
      const { data: r } = await api.post("/mec-defaults/apply", { area: a ? a.id : undefined, overwrite });
      toast.success(`${r.created} regra(s) criada(s), ${r.updated} atualizada(s), ${r.skipped} mantida(s).`);
      await load();
      if (onChanged) onChanged();
    } catch (e) { toastError(e); }
    setBusy("");
  };

  if (!data) return <CircularProgress size={22} />;
  return (
    <>
      <Typography variant="body2" color="textSecondary">
        Padrão baseado na Portaria MEC nº 378/2025: cada curso entra numa área e recebe a regra dela. Ajuste a área uma vez e aplique a todos os cursos; para um curso só, use a lista por curso.
        A classificação é automática pelo nome e pelo grau do curso: confira as listas abaixo.
      </Typography>
      <Button size="small" variant="outlined" color="primary" style={{ marginTop: 8 }} disabled={!!busy || !data.withoutRule} onClick={() => apply(null, false)}>
        Preencher os {data.withoutRule} cursos sem regra
      </Button>
      {data.areas.map((a) => {
        const f = forms[a.id] || a;
        return (
          <div key={a.id} className={classes.card}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>{a.label}</div>
            <div className={classes.small}>{a.article} · {a.courses.length} curso(s) · {a.courses.filter((c) => c.hasRule).length} já com regra</div>
            <div className={classes.grid}>
              {tri("Impactado pelo MEC", f.mecImpacted, (v) => set(a.id, "mecImpacted", v))}
              <TextField size="small" variant="outlined" margin="dense" label="% presencial" value={f.percentualPresencial ?? ""} onChange={(e) => set(a.id, "percentualPresencial", e.target.value)} InputLabelProps={{ shrink: true }} />
              <TextField size="small" variant="outlined" margin="dense" label="% presencial ou síncrono" value={f.percentualSincrono ?? ""} onChange={(e) => set(a.id, "percentualSincrono", e.target.value)} InputLabelProps={{ shrink: true }} />
              {tri("Teoria com aulas ao vivo", f.teoriaAoVivo, (v) => set(a.id, "teoriaAoVivo", v))}
              {tri("Práticas presenciais", f.praticaPresencial, (v) => set(a.id, "praticaPresencial", v))}
              {tri("Cronograma das práticas definido", f.cronogramaPraticasDefinido, (v) => set(a.id, "cronogramaPraticasDefinido", v))}
            </div>
            <TextField fullWidth multiline rows={3} size="small" variant="outlined" margin="dense" label="Texto aprovado para o comercial" value={f.commercialApprovedText || ""} onChange={(e) => set(a.id, "commercialApprovedText", e.target.value)} InputLabelProps={{ shrink: true }} helperText="O agente usa este texto, com estas palavras, quando perguntarem sobre a mudança." />
            <TextField fullWidth multiline rows={2} size="small" variant="outlined" margin="dense" label="Observação" value={f.transitionNote || ""} onChange={(e) => set(a.id, "transitionNote", e.target.value)} InputLabelProps={{ shrink: true }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              <Button size="small" variant="outlined" disabled={!!busy} onClick={() => save(a)}>Salvar padrão</Button>
              <Button size="small" variant="contained" color="primary" disabled={!!busy || !a.courses.length} onClick={() => apply(a, true)}>Salvar e aplicar a todos os cursos da área</Button>
              <Button size="small" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? "Esconder cursos" : "Ver cursos"}</Button>
            </div>
            {open === a.id && <div className={classes.small} style={{ marginTop: 8, columnCount: 2 }}>{a.courses.map((c) => <div key={c.id}>{c.name}{c.hasRule ? "" : " (sem regra)"}</div>)}</div>}
          </div>
        );
      })}
    </>
  );
};

export default MecDefaultsPanel;
