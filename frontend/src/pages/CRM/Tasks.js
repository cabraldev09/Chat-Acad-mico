import React, { useCallback, useEffect, useRef, useState } from "react";
import { Paper, Checkbox, makeStyles, FormControlLabel, Switch, Menu, MenuItem } from "@material-ui/core";
import { useHistory, useLocation } from "react-router-dom";
import { ArrowLeft, MessageCircle, Clock, UserCheck, ExternalLink, AlertTriangle } from "lucide-react";
import { toast } from "react-toastify";
import { format, parseISO } from "date-fns";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import { ErrorState } from "../../components/ui";
import api from "../../services/api";
import openSocket from "../../services/socket-io";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { isOverdue, StagePill } from "./shared";
import { fetchAllUsers } from "../../utils/fetchAllUsers";
import { isManager } from "../../utils/access";

// Tarefas de acompanhamento: the next contacts combined with each lead. Urgent ones first, each row with what to do right away (open the
// conversation, reschedule, hand to someone, conclude). The automatic tasks close by themselves when what they ask for happens.
const useStyles = makeStyles((theme) => ({
  tabs: { display: "flex", gap: 4, overflowX: "auto", padding: 4, scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } },
  tab: {
    flex: "none", border: 0, borderRadius: 8, padding: "8px 14px", font: "inherit", fontSize: 13.5, cursor: "pointer", background: "transparent", color: "inherit",
    display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
  },
  tabOn: { background: "var(--surface-2, rgba(11,66,121,.08))", fontWeight: 700 },
  count: { minWidth: 20, height: 20, borderRadius: 99, padding: "0 6px", fontSize: 11.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--line, #e5e7eb)" },
  countLate: { background: "#dc2626", color: "#fff" },
  list: { flex: 1, overflowY: "auto", overflowX: "hidden", marginTop: theme.spacing(1), ...theme.scrollbarStyles },
  row: {
    display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto auto", alignItems: "center", gap: theme.spacing(1.5), padding: theme.spacing(1.25, 1.5),
    borderBottom: theme.border.divider, "&:hover": { background: theme.palette.action.hover },
    [theme.breakpoints.down("sm")]: { gridTemplateColumns: "auto minmax(0,1fr)", gap: theme.spacing(1) },
  },
  due: { fontSize: 13, textAlign: "right", whiteSpace: "nowrap", [theme.breakpoints.down("sm")]: { gridColumn: "2", textAlign: "left" } },
  actions: { display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap", [theme.breakpoints.down("sm")]: { gridColumn: "1 / -1", justifyContent: "flex-start", paddingLeft: 42 } },
  action: {
    display: "inline-flex", alignItems: "center", gap: 5, height: 30, boxSizing: "border-box", border: "1px solid var(--line-strong, rgba(148,163,184,.5))", borderRadius: 8,
    background: "var(--surface, transparent)", color: "inherit", padding: "0 10px", font: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  },
  chip: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, padding: "1px 8px", borderRadius: 99 },
  empty: { padding: 40, textAlign: "center", color: "var(--text-2, #64748b)", fontSize: 14 },
}));

const TYPES = { ligar: "Ligar", whatsapp: "WhatsApp", email: "E-mail", visita: "Visita", proposta: "Proposta", documentos: "Documentos", outro: "Outro" };
const TABS = [["overdue", "Atrasadas"], ["today", "Hoje"], ["upcoming", "Próximos"], ["open", "Todas abertas"], ["done", "Concluídas"]];
const EMPTY = {
  overdue: "Nenhuma tarefa atrasada. Bom trabalho.",
  today: "Nada mais vence hoje.",
  upcoming: "Nenhuma tarefa marcada para os próximos dias.",
  open: "Tudo em dia por aqui. Agende o próximo contato direto na ficha do lead.",
  done: "Nenhuma tarefa concluída ainda.",
};
// why the system closed a task by itself
const CLOSED = {
  replied: "fechada sozinha: o lead foi respondido",
  transcript_received: "fechada sozinha: o histórico chegou",
  paid: "fechada sozinha: a taxa foi paga",
  onboarding_done: "fechada sozinha: ambientação concluída",
  lead_won: "fechada sozinha: lead matriculado",
  lead_lost: "fechada sozinha: lead perdido",
};
const phoneOf = (p) => {
  const d = String(p || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : p || "";
};
const tomorrowAt9 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; };
const localInput = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };

const Tasks = () => {
  const classes = useStyles();
  const history = useHistory();
  const { user } = React.useContext(AuthContext);
  const manager = isManager(user);
  const location = useLocation();
  // the management center links here ("tarefas atrasadas do Helton"): scope, status and person come from the address
  const query = new URLSearchParams(location.search);
  // userId=0 is "nobody in charge": the tasks of someone who cannot work them, waiting for the management to hand them out
  const rawPerson = query.get("userId");
  const personId = rawPerson === "0" ? 0 : Number(rawPerson) || null;
  const initial = TABS.findIndex(([k]) => k === query.get("status"));
  const [tab, setTab] = useState(initial >= 0 ? initial : 3);
  // a task ticked here stays in its place, struck through, until the list is opened again (it is registered in "Concluídas" at once)
  const [ticked, setTicked] = useState({});
  const [all, setAll] = useState(manager && (query.get("scope") === "all" || personId !== null));
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  const [counts, setCounts] = useState(null);
  const [onlyPerson, setOnlyPerson] = useState(personId);
  const [team, setTeam] = useState([]);
  const [menu, setMenu] = useState(null); // { anchor, task, kind: "when" | "who" }
  const pick = useRef(null);
  useEffect(() => { if (manager) fetchAllUsers().then((list) => setTeam(list || [])).catch(() => undefined); }, [manager]);

  const params = useCallback(() => ({ scope: all ? "all" : "mine", userId: onlyPerson === null ? undefined : onlyPerson }), [all, onlyPerson]);
  const loadCounts = useCallback(() => {
    api.get("/lead-tasks/counts", { params: params() }).then(({ data }) => setCounts(data)).catch(() => undefined);
  }, [params]);
  const load = useCallback(() => {
    setFailed(false);
    api.get("/lead-tasks", { params: { status: TABS[tab][0], ...params() } })
      .then(({ data }) => { setRows(data); setTicked({}); })
      .catch(() => setFailed(true));
    loadCounts();
  }, [tab, params, loadCounts]);
  useEffect(() => { setRows(null); load(); }, [load]);
  // a task of mine changed elsewhere (given to me, closed by the system, moved by the sweep): the list follows
  useEffect(() => {
    const socket = openSocket();
    let timer;
    const again = () => { clearTimeout(timer); timer = setTimeout(load, 600); };
    socket.on("taskChanged", again);
    socket.on("taskAssigned", again);
    const onChange = (e) => { if (e && e.detail && e.detail.remote) again(); };
    window.addEventListener("tasks:changed", onChange);
    return () => { clearTimeout(timer); socket.disconnect(); window.removeEventListener("tasks:changed", onChange); };
  }, [load]);

  const list = rows || [];
  const shown = onlyPerson === null ? list : onlyPerson === 0 ? list.filter((t) => !t.user) : list.filter((t) => t.user && t.user.id === onlyPerson);
  const personName = onlyPerson ? ((list.find((t) => t.user && t.user.id === onlyPerson) || {}).user || {}).name : "";
  const changed = () => { load(); try { window.dispatchEvent(new Event("tasks:changed")); } catch (e) { /* old browser */ } };

  const assign = async (t, userId) => {
    setMenu(null);
    try { await api.put(`/leads/${t.leadId}/tasks/${t.id}`, { userId: userId ? Number(userId) : null }); toast.success("Tarefa passada.", { autoClose: 2500 }); changed(); } catch (err) { toastError(err); }
  };
  const reschedule = async (t, when) => {
    setMenu(null);
    if (!when || Number.isNaN(new Date(when).getTime())) return;
    try { await api.put(`/leads/${t.leadId}/tasks/${t.id}`, { dueAt: new Date(when).toISOString() }); toast.success(`Remarcada para ${format(new Date(when), "dd/MM HH:mm")}.`, { autoClose: 2500 }); changed(); } catch (err) { toastError(err); }
  };

  const isDone = (t) => (ticked[t.id] !== undefined ? ticked[t.id] : !!t.doneAt);
  const toggle = async (t) => {
    const now = !isDone(t);
    setTicked((cur) => ({ ...cur, [t.id]: now }));
    try {
      // says which one it is: a task the system closed a moment ago is not reopened by this click
      await api.put(`/leads/${t.leadId}/tasks/${t.id}/done`, { done: now });
      toast.success(now ? "Tarefa concluída. Ela fica registrada em Concluídas." : "Tarefa reaberta.", { autoClose: 3500, toastId: `task-${t.id}-${now}` });
      loadCounts();
      try { window.dispatchEvent(new Event("tasks:changed")); } catch (e) { /* old browser */ }
    } catch (err) {
      setTicked((cur) => ({ ...cur, [t.id]: !now }));
      toastError(err);
    }
  };
  const openChat = (t) => history.push(t.ticketId ? `/tickets/${t.ticketId}` : `/crm?lead=${t.leadId}`);

  const countOf = (key) => (counts && key !== "done" ? counts[key] : null);
  return (
    <MainContainer>
      <MainHeader>
        <button type="button" onClick={() => (history.length > 1 ? history.goBack() : history.push(manager ? "/gestao-comercial" : "/tickets"))} aria-label="Voltar" style={{ display: "inline-flex", alignItems: "center", gap: 6, border: 0, background: "transparent", color: "inherit", cursor: "pointer", fontFamily: "inherit", fontSize: 14, padding: "6px 8px 6px 0" }}><ArrowLeft size={18} />Voltar</button>
        <Title>Tarefas de acompanhamento</Title>
        {manager && (
          <MainHeaderButtonsWrapper>
            <FormControlLabel control={<Switch color="primary" checked={all} onChange={(e) => setAll(e.target.checked)} />} label="Mostrar de todos" />
          </MainHeaderButtonsWrapper>
        )}
      </MainHeader>
      <Paper variant="outlined" style={{ marginBottom: 8 }}>
        <div className={classes.tabs} role="tablist" aria-label="Situação das tarefas">
          {TABS.map(([k, l], i) => {
            const n = countOf(k);
            return (
              <button key={k} type="button" role="tab" aria-selected={tab === i} className={`${classes.tab} ${tab === i ? classes.tabOn : ""}`} onClick={() => setTab(i)}>
                {l}{n !== null && n !== undefined && <span className={`${classes.count} ${k === "overdue" && n > 0 ? classes.countLate : ""}`}>{n}</span>}
              </button>
            );
          })}
        </div>
      </Paper>
      {onlyPerson !== null && (
        <Paper variant="outlined" style={{ marginBottom: 8, padding: "8px 14px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 14 }}>{onlyPerson === 0 ? <>Mostrando as tarefas <b>sem responsável</b>. Escolha quem assume cada uma em "Passar para".</> : <>Mostrando só as tarefas de <b>{personName || "esta pessoa"}</b>.</>}</span>
          <span style={{ flex: 1 }} />
          <button type="button" className={classes.action} onClick={() => setOnlyPerson(null)}>Mostrar de todos</button>
        </Paper>
      )}
      <Paper variant="outlined" className={classes.list}>
        {failed ? <ErrorState title="Não foi possível carregar as tarefas" text="Confira a conexão e tente de novo." onRetry={load} compact /> : rows === null ? (
          <div className={classes.empty}>Carregando as tarefas...</div>
        ) : shown.length === 0 ? (
          <div className={classes.empty}>{EMPTY[TABS[tab][0]]}</div>
        ) : shown.map((t) => {
          const done = isDone(t);
          const late = !done && isOverdue(t.dueAt);
          return (
            <div key={t.id} className={classes.row}>
              <Checkbox color="primary" checked={done} onChange={() => toggle(t)} inputProps={{ "aria-label": done ? "Reabrir a tarefa" : "Concluir a tarefa" }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {t.priority === "high" && !done && <span className={classes.chip} style={{ background: "rgba(220,38,38,.12)", color: "#b91c1c" }}><AlertTriangle size={12} /> Urgente</span>}
                  <span style={{ overflowWrap: "anywhere" }}>{t.title}</span>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-2, #64748b)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 2 }}>
                  <span style={{ fontWeight: 600, color: "var(--text-1, inherit)" }}>{t.lead ? t.lead.name : ""}</span>
                  {t.lead && t.lead.stage ? <StagePill stage={t.lead.stage} size="sm" /> : null}
                  {t.lead && t.lead.phone ? <span>{phoneOf(t.lead.phone)}</span> : null}
                  <span>{TYPES[t.type] || t.type}</span>
                  {all && <span>{t.user ? t.user.name : "Sem responsável"}</span>}
                  {done && t.closedReason && CLOSED[t.closedReason] ? <span>{CLOSED[t.closedReason]}</span> : null}
                </div>
              </div>
              <span className={classes.due} style={{ color: late ? "#dc2626" : undefined, fontWeight: late ? 700 : 400 }}>
                {done && t.doneAt ? `Concluída ${format(parseISO(t.doneAt), "dd/MM HH:mm")}${t.doneBy ? ` por ${t.doneBy.name.split(" ")[0]}` : ""}` : `${late ? "Venceu " : ""}${format(parseISO(t.dueAt), "dd/MM HH:mm")}`}
              </span>
              <div className={classes.actions}>
                <button type="button" className={classes.action} onClick={() => openChat(t)}><MessageCircle size={14} /> {t.ticketId ? "Abrir conversa" : "Abrir lead"}</button>
                {!done && <button type="button" className={classes.action} onClick={(e) => setMenu({ anchor: e.currentTarget, task: t, kind: "when" })}><Clock size={14} /> Remarcar</button>}
                {!done && manager && <button type="button" className={classes.action} onClick={(e) => setMenu({ anchor: e.currentTarget, task: t, kind: "who" })}><UserCheck size={14} /> Passar para</button>}
                {t.ticketId && <button type="button" className={classes.action} aria-label="Abrir a ficha do lead" onClick={() => history.push(`/crm?lead=${t.leadId}`)}><ExternalLink size={14} /></button>}
              </div>
            </div>
          );
        })}
      </Paper>
      <Menu anchorEl={menu ? menu.anchor : null} open={!!menu} onClose={() => setMenu(null)}>
        {menu && menu.kind === "when" && [
          <MenuItem key="1h" onClick={() => reschedule(menu.task, new Date(Date.now() + 3600000))}>Daqui a 1 hora</MenuItem>,
          <MenuItem key="tm" onClick={() => reschedule(menu.task, tomorrowAt9())}>Amanhã às 9h</MenuItem>,
          <MenuItem key="pick" disableRipple onKeyDown={(e) => e.stopPropagation()} style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12.5 }}>Escolher dia e hora</span>
            <span style={{ display: "flex", gap: 6 }}>
              <input ref={pick} type="datetime-local" defaultValue={localInput(Date.now() + 86400000)} aria-label="Dia e hora"
                style={{ font: "inherit", height: 30, boxSizing: "border-box", padding: "0 6px", borderRadius: 6, border: "1px solid rgba(148,163,184,.5)" }} />
              <button type="button" className={classes.action} onClick={() => pick.current && reschedule(menu.task, pick.current.value)}>Salvar</button>
            </span>
          </MenuItem>,
        ]}
        {menu && menu.kind === "who" && [
          ...team.filter((u) => !menu.task.user || u.id !== menu.task.user.id).map((u) => <MenuItem key={u.id} onClick={() => assign(menu.task, u.id)}>{u.name}</MenuItem>),
          menu.task.user ? <MenuItem key="none" onClick={() => assign(menu.task, null)}>Deixar sem responsável</MenuItem> : null,
        ]}
      </Menu>
    </MainContainer>
  );
};

export default Tasks;
