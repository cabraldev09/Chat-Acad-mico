import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@material-ui/core";

import ConfirmationModal from "../../components/ConfirmationModal";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const when = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Porto_Velho", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Every save of the agent is kept: what changed, who did it and when. A bad edit is undone by putting an earlier version back.
const HistoryDialog = ({ open, agentId, onClose, onRestored }) => {
  const [rows, setRows] = useState(null);
  const [ask, setAsk] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get(`/ai-agents/${agentId}/history`).then(({ data }) => setRows(data)).catch((e) => { setRows([]); toastError(e); }), [agentId]);
  useEffect(() => { if (open && agentId) { setRows(null); load(); } }, [open, agentId, load]);

  const restore = async () => {
    setBusy(true);
    try {
      await api.post(`/ai-agents/${agentId}/history/${ask.id}/restore`);
      toast.success("Versão restaurada. O agente já usa estas configurações.");
      setAsk(null);
      await load();
      if (onRestored) onRestored();
    } catch (e) { toastError(e); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle>Histórico de alterações</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          Cada vez que o agente é salvo, a versão fica guardada. Se uma mudança piorou as respostas, restaure a versão anterior.
        </Typography>
        {!rows && <div style={{ textAlign: "center", padding: 24 }}><CircularProgress size={24} /></div>}
        {rows && rows.length === 0 && <Typography color="textSecondary" style={{ padding: "16px 0" }}>Nenhuma alteração registrada ainda. As próximas mudanças aparecem aqui.</Typography>}
        {rows && rows.map((r) => (
          <div key={r.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 0", borderTop: "1px solid rgba(100,116,139,.25)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{when(r.at)}{r.by ? ` · ${r.by}` : ""}</div>
              {r.note && <Typography variant="caption" color="textSecondary" display="block">{r.note}</Typography>}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {r.changed.length === 0 ? null : r.changed.map((c) => <Chip key={c} size="small" label={c} />)}
              </div>
            </div>
            {r.isCurrent ? <Chip size="small" color="primary" label="Versão atual" /> : <Button size="small" variant="outlined" onClick={() => setAsk(r)}>Restaurar</Button>}
          </div>
        ))}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      <ConfirmationModal title="Restaurar esta versão?" open={!!ask} onClose={() => setAsk(null)} onConfirm={restore}>
        {ask ? `O agente volta às configurações de ${when(ask.at)}. A versão de hoje continua guardada no histórico.` : ""}
      </ConfirmationModal>
    </Dialog>
  );
};

export default HistoryDialog;
