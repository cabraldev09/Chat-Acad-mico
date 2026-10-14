import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, MenuItem, Paper, TextField, Typography } from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { useStyles } from "./shared";

const RulesTab = () => {
  const classes = useStyles();
  const [f, setF] = useState(null);
  useEffect(() => { api.get("/affiliate-rules").then(({ data }) => setF(data)).catch(toastError); }, []);
  if (!f) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    try { const { data } = await api.put("/affiliate-rules", f); setF(data); toast.success("Regras salvas."); } catch (err) { toastError(err); }
  };

  return (
    <div className={classes.body}>
      <Paper variant="outlined" style={{ padding: 20, maxWidth: 640, animation: "page-in .4s var(--ease-out) both" }}>
        <Typography variant="subtitle1" style={{ fontWeight: 700 }} gutterBottom>Bonificação por matrícula</Typography>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          A regra vale para todos, a não ser que o afiliado tenha um valor próprio ou que uma campanha no ar pague mais. O pagamento é feito por fora e registrado na aba Bonificações.
        </Typography>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
          <TextField select label="Como calcular" value={f.mode} onChange={set("mode")} variant="outlined" margin="dense">
            <MenuItem value="fixed">Valor fixo por matrícula</MenuItem>
            <MenuItem value="pct">Percentual da mensalidade do curso</MenuItem>
          </TextField>
          <TextField label={f.mode === "pct" ? "Percentual (%)" : "Valor (R$)"} type="number" value={f.value} onChange={set("value")} variant="outlined" margin="dense" />
          <TextField select label="Quando passa a valer" value={f.trigger} onChange={set("trigger")} variant="outlined" margin="dense">
            <MenuItem value="enrolled">Quando a matrícula é confirmada</MenuItem>
            <MenuItem value="fee_paid">Só depois que a taxa de matrícula é paga</MenuItem>
          </TextField>
          <TextField select label="Forma de pagamento" value={f.kind} onChange={set("kind")} variant="outlined" margin="dense">
            <MenuItem value="bonus">Bonificação</MenuItem>
            <MenuItem value="pix">Pix na chave do afiliado</MenuItem>
          </TextField>
        </div>
        <Typography variant="subtitle1" style={{ fontWeight: 700, marginTop: 24 }} gutterBottom>Texto do portal</Typography>
        <TextField label="Título" value={f.portalTitle} onChange={set("portalTitle")} fullWidth variant="outlined" margin="dense" inputProps={{ maxLength: 80 }} />
        <TextField label="Mensagem de boas-vindas" value={f.portalMessage} onChange={set("portalMessage")} fullWidth multiline rows={2} variant="outlined" margin="dense" inputProps={{ maxLength: 300 }} />
        <Button variant="contained" color="primary" onClick={save} style={{ marginTop: 16 }}>Salvar regras</Button>
      </Paper>
    </div>
  );
};

export default RulesTab;
