import React, { useRef, useState, useEffect } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography, makeStyles } from "@material-ui/core";
import { Send, RotateCcw, GraduationCap, Save, ListChecks, Play, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { ProposalList } from "./TrainTab";

const useStyles = makeStyles((theme) => ({
  chat: { borderRadius: 16, padding: theme.spacing(1.5), height: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, background: theme.palette.type === "dark" ? "#0b141a" : "#efeae2", ...theme.scrollbarStyles },
  me: { alignSelf: "flex-end", maxWidth: "80%", padding: "6px 10px", borderRadius: "10px 10px 2px 10px", background: theme.palette.type === "dark" ? "#005c4b" : "#d9fdd3", fontSize: 14, whiteSpace: "pre-wrap" },
  bot: { alignSelf: "flex-start", maxWidth: "80%", padding: "6px 10px", borderRadius: "10px 10px 10px 2px", background: theme.palette.type === "dark" ? "#202c33" : "#fff", fontSize: 14, whiteSpace: "pre-wrap" },
  meta: { alignSelf: "flex-start", fontSize: 11.5, color: theme.palette.text.secondary, margin: "0 4px" },
  row: { display: "flex", flexWrap: "wrap", gap: theme.spacing(1), marginTop: theme.spacing(1.25), alignItems: "center", "& .MuiButton-root": { whiteSpace: "nowrap", flex: "none" } },
}));

const TOOL = { buscar_curso: "consultou o catálogo de cursos", listar_polos: "consultou os polos", simular_bolsa: "simulou a bolsa", salvar_lead: "guardou dados do aluno", buscar_grade: "buscou a grade", enviar_material: "enviaria a grade em PDF (no teste não é enviada)", registrar_turno: "registrou o turno" };


const OUTCOMES = [["", "Qualquer um"], ["answer", "Responder ao aluno"], ["handoff", "Passar para uma pessoa"], ["unknown", "Confirmar com a equipe"]];

// Conversations the agent must handle well: saved from the tester, run again after every change to the agent
const CasesPanel = ({ agentId, refreshKey }) => {
  const [cases, setCases] = useState([]);
  const [running, setRunning] = useState(false);
  const load = React.useCallback(async () => {
    try { setCases((await api.get(`/ai-agents/${agentId}/cases`)).data); } catch (err) { toastError(err); }
  }, [agentId]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const run = async (caseId) => {
    setRunning(true);
    try {
      const { data } = await api.post(`/ai-agents/${agentId}/cases/run`, caseId ? { caseId } : {});
      setCases((prev) => prev.map((c) => data.cases.find((d) => d.id === c.id) || c));
      if (!caseId) toast[data.failed ? "warning" : "success"](data.failed ? `${data.failed} caso(s) falharam, ${data.passed} passaram.` : `Todos os ${data.passed} casos passaram.`);
    } catch (err) { toastError(err); }
    setRunning(false);
  };
  const remove = async (id) => {
    try { await api.delete(`/ai-agents/${agentId}/cases/${id}`); setCases((prev) => prev.filter((c) => c.id !== id)); } catch (err) { toastError(err); }
  };
  if (!cases.length) return null;
  const failing = cases.filter((c) => c.lastStatus === "fail").length;
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <ListChecks size={18} />
        <Typography variant="subtitle1" style={{ fontWeight: 700, flex: 1 }}>Casos de teste ({cases.length})</Typography>
        <Button variant="outlined" color="primary" size="small" startIcon={<Play size={14} />} disabled={running} onClick={() => run()}>{running ? "Rodando…" : "Rodar todos"}</Button>
      </div>
      <Typography variant="caption" color="textSecondary" display="block" style={{ marginBottom: 8 }}>
        São conversas que o agente precisa responder bem. Rode depois de mudar as regras, a base ou o treino: {failing ? `${failing} está falhando agora.` : "se algo quebrar, aparece aqui."}
      </Typography>
      {cases.map((c) => (
        <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 0", borderTop: "1px solid rgba(128,128,128,.2)" }}>
          {c.lastStatus === "pass" ? <CheckCircle2 size={18} color="#16a34a" style={{ flex: "none", marginTop: 2 }} aria-label="Passou" /> : c.lastStatus === "fail" ? <XCircle size={18} color="#dc2626" style={{ flex: "none", marginTop: 2 }} aria-label="Falhou" /> : <span style={{ width: 18, flex: "none" }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
            {c.lastReasons && c.lastReasons.length > 0 && c.lastReasons.map((r, i) => <div key={i} style={{ fontSize: 12.5, color: "#dc2626" }}>{r}</div>)}
            {c.lastText && <div style={{ fontSize: 12.5, opacity: 0.75, whiteSpace: "pre-wrap" }}>Última resposta: {c.lastText}</div>}
          </div>
          <Button size="small" disabled={running} onClick={() => run(c.id)}>Rodar</Button>
          <Button size="small" aria-label="Apagar caso" onClick={() => remove(c.id)}><Trash2 size={16} /></Button>
        </div>
      ))}
    </div>
  );
};

// Talks to the agent exactly like a student would, without sending anything on WhatsApp or changing any record.
const TestTab = ({ agentId, flowId, commercial }) => {
  const classes = useStyles();
  const [turns, setTurns] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [collected, setCollected] = useState({});
  // the commercial agent is tested with the same engine that answers the leads (presentation, courses of the system, grade, handoff); the rest with the simple tester
  const real = !!flowId && !!commercial;
  const [sim, setSim] = useState(null);
  const end = useRef();
  const [teaching, setTeaching] = useState(null);
  const [lesson, setLesson] = useState("");
  const [saving, setSaving] = useState(false);
  const [proposed, setProposed] = useState(null);
  // the conversation turned into a test case
  const [caseDraft, setCaseDraft] = useState(null);
  const [casesKey, setCasesKey] = useState(0);
  const openCase = () => {
    let end = turns.length;
    while (end > 0 && turns[end - 1].role !== "user") end -= 1;
    const reply = turns[end] && turns[end].role === "assistant" ? turns[end].content : "";
    setCaseDraft({ name: turns[end - 1].content.slice(0, 60), messages: turns.slice(0, end).map(({ role, content }) => ({ role, content })), reply, mustContain: "", mustNotContain: "", outcome: "" });
  };
  const saveCase = async () => {
    try {
      await api.post(`/ai-agents/${agentId}/cases`, {
        name: caseDraft.name, messages: caseDraft.messages,
        expect: { mustContain: caseDraft.mustContain.split("\n"), mustNotContain: caseDraft.mustNotContain.split("\n"), outcome: caseDraft.outcome || undefined }
      });
      toast.success("Caso salvo. Rode os casos depois de mudar o agente.");
      setCaseDraft(null);
      setCasesKey((k) => k + 1);
    } catch (err) { toastError(err); }
  };
  // the whole conversation turned into lessons: the owner reviews before anything is saved
  const toTraining = async () => {
    setSaving(true);
    try {
      const { data } = await api.post(`/ai-agents/${agentId}/train/from-conversation`, { messages: turns.map(({ role, content }) => ({ role, content })) });
      if (!data.proposed || !data.proposed.length) toast.info("Não encontrei nada novo para o agente aprender nesta conversa.");
      else setProposed(data.proposed.map((p) => ({ ...p, keep: true })));
    } catch (err) { toastError(err); }
    setSaving(false);
  };
  const saveTraining = async () => {
    const items = proposed.filter((p) => p.keep !== false);
    try {
      if (items.length) await api.post(`/ai-agents/${agentId}/rules/bulk`, { items, source: "conversa" });
      toast.success(items.length ? "Gravado: o agente vai seguir em todas as respostas." : "Nada foi gravado.");
      setProposed(null);
    } catch (err) { toastError(err); }
  };
  const teach = async (t) => {
    try {
      await api.post(`/ai-agents/${agentId}/learnings`, { question: t.question, answer: lesson });
      toast.success("Pronto: o agente vai usar essa resposta.");
      setTeaching(null);
    } catch (err) { toastError(err); }
  };
  useEffect(() => { if (end.current) end.current.scrollTop = end.current.scrollHeight; }, [turns, busy]);

  const send = async () => {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...turns, { role: "user", content }];
    setTurns(next);
    setText("");
    setBusy(true);
    try {
      if (real) {
        const { data } = await api.post(`/flows/${flowId}/simulate`, { state: sim, input: content, restart: !sim, sample: {} });
        setSim(data.state);
        const bubbles = (data.messages || []).map((m) => (typeof m === "string" ? m : (m && m.text) || "")).filter(Boolean);
        const tools = [...new Set((data.traces || []).flatMap((t) => (t.tools || []).map((x) => (x && x.name) || x)))].map((t) => TOOL[t] || t);
        const tokens = (data.traces || []).reduce((a, t) => a + ((t.tokens && (t.tokens.input + t.tokens.output)) || 0), 0);
        const ended = data.status === "handoff" ? "a conversa passaria para a equipe" : data.status === "done" ? "fim do fluxo" : "";
        const meta = [tools.join(", "), tokens ? `${tokens} tokens` : "sem chamar o modelo", ended].filter(Boolean).join(" · ");
        const shown = bubbles.length ? bubbles : ["(sem resposta)"];
        setTurns([...next, ...shown.map((b, i) => ({ role: "assistant", content: b, question: content, sources: [], meta: i === shown.length - 1 ? meta : "" }))]);
        const slots = (data.state && data.state.vars && data.state.vars.__commercial && data.state.vars.__commercial.state && data.state.vars.__commercial.state.slots) || {};
        setCollected(Object.fromEntries([["nome", slots.leadName], ["curso", slots.courseName], ["cidade", slots.city], ["ingresso", slots.entryType && slots.entryType !== "unknown" ? slots.entryType : ""], ["curso pedido que não oferecemos", slots.unofferedCourse]].filter(([, v]) => v)));
      } else {
        const { data } = await api.post(`/ai-agents/${agentId}/test`, { messages: next.map(({ role, content: c }) => ({ role, content: c })), collected });
        setCollected(data.collected || {});
        setTurns([...next, { role: "assistant", content: data.text || "(sem resposta)", question: content, sources: data.sources || [], meta: `${(data.tools || []).map((t) => TOOL[t] || t).join(", ")}${data.tools?.length ? " · " : ""}${data.tokens.input + data.tokens.output} tokens` }]);
      }
    } catch (err) {
      toastError(err);
      setTurns(turns);
      setText(content);
    }
    setBusy(false);
  };

  return (
    <div>
      <Typography variant="caption" color="textSecondary" display="block" style={{ marginBottom: 8 }}>
        O uso entra no consumo, mas não conta no limite diário.
      </Typography>
      <div className={classes.chat} ref={end}>
        {turns.length === 0 && <span className={classes.meta}>Escreva a primeira mensagem do aluno, por exemplo: “Oi, quero saber sobre o curso de Pedagogia”.</span>}
        {turns.map((t, i) => (
          <React.Fragment key={i}>
            <div className={t.role === "user" ? classes.me : classes.bot}>{t.content}</div>
            {t.meta && <span className={classes.meta}>{t.meta}{t.sources && t.sources.length ? ` · baseado em: ${t.sources.join(", ")}` : ""}</span>}
            {t.role === "assistant" && (
              teaching === i ? (
                <div style={{ alignSelf: "stretch", display: "flex", gap: 6 }}>
                  <TextField fullWidth multiline rows={2} size="small" variant="outlined" placeholder="Escreva a resposta certa" value={lesson} onChange={(e) => setLesson(e.target.value)} style={{ background: "rgba(255,255,255,.6)", borderRadius: 4 }} />
                  <Button variant="contained" color="primary" size="small" disabled={!lesson.trim()} onClick={() => teach(t)}>Ensinar</Button>
                  <Button size="small" onClick={() => setTeaching(null)}>Cancelar</Button>
                </div>
              ) : (
                <Button size="small" style={{ alignSelf: "flex-start", textTransform: "none" }} startIcon={<GraduationCap size={14} />} onClick={() => { setTeaching(i); setLesson(""); }}>Corrigir esta resposta</Button>
              )
            )}
          </React.Fragment>
        ))}
        {busy && <span className={classes.meta}>digitando…</span>}
      </div>
      {Object.keys(collected).length > 0 && (
        <Typography variant="caption" color="textSecondary" display="block" style={{ marginTop: 6 }}>
          Dados que o agente já guardou: {Object.entries(collected).map(([k, v]) => `${k}: ${v}`).join(" · ")}
        </Typography>
      )}
      <div className={classes.row}>
        <TextField variant="outlined" size="small" placeholder="Mensagem do aluno" style={{ flex: "1 1 260px", minWidth: 200 }} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} disabled={busy} />
        <Button variant="contained" color="primary" onClick={send} disabled={busy || !text.trim()} startIcon={<Send size={16} />}>Enviar</Button>
        <Button variant="outlined" onClick={() => { setTurns([]); setCollected({}); setSim(null); }} startIcon={<RotateCcw size={16} />}>Recomeçar</Button>
        <Button variant="outlined" color="primary" onClick={toTraining} disabled={saving || turns.length < 2} startIcon={<Save size={16} />}>Salvar como treino</Button>
        <Button variant="outlined" onClick={openCase} disabled={!turns.some((t) => t.role === "user")} startIcon={<ListChecks size={16} />}>Salvar como caso</Button>
      </div>
      <CasesPanel agentId={agentId} refreshKey={casesKey} />
      <Dialog open={!!caseDraft} onClose={() => setCaseDraft(null)} fullWidth maxWidth="sm">
        <DialogTitle>Salvar esta conversa como caso de teste</DialogTitle>
        <DialogContent>
          {caseDraft && (
            <>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                O caso guarda a conversa até a última mensagem do aluno. Depois, “Rodar casos” confere se a resposta do agente ainda tem o que você espera.
              </Typography>
              {caseDraft.reply && <Typography variant="caption" color="textSecondary" display="block" style={{ whiteSpace: "pre-wrap", marginBottom: 8 }}>Resposta de agora: {caseDraft.reply}</Typography>}
              <TextField fullWidth variant="outlined" margin="dense" label="Nome do caso" value={caseDraft.name} onChange={(e) => setCaseDraft({ ...caseDraft, name: e.target.value })} />
              <TextField fullWidth multiline rows={2} variant="outlined" margin="dense" label="A resposta deve conter (uma frase por linha)" helperText="Use | para aceitar alternativas: 40% | quarenta por cento" value={caseDraft.mustContain} onChange={(e) => setCaseDraft({ ...caseDraft, mustContain: e.target.value })} />
              <TextField fullWidth multiline rows={2} variant="outlined" margin="dense" label="A resposta não pode conter (uma frase por linha)" value={caseDraft.mustNotContain} onChange={(e) => setCaseDraft({ ...caseDraft, mustNotContain: e.target.value })} />
              <TextField select fullWidth variant="outlined" margin="dense" label="O agente deve" value={caseDraft.outcome} onChange={(e) => setCaseDraft({ ...caseDraft, outcome: e.target.value })}>
                {OUTCOMES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
              </TextField>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCaseDraft(null)}>Cancelar</Button>
          <Button variant="contained" color="primary" disableElevation onClick={saveCase} disabled={!caseDraft || (!caseDraft.mustContain.trim() && !caseDraft.mustNotContain.trim() && !caseDraft.outcome)}>Salvar caso</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!proposed} onClose={() => setProposed(null)} fullWidth maxWidth="sm">
        <DialogTitle>O que o agente deve aprender desta conversa</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" style={{ marginBottom: 12 }}>Marque o que vale. O que for gravado passa a valer em todas as respostas.</Typography>
          {proposed && <ProposalList items={proposed} onChange={setProposed} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProposed(null)}>Cancelar</Button>
          <Button variant="contained" color="primary" disableElevation onClick={saveTraining}>Gravar</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default TestTab;
