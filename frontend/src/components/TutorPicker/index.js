import React, { useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@material-ui/core";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";

// The tutors who may take a student: the ones of the polo first; without a polo (or none there), every tutor of the institution.
export const useTutors = (poloId, enabled = true) => {
  const [tutors, setTutors] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    setTutors(null);
    const load = async () => {
      let list = [];
      try { if (poloId) list = (await api.get(`/polos/${poloId}/tutors`)).data || []; } catch (err) { list = []; }
      if (!list.length) { try { list = (await api.get("/tutors")).data || []; } catch (err) { list = []; } }
      if (alive) setTutors(list);
    };
    load();
    return () => { alive = false; };
  }, [poloId, enabled]);
  return tutors;
};

// "Escolher pelo rodízio", "Sem tutor" or one tutor (value: "auto", 0 or the id)
export const TutorField = ({ tutors, value, onChange, label = "Tutor", allowNone = true, size = "small", ...rest }) => (
  <TextField select fullWidth variant="outlined" size={size} label={label} value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
    <MenuItem value="auto">Escolher pelo rodízio da tutoria</MenuItem>
    {allowNone && <MenuItem value={0}>Sem tutor (fica na fila)</MenuItem>}
    {(tutors || []).map((t) => <MenuItem key={t.id} value={t.id}>{t.name}{t.outside ? " (de outro polo)" : ""}</MenuItem>)}
  </TextField>
);

// The management sets (or changes) the tutor of a student: the conversation of the tutoring and the portal go with the new tutor,
// who is told; nothing is sent to the student.
export const TutorDialog = ({ open, lead, onClose, onDone }) => {
  const tutors = useTutors(lead && lead.poloId, open && !!lead);
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open && lead) setPick(lead.tutorId || 0); }, [open, lead]);
  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/leads/${lead.id}/onboarding`, { tutorId: pick === "auto" ? "auto" : pick || null });
      toast.success(pick ? "Tutor definido. Ele foi avisado e a conversa da tutoria passou para ele." : "Aluno devolvido para a fila da tutoria.");
      onDone && onDone();
      onClose();
    } catch (err) { toastError(err); }
    setBusy(false);
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{lead && lead.tutorId ? "Trocar o tutor" : "Atribuir tutor"}</DialogTitle>
      <DialogContent>
        {lead && (
          <>
            <Typography variant="body2" color="textSecondary" style={{ marginBottom: 12 }}>{lead.name}. O tutor escolhido recebe o aviso, a conversa da tutoria e o acesso às análises do aluno. Nada é enviado ao aluno.</Typography>
            {tutors === null ? <Typography variant="body2">Carregando os tutores...</Typography> : <TutorField tutors={tutors} value={pick} onChange={setPick} />}
            {tutors && tutors.length === 0 && <Typography variant="caption" color="textSecondary">Nenhum tutor cadastrado. Cadastre tutores em Polos e equipes.</Typography>}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" color="primary" disableElevation disabled={busy || tutors === null} onClick={save}>{busy ? "Salvando..." : "Salvar"}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default TutorDialog;
