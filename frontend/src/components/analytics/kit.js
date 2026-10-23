import React, { useCallback, useEffect, useRef, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import MuiTooltip from "@material-ui/core/Tooltip";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Info } from "lucide-react";

import api from "../../services/api";
import openSocket from "../../services/socket-io";
import toastError from "../../errors/toastError";
import { tint } from "../../utils/color";
import NumberTicker from "../NumberTicker";
import "../../styles/dash.css";

// Shared by the management center and the consultant's own screen: same tokens, same cards, same period filter, same live refresh.
// Nothing here computes a number: every figure comes from /analytics (one service, one set of definitions).

export const BRAND = { blue: "#0B4279", cerulean: "#0693E3", gorse: "#FEF84C" };

export const useKit = makeStyles((theme) => {
  const dark = theme.palette.type === "dark";
  const line = dark ? "rgba(255,255,255,.09)" : "#cfd9e8";
  const soft = dark ? "rgba(255,255,255,.04)" : "#f6f8fb";
  return {
    page: { padding: theme.spacing(2.5), maxWidth: 1480, margin: "0 auto", [theme.breakpoints.down("xs")]: { padding: theme.spacing(1.5) } },
    head: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: theme.spacing(2.5) },
    h1: { fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 },
    lead: { fontSize: 14, color: theme.palette.text.secondary, marginTop: 4, maxWidth: 720 },
    panel: { background: "var(--dash-glass, #fff)", border: "1px solid var(--dash-line, #d7e3f2)", borderRadius: 20, padding: theme.spacing(2.5), minWidth: 0, position: "relative", overflow: "hidden", backdropFilter: "blur(14px) saturate(150%)", boxShadow: dark ? "0 1px 0 rgba(255,255,255,.06) inset, 0 24px 48px -28px rgba(0,0,0,.9)" : "0 1px 0 rgba(255,255,255,.6) inset, 0 18px 40px -26px var(--dash-glow, rgba(6,147,227,.22))", animation: "dash-rise .55s cubic-bezier(.22,1,.36,1) both", transition: "border-color .25s ease, box-shadow .25s ease", "&:hover": { borderColor: "color-mix(in srgb, var(--dash-accent, #0693e3) 50%, var(--dash-line, #d7e3f2))" } },
    hero: { background: dark ? "#0f1c31" : "#ffffff", border: `1px solid ${line}`, borderRadius: 14, padding: theme.spacing(3), minWidth: 0 },
    h2: { fontSize: 14.5, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8, letterSpacing: "-0.01em" },
    sub: { fontSize: 12.5, color: theme.palette.text.secondary, marginTop: 2 },
    grid: { display: "grid", gap: theme.spacing(2), gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" },
    cols: { display: "grid", gap: theme.spacing(2), gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" },
    kpi: { background: "var(--dash-glass, #fff)", border: "1px solid var(--dash-line, #d7e3f2)", borderRadius: 20, padding: "16px 18px 14px", minWidth: 0, position: "relative", overflow: "hidden", backdropFilter: "blur(14px) saturate(150%)", boxShadow: dark ? "0 1px 0 rgba(255,255,255,.06) inset, 0 24px 48px -28px rgba(0,0,0,.9)" : "0 1px 0 rgba(255,255,255,.6) inset, 0 18px 40px -26px var(--dash-glow, rgba(6,147,227,.22))", animation: "dash-rise .55s cubic-bezier(.22,1,.36,1) both", transition: "transform .25s ease, box-shadow .25s ease, border-color .25s ease", "&:hover": { transform: "translateY(-3px)", borderColor: "color-mix(in srgb, var(--tone, #0693e3) 55%, var(--dash-line, #d7e3f2))", boxShadow: "0 28px 56px -26px var(--tone, rgba(6,147,227,.5))" }, "&::before": { content: '""', position: "absolute", left: 0, right: 0, top: 0, height: 3, background: "linear-gradient(90deg, var(--tone, #0693e3), transparent 85%)", transformOrigin: "left", animation: "dash-grow .9s cubic-bezier(.22,1,.36,1) both" }, "&::after": { content: '""', position: "absolute", right: -34, top: -34, width: 130, height: 130, borderRadius: "50%", background: "radial-gradient(closest-side, color-mix(in srgb, var(--tone, #0693e3) 26%, transparent), transparent)", pointerEvents: "none" } },
    kpiLabel: { fontSize: 12.5, color: theme.palette.text.secondary, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, minHeight: 34 },
    grid4: { display: "grid", gap: theme.spacing(2), gridTemplateColumns: "repeat(4, minmax(0, 1fr))", [theme.breakpoints.down("sm")]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }, [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr" } },
    grid5: { display: "grid", gap: theme.spacing(2), gridTemplateColumns: "repeat(5, minmax(0, 1fr))", [theme.breakpoints.down("md")]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }, [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr" } },
    kpiValue: { fontSize: 34, fontWeight: 800, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", lineHeight: 1.1, marginTop: 8, position: "relative", zIndex: 1 },
    kpiHint: { fontSize: 12, color: theme.palette.text.secondary, marginTop: 2 },
    chips: { display: "inline-flex", gap: 4, padding: 4, borderRadius: 999, background: dark ? soft : "#fff", border: `1px solid ${line}`, flexWrap: "wrap" },
    chip: { border: 0, borderRadius: 999, padding: "6px 14px", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", background: "transparent", color: theme.palette.text.secondary, "&:hover": { color: theme.palette.text.primary } },
    chipOn: { background: BRAND.blue, color: "#fff !important" },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 14, "& th": { textAlign: "left", fontSize: 12, color: theme.palette.text.secondary, fontWeight: 600, padding: "8px 10px", borderBottom: `1px solid ${line}`, whiteSpace: "nowrap" }, "& td": { padding: "10px", borderBottom: `1px solid ${line}`, verticalAlign: "middle" }, "& .r": { textAlign: "right", fontVariantNumeric: "tabular-nums" }, "& tbody tr": { cursor: "pointer" }, "& tbody tr:hover": { background: soft } },
    scroll: { overflowX: "auto" },
    bar: { height: 8, borderRadius: 999, background: soft, overflow: "hidden" },
    fill: { height: "100%", borderRadius: 999, background: BRAND.cerulean, transition: "width .5s cubic-bezier(.2,.8,.2,1)" },
    btn: { border: `1px solid ${line}`, background: "transparent", color: "inherit", borderRadius: 10, padding: "7px 14px", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", "&:hover": { background: soft } },
    btnPrimary: { border: 0, background: BRAND.blue, color: "#fff", borderRadius: 10, padding: "8px 16px", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", "&:disabled": { opacity: 0.6, cursor: "default" } },
    row: { display: "flex", alignItems: "center", gap: 10, width: "100%", border: 0, background: "transparent", color: "inherit", fontFamily: "inherit", fontSize: 14, padding: "8px 0", borderTop: `1px solid ${line}`, textAlign: "left", cursor: "pointer", "&:first-of-type": { borderTop: 0 } },
    input: { border: `1px solid ${line}`, background: "transparent", color: "inherit", borderRadius: 8, padding: "6px 8px", fontFamily: "inherit", fontSize: 13, minWidth: 0 },
    live: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: theme.palette.text.secondary },
  };
});

// what each indicator means, in one sentence, shown under the number (the ⓘ has the complete definition from the server)
export const KPI_COLOR = {
  messagesSent: "#0693E3", attendances: "#0B4279", reactivated: "#14b8a6", leadsWorked: "#8b5cf6", pendingReply: "#d97706",
  inProgress: "#0693E3", tasksOpen: "#6366f1", tasksOverdue: "#dc2626", tasksDone: "#16a34a", followUpsDue: "#f97316",
  proposalsSent: "#8b5cf6", proposalsViewed: "#14b8a6", enrollments: "#16a34a", conversion: "#8b5cf6",
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
          <span style={{ display: "inline-flex", opacity: 0.55 }}><Info size={13} /></span>
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

const glowId = (k) => `dg-${k}`;
const Defs = ({ items }) => (
  <defs>
    {items.map(([k, color]) => (
      <linearGradient key={k} id={glowId(k)} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity={0.55} />
        <stop offset="100%" stopColor={color} stopOpacity={0.02} />
      </linearGradient>
    ))}
  </defs>
);

export const HistoryChart = ({ series, height = 200 }) => (
  <div style={{ width: "100%", height }}>
    <ResponsiveContainer>
      <AreaChart data={(series || []).map((s) => ({ ...s, label: short(s.day) }))} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <Defs items={[["m", BRAND.cerulean], ["a", "#6366f1"], ["e", "#16a34a"]]} />
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip />
        <Area type="monotone" dataKey="messagesSent" name="Mensagens" stroke={BRAND.cerulean} strokeWidth={2.4} fill={`url(#${glowId("m")})`} animationDuration={1100} animationEasing="ease-out" />
        <Area type="monotone" dataKey="attendances" name="Atendimentos" stroke="#6366f1" strokeWidth={2.4} fill={`url(#${glowId("a")})`} animationDuration={1300} animationEasing="ease-out" />
        <Area type="monotone" dataKey="enrollments" name="Matrículas" stroke="#16a34a" strokeWidth={2.4} fill={`url(#${glowId("e")})`} animationDuration={1500} animationEasing="ease-out" />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);

export const CompareBars = ({ data, keys, height = 240 }) => (
  <div style={{ width: "100%", height }}>
    <ResponsiveContainer>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={6}>
        <Defs items={keys.map(([key, , color]) => [key, color])} />
        <CartesianGrid vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "rgba(34,211,238,.08)" }} />
        {keys.map(([key, name, color], i) => <Bar key={key} dataKey={key} name={name} fill={`url(#${glowId(key)})`} stroke={color} strokeWidth={1.4} radius={[8, 8, 2, 2]} animationDuration={900 + i * 250} animationEasing="ease-out" />)}
      </BarChart>
    </ResponsiveContainer>
  </div>
);

export const Progress = ({ value, max, color }) => {
  const c = useKit();
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <div className={c.bar} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className={c.fill} style={{ width: `${pct}%`, ...(color ? { background: color } : {}) }} /></div>;
};
