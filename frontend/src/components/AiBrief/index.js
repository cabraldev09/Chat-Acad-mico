import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, makeStyles } from "@material-ui/core";
import { Bot, ChevronDown, ChevronRight, Copy, Flame } from "lucide-react";

import api from "../../services/api";
import { ANALYSIS_LABEL, ENTRY_LABEL, INTENT_LABEL, NEXT_LABEL, SLOT_LABEL, TEMP_COLOR, TEMP_LABEL, slotValue } from "../../utils/commercial";

const useStyles = makeStyles((theme) => ({
  root: { border: theme.border.divider, borderRadius: 12, padding: theme.spacing(1.5), display: "grid", gap: 8, background: theme.palette.cards.background },
  head: { display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14 },
  row: { display: "flex", gap: 8, fontSize: 13, lineHeight: 1.4 },
  label: { width: 112, flexShrink: 0, color: theme.palette.text.secondary },
  chip: { display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 999, padding: "1px 9px", fontSize: 12, fontWeight: 700 },
  brief: { whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.5, background: theme.palette.action.hover, borderRadius: 8, padding: theme.spacing(1, 1.25), maxHeight: 320, overflowY: "auto" },
  toggle: { display: "flex", alignItems: "center", gap: 4, border: 0, background: "transparent", color: "inherit", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: 0 },
}));

// What the AI agent of graduation knows about a lead and the summary it prepared for the consultant. Shown in the contact panel of the
// conversation and in the record of the lead; renders nothing for a lead the agent never attended.
const AiBrief = ({ leadId, ticketId, compact }) => {
  const classes = useStyles();
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(!compact);

  const load = useCallback(() => {
    const url = ticketId ? `/tickets/${ticketId}/commercial` : leadId ? `/leads/${leadId}/commercial` : null;
    if (!url) return;
    api.get(url).then(({ data }) => setD(data)).catch(() => setD(null));
  }, [leadId, ticketId]);
  useEffect(() => { load(); }, [load]);

  if (!d || !d.exists) return null;
  const copy = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(d.handoff ? d.handoff.note : d.brief).then(() => toast.success("Resumo copiado.")).catch(() => undefined);
  };
  return (
    <div className={classes.root}>
      <div className={classes.head}>
        <Bot size={16} /> <span style={{ flex: 1 }}>Atendimento com IA</span>
        <span className={classes.chip} style={{ background: `${TEMP_COLOR[d.temperature]}22`, color: TEMP_COLOR[d.temperature] }}><Flame size={12} />{TEMP_LABEL[d.temperature] || d.temperature} · {d.commercialScore}</span>
      </div>
      {d.readyForProposal && <div className={classes.chip} style={{ background: "rgba(234,88,12,.14)", color: "#c2410c", justifySelf: "start" }}>Pronto para proposta</div>}
      <div>
        <div className={classes.row}><span className={classes.label}>Próxima ação</span><span>{d.nextAction ? NEXT_LABEL[d.nextAction] || d.nextAction : "—"}</span></div>
        <div className={classes.row}><span className={classes.label}>Ingresso</span><span>{ENTRY_LABEL[d.entryType] || "—"}</span></div>
        {d.analysisStatus && d.analysisStatus !== "not_applicable" && <div className={classes.row}><span className={classes.label}>Análise curricular</span><span>{ANALYSIS_LABEL[d.analysisStatus] || d.analysisStatus}</span></div>}
        <div className={classes.row}><span className={classes.label}>Última intenção</span><span>{d.lastIntent ? INTENT_LABEL[d.lastIntent] || d.lastIntent : "—"}</span></div>
        {d.slots && d.slots.mainObjection && <div className={classes.row}><span className={classes.label}>{SLOT_LABEL.mainObjection}</span><span>{d.slots.mainObjection}</span></div>}
        {d.slots && d.slots.unknownQuestion && <div className={classes.row}><span className={classes.label}>Sem resposta na base</span><span>{d.slots.unknownQuestion}</span></div>}
        {d.followUpReason && <div className={classes.row}><span className={classes.label}>Retorno</span><span>{d.followUpReason}{d.followUpAt ? ` · ${new Date(d.followUpAt).toLocaleDateString("pt-BR")}` : ""}</span></div>}
        {d.slots && d.slots.courseExplained !== undefined && (
          <div className={classes.row}>
            <span className={classes.label}>Já explicado</span>
            <span>{["courseExplained", "modalityExplained", "mecExplained", "gradeSent", "internshipExplained", "tutoringExplained", "platformExplained"].filter((k) => d.slots[k]).map((k) => slotValue(k, true) && SLOT_LABEL[k]).join(", ") || "—"}</span>
          </div>
        )}
      </div>
      <button type="button" className={classes.toggle} onClick={() => setOpen(!open)}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{d.handoff ? "Resumo para o consultor" : "Resumo do atendimento"}</button>
      {open && (
        <>
          <div className={classes.brief}>{d.handoff ? d.handoff.note : d.brief}</div>
          <Button size="small" variant="outlined" startIcon={<Copy size={14} />} onClick={copy} style={{ justifySelf: "start" }}>Copiar resumo</Button>
        </>
      )}
    </div>
  );
};

export default AiBrief;
