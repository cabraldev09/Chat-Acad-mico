import React from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronRight } from "lucide-react";

import PeakChart from "./PeakChart";
import NumberTicker from "../NumberTicker";
import "../../styles/peak.css";

// The pieces of the panels (see styles/peak.css for the look). Nothing here computes a number: each piece shows what the screen
// gives it, and each one handles loading, empty and error.

export { PeakChart };

export const ACCENT = { brand: "#4f8ef7", good: "#2ec99a", bad: "#ef5d6c", warn: "#f0a23a", violet: "#8b7cf6" };

const nf = (v) => Number(v || 0).toLocaleString("pt-BR");

// the change against the period before, as a share: null when there is nothing to compare with
export const change = (now, before) => {
  const a = Number(now);
  const b = Number(before);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return Math.round(((a - b) / Math.abs(b)) * 100);
};

// "up is good" for almost everything; for waiting time, overdue tasks and losses a rise is bad news
export const DeltaChip = ({ value, upIsGood = true, suffix = "%" }) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const v = Number(value);
  const good = v === 0 ? null : v > 0 === upIsGood;
  const Icon = v >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="pk-chip" data-good={good === null ? undefined : good ? "1" : "0"} title="Comparado com o período anterior">
      {v !== 0 && <Icon size={12} aria-hidden="true" />}
      {v > 0 ? "+" : ""}{String(v).replace(".", ",")}{suffix}
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}> em relação ao período anterior</span>
    </span>
  );
};

/** The title of a section of a page: a navy bar, the title, one sentence and, on the right, what acts on the section. */
export const SectionTitle = ({ title, hint, action, style }) => (
  <div className="pk-section" style={style}>
    <h2>{title}</h2>
    {hint ? <span className="hint">{hint}</span> : <span style={{ flex: 1 }} />}
    {action}
  </div>
);

export const PeakRow = ({ children, label }) => <div className="pk-row" role="group" aria-label={label}>{children}</div>;

// a line with a marked last point, small enough for a stat card
export const Spark = ({ data, id }) => {
  const vals = (data || []).map((v) => Number(v) || 0);
  if (vals.length < 2) return <svg className="pk-spark" aria-hidden="true" />;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const W = 200;
  const H = 38;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * W, hi === lo ? H / 2 : 4 + (1 - (v - lo) / span) * (H - 8)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  const gid = `pk-sp-${id || "x"}`;
  return (
    <svg className="pk-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--pk-accent)" stopOpacity="0.15" />
          <stop offset="1" stopColor="var(--pk-accent)" stopOpacity="1" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke={`url(#${gid})`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="3" fill="var(--pk-accent)" />
    </svg>
  );
};

/** The small card: label, icon in its colour, number, change against the period before, a line and one sentence. */
export const GlowStat = ({ id, label, value, delta, upIsGood, spark, hint, tone, icon: Icon, onClick, loading, title }) => {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className="pk pk-stat" data-tone={tone} data-stat={id} onClick={onClick} title={title}>
      <span className="pk-label"><span>{label}</span>{Icon ? <span className="pk-ico" aria-hidden="true"><Icon size={17} /></span> : null}</span>
      {loading ? <span className="pk-skel" style={{ height: 32, width: "55%" }} /> : (
        <span className="pk-value">{value}<DeltaChip value={delta} upIsGood={upIsGood} /></span>
      )}
      {hint ? <span className="pk-hint">{hint}</span> : null}
      {spark ? <Spark data={spark} id={id} /> : null}
    </Tag>
  );
};

/** What asks for action now: a large number that counts up to its value, what it is, and where the click goes. */
export const CountStat = ({ id, label, value, hint, tone, icon: Icon, onClick, action, loading }) => {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className="pk pk-count" data-tone={tone} data-stat={id} onClick={onClick}>
      <span className="pk-label"><span>{label}</span>{Icon ? <span className="pk-ico" aria-hidden="true"><Icon size={17} /></span> : null}</span>
      {loading ? <span className="pk-skel" style={{ height: 44, width: 90, marginTop: 6 }} /> : <span className="n"><NumberTicker value={Number(value) || 0} format={nf} /></span>}
      {hint ? <span className="pk-hint">{hint}</span> : null}
      {onClick && action ? <span className="go">{action}<ChevronRight size={14} aria-hidden="true" /></span> : null}
    </Tag>
  );
};

export const Badge = ({ tone, children, title }) => <span className="pk-badge" data-tone={tone} title={title}>{children}</span>;

/** A block with a title. loading shows the skeleton, error the retry, empty the sentence that says why there is nothing. */
export const GlowPanel = ({ title, sub, action, tone, loading, error, onRetry, empty, emptyText = "Nada para mostrar no período.", children, id, style }) => (
  <section className="pk pk-panel" data-tone={tone} data-panel={id} aria-busy={loading ? "true" : undefined} style={style}>
    {(title || action) && (
      <div className="pk-head">
        <div style={{ minWidth: 0 }}>
          {title ? <h3 className="pk-title">{title}</h3> : null}
          {sub ? <div className="pk-sub">{sub}</div> : null}
        </div>
        {action}
      </div>
    )}
    {error ? (
      <div className="pk-state" role="alert">
        <AlertTriangle size={20} style={{ color: "var(--pk-warn)" }} aria-hidden="true" />
        <span>Não foi possível carregar estes números agora.</span>
        {onRetry ? <button type="button" className="pk-btn" onClick={onRetry}>Tentar de novo</button> : null}
      </div>
    ) : loading ? (
      <div style={{ display: "grid", gap: 10 }} aria-hidden="true">
        {[92, 78, 64, 50].map((w) => <span key={w} className="pk-skel" style={{ height: 16, width: `${w}%` }} />)}
      </div>
    ) : empty ? <div className="pk-state">{emptyText}</div> : children}
  </section>
);

/**
 * A ranking. rows: [{ key, name, value (text), bar (0..100, against the leader), share (text, part of the total), note, me, onClick }].
 * The three first places are marked; the bar is a short trace beside the value. One row alone shows no bar: there is nothing to compare.
 */
export const GlowRank = ({ rows }) => (
  <ol className="pk-rank">
    {rows.map((r, i) => (
      <li key={r.key} data-me={r.me ? "1" : undefined}>
        <span className="pos" aria-label={`${i + 1}º lugar`}>{i + 1}</span>
        <span className="who">
          {r.onClick ? <button type="button" className="name" onClick={r.onClick}>{r.name}</button> : <span className="name" title={r.name}>{r.name}{r.me ? " (você)" : ""}</span>}
          {r.note ? <span className="note">{r.note}</span> : null}
        </span>
        <span className="track" aria-hidden="true" style={rows.length < 2 ? { visibility: "hidden" } : undefined}><span className="fill" style={{ width: `${Math.max(0, Math.min(100, r.bar || 0))}%` }} /></span>
        <span className="val">{r.value}{r.share ? <small>{r.share}</small> : null}</span>
      </li>
    ))}
  </ol>
);

// the ranking of a list of records by one of its numbers; `share` adds the part of the total each one holds
export const rankRows = (list, nameKey, valueKey, { limit = 8, note, format = nf, onClick, me, share = true } = {}) => {
  const max = Math.max(1, ...list.map((r) => Number(r[valueKey]) || 0));
  const total = list.reduce((t, r) => t + (Number(r[valueKey]) || 0), 0);
  return list.slice(0, limit).map((r) => ({
    key: String(r.id ?? r.userId ?? r[nameKey]), name: String(r[nameKey]), value: format(r[valueKey]), bar: ((Number(r[valueKey]) || 0) / max) * 100,
    share: share && total > 0 && list.length > 1 ? `${Math.round(((Number(r[valueKey]) || 0) / total) * 100)}%` : undefined,
    note: note ? note(r) : undefined, onClick: onClick ? () => onClick(r) : undefined, me: me ? me(r) : false,
  }));
};

/** The goal as a ring, with the facts beside it. facts: [{ label, value }]. */
export const GlowRing = ({ pct, facts = [], size = 132, label = "da meta" }) => {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const r = (size - 14) / 2;
  const len = 2 * Math.PI * r;
  return (
    <div className="pk-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(Number(pct) || 0)}% ${label}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth="10" />
        <circle className="arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--pk-accent)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={len} strokeDashoffset={len * (1 - p / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="49%" textAnchor="middle" dominantBaseline="middle" fill="var(--pk-num)" style={{ fontSize: size * 0.24, fontWeight: 700, letterSpacing: "-0.03em" }}>{Math.round(Number(pct) || 0)}%</text>
        <text x="50%" y="68%" textAnchor="middle" fill="var(--pk-ink-2)" style={{ fontSize: Math.max(10, size * 0.085) }}>{label}</text>
      </svg>
      {facts.length > 0 && (
        <dl className="pk-facts" style={{ margin: 0 }}>
          {facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
        </dl>
      )}
    </div>
  );
};

/**
 * The funnel as a sequence of stages. steps: [{ key, name, value, color }], in the order of the funnel. Each stage that holds something
 * is a block with its number and its part of the total; the empty ones are named in one quiet line (a row of zeros is not information).
 */
export const GlowFunnel = ({ steps, onStep, unit = "leads" }) => {
  const total = steps.reduce((t, s) => t + (Number(s.value) || 0), 0);
  const filled = steps.filter((s) => Number(s.value) > 0);
  const empty = steps.filter((s) => !(Number(s.value) > 0));
  const Tag = onStep ? "button" : "div";
  return (
    <div>
      <div className="pk-flow">
        {filled.map((s) => (
          <Tag key={s.key} type={onStep ? "button" : undefined} className="stage" style={s.color ? { "--stage": s.color } : undefined} onClick={onStep ? () => onStep(s) : undefined}>
            <span className="step">Etapa {steps.indexOf(s) + 1}</span>
            <span className="nm" title={s.name} style={{ display: "block" }}>{s.name}</span>
            <span className="n">{nf(s.value)}<small>{total > 0 ? `${Math.round((Number(s.value) / total) * 100)}% dos ${unit}` : ""}</small></span>
          </Tag>
        ))}
      </div>
      {empty.length > 0 && (
        <div className="pk-flow-empty">
          <b>{empty.length === 1 ? "1 etapa vazia:" : `${empty.length} etapas vazias:`}</b>
          {empty.map((s) => <span key={s.key} className="tag">{s.name}</span>)}
        </div>
      )}
    </div>
  );
};

const TODO_TONE = { danger: "var(--c-lost)", bad: "var(--c-lost)", warn: "var(--c-warn)", good: "var(--c-won)", info: "var(--c-leads)" };
/** Things to do. items: [{ key, tone, title, detail, onClick }]: the colour says how urgent, the button opens where to act. */
export const TodoList = ({ items, action = "Resolver" }) => (
  <ul className="pk-todo">
    {items.map((it) => (
      <li key={it.key} style={{ "--todo": TODO_TONE[it.tone] || TODO_TONE.info }}>
        <span className="txt"><b>{it.title}</b>{it.detail ? <span>{it.detail}</span> : null}</span>
        {it.onClick ? <button type="button" className="pk-btn" onClick={it.onClick} aria-label={`${action}: ${it.title}`}>{action}<ChevronRight size={14} aria-hidden="true" /></button> : null}
      </li>
    ))}
  </ul>
);

// the days of a series as dd/mm, for the readout of the Peak Chart
export const dayLabel = (d) => (d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}` : "");

/**
 * A share as a ring beside its name: "what it is" and "n of total" (after the "Stats cards with links" of 21st.dev). With onClick the
 * whole card is a button that opens the detail.
 */
export const RingStat = ({ id, title, value, total, unit, tone, onClick, action }) => {
  const share = total > 0 ? Math.min(100, (Number(value) / Number(total)) * 100) : 0;
  const size = 64;
  const r = 26;
  const len = 2 * Math.PI * r;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className="pk pk-ringstat" data-tone={tone} data-stat={id} onClick={onClick}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth="7" />
        <circle className="arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--pk-accent)" strokeWidth="7" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - share / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" fill="var(--pk-ink)" style={{ fontSize: 15, fontWeight: 650 }}>{Math.round(share)}%</text>
      </svg>
      <span className="txt">
        <b>{title}</b>
        <span>{nf(value)} de {nf(total)}{unit ? ` ${unit}` : ""}</span>
        {onClick && action ? <span className="go">{action}<ChevronRight size={13} aria-hidden="true" /></span> : null}
      </span>
    </Tag>
  );
};

// one colour per slice, the same order on every chart of shares (the blues of the brand first)
export const SHARE_PALETTE = ["#0b4279", "#0693e3", "#14b8a6", "#8b5cf6", "#f59e0b", "#ef5d6c", "#94a3b8"];

/**
 * The parts of a whole as a ring with round ends that draws itself, after the Donut Chart of 21st.dev (written without framer-motion,
 * which needs React 18). Pointing at a slice, or at its line in the legend, lights it and puts its number in the centre.
 * parts: [{ label, value, color? }]. centerLabel: what the total is ("leads", "perdas").
 */
export const DonutChart = ({ parts, centerLabel = "total", size = 176, stroke = 20, note }) => {
  const [on, setOn] = React.useState(null);
  const shown = (parts || []).filter((p) => Number(p.value) > 0).map((p, i) => ({ ...p, value: Number(p.value), color: p.color || SHARE_PALETTE[i % SHARE_PALETTE.length] }));
  const total = shown.reduce((t, p) => t + p.value, 0);
  const r = size / 2 - stroke / 2;
  const len = 2 * Math.PI * r;
  // a small gap between slices so the round ends do not swallow a thin slice
  const gap = shown.length > 1 ? Math.min(stroke * 0.9, len / (shown.length * 4)) : 0;
  let from = 0;
  const active = on === null ? null : shown[on];
  return (
    <div className="pk-donut">
      <div className="pk-donut-ring" style={{ width: size, height: size }} onMouseLeave={() => setOn(null)}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={shown.map((p) => `${p.label}: ${nf(p.value)}`).join(", ")}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
          {shown.map((p, i) => {
            const part = (p.value / total) * len;
            const dash = Math.max(0.01, part - gap);
            const offset = -(from + gap / 2);
            from += part;
            return (
              <circle key={p.label} className="seg" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke} strokeLinecap="round"
                strokeDasharray={`${dash} ${len}`} strokeDashoffset={offset} transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ "--i": i, opacity: on === null || on === i ? 1 : 0.28 }} onMouseEnter={() => setOn(i)} />
            );
          })}
        </svg>
        <div className="mid" aria-hidden="true">
          <small>{active ? active.label : centerLabel}</small>
          <b>{nf(active ? active.value : total)}</b>
          {active ? <span>{Math.round((active.value / total) * 100)}%</span> : null}
        </div>
      </div>
      <ul className="legend">
        {shown.map((p, i) => (
          <li key={p.label} data-on={on === i ? "1" : undefined} tabIndex={0} onMouseEnter={() => setOn(i)} onMouseLeave={() => setOn(null)} onFocus={() => setOn(i)} onBlur={() => setOn(null)}>
            <i style={{ background: p.color }} aria-hidden="true" />
            <span className="lb" title={p.label}>{p.label}{note ? <em>{note(p)}</em> : null}</span>
            <b>{nf(p.value)}</b>
            <span className="pc">{Math.round((p.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
export { CompareStat, CenterFunnel, ShareStats, BarsChart, BoardHead, Switch, weeksOf, Funnel, ShareList, EmptyNote, PriorityList, Person, RangePicker, rangeDates, rangeText, useCycle, loadCycle, RANGE_LABEL } from "./board";
