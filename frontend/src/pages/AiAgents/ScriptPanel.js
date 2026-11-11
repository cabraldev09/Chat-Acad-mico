import React, { useEffect, useState } from "react";
import { Button } from "@material-ui/core";
import { ChevronDown, ChevronUp } from "lucide-react";

import api from "../../services/api";
import { Section } from "../../components/ui";

// The process of the team, step by step, with what the agent says at each one (the same texts the lead receives).
// To change how a step is answered, teach it in "Testar e ensinar".
export default function ScriptPanel({ agentId, onTeach }) {
  const [steps, setSteps] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api.get(`/ai-agents/${agentId}/script`).then(({ data }) => setSteps(data.steps || [])).catch(() => setSteps([]));
  }, [agentId]);

  if (!steps || !steps.length) return null;
  return (
    <Section title="O processo, passo a passo" hint="É assim que o agente conduz a conversa, na ordem. Toque em uma etapa para ver o que ele diz.">
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
        {steps.map((st) => {
          const isOpen = open === st.key;
          return (
            <li key={st.key} style={{ border: "1px solid var(--ui-border)", borderRadius: 12, background: "var(--ui-surface)" }}>
              <button type="button" onClick={() => setOpen(isOpen ? null : st.key)} aria-expanded={isOpen} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", border: 0, background: "none", padding: "10px 14px", cursor: "pointer", font: "inherit", color: "inherit", textAlign: "left" }}>
                <b style={{ flex: 1, fontSize: 14.5 }}>{st.label}</b>
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {isOpen && (
                <div style={{ padding: "0 14px 12px", display: "grid", gap: 8 }}>
                  <div style={{ whiteSpace: "pre-wrap", background: "rgba(6,147,227,.07)", borderRadius: 10, padding: "10px 12px", fontSize: 14, lineHeight: 1.5 }}>{st.text}</div>
                  <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.5 }}>{st.note}</div>
                  {onTeach && <div><Button size="small" variant="outlined" onClick={onTeach} style={{ borderRadius: 10, textTransform: "none", fontWeight: 600 }}>Mudar como responde</Button></div>}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
