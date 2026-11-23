import React, { useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { X } from "lucide-react";
import Drawer from "@material-ui/core/Drawer";

import { useAnalytics } from "../../components/analytics/kit";

// Where each conversation of a consultant stopped in the sales process (opened from Estatísticas → Consultores)
const mins = (m) => (m === null || m === undefined ? "—" : m < 1 ? "< 1 min" : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")}`);
const pill = (color) => ({ display: "inline-block", fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 999, border: `1px solid ${color || "var(--line-strong)"}`, color: "var(--text-1)", marginRight: 4, marginBottom: 2 });

const Bar = ({ value }) => {
  if (value === null || value === undefined) return <span style={{ color: "var(--text-3)" }}>—</span>;
  const color = value >= 70 ? "#0f766e" : value >= 40 ? "#b45309" : "#b91c1c";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 130 }}>
      <div style={{ flex: 1, height: 8, background: "var(--surface-3)", borderRadius: 99, border: "1px solid var(--line)" }}>
        <div style={{ width: `${Math.min(100, value)}%`, height: "100%", background: color, borderRadius: 99 }} />
      </div>
      <b style={{ fontVariantNumeric: "tabular-nums", minWidth: 36 }}>{value}%</b>
    </div>
  );
};

const Leads = ({ consultant, params, onClose }) => {
  const history = useHistory();
  const { data } = useAnalytics(`/analytics/process/${consultant.userId}`, params);
  const [step, setStep] = useState("");
  const leads = (data?.leads || []).filter(l => !step || l.stoppedAt === step);
  const steps = useMemo(() => [...new Set((data?.leads || []).map(l => l.stoppedAt))], [data]);
  return (
    <Drawer anchor="right" open onClose={onClose} PaperProps={{ style: { width: "min(720px, 100vw)", background: "var(--surface)" } }}>
      <div style={{ padding: 20, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{consultant.name}</div>
            <div style={{ fontSize: 13, color: "var(--text-2)" }}>Onde cada conversa parou no processo comercial</div>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} style={{ border: "1px solid var(--line-strong)", background: "var(--surface)", borderRadius: 8, padding: 6, cursor: "pointer" }}><X size={16} /></button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button type="button" onClick={() => setStep("")} style={{ ...pill(step === "" ? "#0f766e" : null), cursor: "pointer", background: step === "" ? "rgba(15,118,110,.1)" : "var(--surface)" }}>Todas ({data?.leads?.length || 0})</button>
          {steps.map(s => <button key={s} type="button" onClick={() => setStep(s)} style={{ ...pill(step === s ? "#0f766e" : null), cursor: "pointer", background: step === s ? "rgba(15,118,110,.1)" : "var(--surface)" }}>{s} ({data.leads.filter(l => l.stoppedAt === s).length})</button>)}
        </div>
        {!data ? <div style={{ color: "var(--text-2)" }}>Carregando…</div> : !leads.length ? <div style={{ color: "var(--text-2)" }}>Nenhuma conversa analisada no período.</div> : (
          <div style={{ display: "grid", gap: 8 }}>
            {leads.map(l => (
              <button key={l.ticketId} type="button" onClick={() => history.push(`/tickets/${l.ticketId}`)} style={{ textAlign: "left", border: "1px solid var(--line-strong)", borderRadius: 12, padding: 12, background: "var(--surface)", cursor: "pointer", display: "grid", gap: 6, font: "inherit", color: "inherit" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <b style={{ flex: 1 }}>{l.name}</b>
                  {l.stage && <span style={pill(l.stageColor)}>{l.stage}</span>}
                  {l.temperature && <span style={pill()}>{{ cold: "Frio", warm: "Morno", hot: "Quente" }[l.temperature] || l.temperature}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, flexWrap: "wrap" }}>
                  <span style={{ color: "var(--text-2)" }}>Parou em:</span><b>{l.stoppedAt}</b>
                  <span style={{ flex: 1 }} /><div style={{ width: 160, maxWidth: "100%" }}><Bar value={l.progress} /></div>
                </div>
                {l.summary && <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>{l.summary}</div>}
              </button>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
};

export { Leads, Bar, mins };
