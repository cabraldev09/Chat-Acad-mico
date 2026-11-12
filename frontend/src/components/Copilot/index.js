import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, LinearProgress, makeStyles } from "@material-ui/core";
import { Check, ChevronDown, ChevronUp, Compass, Flag, ListChecks, Send, Settings2, Sparkles, X, FileText, GraduationCap, RotateCcw, ThumbsUp, ThumbsDown, BookOpen, History } from "lucide-react";
import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import EnrollDialog from "../../pages/CRM/EnrollDialog";
import CopilotSettings from "./Settings";

const useStyles = makeStyles(theme => ({
  root: { flex: "none", minWidth: 0, color: theme.palette.text.primary, background: theme.palette.background.paper, borderBottom: `1px solid ${theme.palette.divider}` },
  header: { display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", flexWrap: "wrap" },
  emblem: { display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 11, flexShrink: 0, color: theme.palette.type === "dark" ? "#5eead4" : "#0f766e", background: "rgba(15,118,110,.1)" },
  title: { fontSize: 14, fontWeight: 700, lineHeight: 1.4 },
  muted: { fontSize: 12, color: theme.palette.text.secondary, lineHeight: 1.5 },
  badge: { display: "inline-flex", whiteSpace: "nowrap", borderRadius: 20, padding: "3px 9px", fontSize: 11, fontWeight: 600, background: theme.palette.action.hover, color: theme.palette.text.secondary },
  primary: { background: "#0f766e", color: "#fff", borderRadius: 9, textTransform: "none", fontWeight: 600, boxShadow: "none", "&:hover": { background: "#115e59", boxShadow: "none" } },
  button: { textTransform: "none", borderRadius: 8, fontSize: 12 },
  content: { maxHeight: "min(48vh, 420px)", overflowY: "auto", padding: "0 16px 12px", ...theme.scrollbarStyles },
  layout: { display: "grid", gridTemplateColumns: "minmax(180px, .85fr) minmax(240px, 1.6fr)", gap: 14, alignItems: "start", [theme.breakpoints.down("sm")]: { display: "flex", flexDirection: "column", alignItems: "stretch" } },
  steps: { padding: 0, margin: 0, listStyle: "none", display: "grid", gap: 2, [theme.breakpoints.down("sm")]: { order: 1, maxHeight: 160, overflowY: "auto" } },
  stepButton: { width: "100%", border: 0, borderRadius: 9, background: "transparent", color: theme.palette.text.secondary, padding: "7px 9px", display: "flex", alignItems: "center", gap: 9, textAlign: "left", cursor: "pointer", font: "inherit", fontSize: 12, "&:hover": { background: theme.palette.action.hover }, "&:focus-visible": { outline: "2px solid #0f766e" } },
  selected: { background: "rgba(15,118,110,.09)", color: theme.palette.text.primary, fontWeight: 700 },
  dot: { width: 23, height: 23, borderRadius: "50%", border: `1px solid ${theme.palette.divider}`, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 10 },
  done: { color: theme.palette.type === "dark" ? "#5eead4" : "#0f766e", background: "rgba(15,118,110,.1)", borderColor: "transparent" },
  current: { color: "#fff", background: "#0f766e", borderColor: "#0f766e" },
  detail: { display: "grid", gap: 10, [theme.breakpoints.down("sm")]: { order: 0 }, border: `1px solid ${theme.palette.divider}`, borderRadius: 12, padding: 14 },
  eyebrow: { fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700, color: theme.palette.type === "dark" ? "#5eead4" : "#0f766e", display: "flex", alignItems: "center", gap: 6 },
  message: { fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.6, padding: 12, background: theme.palette.action.hover, borderRadius: 9 },
  actions: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
  foot: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, paddingTop: 8 },
  summary: { padding: "8px 0 0 18px", margin: 0, fontSize: 12, lineHeight: 1.6 },
  brief: { display: "grid", gap: 6, border: `1px solid ${theme.palette.divider}`, borderRadius: 12, padding: 12, marginBottom: 10 },
  briefList: { padding: "0 0 0 18px", margin: 0, fontSize: 12, lineHeight: 1.55 },
  chip: { textTransform: "none", borderRadius: 16, fontSize: 11, padding: "1px 9px", minWidth: 0 },
  thumb: { padding: 4 },
  thumbOn: { color: "#0f766e" },
  error: { padding: "10px 16px", fontSize: 12, display: "flex", gap: 12, alignItems: "center" }
}));

export default function Copilot({ ticket }) {
  // A separate instance per ticket prevents a late request from showing another contact's suggestion.
  return <Panel key={ticket.id} ticket={ticket} />;
}
function Panel({ ticket }) {
  const c = useStyles();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(true);
  const [allSteps, setAllSteps] = useState(false);
  const [selected, setSelected] = useState(null);
  // { id, text, sources, mode, feedback } of the last suggestion of the AI
  const [suggestion, setSuggestion] = useState(null);
  // the summary of the whole story of the client, made by the AI ({ id, brief, conversations, feedback })
  const [brief, setBrief] = useState(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const autoBriefAsked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [editor, setEditor] = useState(false);
  const [enrollLead, setEnrollLead] = useState(null);
  const alive = useRef(true);
  const requestSequence = useRef(0);
  const suggestionEpoch = useRef(0);
  const show = !!ticket.id && !ticket.isGroup && !ticket.isHistorical && ticket.status !== "closed";
  const reload = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const { data: result } = await api.get(`/tickets/${ticket.id}/copilot`);
      if (alive.current && sequence === requestSequence.current) { setData(result); setError(false); }
    } catch (e) { if (alive.current && sequence === requestSequence.current) setError(true); }
  }, [ticket.id]);
  useEffect(() => {
    alive.current = true;
    if (!show) return undefined;
    reload();
    let timer;
    const refresh = e => {
      if (e.detail && e.detail.ticketId && Number(e.detail.ticketId) !== Number(ticket.id)) return;
      suggestionEpoch.current++;
      setSuggestion(null);
      clearTimeout(timer);
      timer = setTimeout(reload, 900);
    };
    const poll = setInterval(() => { if (!document.hidden) reload(); }, 60000);
    window.addEventListener("copilotRefresh", refresh);
    return () => { alive.current = false; clearInterval(poll); clearTimeout(timer); window.removeEventListener("copilotRefresh", refresh); };
  }, [ticket.id, show, reload]);
  useEffect(() => { suggestionEpoch.current++; setSuggestion(null); if (show) reload(); }, [ticket.userId, ticket.aiActive, show, reload]);
  useEffect(() => {
    if (!show) return;
    api.get(`/tickets/${ticket.id}/copilot/brief`).then(({ data: result }) => { if (alive.current && result && result.brief) setBrief(result); }).catch(() => undefined);
  }, [ticket.id, show]);
  const makeBrief = useCallback(async quiet => {
    if (briefBusy) return;
    setBriefBusy(true);
    try {
      const { data: result } = await api.post(`/tickets/${ticket.id}/copilot/brief`);
      if (!alive.current) return;
      if (result.brief) setBrief(result); else if (!quiet) toast.info(result.note || "Sem resumo neste momento.");
    } catch (e) { if (!quiet) toastError(e); }
    finally { if (alive.current) setBriefBusy(false); }
  }, [ticket.id, briefBusy]);
  // a client who came back or was transferred: the summary is made as the consultant opens the conversation (once)
  useEffect(() => {
    if (data && data.autoBrief && !brief && !autoBriefAsked.current) { autoBriefAsked.current = true; makeBrief(true); }
  }, [data, brief, makeBrief]);
  if (!show) return null;
  if (error && !data) return <div className={c.error}>Não foi possível carregar o processo.<Button size="small" onClick={reload}>Tentar novamente</Button></div>;
  if (!data || !data.enabled) return null;
  const steps = data.steps || [];
  const current = steps.find(s => s.key === data.current);
  const active = steps.find(s => s.key === selected) || current || steps[steps.length - 1];
  const required = steps.filter(s => !s.optional);
  const completed = required.filter(s => s.done).length;
  const next = active && active.key === data.current ? data.suggestion : null;
  const canSend = !!ticket.userId && !ticket.aiActive && ticket.status === "open";
  const run = async fn => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { toastError(e); }
    finally { if (alive.current) { setBusy(false); reload(); } }
  };
  const fill = text => window.dispatchEvent(new CustomEvent("fillMessageInput", { detail: { ticketId: ticket.id, text } }));
  const suggest = mode => run(async () => {
    const epoch = suggestionEpoch.current;
    const { data: result } = await api.post(`/tickets/${ticket.id}/suggest-reply`, mode ? { mode } : {});
    if (!alive.current || epoch !== suggestionEpoch.current) return;
    if (result.text) setSuggestion({ id: result.id, text: result.text, sources: result.sources || [], mode: result.mode || mode || null, feedback: null });
    else toast.info(result.note || "Sem sugestão neste momento.");
  });
  // thumbs up / down on a suggestion or on the summary (clicking again takes the opinion back)
  const rate = async (item, setItem, value) => {
    if (!item || !item.id) return;
    const feedback = item.feedback === value ? null : value;
    const reason = feedback === "nao_util" ? window.prompt("O que faltou ou estava errado? (opcional)") || "" : "";
    try {
      await api.put(`/tickets/${ticket.id}/copilot/requests/${item.id}/feedback`, { feedback, reason });
      if (alive.current) setItem(v => (v && v.id === item.id ? { ...v, feedback } : v));
    } catch (e) { toastError(e); }
  };
  // "Usar e editar": the text goes to the message box; when it was the AI's, the next message sent tells if it went as it was or edited
  const takeText = (value, fromAi) => {
    fill(value);
    if (fromAi && suggestion && suggestion.id) api.put(`/tickets/${ticket.id}/copilot/requests/${suggestion.id}/take`).catch(() => undefined);
  };
  const mark = done => run(async () => {
    const { data: result } = await api.put(`/tickets/${ticket.id}/copilot/progress`, { key: active.key, done });
    if (alive.current) { setData(result); setSelected(null); setSuggestion(null); }
  });
  const summaryToggle = async () => {
    setSummaryOpen(v => !v);
    if (summary) return;
    try { const { data: result } = await api.get(`/tickets/${ticket.id}/ai-summary`); if (alive.current) setSummary(result); } catch (e) { toastError(e); }
  };
  const enrollment = () => run(async () => { const { data: lead } = await api.get(`/leads/${data.leadId}`); if (alive.current) setEnrollLead(lead); });
  const quota = data.quota && data.quota.user;
  const text = (suggestion && suggestion.text) || (next && next.text);
  const b = brief && brief.brief;
  return <section className={c.root} aria-label="Copiloto do consultor">
    <div className={c.header}>
      <div className={c.emblem}><Compass size={19} /></div>
      <div style={{ flex: "1 1 150px", minWidth: 0 }}>
        <div className={c.title}>Copiloto <span className={c.badge}>Processo de matrícula</span></div>
        <div className={c.muted}>{current ? `Próxima etapa: ${current.label}` : "Processo concluído"} · {completed}/{required.length} concluídas</div>
        {data.course && <div className={c.muted} title={data.course.fonte}><b>{data.course.name || "Curso"}</b> · {data.course.resumo}</div>}
      </div>
      {data.canManage && <IconButton size="small" title="Revisar e editar o processo da equipe" aria-label="Editar processo" onClick={() => setEditor(true)}><Settings2 size={17} /></IconButton>}
      <Button size="small" className={c.button} onClick={() => setOpen(v => !v)} endIcon={open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}>{open ? "Recolher" : "Abrir"}</Button>
      <Button variant="contained" size="small" className={c.primary} disabled={busy || !data.aiAvailable || !canSend} title={data.aiNote || "Escrever uma sugestão para a última mensagem"} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <Sparkles size={14} />} onClick={() => suggest()}>{busy ? "Aguarde…" : "Sugerir resposta"}</Button>
    </div>
    <LinearProgress variant="determinate" value={required.length ? completed / required.length * 100 : 0} style={{ height: 2 }} aria-label="Progresso até a matrícula" />
    {open && <div className={c.content}>
      <div className={c.foot} style={{ paddingBottom: 8 }}>
        <Button size="small" className={c.button} startIcon={<ListChecks size={14} />} onClick={() => setAllSteps(v => !v)}>{allSteps ? "Ocultar etapas" : "Ver todas as etapas"}</Button>
        <span className={c.muted} style={{ flex: 1 }}>{data.aiNote || (quota ? `Suas sugestões hoje: ${quota.used}${quota.limit ? ` de ${quota.limit}` : " (sem limite)"}` : "")}</span>
        <span className={c.badge}>Roteiro sem uso de IA</span>
      </div>
      {(b || data.briefAvailable) && <div className={c.brief} aria-label="Resumo do cliente feito pela IA">
        <div className={c.actions}>
          <span className={c.eyebrow} style={{ flex: 1 }}><History size={12} />Resumo do cliente (IA){brief && brief.conversations > 1 ? ` · ${brief.conversations} atendimentos` : ""}</span>
          {b && <IconButton size="small" className={`${c.thumb} ${brief.feedback === "util" ? c.thumbOn : ""}`} title="Resumo útil" aria-label="Resumo útil" onClick={() => rate(brief, setBrief, "util")}><ThumbsUp size={14} /></IconButton>}
          {b && <IconButton size="small" className={`${c.thumb} ${brief.feedback === "nao_util" ? c.thumbOn : ""}`} title="Resumo não ajudou" aria-label="Resumo não ajudou" onClick={() => rate(brief, setBrief, "nao_util")}><ThumbsDown size={14} /></IconButton>}
          {data.briefAvailable && <Button size="small" className={c.button} disabled={briefBusy} startIcon={briefBusy ? <CircularProgress size={12} color="inherit" /> : <Sparkles size={13} />} onClick={() => makeBrief(false)}>{b ? "Atualizar" : "Resumir histórico"}</Button>}
        </div>
        {b ? <>
          <div style={{ fontSize: 13, lineHeight: 1.55 }}>{b.resumo}</div>
          {b.interesse && <div className={c.muted}><b>Interesse:</b> {b.interesse}</div>}
          {b.pendencias && b.pendencias.length > 0 && <div><div className={c.muted}><b>Pendências</b></div><ul className={c.briefList}>{b.pendencias.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
          {b.objecoes && b.objecoes.length > 0 && <div><div className={c.muted}><b>Objeções</b></div><ul className={c.briefList}>{b.objecoes.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
          {b.proximoPasso && <div style={{ fontSize: 12 }}><b>Próximo passo:</b> {b.proximoPasso}</div>}
          {b.encaminhar && <div className={c.actions}>
            <span className={c.muted} style={{ flex: 1 }}>O assunto parece ser {b.encaminhar === "tutoria" ? "da tutoria" : "do consultor"}.</span>
            <Button size="small" variant="outlined" className={c.button} disabled={!canSend} onClick={() => window.dispatchEvent(new CustomEvent("teamHandoffOpen", { detail: { ticketId: ticket.id } }))}>{b.encaminhar === "tutoria" ? "Chamar a tutoria" : "Chamar o consultor"}</Button>
          </div>}
          {b.mensagemSugerida && <div className={c.actions}>
            <Button size="small" className={c.button} disabled={!canSend} title={canSend ? "Coloca a mensagem sugerida na caixa de texto para você revisar" : "Assuma a conversa para responder"} onClick={() => fill(b.mensagemSugerida)}>Usar mensagem sugerida</Button>
          </div>}
        </> : <div className={c.muted}>{briefBusy ? "Lendo o histórico do cliente…" : "Resumo do histórico completo do cliente, inclusive atendimentos anteriores, com o próximo passo."}</div>}
      </div>}
      {error && <div className={c.muted} role="status">O processo pode estar desatualizado. <Button size="small" onClick={reload}>Atualizar</Button></div>}
      <div className={allSteps ? c.layout : undefined}>
        {allSteps && <ol className={c.steps} aria-label="Etapas do processo">
          {steps.map((s, i) => <li key={s.key}><button type="button" aria-current={s.key === data.current ? "step" : undefined} aria-pressed={active && active.key === s.key} className={`${c.stepButton} ${active && active.key === s.key ? c.selected : ""}`} onClick={() => { setSelected(s.key); setSuggestion(null); }}>
            <span className={`${c.dot} ${s.done ? c.done : s.key === data.current ? c.current : ""}`}>{s.done ? <Check size={13} /> : i + 1}</span><span style={{ flex: 1 }}>{s.label}{s.optional && !s.done ? " (opcional)" : ""}</span>{s.key === "enroll" && <Flag size={12} />}
          </button></li>)}
        </ol>}
        {active && <div className={c.detail}>
          <div className={c.eyebrow}>{suggestion ? <Sparkles size={12} /> : <Compass size={12} />}{suggestion ? "Sugestão de IA · revise antes de enviar" : active.done ? "Etapa concluída" : "Orientação do gestor"}</div>
          <div className={c.title}>{active.label}</div>
          <div className={c.muted}>{active.instruction}</div>
          {!data.hasLead && <div className={c.muted}>Este contato ainda não tem lead no CRM. Vincule o cadastro para acompanhar proposta e matrícula. <a href="/crm">Abrir CRM</a></div>}
          {text && <div className={c.message}>{text}</div>}
          {suggestion && suggestion.sources && suggestion.sources.length > 0 && <div className={c.muted}><BookOpen size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />Baseado em: {suggestion.sources.join(" · ")}</div>}
          {suggestion && <div className={c.actions}>
            {[["regenerar", "Outra versão"], ["mais_curta", "Mais curta"], ["mais_formal", "Mais formal"], ["mais_calorosa", "Mais calorosa"]].map(([m, label]) =>
              <Button key={m} size="small" variant="outlined" className={c.chip} disabled={busy || !data.aiAvailable} onClick={() => suggest(m)}>{label}</Button>)}
            <span style={{ flex: 1 }} />
            <IconButton size="small" className={`${c.thumb} ${suggestion.feedback === "util" ? c.thumbOn : ""}`} title="Sugestão útil" aria-label="Sugestão útil" onClick={() => rate(suggestion, setSuggestion, "util")}><ThumbsUp size={14} /></IconButton>
            <IconButton size="small" className={`${c.thumb} ${suggestion.feedback === "nao_util" ? c.thumbOn : ""}`} title="Sugestão não ajudou" aria-label="Sugestão não ajudou" onClick={() => rate(suggestion, setSuggestion, "nao_util")}><ThumbsDown size={14} /></IconButton>
          </div>}
          <div className={c.actions}>
            {text && <Button size="small" className={c.primary} disabled={busy || !canSend} onClick={() => takeText(text, !!suggestion)}>Usar e editar mensagem</Button>}
            {/* only the manager's ready text goes out in one click: a text written by the AI is always reviewed in the message box first */}
            {text && !suggestion && <Button size="small" className={c.button} disabled={busy || !canSend} startIcon={<Send size={13} />} onClick={() => run(async () => { await api.post(`/messages/${ticket.id}`, { body: text }); })}>Enviar</Button>}
            {suggestion && <Button size="small" className={c.button} onClick={() => setSuggestion(null)}>Descartar</Button>}
            {!suggestion && next && next.action === "send_grade" && data.leadId && <Button size="small" className={c.button} startIcon={<FileText size={13} />} href="/grades">Abrir grades</Button>}
            {active.key === "enroll" && data.leadId && !active.done && <Button size="small" className={c.button} startIcon={<GraduationCap size={15} />} disabled={busy || !canSend} onClick={enrollment}>Registrar matrícula</Button>}
            {active.key !== "enroll" && <Button size="small" className={c.button} disabled={busy || !canSend && !data.canManage} startIcon={active.done ? <RotateCcw size={13} /> : <Check size={14} />} onClick={() => mark(!active.done)}>{active.done ? "Reabrir etapa" : "Concluir etapa"}</Button>}
            {active.manual && <Button size="small" className={c.button} disabled={busy || !canSend && !data.canManage} onClick={() => mark(null)}>Usar detecção automática</Button>}
          </div>
        </div>}
      </div>
      <div className={c.foot}>
        <Button size="small" className={c.button} onClick={summaryToggle}>{summaryOpen ? "Ocultar resumo" : "Resumo do atendimento"}</Button>
        <span className={c.muted}>Processo v{data.processVersion} · Você revisa e decide o que enviar.</span>
      </div>
      {summaryOpen && (summary ? (summary.lines || []).length ? <ul className={c.summary}>{summary.lines.map((line, i) => <li key={i}>{line}</li>)}</ul> : <div className={c.muted}>Ainda não há resumo do agente para esta conversa.</div> : <CircularProgress size={16} />)}
    </div>}
    <Dialog open={editor} onClose={() => setEditor(false)} fullWidth maxWidth="md" aria-labelledby="copilot-editor-title">
      <DialogTitle id="copilot-editor-title"><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>Processo da equipe<IconButton aria-label="Fechar editor" onClick={() => setEditor(false)}><X size={18} /></IconButton></div></DialogTitle>
      <DialogContent><CopilotSettings processOnly onSaved={() => { setEditor(false); reload(); }} /></DialogContent>
    </Dialog>
    {enrollLead && <EnrollDialog open lead={enrollLead} onClose={() => setEnrollLead(null)} onDone={() => { setEnrollLead(null); reload(); }} />}
  </section>;
}
