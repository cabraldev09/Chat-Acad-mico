import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { MenuItem, TextField } from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BellOff, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, GraduationCap, MailOpen, MessageCircle, MessagesSquare, Reply, Timer, Users } from "lucide-react";

import { CHANNELS } from "../../components/ChannelIcon";
import { AuthContext } from "../../context/Auth/AuthContext";
import openSocket from "../../services/socket-io";
import api from "../../services/api";
import Management from "./Management";
import ManagerView from "./ManagerView";
import MyDay from "./MyDay";
import MyStats from "./MyStats";
import { Insights } from "./shared";
import { isManager } from "../../utils/access";
import { fillDays } from "../../utils/chartDays";
import toastError from "../../errors/toastError";
import { fetchAllUsersPage } from "../../utils/fetchAllUsers";

// Estatísticas: the one place for the numbers. Every figure appears once.
// Administration and coordination open on the "Visão do gestor" (what needs attention + progress of the polos);
// "Detalhes" keeps the full tabs:
//   Visão geral  what is happening now and what happened in the period (volume, matrículas, resolução, atendimentos)
//   Equipe       response times by hour, department, attendant and polo (managers)
//   Canais       where the conversations come from: channel, queue and tag (managers)
// The period (day, 7 days, 30 days or a chosen date) is set once at the top and applies to every tab.
const useStyles = makeStyles((theme) => {
  const dark = theme.palette.type === "dark";
  const line = dark ? "rgba(255,255,255,.09)" : "#e3e9f1";
  const card = dark ? "#0f1826" : "#ffffff";
  const soft = dark ? "rgba(255,255,255,.04)" : "#f6f8fb";
  return {
    page: { padding: theme.spacing(3), maxWidth: 1280, margin: "0 auto", height: "auto" },
    top: { display: "flex", alignItems: "flex-end", flexWrap: "wrap", gap: theme.spacing(2), marginBottom: theme.spacing(2.5) },
    hello: { fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0 },
    sub: { color: theme.palette.text.secondary, fontSize: 14, marginTop: 4 },
    controls: { marginLeft: "auto", display: "flex", gap: theme.spacing(1), flexWrap: "wrap", alignItems: "center" },
    seg: { display: "inline-flex", padding: 3, borderRadius: 12, background: soft, border: `1px solid ${line}` },
    segBtn: {
      border: 0, background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, color: theme.palette.text.secondary,
      padding: "6px 14px", borderRadius: 9, transition: "background-color .15s, color .15s", display: "inline-flex", alignItems: "center", gap: 6,
      "&:hover": { color: theme.palette.text.primary },
    },
    segOn: { background: card, color: theme.palette.text.primary, boxShadow: dark ? "none" : "0 1px 3px rgba(11,26,46,.12)" },
    datebox: { display: "inline-flex", alignItems: "center", gap: 2, border: `1px solid ${line}`, borderRadius: 12, padding: "3px 6px", background: card },
    iconBtn: {
      border: 0, background: "transparent", cursor: "pointer", color: theme.palette.text.primary, width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center",
      "&:hover": { background: soft }, "&[disabled]": { opacity: 0.3, cursor: "default" },
    },
    dateInput: { border: 0, background: "transparent", color: "inherit", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, cursor: "pointer", colorScheme: theme.palette.type },
    layout: { display: "grid", gap: theme.spacing(2.5), gridTemplateColumns: "minmax(0, 1fr) 340px", alignItems: "start", [theme.breakpoints.down("md")]: { gridTemplateColumns: "1fr" } },
    stack: { display: "grid", gap: theme.spacing(2.5), minWidth: 0 },
    panel: { background: card, border: `1px solid ${line}`, borderRadius: 16, padding: theme.spacing(2.25) },
    panelTitle: { fontSize: 14.5, fontWeight: 700, margin: 0, letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: 8 },
    panelSub: { fontSize: 12.5, color: theme.palette.text.secondary, marginTop: 2 },
    band: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", background: card, border: `1px solid ${line}`, borderRadius: 16, overflow: "hidden", [theme.breakpoints.down("sm")]: { gridTemplateColumns: "repeat(2, 1fr)" } },
    cell: { padding: theme.spacing(2, 2.25), borderRight: `1px solid ${line}`, [theme.breakpoints.down("sm")]: { borderBottom: `1px solid ${line}` }, "&:last-child": { borderRight: 0 } },
    cellLabel: { fontSize: 12.5, color: theme.palette.text.secondary, display: "flex", alignItems: "center", gap: 6, fontWeight: 500 },
    cellValue: { fontSize: 30, fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1.1, marginTop: 8, fontVariantNumeric: "tabular-nums" },
    cellNote: { fontSize: 12, marginTop: 6, color: theme.palette.text.secondary },
    pill: { display: "inline-block", fontSize: 11.5, fontWeight: 700, padding: "1px 7px", borderRadius: 999 },
    nowGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: theme.spacing(1) },
    nowBtn: {
      border: `1px solid ${line}`, background: soft, borderRadius: 12, padding: "10px 12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "inherit",
      "&:hover": { borderColor: theme.palette.primary.main },
      "& b": { display: "block", fontSize: 24, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" },
      "& span": { fontSize: 12, color: theme.palette.text.secondary },
    },
    group: { fontSize: 12, fontWeight: 700, color: theme.palette.text.secondary, margin: theme.spacing(2, 0, 0.5), display: "flex", alignItems: "center", gap: 6, textTransform: "uppercase", letterSpacing: ".04em" },
    row: {
      display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", margin: "0 -8px", borderRadius: 10, width: "calc(100% + 16px)", border: 0, background: "transparent", cursor: "pointer",
      fontFamily: "inherit", color: "inherit", textAlign: "left", "&:hover": { background: soft },
    },
    rowName: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14 },
    rowTime: { fontSize: 12.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" },
    mute: { border: 0, background: "transparent", cursor: "pointer", color: theme.palette.text.secondary, padding: 4, borderRadius: 6, display: "inline-flex", "&:hover": { color: theme.palette.text.primary, background: soft } },
    ok: { display: "flex", gap: 10, alignItems: "center", color: theme.palette.text.secondary, fontSize: 14, padding: theme.spacing(1, 0) },
    table: { width: "100%", marginTop: theme.spacing(1.5) },
    thead: { display: "grid", gridTemplateColumns: "minmax(0, 2fr) 72px 72px 96px 120px 90px", gap: 8, padding: "0 10px 8px", fontSize: 12, color: theme.palette.text.secondary, fontWeight: 600, borderBottom: `1px solid ${line}`, [theme.breakpoints.down("sm")]: { display: "none" } },
    tr: {
      display: "grid", gridTemplateColumns: "minmax(0, 2fr) 72px 72px 96px 120px 90px", gap: 8, alignItems: "center", padding: "10px", border: 0, borderBottom: `1px solid ${line}`, width: "100%",
      background: "transparent", cursor: "pointer", fontFamily: "inherit", color: "inherit", textAlign: "left", fontSize: 14, "&:hover": { background: soft },
      "& .num": { fontVariantNumeric: "tabular-nums" },
      [theme.breakpoints.down("sm")]: { gridTemplateColumns: "minmax(0, 1fr) auto", "& .hide": { display: "none" } },
    },
    person: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 },
    avatar: { width: 30, height: 30, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: "#fff", background: "linear-gradient(135deg, #0B4279, #0693E3)" },
    chip: { display: "inline-block", fontSize: 12, fontWeight: 600, padding: "2px 9px", borderRadius: 999 },
    empty: { textAlign: "center", color: theme.palette.text.secondary, padding: theme.spacing(4, 1), fontSize: 14 },
    charts: { display: "grid", gap: theme.spacing(2.5), gridTemplateColumns: "3fr 2fr", [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr" } },
    chartBox: { height: 230, marginTop: theme.spacing(1.5) },
    legend: { display: "flex", gap: 14, fontSize: 12.5, color: theme.palette.text.secondary, marginTop: 6 },
    dot: { display: "inline-block", width: 9, height: 9, borderRadius: 3, marginRight: 5 },
    filters: { display: "flex", gap: theme.spacing(1), flexWrap: "wrap", marginBottom: theme.spacing(2) },
  };
});

const minutes = (s) => {
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h >= 24 ? `${Math.floor(h / 24)} d` : `${h} h ${String(m % 60).padStart(2, "0")}`;
};
// seconds -> "45s", "8min", "2h 10min", "1d 3h"
export const duration = (sec) => {
  if (sec === null || sec === undefined || Number.isNaN(Number(sec))) return "—";
  const s = Math.round(Number(sec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}min`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
};
const iso = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });
const clock = (v) => new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const STATUS = {
  open: ["Em atendimento", "rgba(6,147,227,.14)", "#0b6bb5"],
  pending: ["Aguardando", "rgba(245,158,11,.16)", "#b45309"],
  closed: ["Finalizada", "rgba(100,116,139,.16)", "#475569"],
};
const TABS = [["geral", "Visão geral", MessagesSquare], ["equipe", "Equipe", Users], ["canais", "Canais e filas", CalendarDays]];

const ReportsClassic = () => {
  const classes = useStyles();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const manager = isManager(user);
  const today = useMemo(() => iso(new Date()), []);
  const [tab, setTab] = useState("geral");
  // managers open on the lean view; everyone else only has the details
  const [view, setView] = useState("gestor");
  const [overviewMgr, setOverviewMgr] = useState(null);
  const [mgrError, setMgrError] = useState(false);
  // a server that does not have the manager overview yet (an older version still running): the full tabs open instead of an error
  const [leanMissing, setLeanMissing] = useState(false);
  const [date, setDate] = useState("");
  const [days, setDays] = useState(1);
  const [queueId, setQueueId] = useState("");
  const [userId, setUserId] = useState("");
  const [queues, setQueues] = useState([]);
  const [users, setUsers] = useState([]);
  const [data, setData] = useState(null);
  const [overview, setOverview] = useState(null);
  const [mgmt, setMgmt] = useState(null);
  const [myDay, setMyDay] = useState(null);

  const shown = data ? data.date : today;
  const isToday = shown === today;
  // the same range for every tab: the chosen day and the days before it
  const range = useMemo(() => {
    const end = new Date(`${shown}T12:00:00`);
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    return { from: iso(start), to: iso(end) };
  }, [shown, days]);

  useEffect(() => {
    if (!manager) return;
    api.get("/queue").then(({ data: d }) => setQueues(d)).catch(() => undefined);
    fetchAllUsersPage().then(({ data: d }) => setUsers(d.users || [])).catch(() => undefined);
  }, [manager]);

  const load = useCallback(async () => {
    try {
      if (!manager) api.get("/dashboard/me").then(({ data: d }) => setMyDay(d)).catch(toastError);
      const { data: d } = await api.get("/dashboard", { params: { date: date || undefined, days } });
      setData(d);
    } catch (err) { toastError(err); }
  }, [date, days, manager]);
  useEffect(() => { load(); }, [load]);

  const lean = manager && view === "gestor" && !leanMissing;
  const loadLean = useCallback(() => {
    setMgrError(false);
    api.get("/dashboard/manager", { params: { date: date || undefined, days } })
      .then(({ data: m }) => setOverviewMgr(m))
      .catch((err) => {
        if (err && err.response && err.response.status === 404) { setLeanMissing(true); return; }
        setMgrError(true);
        toastError(err);
      });
  }, [date, days]);
  useEffect(() => { if (lean) loadLean(); }, [lean, loadLean]);
  useEffect(() => {
    if (!lean) return undefined;
    const poll = setInterval(() => { if (document.visibilityState === "visible") loadLean(); }, 60000);
    return () => clearInterval(poll);
  }, [lean, loadLean]);

  // the heavier numbers are fetched only for the tab that shows them
  useEffect(() => {
    if (!data || lean) return;
    if (tab === "equipe" && manager) api.get("/dashboard/management", { params: { date: date || undefined, days } }).then(({ data: m }) => setMgmt(m)).catch(toastError);
    if (tab !== "equipe") {
      api.get("/stats/overview", { params: { from: range.from, to: range.to, queueId: queueId || undefined, userId: userId || undefined } })
        .then(({ data: o }) => setOverview(o && typeof o === "object" ? { ...o, perQueue: o.perQueue || [], perTag: o.perTag || [], period: o.period || {} } : null)).catch(toastError);
    }
  }, [tab, data, lean, range.from, range.to, queueId, userId, date, days, manager]);

  useEffect(() => {
    let timer;
    const again = () => { clearTimeout(timer); timer = setTimeout(load, 1500); };
    const socket = openSocket("notification");
    socket.on("connect", () => socket.emit("joinNotification"));
    socket.on("appMessage", again);
    socket.on("ticket", again);
    const poll = setInterval(() => { if (document.visibilityState === "visible") load(); }, 60000);
    return () => { clearTimeout(timer); clearInterval(poll); socket.disconnect(); };
  }, [load]);

  const go = (delta) => {
    const d = new Date(`${shown}T12:00:00`);
    d.setDate(d.getDate() + delta * days);
    const next = iso(d);
    setDate(next >= today ? "" : next);
  };
  const longDay = new Date(`${shown}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const periodName = days === 1 ? (isToday ? "Hoje" : longDay) : `${days} dias até ${isToday ? "hoje" : new Date(`${shown}T12:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}`;

  const now = data ? data.now : null;
  const p = data ? data.period : null;
  const diff = p ? p.attendances - p.previousAttendances : 0;
  const hourData = p ? p.byHour.map((h) => ({ ...h, name: `${String(h.hour).padStart(2, "0")}h` })) : [];

  // new x finished conversations for every day of the chosen range
  const series = useMemo(() => {
    if (!overview) return [];
    const byDay = {};
    (overview.perDay || []).forEach((d) => { const k = String(d.day).slice(0, 10); byDay[k] = { ...byDay[k], created: Number(d.created) }; });
    (overview.closedPerDay || []).forEach((d) => { const k = String(d.day).slice(0, 10); byDay[k] = { ...byDay[k], closed: Number(d.closed) }; });
    // the day chart always shows at least a week, so one day still has a timeline around it
    const from = days === 1 ? iso(new Date(new Date(`${shown}T12:00:00`).getTime() - 6 * 86400000)) : range.from;
    return fillDays(from, range.to, byDay, { created: 0, closed: 0 });
  }, [overview, days, shown, range]);
  const channelData = (overview?.perChannel || []).map((c) => ({ name: CHANNELS[c.channel]?.label || c.channel, value: Number(c.total), color: CHANNELS[c.channel]?.color || "#999", channel: c.channel }));

  const silence = async (row) => {
    try {
      await api.put(`/contacts/${row.contactId}/no-reply`, { noReply: true });
      toast.success(`${row.name} não aparece mais aqui. Dá para voltar nos dados do contato.`);
      load();
    } catch (err) { toastError(err); }
  };

  const list = (rows, color, withMute) => rows.map((t) => (
    <button key={t.id} type="button" className={classes.row} onClick={() => history.push(`/tickets/${t.id}`)}>
      <span className={classes.rowName}>{t.name}</span>
      <span className={classes.rowTime} style={{ color }}>há {minutes(t.seconds)}</span>
      {withMute && (
        <span className={classes.mute} role="button" tabIndex={0} title="Não precisa de resposta (avisos, listas)" aria-label="Não precisa de resposta"
          onClick={(e) => { e.stopPropagation(); silence(t); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); silence(t); } }}>
          <BellOff size={15} />
        </span>
      )}
    </button>
  ));

  const tabs = manager ? TABS : TABS.slice(0, 1);

  return (
    <div className={classes.page}>
      <div className={classes.top}>
        <div>
          <h1 className={classes.hello}>Estatísticas</h1>
          <div className={classes.sub}>{data && data.scope === "all" ? "Toda a equipe" : "Seus atendimentos"} · {periodName}</div>
        </div>
        <div className={classes.controls}>
          <div className={classes.seg} role="tablist" aria-label="Período">
            {[["Dia", 1], ["7 dias", 7], ["30 dias", 30]].map(([label, n]) => (
              <button key={n} type="button" role="tab" aria-selected={days === n} className={`${classes.segBtn} ${days === n ? classes.segOn : ""}`} onClick={() => setDays(n)}>{label}</button>
            ))}
          </div>
          <div className={classes.datebox}>
            <button type="button" className={classes.iconBtn} onClick={() => go(-1)} title="Anterior" aria-label="Período anterior"><ChevronLeft size={17} /></button>
            <CalendarDays size={15} style={{ opacity: 0.55 }} />
            <input type="date" className={classes.dateInput} value={shown} max={today} onChange={(e) => e.target.value && setDate(e.target.value >= today ? "" : e.target.value)} aria-label="Escolher o dia" />
            <button type="button" className={classes.iconBtn} onClick={() => go(1)} disabled={isToday} title="Próximo" aria-label="Próximo período"><ChevronRight size={17} /></button>
          </div>
          {!isToday && <button type="button" className={classes.segBtn} style={{ border: "1px solid currentColor" }} onClick={() => setDate("")}>Hoje</button>}
        </div>
      </div>

      {manager && !leanMissing && (
        <div className={classes.seg} role="tablist" aria-label="Tipo de visão" style={{ marginBottom: 14 }}>
          {[["gestor", "Visão do gestor"], ["detalhes", "Detalhes"]].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} className={`${classes.segBtn} ${view === k ? classes.segOn : ""}`} onClick={() => setView(k)}>{l}</button>
          ))}
        </div>
      )}

      {lean && <ManagerView data={overviewMgr} error={mgrError} onRetry={loadLean} periodName={periodName} />}

      {!lean && tabs.length > 1 && (
        <div className={classes.seg} role="tablist" aria-label="Visão" style={{ marginBottom: 20, display: "flex", width: "fit-content" }}>
          {tabs.map(([k, l, Icon]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`${classes.segBtn} ${tab === k ? classes.segOn : ""}`} onClick={() => setTab(k)}><Icon size={15} /> {l}</button>
          ))}
        </div>
      )}

      {!lean && tab === "geral" && !manager && <div style={{ marginBottom: 20 }}><MyDay data={myDay} /></div>}

      {!lean && tab === "equipe" && manager && <Management data={mgmt} sla={mgmt ? mgmt.slaMinutes : 15} />}

      {!lean && tab === "canais" && manager && (
        <div className={classes.stack}>
          <div className={classes.filters}>
            <TextField select size="small" label="Fila" variant="outlined" value={queueId} onChange={(e) => setQueueId(e.target.value)} style={{ minWidth: 160 }}>
              <MenuItem value="">Todas as filas</MenuItem>
              {queues.map((q) => (<MenuItem key={q.id} value={q.id}>{q.name}</MenuItem>))}
            </TextField>
            <TextField select size="small" label="Atendente" variant="outlined" value={userId} onChange={(e) => setUserId(e.target.value)} style={{ minWidth: 180 }}>
              <MenuItem value="">Todos os atendentes</MenuItem>
              {users.map((u) => (<MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>))}
            </TextField>
          </div>
          {!overview ? <div className={classes.panel} style={{ opacity: 0.6 }}>Carregando...</div> : (
            <>
              <div className={classes.charts}>
                <div className={classes.panel}>
                  <h2 className={classes.panelTitle}>Por canal</h2>
                  <div className={classes.panelSub}>De onde vieram as conversas do período.</div>
                  {channelData.length === 0 ? <div className={classes.empty}>Nenhuma conversa no período.</div> : (
                    <div className={classes.chartBox}>
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie data={channelData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                            {channelData.map((c) => (<Cell key={c.name} fill={c.color} />))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
                <div className={classes.panel}>
                  <h2 className={classes.panelTitle}>Por fila</h2>
                  <div className={classes.chartBox}>
                    <ResponsiveContainer>
                      <BarChart data={overview.perQueue.map((q) => ({ ...q, total: Number(q.total) }))} margin={{ top: 6, right: 4, left: -22, bottom: 0 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.35} />
                        <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                        <Tooltip cursor={{ fill: "rgba(127,127,127,.08)" }} />
                        <Bar dataKey="total" name="Atendimentos" radius={[5, 5, 0, 0]}>
                          {overview.perQueue.map((q) => (<Cell key={q.name} fill={q.color} />))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              <div className={classes.panel}>
                <h2 className={classes.panelTitle}>Por etiqueta</h2>
                {overview.perTag.length === 0 ? (
                  <div className={classes.empty}>Nenhum atendimento etiquetado no período.</div>
                ) : (
                  <div className={classes.chartBox}>
                    <ResponsiveContainer>
                      <BarChart data={overview.perTag.map((t) => ({ ...t, total: Number(t.total) }))} layout="vertical" margin={{ top: 6, right: 12, left: 10, bottom: 0 }}>
                        <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.35} />
                        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                        <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} fontSize={12} />
                        <Tooltip cursor={{ fill: "rgba(127,127,127,.08)" }} />
                        <Bar dataKey="total" name="Atendimentos" radius={[0, 5, 5, 0]}>
                          {overview.perTag.map((t) => (<Cell key={t.name} fill={t.color} />))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {!lean && tab === "geral" && (
        <div className={classes.layout}>
          <div className={classes.stack}>
            {data && data.insights && data.insights.length > 0 && <Insights items={data.insights} />}
            <div className={classes.band}>
              <div className={classes.cell}>
                <div className={classes.cellLabel}><Users size={14} /> Atendimentos</div>
                <div className={classes.cellValue}>{p ? p.attendances : "–"}</div>
                <div className={classes.cellNote}>
                  {p && (p.previousAttendances > 0 || diff !== 0) ? (
                    <span className={classes.pill} style={{ background: diff >= 0 ? "rgba(22,163,74,.14)" : "rgba(245,158,11,.18)", color: diff >= 0 ? "#15803d" : "#b45309" }}>
                      {diff >= 0 ? "+" : ""}{diff}
                    </span>
                  ) : null}{" "}
                  {days === 1 ? "vs. dia anterior" : `vs. ${days} dias antes`}
                </div>
              </div>
              <div className={classes.cell}>
                <div className={classes.cellLabel}><MessageCircle size={14} /> Mensagens</div>
                <div className={classes.cellValue}>{p ? p.received + p.sent : "–"}</div>
                <div className={classes.cellNote}>{p ? `${p.received} recebidas · ${p.sent} enviadas` : ""}</div>
              </div>
              <div className={classes.cell}>
                <div className={classes.cellLabel}><GraduationCap size={14} /> Matrículas</div>
                <div className={classes.cellValue}>{p ? p.enrolled : "–"}</div>
                <div className={classes.cellNote}>{p ? `${p.closed} conversas finalizadas` : ""}</div>
              </div>
              <div className={classes.cell}>
                <div className={classes.cellLabel}><Timer size={14} /> Tempo até finalizar</div>
                <div className={classes.cellValue}>{overview ? duration(overview.period.avgResolution) : "—"}</div>
                <div className={classes.cellNote}>{manager ? <button type="button" className={classes.mute} style={{ padding: 0, color: "#0693E3", fontWeight: 600, fontFamily: "inherit", fontSize: 12 }} onClick={() => setTab("equipe")}>Ver tempos de resposta</button> : "média por conversa"}</div>
              </div>
            </div>

            <div className={classes.panel}>
              <h2 className={classes.panelTitle}><MessageCircle size={16} /> Atendimentos do período</h2>
              <div className={classes.panelSub}>Cada linha é um lead. Clique para abrir a conversa.</div>
              {p && p.table.length > 0 ? (
                <div className={classes.table}>
                  <div className={classes.thead}><span>Lead</span><span>Recebidas</span><span>Enviadas</span><span>1ª resposta</span><span>Situação</span><span>Último</span></div>
                  {p.table.map((r) => {
                    const st = STATUS[r.status] || STATUS.closed;
                    return (
                      <button key={r.id} type="button" className={classes.tr} onClick={() => history.push(`/tickets/${r.id}`)}>
                        <span className={classes.person}><span className={classes.avatar}>{String(r.name || "?").charAt(0).toUpperCase()}</span><span className={classes.rowName}>{r.name}</span></span>
                        <span className="num hide">{r.received}</span>
                        <span className="num hide">{r.sent}</span>
                        <span className="num hide">{r.firstResponse !== null ? minutes(r.firstResponse) : "—"}</span>
                        <span className="hide"><span className={classes.chip} style={{ background: st[1], color: st[2] }}>{st[0]}</span></span>
                        <span className="num" style={{ color: "inherit", opacity: 0.7, fontSize: 13 }}>{days === 1 ? clock(r.lastAt) : new Date(r.lastAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className={classes.empty}>{p ? "Nenhum atendimento neste período." : "Carregando..."}</div>
              )}
            </div>

            <div className={classes.charts}>
              <div className={classes.panel}>
                <h2 className={classes.panelTitle}>Atendimentos por dia</h2>
                <div className={classes.panelSub}>Novos e finalizados. Clique numa barra para ver o dia.</div>
                <div className={classes.legend}>
                  <span><span className={classes.dot} style={{ background: "#0693E3" }} />Novos</span>
                  <span><span className={classes.dot} style={{ background: "#0B4279" }} />Finalizados</span>
                </div>
                <div className={classes.chartBox}>
                  <ResponsiveContainer>
                    <BarChart data={series} margin={{ top: 6, right: 4, left: -24, bottom: 0 }} barGap={2}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.35} />
                      <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} interval="preserveStartEnd" minTickGap={16} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                      <Tooltip cursor={{ fill: "rgba(127,127,127,.08)" }} formatter={(v, n) => [v, n === "created" ? "Novos" : "Finalizados"]} />
                      <Bar dataKey="created" radius={[4, 4, 0, 0]} style={{ cursor: "pointer" }} onClick={(d) => { if (d) { setDays(1); setDate(d.key >= today ? "" : d.key); } }}>
                        {series.map((s) => <Cell key={s.key} fill={s.key === shown ? "#0B4279" : "#0693E3"} />)}
                      </Bar>
                      <Bar dataKey="closed" fill="#9cc9ec" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className={classes.panel}>
                <h2 className={classes.panelTitle}>Mensagens por hora</h2>
                <div className={classes.legend}>
                  <span><span className={classes.dot} style={{ background: "#0693E3" }} />Recebidas</span>
                  <span><span className={classes.dot} style={{ background: "#0B4279" }} />Enviadas</span>
                </div>
                <div className={classes.chartBox}>
                  <ResponsiveContainer>
                    <BarChart data={hourData} margin={{ top: 6, right: 4, left: -22, bottom: 0 }} barGap={2}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.35} />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} interval={2} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                      <Tooltip cursor={{ fill: "rgba(127,127,127,.08)" }} formatter={(v, n) => [v, n === "received" ? "Recebidas" : "Enviadas"]} />
                      <Bar dataKey="received" fill="#0693E3" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="sent" fill="#0B4279" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          <div className={classes.stack}>
            <div className={classes.panel}>
              <h2 className={classes.panelTitle}><Clock3 size={16} /> Agora</h2>
              <div className={classes.panelSub}>O que está na mesa neste momento</div>
              <div className={classes.nowGrid} style={{ marginTop: 12 }}>
                {[["Em atendimento", now && now.open, "open"], ["Aguardando", now && now.pending, "pending"], ["Não lidas", now && now.unread, "unread"]].map(([label, value, key]) => (
                  <button key={key} type="button" className={classes.nowBtn} onClick={() => history.push(`/tickets?filtro=${key}`)}>
                    <b>{value === null || value === undefined ? "–" : value}</b><span>{label}</span>
                  </button>
                ))}
              </div>

              {now && now.waiting.length === 0 && now.unanswered.length === 0 ? (
                <div className={classes.ok} style={{ marginTop: 14 }}><CheckCircle2 size={20} color="#15803d" /> Tudo em dia: ninguém na fila e nenhuma conversa esperando resposta.</div>
              ) : (
                <>
                  {now && now.waiting.length > 0 && (
                    <>
                      <div className={classes.group}><Clock3 size={13} /> Aguardando atendimento</div>
                      {list(now.waiting, "#b45309", false)}
                    </>
                  )}
                  {now && now.unanswered.length > 0 && (
                    <>
                      <div className={classes.group}><Reply size={13} /> Sem resposta há mais de 15 min</div>
                      {list(now.unanswered, "#dc2626", true)}
                      <div className={classes.panelSub} style={{ marginTop: 6 }}>Só conversas de pessoas, em horário de trabalho. <MailOpen size={11} style={{ verticalAlign: -1 }} /> Avisos e listas: use o sino cortado.</div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Estatísticas: the consultant gets the self-management center (only their own numbers); the management has its own place
// (Centro de Gestão Comercial, same numbers); the other roles keep the classic screen.
const Reports = () => {
  const { user } = useContext(AuthContext);
  const consultant = user && user.profile !== "admin" && (user.role === "consultor" || !user.role);
  return consultant ? <MyStats /> : <ReportsClassic />;
};

export default Reports;
