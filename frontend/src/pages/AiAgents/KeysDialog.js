import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";

// The keys of the AI providers the agents use when they have no key of their own. They are kept on the server and never come back whole.
const KeysDialog = ({ open, onClose, onSaved }) => {
  const [keys, setKeys] = useState({ anthropic: "", openai: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) api.get("/ai-settings").then(({ data }) => setKeys(data)).catch(toastError);
  }, [open]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/ai-settings", keys);
      toast.success("Chaves salvas.");
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      toastError(err);
    }
    setBusy(false);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ style: { borderRadius: 18 } }}>
      <DialogTitle>Chave de IA</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          Usada pelos agentes que não têm uma chave própria. Fica guardada no servidor, cifrada, e nunca volta inteira para o navegador.
        </Typography>
        <TextField fullWidth variant="outlined" margin="dense" label="Chave da Anthropic (Claude)" type="password" value={keys.anthropic} onChange={(e) => setKeys({ ...keys, anthropic: e.target.value })} InputLabelProps={{ shrink: true }} />
        <TextField fullWidth variant="outlined" margin="dense" label="Chave da OpenAI (GPT e áudios)" type="password" value={keys.openai} onChange={(e) => setKeys({ ...keys, openai: e.target.value })} InputLabelProps={{ shrink: true }} helperText="Também entende áudios dos leads, quando está conectada." />
      </DialogContent>
      <DialogActions style={{ padding: "8px 24px 20px" }}>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" color="primary" onClick={save} disabled={busy} disableElevation>Salvar chave</Button>
      </DialogActions>
    </Dialog>
  );
};

export default KeysDialog;
