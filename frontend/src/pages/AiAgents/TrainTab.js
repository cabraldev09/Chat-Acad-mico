import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, CircularProgress, Switch, TextField } from "@material-ui/core";
import { Bot, Check, FileText, GraduationCap, ListChecks, MessageSquare, Palette, Pencil, RotateCcw, Send, Trash2, UploadCloud, X } from "lucide-react";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { EmptyState, Section } from "../../components/ui";

// THE TRAINER. Two ways to teach the agent: talk to it (it answers and writes down what it understood) and send a file (a PDF, a document or a conversation
// exported from WhatsApp). Everything it learns lands in "O que o agente aprendeu", where each lesson can be edited, switched off or deleted.
// A lesson is in EVERY answer of the agent (the rules of the trainer are part of its prompt).

const KIND = {
  regra: { label: "Regra", icon: ListChecks, color: "#0693e3" },
  estilo: { label: "Jeito de falar", icon: Palette, color: "#7c3aed" },
  exemplo: { label: "Exemplo", icon: MessageSquare, color: "#0d9488" },
};
const kindOf = (k) => KIND[k] || KIND.regra;

const bubble = (mine) => ({
  alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%", padding: "8px 12px", fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.45,
  borderRadius: mine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
  background: mine ? "#0b4279" : "var(--ui-surface)", color: mine ? "#fff" : "inherit", border: mine ? "none" : "1px solid var(--ui-border)", boxShadow: "var(--ui-shadow-1)",
});

// a lesson proposed by the agent (or by the analysis of a file): the owner keeps or drops each one
export const ProposalList = ({ items, onChange }) => (
  <div style={{ display: "grid", gap: 8 }}>
    {items.map((p, i) => {
      const k = kindOf(p.kind);
      const Icon = k.icon;
      return (
        <label key={`${p.kind}-${i}`} className="ui-card" style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", cursor: "pointer", opacity: p.keep === false ? 0.5 : 1 }}>
          <input type="checkbox" checked={p.keep !== false} onChange={(e) => { const keep = e.target.checked; onChange(items.map((x, j) => (j === i ? { ...x, keep } : x))); }} style={{ marginTop: 4 }} />
          <span style={{ width: 28, height: 28, borderRadius: 9, display: "grid", placeItems: "center", background: `${k.color}22`, color: k.color, flex: "none" }}><Icon size={16} /></span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: k.color, textTransform: "uppercase", letterSpacing: ".06em" }}>{k.label}</span>
            <span style={{ display: "block", fontSize: 14, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{p.text}</span>
          </span>
        </label>
      );
    })}
  </div>
);

// ---------------------------------------------------------------- what the agent learned
const Learned = ({ agentId, version, onChanged }) => {
  const [rules, setRules] = useState(null);
  const [edit, setEdit] = useState(null);
  const [draft, setDraft] = useState("");
  const [newText, setNewText] = useState("");

  const load = useCallback(() => {
    api.get(`/ai-agents/${agentId}/rules`).then(({ data }) => setRules(data)).catch(toastError);
  }, [agentId]);
  useEffect(() => { load(); }, [load, version]);

  const patch = async (r, body) => {
    try { await api.put(`/ai-rules/${r.id}`, body); load(); onChanged && onChanged(); } catch (e) { toastError(e); }
  };
  const remove = async (r) => {
    if (!window.confirm("Apagar este ensinamento? O agente deixa de segui-lo.")) return;
    try { await api.delete(`/ai-rules/${r.id}`); load(); onChanged && onChanged(); } catch (e) { toastError(e); }
  };
  const add = async () => {
    const text = newText.trim();
    if (!text) return;
    try { await api.post(`/ai-agents/${agentId}/rules`, { kind: "regra", text }); setNewText(""); load(); onChanged && onChanged(); } catch (e) { toastError(e); }
  };

  return (
    <Section title="O que o agente aprendeu" hint="Tudo isto vale em todas as respostas. Desligue ou apague o que não serve mais.">
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <TextField fullWidth size="small" variant="outlined" placeholder="Escrever uma regra direto (ex.: Nunca fale preço antes de saber o curso)" value={newText} onChange={(e) => setNewText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button variant="contained" color="primary" disableElevation disabled={!newText.trim()} onClick={add} style={{ borderRadius: 10, whiteSpace: "nowrap" }}>Adicionar</Button>
      </div>
      {!rules && <div className="ui-skeleton" style={{ height: 120 }} />}
      {rules && rules.length === 0 && <EmptyState icon={<GraduationCap size={22} />} title="Ainda não aprendeu nada" text="Converse com o agente ao lado ou envie um arquivo: o que ele entender aparece aqui para você confirmar." />}
      {rules && rules.length > 0 && (
        <div style={{ display: "grid", gap: 8, maxHeight: 480, overflowY: "auto" }}>
          {rules.map((r) => {
            const k = kindOf(r.kind);
            const Icon = k.icon;
            return (
              <div key={r.id} className="ui-card" style={{ padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-start", opacity: r.active ? 1 : 0.55 }}>
                <span style={{ width: 28, height: 28, borderRadius: 9, display: "grid", placeItems: "center", background: `${k.color}22`, color: k.color, flex: "none" }}><Icon size={16} /></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: k.color, textTransform: "uppercase", letterSpacing: ".06em" }}>{k.label}{r.source === "arquivo" ? " · de um arquivo" : ""}</div>
                  {edit === r.id ? (
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <TextField fullWidth multiline size="small" variant="outlined" value={draft} onChange={(e) => setDraft(e.target.value)} />
                      <Button size="small" variant="contained" color="primary" disableElevation disabled={draft.trim().length < 3} onClick={async () => { await patch(r, { text: draft }); setEdit(null); }}>Salvar</Button>
                      <Button size="small" onClick={() => setEdit(null)}>Cancelar</Button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 14, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.text}</div>
                  )}
                </div>
                <Switch size="small" checked={!!r.active} onChange={() => patch(r, { active: !r.active })} color="primary" inputProps={{ "aria-label": "Valer ou não" }} />
                <button type="button" aria-label="Editar" onClick={() => { setEdit(r.id); setDraft(r.text); }} style={{ border: 0, background: "none", cursor: "pointer", color: "inherit", opacity: 0.6 }}><Pencil size={16} /></button>
                <button type="button" aria-label="Apagar" onClick={() => remove(r)} style={{ border: 0, background: "none", cursor: "pointer", color: "#dc2626" }}><Trash2 size={16} /></button>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
};

// ---------------------------------------------------------------- talk to the agent to teach it
const Coach = ({ agentId, onSaved }) => {
  const [turns, setTurns] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef();
  useEffect(() => { if (end.current) end.current.scrollTop = end.current.scrollHeight; }, [turns, busy]);

  const send = async (override) => {
    const content = String(override || text).trim();
    if (!content || busy) return;
    const next = [...turns, { role: "user", content }];
    setTurns(next);
    setText("");
    setBusy(true);
    try {
      const { data } = await api.post(`/ai-agents/${agentId}/coach`, { messages: next.map(({ role, content: c }) => ({ role, content: c })) });
      setTurns([...next, { role: "assistant", content: data.reply || "(sem resposta)", proposed: (data.proposed || []).map((p) => ({ ...p, keep: true })) }]);
    } catch (err) {
      toastError(err);
      setTurns(turns);
      setText(content);
    }
    setBusy(false);
  };

  const save = async (i) => {
    const t = turns[i];
    const items = t.proposed.filter((p) => p.keep !== false);
    if (!items.length) return;
    try {
      await api.post(`/ai-agents/${agentId}/rules/bulk`, { items, source: "treino" });
      toast.success(items.length === 1 ? "Gravado: o agente vai seguir." : `${items.length} ensinamentos gravados.`);
      setTurns(turns.map((x, j) => (j === i ? { ...x, proposed: [], saved: items.length } : x)));
      onSaved && onSaved();
    } catch (err) { toastError(err); }
  };

  const ideas = ["Simule um cliente perguntando o valor do curso de Pedagogia", "Nunca fale preço antes de saber o curso e a cidade", "Fale sempre curto, no máximo duas frases por mensagem"];

  return (
    <Section title="Converse com o agente para ensinar" hint="Dê ordens como falaria com um funcionário novo. O que ele entender aparece para você gravar.">
      <div ref={end} style={{ height: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 14, background: "color-mix(in srgb, var(--ui-border) 35%, transparent)" }}>
        {turns.length === 0 && (
          <div style={{ margin: "auto", textAlign: "center", maxWidth: 380, display: "grid", gap: 10 }}>
            <span style={{ width: 44, height: 44, borderRadius: 14, display: "grid", placeItems: "center", margin: "0 auto", background: "rgba(6,147,227,.14)", color: "#0693e3" }}><Bot size={22} /></span>
            <div style={{ fontWeight: 700 }}>Comece a treinar</div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>Peça para ele simular um atendimento, corrija o jeito de falar ou diga regras. Sugestões:</div>
            {ideas.map((s) => <button key={s} type="button" className="ui-card ui-lift ui-press" onClick={() => send(s)} style={{ padding: "8px 12px", textAlign: "left", font: "inherit", fontSize: 13, color: "inherit" }}>{s}</button>)}
          </div>
        )}
        {turns.map((t, i) => (
          <React.Fragment key={i}>
            <div style={bubble(t.role === "user")}>{t.content}</div>
            {t.role === "assistant" && t.proposed && t.proposed.length > 0 && (
              <div style={{ alignSelf: "stretch", display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, opacity: 0.75 }}>Entendi isto. Quer que eu grave?</div>
                <ProposalList items={t.proposed} onChange={(items) => setTurns(turns.map((x, j) => (j === i ? { ...x, proposed: items } : x)))} />
                <div style={{ display: "flex", gap: 8 }}>
                  <Button size="small" variant="contained" color="primary" disableElevation startIcon={<Check size={15} />} onClick={() => save(i)} style={{ borderRadius: 10 }}>Gravar</Button>
                  <Button size="small" onClick={() => setTurns(turns.map((x, j) => (j === i ? { ...x, proposed: [] } : x)))}>Ignorar</Button>
                </div>
              </div>
            )}
            {t.saved ? <div style={{ alignSelf: "flex-start", fontSize: 12.5, color: "#15803d", fontWeight: 600 }}>{t.saved === 1 ? "Gravado." : `${t.saved} gravados.`}</div> : null}
          </React.Fragment>
        ))}
        {busy && <div style={{ fontSize: 12.5, opacity: 0.65 }}>pensando…</div>}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <TextField fullWidth multiline rowsMax={4} variant="outlined" size="small" placeholder="Escreva como se fosse ensinar um funcionário novo" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} disabled={busy} />
        <Button variant="contained" color="primary" disableElevation onClick={() => send()} disabled={busy || !text.trim()} startIcon={<Send size={16} />} style={{ borderRadius: 10 }}>Enviar</Button>
        <Button variant="outlined" onClick={() => setTurns([])} disabled={!turns.length} startIcon={<RotateCcw size={16} />} style={{ borderRadius: 10 }}>Recomeçar</Button>
      </div>
    </Section>
  );
};

// ---------------------------------------------------------------- learn from a file
const ACCEPT = ".pdf,.docx,.txt,.zip";

const FileLearn = ({ agentId, onApplied, goRoteiro }) => {
  const [step, setStep] = useState("idle"); // idle | uploaded | analyzing | review | done
  const [dragging, setDragging] = useState(false);
  const [up, setUp] = useState(null);
  const [attendant, setAttendant] = useState("");
  const [result, setResult] = useState(null);
  const [pick, setPick] = useState({});
  const [done, setDone] = useState(null);
  const input = useRef();

  const reset = () => { setStep("idle"); setUp(null); setResult(null); setPick({}); setDone(null); setAttendant(""); };

  const upload = async (file) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { toast.error("O arquivo passa de 25 MB."); return; }
    const form = new FormData();
    form.append("file", file);
    try {
      setStep("uploading");
      const { data } = await api.post(`/ai-agents/${agentId}/train/upload`, form);
      setUp(data);
      setAttendant(data.suggested || "");
      setStep("uploaded");
    } catch (err) { toastError(err); setStep("idle"); }
  };

  const analyze = async () => {
    setStep("analyzing");
    try {
      const { data } = await api.post(`/ai-agents/${agentId}/train/analyze`, { token: up.token, attendant });
      setResult(data);
      setPick({});
      setStep("review");
    } catch (err) { toastError(err); setStep("uploaded"); }
  };

  const on = (key) => pick[key] !== false;
  const apply = async () => {
    const body = {
      style: (result.style || []).filter((_, i) => on(`s${i}`)),
      steps: (result.steps || []).filter((_, i) => on(`e${i}`)),
      knowledge: (result.knowledge || []).filter((_, i) => on(`k${i}`)),
      examples: (result.examples || []).filter((_, i) => on(`x${i}`)),
    };
    try {
      const { data } = await api.post(`/ai-agents/${agentId}/train/apply`, body);
      setDone(data);
      setStep("done");
      onApplied && onApplied();
    } catch (err) { toastError(err); }
  };

  const group = (title, hint, rows) => rows.length > 0 && (
    <div style={{ display: "grid", gap: 8 }}>
      <div><b style={{ fontSize: 14 }}>{title}</b><div style={{ fontSize: 12.5, opacity: 0.65 }}>{hint}</div></div>
      {rows}
    </div>
  );
  const row = (key, node) => (
    <label key={key} className="ui-card" style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", cursor: "pointer", opacity: on(key) ? 1 : 0.5 }}>
      <input type="checkbox" checked={on(key)} onChange={(e) => { const v = e.target.checked; setPick((p) => ({ ...p, [key]: v })); }} style={{ marginTop: 4 }} />
      <span style={{ minWidth: 0, flex: 1, fontSize: 14, overflowWrap: "anywhere" }}>{node}</span>
    </label>
  );

  return (
    <Section title="Aprender com um arquivo" hint="PDF, documento ou a conversa exportada do WhatsApp (.txt ou .zip). O agente tira o jeito de falar, o passo a passo e o que a equipe sabe. Nada vale até você aprovar."
      action={step !== "idle" && step !== "uploading" ? <Button size="small" startIcon={<X size={15} />} onClick={reset}>Recomeçar</Button> : null}>
      {(step === "idle" || step === "uploading") && (
        <div
          role="button" tabIndex={0}
          onClick={() => input.current && input.current.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current && input.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files && e.dataTransfer.files[0]); }}
          style={{ border: `2px dashed ${dragging ? "#0693e3" : "var(--ui-border)"}`, background: dragging ? "rgba(6,147,227,.08)" : "transparent", borderRadius: 16, padding: "28px 16px", textAlign: "center", cursor: "pointer", transition: "border-color .18s ease, background-color .18s ease", display: "grid", gap: 6, justifyItems: "center" }}
        >
          <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; upload(f); }} />
          {step === "uploading" ? <CircularProgress size={26} /> : <span style={{ width: 46, height: 46, borderRadius: 14, display: "grid", placeItems: "center", background: "rgba(6,147,227,.14)", color: "#0693e3" }}><UploadCloud size={24} /></span>}
          <b>{step === "uploading" ? "Lendo o arquivo…" : "Arraste o arquivo aqui ou clique para escolher"}</b>
          <span style={{ fontSize: 12.5, opacity: 0.65 }}>PDF, DOCX, TXT ou ZIP do WhatsApp · até 25 MB</span>
        </div>
      )}

      {step === "uploaded" && up && (
        <div style={{ display: "grid", gap: 14 }}>
          <div className="ui-card" style={{ padding: 14, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: "rgba(6,147,227,.14)", color: "#0693e3" }}><FileText size={20} /></span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{up.name}</b>
              <span style={{ fontSize: 12.5, opacity: 0.7 }}>{up.kind === "whatsapp" ? `Conversa do WhatsApp · ${up.messages} mensagens` : "Documento"} · {Math.round(up.chars / 1000)} mil caracteres</span>
            </div>
          </div>
          {up.kind === "whatsapp" && (
            <div style={{ display: "grid", gap: 8 }}>
              <b style={{ fontSize: 14 }}>Quem é o atendente nesta conversa?</b>
              <div style={{ fontSize: 12.5, opacity: 0.65 }}>É o jeito de falar dessa pessoa que o agente vai aprender. Quem não for escolhido é tratado como cliente.</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {up.participants.map((p) => (
                  <button key={p.name} type="button" onClick={() => setAttendant(p.name)} className="ui-card ui-press" style={{ padding: "8px 14px", font: "inherit", fontSize: 13.5, fontWeight: 600, color: "inherit", borderColor: attendant === p.name ? "#0693e3" : undefined, background: attendant === p.name ? "rgba(6,147,227,.1)" : undefined }}>
                    {p.name} <span style={{ opacity: 0.6, fontWeight: 500 }}>· {p.count} msgs</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={{ fontSize: 12.5, opacity: 0.7 }}>A análise usa a sua chave de IA ({up.plan.calls} {up.plan.calls === 1 ? "chamada" : "chamadas"}{up.plan.chunks > up.plan.used ? `; arquivo grande, vou ler ${up.plan.used} partes espalhadas pelo texto` : ""}). Telefones, CPF e e-mails são escondidos antes de enviar.</div>
          <div><Button variant="contained" color="primary" disableElevation disabled={up.kind === "whatsapp" && !attendant} onClick={analyze} style={{ borderRadius: 10 }}>Analisar arquivo</Button></div>
        </div>
      )}

      {step === "analyzing" && (
        <div style={{ display: "grid", gap: 10, justifyItems: "center", padding: "24px 0" }}>
          <CircularProgress size={28} />
          <b>Lendo e entendendo…</b>
          <span style={{ fontSize: 12.5, opacity: 0.65 }}>Arquivos grandes levam alguns minutos. Pode deixar esta tela aberta.</span>
        </div>
      )}

      {step === "review" && result && (
        <div style={{ display: "grid", gap: 18 }}>
          {!result.style.length && !result.steps.length && !result.knowledge.length && !result.examples.length && <EmptyState title="Não achei nada para aprender" text="O arquivo parece não ter um atendimento ou um processo. Tente outro arquivo." />}
          {group("Jeito de falar", "Entra em todas as respostas.", result.style.map((s, i) => row(`s${i}`, s)))}
          {group("Passo a passo (etapas)", "Vira um rascunho do Roteiro, na ordem. Você revisa e publica depois.", result.steps.map((s, i) => row(`e${i}`, (
            <span><b>{i + 1}. {s.title}</b>{s.objective ? <span style={{ display: "block", opacity: 0.8 }}>{s.objective}</span> : null}{s.say ? <span style={{ display: "block", fontSize: 13, opacity: 0.7 }}>Diz: {s.say}</span> : null}{s.ask ? <span style={{ display: "block", fontSize: 13, opacity: 0.7 }}>Pergunta: {s.ask}</span> : null}{s.collect.length ? <span style={{ display: "block", fontSize: 13, opacity: 0.7 }}>Descobre: {s.collect.join(", ")}</span> : null}{s.advanceWhen ? <span style={{ display: "block", fontSize: 13, opacity: 0.7 }}>Avança quando: {s.advanceWhen}</span> : null}</span>
          ))))}
          {group("Exemplos de boas respostas", "O agente imita o tom e o jeito.", result.examples.map((x, i) => row(`x${i}`, <span><b>Cliente:</b> {x.customer}<br /><b>Resposta:</b> {x.answer}</span>)))}
          {group("Conhecimento", "Fatos que o atendente informa. Entram na base de conhecimento.", result.knowledge.map((k, i) => row(`k${i}`, <span><b>{k.title}</b><span style={{ display: "block", opacity: 0.8 }}>{k.content}</span></span>)))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="contained" color="primary" disableElevation startIcon={<Check size={16} />} onClick={apply} style={{ borderRadius: 10 }}>Aprovar o que está marcado</Button>
            <Button onClick={reset}>Descartar</Button>
          </div>
        </div>
      )}

      {step === "done" && done && (
        <div style={{ display: "grid", gap: 10, justifyItems: "center", padding: "20px 0", textAlign: "center" }}>
          <span style={{ width: 46, height: 46, borderRadius: 14, display: "grid", placeItems: "center", background: "rgba(22,163,74,.14)", color: "#16a34a" }}><Check size={24} /></span>
          <b>Aprendido</b>
          <span style={{ fontSize: 13.5, opacity: 0.8 }}>{done.rules} {done.rules === 1 ? "ensinamento" : "ensinamentos"} · {done.knowledge} {done.knowledge === 1 ? "conhecimento" : "conhecimentos"}{done.steps ? ` · ${done.steps} etapas em um rascunho do Roteiro` : ""}</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {done.flowId ? <Button variant="outlined" onClick={() => goRoteiro(done.flowId)} style={{ borderRadius: 10 }}>Abrir o rascunho do Roteiro</Button> : null}
            <Button onClick={reset}>Enviar outro arquivo</Button>
          </div>
        </div>
      )}
    </Section>
  );
};

const TrainTab = ({ agentId, goRoteiro }) => {
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", alignItems: "start" }} className="ui-stagger">
        <Coach agentId={agentId} onSaved={bump} />
        <Learned agentId={agentId} version={version} onChanged={bump} />
      </div>
      <FileLearn agentId={agentId} onApplied={bump} goRoteiro={goRoteiro} />
    </div>
  );
};

export default TrainTab;
