import React, { useEffect, useState } from "react";
import { Button, TextField } from "@material-ui/core";
import { toast } from "react-toastify";
import { ChevronDown, ChevronUp } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { Section } from "../../components/ui";

// The process of the team, step by step, with what the agent says at each one (the same texts the lead receives).
// To change how a step is answered, teach it in "Testar e ensinar".
export default function ScriptPanel({ agentId, agent, onTeach, onSaved }) {
  const [steps, setSteps] = useState(null);
  const [open, setOpen] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/ai-agents/${agentId}/script`).then(({ data }) => setSteps(data.steps || [])).catch(() => setSteps([]));
  useEffect(() => { load(); }, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // the words of a step are saved in the settings of the agent (with the history of changes, and a way back to the standard)
  const save = async (key, text) => {
    if (!agent) return;
    setBusy(true);
    try {
      const commercial = { ...((agent.persona && agent.persona.commercial) || {}) };
      commercial.texts = { ...(commercial.texts || {}), [key]: text };
      await api.put(`/ai-agents/${agentId}`, { persona: { ...(agent.persona || {}), commercial } });
      toast.success(text ? "Texto salvo. O agente já fala assim." : "Voltou ao texto padrão do processo.");
      setDraft(null);
      await load();
      if (onSaved) onSaved();
    } catch (err) { toastError(err); }
    setBusy(false);
  };

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
                  {draft && draft.key === st.key ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <TextField multiline minRows={3} variant="outlined" size="small" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} inputProps={{ maxLength: 700, "aria-label": `Texto da etapa ${st.label}` }} helperText="Escreva do jeito da equipe, sem emoji. A IA usa este texto no lugar do padrão." />
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Button size="small" variant="contained" color="primary" disabled={busy || !draft.text.trim()} onClick={() => save(st.key, draft.text.trim())} style={{ borderRadius: 10, textTransform: "none", fontWeight: 600 }}>Salvar</Button>
                        <Button size="small" onClick={() => setDraft(null)} style={{ borderRadius: 10, textTransform: "none" }}>Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ whiteSpace: "pre-wrap", background: "rgba(6,147,227,.07)", borderRadius: 10, padding: "10px 12px", fontSize: 14, lineHeight: 1.5 }}>{st.text}</div>
                  )}
                  {st.custom && <div style={{ fontSize: 12.5, opacity: 0.8 }}>Texto da equipe. O padrão do processo é: “{st.standard}”</div>}
                  <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.5 }}>{st.note}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {st.editable && agent && !(draft && draft.key === st.key) && <Button size="small" variant="outlined" onClick={() => setDraft({ key: st.key, text: st.text })} style={{ borderRadius: 10, textTransform: "none", fontWeight: 600 }}>Editar o texto</Button>}
                    {st.custom && <Button size="small" disabled={busy} onClick={() => save(st.key, "")} style={{ borderRadius: 10, textTransform: "none" }}>Voltar ao padrão</Button>}
                    {onTeach && !st.editable && <Button size="small" variant="outlined" onClick={onTeach} style={{ borderRadius: 10, textTransform: "none", fontWeight: 600 }}>Mudar como responde</Button>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
