import React from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight } from "lucide-react";

import PeakChart from "./PeakChart";
import "../../styles/peak.css";

// The pieces that sit beside the Peak Chart, in the same look (navy glass lit from below). Nothing here computes a number: each
// piece shows what the screen gives it, and each one handles loading, empty and error.

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

export const PeakRow = ({ children, label }) => <div className="pk-row" role="group" aria-label={label}>{children}</div>;

// a line with the glow of the Peak Chart, small enough for a stat card
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
      <path d={d} fill="none" stroke={`url(#${gid})`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ filter: "drop-shadow(0 0 4px var(--pk-accent))" }} />
      <circle cx={lx} cy={ly} r="3" fill="#dbe8ff" style={{ filter: "drop-shadow(0 0 5px var(--pk-accent))" }} />
    </svg>
  );
};

/** The small card: label, number, change against the period before, a line and one sentence. */
export const GlowStat = ({ id, label, value, delta, upIsGood, spark, hint, tone, icon: Icon, onClick, loading, title }) => {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className="pk pk-stat" data-tone={tone} data-stat={id} onClick={onClick} title={title}>
      <span className="pk-label"><span>{label}</span>{Icon ? <Icon size={16} aria-hidden="true" /> : null}</span>
      {loading ? <span className="pk-skel" style={{ height: 32, width: "55%" }} /> : (
        <span className="pk-value">{value}<DeltaChip value={delta} upIsGood={upIsGood} /></span>
      )}
      {hint ? <span className="pk-hint">{hint}</span> : null}
      {spark ? <Spark data={spark} id={id} /> : null}
    </Tag>
  );
};

// 5x7 dot-matrix digits (and the few signs a counter needs)
const GLYPH = {
  0: "01110 10001 10011 10101 11001 10001 01110", 1: "00100 01100 00100 00100 00100 00100 01110", 2: "01110 10001 00001 00010 00100 01000 11111",
  3: "11110 00001 00001 01110 00001 00001 11110", 4: "00010 00110 01010 10010 11111 00010 00010", 5: "11111 10000 11110 00001 00001 10001 01110",
  6: "00110 01000 10000 11110 10001 10001 01110", 7: "11111 00001 00010 00100 01000 01000 01000", 8: "01110 10001 10001 01110 10001 10001 01110",
  9: "01110 10001 10001 01111 00001 00010 01100", ".": "00000 00000 00000 00000 00000 01100 01100", "-": "00000 00000 00000 11111 00000 00000 00000",
  "%": "11001 11010 00010 00100 01000 01011 10011", ",": "00000 00000 00000 00000 01100 00100 01000",
};
export const DotDigits = ({ text }) => {
  const chars = String(text).split("").filter((ch) => GLYPH[ch]);
  const step = 6;
  return (
    <svg className="pk-digits" viewBox={`0 0 ${Math.max(1, chars.length * step * 2 - 2)} 14`} aria-hidden="true">
      {chars.map((ch, ci) => GLYPH[ch].split(" ").map((row, y) => row.split("").map((bit, x) => (
        <circle key={`${ci}-${y}-${x}`} className={bit === "1" ? "on" : "off"} cx={ci * step * 2 + x * 2 + 1} cy={y * 2 + 1} r="0.78" />
      ))))}
    </svg>
  );
};

/** The counter of what is happening now, drawn in dots. */
export const DotTile = ({ id, label, value, hint, tone, onClick, loading }) => {
  const Tag = onClick ? "button" : "div";
  // the dots are a drawing: who uses a screen reader hears the number
  const spoken = [label, loading ? "carregando" : nf(value), hint].filter(Boolean).join(". ");
  return (
    <Tag type={onClick ? "button" : undefined} className="pk pk-dot" data-tone={tone} data-stat={id} onClick={onClick} aria-label={spoken}>
      <span className="pk-label"><span>{label}</span></span>
      {loading ? <span className="pk-skel" style={{ height: 34, width: 70 }} /> : <DotDigits text={String(Math.round(Number(value) || 0))} />}
      {hint ? <span className="pk-hint">{hint}</span> : null}
    </Tag>
  );
};

/** A block with a title. loading shows the skeleton, error the retry, empty the sentence that says why there is nothing. */
export const GlowPanel = ({ title, sub, action, tone, loading, error, onRetry, empty, emptyText = "Nada para mostrar no período.", children, id }) => (
  <section className="pk pk-panel" data-tone={tone} data-panel={id} aria-busy={loading ? "true" : undefined}>
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

/** rows: [{ key, name, value (text), bar (0..100), note, me, onClick }]. The row marked `me` is the reader's own. */
export const GlowRank = ({ rows, numbered = true }) => (
  <ol className="pk-rank">
    {rows.map((r, i) => (
      <li key={r.key} data-me={r.me ? "1" : undefined}>
        <span className="pos">{numbered ? i + 1 : ""}</span>
        {r.onClick ? <button type="button" className="name" onClick={r.onClick}>{r.name}</button> : <span className="name" title={r.name}>{r.name}{r.me ? " (você)" : ""}</span>}
        <span className="val">{r.value}</span>
        <span className="track" aria-hidden="true"><span className="fill" style={{ display: "block", width: `${Math.max(0, Math.min(100, r.bar || 0))}%` }} /></span>
        {r.note ? <span className="note">{r.note}</span> : null}
      </li>
    ))}
  </ol>
);

// the ranking of a list of records by one of its numbers
export const rankRows = (list, nameKey, valueKey, { limit = 8, note, format = nf, onClick, me } = {}) => {
  const max = Math.max(1, ...list.map((r) => Number(r[valueKey]) || 0));
  return list.slice(0, limit).map((r) => ({
    key: String(r.id ?? r.userId ?? r[nameKey]), name: String(r[nameKey]), value: format(r[valueKey]), bar: ((Number(r[valueKey]) || 0) / max) * 100,
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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <circle className="arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--pk-accent)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={len} strokeDashoffset={len * (1 - p / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="49%" textAnchor="middle" dominantBaseline="middle" fill="#fff" style={{ fontSize: size * 0.24, fontWeight: 650, letterSpacing: "-0.03em" }}>{Math.round(Number(pct) || 0)}%</text>
        <text x="50%" y="68%" textAnchor="middle" fill="#a7afc0" style={{ fontSize: 11.5 }}>{label}</text>
      </svg>
      <dl className="pk-facts" style={{ margin: 0 }}>
        {facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
      </dl>
    </div>
  );
};

/** steps: [{ key, name, value }], widest first. */
export const GlowFunnel = ({ steps, onStep }) => {
  const max = Math.max(1, ...steps.map((s) => Number(s.value) || 0));
  return (
    <div className="pk-funnel">
      {steps.map((s) => (
        <div className="step" key={s.key} onClick={onStep ? () => onStep(s) : undefined} style={onStep ? { cursor: "pointer" } : undefined}>
          <span title={s.name}>{s.name}</span>
          <span className="bar" aria-hidden="true"><i style={{ width: `${((Number(s.value) || 0) / max) * 100}%`, ...(s.color ? { "--pk-accent": s.color } : {}) }} /></span>
          <span className="n">{nf(s.value)}</span>
        </div>
      ))}
    </div>
  );
};

// the days of a series as dd/mm, for the readout of the Peak Chart
export const dayLabel = (d) => (d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}` : "");
