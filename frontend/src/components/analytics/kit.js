import React, { useCallback, useEffect, useRef, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import MuiTooltip from "@material-ui/core/Tooltip";
import { BarsChart, TimeChart } from "../charts";
import { CalendarClock, CheckCheck, Clock, Eye, FileText, Flag, Inbox, MessageSquare, Send, Target, TrendingUp, AlertTriangle, ListTodo, UserCheck, Users, Zap } from "lucide-react";

import api from "../../services/api";
import openSocket from "../../services/socket-io";
import toastError from "../../errors/toastError";
import NumberTicker from "../NumberTicker";
import "../../styles/dash.css";

// Shared by the management center and the consultant's own screen: same tokens, same cards, same period filter, same live refresh.
// Nothing here computes a number: every figure comes from /analytics (one service, one set of definitions).

export const BRAND = { blue: "#0B4279", cerulean: "#0693E3", gorse: "#FEF84C" };

export const useKit = makeStyles((theme) => ({
  page: { padding: theme.spacing(3), maxWidth: 1480, margin: "0 auto", [theme.breakpoints.down("xs")]: { padding: theme.spacing(1.5) } },
  head: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: theme.spacing(2.5) },
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 },
  lead: { fontSize: 13.5, color: "var(--text-2)", marginTop: 4, maxWidth: 720 },
  panel: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: theme.spacing(2.25, 2.5), minWidth: 0, position: "relative", boxShadow: "var(--shadow-card)" },
  hero: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: theme.spacing(3), minWidth: 0 },
  h2: { fontSize: 14, fontWeight: 650, margin: 0, display: "flex", alignItems: "center", gap: 8, letterSpacing: "-0.01em" },
  sub: { fontSize: 12.5, color: "var(--text-2)", marginTop: 3 },
  grid: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" },
  cols: { display: "grid", gap: theme.spacing(2), gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" },
  kpi: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "14px 16px", minWidth: 0, position: "relative", boxShadow: "var(--shadow-card)", transition: "border-color .15s ease", "&:hover": { borderColor: "var(--line-strong)" } },
  kpiIcon: { display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none", width: 28, height: 28, borderRadius: 8, color: "var(--tone, var(--text-2))", background: "color-mix(in srgb, var(--tone, #64748b) 12%, transparent)" },
  kpiLabel: { fontSize: 12.5, fontWeight: 550, color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 28 },
  grid4: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "repeat(4, minmax(0, 1fr))", [theme.breakpoints.down("sm")]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }, [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr" } },
  grid5: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "repeat(5, minmax(0, 1fr))", [theme.breakpoints.down("md")]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }, [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr" } },
  kpiValue: { fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", lineHeight: 1.15, marginTop: 6 },
  kpiHint: { fontSize: 12, color: "var(--text-2)", marginTop: 4 },
  chips: { display: "inline-flex", gap: 2, padding: 3, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--line)", flexWrap: "wrap" },
  chip: { border: 0, borderRadius: 7, padding: "5px 12px", fontFamily: "inherit", fontSize: 13, fontWeight: 550, cursor: "pointer", background: "transparent", color: "var(--text-2)", "&:hover": { color: "var(--text-1)" } },
  chipOn: { background: "var(--surface)", color: "var(--text-1) !important", boxShadow: "0 1px 2px rgba(15,23,42,.08), 0 0 0 1px var(--line)" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5, "& th": { textAlign: "left", fontSize: 12, color: "var(--text-2)", fontWeight: 550, padding: "8px 10px", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }, "& td": { padding: "10px", borderBottom: "1px solid var(--line)", verticalAlign: "middle" }, "& .r": { textAlign: "right", fontVariantNumeric: "tabular-nums" }, "& tbody tr": { cursor: "pointer" }, "& tbody tr:hover": { background: "var(--surface-2)" } },
  scroll: { overflowX: "auto" },
  bar: { height: 6, borderRadius: 999, background: "var(--track)", overflow: "hidden" },
  fill: { height: "100%", borderRadius: 999, background: "var(--c-leads)", transition: "width .5s cubic-bezier(.2,.8,.2,1)" },
  btn: { border: "1px solid var(--line)", background: "var(--surface)", color: "inherit", borderRadius: "var(--radius-ctl)", padding: "6px 12px", fontFamily: "inherit", fontSize: 13, fontWeight: 550, cursor: "pointer", "&:hover": { background: "var(--surface-2)", borderColor: "var(--line-strong)" } },
  btnPrimary: { border: 0, background: "var(--c-brand)", color: "#fff", borderRadius: "var(--radius-ctl)", padding: "7px 14px", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", "&:disabled": { opacity: 0.6, cursor: "default" } },
  row: { display: "flex", alignItems: "center", gap: 10, width: "100%", border: 0, background: "transparent", color: "inherit", fontFamily: "inherit", fontSize: 13.5, padding: "8px 0", borderTop: "1px solid var(--line)", textAlign: "left", cursor: "pointer", "&:first-of-type": { borderTop: 0 } },
  input: { border: "1px solid var(--line)", background: "var(--surface)", color: "inherit", borderRadius: "var(--radius-ctl)", padding: "5px 8px", fontFamily: "inherit", fontSize: 13, minWidth: 0 },
  live: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-2)" },
}));

// what each indicator means, in one sentence, shown under the number (the ⓘ has the complete definition from the server)
export const KPI_COLOR = {
  messagesSent: "#0693E3", attendances: "#0B4279", reactivated: "#14b8a6", leadsWorked: "#8b5cf6", pendingReply: "#d97706",
  inProgress: "#0693E3", tasksOpen: "#6366f1", tasksOverdue: "#dc2626", tasksDone: "#16a34a", followUpsDue: "#f97316",
  proposalsSent: "#8b5cf6", proposalsViewed: "#14b8a6", enrollments: "#16a34a", conversion: "#8b5cf6",
};

// one icon per indicator: read the card before reading the label
export const KPI_ICON = {
  messagesSent: Send, attendances: MessageSquare, reactivated: Zap, leadsWorked: Users, pendingReply: Inbox, inProgress: Clock,
  tasksOpen: ListTodo, tasksOverdue: AlertTriangle, tasksDone: CheckCheck, followUpsDue: CalendarClock, proposalsSent: FileText,
  proposalsViewed: Eye, enrollments: UserCheck, conversion: TrendingUp, firstContactMinutes: Clock,
};

export const SHORT = {
  messagesSent: "Mensagens que pessoas digitaram e enviaram pelo sistema. Não conta IA, robôs nem abrir uma conversa.",
  attendances: "Conversas de clientes diferentes em que houve ao menos uma mensagem humana no período.",
  reactivated: "Conversas retomadas por uma pessoa depois de 7 dias ou mais sem nenhuma mensagem.",
  leadsWorked: "Leads em que alguém registrou anotação, mudou a etapa, fez contato ou enviou mensagem.",
  pendingReply: "Conversas abertas em que o cliente falou por último e ainda espera resposta.",
  inProgress: "Conversas com status Atendendo que estão com a pessoa.",
  tasksOpen: "Tarefas combinadas com leads que ainda não foram concluídas.",
  tasksOverdue: "Tarefas abertas cujo prazo já passou. Clique em Alertas para ver quais são.",
  tasksDone: "Tarefas concluídas no período.",
  followUpsDue: "Leads com o próximo contato marcado para hoje ou antes.",
  proposalsSent: "Propostas enviadas ao candidato no período.",
  proposalsViewed: "Propostas que o candidato abriu no período.",
  enrollments: "Matrículas confirmadas no período. É a mesma regra das Metas.",
  conversion: "Matrículas divididas pelos leads trabalhados no período.",
  firstContactMinutes: "Média, só em horário comercial, entre o cadastro do lead e o primeiro contato. Ideal: até 15 minutos.",
};

export const num = (v) => Number(v || 0).toLocaleString("pt-BR");
// minutes become "12 min", "3 h 20 min" or "2 d": a number that is read at a glance
export const minutesText = (v) => (v < 60 ? `${Math.round(v)} min` : v < 1440 ? `${Math.floor(v / 60)} h${Math.round(v % 60) ? ` ${Math.round(v % 60)} min` : ""}` : `${Math.round((v / 1440) * 10) / 10} d`.replace(".", ","));
export const fmt = (v, unit) => (v === null || v === undefined ? "—" : unit === "percent" ? `${String(v).replace(".", ",")}%` : unit === "minutes" ? minutesText(v) : num(v));

// one signal from the server (no numbers inside) makes the screen read the numbers again, through the same API that applies the permissions
export const useAnalytics = (path, params, enabled = true) => {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const key = JSON.stringify(params || {});
  const timer = useRef(null);
  const seq = useRef(0);

  const load = useCallback(() => {
    if (!enabled) return Promise.resolve();
    const mine = ++seq.current;
    return api
      .get(path, { params: JSON.parse(key) })
      .then(({ data }) => { if (mine === seq.current) setState({ data, loading: false, error: null }); })
      .catch((err) => { if (mine === seq.current) { setState((s) => ({ ...s, loading: false, error: err })); toastError(err); } });
  }, [path, key, enabled]);

  useEffect(() => { setState((s) => ({ ...s, loading: true })); load(); }, [load]);

  useEffect(() => {
    if (!enabled) return undefined;
    const socket = openSocket("analytics-live");
    const again = () => { clearTimeout(timer.current); timer.current = setTimeout(load, 900); };
    socket.on("connect", () => socket.emit("joinNotification"));
    ["analytics", "appMessage", "ticket", "lead"].forEach((e) => socket.on(e, again));
    const poll = setInterval(load, 60000);
    return () => { clearTimeout(timer.current); clearInterval(poll); socket.disconnect(); };
  }, [load, enabled]);

  return { ...state, reload: load };
};

let defsCache = null;
export const useDefinitions = () => {
  const [defs, setDefs] = useState(defsCache);
  useEffect(() => {
    if (defsCache) return;
    api.get("/analytics/definitions").then(({ data }) => { defsCache = Object.fromEntries(data.kpis.map((k) => [k.key, k])); setDefs(defsCache); }).catch(() => undefined);
  }, []);
  return defs || {};
};

export const PeriodPicker = ({ value, onChange }) => {
  const c = useKit();
  const opts = [["today", "Hoje"], ["week", "7 dias"], ["month", "Este mês"], ["custom", "Período"]];
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span className={c.chips} role="group" aria-label="Período">
        {opts.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={value.range === k} className={`${c.chip} ${value.range === k ? c.chipOn : ""}`} onClick={() => onChange({ ...value, range: k })}>{label}</button>
        ))}
      </span>
      {value.range === "custom" && (
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input aria-label="De" type="date" className={c.input} value={value.from || ""} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <span>até</span>
          <input aria-label="Até" type="date" className={c.input} value={value.to || ""} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </span>
      )}
    </span>
  );
};

export const periodParams = (p) => (p.range === "custom" ? { range: "custom", from: p.from, to: p.to } : { range: p.range });

export const Kpi = ({ k, value, def, hint, tone }) => {
  const c = useKit();
  const unit = def && def.unit;
  // the explanation appears at once when the pointer touches the card (no waiting for the browser's own tooltip)
  const help = SHORT[k] || (def && def.description) || "";
  return (
    <MuiTooltip title={help} enterDelay={0} leaveDelay={0} placement="top" arrow disableHoverListener={!help}>
      <div className={c.kpi} data-kpi={k} style={{ cursor: help ? "help" : undefined, "--tone": tone || KPI_COLOR[k] || "#0693E3" }}>
        <div className={c.kpiLabel}>
          <span>{(def && def.label) || k}</span>
          <span className={c.kpiIcon} aria-hidden="true">{(() => { const I = KPI_ICON[k] || Target; return <I size={17} />; })()}</span>
        </div>
        <div className={c.kpiValue} style={tone ? { color: tone } : undefined}>
          {typeof value === "number" && unit !== "percent" && unit !== "minutes" ? <NumberTicker value={value} format={(n) => num(n)} /> : fmt(value, unit)}
        </div>
        {hint ? <div className={c.kpiHint}>{hint}</div> : null}
      </div>
    </MuiTooltip>
  );
};

// the title of a block with one line saying what it shows
export const BlockTitle = ({ icon, title, help }) => {
  const c = useKit();
  return (
    <div style={{ marginBottom: 6 }}>
      <h2 className={c.h2}>{icon}{title}</h2>
      {help ? <div className={c.sub}>{help}</div> : null}
    </div>
  );
};

export const PRESENCE = {
  active: { label: "Ativo agora", color: "#16a34a" },
  idle: { label: "No horário, sem atividade", color: "#d97706" },
  off: { label: "Fora do horário", color: "#94a3b8" },
};

export const PresenceDot = ({ state }) => {
  const p = PRESENCE[state] || PRESENCE.off;
  return <span title={p.label} aria-label={p.label} style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: p.color, marginRight: 8 }} />;
};

const short = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");
const full = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

// the production of the team over the days: the same flat chart of the whole system (components/charts)
export const HistoryChart = ({ series, height = 200 }) => (
  <TimeChart data={(series || []).map((s) => ({ ...s, label: short(s.day) }))} height={height} title={(p) => full(p.day)}
    series={[{ key: "messagesSent", name: "Mensagens", color: "leads", kind: "area" }, { key: "attendances", name: "Atendimentos", color: "violet", kind: "line" }, { key: "enrollments", name: "Matrículas", color: "won", kind: "line" }]} />
);

export const CompareBars = ({ data, keys, height = 240 }) => <BarsChart data={data} keys={keys} height={height} />;

export const Progress = ({ value, max, color }) => {
  const c = useKit();
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <div className={c.bar} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className={c.fill} style={{ width: `${pct}%`, ...(color ? { background: color } : {}) }} /></div>;
};
