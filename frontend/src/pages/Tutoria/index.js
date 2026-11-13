import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { makeStyles } from "@material-ui/core/styles";
import { Button, CircularProgress, MenuItem, TextField } from "@material-ui/core";
import { MessageSquare, MailOpen, MonitorCheck, RefreshCw } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import { AuthContext } from "../../context/Auth/AuthContext";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  intro: { color: theme.palette.text.secondary, fontSize: 14, margin: theme.spacing(0, 0, 2) },
  kpis: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", margin: theme.spacing(0, 0, 2) },
  kpi: { textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", border: `1px solid ${theme.palette.divider}`, borderRadius: 12, padding: theme.spacing(1.25, 1.75), background: theme.palette.background.paper, boxShadow: "0 1px 2px rgba(11,66,121,.06)", "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}` } },
  kpiOn: { borderColor: theme.palette.primary.main, boxShadow: `0 0 0 1px ${theme.palette.primary.main}` },
  kpiL: { fontSize: 12.5, color: theme.palette.text.secondary, display: "block" },
  kpiN: { display: "block", fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.2, fontVariantNumeric: "tabular-nums" },
  bar: { display: "flex", gap: theme.spacing(1), flexWrap: "wrap", alignItems: "center", margin: theme.spacing(0, 0, 1.5) },
  box: { border: "1px solid var(--line)", borderRadius: "var(--radius-card)", background: "var(--surface)", boxShadow: "var(--shadow-card)", overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5, "& th": { textAlign: "left", fontWeight: 600, padding: "8px 10px", borderBottom: `1px solid ${theme.palette.divider}`, whiteSpace: "nowrap" }, "& td": { padding: "8px 10px", borderBottom: `1px solid ${theme.palette.divider}`, verticalAlign: "top" } },
  name: { fontWeight: 600 },
  meta: { fontSize: 12.5, color: theme.palette.text.secondary },
  tag: { display: "inline-block", fontSize: 11.5, fontWeight: 700, padding: "1px 8px", borderRadius: 999, marginRight: 4, marginTop: 2 },
  red: { background: "rgba(220,38,38,.12)", color: theme.palette.type === "dark" ? "#fca5a5" : "#b91c1c" },
  amber: { background: "rgba(217,119,6,.14)", color: theme.palette.type === "dark" ? "#fcd34d" : "#b45309" },
  blue: { background: "rgba(6,147,227,.12)", color: theme.palette.type === "dark" ? "#7dd3fc" : "#0369a1" },
  actions: { display: "flex", gap: 4, flexWrap: "wrap" },
  button: { textTransform: "none", fontSize: 12, borderRadius: 8 },
  empty: { textAlign: "center", color: theme.palette.text.secondary, fontSize: 13, padding: theme.spacing(4, 1) },
}));

const STATUS = { pending: "Ambientação pendente", started: "Em ambientação", done: "Ambientado", none: "—" };
const when = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—");

// "Meus alunos": the tutor's students in one place, with what needs the tutor now (late first contact, students without contact,
// calls from the consultants, closed 24 hours on the official number), and a click to the conversation on the tutoring number.
export default function Tutoria() {
  const c = useStyles();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const manager = user.profile === "admin" || ["admin", "coordenacao"].includes(user.role);
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [tutorId, setTutorId] = useState("");
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    setData(null);
    api.get("/tutoria/students", { params: manager && tutorId ? { tutorId } : {} }).then(({ data: d }) => setData(d)).catch((e) => { toastError(e); setData({ counters: {}, students: [], rules: {} }); });
  }, [manager, tutorId]);
  useEffect(() => { load(); }, [load]);

  const tutors = useMemo(() => {
    const m = new Map();
    (data?.students || []).forEach((s) => { if (s.tutorId) m.set(s.tutorId, s.tutorName); });
    return [...m.entries()];
  }, [data]);

  const FILTERS = [
    ["all", "Alunos", "total"],
    ["late", "Primeiro contato atrasado", "late"],
    ["idle", `Sem contato há ${data?.rules?.idleDays || 15}+ dias`, "idle"],
    ["calls", "Chamados do comercial", "calls"],
    ["unread", "Com mensagem não lida", "unread"],
    ...(data?.rules?.official ? [["closedWindow", "Janela de 24h fechada", "closedWindow"]] : []),
  ];
  const match = (s) => filter === "all" || (filter === "late" && s.late) || (filter === "idle" && s.idle) || (filter === "calls" && s.callPending) || (filter === "unread" && s.unread > 0) || (filter === "closedWindow" && !s.windowOpen);
  const q = search.trim().toLowerCase();
  const rows = (data?.students || []).filter((s) => match(s) && (!q || `${s.name} ${s.phone || ""} ${s.course || ""} ${s.polo || ""}`.toLowerCase().includes(q)));

  const open = async (s) => {
    setBusy(s.leadId);
    try {
      const { data: r } = await api.post(`/tutoria/students/${s.leadId}/conversation`);
      history.push(`/tickets/${r.ticketId}`);
    } catch (e) { toastError(e); }
    setBusy(null);
  };
  const opening = async (s) => {
    setBusy(s.leadId);
    try {
      const { data: r } = await api.post(`/tutoria/students/${s.leadId}/conversation`);
      await api.post(`/tickets/${r.ticketId}/opening-template`);
      toast.success(`Mensagem de abertura enviada para ${s.name.split(" ")[0]}.`);
      load();
    } catch (e) { toastError(e); }
    setBusy(null);
  };

  return (
    <MainContainer>
      <MainHeader><Title>Meus alunos</Title></MainHeader>
      <div className={c.intro}>
        {manager ? "Os alunos de cada tutor" : "Os alunos que estão com você"} e o que precisa de atenção agora. A conversa abre no número da Tutoria{data?.rules?.numberName ? ` (${data.rules.numberName})` : ""}: o comercial não vê essas conversas.
        {data && !data.rules?.numberName && " Ainda não há número da Tutoria: marque a Função do número = Tutoria em Conexões."}
      </div>
      {!data ? <CircularProgress size={24} /> : <>
        <div className={c.kpis}>
          {FILTERS.map(([key, label, counter]) => (
            <button key={key} type="button" className={`${c.kpi} ${filter === key ? c.kpiOn : ""}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              <span className={c.kpiL}>{label}</span>
              <span className={c.kpiN}>{data.counters?.[counter] || 0}</span>
            </button>
          ))}
        </div>
        <div className={c.bar}>
          <TextField size="small" variant="outlined" placeholder="Buscar aluno, curso ou polo" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 260 }} />
          {manager && <TextField select size="small" variant="outlined" label="Tutor" value={tutorId} onChange={(e) => setTutorId(e.target.value)} style={{ minWidth: 200 }}>
            <MenuItem value="">Todos</MenuItem>
            {tutors.map(([id, name]) => <MenuItem key={id} value={id}>{name}</MenuItem>)}
          </TextField>}
          <Button size="small" className={c.button} startIcon={<RefreshCw size={14} />} onClick={load}>Atualizar</Button>
        </div>
        <div className={c.box}>
          {!rows.length ? <div className={c.empty}>{filter === "all" ? "Nenhum aluno por aqui ainda." : "Nada nesta situação. 🎉"}</div> :
            <table className={c.table}>
              <thead><tr><th>Aluno</th><th>Ambientação</th><th>Último contato</th><th>Situação</th><th /></tr></thead>
              <tbody>{rows.map((s) => (
                <tr key={s.leadId}>
                  <td>
                    <div className={c.name}>{s.name}</div>
                    <div className={c.meta}>{[s.course, s.polo, manager && s.tutorName ? `Tutor: ${s.tutorName}` : null].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td>
                    <div>{STATUS[s.onboardingStatus] || s.onboardingStatus}</div>
                    <div className={c.meta}>Matrícula {when(s.enrolledAt)} · {s.checklist.done}/{s.checklist.total} etapas</div>
                  </td>
                  <td>
                    <div>{s.daysWithoutContact === null ? "—" : s.daysWithoutContact === 0 ? "Hoje" : `Há ${s.daysWithoutContact} dia${s.daysWithoutContact > 1 ? "s" : ""}`}</div>
                    <div className={c.meta}>Aluno {when(s.lastIn)} · Tutoria {when(s.lastOut)}</div>
                  </td>
                  <td>
                    {s.late && <span className={`${c.tag} ${c.red}`}>Primeiro contato atrasado</span>}
                    {s.idle && <span className={`${c.tag} ${c.amber}`}>Sem contato</span>}
                    {s.callPending && <span className={`${c.tag} ${c.blue}`} title={s.callNote || ""}>Chamado do comercial</span>}
                    {s.unread > 0 && <span className={`${c.tag} ${c.blue}`}>{s.unread} não lida{s.unread > 1 ? "s" : ""}</span>}
                    {data.rules?.official && !s.windowOpen && <span className={`${c.tag} ${c.amber}`}>24h fechada</span>}
                  </td>
                  <td>
                    <div className={c.actions}>
                      <Button size="small" variant="outlined" className={c.button} disabled={busy === s.leadId} startIcon={<MessageSquare size={13} />} onClick={() => open(s)}>Abrir conversa</Button>
                      {data.rules?.official && !s.windowOpen && data.rules?.template && <Button size="small" className={c.button} disabled={busy === s.leadId} startIcon={<MailOpen size={13} />} onClick={() => opening(s)}>Enviar abertura</Button>}
                      <Button size="small" className={c.button} startIcon={<MonitorCheck size={13} />} onClick={() => history.push("/ambientacao")}>Ambientação</Button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>}
        </div>
      </>}
    </MainContainer>
  );
}
