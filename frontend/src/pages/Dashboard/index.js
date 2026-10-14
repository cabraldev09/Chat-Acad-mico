import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import Typography from "@material-ui/core/Typography";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCircle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Inbox, MessageCircle, MessagesSquare, Reply, Timer } from "lucide-react";

import GlowCard from "../../components/GlowCard";
import NumberTicker from "../../components/NumberTicker";
import { AuthContext } from "../../context/Auth/AuthContext";
import openSocket from "../../services/socket-io";
import api from "../../services/api";
import toastError from "../../errors/toastError";

// Home. Two parts that never mix: "Agora" (what needs attention right now) and the chosen day (what happened that
// day). Each day starts at zero and keeps its own history: the arrows go back and forward through the days.
const useStyles = makeStyles((theme) => ({
  page: { padding: theme.spacing(3), maxWidth: 1180, margin: "0 auto", height: "auto", animation: "page-in .4s var(--ease-out) both" },
  top: { display: "flex", alignItems: "flex-end", flexWrap: "wrap", gap: theme.spacing(2), marginBottom: theme.spacing(2.5) },
  hello: { fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.15 },
  sub: { color: theme.palette.text.secondary, fontSize: 14 },
  picker: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, border: theme.border.divider, borderRadius: 12, padding: 3, background: theme.palette.cards.background },
  pickBtn: {
    border: 0, background: "transparent", cursor: "pointer", color: theme.palette.text.primary, borderRadius: 9, height: 34, minWidth: 34, padding: "0 8px",
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit", fontSize: 13.5, fontWeight: 600,
    transition: "background-color .15s", "&:hover": { background: theme.palette.action.hover }, "&[disabled]": { opacity: 0.35, cursor: "default" },
  },
  dateInput: { border: 0, background: "transparent", color: "inherit", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, cursor: "pointer", padding: "0 4px", colorScheme: theme.palette.type },
  section: { fontSize: 12.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: theme.palette.text.secondary, margin: theme.spacing(3, 0, 1.25) },
  grid3: { display: "grid", gap: theme.spacing(2), gridTemplateColumns: "repeat(3, 1fr)", [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr" } },
  grid5: { display: "grid", gap: theme.spacing(2), gridTemplateColumns: "repeat(5, 1fr)", [theme.breakpoints.down("md")]: { gridTemplateColumns: "repeat(3, 1fr)" }, [theme.breakpoints.down("xs")]: { gridTemplateColumns: "repeat(2, 1fr)" } },
  now: { padding: theme.spacing(2.25), display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", textAlign: "left", width: "100%", fontFamily: "inherit" },
  label: { color: theme.palette.text.secondary, fontSize: 13.5, fontWeight: 500 },
  big: { fontSize: 34, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.1, marginTop: 4 },
  mid: { fontSize: 26, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.1, marginTop: 4 },
  tile: { width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", flex: "none" },
  card: { padding: theme.spacing(2.25) },
  delta: { fontSize: 12, marginTop: 4, fontWeight: 600 },
  attention: { padding: theme.spacing(2.25), display: "grid", gap: theme.spacing(2), gridTemplateColumns: "1fr 1fr", [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr" } },
  listTitle: { fontSize: 13.5, fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 },
  row: {
    display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, cursor: "pointer", border: 0, width: "100%", background: "transparent",
    fontFamily: "inherit", color: "inherit", textAlign: "left", transition: "background-color .15s", "&:hover": { background: theme.palette.action.hover },
  },
  rowName: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14 },
  rowTime: { fontSize: 12.5, fontWeight: 700, color: "#b45309", fontVariantNumeric: "tabular-nums" },
  ok: { display: "flex", alignItems: "center", gap: 10, padding: theme.spacing(0.5), color: theme.palette.text.secondary, fontSize: 14 },
  chartCard: { padding: theme.spacing(2.25), height: 330, display: "flex", flexDirection: "column" },
  chartTitle: { fontSize: 14.5, fontWeight: 700, marginBottom: 2 },
  legend: { display: "flex", gap: 14, fontSize: 12.5, color: theme.palette.text.secondary, marginBottom: 6 },
  dot: { display: "inline-block", width: 9, height: 9, borderRadius: 3, marginRight: 5 },
  twoCols: { display: "grid", gap: theme.spacing(2), gridTemplateColumns: "2fr 1fr", [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr" } },
}));

const minutes = (s) => {
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h >= 24 ? `${Math.floor(h / 24)} d` : `${h} h${String(m % 60).padStart(2, "0")}`;
};

const iso = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });

const Dashboard = () => {
  const classes = useStyles();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const [date, setDate] = useState("");
  const [data, setData] = useState(null);
  const today = useMemo(() => iso(new Date()), []);

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get("/dashboard", { params: { date: date || undefined } });
      setData(d);
    } catch (err) {
      toastError(err);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);
  // live: a message or a conversation changing refreshes the numbers (lightly, not on every event)
  useEffect(() => {
    let timer;
    const again = () => { clearTimeout(timer); timer = setTimeout(load, 1500); };
    const socket = openSocket();
    socket.on("connect", () => socket.emit("joinNotification"));
    socket.on("appMessage", again);
    socket.on("ticket", again);
    const poll = setInterval(load, 60000);
    return () => { clearTimeout(timer); clearInterval(poll); socket.disconnect(); };
  }, [load]);

  const shown = data ? data.date : today;
  const isToday = shown === today;
  const go = (delta) => {
    const d = new Date(`${shown}T12:00:00`);
    d.setDate(d.getDate() + delta);
    const next = iso(d);
    setDate(next >= today ? "" : next);
  };
  const dayName = new Date(`${shown}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  const goTo = (filtro) => history.push(`/tickets?filtro=${filtro}`);
  const open = (id) => history.push(`/tickets/${id}`);
  const now = data ? data.now : null;
  const day = data ? data.day : null;
  const diff = day ? day.conversations - day.previousConversations : 0;

  const hourData = day ? day.byHour.map((h) => ({ ...h, name: `${String(h.hour).padStart(2, "0")}h` })) : [];
  const weekData = day ? day.week.map((w) => ({ ...w, name: new Date(`${w.date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "") })) : [];

  return (
    <div className={classes.page}>
      <div className={classes.top}>
        <div>
          <Typography className={classes.hello}>Olá, {user.name?.split(" ")[0]}</Typography>
          <div className={classes.sub}>{data && data.scope === "all" ? "Visão de toda a equipe" : "Seus atendimentos"}</div>
        </div>
        <div className={classes.picker}>
          <button type="button" className={classes.pickBtn} onClick={() => go(-1)} title="Dia anterior" aria-label="Dia anterior"><ChevronLeft size={18} /></button>
          <CalendarDays size={16} style={{ opacity: 0.6 }} />
          <input type="date" className={classes.dateInput} value={shown} max={today} onChange={(e) => e.target.value && setDate(e.target.value >= today ? "" : e.target.value)} aria-label="Escolher o dia" />
          <button type="button" className={classes.pickBtn} onClick={() => go(1)} disabled={isToday} title="Próximo dia" aria-label="Próximo dia"><ChevronRight size={18} /></button>
          {!isToday && <button type="button" className={classes.pickBtn} onClick={() => setDate("")}>Hoje</button>}
        </div>
      </div>

      <div className={classes.section} style={{ marginTop: 0 }}>Agora</div>
      <div className={classes.grid3}>
        {[
          ["Em atendimento", now && now.open, MessageCircle, "rgba(6,147,227,.12)", "#0693E3", "open"],
          ["Aguardando", now && now.pending, Clock, "rgba(245,158,11,.16)", "#b45309", "pending"],
          ["Não lidas", now && now.unread, Inbox, "rgba(22,163,74,.14)", "#15803d", "unread"],
        ].map(([title, value, Icon, bg, fg, key]) => (
          <GlowCard key={title} className={classes.now} onClick={() => goTo(key)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && goTo(key)}>
            <div>
              <div className={classes.label}>{title}</div>
              <div className={classes.big}><NumberTicker value={value || 0} /></div>
            </div>
            <div className={classes.tile} style={{ background: bg, color: fg }}><Icon size={19} /></div>
          </GlowCard>
        ))}
      </div>

      <GlowCard className={classes.attention} style={{ marginTop: 16 }}>
        {now && now.waiting.length === 0 && now.unanswered.length === 0 ? (
          <div className={classes.ok} style={{ gridColumn: "1 / -1" }}>
            <CheckCircle2 size={22} color="#15803d" /> Tudo em dia: ninguém aguardando e nenhuma conversa sem resposta há mais de 15 minutos.
          </div>
        ) : (
          <>
            <div>
              <div className={classes.listTitle}><Clock size={15} color="#b45309" /> Aguardando atendimento</div>
              {now && now.waiting.length === 0 && <div className={classes.sub}>Ninguém na fila.</div>}
              {now && now.waiting.map((t) => (
                <button key={t.id} type="button" className={classes.row} onClick={() => open(t.id)}>
                  <span className={classes.rowName}>{t.name}</span><span className={classes.rowTime}>há {minutes(t.seconds)}</span>
                </button>
              ))}
            </div>
            <div>
              <div className={classes.listTitle}><Reply size={15} color="#dc2626" /> Sem resposta há mais de 15 min</div>
              {now && now.unanswered.length === 0 && <div className={classes.sub}>Todos respondidos.</div>}
              {now && now.unanswered.map((t) => (
                <button key={t.id} type="button" className={classes.row} onClick={() => open(t.id)}>
                  <span className={classes.rowName}>{t.name}</span><span className={classes.rowTime} style={{ color: "#dc2626" }}>há {minutes(t.seconds)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </GlowCard>

      <div className={classes.section}>{isToday ? "Hoje" : dayName}</div>
      <div className={classes.grid5}>
        {[
          ["Conversas", day && day.conversations, MessagesSquare, "rgba(6,147,227,.12)", "#0693E3"],
          ["Mensagens recebidas", day && day.received, Inbox, "rgba(11,66,121,.10)", "#0B4279"],
          ["Mensagens enviadas", day && day.sent, Reply, "rgba(22,163,74,.14)", "#15803d"],
          ["Finalizadas", day && day.closed, CheckCircle2, "rgba(100,116,139,.16)", "#475569"],
        ].map(([title, value, Icon, bg, fg], i) => (
          <GlowCard key={title} className={classes.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div className={classes.label}>{title}</div>
                <div className={classes.mid}><NumberTicker value={value || 0} /></div>
                {i === 0 && day && (
                  <div className={classes.delta} style={{ color: diff > 0 ? "#15803d" : diff < 0 ? "#b45309" : "inherit", opacity: diff === 0 ? 0.6 : 1 }}>
                    {diff === 0 ? "igual a ontem" : `${diff > 0 ? "+" : ""}${diff} em relação a ontem`}
                  </div>
                )}
              </div>
              <div className={classes.tile} style={{ background: bg, color: fg }}><Icon size={18} /></div>
            </div>
          </GlowCard>
        ))}
        <GlowCard className={classes.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className={classes.label}>1ª resposta (média)</div>
              <div className={classes.mid}>{day && day.avgFirstResponse !== null ? minutes(day.avgFirstResponse) : "—"}</div>
              <div className={classes.delta} style={{ opacity: 0.6 }}>{day && day.avgFirstResponse === null ? "sem respostas no dia" : "tempo até responder"}</div>
            </div>
            <div className={classes.tile} style={{ background: "rgba(245,158,11,.16)", color: "#b45309" }}><Timer size={18} /></div>
          </div>
        </GlowCard>
      </div>

      <div className={classes.twoCols} style={{ marginTop: 16 }}>
        <GlowCard className={classes.chartCard}>
          <div className={classes.chartTitle}>Mensagens por hora</div>
          <div className={classes.legend}>
            <span><span className={classes.dot} style={{ background: "#0693E3" }} />Recebidas</span>
            <span><span className={classes.dot} style={{ background: "#0B4279" }} />Enviadas</span>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer>
              <BarChart data={hourData} margin={{ top: 6, right: 8, left: -18, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip cursor={{ fill: "rgba(127,127,127,.1)" }} formatter={(v, n) => [v, n === "received" ? "Recebidas" : "Enviadas"]} labelFormatter={(l) => `${l}`} />
                <Bar dataKey="received" fill="#0693E3" radius={[4, 4, 0, 0]} />
                <Bar dataKey="sent" fill="#0B4279" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlowCard>
        <GlowCard className={classes.chartCard}>
          <div className={classes.chartTitle}>Últimos 7 dias</div>
          <div className={classes.legend}><span>Conversas por dia. Toque numa barra para ver o dia.</span></div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer>
              <BarChart data={weekData} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip cursor={{ fill: "rgba(127,127,127,.1)" }} formatter={(v) => [v, "Conversas"]} />
                <Bar dataKey="conversations" radius={[5, 5, 0, 0]} onClick={(d) => d && setDate(d.date >= today ? "" : d.date)} style={{ cursor: "pointer" }}>
                  {weekData.map((w) => <Cell key={w.date} fill={w.date === shown ? "#0B4279" : "#9cc9ec"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlowCard>
      </div>
    </div>
  );
};

export default Dashboard;
