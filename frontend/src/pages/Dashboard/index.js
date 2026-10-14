import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { makeStyles } from "@material-ui/core/styles";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BellOff, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, GraduationCap, Inbox, MailOpen, MessageCircle, Reply, Send, Timer, Users } from "lucide-react";

import { AuthContext } from "../../context/Auth/AuthContext";
import openSocket from "../../services/socket-io";
import api from "../../services/api";
import toastError from "../../errors/toastError";

// Home. "Agora" (what needs attention right now) is kept apart from the chosen period (what happened), and the period
// is counted per attendance, that is, per lead. Cards are still: no spotlight, no lift.
const useStyles = makeStyles((theme) => {
  const dark = theme.palette.type === "dark";
  const line = dark ? "rgba(255,255,255,.09)" : "#e3e9f1";
  const card = dark ? "#0f1826" : "#ffffff";
  const soft = dark ? "rgba(255,255,255,.04)" : "#f6f8fb";
  return {
    page: { padding: theme.spacing(3), maxWidth: 1280, margin: "0 auto", height: "auto" },
    top: { display: "flex", alignItems: "flex-end", flexWrap: "wrap", gap: theme.spacing(2), marginBottom: theme.spacing(3) },
    hello: { fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0 },
    sub: { color: theme.palette.text.secondary, fontSize: 14, marginTop: 4 },
    controls: { marginLeft: "auto", display: "flex", gap: theme.spacing(1), flexWrap: "wrap", alignItems: "center" },
    seg: { display: "inline-flex", padding: 3, borderRadius: 12, background: soft, border: `1px solid ${line}` },
    segBtn: {
      border: 0, background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, color: theme.palette.text.secondary,
      padding: "6px 14px", borderRadius: 9, transition: "background-color .15s, color .15s",
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
    band: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", background: card, border: `1px solid ${line}`, borderRadius: 16, overflow: "hidden", [theme.breakpoints.down("sm")]: { gridTemplateColumns: "repeat(2, 1fr)" } },
    cell: { padding: theme.spacing(2, 2.25), borderRight: `1px solid ${line}`, [theme.breakpoints.down("sm")]: { borderBottom: `1px solid ${line}` }, "&:last-child": { borderRight: 0 } },
    cellLabel: { fontSize: 12.5, color: theme.palette.text.secondary, display: "flex", alignItems: "center", gap: 6, fontWeight: 500 },
    cellValue: { fontSize: 30, fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1.1, marginTop: 8, fontVariantNumeric: "tabular-nums" },
    cellNote: { fontSize: 12, marginTop: 6, color: theme.palette.text.secondary },
    pill: { display: "inline-block", fontSize: 11.5, fontWeight: 700, padding: "1px 7px", borderRadius: 999, marginLeft: 6 },
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
  };
});

const minutes = (s) => {
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h >= 24 ? `${Math.floor(h / 24)} d` : `${h} h ${String(m % 60).padStart(2, "0")}`;
};
const iso = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });
const clock = (v) => new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const STATUS = {
  open: ["Em atendimento", "rgba(6,147,227,.14)", "#0b6bb5"],
  pending: ["Aguardando", "rgba(245,158,11,.16)", "#b45309"],
  closed: ["Finalizada", "rgba(100,116,139,.16)", "#475569"],
};

const Dashboard = () => {
  const classes = useStyles();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const today = useMemo(() => iso(new Date()), []);
  const [date, setDate] = useState("");
  const [days, setDays] = useState(1);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get("/dashboard", { params: { date: date || undefined, days } });
      setData(d);
    } catch (err) {
      toastError(err);
    }
  }, [date, days]);

  useEffect(() => { load(); }, [load]);
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
  const weekData = p ? p.week.map((w) => ({ ...w, name: new Date(`${w.date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "") })) : [];

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

  return (
    <div className={classes.page}>
      <div className={classes.top}>
        <div>
          <h1 className={classes.hello}>Olá, {user.name?.split(" ")[0]}</h1>
          <div className={classes.sub}>{data && data.scope === "all" ? "Visão de toda a equipe" : "Seus atendimentos"} · {periodName}</div>
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

      <div className={classes.layout}>
        <div className={classes.stack}>
          <div className={classes.band}>
            <div className={classes.cell}>
              <div className={classes.cellLabel}><Users size={14} /> Atendimentos</div>
              <div className={classes.cellValue}>{p ? p.attendances : "–"}</div>
              <div className={classes.cellNote}>
                {p && p.previousAttendances > 0 || (p && diff !== 0) ? (
                  <span className={classes.pill} style={{ marginLeft: 0, background: diff >= 0 ? "rgba(22,163,74,.14)" : "rgba(245,158,11,.18)", color: diff >= 0 ? "#15803d" : "#b45309" }}>
                    {diff >= 0 ? "+" : ""}{diff}
                  </span>
                ) : null}{" "}
                {days === 1 ? "vs. dia anterior" : `vs. ${days} dias antes`}
              </div>
            </div>
            <div className={classes.cell}>
              <div className={classes.cellLabel}><Inbox size={14} /> Recebidas</div>
              <div className={classes.cellValue}>{p ? p.received : "–"}</div>
              <div className={classes.cellNote}>{p ? `${p.avgReceived} por atendimento` : ""}</div>
            </div>
            <div className={classes.cell}>
              <div className={classes.cellLabel}><Send size={14} /> Enviadas</div>
              <div className={classes.cellValue}>{p ? p.sent : "–"}</div>
              <div className={classes.cellNote}>{p ? `${p.avgSent} por atendimento` : ""}</div>
            </div>
            <div className={classes.cell}>
              <div className={classes.cellLabel}><GraduationCap size={14} /> Matrículas</div>
              <div className={classes.cellValue}>{p ? p.enrolled : "–"}</div>
              <div className={classes.cellNote}>{p ? `${p.closed} finalizadas` : ""}</div>
            </div>
            <div className={classes.cell}>
              <div className={classes.cellLabel}><Timer size={14} /> 1ª resposta</div>
              <div className={classes.cellValue}>{p && p.avgFirstResponse !== null ? minutes(p.avgFirstResponse) : "—"}</div>
              <div className={classes.cellNote}>{p && p.avgFirstResponse === null ? "sem respostas no período" : "média, em horário de trabalho"}</div>
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
              <h2 className={classes.panelTitle}>Mensagens por hora</h2>
              <div className={classes.legend}>
                <span><span className={classes.dot} style={{ background: "#0693E3" }} />Recebidas</span>
                <span><span className={classes.dot} style={{ background: "#0B4279" }} />Enviadas</span>
              </div>
              <div className={classes.chartBox}>
                <ResponsiveContainer>
                  <BarChart data={hourData} margin={{ top: 6, right: 4, left: -22, bottom: 0 }} barGap={2}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.35} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                    <Tooltip cursor={{ fill: "rgba(127,127,127,.08)" }} formatter={(v, n) => [v, n === "received" ? "Recebidas" : "Enviadas"]} />
                    <Bar dataKey="received" fill="#0693E3" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="sent" fill="#0B4279" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className={classes.panel}>
              <h2 className={classes.panelTitle}>Últimos 7 dias</h2>
              <div className={classes.panelSub}>Atendimentos por dia. Clique numa barra para ver o dia.</div>
              <div className={classes.chartBox}>
                <ResponsiveContainer>
                  <BarChart data={weekData} margin={{ top: 6, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.35} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                    <Tooltip cursor={{ fill: "rgba(127,127,127,.08)" }} formatter={(v) => [v, "Atendimentos"]} />
                    <Bar dataKey="attendances" radius={[5, 5, 0, 0]} onClick={(d) => { if (d) { setDays(1); setDate(d.date >= today ? "" : d.date); } }} style={{ cursor: "pointer" }}>
                      {weekData.map((w) => <Cell key={w.date} fill={w.date === shown ? "#0B4279" : "#9cc9ec"} />)}
                    </Bar>
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
    </div>
  );
};

export default Dashboard;
