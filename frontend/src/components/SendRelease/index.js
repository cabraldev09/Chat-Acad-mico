import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";

// The quota of sends of the month and the request for more: shown where a send is prepared (the tutoring notice, the campaign). Past
// the quota, the person asks the management (how many more and why); the management decides in Estatísticas → Disparos.

export const QuotaLine = ({ quota }) => {
  if (!quota || !quota.limited) return null;
  const total = quota.quota + quota.extra;
  return (
    <p style={{ fontSize: 12.5, color: "var(--text-2)", margin: "8px 0 0" }}>
      Sua cota do mês: {quota.used} de {total} {total === 1 ? "mensagem" : "mensagens"}{quota.extra ? ` (${quota.extra} liberadas pela gestão)` : ""}.
      {quota.pending ? " Pedido de liberação enviado, aguardando a gestão." : ""}
    </p>
  );
};

export default function SendReleaseDialog({ open, onClose, suggested = 0, context = null }) {
  const [requested, setRequested] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setRequested(String(Math.max(1, Math.min(5000, Number(suggested) || 1))));
    setReason(context && context.name ? `Para enviar ${context.type === "aviso" ? "o aviso" : "a campanha"} "${context.name}"${context.recipients ? ` a ${context.recipients} pessoas` : ""}.` : "");
  }, [open, suggested, context]);
  const amount = Number(requested);
  const valid = Number.isInteger(amount) && amount >= 1 && amount <= 5000 && reason.trim().length >= 5;
  const send = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/send-releases", { requested: amount, reason: reason.trim(), context });
      toast.success("Pedido enviado. A gestão foi avisada.");
      onClose(data);
    } catch (e) { toastError(e); }
    setBusy(false);
  };
  return (
    <Dialog open={open} onClose={busy ? undefined : () => onClose(null)} maxWidth="xs" fullWidth>
      <DialogTitle>Pedir liberação à gestão</DialogTitle>
      <DialogContent style={{ display: "grid", gap: 14 }}>
        <div style={{ fontSize: 14 }}>Este envio passa da sua cota de disparos do mês. Diga quantas mensagens a mais você precisa e para quê.</div>
        <TextField id="release-requested" label="Mensagens a mais" type="number" variant="outlined" size="small" value={requested}
          onChange={(e) => { const { value } = e.target; setRequested(value); }} inputProps={{ min: 1, max: 5000, step: 1 }} InputLabelProps={{ shrink: true }} />
        <TextField id="release-reason" label="Motivo" variant="outlined" size="small" multiline minRows={3} value={reason}
          onChange={(e) => { const { value } = e.target; setReason(value); }} inputProps={{ maxLength: 500 }} InputLabelProps={{ shrink: true }}
          helperText="A gestão lê este texto para decidir." />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(null)} disabled={busy}>Cancelar</Button>
        <Button color="primary" variant="contained" onClick={send} disabled={busy || !valid}>{busy ? "Enviando..." : "Enviar pedido"}</Button>
      </DialogActions>
    </Dialog>
  );
}
