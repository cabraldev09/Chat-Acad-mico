import React, { useState } from "react";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// The one chart kit of the system (Painel do CRM, Estatísticas, Gestão Comercial, Metas, Retenção, Ambientação): flat shapes, thin lines,
// one colour per meaning (blue = leads, green = enrolled, red = lost, amber = attention), the same tooltip, legend and empty state everywhere.
// Nothing here computes a business number: the screens pass what the API answered.

// the light values (kept for the screens that still pass a colour by hand)
export const COLORS = { leads: "#0693E3", brand: "#0B4279", won: "#16a34a", lost: "#dc2626", warn: "#d97706", muted: "#64748b", violet: "#7c3aed", teal: "#0d9488" };
const DARK = { leads: "#38bdf8", brand: "#60a5fa", won: "#22c55e", lost: "#f87171", warn: "#fbbf24", muted: "#94a3b8", violet: "#a78bfa", teal: "#2dd4bf" };

// the colours of the current theme (SVG needs real values: the dark theme gets lighter tones that read on the dark surface)
export const useChartTheme = () => {
  const dark = useTheme().palette.type === "dark";
  return {
    dark,
    c: dark ? DARK : COLORS,
    grid: dark ? "rgba(148,163,184,.12)" : "rgba(100,116,139,.16)",
    axis: dark ? "#6b7a8f" : "#8a97a8",
    cursor: dark ? "rgba(148,163,184,.10)" : "rgba(100,116,139,.08)",
  };
};
// a colour given by name ("won") or by value ("#16a34a"); a light value becomes its dark tone in the dark theme
const tone = (t, color) => {
  if (!color) return t.c.leads;
  if (t.c[color]) return t.c[color];
  const key = Object.keys(COLORS).find((k) => COLORS[k].toLowerCase() === String(color).toLowerCase());
  return key ? t.c[key] : color;
};

const useStyles = makeStyles((theme) => ({
  card: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", padding: theme.spacing(2.25, 2.5), minWidth: 0, position: "relative" },
  cardHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: theme.spacing(1.75) },
  cardTitle: { fontSize: 14, fontWeight: 650, letterSpacing: "-0.01em", margin: 0, display: "flex", alignItems: "center", gap: 8, color: "var(--text-1)" },
  cardSub: { fontSize: 12.5, color: "var(--text-2)", marginTop: 3, lineHeight: 1.45 },
  tip: { background: "var(--surface)", border: "1px solid var(--line-strong)", borderRadius: 10, padding: "8px 10px", fontSize: 12.5, boxShadow: "var(--shadow-pop)", color: "var(--text-1)", minWidth: 140 },
  tipHead: { fontWeight: 650, marginBottom: 6, color: "var(--text-2)", fontSize: 12 },
  tipRow: { display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", fontVariantNumeric: "tabular-nums", lineHeight: 1.7 },
  dot: { width: 8, height: 8, borderRadius: 2, flex: "none", display: "inline-block" },
  legend: { display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 12.5, color: "var(--text-2)", fontVariantNumeric: "tabular-nums", "& b": { color: "var(--text-1)", fontWeight: 650 } },
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6, border: 0, background: "transparent", padding: 0, font: "inherit", color: "inherit", cursor: "default" },
  legendToggle: { cursor: "pointer", borderRadius: 6, padding: "2px 4px", margin: "-2px -4px", "&:hover": { color: "var(--text-1)" }, "&[aria-pressed='false']": { opacity: 0.45 } },
  rank: { display: "grid", gap: 12 },
  rankRow: { display: "grid", gridTemplateColumns: "minmax(90px, 36%) 1fr auto", alignItems: "center", gap: 12, fontSize: 13.5, minWidth: 0 },
  rankName: { display: "flex", alignItems: "center", gap: 8, minWidth: 0, color: "var(--text-1)", "& > span:last-child": { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
  rankTrack: { height: 6, borderRadius: 999, background: "var(--track)", overflow: "hidden", position: "relative" },
  rankFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 999, transition: "width .5s cubic-bezier(.2,.8,.2,1)", "@media (prefers-reduced-motion: reduce)": { transition: "none" } },
  rankValue: { fontVariantNumeric: "tabular-nums", fontWeight: 650, textAlign: "right", whiteSpace: "nowrap", "& small": { fontWeight: 500, fontSize: 12, color: "var(--text-2)", marginLeft: 6 } },
  funnel: { display: "grid", gap: 8 },
  funnelRow: { display: "grid", gridTemplateColumns: "minmax(110px, 26%) 1fr auto", gap: 12, alignItems: "center", minWidth: 0 },
  funnelName: { fontSize: 13.5, fontWeight: 550, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-1)" },
  funnelTrack: { position: "relative", height: 26, borderRadius: 6, background: "var(--track)", overflow: "hidden" },
  funnelBar: { height: "100%", borderRadius: 6, transition: "width .6s cubic-bezier(.2,.8,.2,1)", "@media (prefers-reduced-motion: reduce)": { transition: "none" } },
  funnelValue: { position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontWeight: 700, fontSize: 13, fontVariantNumeric: "tabular-nums", color: "var(--text-1)" },
  funnelStep: { fontSize: 12, color: "var(--text-2)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", minWidth: 52, textAlign: "right" },
  longText: { [theme.breakpoints.down("xs")]: { display: "none" } },
  stack: { display: "flex", height: 8, borderRadius: 999, overflow: "hidden", background: "var(--track)", gap: 2 },
  empty: { padding: theme.spacing(4, 2), textAlign: "center", color: "var(--text-2)", fontSize: 13, display: "grid", justifyItems: "center", gap: 6, "& b": { color: "var(--text-1)", fontSize: 14, fontWeight: 650 } },
  emptyIcon: { width: 40, height: 40, borderRadius: 10, display: "grid", placeItems: "center", background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text-2)", marginBottom: 4 },
  skeleton: { borderRadius: 8, background: "linear-gradient(90deg, var(--track) 25%, var(--surface-3) 37%, var(--track) 63%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s ease-in-out infinite" },
  donut: { display: "flex", alignItems: "center", gap: theme.spacing(2.5), flexWrap: "wrap" },
  donutCenter: { position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", pointerEvents: "none", "& b": { display: "block", fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", color: "var(--text-1)" }, "& small": { fontSize: 11.5, color: "var(--text-2)" } },
  ring: { position: "relative", flex: "none", "& svg": { transform: "rotate(-90deg)", display: "block" }, "& b": { position: "absolute", inset: 0, display: "grid", placeItems: "center", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--text-1)" } },
  delta: { display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 600, padding: "1px 7px", borderRadius: 999, fontVariantNumeric: "tabular-nums" },
}));

export const num = (v) => Number(v || 0).toLocaleString("pt-BR");
const pct1 = (a, b) => (b ? `${((a / b) * 100).toFixed(1).replace(".", ",")}%` : "—");
const valueText = (v, unit) => (typeof v === "number" && unit === "percent" ? `${v.toFixed(1).replace(".", ",")}%` : num(v));

// ---------------------------------------------------------------- the frame of every chart
// title, one line saying what it shows, an action on the right, and the states (loading, empty) handled the same way everywhere
export const ChartCard = ({ title, sub, icon, action, loading, empty, emptyText, height = 220, children, className, style }) => {
  const c = useStyles();
  return (
    <section className={`${c.card}${className ? ` ${className}` : ""}`} style={style}>
      {(title || action) && (
        <div className={c.cardHead}>
          <div style={{ minWidth: 0 }}>
            {title ? <h3 className={c.cardTitle}>{icon}{title}</h3> : null}
            {sub ? <div className={c.cardSub}>{sub}</div> : null}
          </div>
          {action ? <div style={{ flex: "none" }}>{action}</div> : null}
        </div>
      )}
      {loading ? <div className={c.skeleton} style={{ height }} aria-label="Carregando" /> : empty ? <EmptyState text={emptyText || "Sem dados no período."} /> : children}
    </section>
  );
};

export const EmptyState = ({ icon, title, text }) => {
  const c = useStyles();
  return (
    <div className={c.empty}>
      {icon ? <span className={c.emptyIcon} aria-hidden="true">{icon}</span> : null}
      {title ? <b>{title}</b> : null}
      {text ? <span>{text}</span> : null}
    </div>
  );
};

// a change against the previous period: green up, red down (or the other way when less is better)
export const Delta = ({ value, unit = "%", inverse }) => {
  const c = useStyles();
  const t = useChartTheme();
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const good = inverse ? value < 0 : value > 0;
  const color = value === 0 ? t.c.muted : good ? t.c.won : t.c.lost;
  return <span className={c.delta} style={{ color, background: `${color}1f` }}>{value > 0 ? "↑" : value < 0 ? "↓" : "→"} {String(Math.abs(value)).replace(".", ",")}{unit}</span>;
};

// ---------------------------------------------------------------- tooltip and legend
const Tip = ({ active, payload, label, title, unit }) => {
  const c = useStyles();
  if (!active || !payload || !payload.length) return null;
  const head = title ? title(payload[0].payload) : label;
  return (
    <div className={c.tip}>
      {head ? <div className={c.tipHead}>{head}</div> : null}
      {payload.filter((p) => p.value !== undefined && p.value !== null).map((p) => (
        <div key={p.dataKey} className={c.tipRow}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className={c.dot} style={{ background: p.color || p.stroke || p.fill }} />{p.name}</span>
          <b>{valueText(p.value, unit)}</b>
        </div>
      ))}
    </div>
  );
};
export { Tip as ChartTooltip };

// [color, text, dashed] items; with `hidden` and `onToggle` each item turns a series off and on
export const ChartLegend = ({ items, hidden, onToggle, style }) => {
  const c = useStyles();
  const t = useChartTheme();
  return (
    <div className={c.legend} style={{ marginBottom: 8, ...style }}>
      {items.map(([color, text, dashed, key]) => {
        const col = tone(t, color);
        const k = key || text;
        const on = !hidden || !hidden.includes(k);
        return (
          <button key={k} type="button" className={`${c.legendItem} ${onToggle ? c.legendToggle : ""}`} aria-pressed={onToggle ? on : undefined} onClick={onToggle ? () => onToggle(k) : undefined} tabIndex={onToggle ? 0 : -1}>
            <span className={c.dot} style={dashed ? { background: "transparent", border: `1.5px dashed ${col}`, height: 0, width: 14, borderRadius: 0 } : { background: col }} />{text}
          </button>
        );
      })}
    </div>
  );
};

const useToggle = () => {
  const [hidden, setHidden] = useState([]);
  return [hidden, (k) => setHidden((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k]))];
};
const axisProps = (t) => ({ tickLine: false, axisLine: false, tick: { fontSize: 11.5, fill: t.axis }, tickMargin: 8 });

// ---------------------------------------------------------------- the charts
// a small chart under a number: an area (a count that moves) or bars (events by day)
export const Trend = ({ data, color, kind = "area", height = 56, name = "Total", unit, label }) => {
  const t = useChartTheme();
  const col = tone(t, color);
  const id = `tr-${String(col).replace(/[^a-z0-9]/gi, "")}`;
  return (
    <div style={{ height, marginTop: 10 }} role="img" aria-label={label || name}>
      <ResponsiveContainer>
        {kind === "bar" ? (
          <BarChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }} barCategoryGap={2}>
            <Tooltip cursor={{ fill: t.cursor }} content={<Tip title={(p) => p.full || p.day} unit={unit} />} />
            <Bar dataKey="v" name={name} fill={col} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        ) : (
          <AreaChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
            <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity={0.16} /><stop offset="100%" stopColor={col} stopOpacity={0} /></linearGradient></defs>
            <YAxis hide domain={[0, (max) => Math.max(1, max)]} />
            <Tooltip cursor={{ stroke: col, strokeOpacity: 0.3 }} content={<Tip title={(p) => p.full || p.day} unit={unit} />} />
            <Area type="monotone" dataKey="v" name={name} stroke={col} strokeWidth={1.5} fill={`url(#${id})`} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} isAnimationActive={false} />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

// A chart over time with several series (area, line or bars), a legend that turns them off and the same tooltip.
// series: [{ key, name, color, kind: "area" | "line" | "bar", dashed }]
export const TimeChart = ({ data, xKey = "label", series, height = 260, title, unit, legend = true, label }) => {
  const t = useChartTheme();
  const [hidden, toggle] = useToggle();
  const rows = data || [];
  const every = Math.max(0, Math.ceil(rows.length / 8) - 1);
  const anyBar = series.some((s) => s.kind === "bar");
  return (
    <div>
      {legend && <ChartLegend items={series.map((s) => [s.color, s.name, s.dashed, s.key])} hidden={hidden} onToggle={toggle} />}
      <div style={{ height }} role="img" aria-label={label || series.map((s) => s.name).join(", ")}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 6, right: 4, left: -14, bottom: 0 }}>
            <defs>
              {series.filter((s) => (s.kind || "area") === "area").map((s) => (
                <linearGradient key={s.key} id={`tc-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={tone(t, s.color)} stopOpacity={0.14} /><stop offset="100%" stopColor={tone(t, s.color)} stopOpacity={0} /></linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke={t.grid} strokeDasharray="3 4" />
            <XAxis dataKey={xKey} interval={every} {...axisProps(t)} />
            <YAxis allowDecimals={false} width={44} {...axisProps(t)} />
            <Tooltip cursor={anyBar ? { fill: t.cursor } : { stroke: t.axis, strokeOpacity: 0.4 }} content={<Tip title={title} unit={unit} />} />
            {series.filter((s) => !hidden.includes(s.key)).map((s) => {
              const col = tone(t, s.color);
              if (s.kind === "bar") return <Bar key={s.key} dataKey={s.key} name={s.name} fill={col} radius={[3, 3, 0, 0]} barSize={rows.length > 45 ? 3 : 8} isAnimationActive={false} />;
              if (s.kind === "line") return <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={col} strokeWidth={1.5} strokeDasharray={s.dashed ? "4 4" : undefined} dot={false} activeDot={s.dashed ? false : { r: 3.5, strokeWidth: 0 }} isAnimationActive={false} />;
              return <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={col} strokeWidth={1.75} fill={`url(#tc-${s.key})`} dot={false} activeDot={{ r: 3.5, strokeWidth: 0 }} isAnimationActive={false} />;
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// leads by day (area), enrollments by day (bars) and the weekly average of the leads (dashed line)
export const DailyChart = ({ series, height = 280 }) => {
  const rows = (series || []).map((r, i, all) => {
    const win = all.slice(Math.max(0, i - 6), i + 1);
    return { ...r, full: r.key ? r.key.split("-").reverse().join("/") : r.day, avg: Math.round((win.reduce((a, x) => a + (x.leads || 0), 0) / win.length) * 10) / 10 };
  });
  return (
    <TimeChart data={rows} xKey="day" height={height} legend={false} title={(p) => p.full} label={`Leads captados e matrículas confirmadas por dia, ${rows.length} dias`}
      series={[{ key: "leads", name: "Leads captados", color: "leads", kind: "area" }, { key: "matriculas", name: "Matrículas", color: "won", kind: "bar" }, { key: "avg", name: "Média de 7 dias (leads)", color: "brand", kind: "line", dashed: true }]} />
  );
};

// Bars by category, side by side. keys: [[dataKey, name, color]]; horizontal for long names
export const BarsChart = ({ data, keys, xKey = "name", height = 240, horizontal, unit, stacked }) => {
  const t = useChartTheme();
  const [hidden, toggle] = useToggle();
  return (
    <div>
      {keys.length > 1 && <ChartLegend items={keys.map(([k, name, color]) => [color, name, false, k])} hidden={hidden} onToggle={toggle} />}
      <div style={{ height }}>
        <ResponsiveContainer>
          <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 6, right: 8, left: horizontal ? 8 : -14, bottom: 0 }} barGap={4} barCategoryGap={horizontal ? 8 : "24%"}>
            <CartesianGrid vertical={!!horizontal} horizontal={!horizontal} stroke={t.grid} strokeDasharray="3 4" />
            {horizontal
              ? <><XAxis type="number" allowDecimals={false} {...axisProps(t)} /><YAxis type="category" dataKey={xKey} width={120} {...axisProps(t)} /></>
              : <><XAxis dataKey={xKey} interval={0} {...axisProps(t)} /><YAxis allowDecimals={false} width={44} {...axisProps(t)} /></>}
            <Tooltip cursor={{ fill: t.cursor }} content={<Tip unit={unit} />} />
            {keys.filter(([k]) => !hidden.includes(k)).map(([k, name, color]) => (
              <Bar key={k} dataKey={k} name={name} fill={tone(t, color)} stackId={stacked ? "s" : undefined} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={horizontal ? 14 : 28} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// a ring split in parts with the total in the middle; parts: [{ label, value, color }]
export const Donut = ({ parts, size = 148, centerLabel = "total", legend = true }) => {
  const c = useStyles();
  const t = useChartTheme();
  const total = parts.reduce((a, p) => a + (p.value || 0), 0);
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div className={c.donut}>
      <div style={{ position: "relative", width: size, height: size, flex: "none" }} role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(", ")}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={shown.length ? shown : [{ label: "—", value: 1 }]} dataKey="value" nameKey="label" innerRadius="70%" outerRadius="100%" paddingAngle={shown.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
              {(shown.length ? shown : [{ color: "var(--track)" }]).map((p, i) => <Cell key={i} fill={shown.length ? tone(t, p.color) : t.grid} />)}
            </Pie>
            {shown.length ? <Tooltip content={<Tip />} /> : null}
          </PieChart>
        </ResponsiveContainer>
        <div className={c.donutCenter}><span><b>{num(total)}</b><small>{centerLabel}</small></span></div>
      </div>
      {legend && (
        <div className={c.legend} style={{ display: "grid", gap: 6 }}>
          {parts.map((p) => <span key={p.label} className={c.legendItem}><span className={c.dot} style={{ background: tone(t, p.color) }} />{p.label} <b>{num(p.value)}</b>{total ? <span style={{ opacity: 0.7 }}>· {pct1(p.value, total)}</span> : null}</span>)}
        </div>
      )}
    </div>
  );
};

// a progress ring (0–100), with the value in the middle
export const Ring = ({ value, color = "leads", size = 64, stroke = 6, label }) => {
  const c = useStyles();
  const t = useChartTheme();
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={c.ring} style={{ width: size, height: size }} role="img" aria-label={`${label || ""} ${v}%`.trim()}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={t.grid} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone(t, color)} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - v / 100)} style={{ transition: "stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <b style={{ fontSize: size > 70 ? 16 : 13 }}>{label !== undefined ? label : `${Math.round(v)}%`}</b>
    </div>
  );
};

// Names with a bar and a value, biggest first. rows: [{ key, name, value, bar (0-100), note, color, icon }]
export const RankBars = ({ rows, empty = "Sem dados no período." }) => {
  const c = useStyles();
  const t = useChartTheme();
  if (!rows.length) return <EmptyState text={empty} />;
  return (
    <div className={c.rank}>
      {rows.map((r) => (
        <div key={r.key || r.name} className={c.rankRow}>
          <span className={c.rankName} title={r.name}>{r.icon || null}<span>{r.name}</span></span>
          <span className={c.rankTrack} role="img" aria-label={`${r.name}: ${r.value}${r.note ? `, ${r.note}` : ""}`}>
            <span className={c.rankFill} style={{ width: `${Math.max(2, Math.min(100, r.bar))}%`, background: tone(t, r.color || "leads") }} />
          </span>
          <span className={c.rankValue}>{r.value}{r.note ? <small>{r.note}</small> : null}</span>
        </div>
      ))}
    </div>
  );
};

// The funnel: one bar per stage, as wide as the leads that reached it, and the share of the previous stage on the right
export const FunnelBars = ({ steps }) => {
  const c = useStyles();
  const t = useChartTheme();
  const max = Math.max(1, ...steps.map((s) => s.reached));
  return (
    <div className={c.funnel}>
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].reached : 0;
        const col = s.type === "won" ? t.c.won : t.c.leads;
        return (
          <div key={s.id} className={c.funnelRow}>
            <span className={c.funnelName} title={s.name}>{s.name}</span>
            <div className={c.funnelTrack} role="img" aria-label={`${s.name}: ${s.reached} leads${i > 0 && prev ? `, ${pct1(s.reached, prev)} da etapa anterior` : ""}`}>
              {s.reached > 0 ? <div className={c.funnelBar} style={{ width: `${Math.max(2, (s.reached / max) * 100)}%`, background: `${col}${t.dark ? "59" : "40"}`, borderRight: `2px solid ${col}` }} /> : null}
              <span className={c.funnelValue}>{num(s.reached)}</span>
            </div>
            <span className={c.funnelStep}>{i > 0 && prev > 0 ? <>{pct1(s.reached, prev)}<span className={c.longText}> da anterior</span></> : ""}</span>
          </div>
        );
      })}
    </div>
  );
};

// A bar split in parts, with the numbers under it. parts: [{ label, value, color }]
export const SplitBar = ({ parts }) => {
  const c = useStyles();
  const t = useChartTheme();
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div>
      <div className={c.stack} role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(", ")}>
        {total > 0 && parts.filter((p) => p.value > 0).map((p) => <span key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: tone(t, p.color), minWidth: 4 }} title={`${p.label}: ${p.value}`} />)}
      </div>
      <div className={c.legend} style={{ marginTop: 8 }}>
        {parts.map((p) => <span key={p.label} className={c.legendItem}><span className={c.dot} style={{ background: tone(t, p.color) }} />{p.label} <b>{num(p.value)}</b></span>)}
      </div>
    </div>
  );
};

// a thin progress bar (0–max)
export const ProgressBar = ({ value, max, color = "leads", height = 6, marker }) => {
  const t = useChartTheme();
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} style={{ position: "relative", height, borderRadius: 999, background: "var(--track)" }}>
      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: tone(t, color), transition: "width .5s cubic-bezier(.2,.8,.2,1)" }} />
      {marker !== undefined && marker !== null ? <span title="Ritmo esperado para hoje" style={{ position: "absolute", top: -3, bottom: -3, left: `${Math.min(100, Math.max(0, marker))}%`, width: 2, borderRadius: 1, background: "var(--text-1)", opacity: 0.55 }} /> : null}
    </div>
  );
};
