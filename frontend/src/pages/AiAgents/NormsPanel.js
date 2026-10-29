import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, CircularProgress, MenuItem, TextField, Typography, makeStyles } from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  card: { border: theme.border.divider, borderRadius: 12, padding: theme.spacing(1.5, 2), marginTop: theme.spacing(1.5) },
  head: { display: "flex", alignItems: "flex-start", gap: 8 },
  small: { fontSize: 12.5, color: theme.palette.text.secondary },
  tag: { fontSize: 11.5, padding: "1px 8px", borderRadius: 999, border: `1px solid ${theme.palette.divider}`, color: theme.palette.text.secondary, whiteSpace: "nowrap" },
  warn: { color: "#b45309", borderColor: "#b45309" },
  grid: { display: "grid", gap: theme.spacing(1), gridTemplateColumns: "1fr 1fr", [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr" } },
}));

const STATUS = [["vigente", "Vigente"], ["alterada", "Alterada por norma posterior"], ["revogada", "Revogada"]];
const day = (v) => (v ? new Date(v).toLocaleDateString("pt-BR") : null);

// The national norms the agents rely on. Each one says where it was read, its status, and when someone last checked it against the Diário Oficial.
// The agents are told the status, so an amended norm is not quoted as current.
const NormsPanel = () => {
  const classes = useStyles();
  const [data, setData] = useState(null);
  const [forms, setForms] = useState({});
  const [busy, setBusy] = useState("");
  const [fresh, setFresh] = useState(null);

  const load = useCallback(() => api.get("/regulatory-norms").then(({ data: d }) => {
    setData(d);
    setForms(Object.fromEntries(d.norms.map((n) => [n.id, { status: n.status, amendments: n.amendments || "", sourceUrl: n.sourceUrl || "" }])));
  }).catch(toastError), []);
  useEffect(() => { load(); }, [load]);

  const set = (id, k, v) => setForms((f) => ({ ...f, [id]: { ...f[id], [k]: v } }));
  const save = async (n, reviewedOnly) => {
    setBusy(String(n.id));
    try {
      await api.put(`/regulatory-norms/${n.id}`, reviewedOnly ? { reviewed: true } : forms[n.id]);
      toast.success(reviewedOnly ? "Conferência registrada." : "Norma salva. Os agentes já usam esta situação.");
      await load();
    } catch (e) { toastError(e); }
    setBusy("");
  };
  const create = async () => {
    setBusy("new");
    try { await api.post("/regulatory-norms", fresh); setFresh(null); toast.success("Norma adicionada."); await load(); } catch (e) { toastError(e); }
    setBusy("");
  };

  if (!data) return <CircularProgress size={22} />;
  return (
    <>
      <Typography variant="body2" color="textSecondary">
        As regras nacionais que os agentes conhecem. Os textos foram lidos nas publicações oficiais. Quando sair uma norma nova ou uma alteração, registre aqui: o agente passa a tratar a norma como alterada e só afirma o que estiver confirmado. A conferência vale por {data.staleDays} dias.
      </Typography>
      {data.norms.map((n) => {
        const f = forms[n.id] || {};
        return (
          <div key={n.id} className={classes.card}>
            <div className={classes.head}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{n.number}</div>
                <div className={classes.small}>{n.title}</div>
                <div className={classes.small}>{n.reviewedAt ? `Conferida com a fonte oficial em ${day(n.reviewedAt)}` : "Ainda não conferida por uma pessoa da equipe"}</div>
              </div>
              <span className={`${classes.tag} ${n.stale ? classes.warn : ""}`}>{n.stale ? "Conferir de novo" : "Em dia"}</span>
            </div>
            <div className={classes.grid}>
              <TextField select size="small" variant="outlined" margin="dense" label="Situação" value={f.status || "vigente"} onChange={(e) => set(n.id, "status", e.target.value)} InputLabelProps={{ shrink: true }}>
                {STATUS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
              </TextField>
              <TextField size="small" variant="outlined" margin="dense" label="Link da fonte oficial" value={f.sourceUrl || ""} onChange={(e) => set(n.id, "sourceUrl", e.target.value)} InputLabelProps={{ shrink: true }} />
            </div>
            <TextField fullWidth multiline rows={2} size="small" variant="outlined" margin="dense" label="Alterações posteriores" value={f.amendments || ""} onChange={(e) => set(n.id, "amendments", e.target.value)} InputLabelProps={{ shrink: true }} helperText="Ex.: Portaria nº 000/2026 alterou o art. 8º: ..." />
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="small" variant="contained" color="primary" disableElevation disabled={busy === String(n.id)} onClick={() => save(n, false)}>Salvar</Button>
              <Button size="small" variant="outlined" disabled={busy === String(n.id)} onClick={() => save(n, true)}>Conferi na fonte oficial</Button>
            </div>
          </div>
        );
      })}
      {!fresh && <Button size="small" variant="outlined" style={{ marginTop: 12 }} onClick={() => setFresh({ number: "", title: "", kind: "portaria", publishedAt: "", sourceUrl: "", summary: "", status: "vigente", amendments: "" })}>Adicionar norma nova</Button>}
      {fresh && (
        <div className={classes.card}>
          <div className={classes.grid}>
            <TextField size="small" variant="outlined" margin="dense" label="Número e data" value={fresh.number} onChange={(e) => setFresh({ ...fresh, number: e.target.value })} placeholder="Portaria MEC nº 000, de 00 de mês de 2026" InputLabelProps={{ shrink: true }} />
            <TextField size="small" variant="outlined" margin="dense" label="Título" value={fresh.title} onChange={(e) => setFresh({ ...fresh, title: e.target.value })} InputLabelProps={{ shrink: true }} />
            <TextField size="small" variant="outlined" margin="dense" label="Publicada em" type="date" value={fresh.publishedAt} onChange={(e) => setFresh({ ...fresh, publishedAt: e.target.value })} InputLabelProps={{ shrink: true }} />
            <TextField size="small" variant="outlined" margin="dense" label="Link da fonte oficial" value={fresh.sourceUrl} onChange={(e) => setFresh({ ...fresh, sourceUrl: e.target.value })} InputLabelProps={{ shrink: true }} />
          </div>
          <TextField fullWidth multiline rows={5} size="small" variant="outlined" margin="dense" label="O que a norma diz (com artigos)" value={fresh.summary} onChange={(e) => setFresh({ ...fresh, summary: e.target.value })} InputLabelProps={{ shrink: true }} helperText="Só o que está no texto oficial. Este resumo vai para a base dos agentes." />
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="small" variant="outlined" color="secondary" onClick={() => setFresh(null)}>Cancelar</Button>
            <Button size="small" variant="contained" color="primary" disableElevation disabled={busy === "new" || !fresh.number.trim() || !fresh.title.trim() || !fresh.summary.trim()} onClick={create}>Adicionar</Button>
          </div>
        </div>
      )}
    </>
  );
};

export default NormsPanel;
