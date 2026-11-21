import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, LinearProgress, makeStyles } from "@material-ui/core";
import { Check, ChevronDown, ChevronUp, Compass, Flag, ListChecks, Send, Settings2, Sparkles, X, FileText, GraduationCap, RotateCcw, ThumbsUp, ThumbsDown, BookOpen, History } from "lucide-react";
import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import EnrollDialog from "../../pages/CRM/EnrollDialog";
import CopilotSettings from "./Settings";

const useStyles = makeStyles(theme => ({
  root: { flex: "none", minWidth: 0, position: "relative", zIndex: 5, color: theme.palette.text.primary, background: theme.palette.background.paper, borderBottom: "2px solid var(--line-strong, #cbd5e1)" },
  header: { display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", minHeight: 44, flexWrap: "wrap", [theme.breakpoints.down("xs")]: { flexWrap: "nowrap", padding: "5px 8px" }, background: "var(--surface-2, #f8fafc)", borderBottom: "1px solid var(--line, #e2e8f0)" },
  emblem: { display: "grid", placeItems: "center", width: 26, height: 26, borderRadius: 8, flexShrink: 0, color: theme.palette.type === "dark" ? "#5eead4" : "#0f766e", background: "rgba(15,118,110,.1)" },
  title: { fontSize: 14, fontWeight: 700, lineHeight: 1.4 },
  muted: { fontSize: 12.5, color: "var(--text-2, #475569)", lineHeight: 1.5 },
  body: { fontSize: 13.5, lineHeight: 1.55, color: "var(--text-1, #0f172a)" },
  body2: { fontSize: 13, lineHeight: 1.5, color: "var(--text-1, #0f172a)", opacity: 0.85 },
  note: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", marginBottom: 10, borderRadius: 10, fontSize: 13, color: "var(--text-1, #0f172a)", background: "rgba(217,119,6,.10)", border: "1px solid rgba(217,119,6,.35)" },
  link: { textTransform: "none", fontSize: 12.5, fontWeight: 600, color: theme.palette.type === "dark" ? "#5eead4" : "#0f766e", padding: "2px 6px", minHeight: 0 },
  badge: { display: "inline-flex", whiteSpace: "nowrap", borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 700, background: "var(--surface, #fff)", color: "var(--text-1, #0f172a)", border: "1px solid var(--line-strong, #cbd5e1)" },
  primary: { background: "#0f766e", color: "#fff", borderRadius: 9, textTransform: "none", fontWeight: 600, boxShadow: "none", "&:hover": { background: "#115e59", boxShadow: "none" } },
  button: { textTransform: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "var(--text-1, #0f172a)", border: "1px solid var(--line-strong, #cbd5e1)", background: "var(--surface, #fff)", padding: "3px 10px", "&:hover": { background: "var(--surface-2, #f1f5f9)" } },
  wide: { [theme.breakpoints.down("xs")]: { display: "none !important" } },
  line: { fontSize: 13, lineHeight: 1.4, color: "var(--text-2, #475569)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  // open, the copilot floats over the conversation (the messages never move): a panel on the right; on the phone a sheet from the bottom
  content: {
    position: "absolute", top: "100%", right: 12, width: "min(460px, calc(100% - 24px))", maxHeight: "min(70vh, 640px)", overflowY: "auto",
    padding: "12px 14px", display: "grid", gap: 10, alignContent: "start", background: "var(--surface-2, #f8fafc)", border: "1px solid var(--line-strong, #cbd5e1)",
    borderRadius: 12, boxShadow: "0 18px 40px -16px rgba(15,23,42,.45)", marginTop: 6, ...theme.scrollbarStyles,
    [theme.breakpoints.down("xs")]: { position: "fixed", top: "auto", bottom: 0, left: 0, right: 0, width: "100%", maxHeight: "65vh", borderRadius: "16px 16px 0 0", marginTop: 0, padding: "12px" }
  },
  layout: { display: "grid", gridTemplateColumns: "minmax(180px, .85fr) minmax(240px, 1.6fr)", gap: 14, alignItems: "start", [theme.breakpoints.down("sm")]: { display: "flex", flexDirection: "column", alignItems: "stretch" } },
  steps: { padding: 0, margin: 0, listStyle: "none", display: "grid", gap: 2, [theme.breakpoints.down("sm")]: { order: 1, maxHeight: 160, overflowY: "auto" } },
  stepButton: { width: "100%", border: "1px solid transparent", borderRadius: 9, background: "transparent", color: "var(--text-2, #475569)", padding: "7px 9px", display: "flex", alignItems: "center", gap: 9, textAlign: "left", cursor: "pointer", font: "inherit", fontSize: 12, "&:hover": { background: theme.palette.action.hover }, "&:focus-visible": { outline: "2px solid #0f766e" } },
  selected: { background: "rgba(15,118,110,.12)", borderColor: "rgba(15,118,110,.45)", color: "var(--text-1, #0f172a)", fontWeight: 700 },
  dot: { width: 23, height: 23, borderRadius: "50%", border: "1px solid var(--line-strong, #cbd5e1)", flexShrink: 0, display: "grid", placeItems: "center", fontSize: 10 },
  done: { color: theme.palette.type === "dark" ? "#5eead4" : "#0f766e", background: "rgba(15,118,110,.1)", borderColor: "transparent" },
  current: { color: "#fff", background: "#0f766e", borderColor: "#0f766e" },
  detail: { display: "grid", gap: 10, [theme.breakpoints.down("sm")]: { order: 0 }, border: "1px solid var(--line-strong, #cbd5e1)", borderRadius: 12, padding: 14, background: "var(--surface, #fff)", boxShadow: "var(--shadow-card, none)" },
  eyebrow: { fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 700, color: theme.palette.type === "dark" ? "#5eead4" : "#0f766e", display: "flex", alignItems: "center", gap: 6 },
  message: { fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.6, padding: 12, background: "var(--surface-2, #f8fafc)", border: "1px solid var(--line, #e2e8f0)", borderLeft: "3px solid #0f766e", borderRadius: 9, color: "var(--text-1, #0f172a)" },
  actions: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
  foot: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, paddingTop: 8 },
  summary: { padding: "8px 0 0 18px", margin: 0, fontSize: 12, lineHeight: 1.6 },
  brief: { display: "grid", gap: 8, border: "1px solid var(--line, #e2e8f0)", borderRadius: 12, padding: 14, background: "var(--surface, #fff)" },
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
  // the conversation comes first: the panel starts closed and remembers the choice of the person (this browser)
  const [open, setOpenState] = useState(() => { try { return window.localStorage.getItem("copilot_open") === "1"; } catch (e) { return false; } });
  const setOpen = (fn) => setOpenState((v) => { const next = typeof fn === "function" ? fn(v) : fn; try { window.localStorage.setItem("copilot_open", next ? "1" : "0"); } catch (e) { /* private mode */ } return next; });
  const rootRef = useRef(null);
  // Esc or a click outside closes the floating panel (a dialog opened from it does not count)
  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => { if (e.key === "Escape") setOpen(false); };
    const click = (e) => {
      if (rootRef.current && rootRef.current.contains(e.target)) return;
      if (e.target && e.target.closest && e.target.closest(".MuiDialog-root, .MuiPopover-root, .MuiMenu-paper")) return;
      setOpen(false);
    };
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", click);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", click); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [situationOpen, setSituationOpen] = useState(false);
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
  // the ready text goes as short messages, one idea each (never a wall of text); the grade step sends the grade right after its line
  const sendReady = async value => {
    const parts = String(value || "").split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    for (const body of parts) await api.post(`/messages/${ticket.id}`, { body });
    if (next && next.action === "send_grade" && next.gradeId) await api.post(`/grades/${next.gradeId}/send`, { ticketId: ticket.id, summary: false });
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
  return <section className={c.root} aria-label="Copiloto do consultor" ref={rootRef}>
    <div className={c.header}>
      <div className={c.emblem}><Compass size={15} /></div>
      {/* one line: the step, the progress and the course; the details open below, inside a box with its own scroll */}
      <div style={{ flex: "1 1 160px", minWidth: 0 }} className={c.line} title={data.course ? `${data.course.name || "Curso"}: ${data.course.resumo}` : undefined}>
        <b style={{ color: "var(--text-1, #0f172a)" }}>Copiloto</b> · {current ? current.label : "Processo concluído"} · {completed}/{required.length}
        {data.course && <span> · {data.course.name || "Curso"} ({data.course.formato || data.course.resumo})</span>}
      </div>
      {data.canManage && <IconButton size="small" title="Revisar e editar o processo da equipe" aria-label="Editar processo" onClick={() => setEditor(true)}><Settings2 size={17} /></IconButton>}
      {/* the main thing without opening: use or send the ready text of the step */}
      {!open && next && next.text && !suggestion && <>
        <Button size="small" className={`${c.button} ${c.wide}`} disabled={busy || !canSend} title={next.text} onClick={() => takeText(next.text, false)}>Usar</Button>
        <Button size="small" className={`${c.button} ${c.wide}`} disabled={busy || !canSend} startIcon={<Send size={13} />} title={next.text} onClick={() => run(() => sendReady(next.text))}>{next.action === "send_grade" && next.gradeId ? "Enviar com a grade" : "Enviar"}</Button>
      </>}
      <Button size="small" className={c.button} onClick={() => setOpen(v => !v)} aria-expanded={open} endIcon={open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}>{open ? "Fechar" : "Etapa"}</Button>
      <Button variant="contained" size="small" className={c.primary} disabled={busy || !data.aiAvailable || !canSend} title={data.aiNote || "Escrever uma sugestão para a última mensagem"} aria-label="Sugerir resposta" startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <Sparkles size={14} />} onClick={() => suggest()}><span className={c.wide}>{busy ? "Aguarde…" : "Sugerir resposta"}</span></Button>
    </div>
    <LinearProgress variant="determinate" value={required.length ? completed / required.length * 100 : 0} style={{ height: 2 }} aria-label="Progresso até a matrícula" />
    {open && <div className={c.content}>
      {!data.aiAvailable && data.aiNote && <div className={c.note} role="status">
        <Sparkles size={14} /><span style={{ flex: 1 }}>{data.aiNote}</span>
        {data.canManage && <Button size="small" className={c.button} href="/configuracoes?secao=prontidao">Resolver</Button>}
      </div>}
      {error && <div className={c.note} role="status"><span style={{ flex: 1 }}>O processo pode estar desatualizado.</span><Button size="small" className={c.button} onClick={reload}>Atualizar</Button></div>}

      {/* 1. what to say now: the step of the process, the ready text (or the AI suggestion) and the actions */}
      <div className={allSteps ? c.layout : undefined}>
        {allSteps && <ol className={c.steps} aria-label="Etapas do processo">
          {steps.map((s, i) => <li key={s.key}><button type="button" aria-current={s.key === data.current ? "step" : undefined} aria-pressed={active && active.key === s.key} className={`${c.stepButton} ${active && active.key === s.key ? c.selected : ""}`} onClick={() => { setSelected(s.key); setSuggestion(null); }}>
            <span className={`${c.dot} ${s.done ? c.done : s.key === data.current ? c.current : ""}`}>{s.done ? <Check size={13} /> : i + 1}</span><span style={{ flex: 1 }}>{s.label}{s.optional && !s.done ? " (opcional)" : ""}</span>{s.key === "enroll" && <Flag size={12} />}
          </button></li>)}
        </ol>}
        {active && <div className={c.detail} aria-label="Próxima mensagem">
          <div className={c.actions}>
            <span className={c.eyebrow} style={{ flex: 1 }}>{suggestion ? <Sparkles size={12} /> : <Compass size={12} />}{suggestion ? "Sugestão da IA · revise antes de enviar" : active.done ? "Etapa concluída" : "Próxima mensagem"}</span>
            <Button size="small" className={c.link} startIcon={<ListChecks size={14} />} onClick={() => setAllSteps(v => !v)}>{allSteps ? "Ocultar etapas" : `Etapas ${completed}/${required.length}`}</Button>
          </div>
          <div className={c.title}>{active.label}</div>
          {active.instruction && <div className={c.body2}>{active.instruction}</div>}
          {!data.hasLead && <div className={c.body2}>Este contato ainda não tem lead no CRM. Vincule o cadastro para acompanhar proposta e matrícula. <a href="/crm">Abrir CRM</a></div>}
          {text && <div className={c.message}>{text}</div>}
          {suggestion && suggestion.sources && suggestion.sources.length > 0 && <div className={c.body2}><BookOpen size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />Baseado em: {suggestion.sources.join(" · ")}</div>}
          {suggestion && <div className={c.actions}>
            {[["regenerar", "Outra versão"], ["mais_curta", "Mais curta"], ["mais_formal", "Mais formal"], ["mais_calorosa", "Mais calorosa"]].map(([m, label]) =>
              <Button key={m} size="small" variant="outlined" className={c.chip} disabled={busy || !data.aiAvailable} onClick={() => suggest(m)}>{label}</Button>)}
            <span style={{ flex: 1 }} />
            <IconButton size="small" className={`${c.thumb} ${suggestion.feedback === "util" ? c.thumbOn : ""}`} title="Sugestão útil" aria-label="Sugestão útil" onClick={() => rate(suggestion, setSuggestion, "util")}><ThumbsUp size={14} /></IconButton>
            <IconButton size="small" className={`${c.thumb} ${suggestion.feedback === "nao_util" ? c.thumbOn : ""}`} title="Sugestão não ajudou" aria-label="Sugestão não ajudou" onClick={() => rate(suggestion, setSuggestion, "nao_util")}><ThumbsDown size={14} /></IconButton>
          </div>}
          <div className={c.actions}>
            {text && <Button size="small" className={c.primary} disabled={busy || !canSend} onClick={() => takeText(text, !!suggestion)}>Usar e editar</Button>}
            {/* only the manager's ready text goes out in one click: a text written by the AI is always reviewed in the message box first */}
            {text && !suggestion && <Button size="small" className={c.button} disabled={busy || !canSend} startIcon={<Send size={13} />} onClick={() => run(() => sendReady(text))}>{next && next.action === "send_grade" && next.gradeId ? "Enviar com a grade" : "Enviar"}</Button>}
            {suggestion && <Button size="small" className={c.button} onClick={() => setSuggestion(null)}>Descartar</Button>}
            {!suggestion && next && next.action === "send_grade" && data.leadId && <Button size="small" className={c.button} startIcon={<FileText size={13} />} href="/grades">Abrir grades</Button>}
            {active.key === "enroll" && data.leadId && !active.done && <Button size="small" className={c.button} startIcon={<GraduationCap size={15} />} disabled={busy || !canSend} onClick={enrollment}>Registrar matrícula</Button>}
            {active.key !== "enroll" && <Button size="small" className={c.button} disabled={busy || !canSend && !data.canManage} startIcon={active.done ? <RotateCcw size={13} /> : <Check size={14} />} onClick={() => mark(!active.done)}>{active.done ? "Reabrir etapa" : "Concluir etapa"}</Button>}
            {active.manual && <Button size="small" className={c.button} disabled={busy || !canSend && !data.canManage} onClick={() => mark(null)}>Usar detecção automática</Button>}
          </div>
        </div>}
      </div>

      {/* 2. who the lead is: the CRM situation, the summary of the AI and the summary of this conversation, in one card */}
      {(data.situation || b || data.briefAvailable) && <div className={c.brief} aria-label="Situação do lead">
        <div className={c.actions} role="button" tabIndex={0} aria-expanded={situationOpen} style={{ cursor: "pointer" }} onClick={() => setSituationOpen(v => !v)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSituationOpen(v => !v); } }}>
          <span className={c.eyebrow} style={{ flex: 1 }}>{situationOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}<History size={12} />Situação do lead{brief && brief.conversations > 1 ? ` · ${brief.conversations} atendimentos` : ""}</span>
          {data.situation && data.situation.stage && <span className={c.badge} style={data.situation.stageColor ? { borderColor: data.situation.stageColor } : undefined}>{data.situation.stage}</span>}
          {data.situation && data.situation.temperature && <span className={c.badge}>{{ cold: "Frio", warm: "Morno", hot: "Quente" }[data.situation.temperature] || data.situation.temperature}</span>}
        </div>
        {situationOpen && <>
        {b ? <div className={c.body}>{b.resumo}</div> : data.situation && data.situation.summary ? <div className={c.body}>{data.situation.summary}</div> : null}
        {((b && b.proximoPasso) || (data.situation && data.situation.nextAction)) && <div className={c.body2}><b>Próximo passo:</b> {(b && b.proximoPasso) || data.situation.nextAction}</div>}
        {b && b.interesse && <div className={c.body2}><b>Interesse:</b> {b.interesse}</div>}
        {b && b.pendencias && b.pendencias.length > 0 && <div className={c.body2}><b>Pendências:</b> {b.pendencias.join("; ")}</div>}
        {b && b.objecoes && b.objecoes.length > 0 && <div className={c.body2}><b>Objeções:</b> {b.objecoes.join("; ")}</div>}
        {b && b.encaminhar && <div className={c.actions}>
          <span className={c.body2} style={{ flex: 1 }}>O assunto parece ser {b.encaminhar === "tutoria" ? "da tutoria" : "do consultor"}.</span>
          <Button size="small" variant="outlined" className={c.button} disabled={!canSend} onClick={() => window.dispatchEvent(new CustomEvent("teamHandoffOpen", { detail: { ticketId: ticket.id } }))}>{b.encaminhar === "tutoria" ? "Chamar a tutoria" : "Chamar o consultor"}</Button>
        </div>}
        <div className={c.actions}>
          {data.briefAvailable && <Button size="small" className={c.button} disabled={briefBusy} startIcon={briefBusy ? <CircularProgress size={12} color="inherit" /> : <Sparkles size={13} />} onClick={() => makeBrief(false)}>{b ? "Atualizar resumo" : "Resumir histórico"}</Button>}
          {b && b.mensagemSugerida && <Button size="small" className={c.button} disabled={!canSend} title={canSend ? "Coloca a mensagem sugerida na caixa de texto para você revisar" : "Assuma a conversa para responder"} onClick={() => fill(b.mensagemSugerida)}>Usar mensagem sugerida</Button>}
          <Button size="small" className={c.link} onClick={summaryToggle}>{summaryOpen ? "Ocultar o que o agente anotou" : "O que o agente anotou"}</Button>
          <span style={{ flex: 1 }} />
          {b && <IconButton size="small" className={`${c.thumb} ${brief.feedback === "util" ? c.thumbOn : ""}`} title="Resumo útil" aria-label="Resumo útil" onClick={() => rate(brief, setBrief, "util")}><ThumbsUp size={14} /></IconButton>}
          {b && <IconButton size="small" className={`${c.thumb} ${brief.feedback === "nao_util" ? c.thumbOn : ""}`} title="Resumo não ajudou" aria-label="Resumo não ajudou" onClick={() => rate(brief, setBrief, "nao_util")}><ThumbsDown size={14} /></IconButton>}
        </div>
        {briefBusy && !b && <div className={c.body2}>Lendo o histórico do cliente…</div>}
        {summaryOpen && (summary ? (summary.lines || []).length ? <ul className={c.summary}>{summary.lines.map((line, i) => <li key={i}>{line}</li>)}</ul> : <div className={c.body2}>Ainda não há anotações do agente para esta conversa.</div> : <CircularProgress size={16} />)}
        </>}
      </div>}
      {quota && data.aiAvailable && <div className={c.body2} style={{ textAlign: "right" }}>{`Sugestões da IA hoje: ${quota.used}${quota.limit ? ` de ${quota.limit}` : ""}`}</div>}
    </div>}
    <Dialog open={editor} onClose={() => setEditor(false)} fullWidth maxWidth="md" aria-labelledby="copilot-editor-title">
      <DialogTitle id="copilot-editor-title"><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>Processo da equipe<IconButton aria-label="Fechar editor" onClick={() => setEditor(false)}><X size={18} /></IconButton></div></DialogTitle>
      <DialogContent><CopilotSettings processOnly onSaved={() => { setEditor(false); reload(); }} /></DialogContent>
    </Dialog>
    {enrollLead && <EnrollDialog open lead={enrollLead} onClose={() => setEnrollLead(null)} onDone={() => { setEnrollLead(null); reload(); }} />}
  </section>;
}
