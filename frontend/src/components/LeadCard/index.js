import React, { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { Button, TextField, Typography, makeStyles } from "@material-ui/core";
import { FilePlus2, FileText, KanbanSquare, UserPlus } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { ScoreRing, burst } from "../../pages/CRM/shared";

// the heavy CRM dialogs load only when someone opens them
const ProposalStudio = lazy(() => import("../../pages/CRM/ProposalStudio"));
const EnrollDialog = lazy(() => import("../../pages/CRM/EnrollDialog"));
const LostDialog = lazy(() => import("../../pages/CRM/LeadDrawer").then((m) => ({ default: m.LostDialog })));

const useStyles = makeStyles((theme) => ({
  root: { padding: theme.spacing(1.75), borderRadius: 12, border: theme.border.divider, background: theme.palette.cards.background, display: "grid", gap: theme.spacing(1.25) },
  top: { display: "flex", alignItems: "center", gap: 10 },
  title: { fontWeight: 600, fontSize: 14, flex: 1 },
  meta: { fontSize: 12.5, color: theme.palette.text.secondary },
  stages: { display: "flex", flexWrap: "wrap", gap: 6 },
  stage: {
    border: theme.border.divider, background: "transparent", color: "inherit", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, padding: "4px 11px", borderRadius: 999, cursor: "pointer",
    "&:hover": { background: theme.palette.action.hover }, "&[disabled]": { cursor: "default" },
  },
  stageOn: { background: theme.palette.primary.main, borderColor: theme.palette.primary.main, color: "#fff", "&:hover": { background: theme.palette.primary.main } },
  label: { fontSize: 12, fontWeight: 700, color: theme.palette.text.secondary },
  proposal: {
    display: "flex", alignItems: "center", gap: 8, width: "100%", border: theme.border.divider, borderRadius: 10, padding: "7px 10px", background: "transparent",
    color: "inherit", fontFamily: "inherit", fontSize: 13, textAlign: "left", cursor: "pointer", "&:hover": { background: theme.palette.action.hover },
  },
}));

const PROPOSAL_STATUS = { draft: "Rascunho", sent: "Enviada", viewed: "Visualizada", accepted: "Aceita" };

// CRM summary of the person you are talking to, shown in the chat contact panel. Everything the consultant does with
// a lead while chatting (move it along the funnel, mark it lost, enroll, generate and send a proposal) happens here.
const LeadCard = ({ contactId }) => {
  const classes = useStyles();
  const history = useHistory();
  const [lead, setLead] = useState(undefined);
  const [stages, setStages] = useState([]);
  const [options, setOptions] = useState({});
  const [proposals, setProposals] = useState([]);
  const [lostOpen, setLostOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [studio, setStudio] = useState(null); // { id } | {}
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!contactId) return;
    api.get(`/leads/by-contact/${contactId}`).then(({ data }) => setLead(data || null)).catch(() => setLead(null));
  }, [contactId]);
  useEffect(() => {
    load();
    api.get("/lead-stages").then(({ data }) => setStages(data)).catch(() => {});
    api.get("/crm/options").then(({ data }) => setOptions(data)).catch(() => {});
  }, [load]);

  const leadId = lead ? lead.id : null;
  const loadProposals = useCallback(() => {
    if (!leadId) return;
    api.get("/proposals", { params: { leadId } }).then(({ data }) => setProposals(data)).catch(() => {});
  }, [leadId]);
  useEffect(() => { loadProposals(); }, [loadProposals]);

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

  const lost = stages.find((s) => s.type === "lost");
  const move = async (stage, extra = {}, e) => {
    setBusy(true);
    try {
      await api.put(`/leads/${lead.id}/stage`, { stageId: stage.id, ...extra });
      if (stage.type === "won" && e) burst(e.clientX, e.clientY);
      toast.success(`Movido para “${stage.name}”`);
      load();
    } catch (err) { toastError(err); }
    setBusy(false);
  };
  const pick = (stage, e) => {
    if (stage.id === lead.stageId) return;
    if (stage.type === "lost") setLostOpen(true);
    else if (stage.type === "won") setEnrollOpen(true); // enrollment confirms polo, tutor and fee first
    else move(stage, {}, e);
  };

  return (
    <div className={classes.root}>
      <div className={classes.top}>
        <Typography className={classes.title}>Lead no CRM</Typography>
        <ScoreRing value={lead.score} />
      </div>

      <div>
        <div className={classes.label} style={{ marginBottom: 6 }}>Etapa do funil</div>
        <div className={classes.stages}>
          {stages.map((s) => (
            <button key={s.id} type="button" disabled={busy} className={`${classes.stage} ${s.id === lead.stageId ? classes.stageOn : ""}`} onClick={(e) => pick(s, e)}>{s.name}</button>
          ))}
        </div>
      </div>

      <div className={classes.meta}>
        {lead.course ? `${lead.course.name} · ` : ""}{lead.owner ? `Responsável: ${lead.owner.name}` : "Sem responsável"}
      </div>

      <div>
        <div className={classes.label} style={{ marginBottom: 6 }}>Propostas</div>
        <div style={{ display: "grid", gap: 6 }}>
          {proposals.slice(0, 3).map((pr) => (
            <button key={pr.id} type="button" className={classes.proposal} onClick={() => setStudio({ id: pr.id })}>
              <FileText size={15} />
              <span style={{ flex: 1 }}>{pr.title || `Proposta #${pr.id}`}</span>
              <span className={classes.meta}>{PROPOSAL_STATUS[pr.status] || pr.status}</span>
            </button>
          ))}
          <Button size="small" variant="contained" color="primary" startIcon={<FilePlus2 size={16} />} onClick={() => setStudio({})}>Gerar proposta</Button>
        </div>
      </div>

      <Button size="small" variant="outlined" startIcon={<KanbanSquare size={16} />} onClick={() => history.push(`/crm?lead=${lead.id}`)}>Abrir ficha completa</Button>

      <Suspense fallback={null}>
        {lostOpen && lost && (
          <LostDialog open reasons={options.lostReasons || []} onClose={() => setLostOpen(false)}
            onConfirm={(reason, note) => { setLostOpen(false); move(lost, { lostReason: reason, lostNote: note }); }} />
        )}
        {enrollOpen && <EnrollDialog open lead={lead} onClose={() => setEnrollOpen(false)} onDone={() => { setEnrollOpen(false); load(); }} />}
        {studio && (
          <ProposalStudio lead={lead} proposalId={studio.id} ctx={{ options }}
            onSaved={loadProposals} onClose={() => { setStudio(null); loadProposals(); load(); }} />
        )}
      </Suspense>
    </div>
  );
};

export default LeadCard;
