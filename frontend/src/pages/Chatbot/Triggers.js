import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, ListSubheader, MenuItem, Paper, Switch, TextField, Tooltip, Typography, makeStyles } from "@material-ui/core";
import { Pencil, Plus, Trash2, Zap } from "lucide-react";

import ConfirmationModal from "../../components/ConfirmationModal";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  intro: { color: theme.palette.text.secondary, fontSize: 14, maxWidth: 760, marginBottom: theme.spacing(2) },
  head: { display: "grid", gridTemplateColumns: "70px minmax(140px,1.2fr) minmax(180px,1.4fr) minmax(160px,1.2fr) 90px 80px", gap: 12, padding: "10px 16px", fontSize: 12.5, fontWeight: 600, color: theme.palette.text.secondary, [theme.breakpoints.down("sm")]: { display: "none" } },
  row: { display: "grid", gridTemplateColumns: "70px minmax(140px,1.2fr) minmax(180px,1.4fr) minmax(160px,1.2fr) 90px 80px", gap: 12, alignItems: "center", padding: "12px 16px", borderTop: theme.border.divider, fontSize: 14, [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr auto", rowGap: 4 } },
  hint: { fontSize: 12.5, color: theme.palette.text.secondary },
  empty: { textAlign: "center", color: theme.palette.text.secondary, padding: theme.spacing(5, 2) },
}));

const TriggerDialog = ({ open, onClose, trigger, events, flows, lists, onSaved }) => {
  const [f, setF] = useState({ name: "", event: "", flowId: "", config: {} });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(trigger ? { name: trigger.name, event: trigger.event, flowId: trigger.flowId || "", config: trigger.config || {} } : { name: "", event: "", flowId: "", config: {} });
  }, [open, trigger]);
  const event = events.find((e) => e.key === f.event);
  const save = async () => {
    setBusy(true);
    try {
      const body = { name: f.name || (event ? event.label : "Gatilho"), event: f.event, flowId: f.flowId, config: f.config };
      if (trigger) await api.put(`/automation-triggers/${trigger.id}`, body);
      else await api.post("/automation-triggers", body);
      toast.success("Gatilho salvo.");
      onSaved();
    } catch (e) { toastError(e); }
    setBusy(false);
  };
  const groups = [...new Set(events.map((e) => e.group))];
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{trigger ? "Editar gatilho" : "Novo gatilho"}</DialogTitle>
      <DialogContent>
        <TextField fullWidth size="small" variant="outlined" margin="dense" label="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} InputLabelProps={{ shrink: true }} placeholder="Ex.: Boas-vindas ao novo contato" />
        <TextField select fullWidth size="small" variant="outlined" margin="dense" label="Quando isso acontecer" value={f.event} onChange={(e) => setF({ ...f, event: e.target.value, config: {} })} InputLabelProps={{ shrink: true }}>
          {groups.reduce((out, g) => [
            ...out,
            <ListSubheader key={`g-${g}`}>{g}</ListSubheader>,
            ...events.filter((e) => e.group === g).map((e) => (
              <MenuItem key={e.key} value={e.key} disabled={!e.available}>
                <span>{e.label}{!e.available && <span style={{ display: "block", fontSize: 11.5, opacity: 0.75 }}>{e.note}</span>}</span>
              </MenuItem>
            )),
          ], [])}
        </TextField>
        {event && (event.filters || []).map((flt) => (
          flt.kind === "text" ? (
            <TextField key={flt.key} fullWidth size="small" variant="outlined" margin="dense" label={`${flt.label} (opcional)`} value={f.config[flt.key] || ""} onChange={(e) => setF({ ...f, config: { ...f.config, [flt.key]: e.target.value } })} InputLabelProps={{ shrink: true }} />
          ) : (
            <TextField key={flt.key} select fullWidth size="small" variant="outlined" margin="dense" label={`${flt.label} (opcional)`} value={f.config[flt.key] || ""} onChange={(e) => setF({ ...f, config: { ...f.config, [flt.key]: e.target.value } })} InputLabelProps={{ shrink: true }}>
              <MenuItem value="">Qualquer</MenuItem>
              {(flt.kind === "stage" ? lists.stages : flt.kind === "tag" ? lists.tags : lists.users).map((x) => <MenuItem key={x.id} value={x.id}>{x.name}</MenuItem>)}
            </TextField>
          )
        ))}
        <TextField select fullWidth size="small" variant="outlined" margin="dense" label="Executar o fluxo" value={f.flowId} onChange={(e) => setF({ ...f, flowId: e.target.value })} InputLabelProps={{ shrink: true }}>
          {flows.map((fl) => <MenuItem key={fl.id} value={fl.id}>{fl.name}{fl.status !== "published" ? " (rascunho: publique para valer)" : ""}</MenuItem>)}
        </TextField>
        <div style={{ fontSize: 12.5, opacity: 0.75, marginTop: 8 }}>O fluxo roda na conversa aberta da pessoa. Se ela não tiver uma conversa aberta, nada é enviado. O mesmo gatilho não repete na mesma conversa em menos de 10 minutos.</div>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="contained" color="primary" onClick={save} disabled={busy || !f.event || !f.flowId}>Salvar</Button>
      </DialogActions>
    </Dialog>
  );
};

const Triggers = ({ flows }) => {
  const classes = useStyles();
  const [rows, setRows] = useState(null);
  const [events, setEvents] = useState([]);
  const [lists, setLists] = useState({ stages: [], tags: [], users: [] });
  const [edit, setEdit] = useState(null); // null | {} (new) | trigger
  const [del, setDel] = useState(null);

  const load = useCallback(() => api.get("/automation-triggers").then(({ data }) => setRows(data)).catch((e) => { toastError(e); setRows([]); }), []);
  useEffect(() => {
    load();
    api.get("/automation-events").then(({ data }) => setEvents(data)).catch(() => undefined);
    api.get("/lead-stages").then(({ data }) => setLists((l) => ({ ...l, stages: data }))).catch(() => undefined);
    api.get("/tags").then(({ data }) => setLists((l) => ({ ...l, tags: Array.isArray(data) ? data : data.tags || [] }))).catch(() => undefined);
    api.get("/users", { params: { pageNumber: 1 } }).then(({ data }) => setLists((l) => ({ ...l, users: data.users || [] }))).catch(() => undefined);
  }, [load]);

  const toggle = async (t) => { try { await api.put(`/automation-triggers/${t.id}`, { active: !t.active }); load(); } catch (e) { toastError(e); } };
  const remove = async () => { try { await api.delete(`/automation-triggers/${del.id}`); setDel(null); toast.success("Gatilho excluído."); load(); } catch (e) { toastError(e); } };

  return (
    <>
      <div className={classes.intro}>Um gatilho liga um acontecimento do sistema a um fluxo: quando um novo contato chega, uma etiqueta é colocada, o lead muda de etapa ou a matrícula é confirmada, o fluxo escolhido roda sozinho na conversa da pessoa.</div>
      <div style={{ marginBottom: 12 }}><Button variant="contained" color="primary" startIcon={<Plus size={16} />} onClick={() => setEdit({})}>Novo gatilho</Button></div>
      <Paper variant="outlined" style={{ borderRadius: 16, overflow: "hidden" }}>
        <div className={classes.head}><span>Ativo</span><span>Nome</span><span>Quando isso acontece</span><span>Executar o fluxo</span><span>Execuções</span><span /></div>
        {rows && rows.length === 0 && <div className={classes.empty}><Zap size={32} style={{ opacity: 0.6 }} /><div style={{ fontWeight: 700, margin: "6px 0 2px" }}>Nenhum gatilho ainda</div>Crie o primeiro, por exemplo “Novo contato → Boas-vindas”.</div>}
        {(rows || []).map((t) => (
          <div key={t.id} className={classes.row}>
            <span><Switch size="small" color="primary" checked={t.active} onChange={() => toggle(t)} inputProps={{ "aria-label": "Ativar ou pausar" }} /></span>
            <span style={{ fontWeight: 600 }}>{t.name}</span>
            <span>{t.eventLabel}</span>
            <span>{t.flowName ? <>{t.flowName}{!t.flowPublished && <Typography component="span" className={classes.hint}> · rascunho</Typography>}</> : <span className={classes.hint}>sem fluxo</span>}</span>
            <span className={classes.hint} title={t.lastRunAt ? `Última vez: ${new Date(t.lastRunAt).toLocaleString("pt-BR")}` : "Ainda não rodou"}>{t.runCount}</span>
            <span style={{ display: "flex" }}>
              <Tooltip title="Editar"><IconButton size="small" onClick={() => setEdit(t)} aria-label="Editar"><Pencil size={16} /></IconButton></Tooltip>
              <Tooltip title="Excluir"><IconButton size="small" onClick={() => setDel(t)} aria-label="Excluir"><Trash2 size={16} /></IconButton></Tooltip>
            </span>
          </div>
        ))}
      </Paper>
      <TriggerDialog open={!!edit} onClose={() => setEdit(null)} trigger={edit && edit.id ? edit : null} events={events} flows={flows} lists={lists} onSaved={() => { setEdit(null); load(); }} />
      <ConfirmationModal open={!!del} onClose={() => setDel(null)} title={`Excluir o gatilho “${del ? del.name : ""}”?`} onConfirm={remove}>O fluxo não é apagado; só deixa de rodar por este acontecimento.</ConfirmationModal>
    </>
  );
};

export default Triggers;
