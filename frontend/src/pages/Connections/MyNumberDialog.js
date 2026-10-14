import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Typography, CircularProgress } from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";

// Anyone connects their own WhatsApp here: they only choose a name, then read the QR Code with the phone.
const MyNumberDialog = ({ open, whatsApp, onClose, onCreated }) => {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setName(whatsApp ? whatsApp.name : ""); }, [open, whatsApp]);

  const save = async () => {
    setBusy(true);
    try {
      if (whatsApp) {
        await api.put(`/whatsapp/${whatsApp.id}`, { name });
        toast.success("Nome atualizado.");
        onClose();
      } else {
        const { data } = await api.post("/whatsapp", { name });
        toast.success("Número criado. Leia o QR Code com o celular.");
        onCreated && onCreated(data);
        onClose();
      }
    } catch (err) {
      toastError(err);
    }
    setBusy(false);
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{whatsApp ? "Renomear meu WhatsApp" : "Conectar meu WhatsApp"}</DialogTitle>
      <DialogContent>
        {!whatsApp && (
          <Typography variant="body2" color="textSecondary" gutterBottom>
            As conversas que chegarem neste número ficam com você. No celular, abra o WhatsApp → Aparelhos conectados → Conectar um aparelho e leia o QR Code que vai aparecer.
          </Typography>
        )}
        <TextField autoFocus fullWidth variant="outlined" margin="dense" label="Nome do número (opcional)" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: WhatsApp da Maria" />
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant="contained" color="primary" onClick={save} disabled={busy}>{busy ? <CircularProgress size={18} /> : whatsApp ? "Salvar" : "Gerar QR Code"}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default MyNumberDialog;
