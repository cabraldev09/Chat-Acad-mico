import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Redirect, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { MenuItem, TextField } from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarsChart, ChartLegend, ChartTooltip, useChartTheme } from "../../components/charts";
import { BellOff, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, GraduationCap, MailOpen, MessageCircle, MessagesSquare, Reply, Timer, Users } from "lucide-react";

import { CHANNELS } from "../../components/ChannelIcon";
import { AuthContext } from "../../context/Auth/AuthContext";
import openSocket from "../../services/socket-io";
import api from "../../services/api";
import Management from "./Management";
import MyDay from "./MyDay";
import { Insights } from "./shared";
import { isManager } from "../../utils/access";
import { fillDays } from "../../utils/chartDays";
import toastError from "../../errors/toastError";
import { fetchAllUsersPage } from "../../utils/fetchAllUsers";
import { ErrorState } from "../../components/ui";
import StatsHubBar from "../../components/StatsHub";
import { DonutChart, GlowPanel, GlowRank, GlowStat } from "../../components/peak";

// Atendimento. Every figure appears once:
//   Visão geral  what is happening now and what happened in the period (volume, matrículas, resolução, atendimentos). The management
//                sees it in Estatísticas → Visão geral (ConversationsOverview); the other roles see it here
//   Equipe       response times by hour, department, attendant and polo (managers)
//   Canais       where the conversations come from: channel, queue and tag (managers)
// The period (day, 7 days, 30 days or a chosen date) is set once at the top and applies to every tab.
const useStyles = makeStyles((theme) => {
  // the tokens of styles/ui.css: the same surfaces and borders as every other screen
  const line = "var(--line)";
  const card = "var(--surface)";
  const soft = "var(--surface-2)";
  return {
    page: { padding: theme.spacing(3), maxWidth: 1280, margin: "0 auto", height: "auto", [theme.breakpoints.down("xs")]: { padding: theme.spacing(1.5) } },
    top: { display: "flex", alignItems: "flex-end", flexWrap: "wrap", gap: theme.spacing(2), marginBottom: theme.spacing(2.5) },
    hello: { fontSize: 26, fontWeight: 750, letterSpacing: "-0.03em", lineHeight: 1.15, margin: 0, [theme.breakpoints.down("xs")]: { fontSize: 22 } },
    sub: { color: theme.palette.text.secondary, fontSize: 14, marginTop: 4 },
    controls: { marginLeft: "auto", display: "flex", gap: theme.spacing(1), flexWrap: "wrap", alignItems: "center" },
    seg: { display: "inline-flex", gap: 2, padding: 4, borderRadius: 999, background: card, border: `1px solid ${line}`, boxShadow: "var(--shadow-card)" },
    segBtn: {
      border: 0, background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 550, color: theme.palette.text.secondary,
      padding: "6px 14px", borderRadius: 999, transition: "background-color .15s, color .15s", display: "inline-flex", alignItems: "center", gap: 6,
      "&:hover": { color: theme.palette.text.primary },
    },
    segOn: { background: "var(--accent-soft)", color: "var(--accent-strong) !important", boxShadow: "inset 0 0 0 1px var(--accent-line)" },
    datebox: { display: "inline-flex", alignItems: "center", gap: 2, border: `1px solid ${line}`, borderRadius: 10, padding: "3px 6px", background: card },
    iconBtn: {
      border: 0, background: "transparent", cursor: "pointer", color: theme.palette.text.primary, width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center",
      "&:hover": { background: soft }, "&[disabled]": { opacity: 0.3, cursor: "default" },
    },
    dateInput: { border: 0, background: "transparent", color: "inherit", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, cursor: "pointer", colorScheme: theme.palette.type },
    layout: { display: "grid", gap: theme.spacing(2.5), gridTemplateColumns: "minmax(0, 1fr) 340px", alignItems: "start", [theme.breakpoints.down("md")]: { gridTemplateColumns: "1fr" } },
    stack: { display: "grid", gap: theme.spacing(2.5), minWidth: 0 },
    panel: { background: "var(--card-bg)", border: "1px solid var(--card-line)", borderRadius: 14, padding: theme.spacing(2.25, 2.5), boxShadow: "var(--card-shadow)", minWidth: 0 },
    panelTitle: { fontSize: 14, fontWeight: 650, margin: 0, letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: 8 },
    panelSub: { fontSize: 12.5, color: theme.palette.text.secondary, marginTop: 2 },
    nowGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: theme.spacing(1), [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr" } },
    nowBtn: {
      border: `1px solid ${line}`, background: soft, borderRadius: 12, padding: "10px 12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "inherit",
      "&:hover": { borderColor: theme.palette.primary.main },
      "& b": { display: "block", fontSize: 24, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", color: "var(--c-brand)" },
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

// a list of { name, total, color } as ranked bars (biggest first, the bar relative to the biggest)
const rankOf = (list) => {
  const rows = (list || []).map((x) => ({ name: x.name, value: Number(x.total) || 0, color: x.color })).sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return rows.map((r) => ({ key: r.name, name: r.name, value: r.value, bar: (r.value / max) * 100, color: r.color }));
};

// embedded: the overview alone (Estatísticas → Visão geral shows it with its own period); the screen of its own keeps the rest
const ReportsClassic = ({ embedded = false, days: daysProp, date: dateProp }) => {
  const classes = useStyles();
  const ct = useChartTheme();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const manager = isManager(user);
  const today = useMemo(() => iso(new Date()), []);
  // the overview of the conversations lives in Estatísticas → Visão geral for the management; this screen keeps the team and the channels
  const [tabState, setTab] = useState(isManager(user) ? "equipe" : "geral");
  const tab = embedded ? "geral" : tabState;
  const [dateState, setDate] = useState("");
  const [daysState, setDays] = useState(1);
  const date = embedded ? dateProp || "" : dateState;
  const days = embedded ? daysProp || 1 : daysState;
  const [queueId, setQueueId] = useState("");
  const [userId, setUserId] = useState("");
  const [queues, setQueues] = useState([]);
  const [users, setUsers] = useState([]);
  const [data, setData] = useState(null);
  const [overview, setOverview] = useState(null);
  const [mgmt, setMgmt] = useState(null);
  // a failed load is shown as an error with "try again", never as an endless "Carregando..."
  const [failed, setFailed] = useState({ data: false, overview: false, mgmt: false });
  const [attempt, setAttempt] = useState(0);
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
      setFailed((f) => ({ ...f, data: false }));
    } catch (err) { setFailed((f) => ({ ...f, data: true })); toastError(err); }
  }, [date, days, manager]);
  useEffect(() => { load(); }, [load]);

  // the heavier numbers are fetched only for the tab that shows them
  useEffect(() => {
    if (!data) return;
    if (tab === "equipe" && manager) api.get("/dashboard/management", { params: { date: date || undefined, days } }).then(({ data: m }) => { setMgmt(m); setFailed((f) => ({ ...f, mgmt: false })); }).catch((e) => { setFailed((f) => ({ ...f, mgmt: true })); toastError(e); });
    if (tab !== "equipe") {
      api.get("/stats/overview", { params: { from: range.from, to: range.to, queueId: queueId || undefined, userId: userId || undefined } })
        .then(({ data: o }) => { setOverview(o && typeof o === "object" ? { ...o, perQueue: o.perQueue || [], perTag: o.perTag || [], period: o.period || {} } : null); setFailed((f) => ({ ...f, overview: false })); })
        .catch((e) => { setFailed((f) => ({ ...f, overview: true })); toastError(e); });
    }
  }, [tab, data, range.from, range.to, queueId, userId, date, days, manager, attempt]);
  const retry = () => { setFailed({ data: false, overview: false, mgmt: false }); setAttempt((n) => n + 1); load(); };

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

  // the row opens the conversation; "não precisa de resposta" is a button beside it (never a button inside another button)
  const list = (rows, color, withMute) => rows.map((t) => (
    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button type="button" className={classes.row} style={{ flex: 1, minWidth: 0 }} onClick={() => history.push(`/tickets/${t.id}`)}>
        <span className={classes.rowName}>{t.name}</span>
        <span className={classes.rowTime} style={{ color }}>há {minutes(t.seconds)}</span>
      </button>
      {withMute && (
        <button type="button" className={classes.mute} title="Não precisa de resposta (avisos, listas)" aria-label={`${t.name}: não precisa de resposta`} onClick={() => silence(t)}>
          <BellOff size={15} />
        </button>
      )}
    </div>
  ));

  const tabs = manager ? TABS.slice(1) : TABS.slice(0, 1);

  return (
    <div className={embedded ? undefined : `${classes.page} gv-plain`}>
      {!embedded && <StatsHubBar />}
      {!embedded && <div className="gv-head" style={{ marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <h1>Atendimento e canais</h1>
          <p>{data && data.scope === "all" ? "Toda a equipe" : "Seus atendimentos"} · {periodName}</p>
        </div>
        <div className={classes.controls} style={{ color: "var(--text-1)" }}>
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
          {!isToday && <button type="button" className={classes.segBtn} style={{ border: "1px solid rgba(255,255,255,.6)", color: "#fff" }} onClick={() => setDate("")}>Hoje</button>}
        </div>
      </div>}

      {!embedded && tabs.length > 1 && (
        <div className={classes.seg} role="tablist" aria-label="Visão" style={{ marginBottom: 20, display: "flex", width: "fit-content" }}>
          {tabs.map(([k, l, Icon]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`${classes.segBtn} ${tab === k ? classes.segOn : ""}`} onClick={() => setTab(k)}><Icon size={15} /> {l}</button>
          ))}
        </div>
      )}

      {tab === "geral" && !manager && <div style={{ marginBottom: 20 }}><MyDay data={myDay} /></div>}

      {tab === "equipe" && manager && <Management data={mgmt} sla={mgmt ? mgmt.slaMinutes : 15} failed={failed.mgmt || (failed.data && !data)} onRetry={retry} date={date || undefined} days={days} />}

      {tab === "canais" && manager && (
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
          {!overview ? (failed.overview || (failed.data && !data)
            ? <GlowPanel error onRetry={retry} />
            : <GlowPanel loading />
          ) : channelData.length === 0 && !overview.perQueue.length && !overview.perTag.length ? (
            // nothing in the period: one sentence, not three empty boxes saying the same
            <GlowPanel empty emptyText="Nenhuma conversa no período escolhido. Mude o dia ou o período acima." />
          ) : (
            <div className="pk-grid-wide">
              <GlowPanel title="Por canal" sub="De onde vieram as conversas do período." empty={!channelData.length} emptyText="Nenhuma conversa com canal no período.">
                <DonutChart parts={channelData.map((c) => ({ label: c.name, value: c.value, color: c.color }))} centerLabel="conversas" />
              </GlowPanel>
              <GlowPanel title="Por fila" sub="Atendimentos de cada fila no período." empty={!overview.perQueue.length} emptyText="Nenhum atendimento em fila no período.">
                <GlowRank rows={rankOf(overview.perQueue).map((r) => ({ ...r, value: Number(r.value).toLocaleString("pt-BR") }))} />
              </GlowPanel>
              {overview.perTag.length > 0 && (
                <GlowPanel title="Por etiqueta" sub="Atendimentos com cada etiqueta no período.">
                  <GlowRank rows={rankOf(overview.perTag).map((r) => ({ ...r, value: Number(r.value).toLocaleString("pt-BR") }))} />
                </GlowPanel>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "geral" && (
        <div className={classes.layout}>
          <div className={classes.stack}>
            {data && data.insights && data.insights.length > 0 && <Insights items={data.insights} />}
            {/* inside the overview of the statistics these numbers are already on top of the page: here they would only repeat */}
            {!embedded && (
              <div className="pk-grid">
                <GlowStat id="attendances" label="Atendimentos" icon={Users} loading={!p} value={p ? p.attendances.toLocaleString("pt-BR") : "–"}
                  delta={p && p.previousAttendances > 0 ? Math.round((diff / p.previousAttendances) * 100) : null}
                  hint={days === 1 ? "Comparado com o dia anterior" : `Comparado com os ${days} dias antes`} />
                <GlowStat id="messages" label="Mensagens" icon={MessageCircle} loading={!p} value={p ? (p.received + p.sent).toLocaleString("pt-BR") : "–"} hint={p ? `${p.received.toLocaleString("pt-BR")} recebidas, ${p.sent.toLocaleString("pt-BR")} enviadas` : ""} />
                <GlowStat id="enrolled" label="Matrículas" icon={GraduationCap} tone="good" loading={!p} value={p ? p.enrolled.toLocaleString("pt-BR") : "–"} hint={p ? `${p.closed.toLocaleString("pt-BR")} conversas finalizadas` : ""} />
                <GlowStat id="resolution" label="Tempo até finalizar" icon={Timer} loading={!overview} value={overview ? duration(overview.period.avgResolution) : "—"} hint="Média por conversa"
                  onClick={manager ? () => setTab("equipe") : undefined} title={manager ? "Ver os tempos de resposta da equipe" : undefined} />
              </div>
            )}

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
                <div className={classes.empty}>{p ? "Nenhum atendimento neste período." : failed.data ? <ErrorState title="Não foi possível carregar os atendimentos." onRetry={retry} compact /> : "Carregando..."}</div>
              )}
            </div>

            <div className={classes.charts}>
              <div className={classes.panel}>
                <h2 className={classes.panelTitle}>Atendimentos por dia</h2>
                <div className={classes.panelSub}>Novos e finalizados. Clique numa barra para ver o dia.</div>
                <div style={{ marginTop: 12 }}><ChartLegend items={[["leads", "Novos"], ["muted", "Finalizados"]]} /></div>
                <div className={classes.chartBox} style={{ marginTop: 4 }}>
                  <ResponsiveContainer>
                    <BarChart data={series} margin={{ top: 6, right: 4, left: -24, bottom: 0 }} barGap={2} barCategoryGap="22%">
                      <CartesianGrid vertical={false} stroke={ct.grid} strokeDasharray="3 4" />
                      <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11.5, fill: ct.axis }} tickMargin={8} interval="preserveStartEnd" minTickGap={16} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11.5, fill: ct.axis }} />
                      <Tooltip cursor={{ fill: ct.cursor }} content={<ChartTooltip />} />
                      <Bar dataKey="created" name="Novos" radius={[3, 3, 0, 0]} maxBarSize={22} style={{ cursor: "pointer" }} onClick={(d) => { if (d && !embedded) { setDays(1); setDate(d.key >= today ? "" : d.key); } }} isAnimationActive={false}>
                        {series.map((s) => <Cell key={s.key} fill={s.key === shown ? ct.c.brand : ct.c.leads} />)}
                      </Bar>
                      <Bar dataKey="closed" name="Finalizados" fill={ct.c.muted} fillOpacity={0.45} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className={classes.panel}>
                <h2 className={classes.panelTitle}>Mensagens por hora</h2>
                <div style={{ marginTop: 12 }}>
                  <BarsChart data={hourData} keys={[["received", "Recebidas", "leads"], ["sent", "Enviadas", "brand"]]} height={230} />
                </div>
              </div>
            </div>
          </div>

          <div className={classes.stack}>
            <div className={classes.panel}>
              <h2 className={classes.panelTitle}><Clock3 size={16} /> {embedded ? "Fila agora" : "Agora"}</h2>
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
  return consultant ? <Redirect to="/meu-desempenho" /> : <ReportsClassic />;
};

export const ConversationsOverview = ({ days, date }) => <ReportsClassic embedded days={days} date={date} />;

export default Reports;
