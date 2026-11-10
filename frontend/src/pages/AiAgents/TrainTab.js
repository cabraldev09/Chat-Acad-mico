import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, CircularProgress, Switch, TextField } from "@material-ui/core";
import { Bot, Check, FileText, GraduationCap, ListChecks, MessageSquare, Palette, Pencil, RotateCcw, Send, Trash2, UploadCloud, X } from "lucide-react";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { EmptyState, Section, Segmented } from "../../components/ui";

// THE TRAINER, in one simple screen: on the left "Ensinar" (a rule, how I answer a customer, a conversation or a file, or a chat with the agent), on the
// right "Testar agora" (the same customer message answered again after every change), and below "O que o agente aprendeu", where each lesson can be
// edited, switched off or deleted. A lesson is in EVERY answer of the agent (the rules of the trainer are part of its prompt).

const KIND = {
  regra: { label: "Regra", icon: ListChecks, color: "#0693e3" },
  estilo: { label: "Jeito de falar", icon: Palette, color: "#7c3aed" },
  exemplo: { label: "Exemplo", icon: MessageSquare, color: "#0d9488" },
};
const kindOf = (k) => KIND[k] || KIND.regra;

// a part of the screen: its own card, or (inside "Ensinar") only its content
const Part = ({ bare, title, hint, action, children }) => (bare
  ? <div style={{ display: "grid", gap: 12 }}>{action ? <div style={{ justifySelf: "end" }}>{action}</div> : null}{children}</div>
  : <Section title={title} hint={hint} action={action}>{children}</Section>);

const bubble = (mine) => ({
  alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%", padding: "8px 12px", fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.45,
  borderRadius: mine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
  background: mine ? "var(--c-brand)" : "var(--surface)", color: mine ? "#fff" : "var(--text-1)", border: mine ? "none" : "1px solid var(--line)",
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
  const [filter, setFilter] = useState("todas");
  const [q, setQ] = useState("");

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
  const count = (k) => (rules || []).filter((r) => (k === "todas" ? true : k === "desligadas" ? !r.active : r.kind === k)).length;
  const shown = (rules || []).filter((r) => (filter === "todas" ? true : filter === "desligadas" ? !r.active : r.kind === filter) && (!q.trim() || r.text.toLowerCase().includes(q.trim().toLowerCase())));
  const activeCount = (rules || []).filter((r) => r.active).length;

  return (
    <Section title="O que o agente aprendeu" hint={rules ? `${activeCount} valendo agora em todas as respostas. O que você gravar, editar ou desligar vale na próxima mensagem.` : "Tudo isto vale em todas as respostas."}>
      {rules && rules.length > 8 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          {[["todas", "Todas"], ...Object.entries(KIND).map(([k, v]) => [k, v.label]), ["desligadas", "Desligadas"]].map(([k, label]) => count(k) > 0 || k === "todas" ? (
            <button key={k} type="button" onClick={() => setFilter(k)} className="ui-press" style={{ border: "1px solid var(--ui-border)", borderRadius: 999, padding: "3px 10px", font: "inherit", fontSize: 12.5, cursor: "pointer", color: "inherit", background: filter === k ? "var(--ui-border)" : "transparent", fontWeight: filter === k ? 700 : 500 }}>{label} · {count(k)}</button>
          ) : null)}
          <TextField size="small" variant="outlined" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginLeft: "auto", width: 140 }} />
        </div>
      )}
      {!rules && <div className="ui-skeleton" style={{ height: 120 }} />}
      {rules && rules.length === 0 && <EmptyState icon={<GraduationCap size={22} />} title="Ainda não aprendeu nada" text="Use o quadro Ensinar: escreva uma regra, mostre como você responde ou envie uma conversa." />}
      {rules && rules.length > 0 && (
        <div style={{ display: "grid", gap: 8, maxHeight: 420, overflowY: "auto" }}>
          {shown.length === 0 && <div style={{ fontSize: 13, opacity: 0.65, padding: "8px 2px" }}>Nenhum ensinamento nesse filtro.</div>}
          {shown.map((r) => {
            const k = kindOf(r.kind);
            const Icon = k.icon;
            return (
              <div key={r.id} className="ui-card" style={{ padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-start", opacity: r.active ? 1 : 0.55 }}>
                <span style={{ width: 28, height: 28, borderRadius: 9, display: "grid", placeItems: "center", background: `${k.color}22`, color: k.color, flex: "none" }}><Icon size={16} /></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: k.color, textTransform: "uppercase", letterSpacing: ".06em" }}>{k.label}{r.source === "arquivo" ? " · de um arquivo" : ""}</div>
                  {edit === r.id ? (
                    <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
                      <TextField fullWidth multiline autoFocus size="small" variant="outlined" value={draft} onChange={(e) => setDraft(e.target.value)} />
                      <div style={{ display: "flex", gap: 6 }}>
                        <Button size="small" variant="contained" color="primary" disableElevation disabled={draft.trim().length < 3} onClick={async () => { await patch(r, { text: draft }); setEdit(null); }}>Salvar</Button>
                        <Button size="small" onClick={() => setEdit(null)}>Cancelar</Button>
                      </div>
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
const Coach = ({ agentId, onSaved, bare }) => {
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

  const ideas = ["Simule um cliente perguntando o valor do curso de Pedagogia", "Nunca fale preço antes de saber o curso e a cidade", "Fale sempre curto, no máximo duas frases por mensagem", "Quando o cliente disser que vai pensar, pergunte o que o preocupa"];

  return (
    <Part bare={bare} title="Converse com o agente para ensinar" hint="Dê ordens como falaria com um funcionário novo. O que ele entender aparece para você gravar e já vale na próxima resposta.">
      <div ref={end} style={{ height: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
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
    </Part>
  );
};

// ---------------------------------------------------------------- the effect, at once: the same customer message, answered again after every change
const SCENARIOS = ["Oi", "Quero fazer Pedagogia", "É 100% EAD?", "Me envia a grade de Pedagogia", "Quanto custa?"];

const LivePreview = ({ agentId, flowId, commercial, version }) => {
  const [message, setMessage] = useState(SCENARIOS[0]);
  const [now, setNow] = useState(null);
  const [before, setBefore] = useState(null);
  const [busy, setBusy] = useState(false);
  const last = useRef(0);
  const nowRef = useRef(null);

  const run = useCallback(async (text) => {
    const content = String(text || "").trim();
    if (!content) return;
    setBusy(true);
    try {
      let answer;
      if (flowId && commercial) {
        const { data } = await api.post(`/flows/${flowId}/simulate`, { state: null, input: content, restart: true, sample: {} });
        answer = (data.messages || []).map((m) => (typeof m === "string" ? m : (m && m.text) || "")).filter(Boolean);
      } else {
        const { data } = await api.post(`/ai-agents/${agentId}/test`, { messages: [{ role: "user", content }], collected: {} });
        answer = [data.text || ""];
      }
      setBefore(nowRef.current && nowRef.current.message === content ? nowRef.current.answer : null);
      nowRef.current = { message: content, answer };
      setNow(nowRef.current);
    } catch (err) { toastError(err); }
    setBusy(false);
  }, [agentId, flowId, commercial]);

  // every lesson saved, edited or switched changes the answer: it is asked again, and the one before stays for comparison
  useEffect(() => {
    if (!version || version === last.current) return undefined;
    last.current = version;
    const t = setTimeout(() => run(message), 500);
    return () => clearTimeout(t);
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  const same = before && now && before.join("\n") === now.answer.join("\n");
  return (
    <Section title="Testar agora" hint="Escolha uma mensagem de cliente. A cada ensinamento gravado, o agente responde de novo e você compara com a resposta de antes. Nada é enviado a ninguém.">
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {SCENARIOS.map((sc) => (
          <button key={sc} type="button" onClick={() => { setMessage(sc); run(sc); }} className="ui-press" style={{ border: "1px solid var(--ui-border)", borderRadius: 999, padding: "3px 10px", font: "inherit", fontSize: 12.5, cursor: "pointer", color: "inherit", background: message === sc ? "var(--ui-border)" : "transparent" }}>{sc}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <TextField fullWidth size="small" variant="outlined" placeholder="Mensagem do cliente" value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && run(message)} />
        <Button variant="contained" color="primary" disableElevation disabled={busy || !message.trim()} onClick={() => run(message)} style={{ borderRadius: 10, whiteSpace: "nowrap" }}>{busy ? "Respondendo…" : "Testar agora"}</Button>
      </div>
      {now && (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: before && !same ? "repeat(auto-fit, minmax(260px, 1fr))" : "1fr" }}>
          {before && !same && (
            <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
              <b style={{ fontSize: 12, opacity: 0.65, textTransform: "uppercase", letterSpacing: ".06em" }}>Antes</b>
              {before.map((b, i) => <div key={i} style={{ ...bubble(false), maxWidth: "100%", opacity: 0.7 }}>{b}</div>)}
            </div>
          )}
          <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
            <b style={{ fontSize: 12, opacity: 0.65, textTransform: "uppercase", letterSpacing: ".06em" }}>{before && !same ? "Agora" : "Resposta atual"}</b>
            {now.answer.length ? now.answer.map((b, i) => <div key={i} style={{ ...bubble(false), maxWidth: "100%" }}>{b}</div>) : <div style={{ fontSize: 13, opacity: 0.65 }}>(sem resposta)</div>}
            {same && <span style={{ fontSize: 12.5, opacity: 0.65 }}>A resposta não mudou com o último ensinamento. Se esperava diferença, reescreva a regra de forma mais direta.</span>}
          </div>
        </div>
      )}
      {!now && !busy && <div style={{ fontSize: 13, opacity: 0.65 }}>Ainda não testou. Escolha uma mensagem acima.</div>}
    </Section>
  );
};

// ---------------------------------------------------------------- learn from a file
const ACCEPT = ".pdf,.docx,.txt,.zip";

const FileLearn = ({ agentId, onApplied, goRoteiro, bare }) => {
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
    <Part bare={bare} title="Aprender com um arquivo" hint="PDF, documento ou a conversa exportada do WhatsApp (.txt ou .zip). Nada vale até você aprovar."
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
    </Part>
  );
};

// ---------------------------------------------------------------- teach: four simple ways, one at a time
const MODES = [["regra", "Uma regra"], ["exemplo", "Como eu respondo"], ["arquivo", "Conversa ou arquivo"], ["conversar", "Conversar"]];

const Teach = ({ agentId, onSaved, goRoteiro }) => {
  const [mode, setMode] = useState("regra");
  const [rule, setRule] = useState("");
  const [customer, setCustomer] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (kind, text, clear) => {
    setBusy(true);
    try {
      await api.post(`/ai-agents/${agentId}/rules`, { kind, text, source: "treino" });
      toast.success("Gravado. O agente já segue na próxima resposta.");
      clear();
      onSaved && onSaved();
    } catch (e) { toastError(e); }
    setBusy(false);
  };
  const exampleText = `Cliente: ${customer.trim()}\nResposta: ${answer.trim()}`;

  return (
    <Section title="Ensinar o agente" hint="Escolha um jeito de ensinar. O que você gravar vale na próxima resposta e aparece em O que o agente aprendeu.">
      <div style={{ marginBottom: 14, overflowX: "auto" }}>
        <Segmented items={MODES} value={mode} onChange={setMode} label="Como ensinar" />
      </div>
      {mode === "regra" && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13, color: "var(--text-2)" }}>Uma ordem curta, como falaria com um funcionário novo.</div>
          <TextField fullWidth multiline rows={3} variant="outlined" size="small" placeholder="Ex.: Antes de tudo, pergunte se é a primeira graduação. Não use emoji." value={rule} onChange={(e) => setRule(e.target.value)} inputProps={{ maxLength: 1200 }} />
          <div><Button variant="contained" color="primary" disableElevation disabled={busy || rule.trim().length < 3} onClick={() => save("regra", rule.trim(), () => setRule(""))} startIcon={<Check size={16} />}>Gravar regra</Button></div>
        </div>
      )}
      {mode === "exemplo" && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13, color: "var(--text-2)" }}>Cole uma pergunta de cliente e a resposta que você daria. O agente imita o jeito e o conteúdo.</div>
          <TextField fullWidth variant="outlined" size="small" label="Mensagem do cliente" placeholder="Ex.: É 100% EAD?" value={customer} onChange={(e) => setCustomer(e.target.value)} inputProps={{ maxLength: 300 }} />
          <TextField fullWidth multiline rows={5} variant="outlined" size="small" label="Como eu respondo" placeholder="Ex.: Hoje, o curso funciona no formato EAD... Com as mudanças do MEC, a partir de maio de 2027..." value={answer} onChange={(e) => setAnswer(e.target.value)} inputProps={{ maxLength: 1100 }} />
          <div><Button variant="contained" color="primary" disableElevation disabled={busy || customer.trim().length < 2 || answer.trim().length < 3} onClick={() => save("exemplo", exampleText, () => { setCustomer(""); setAnswer(""); })} startIcon={<Check size={16} />}>Gravar exemplo</Button></div>
        </div>
      )}
      {mode === "arquivo" && <FileLearn bare agentId={agentId} onApplied={onSaved} goRoteiro={goRoteiro} />}
      {mode === "conversar" && <Coach bare agentId={agentId} onSaved={onSaved} />}
    </Section>
  );
};

const TrainTab = ({ agentId, goRoteiro, flowId, commercial }) => {
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", alignItems: "start" }}>
        <Teach agentId={agentId} onSaved={bump} goRoteiro={goRoteiro} />
        <LivePreview agentId={agentId} flowId={flowId} commercial={commercial} version={version} />
      </div>
      <Learned agentId={agentId} version={version} onChanged={bump} />
    </div>
  );
};

export default TrainTab;
