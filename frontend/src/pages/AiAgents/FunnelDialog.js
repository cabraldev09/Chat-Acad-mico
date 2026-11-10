import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";

// Which column of the CRM each step of the commercial journey uses. The agent moves leads by these steps, never by the name of a column.
const FunnelDialog = ({ open, onClose }) => {
  const [data, setData] = useState(null);
  const [map, setMap] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setData(null);
    api.get("/crm-funnel").then(({ data: d }) => { setData(d); setMap(d.keys.reduce((o, k) => ({ ...o, [k.key]: k.stageId || "" }), {})); }).catch(toastError);
  }, [open]);

  const save = async () => {
    setBusy(true);
    try { const { data: d } = await api.put("/crm-funnel", { map }); setData(d); toast.success("Funil salvo."); onClose(); } catch (e) { toastError(e); }
    setBusy(false);
  };
  const create = async () => {
    setBusy(true);
    try {
      const { data: d } = await api.post("/crm-funnel/create", {});
      setData(d);
      setMap(d.keys.reduce((o, k) => ({ ...o, [k.key]: k.stageId || "" }), {}));
      toast.success(d.created.length ? `Colunas criadas: ${d.created.join(", ")}.` : "Todas as colunas já existem.");
    } catch (e) { toastError(e); }
    setBusy(false);
  };

  const missing = data ? data.keys.filter((k) => !map[k.key]) : [];
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle>Funil do CRM para os agentes</DialogTitle>
      <DialogContent dividers>
        {!data && <CircularProgress size={22} />}
        {data && (
          <>
            <Typography variant="body2" color="textSecondary" gutterBottom>
              O agente comercial anda com o lead por estes passos, sempre para a frente. Escolha qual coluna do CRM cada passo usa. Um passo sem coluna é ignorado: o lead fica onde está.
            </Typography>
            {data.keys.map((k) => (
              <TextField key={k.key} select fullWidth size="small" variant="outlined" margin="dense" label={k.name} value={map[k.key] || ""} onChange={(e) => setMap({ ...map, [k.key]: e.target.value })} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}
                helperText={k.key === "enrolled" ? "Só a matrícula confirmada pelo sistema preenche esta coluna; o agente nunca move para ela." : undefined}>
                <MenuItem value="">Nenhuma (ignorar este passo)</MenuItem>
                {data.stages.filter((s) => s.type === k.type).map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
              </TextField>
            ))}
            {missing.length > 0 && (
              <Typography variant="body2" style={{ marginTop: 10 }}>
                {missing.length} passo(s) sem coluna: {missing.map((k) => k.name).join(", ")}. O botão “Criar as colunas que faltam” cria só as que não existem, sem mexer nas atuais.
              </Typography>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={create} disabled={busy || !data || missing.length === 0}>Criar as colunas que faltam</Button>
        <span style={{ flex: 1 }} />
        <Button variant="outlined" color="secondary" onClick={onClose}>Fechar</Button>
        <Button variant="contained" color="primary" onClick={save} disabled={busy || !data}>Salvar</Button>
      </DialogActions>
    </Dialog>
  );
};

export default FunnelDialog;
