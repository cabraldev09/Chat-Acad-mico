import React, { useCallback, useEffect, useState } from "react";
import { Paper, Tabs, Tab, Checkbox, Typography, makeStyles, FormControlLabel, Switch } from "@material-ui/core";
import { useHistory, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { toast } from "react-toastify";
import { format, parseISO } from "date-fns";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { isOverdue, StagePill } from "./shared";
import { fetchAllUsers } from "../../utils/fetchAllUsers";
import { isManager } from "../../utils/access";

const useStyles = makeStyles((theme) => ({
  list: { flex: 1, overflowY: "auto", overflowX: "hidden", marginTop: theme.spacing(1.5), ...theme.scrollbarStyles },
  row: {
    display: "flex", alignItems: "center", gap: theme.spacing(1), padding: theme.spacing(1, 1.5), borderBottom: theme.border.divider,
    animation: "page-in .3s var(--ease-out) both", "&:hover": { background: theme.palette.action.hover },
  },
}));

const TYPES = { ligar: "Ligar", whatsapp: "WhatsApp", email: "E-mail", visita: "Visita", proposta: "Proposta", documentos: "Documentos", outro: "Outro" };
const TABS = [["overdue", "Atrasadas"], ["today", "Hoje"], ["open", "Todas abertas"], ["done", "Concluídas"]];

const Tasks = () => {
  const classes = useStyles();
  const history = useHistory();
  const { user } = React.useContext(AuthContext);
  const location = useLocation();
  // the management center links here ("tarefas atrasadas do Helton"): scope, status and person come from the address
  const query = new URLSearchParams(location.search);
  // userId=0 is "nobody in charge": the tasks of someone who cannot work them, waiting for the management to hand them out
  const rawPerson = query.get("userId");
  const personId = rawPerson === "0" ? 0 : Number(rawPerson) || null;
  // opens on "Todas abertas" (late ones first, then today and the rest) unless the address says otherwise
  const [tab, setTab] = useState(query.get("status") && TABS.findIndex(([k]) => k === query.get("status")) >= 0 ? TABS.findIndex(([k]) => k === query.get("status")) : 2);
  // a task ticked here stays in its place, struck through, until the list is opened again (it is registered in "Concluídas" at once)
  const [ticked, setTicked] = useState({});
  const [all, setAll] = useState(query.get("scope") === "all" || personId !== null);
  const [rows, setRows] = useState([]);
  const [onlyPerson, setOnlyPerson] = useState(personId);
  const [team, setTeam] = useState([]);
  useEffect(() => { if (isManager(user)) fetchAllUsers().then((list) => setTeam(list || [])).catch(() => undefined); }, [user]);

  const load = useCallback(() => {
    api.get("/lead-tasks", { params: { status: TABS[tab][0], scope: all ? "all" : "mine", userId: onlyPerson === null ? undefined : onlyPerson } })
      .then(({ data }) => { setRows(data); setTicked({}); }).catch(toastError);
  }, [tab, all, onlyPerson]);
  // a task given to me by someone else appears at once (the notice comes from the server)
  useEffect(() => {
    const onChange = (e) => { if (e && e.detail && e.detail.remote) load(); };
    window.addEventListener("tasks:changed", onChange);
    return () => window.removeEventListener("tasks:changed", onChange);
  }, [load]);
  const shown = onlyPerson === null ? rows : onlyPerson === 0 ? rows.filter((t) => !t.user) : rows.filter((t) => t.user && t.user.id === onlyPerson);
  const personName = onlyPerson ? ((rows.find((t) => t.user && t.user.id === onlyPerson) || {}).user || {}).name : "";
  const assign = async (t, userId) => {
    if (!userId) return;
    try {
      await api.put(`/leads/${t.leadId}/tasks/${t.id}`, { userId: Number(userId) });
      load();
      window.dispatchEvent(new Event("tasks:changed"));
    } catch (err) { toastError(err); }
  };
  useEffect(() => { load(); }, [load]);

  const isDone = (t) => (ticked[t.id] !== undefined ? ticked[t.id] : !!t.doneAt);
  const toggle = async (t) => {
    const now = !isDone(t);
    setTicked((cur) => ({ ...cur, [t.id]: now }));
    try {
      await api.post(`/leads/${t.leadId}/tasks/${t.id}/toggle`);
      toast.success(now ? "Tarefa concluída. Ela fica registrada em Concluídas." : "Tarefa reaberta.", { autoClose: 3500, toastId: `task-${t.id}-${now}` });
      try { window.dispatchEvent(new Event("tasks:changed")); } catch (e) { /* old browser */ }
    } catch (err) {
      setTicked((cur) => ({ ...cur, [t.id]: !now }));
      toastError(err);
    }
  };

  return (
    <MainContainer>
      <MainHeader>
        <button type="button" onClick={() => (history.length > 1 ? history.goBack() : history.push(user && (user.profile === "admin" || user.role === "coordenacao") ? "/gestao-comercial" : "/tickets"))} aria-label="Voltar" style={{ display: "inline-flex", alignItems: "center", gap: 6, border: 0, background: "transparent", color: "inherit", cursor: "pointer", fontFamily: "inherit", fontSize: 14, padding: "6px 8px 6px 0" }}><ArrowLeft size={18} />Voltar</button>
        <Title>Tarefas de acompanhamento</Title>
        <MainHeaderButtonsWrapper>
          <FormControlLabel control={<Switch color="primary" checked={all} onChange={(e) => setAll(e.target.checked)} />} label="Mostrar de todos" />
        </MainHeaderButtonsWrapper>
      </MainHeader>
      <Paper variant="outlined" style={{ marginBottom: 8 }}>
        <Tabs value={tab} onChange={(e, v) => setTab(v)}>{TABS.map(([k, l]) => (<Tab key={k} label={l} />))}</Tabs>
      </Paper>
      {onlyPerson !== null ? (
        <Paper variant="outlined" style={{ marginBottom: 8, padding: "8px 14px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 14 }}>{onlyPerson === 0 ? <>Mostrando as tarefas <b>sem responsável</b>: eram de alguém que não pode atender (sem WhatsApp) e nenhuma conversa do lead está com outra pessoa. Escolha quem assume cada uma.</> : <>Mostrando só as tarefas de <b>{personName || "esta pessoa"}</b>, como pedido no Centro de Gestão Comercial.</>}</span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={() => setOnlyPerson(null)} style={{ border: "1px solid rgba(148,163,184,.4)", background: "transparent", color: "inherit", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit" }}>Mostrar de todos</button>
        </Paper>
      ) : (
        <Paper variant="outlined" style={{ marginBottom: 8, padding: "8px 14px", fontSize: 13, opacity: 0.85 }}>
          Tarefas são os próximos contatos combinados com cada lead (ligar, mandar WhatsApp, enviar proposta). <b>Atrasadas</b>: o prazo já passou. <b>Hoje</b>: vencem hoje. <b>Todas abertas</b>: ainda não concluídas. Marque a caixa quando concluir.
        </Paper>
      )}
      <Paper variant="outlined" className={classes.list}>
        {shown.length === 0 && (
          <Typography align="center" color="textSecondary" style={{ padding: 40 }}>
            {tab === 3 ? "Nenhuma tarefa concluída ainda." : "Tudo em dia por aqui. Agende o próximo contato direto na ficha do lead."}
          </Typography>
        )}
        {shown.map((t) => (
          <div key={t.id} className={classes.row}>
            <Checkbox color="primary" checked={isDone(t)} onChange={() => toggle(t)} />
            <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => history.push(`/crm?lead=${t.leadId}`)}>
              <div style={{ fontWeight: 500, textDecoration: isDone(t) ? "line-through" : "none", opacity: isDone(t) ? 0.6 : 1, transition: "opacity .2s" }}>{t.title}</div>
              <div style={{ fontSize: 12.5, opacity: 0.85, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{t.lead ? t.lead.name : ""}{t.lead && t.lead.stage ? <StagePill stage={t.lead.stage} size="sm" /> : null}</div>
            </div>
            <span style={{ fontSize: 12.5, opacity: 0.75 }}>{TYPES[t.type]}</span>
            <span style={{ fontSize: 13, minWidth: 110, textAlign: "right", color: !isDone(t) && isOverdue(t.dueAt) ? "#dc2626" : undefined, fontWeight: !isDone(t) && isOverdue(t.dueAt) ? 600 : 400 }}>
              {format(parseISO(t.dueAt), "dd/MM HH:mm")}
            </span>
            {tab === 3 && t.doneAt && <span style={{ fontSize: 12.5, opacity: 0.75, minWidth: 150, textAlign: "right" }}>Concluída {format(parseISO(t.doneAt), "dd/MM HH:mm")}{t.doneBy ? ` por ${t.doneBy.name.split(" ")[0]}` : ""}</span>}
            {all && t.user && <span style={{ fontSize: 12.5, opacity: 0.7, minWidth: 80 }}>{t.user.name}</span>}
            {all && !t.user && isManager(user) && (
              <select aria-label="Atribuir a" defaultValue="" onChange={(e) => assign(t, e.target.value)} style={{ fontSize: 13, padding: "4px 6px", borderRadius: 8, border: "1px solid rgba(148,163,184,.5)", background: "transparent", color: "inherit", maxWidth: 160 }}>
                <option value="">Atribuir a…</option>
                {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
            {all && !t.user && !isManager(user) && <span style={{ fontSize: 12.5, opacity: 0.7 }}>Sem responsável</span>}
          </div>
        ))}
      </Paper>
    </MainContainer>
  );
};

export default Tasks;
