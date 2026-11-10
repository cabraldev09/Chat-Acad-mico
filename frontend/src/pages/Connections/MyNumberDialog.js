import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Typography, CircularProgress } from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import GroupsPicker from "../../components/GroupsPicker";

// Anyone connects their own WhatsApp here: they only choose a name, then read the QR Code with the phone.
const MyNumberDialog = ({ open, whatsApp, onClose, onCreated }) => {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const [mode, setMode] = useState("off");
  const [allowed, setAllowed] = useState([]);
  useEffect(() => {
    if (!open) return;
    setName(whatsApp ? whatsApp.name : "");
    setPhone("");
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
      if (whatsApp) {
        await api.put(`/whatsapp/${whatsApp.id}`, { name, groupsMode: mode, allowedGroups: allowed });
        toast.success("Alterações salvas.");
        onClose();
      } else {
        const { data } = await api.post("/whatsapp", { name, ...(phone.replace(/\D/g, "") ? { pairingPhone: phone } : {}) });
        toast.success(phone.replace(/\D/g, "") ? "Número criado. Digite o código no WhatsApp do celular." : "Número criado. Leia o QR Code com o celular.");
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
      <DialogTitle>{whatsApp ? (whatsApp.channel === "instagram" ? "Meu Instagram" : "Meu WhatsApp") : "Conectar meu WhatsApp"}</DialogTitle>
      <DialogContent>
        {!whatsApp && (
          <Typography variant="body2" color="textSecondary" gutterBottom>
            As conversas que chegarem neste número ficam com você. No celular, abra o WhatsApp → Aparelhos conectados → Conectar um aparelho e leia o QR Code que vai aparecer, ou digite o número abaixo para receber um código e conectar sem outro aparelho.
          </Typography>
        )}
        <TextField autoFocus fullWidth variant="outlined" margin="dense" label="Nome do número (opcional)" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: WhatsApp da Maria" />
        {!whatsApp && (
          <TextField fullWidth variant="outlined" margin="dense" label="Seu número com DDD (opcional)" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="69 99999-9999"
            helperText="Preencha para conectar com um código de 8 letras, sem precisar ler QR Code." />
        )}
        {whatsApp && (!whatsApp.channel || whatsApp.channel === "whatsapp") && (
          <div style={{ marginTop: 12 }}>
            <Typography variant="subtitle2">Grupos do WhatsApp</Typography>
            <GroupsPicker whatsappId={whatsApp.id} connected={whatsApp.status === "CONNECTED"} mode={mode} onMode={setMode} allowed={allowed} onAllowed={setAllowed} />
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant="contained" color="primary" onClick={save} disabled={busy}>{busy ? <CircularProgress size={18} /> : whatsApp ? "Salvar" : phone.replace(/\D/g, "") ? "Gerar código" : "Gerar QR Code"}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default MyNumberDialog;
