import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
} from "@material-ui/core";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const pad = (n) => String(n).padStart(2, "0");
const defaultWhen = () => {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
};

const ScheduleMessageDialog = ({ open, onClose, ticket }) => {
  const [when, setWhen] = useState(defaultWhen());
  const [body, setBody] = useState("");

  const save = async () => {
    if (!body.trim()) return toast.error("Escreva a mensagem");
    const sendAt = new Date(when);
    if (!when || Number.isNaN(sendAt.getTime())) return toast.error("Informe a data e a hora do envio");
    try {
      await api.post("/schedules", {
        contactId: ticket.contact && ticket.contact.id,
        ticketId: ticket.id,
        whatsappId: ticket.whatsappId,
        body,
        sendAt: sendAt.toISOString(),
      });
      toast.success("Mensagem agendada");
      setBody("");
      onClose();
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Agendar mensagem para {ticket?.contact?.name}</DialogTitle>
      <DialogContent dividers>
        <TextField
          fullWidth
          type="datetime-local"
          label="Enviar em"
          variant="outlined"
          margin="dense"
          InputLabelProps={{ shrink: true }}
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
        <TextField
          fullWidth
          multiline
          rows={5}
          label="Mensagem"
          variant="outlined"
          margin="dense"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="secondary" variant="outlined">Cancelar</Button>
        <Button onClick={save} color="primary" variant="contained">Agendar</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ScheduleMessageDialog;
