import React from "react";
import { makeStyles } from "@material-ui/core";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// The charts of the CRM panel: plain shapes, one colour per meaning, no glow. Blue is "leads", green is "enrolled", red is "lost".
export const COLORS = { leads: "#0693E3", brand: "#0B4279", won: "#16a34a", lost: "#dc2626", warn: "#d97706", muted: "#64748b" };

const useStyles = makeStyles((theme) => {
  const dark = theme.palette.type === "dark";
  const track = dark ? "rgba(255,255,255,.08)" : "rgba(15,23,42,.07)";
  return {
    tip: {
      background: dark ? "#0c1626" : "#ffffff", border: `1px solid ${dark ? "rgba(255,255,255,.14)" : "#d7e0ec"}`, borderRadius: 10, padding: "8px 10px", fontSize: 12.5,
      boxShadow: "0 8px 24px -12px rgba(15,23,42,.35)", color: theme.palette.text.primary,
    },
    tipRow: { display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between", fontVariantNumeric: "tabular-nums" },
    dot: { width: 8, height: 8, borderRadius: 2, flex: "none" },
    rank: { display: "grid", gap: 10 },
    rankRow: { display: "grid", gridTemplateColumns: "minmax(90px, 38%) 1fr auto", alignItems: "center", gap: 12, fontSize: 13.5, minWidth: 0 },
    rankName: { display: "flex", alignItems: "center", gap: 8, minWidth: 0, "& > span:last-child": { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
    rankTrack: { height: 10, borderRadius: 999, background: track, overflow: "hidden", position: "relative" },
    rankFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 999, transition: "width .6s cubic-bezier(.2,.8,.2,1)", "@media (prefers-reduced-motion: reduce)": { transition: "none" } },
    rankValue: { fontVariantNumeric: "tabular-nums", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap", "& small": { fontWeight: 500, fontSize: 12, opacity: 0.7, marginLeft: 6 } },
    funnel: { display: "grid", gap: 6 },
    funnelRow: { display: "grid", gridTemplateColumns: "minmax(110px, 26%) 1fr", gap: 12, alignItems: "center", minWidth: 0 },
    funnelName: { fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    funnelTrack: { position: "relative", height: 34, borderRadius: 8, background: track },
    funnelBar: { height: "100%", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 10px", color: "#fff", fontWeight: 800, fontSize: 14, fontVariantNumeric: "tabular-nums", transition: "width .7s cubic-bezier(.2,.8,.2,1)", minWidth: 38, "@media (prefers-reduced-motion: reduce)": { transition: "none" } },
    funnelStep: { position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, fontVariantNumeric: "tabular-nums" },
    longText: { [theme.breakpoints.down("xs")]: { display: "none" } },
    stack: { display: "flex", height: 12, borderRadius: 999, overflow: "hidden", background: track, gap: 2 },
    legend: { display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 8, fontSize: 12.5, color: theme.palette.text.secondary, fontVariantNumeric: "tabular-nums", "& b": { color: theme.palette.text.primary } },
    legendItem: { display: "inline-flex", alignItems: "center", gap: 6 },
    empty: { padding: theme.spacing(3, 1), textAlign: "center", color: theme.palette.text.secondary, fontSize: 13 },
  };
});

const num = (v) => Number(v || 0).toLocaleString("pt-BR");
const pct1 = (a, b) => (b ? `${((a / b) * 100).toFixed(1).replace(".", ",")}%` : "—");

const Tip = ({ active, payload, label, title, unit }) => {
  const c = useStyles();
  if (!active || !payload || !payload.length) return null;
  const head = title ? title(payload[0].payload) : label;
  return (
    <div className={c.tip}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{head}</div>
      {payload.filter((p) => p.value !== undefined && p.value !== null).map((p) => (
        <div key={p.dataKey} className={c.tipRow}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className={c.dot} style={{ background: p.color || p.stroke }} />{p.name}</span>
          <b>{typeof p.value === "number" && unit === "percent" ? `${p.value.toFixed(1).replace(".", ",")}%` : num(p.value)}</b>
        </div>
      ))}
    </div>
  );
};

// A small chart under a number: an area (a count that moves) or bars (events by day). `label` is the text for people who do not see it.
export const Trend = ({ data, color, kind = "area", height = 64, name = "Total", unit, label }) => (
  <div style={{ height, marginTop: 8 }} role="img" aria-label={label || name}>
    <ResponsiveContainer>
      {kind === "bar" ? (
        <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap={2}>
          <Tooltip cursor={{ fill: "rgba(100,116,139,.12)" }} content={<Tip title={(p) => p.full || p.day} unit={unit} />} />
          <Bar dataKey="v" name={name} fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      ) : (
        <AreaChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
          <defs>
            <linearGradient id={`tr-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.28} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient>
          </defs>
          <YAxis hide domain={[0, (max) => Math.max(1, max)]} />
          <Tooltip cursor={{ stroke: color, strokeOpacity: 0.3 }} content={<Tip title={(p) => p.full || p.day} unit={unit} />} />
          <Area type="monotone" dataKey="v" name={name} stroke={color} strokeWidth={2} fill={`url(#tr-${color.replace("#", "")})`} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
        </AreaChart>
      )}
    </ResponsiveContainer>
  </div>
);

// The main chart: leads by day (area), enrollments by day (bars), and the weekly average of the leads as a quiet line.
export const DailyChart = ({ series, height = 280 }) => {
  const rows = series.map((r, i) => {
    const from = Math.max(0, i - 6);
    const win = series.slice(from, i + 1);
    return { ...r, full: r.key ? r.key.split("-").reverse().join("/") : r.day, avg: Math.round((win.reduce((a, x) => a + (x.leads || 0), 0) / win.length) * 10) / 10 };
  });
  const total = rows.length;
  const every = Math.max(0, Math.ceil(total / 8) - 1);
  return (
    <div style={{ height }} role="img" aria-label={`Leads captados e matrículas confirmadas por dia, ${total} dias`}>
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="daily-leads" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS.leads} stopOpacity={0.22} /><stop offset="100%" stopColor={COLORS.leads} stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="0" stroke="rgba(100,116,139,.18)" />
          <XAxis dataKey="day" interval={every} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748b" }} tickMargin={8} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748b" }} width={44} />
          <Tooltip cursor={{ stroke: "rgba(100,116,139,.35)" }} content={<Tip title={(p) => p.full} />} />
          <Area type="monotone" dataKey="leads" name="Leads captados" stroke={COLORS.leads} strokeWidth={2.25} fill="url(#daily-leads)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          <Bar dataKey="matriculas" name="Matrículas" fill={COLORS.won} radius={[3, 3, 0, 0]} barSize={total > 45 ? 3 : 8} isAnimationActive={false} />
          <Line type="monotone" dataKey="avg" name="Média de 7 dias (leads)" stroke={COLORS.brand} strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export const ChartLegend = ({ items }) => {
  const c = useStyles();
  return (
    <div className={c.legend} style={{ marginTop: 0, marginBottom: 6 }}>
      {items.map(([color, text, dashed]) => (
        <span key={text} className={c.legendItem}>
          <span className={c.dot} style={dashed ? { background: "transparent", border: `1.5px dashed ${color}`, height: 0, width: 14, borderRadius: 0 } : { background: color }} />{text}
        </span>
      ))}
    </div>
  );
};

// Names with a bar and a value, biggest first: where the leads come from, which courses are searched, why leads are lost.
// `rows`: [{ key, name, value, bar (0-100), note, color, icon }]
export const RankBars = ({ rows, empty = "Sem dados no período." }) => {
  const c = useStyles();
  if (!rows.length) return <div className={c.empty}>{empty}</div>;
  return (
    <div className={c.rank}>
      {rows.map((r) => (
        <div key={r.key || r.name} className={c.rankRow}>
          <span className={c.rankName} title={r.name}>{r.icon || null}<span>{r.name}</span></span>
          <span className={c.rankTrack} role="img" aria-label={`${r.name}: ${r.value}${r.note ? `, ${r.note}` : ""}`}>
            <span className={c.rankFill} style={{ width: `${Math.max(2, Math.min(100, r.bar))}%`, background: r.color || COLORS.leads }} />
          </span>
          <span className={c.rankValue}>{r.value}{r.note ? <small>{r.note}</small> : null}</span>
        </div>
      ))}
    </div>
  );
};

// The funnel: one bar per stage, as wide as the leads that reached it; the share of the previous stage is written inside the row.
export const FunnelBars = ({ steps }) => {
  const c = useStyles();
  const max = Math.max(1, ...steps.map((s) => s.reached));
  return (
    <div className={c.funnel}>
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].reached : 0;
        const won = s.type === "won";
        return (
          <div key={s.id} className={c.funnelRow}>
            <span className={c.funnelName} title={s.name}>{s.name}</span>
            <div className={c.funnelTrack} role="img" aria-label={`${s.name}: ${s.reached} leads${i > 0 && prev ? `, ${pct1(s.reached, prev)} da etapa anterior` : ""}`}>
              {s.reached > 0
                ? <div className={c.funnelBar} style={{ width: `${Math.max(3, (s.reached / max) * 100)}%`, background: won ? COLORS.won : COLORS.leads }}>{num(s.reached)}</div>
                : <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, fontWeight: 700, opacity: 0.5 }}>0</span>}
              {i > 0 && prev > 0 && s.reached > 0 && (s.reached / max) < 0.8 && <span className={c.funnelStep}>{pct1(s.reached, prev)}<span className={c.longText}> da etapa anterior</span></span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// A bar split in parts (what the leads of the period are now), with the numbers under it.
export const SplitBar = ({ parts }) => {
  const c = useStyles();
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div>
      <div className={c.stack} role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(", ")}>
        {total > 0 && parts.filter((p) => p.value > 0).map((p) => <span key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color, minWidth: 4, borderRadius: 999 }} title={`${p.label}: ${p.value}`} />)}
      </div>
      <div className={c.legend}>
        {parts.map((p) => <span key={p.label} className={c.legendItem}><span className={c.dot} style={{ background: p.color }} />{p.label} <b>{num(p.value)}</b></span>)}
      </div>
    </div>
  );
};
