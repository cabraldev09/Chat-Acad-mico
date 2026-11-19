import React, { useEffect, useState } from "react";
import { Button, TextField } from "@material-ui/core";
import { toast } from "react-toastify";
import { ChevronDown, ChevronUp, CornerDownRight } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { Section } from "../../components/ui";

// The process of the team, step by step, with what the agent says at each one (the same texts the lead receives).
// To change how a step is answered, teach it in "Testar e ensinar".
export default function ScriptPanel({ agentId, agent, onTeach, onSaved }) {
  const [steps, setSteps] = useState(null);
  const [branches, setBranches] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [open, setOpen] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/ai-agents/${agentId}/script`).then(({ data }) => { setSteps(data.steps || []); setBranches(data.branches || []); setAnswers(data.answers || []); }).catch(() => setSteps([]));
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

  // what the agent says in one step or ready answer, with the edit and the way back to the standard
  const body = (st) => (
    <div style={{ padding: "0 14px 12px", display: "grid", gap: 8 }}>
      {draft && draft.key === st.key ? (
        <div style={{ display: "grid", gap: 8 }}>
          <TextField multiline minRows={3} variant="outlined" size="small" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} inputProps={{ maxLength: 700, "aria-label": `Texto de ${st.label}` }} helperText="Escreva do jeito da equipe, sem emoji. O agente usa este texto no lugar do padrão." />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button size="small" variant="contained" color="primary" disabled={busy || !draft.text.trim()} onClick={() => save(st.key, draft.text.trim())} style={{ borderRadius: 10, textTransform: "none", fontWeight: 600 }}>Salvar</Button>
            <Button size="small" onClick={() => setDraft(null)} style={{ borderRadius: 10, textTransform: "none" }}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <div style={{ whiteSpace: "pre-wrap", background: "rgba(6,147,227,.07)", borderRadius: 10, padding: "10px 12px", fontSize: 14, lineHeight: 1.5, overflowWrap: "anywhere" }}>{st.text}</div>
      )}
      {st.custom && <div style={{ fontSize: 12.5, opacity: 0.8 }}>Texto da equipe. O padrão é: “{st.standard}”</div>}
      <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.5 }}>{st.note}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {st.editable && agent && !(draft && draft.key === st.key) && <Button size="small" variant="outlined" onClick={() => setDraft({ key: st.key, text: st.text })} style={{ borderRadius: 10, textTransform: "none", fontWeight: 600 }}>Editar o texto</Button>}
        {st.custom && <Button size="small" disabled={busy} onClick={() => save(st.key, "")} style={{ borderRadius: 10, textTransform: "none" }}>Voltar ao padrão</Button>}
        {onTeach && !st.editable && <Button size="small" variant="outlined" onClick={onTeach} style={{ borderRadius: 10, textTransform: "none", fontWeight: 600 }}>Mudar como responde</Button>}
      </div>
    </div>
  );

  if (!steps || !steps.length) return null;
  return (
    <Section title="Como ele atende: o processo, passo a passo" hint="É assim que o agente conduz a conversa, na ordem. Toque em uma etapa para ver o que ele diz e mudar o texto. Os desvios valem em qualquer etapa.">
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", alignItems: "start" }}>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 0, minWidth: 0 }}>
        {steps.map((st, i) => {
          const isOpen = open === st.key;
          const last = i === steps.length - 1;
          return (
            <li key={st.key} style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", gap: 10 }}>
              <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: "#fff", background: i === 0 ? "#0B4279" : last ? "#0f766e" : "#4595D8", flex: "none", marginTop: 8 }}>{i === 0 ? "▶" : last ? "✓" : i}</span>
                {!last && <span style={{ flex: 1, width: 2, background: "var(--ui-border, #d6dee8)", minHeight: 14 }} />}
              </div>
            <div style={{ border: "1px solid var(--ui-border)", borderRadius: 12, background: "var(--ui-surface)", marginBottom: last ? 0 : 8, minWidth: 0 }}>
              <button type="button" onClick={() => setOpen(isOpen ? null : st.key)} aria-expanded={isOpen} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", border: 0, background: "none", padding: "10px 14px", cursor: "pointer", font: "inherit", color: "inherit", textAlign: "left" }}>
                <b style={{ flex: 1, fontSize: 14.5, minWidth: 0 }}>{st.label.replace(/^\d+\.\s*/, "")}</b>
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {isOpen && body(st)}
            </div>
            </li>
          );
        })}
      </ol>
      {branches.length > 0 && (
        <div style={{ border: "1px dashed var(--ui-border, #d6dee8)", borderRadius: 12, padding: 12, display: "grid", gap: 8, minWidth: 0 }}>
          <b style={{ fontSize: 14 }}>Desvios (em qualquer etapa)</b>
          {branches.map((b) => (
            <div key={b.key} style={{ display: "grid", gap: 2, fontSize: 13, lineHeight: 1.45 }}>
              <span style={{ fontWeight: 600 }}>{b.when}</span>
              <span style={{ display: "flex", gap: 6, alignItems: "flex-start", opacity: 0.85 }}><CornerDownRight size={14} style={{ flex: "none", marginTop: 3 }} />{b.goes}</span>
            </div>
          ))}
        </div>
      )}
      </div>
      {answers.length > 0 && (
        <div style={{ marginTop: 16, display: "grid", gap: 6 }}>
          <b style={{ fontSize: 14 }}>Respostas prontas (saem na hora, sem a IA)</b>
          {answers.map((st) => {
            const isOpen = open === st.key;
            return (
              <div key={st.key} style={{ border: "1px solid var(--ui-border)", borderRadius: 12, background: "var(--ui-surface)", minWidth: 0 }}>
                <button type="button" onClick={() => setOpen(isOpen ? null : st.key)} aria-expanded={isOpen} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", border: 0, background: "none", padding: "10px 14px", cursor: "pointer", font: "inherit", color: "inherit", textAlign: "left" }}>
                  <b style={{ flex: 1, fontSize: 14, minWidth: 0 }}>{st.label}</b>
                  {st.custom && <span style={{ fontSize: 11.5, fontWeight: 700, color: "#0f766e" }}>texto da equipe</span>}
                  {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {isOpen && body(st)}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
