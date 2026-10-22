import React, { useCallback, useEffect, useRef, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Info } from "lucide-react";

import api from "../../services/api";
import openSocket from "../../services/socket-io";
import toastError from "../../errors/toastError";

// Shared by the management center and the consultant's own screen: same tokens, same cards, same period filter, same live refresh.
// Nothing here computes a number: every figure comes from /analytics (one service, one set of definitions).

export const BRAND = { blue: "#0B4279", cerulean: "#0693E3", gorse: "#FEF84C" };

export const useKit = makeStyles((theme) => {
  const dark = theme.palette.type === "dark";
  const line = dark ? "rgba(255,255,255,.09)" : "#e3e9f1";
  const soft = dark ? "rgba(255,255,255,.04)" : "#f6f8fb";
  return {
    page: { padding: theme.spacing(2.5), maxWidth: 1480, margin: "0 auto", [theme.breakpoints.down("xs")]: { padding: theme.spacing(1.5) } },
    head: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: theme.spacing(2.5) },
    h1: { fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 },
    lead: { fontSize: 14, color: theme.palette.text.secondary, marginTop: 4, maxWidth: 720 },
    panel: { background: dark ? "#0f1826" : "#ffffff", border: `1px solid ${line}`, borderRadius: 16, padding: theme.spacing(2.25), minWidth: 0 },
    hero: { background: `linear-gradient(120deg, ${BRAND.blue} 0%, #0a5aa8 60%, ${BRAND.cerulean} 140%)`, color: "#fff", borderRadius: 20, padding: theme.spacing(3), minWidth: 0 },
    h2: { fontSize: 14.5, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8, letterSpacing: "-0.01em" },
    sub: { fontSize: 12.5, color: theme.palette.text.secondary, marginTop: 2 },
    grid: { display: "grid", gap: theme.spacing(2), gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" },
    cols: { display: "grid", gap: theme.spacing(2), gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" },
    kpi: { background: dark ? "#0f1826" : "#fff", border: `1px solid ${line}`, borderRadius: 14, padding: "14px 16px", minWidth: 0, position: "relative" },
    kpiLabel: { fontSize: 12.5, color: theme.palette.text.secondary, display: "flex", alignItems: "center", gap: 6 },
    kpiValue: { fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", lineHeight: 1.15, marginTop: 6 },
    kpiHint: { fontSize: 12, color: theme.palette.text.secondary, marginTop: 2 },
    chips: { display: "inline-flex", gap: 4, padding: 4, borderRadius: 999, background: soft, border: `1px solid ${line}`, flexWrap: "wrap" },
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
};

export const num = (v) => Number(v || 0).toLocaleString("pt-BR");
export const fmt = (v, unit) => (v === null || v === undefined ? "—" : unit === "percent" ? `${String(v).replace(".", ",")}%` : num(v));

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
  return (
    <div className={c.kpi} data-kpi={k}>
      <div className={c.kpiLabel}>
        <span>{(def && def.label) || k}</span>
        {def && <span title={def.description} style={{ display: "inline-flex", opacity: 0.55 }}><Info size={13} /></span>}
      </div>
      <div className={c.kpiValue} style={tone ? { color: tone } : undefined}>{fmt(value, unit)}</div>
      {hint || SHORT[k] ? <div className={c.kpiHint}>{hint || SHORT[k]}</div> : null}
    </div>
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

export const HistoryChart = ({ series, height = 200 }) => (
  <div style={{ width: "100%", height }}>
    <ResponsiveContainer>
      <AreaChart data={(series || []).map((s) => ({ ...s, label: short(s.day) }))} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.25)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Area type="monotone" dataKey="messagesSent" name="Mensagens" stroke={BRAND.cerulean} fill={BRAND.cerulean} fillOpacity={0.18} />
        <Area type="monotone" dataKey="attendances" name="Atendimentos" stroke={BRAND.blue} fill={BRAND.blue} fillOpacity={0.12} />
        <Area type="monotone" dataKey="enrollments" name="Matrículas" stroke="#16a34a" fill="#16a34a" fillOpacity={0.12} />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);

export const CompareBars = ({ data, keys, height = 220 }) => (
  <div style={{ width: "100%", height }}>
    <ResponsiveContainer>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.25)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip />
        {keys.map(([key, name, color]) => <Bar key={key} dataKey={key} name={name} fill={color} radius={[4, 4, 0, 0]} />)}
      </BarChart>
    </ResponsiveContainer>
  </div>
);

export const Progress = ({ value, max, color }) => {
  const c = useKit();
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <div className={c.bar} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className={c.fill} style={{ width: `${pct}%`, ...(color ? { background: color } : {}) }} /></div>;
};
