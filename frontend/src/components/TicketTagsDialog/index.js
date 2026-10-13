import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Chip,
  Typography,
} from "@material-ui/core";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const TicketTagsDialog = ({ open, onClose, ticket, onSaved }) => {
  const [tags, setTags] = useState([]);
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    if (!open) return;
    api.get("/tags").then(({ data }) => setTags(data)).catch(toastError);
    setSelected((ticket?.tags || []).map((t) => t.id));
  }, [open, ticket]);

  const toggle = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    try {
      const { data } = await api.put(`/tickets/${ticket.id}/tags`, { tagIds: selected });
      toast.success("Etiquetas atualizadas");
      onSaved && onSaved(data.tags);
      onClose();
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Etiquetas do atendimento</DialogTitle>
      <DialogContent dividers>
        {tags.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            Nenhuma etiqueta criada. Um administrador pode criar em Etiquetas.
          </Typography>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {tags.map((t) => (
              <Chip
                key={t.id}
                label={t.name}
                clickable
                onClick={() => toggle(t.id)}
                style={{
                  background: selected.includes(t.id) ? t.color : "transparent",
                  color: selected.includes(t.id) ? "#fff" : undefined,
                  border: `1px solid ${t.color}`,
                }}
              />
            ))}
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="secondary" variant="outlined">Cancelar</Button>
        <Button onClick={save} color="primary" variant="contained">Salvar</Button>
      </DialogActions>
    </Dialog>
  );
};

export default TicketTagsDialog;
