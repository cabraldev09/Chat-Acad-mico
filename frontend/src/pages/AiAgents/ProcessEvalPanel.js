import React, { useEffect, useState } from "react";
import { Button } from "@material-ui/core";
import { AlertTriangle, CheckCircle2, PlayCircle } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { Section } from "../../components/ui";

// The weekly check of the commercial process with the real model: scripted leads talk to the published script (nothing is sent), and each case
// says whether the agent presented itself, never said a price, explained the semipresencial format and handed over. "Rodar agora" repeats it.
export default function ProcessEvalPanel({ agentId }) {
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api.get(`/ai-agents/${agentId}/process-eval`).then(({ data }) => setReport(data.report)).catch(() => undefined);
  }, [agentId]);

  const run = async () => {
    setRunning(true);
    try {
      const { data } = await api.post(`/ai-agents/${agentId}/process-eval/run`);
      setReport(data.report);
    } catch (err) {
      toastError(err);
    }
    setRunning(false);
  };

  const when = report ? new Date(report.at).toLocaleString("pt-BR", { timeZone: "America/Porto_Velho", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <Section title="Avaliação semanal do processo" hint="Toda semana leads de teste conversam com o agente de verdade (nada é enviado) e o sistema confere se ele seguiu o processo comercial.">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        {report ? (
          report.error ? <span style={{ color: "#b45309", fontSize: 14 }}>{report.error}</span> : (
            <span style={{ fontSize: 14, fontWeight: 600, color: report.ok ? "#15803d" : "#b45309", display: "inline-flex", alignItems: "center", gap: 6 }}>
              {report.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              {report.ok ? "Seguiu o processo em todos os casos" : `${report.results.filter((r) => !r.ok).length} caso(s) com problema`}
            </span>
          )
        ) : <span style={{ fontSize: 14, opacity: 0.75 }}>Ainda não rodou.</span>}
        {when && <span style={{ fontSize: 13, opacity: 0.7 }}>· {when}</span>}
        <span style={{ flex: 1 }} />
        <Button size="small" variant="outlined" color="primary" disabled={running} startIcon={<PlayCircle size={15} />} onClick={run}>{running ? "Rodando (leva um minuto)…" : "Rodar agora"}</Button>
      </div>
      {report && (report.results || []).map((r, i) => (
        <div key={r.name} style={{ borderTop: "1px solid rgba(0,0,0,.08)", padding: "8px 0" }}>
          <button type="button" onClick={() => setOpen(open === i ? null : i)} style={{ border: 0, background: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", fontFamily: "inherit", fontSize: 14, color: "inherit" }}>
            {r.ok ? <CheckCircle2 size={16} color="#15803d" /> : <AlertTriangle size={16} color="#b45309" />}
            <span style={{ flex: 1, fontWeight: 600 }}>{r.name}</span>
            <span style={{ fontSize: 12.5, opacity: 0.7 }}>{open === i ? "Esconder conversa" : "Ver conversa"}</span>
          </button>
          {r.problems.length > 0 && <ul style={{ margin: "4px 0 0", paddingLeft: 30, fontSize: 13, color: "#b45309" }}>{r.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          {open === i && (
            <div style={{ marginTop: 6, paddingLeft: 24, fontSize: 13, lineHeight: 1.5 }}>
              {r.transcript.map((t, k) => (
                <div key={k} style={{ whiteSpace: "pre-wrap", margin: "4px 0" }}><b>{t.from === "lead" ? "Lead" : "Agente"}:</b> {t.text}</div>
              ))}
            </div>
          )}
        </div>
      ))}
    </Section>
  );
}
