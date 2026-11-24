import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, CircularProgress } from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import GroupsPicker from "../../components/GroupsPicker";

// The QR Code number the management gave to a consultant or tutor: the person only chooses which of its groups become conversations
// (the name, the queues and the rest stay with the management).
const MyNumberDialog = ({ open, whatsApp, onClose }) => {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("off");
  const [allowed, setAllowed] = useState([]);
  useEffect(() => {
    if (!open) return;
    setMode((whatsApp && whatsApp.groupsMode) || "off");
    try {
      setAllowed(whatsApp && whatsApp.allowedGroups ? JSON.parse(whatsApp.allowedGroups) : []);
    } catch (e) {
      setAllowed([]);
    }
  }, [open, whatsApp]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/whatsapp/${whatsApp.id}`, { groupsMode: mode, allowedGroups: allowed });
      toast.success("Alterações salvas.");
      onClose();
    } catch (err) {
      toastError(err);
    }
    setBusy(false);
  };

  if (!whatsApp) return null;
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Grupos do meu WhatsApp</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          {whatsApp.name}. Escolha quais grupos do WhatsApp viram conversas aqui. O nome e o restante do número ficam com a gestão.
        </Typography>
        <GroupsPicker whatsappId={whatsApp.id} connected={whatsApp.status === "CONNECTED"} mode={mode} onMode={setMode} allowed={allowed} onAllowed={setAllowed} />
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant="contained" color="primary" onClick={save} disabled={busy}>{busy ? <CircularProgress size={18} /> : "Salvar"}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default MyNumberDialog;
