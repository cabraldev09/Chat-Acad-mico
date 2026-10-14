import React, { useState } from "react";
import { toast } from "react-toastify";
import { Button, CircularProgress, FormControlLabel, MenuItem, Switch, TextField, Typography } from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const HELP = {
  off: "Grupos não entram no atendimento. É o mais seguro para grupos pessoais e de promoções.",
  selected: "Só os grupos marcados abaixo viram conversas, na aba Grupos.",
  all: "Todos os grupos deste número viram conversas. Pode lotar a caixa de entrada.",
};

// Chooses which WhatsApp groups of a connected number become conversations.
const GroupsPicker = ({ whatsappId, connected, mode, onMode, allowed, onAllowed }) => {
  const [groups, setGroups] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/channels/${whatsappId}/groups`);
      setGroups(data.groups);
      if (!data.supported) toast.info("Este canal não lista grupos.");
    } catch (err) {
      toastError(err);
    }
    setLoading(false);
  };

  return (
    <div>
      <TextField select fullWidth variant="outlined" margin="dense" label="Receber mensagens de grupos" value={mode || "off"} onChange={(e) => onMode(e.target.value)} helperText={HELP[mode || "off"]}>
        <MenuItem value="off">Nenhum grupo</MenuItem>
        <MenuItem value="selected">Somente grupos escolhidos</MenuItem>
        <MenuItem value="all">Todos os grupos</MenuItem>
      </TextField>
      {(mode || "off") === "selected" && (
        <div style={{ marginTop: 6 }}>
          {!connected ? (
            <Typography variant="caption" color="textSecondary">Conecte o número (QR Code) para listar os seus grupos.</Typography>
          ) : (
            <Button size="small" variant="outlined" onClick={load} disabled={loading}>
              {loading ? <CircularProgress size={16} /> : groups ? "Atualizar lista de grupos" : "Carregar meus grupos"}
            </Button>
          )}
          {groups && groups.length === 0 && <Typography variant="caption" display="block" style={{ marginTop: 6 }}>Nenhum grupo encontrado neste número.</Typography>}
          {groups && groups.length > 0 && (
            <div style={{ maxHeight: 240, overflowY: "auto", marginTop: 8, border: "1px solid rgba(128,128,128,.25)", borderRadius: 10 }}>
              {groups.map((g) => (
                <FormControlLabel
                  key={g.id}
                  style={{ display: "flex", margin: 0, padding: "2px 10px" }}
                  control={<Switch size="small" color="primary" checked={allowed.includes(g.id)} onChange={(e) => onAllowed(e.target.checked ? [...allowed, g.id] : allowed.filter((x) => x !== g.id))} />}
                  label={`${g.name} (${g.participants})`}
                />
              ))}
            </div>
          )}
          {allowed.length > 0 && <Typography variant="caption" display="block" style={{ marginTop: 6 }}>{allowed.length} grupo(s) escolhido(s).</Typography>}
        </div>
      )}
    </div>
  );
};

export default GroupsPicker;
