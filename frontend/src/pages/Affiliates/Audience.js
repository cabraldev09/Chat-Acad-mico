import React, { useEffect, useState } from "react";
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Radio, RadioGroup, TextField, Typography,
} from "@material-ui/core";
import { Autocomplete } from "@material-ui/lab";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";

// Who can see a material or campaign: every affiliate, or only the consultants / affiliates chosen
export const AudiencePicker = ({ value, onChange, consultants, affiliates }) => (
  <div style={{ marginTop: 8 }}>
    <Typography variant="body2" style={{ fontWeight: 600 }}>Quem pode ver no portal</Typography>
    <RadioGroup row value={value.audience} onChange={(e) => onChange({ ...value, audience: e.target.value })}>
      <FormControlLabel value="all" control={<Radio color="primary" />} label="Todos os afiliados" />
      <FormControlLabel value="restricted" control={<Radio color="primary" />} label="Só quem eu escolher" />
    </RadioGroup>
    {value.audience === "restricted" && (
      <>
        <Autocomplete multiple size="small" options={consultants} getOptionLabel={(u) => u.name}
          value={consultants.filter((u) => value.ownerIds.includes(u.id))}
          onChange={(e, v) => onChange({ ...value, ownerIds: v.map((u) => u.id) })}
          renderInput={(p) => <TextField {...p} variant="outlined" margin="dense" label="Afiliados de qual consultor" placeholder="Escolher consultores" />} />
        <Autocomplete multiple size="small" options={affiliates} getOptionLabel={(a) => a.name}
          value={affiliates.filter((a) => value.affiliateIds.includes(a.id))}
          onChange={(e, v) => onChange({ ...value, affiliateIds: v.map((a) => a.id) })}
          renderInput={(p) => <TextField {...p} variant="outlined" margin="dense" label="Afiliados específicos" placeholder="Escolher afiliados" />} />
        {value.ownerIds.length + value.affiliateIds.length === 0 && (
          <Typography variant="caption" color="error">Ninguém escolhido: ninguém vai ver até você liberar.</Typography>
        )}
      </>
    )}
  </div>
);

// A consultant releases something to their own affiliates
export const ReleaseDialog = ({ open, kind, item, onClose, onDone }) => {
  const [mine, setMine] = useState([]);
  const [chosen, setChosen] = useState([]);
  useEffect(() => {
    if (!open) return;
    api.get("/affiliates").then(({ data }) => {
      setMine(data);
      setChosen(data.filter((a) => (item.affiliateIds || []).includes(a.id)));
    }).catch(toastError);
  }, [open, item]);

  const save = async () => {
    try {
      await api.post(`/affiliate-${kind}s/${item.id}/release`, { affiliateIds: chosen.map((a) => a.id) });
      toast.success("Liberação atualizada.");
      onDone();
    } catch (err) { toastError(err); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Liberar para os meus afiliados</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          {item && item.audience === "all" ? "Este item já aparece para todos os afiliados." : "Os escolhidos passam a ver este item no portal deles."}
        </Typography>
        <Autocomplete multiple options={mine} getOptionLabel={(a) => a.name} value={chosen} onChange={(e, v) => setChosen(v)}
          renderInput={(p) => <TextField {...p} variant="outlined" margin="dense" label="Meus afiliados" />} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button color="primary" variant="contained" onClick={save}>Salvar</Button>
      </DialogActions>
    </Dialog>
  );
};
