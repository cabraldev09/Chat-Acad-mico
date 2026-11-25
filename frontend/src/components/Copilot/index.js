import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Button, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, LinearProgress, makeStyles } from "@material-ui/core";
import { Check, ChevronDown, ChevronUp, Compass, Send, Settings2, Workflow, X, FileText, GraduationCap } from "lucide-react";
import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import EnrollDialog from "../../pages/CRM/EnrollDialog";
const ProposalStudio = lazy(() => import("../../pages/CRM/ProposalStudio"));
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
    position: "absolute", top: "100%", right: 12, width: "min(380px, calc(100% - 24px))", maxHeight: "min(70vh, 640px)", overflowY: "auto",
    padding: "12px 14px", display: "grid", gap: 10, alignContent: "start", background: "var(--surface-2, #f8fafc)", border: "1px solid var(--line-strong, #cbd5e1)",
    borderRadius: 12, boxShadow: "0 18px 40px -16px rgba(15,23,42,.45)", marginTop: 6, ...theme.scrollbarStyles,
    [theme.breakpoints.down("xs")]: { position: "fixed", top: "auto", bottom: 0, left: 0, right: 0, width: "100%", maxHeight: "65vh", borderRadius: "16px 16px 0 0", marginTop: 0, padding: "12px" }
  },
  steps: { padding: 0, margin: 0, listStyle: "none", display: "grid", gap: 2 },
  step: { borderRadius: 10, padding: "6px 8px", border: "1px solid transparent" },
  stepRow: { display: "flex", alignItems: "center", gap: 10, minHeight: 32 },
  stepLabel: { flex: 1, minWidth: 0, fontSize: 13, color: "var(--text-1, #0f172a)" },
  stepMore: { display: "grid", gap: 8, justifyItems: "start", padding: "4px 0 2px 38px" },
  selected: { background: "rgba(15,118,110,.08)", borderColor: "rgba(15,118,110,.35)", "& $stepLabel": { fontWeight: 700 } },
  dot: { width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--line-strong, #cbd5e1)", flexShrink: 0, display: "grid", placeItems: "center", fontSize: 11, background: "var(--surface, #fff)", color: "var(--text-2, #475569)", cursor: "pointer", font: "inherit", padding: 0, "&:disabled": { cursor: "default" }, "&:focus-visible": { outline: "2px solid #0f766e", outlineOffset: 2 } },
  done: { color: theme.palette.type === "dark" ? "#5eead4" : "#0f766e", background: "rgba(15,118,110,.12)", borderColor: "transparent" },
  current: { color: "#fff", background: "#0f766e", borderColor: "#0f766e" },
  lineButton: { flex: "1 1 160px", minWidth: 0, display: "flex", alignItems: "center", gap: 8, border: 0, background: "transparent", padding: "4px 2px", cursor: "pointer", font: "inherit", fontSize: 13, color: "var(--text-2, #475569)", textAlign: "left", "& b": { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, "&:focus-visible": { outline: "2px solid #0f766e", borderRadius: 6 } },
  count: { flex: "none", fontSize: 12, fontWeight: 700, padding: "1px 8px", borderRadius: 999, background: "rgba(15,118,110,.1)", color: theme.palette.type === "dark" ? "#5eead4" : "#0f766e" },
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
  // the conversation comes first: the list of steps starts closed and remembers the choice of the person (this browser)
  const [open, setOpenState] = useState(() => { try { return window.localStorage.getItem("copilot_open") === "1"; } catch (e) { return false; } });
  const setOpen = (fn) => setOpenState((v) => { const next = typeof fn === "function" ? fn(v) : fn; try { window.localStorage.setItem("copilot_open", next ? "1" : "0"); } catch (e) { /* private mode */ } return next; });
  const rootRef = useRef(null);
  // Esc or a click outside closes the floating list (a dialog opened from it does not count)
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
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState(false);
  const [enrollLead, setEnrollLead] = useState(null);
  // the proposal step opens the proposal studio of the lead (the step is done when a proposal is really sent)
  const [studio, setStudio] = useState(null);
  const alive = useRef(true);
  const requestSequence = useRef(0);
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
      clearTimeout(timer);
      timer = setTimeout(reload, 900);
    };
    const poll = setInterval(() => { if (!document.hidden) reload(); }, 60000);
    window.addEventListener("copilotRefresh", refresh);
    return () => { alive.current = false; clearInterval(poll); clearTimeout(timer); window.removeEventListener("copilotRefresh", refresh); };
  }, [ticket.id, show, reload]);
  useEffect(() => { if (show) reload(); }, [ticket.userId, ticket.aiActive, show, reload]);
  if (!show) return null;
  if (error && !data) return <div className={c.error}>Não foi possível carregar o processo.<Button size="small" onClick={reload}>Tentar novamente</Button></div>;
  if (!data || !data.enabled) return null;

  const steps = data.steps || [];
  const current = steps.find(s => s.key === data.current);
  const required = steps.filter(s => !s.optional);
  const completed = required.filter(s => s.done).length;
  const canSend = !!ticket.userId && !ticket.aiActive && ticket.status === "open";
  const gradeId = data.suggestion && data.suggestion.action === "send_grade" ? data.suggestion.gradeId : null;
  const run = async fn => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { toastError(e); }
    finally { if (alive.current) { setBusy(false); reload(); } }
  };
  // the AI writes the answer to the last message of the lead and it goes to the message box, to be read and edited before sending
  const suggest = () => run(async () => {
    const { data: result } = await api.post(`/tickets/${ticket.id}/suggest-reply`, {});
    if (!result.text) { toast.info(result.note || "Sem sugestão neste momento."); return; }
    window.dispatchEvent(new CustomEvent("fillMessageInput", { detail: { ticketId: ticket.id, text: result.text } }));
    if (result.id) api.put(`/tickets/${ticket.id}/copilot/requests/${result.id}/take`).catch(() => undefined);
    toast.info("Sugestão na caixa de mensagem. Revise antes de enviar.", { autoClose: 2500 });
  });
  // a step marked by hand (the enrollment only by the CRM); the next click gives it back to the automatic reading
  const toggle = s => run(async () => {
    const { data: result } = await api.put(`/tickets/${ticket.id}/copilot/progress`, { key: s.key, done: s.manual && s.done === true ? null : !s.done });
    if (alive.current) setData(result);
  });
  const openProposal = () => run(async () => {
    const [{ data: lead }, { data: options }] = await Promise.all([api.get(`/leads/${data.leadId}`), api.get("/crm/options").catch(() => ({ data: {} }))]);
    if (alive.current) setStudio({ lead, options });
  });
  const enrollment = () => run(async () => { const { data: lead } = await api.get(`/leads/${data.leadId}`); if (alive.current) setEnrollLead(lead); });
  const sendGrade = () => run(async () => { await api.post(`/grades/${gradeId}/send`, { ticketId: ticket.id, summary: false }); toast.success("Grade enviada."); });
  // the one shortcut of the step, only on the step it belongs to
  const shortcut = s => {
    if (!data.leadId || s.done) return null;
    if (s.key === "proposal") return <Button size="small" className={c.button} startIcon={<FileText size={14} />} disabled={busy} onClick={openProposal}>Abrir proposta</Button>;
    if (s.key === "enroll") return <Button size="small" className={c.button} startIcon={<GraduationCap size={14} />} disabled={busy || !canSend} onClick={enrollment}>Registrar matrícula</Button>;
    if (s.key === "grade" && gradeId) return <Button size="small" className={c.button} startIcon={<Send size={13} />} disabled={busy || !canSend} onClick={sendGrade}>Enviar a grade</Button>;
    return null;
  };

  return <section className={c.root} aria-label="Copiloto do consultor" ref={rootRef}>
    <div className={c.header}>
      <div className={c.emblem}><Compass size={15} /></div>
      <button type="button" className={c.lineButton} onClick={() => setOpen(v => !v)} aria-expanded={open} title="Ver as etapas">
        <b style={{ color: "var(--text-1, #0f172a)" }}>{current ? current.label : "Processo concluído"}</b>
        <span className={c.count}>{completed}/{required.length}</span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {data.canManage && <IconButton size="small" title="Editar o processo da equipe" aria-label="Editar processo" onClick={() => setEditor(true)}><Settings2 size={17} /></IconButton>}
      <Button variant="contained" size="small" className={c.primary} disabled={busy || !data.aiAvailable || !canSend} title={data.aiNote || (canSend ? "A IA escreve a resposta para a última mensagem" : "Assuma a conversa para responder")} aria-label="Sugerir resposta" startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <Workflow size={14} />} onClick={suggest}><span className={c.wide}>{busy ? "Aguarde…" : "Sugerir resposta"}</span></Button>
    </div>
    <LinearProgress variant="determinate" value={required.length ? completed / required.length * 100 : 0} style={{ height: 2 }} aria-label="Progresso até a matrícula" />
    {open && <div className={c.content}>
      {error && <div className={c.note} role="status"><span style={{ flex: 1 }}>O processo pode estar desatualizado.</span><Button size="small" className={c.button} onClick={reload}>Atualizar</Button></div>}
      {!data.hasLead && <div className={c.body2}>Este contato ainda não tem lead no CRM: as etapas de proposta e matrícula dependem dele.</div>}
      <ol className={c.steps} aria-label="Etapas do processo">
        {steps.map((s, i) => {
          const isCurrent = s.key === data.current;
          return <li key={s.key} className={`${c.step} ${isCurrent ? c.selected : ""}`} aria-current={isCurrent ? "step" : undefined}>
            <div className={c.stepRow}>
              <button type="button" className={`${c.dot} ${s.done ? c.done : isCurrent ? c.current : ""}`} disabled={busy || s.key === "enroll" || (!canSend && !data.canManage)}
                aria-label={s.key === "enroll" ? "A matrícula é registrada no CRM" : s.done ? `Desmarcar: ${s.label}` : `Marcar como feita: ${s.label}`} title={s.key === "enroll" ? "A matrícula é registrada no CRM" : s.done ? "Desmarcar" : "Marcar como feita"}
                onClick={() => toggle(s)}>{s.done ? <Check size={13} /> : i + 1}</button>
              <span className={c.stepLabel}>{s.label}</span>
            </div>
            {isCurrent && (s.instruction || shortcut(s)) && <div className={c.stepMore}>
              {s.instruction && <div className={c.muted}>{s.instruction}</div>}
              {shortcut(s)}
            </div>}
          </li>;
        })}
      </ol>
    </div>}
    <Dialog open={editor} onClose={() => setEditor(false)} fullWidth maxWidth="md" aria-labelledby="copilot-editor-title">
      <DialogTitle id="copilot-editor-title"><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>Processo da equipe<IconButton aria-label="Fechar editor" onClick={() => setEditor(false)}><X size={18} /></IconButton></div></DialogTitle>
      <DialogContent><CopilotSettings processOnly onSaved={() => { setEditor(false); reload(); }} /></DialogContent>
    </Dialog>
    {enrollLead && <EnrollDialog open lead={enrollLead} onClose={() => setEnrollLead(null)} onDone={() => { setEnrollLead(null); reload(); }} />}
    {studio && (
      <Suspense fallback={null}>
        <ProposalStudio lead={studio.lead} ctx={{ options: studio.options }} onSaved={() => reload()} onClose={() => { setStudio(null); reload(); }} />
      </Suspense>
    )}
  </section>;
}
