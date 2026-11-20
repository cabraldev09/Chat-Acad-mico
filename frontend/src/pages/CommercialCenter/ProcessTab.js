import React, { useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { ListChecks, MessageSquare, Mic, FileText, X } from "lucide-react";
import Drawer from "@material-ui/core/Drawer";

import { BlockTitle, useAnalytics, useKit } from "../../components/analytics/kit";

// "Atendimento e processo": how each consultant works the sales process in the period. Conversations and messages, audios and grades
// sent, how much of the process the conversations went through and where they stopped, the open leads by funnel column.
const cell = { padding: "10px 12px", borderBottom: "1px solid var(--line)", fontSize: 13, verticalAlign: "middle", whiteSpace: "nowrap" };
const head = { ...cell, fontSize: 12, fontWeight: 700, color: "var(--text-2)", textAlign: "left", background: "var(--surface-2)", position: "sticky", top: 0 };
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

const ProcessTab = ({ params }) => {
  const c = useKit();
  const { data, loading } = useAnalytics("/analytics/process", params);
  const [open, setOpen] = useState(null);
  const rows = data?.consultants || [];
  const total = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const download = () => {
    const header = ["Consultor", "Conversas", "Mensagens enviadas", "Mensagens recebidas", "Áudios enviados", "Áudios recebidos", "Grades enviadas", "Tempo de resposta (mediana, min)", "Respondidas no prazo (%)", "Processo seguido (%)", "Conversas analisadas", "Parou mais em", "Mudanças de etapa"];
    const lines = rows.map(r => [r.name, r.conversations, r.messagesSent, r.messagesReceived, r.audiosSent, r.audiosReceived, r.gradesSent, r.replyMedianMin ?? "", r.replyWithinSlaPct ?? "", r.processAvg ?? "", r.processSamples, r.stoppedAt[0]?.step || "", r.stageMoves]);
    const csv = [header, ...lines].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = "atendimento-e-processo.csv"; a.click();
  };
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        {[[<MessageSquare size={16} />, "Conversas", total("conversations")], [<MessageSquare size={16} />, "Mensagens enviadas", total("messagesSent")], [<Mic size={16} />, "Áudios (env./rec.)", `${total("audiosSent")} / ${total("audiosReceived")}`], [<FileText size={16} />, "Grades enviadas", total("gradesSent")]].map(([icon, label, value]) => (
          <div key={label} className={c.panel}><div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)" }}>{icon}{label}</div><div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{value}</div></div>
        ))}
      </div>
      <div className={c.panel}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}><BlockTitle icon={<ListChecks size={16} />} title="Atendimento e processo por consultor" help="Clique no consultor para ver onde cada conversa parou. O processo é o do copiloto (Configurações → Copiloto)." /></div>
          <button type="button" onClick={download} disabled={!rows.length} style={{ border: "1px solid var(--line-strong)", background: "var(--surface)", borderRadius: 8, padding: "6px 12px", fontWeight: 600, cursor: "pointer" }}>Exportar CSV</button>
        </div>
        {loading && !data ? <div style={{ color: "var(--text-2)" }}>Carregando…</div> : (
          <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Consultor", "Conversas", "Mensagens env. / rec.", "Áudios env. / rec.", "Grades", "Tempo de resposta", "Processo seguido", "Parou mais em", "Leads por etapa"].map(h => <th key={h} style={head}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.userId} onClick={() => setOpen(r)} style={{ cursor: "pointer" }}>
                    <td style={{ ...cell, fontWeight: 700 }}>{r.name}</td>
                    <td style={cell}>{r.conversations}</td>
                    <td style={cell}>{r.messagesSent} / {r.messagesReceived}</td>
                    <td style={cell}>{r.audiosSent} / {r.audiosReceived}</td>
                    <td style={cell}>{r.gradesSent}</td>
                    <td style={cell}><b>{mins(r.replyMedianMin)}</b>{r.replyWithinSlaPct !== null && r.replyWithinSlaPct !== undefined ? <div style={{ fontSize: 11.5, color: r.replyWithinSlaPct >= 80 ? "#0f766e" : r.replyWithinSlaPct >= 50 ? "#b45309" : "#b91c1c" }}>{r.replyWithinSlaPct}% no prazo</div> : null}</td>
                    <td style={cell}><Bar value={r.processAvg} />{r.processSamples ? <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{r.processSamples} conversa{r.processSamples > 1 ? "s" : ""}</div> : null}</td>
                    <td style={cell}>{r.stoppedAt[0] ? <><b>{r.stoppedAt[0].step}</b> <span style={{ color: "var(--text-2)" }}>({r.stoppedAt[0].n})</span></> : "—"}</td>
                    <td style={{ ...cell, whiteSpace: "normal", minWidth: 220 }}>{r.byStage.length ? r.byStage.map(s => <span key={s.stage} style={pill(s.color)}>{s.stage}: {s.n}</span>) : "—"}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={9} style={{ ...cell, color: "var(--text-2)" }}>Nenhum consultor no período.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {open && <Leads consultant={open} params={params} onClose={() => setOpen(null)} />}
    </div>
  );
};

export default ProcessTab;
