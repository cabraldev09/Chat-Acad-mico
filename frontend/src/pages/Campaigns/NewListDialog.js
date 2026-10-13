import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, MenuItem, Tabs, Tab, Typography, makeStyles,
} from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  grid: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "1fr 1fr", [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr" } },
  count: { margin: theme.spacing(1.5, 0, 0), padding: theme.spacing(1, 1.5), borderRadius: 12, background: theme.palette.action.hover, fontSize: 14 },
  tabs: { marginBottom: theme.spacing(1.5) },
}));

// tiny parser for pasted lines: "nome;número" or just numbers
const parsePasted = (text) =>
  text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const c = l.split(/[;\t,]/).map((x) => x.trim());
    return c.length === 1 ? { name: "", number: c[0] } : { name: c[0], number: c[1] };
  });

// Creates a contact list from the CRM funnel (with filters) or from pasted numbers.
const NewListDialog = ({ open, onClose, onCreated }) => {
  const classes = useStyles();
  const [mode, setMode] = useState(0);
  const [name, setName] = useState("");
  const [f, setF] = useState({ stageId: "", courseId: "", poloId: "", tagId: "", source: "", noReplyDays: "" });
  const [pasted, setPasted] = useState("");
  const [opts, setOpts] = useState({ stages: [], courses: [], polos: [], tags: [], sources: [] });
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(0); setName(""); setPasted(""); setCount(null);
    setF({ stageId: "", courseId: "", poloId: "", tagId: "", source: "", noReplyDays: "" });
    Promise.all([
      api.get("/lead-stages").catch(() => ({ data: [] })),
      api.get("/courses").catch(() => ({ data: [] })),
      api.get("/polos").catch(() => ({ data: [] })),
      api.get("/tags").catch(() => ({ data: [] })),
      api.get("/crm/options").catch(() => ({ data: {} })),
    ]).then(([st, co, po, ta, op]) => setOpts({ stages: st.data, courses: co.data, polos: po.data.filter((p) => p.active), tags: ta.data, sources: op.data.sources || [] }));
  }, [open]);

  const body = () => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ""));

  // live "N pessoas" while the filters change
  useEffect(() => {
    if (!open || mode !== 0) return undefined;
    let cancelled = false;
    const t = setTimeout(() => {
      api.post("/contact-lists/from-leads", { ...body(), dryRun: true }).then(({ data }) => !cancelled && setCount(data.count)).catch(() => !cancelled && setCount(null));
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, f]);

  const create = async () => {
    setBusy(true);
    try {
      let list;
      if (mode === 0) {
        const { data } = await api.post("/contact-lists/from-leads", { ...body(), name });
        list = data;
        toast.success(`Lista criada com ${data.imported} ${data.imported === 1 ? "pessoa" : "pessoas"}.`);
      } else {
        const { data: created } = await api.post("/contact-lists", { name });
        const { data } = await api.post(`/contact-lists/${created.id}/import`, { items: parsePasted(pasted) });
        list = { id: created.id, name: created.name };
        toast.success(`Lista criada: ${data.imported} importados, ${data.skipped} ignorados (repetidos ou inválidos).`);
      }
      onCreated && onCreated(list);
      onClose();
    } catch (err) {
      toastError(err);
    }
    setBusy(false);
  };

  const select = (key, label, items, getLabel, all = "Todos") => (
    <TextField select fullWidth variant="outlined" margin="dense" label={label} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })}>
      <MenuItem value="">{all}</MenuItem>
      {items.map((it) => (<MenuItem key={it.id || it} value={it.id || it}>{getLabel(it)}</MenuItem>))}
    </TextField>
  );

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Nova lista de contatos</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth variant="outlined" margin="dense" label="Nome da lista" value={name} onChange={(e) => setName(e.target.value)} />
        <Tabs value={mode} onChange={(e, v) => setMode(v)} indicatorColor="primary" textColor="primary" className={classes.tabs}>
          <Tab label="Do funil do CRM" />
          <Tab label="Colar números" />
        </Tabs>
        {mode === 0 ? (
          <>
            <Typography variant="body2" color="textSecondary">Escolha quem entra na lista. Sem filtros, entram todos os leads em andamento que têm telefone.</Typography>
            <div className={classes.grid}>
              {select("stageId", "Etapa do funil", opts.stages, (s) => s.name, "Todas as etapas em andamento")}
              {select("courseId", "Curso de interesse", opts.courses, (c) => c.name)}
              {select("poloId", "Polo", opts.polos, (p) => p.name)}
              {select("tagId", "Etiqueta", opts.tags, (t) => t.name)}
              {select("source", "Origem", opts.sources, (s) => s, "Todas")}
              <TextField select fullWidth variant="outlined" margin="dense" label="Sem contato há" value={f.noReplyDays} onChange={(e) => setF({ ...f, noReplyDays: e.target.value })}>
                <MenuItem value="">Qualquer prazo</MenuItem>
                {[3, 7, 15, 30, 60].map((d) => (<MenuItem key={d} value={d}>{d} dias ou mais</MenuItem>))}
              </TextField>
            </div>
            <div className={classes.count}>
              {count === null ? "Contando…" : count === 0 ? "Nenhum lead com esses filtros." : <><b>{count}</b> {count === 1 ? "pessoa entra" : "pessoas entram"} na lista.</>}
            </div>
          </>
        ) : (
          <>
            <Typography variant="body2" color="textSecondary" gutterBottom>Uma pessoa por linha, no formato <b>nome;número</b> (ou só o número com DDI, ex.: 5569999990000).</Typography>
            <TextField fullWidth multiline rows={7} variant="outlined" margin="dense" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={"Maria;5569999990000\n5569988880000"} />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant="contained" color="primary" onClick={create} disabled={busy || !name.trim() || (mode === 0 ? count === 0 : !pasted.trim())}>Criar lista</Button>
      </DialogActions>
    </Dialog>
  );
};

export default NewListDialog;
