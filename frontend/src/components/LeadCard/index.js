import React, { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { Button, MenuItem, TextField, Typography, makeStyles } from "@material-ui/core";
import { KanbanSquare, UserPlus } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { ScoreRing } from "../../pages/CRM/shared";

const useStyles = makeStyles((theme) => ({
  root: { padding: theme.spacing(1.75), borderRadius: 12, border: theme.border.divider, background: theme.palette.cards.background, display: "grid", gap: theme.spacing(1.25) },
  top: { display: "flex", alignItems: "center", gap: 10 },
  title: { fontWeight: 600, fontSize: 14, flex: 1 },
  meta: { fontSize: 12.5, color: theme.palette.text.secondary },
}));

// CRM summary of the person you are talking to, shown in the chat contact panel
const LeadCard = ({ contactId }) => {
  const classes = useStyles();
  const history = useHistory();
  const [lead, setLead] = useState(undefined);
  const [stages, setStages] = useState([]);

  const load = useCallback(() => {
    if (!contactId) return;
    api.get(`/leads/by-contact/${contactId}`).then(({ data }) => setLead(data || null)).catch(() => setLead(null));
  }, [contactId]);
  useEffect(() => { load(); api.get("/lead-stages").then(({ data }) => setStages(data)).catch(() => {}); }, [load]);

  if (lead === undefined) return null;

  if (lead === null) {
    return (
      <div className={classes.root}>
        <Typography className={classes.title}>Este contato ainda não está no CRM</Typography>
        <Button size="small" variant="contained" color="primary" startIcon={<UserPlus size={16} />}
          onClick={async () => { try { await api.post(`/leads/from-contact/${contactId}`, {}); toast.success("Lead criado"); load(); } catch (e) { toastError(e); } }}>
          Criar lead
        </Button>
      </div>
    );
  }

  const changeStage = async (stageId) => {
    const stage = stages.find((s) => s.id === stageId);
    if (stage.type === "lost") { history.push(`/crm?lead=${lead.id}`); return; }
    try { await api.put(`/leads/${lead.id}/stage`, { stageId }); toast.success(`Movido para “${stage.name}”`); load(); } catch (e) { toastError(e); }
  };

  return (
    <div className={classes.root}>
      <div className={classes.top}>
        <Typography className={classes.title}>Lead no CRM</Typography>
        <ScoreRing value={lead.score} />
      </div>
      <TextField select size="small" variant="outlined" label="Etapa" value={lead.stageId} onChange={(e) => changeStage(e.target.value)}>
        {stages.map((s) => (<MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>))}
      </TextField>
      <div className={classes.meta}>
        {lead.course ? `${lead.course.name} · ` : ""}{lead.owner ? `Responsável: ${lead.owner.name}` : "Sem responsável"}
      </div>
      <Button size="small" variant="outlined" startIcon={<KanbanSquare size={16} />} onClick={() => history.push(`/crm?lead=${lead.id}`)}>Abrir ficha completa</Button>
    </div>
  );
};

export default LeadCard;
