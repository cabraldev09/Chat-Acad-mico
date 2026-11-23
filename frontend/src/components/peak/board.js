import React, { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Inbox } from "lucide-react";

import api from "../../services/api";
import { initialsOf, colorOf } from "../../utils/avatar";

// The blocks of the "gestão à vista" board: the period before beside the period now, the funnel centred on its axis, the split of a
// total in large numbers and bars with the value written on top. Plain white boxes and one colour for the data: red and green are
// kept for the change only. The bars follow the "Revenue Bars Chart" of 21st.dev (olewandowski1), written here without a chart
// library. Every block handles loading and empty, and reads without colour (the value is always written).

const nf = (v) => Number(v || 0).toLocaleString("pt-BR");
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const deltaOf = (now, before) => {
  const a = Number(now);
  const b = Number(before);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return Math.round(((a - b) / Math.abs(b)) * 1000) / 10;
};

/** One number of the period beside the same number of the period before, with the change. `points`: the change is a difference in percentage points. */
export const CompareStat = ({ id, title, now, before, format = nf, nowLabel = "Período atual", beforeLabel = "Período anterior", upIsGood = true, points = false, action, onOpen, loading }) => {
  const has = before !== null && before !== undefined;
  const d = !has ? null : points ? Math.round((Number(now) - Number(before)) * 10) / 10 : deltaOf(now, before);
  const good = d === null || d === 0 ? null : d > 0 === upIsGood;
  return (
    <section className="gv-card gv-compare" data-stat={id} aria-busy={loading ? "true" : undefined}>
      <h3 className="gv-title">{title}</h3>
      <div className="gv-cmp">
        <div className="gv-side">
          <span className="gv-cap">{beforeLabel}</span>
          {loading ? <span className="pk-skel gv-skel" /> : <span className="gv-num gv-dim">{has ? format(before) : "—"}</span>}
        </div>
        <div className="gv-side gv-now">
          <span className="gv-cap">{nowLabel}</span>
          {loading ? <span className="pk-skel gv-skel" /> : <span className="gv-num">{format(now)}</span>}
          {!loading && d !== null && (
            <span className="gv-delta" data-good={good === null ? undefined : good ? "1" : "0"}>
              <span aria-hidden="true">{d > 0 ? "▲" : d < 0 ? "▼" : "•"}</span> {d > 0 ? "+" : ""}{String(d).replace(".", ",")}{points ? " p.p." : "%"}
              <span className="gv-sr"> em relação ao período anterior</span>
            </span>
          )}
          {!loading && d === null && <span className="gv-delta">Sem comparação</span>}
        </div>
      </div>
      {onOpen && <button type="button" className="gv-btn" onClick={onOpen}>{action || "Ver detalhes"}</button>}
    </section>
  );
};

/** The funnel on its axis: each stage a bar as wide as its share of the largest one, with the value and the share of the stage before. */
export const CenterFunnel = ({ steps, onStep, footer }) => {
  const rows = (steps || []).map((s) => ({ ...s, value: Number(s.value) || 0 }));
  const max = Math.max(1, ...rows.map((s) => s.value));
  return (
    <div className="gv-funnel" role="list">
      {rows.map((s, i) => {
        const prev = i > 0 ? rows[i - 1].value : 0;
        const share = i > 0 && prev > 0 ? Math.round((s.value / prev) * 100) : null;
        const Tag = onStep ? "button" : "div";
        return (
          <Tag key={s.key} type={onStep ? "button" : undefined} className="gv-frow" role="listitem" onClick={onStep ? () => onStep(s) : undefined}
            aria-label={`${s.name}: ${nf(s.value)}${share === null ? "" : `, ${share}% da etapa anterior`}`}>
            <span className="gv-fname" title={s.name}>{s.name}</span>
            <span className="gv-ftrack">
              <span className="gv-fbar" style={{ width: `${Math.max(s.value ? 4 : 2, (s.value / max) * 100)}%` }} data-empty={s.value ? undefined : "1"} />
            </span>
            <span className="gv-fval"><b>{nf(s.value)}</b>{share === null ? "" : ` ${share}%`}</span>
          </Tag>
        );
      })}
      {footer ? <div className="gv-ffoot">{footer}</div> : null}
    </div>
  );
};

const SHARE_COLORS = ["#0b4279", "#1f9d8f", "#7a4fc4", "#b7791f", "#5b6b80"];

/** A total split in a few parts, each as a large number with its share. */
export const ShareStats = ({ items, loading, emptyText = "Nenhum registro no período." }) => {
  const rows = (items || []).filter((x) => Number(x.value) > 0);
  const total = rows.reduce((a, x) => a + Number(x.value), 0);
  if (loading) return <div className="gv-shares" aria-hidden="true">{[0, 1, 2].map((i) => <span key={i} className="pk-skel" style={{ height: 64, borderRadius: 8 }} />)}</div>;
  if (!rows.length) return <div className="pk-state" style={{ minHeight: 64 }}>{emptyText}</div>;
  return (
    <div className="gv-shares" role="list">
      {rows.map((x, i) => (
        <div key={x.label} className="gv-share" role="listitem" style={{ "--gv-c": x.color || SHARE_COLORS[i % SHARE_COLORS.length] }}>
          <div className="gv-share-txt">
            <span className="gv-share-pct">{Math.round((Number(x.value) / total) * 100)}%</span>
            <span className="gv-share-lbl">{x.label}</span>
          </div>
          <span className="gv-share-num">{nf(x.value)}</span>
        </div>
      ))}
    </div>
  );
};

/** Dia | Semana, or any small choice of one. */
export const Switch = ({ options, value, onChange, label }) => (
  <div className="gv-switch" role="group" aria-label={label}>
    {options.map(([k, text]) => (
      <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{text}</button>
    ))}
  </div>
);

const mondayOf = (key) => {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// bars of the weeks: every day goes to the Monday of its week
export const weeksOf = (days) => {
  const map = new Map();
  (days || []).forEach((d) => { const k = mondayOf(d.day); map.set(k, (map.get(k) || 0) + (Number(d.value) || 0)); });
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, value]) => ({ day, value }));
};

/**
 * Bars with the value on top, the day under each one and the month under its days.
 * days: [{ day: "2026-05-13", value }]. goal: { day, week } draws the line of the goal. A long period shows only the days with a value.
 */
export const BarsChart = ({ days, unit = "registros", goal, defaultMode = "day", emptyText = "Nenhum registro no período.", height = 190 }) => {
  const [mode, setMode] = useState(defaultMode);
  const all = useMemo(() => (days || []).map((d) => ({ day: String(d.day).slice(0, 10), value: Number(d.value) || 0 })), [days]);
  const byWeek = mode === "week";
  const sparse = !byWeek && all.length > 45;
  const points = useMemo(() => (byWeek ? weeksOf(all) : sparse ? all.filter((d) => d.value > 0) : all), [all, byWeek, sparse]);
  const total = all.reduce((a, d) => a + d.value, 0);
  const line = goal ? Number(byWeek ? goal.week : goal.day) || 0 : 0;
  const max = Math.max(1, line, ...points.map((d) => d.value));
  const groups = useMemo(() => {
    const out = [];
    points.forEach((d) => {
      const key = d.day.slice(0, 7);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(d); else out.push({ key, items: [d] });
    });
    return out;
  }, [points]);
  const best = points.reduce((top, d) => (d.value > (top ? top.value : 0) ? d : top), null);
  const summary = total
    ? `${nf(total)} ${unit} no período. Maior ${byWeek ? "semana" : "dia"}: ${nf(best.value)} em ${best.day.slice(8, 10)}/${best.day.slice(5, 7)}.`
    : emptyText;
  return (
    <div className="gv-bars">
      <div className="gv-bars-top">
        <span className="gv-note">{sparse ? "Apenas dias com registro." : byWeek ? "Cada barra é uma semana, a partir da segunda-feira." : "Cada barra é um dia."}{line ? ` Linha tracejada: meta ${byWeek ? "da semana" : "do dia"} (${String(Math.round(line * 10) / 10).replace(".", ",")}).` : ""}</span>
        <Switch label="Agrupar por" value={mode} onChange={setMode} options={[["day", "Dia"], ["week", "Semana"]]} />
      </div>
      {!total ? <div className="pk-state" style={{ minHeight: height }}>{emptyText}</div> : (
        <div className="gv-bars-scroll" tabIndex={0} role="img" aria-label={summary}>
          <div className="gv-bars-plot" style={{ "--gv-h": `${height}px` }}>
            {line > 0 && <span className="gv-goal" style={{ bottom: `calc(var(--gv-foot) + ${line / max} * var(--gv-fill) * var(--gv-h))` }} aria-hidden="true" />}
            {groups.map((g) => (
              <div key={g.key} className="gv-month" style={{ flexGrow: g.items.length }}>
                <div className="gv-cols">
                  {g.items.map((d) => (
                    <div key={d.day} className="gv-col" title={`${d.day.slice(8, 10)}/${d.day.slice(5, 7)}: ${nf(d.value)} ${unit}`}>
                      <div className="gv-col-area">
                        <span className="gv-val">{d.value ? nf(d.value) : ""}</span>
                        <span className="gv-bar" style={{ height: `calc(${d.value / max} * var(--gv-fill) * 100%)` }} data-top={best && d.day === best.day ? "1" : undefined} />
                      </div>
                      <span className="gv-day">{d.day.slice(8, 10)}</span>
                    </div>
                  ))}
                </div>
                <div className="gv-month-name">{MONTHS[Number(g.key.slice(5, 7)) - 1]}{groups.length > 1 && g.items.length < 3 ? "" : ` ${g.key.slice(0, 4)}`}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/** The band of the board: the title of the screen and what it shows, in the navy of the brand. */
export const BoardHead = ({ title, sub, children }) => (
  <header className="gv-head">
    <div style={{ minWidth: 0 }}>
      <h1>{title}</h1>
      {sub ? <p>{sub}</p> : null}
    </div>
    {children ? <div className="gv-head-side">{children}</div> : null}
  </header>
);

// ---------------------------------------------------------------- the period of a board
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const br = (key) => (key ? `${key.slice(8, 10)}/${key.slice(5, 7)}` : "");
export const RANGE_LABEL = { today: "Hoje", week: "Semana", month: "Mês", custom: "Período", cycle: "Ciclo" };

// The cycle is the period of goals in force (the semester the administration registered in Metas): asked once, shared by every screen.
let cycleAsked = null;
export const loadCycle = () => {
  if (!cycleAsked) {
    cycleAsked = api.get("/dashboard/polos-progress").then(({ data }) => {
      const g = data && data.goal;
      if (!g || !g.startsOn || !g.endsOn) return null;
      const today = iso(new Date());
      return { from: g.startsOn, to: g.endsOn < today ? g.endsOn : today < g.startsOn ? g.endsOn : today, endsOn: g.endsOn, title: g.title || "" };
    }).catch(() => { cycleAsked = null; return null; });
  }
  return cycleAsked;
};
export const useCycle = () => {
  const [cycle, setCycle] = useState(undefined);
  useEffect(() => { let alive = true; loadCycle().then((c) => { if (alive) setCycle(c); }); return () => { alive = false; }; }, []);
  return cycle;
};

// the two dates of what was chosen: today, the last 7 days, the month so far, the dates typed, or the cycle of goals
export const rangeDates = (value, cycle) => {
  const now = new Date();
  const today = iso(now);
  if (value.range === "today") return { from: today, to: today };
  if (value.range === "week") { const d = new Date(now); d.setDate(d.getDate() - 6); return { from: iso(d), to: today }; }
  if (value.range === "custom") return { from: value.from || today, to: value.to || today };
  if (value.range === "cycle" && cycle) return { from: cycle.from, to: cycle.to };
  return { from: `${today.slice(0, 8)}01`, to: today };
};
export const rangeText = (value, cycle) => {
  if (value.range === "today") return "Hoje";
  if (value.range === "week") return "Últimos 7 dias";
  if (value.range === "month") return "Este mês";
  const d = rangeDates(value, cycle);
  return value.range === "cycle" ? `Ciclo${cycle && cycle.title ? ` ${cycle.title}` : ""}` : `${br(d.from)} a ${br(d.to)}`;
};

/** Hoje | Semana | Mês | Período | Ciclo. "Período" opens the two dates; "Ciclo" is the period of goals in force. */
export const RangePicker = ({ value, onChange, cycle }) => {
  const pick = (range) => {
    if (range === "custom") { const d = rangeDates(value, cycle); onChange({ range, from: value.from || d.from, to: value.to || d.to }); } else onChange({ ...value, range });
  };
  return (
    <div className="gv-range">
      <div className="gv-seg" role="group" aria-label="Período">
        {Object.keys(RANGE_LABEL).map((k) => {
          const off = k === "cycle" && !cycle;
          return (
            <button key={k} type="button" aria-pressed={value.range === k} disabled={off} onClick={() => pick(k)}
              title={k === "cycle" ? (cycle ? `${cycle.title ? `${cycle.title}: ` : ""}${br(cycle.from)} a ${br(cycle.endsOn)}` : cycle === undefined ? "Carregando o ciclo de metas" : "Nenhum ciclo de metas cadastrado em Metas") : undefined}>
              {RANGE_LABEL[k]}
            </button>
          );
        })}
      </div>
      {value.range === "custom" && (
        <span className="gv-dates">
          <input aria-label="De" type="date" value={value.from || ""} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <span>até</span>
          <input aria-label="Até" type="date" value={value.to || ""} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- the funnel, drawn as a funnel
/**
 * Each stage is a slice of the funnel: as wide as the leads that are in it or beyond it (`reach`), narrowing into the next one.
 * steps: [{ key, name, value, reach }]. `value` is the number written (the leads of the stage); without `reach` the value is used.
 */
export const Funnel = ({ steps, onStep, footer, valueHint }) => {
  const rows = (steps || []).map((s) => ({ ...s, value: Number(s.value) || 0, reach: Number(s.reach === undefined ? s.value : s.reach) || 0 }));
  const top = Math.max(1, ...rows.map((s) => s.reach));
  // the width follows the square root of the share: the order and the narrowing are kept, and a stage with few leads is still a slice
  // that can be seen and clicked (the exact number and the share are written beside every slice)
  const MIN = 12;
  const width = (s) => MIN + (100 - MIN) * Math.sqrt(s.reach / top);
  return (
    <div className="gv-fun" role="list">
      {rows.map((s, i) => {
        const w = width(s);
        const next = i + 1 < rows.length ? Math.min(w, width(rows[i + 1])) : Math.max(MIN * 0.7, w * 0.78);
        const a = (100 - w) / 2;
        const b = (100 - next) / 2;
        const share = i > 0 && rows[0].reach > 0 ? Math.round((s.reach / rows[0].reach) * 100) : null;
        const Tag = onStep ? "button" : "div";
        return (
          <Tag key={s.key} type={onStep ? "button" : undefined} className="gv-fun-row" role="listitem" data-empty={s.value ? undefined : "1"} onClick={onStep ? () => onStep(s) : undefined}
            aria-label={`${s.name}: ${nf(s.value)}${share === null ? "" : `. ${share}% chegaram até aqui`}`}>
            <span className="gv-fun-name" title={s.name}>{s.name}</span>
            <span className="gv-fun-shape" aria-hidden="true">
              <span className="gv-fun-slice" style={{ clipPath: `polygon(${a}% 0, ${100 - a}% 0, ${100 - b}% 100%, ${b}% 100%)`, "--k": rows.length > 1 ? i / (rows.length - 1) : 0 }} />
            </span>
            <span className="gv-fun-val" title={valueHint}><b>{nf(s.value)}</b><span>{share === null ? "100%" : `${share}%`}</span></span>
          </Tag>
        );
      })}
      {footer ? <div className="gv-ffoot">{footer}</div> : null}
    </div>
  );
};

// ---------------------------------------------------------------- shares as one bar and its lines
const LIST_COLORS = ["#0b4279", "#2f7de1", "#1f9d8f", "#b7791f", "#7a4fc4", "#8a97a8"];
/** A total split by something (channel, reason): one bar with every part, then a line for each with its number and share. */
export const ShareList = ({ items, unit = "", note, icon }) => {
  const rows = (items || []).filter((x) => Number(x.value) > 0).map((x, i) => ({ ...x, value: Number(x.value), color: x.color || LIST_COLORS[Math.min(i, LIST_COLORS.length - 1)] }));
  const total = rows.reduce((t, x) => t + x.value, 0);
  if (!total) return null;
  return (
    <div className="gv-sharelist">
      <div className="gv-sl-total"><b>{nf(total)}</b>{unit ? <span>{unit}</span> : null}</div>
      <div className="gv-sl-bar" role="img" aria-label={rows.map((x) => `${x.label}: ${Math.round((x.value / total) * 100)}%`).join(", ")}>
        {rows.map((x) => <span key={x.label} style={{ flexGrow: x.value, background: x.color }} title={`${x.label}: ${nf(x.value)}`} />)}
      </div>
      <ul className="gv-sl-rows">
        {rows.map((x) => (
          <li key={x.label}>
            <span className="gv-sl-dot" style={{ background: x.color }} aria-hidden="true" />
            {icon ? icon(x) : null}
            <span className="gv-sl-name">{x.label}{note ? <small>{note(x)}</small> : null}</span>
            <b>{nf(x.value)}</b>
            <span className="gv-sl-pct">{Math.round((x.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** Nothing to show, said with a soft mark instead of a bare sentence. */
export const EmptyNote = ({ children, icon: Icon = Inbox }) => (
  <div className="gv-empty"><span aria-hidden="true"><Icon size={18} /></span>{children}</div>
);

// ---------------------------------------------------------------- what asks for action: the count first, then the sentence
const PRIORITY_TONE = { danger: "bad", warn: "warn", info: "info", good: "good" };
/** items: [{ key, tone, title, detail, onClick }]. A title that starts with a number shows it as the count of the line. */
export const PriorityList = ({ items, action = "Resolver" }) => (
  <ul className="gv-prio">
    {(items || []).map((it) => {
      const m = /^(\d[\d.]*)\s+(.*)$/.exec(String(it.title || ""));
      const rest = m ? m[2].charAt(0).toUpperCase() + m[2].slice(1) : it.title;
      const Tag = it.onClick ? "button" : "div";
      return (
        <li key={it.key} data-tone={PRIORITY_TONE[it.tone] || "info"}>
          <Tag type={it.onClick ? "button" : undefined} className="gv-prio-row" onClick={it.onClick} aria-label={it.onClick ? `${action}: ${it.title}` : undefined}>
            <span className="gv-prio-n" aria-hidden={m ? undefined : "true"}>{m ? m[1] : it.tone === "good" ? <Check size={18} /> : "!"}</span>
            <span className="gv-prio-txt"><b>{rest}</b>{it.detail ? <span>{it.detail}</span> : null}</span>
            {it.onClick ? <span className="gv-prio-go">{it.tone === "good" || it.tone === "info" ? "Ver" : action}<ChevronRight size={14} aria-hidden="true" /></span> : null}
          </Tag>
        </li>
      );
    })}
  </ul>
);

/** The initials of a person on their colour (a name that is only a phone number shows a neutral mark). */
export const Person = ({ name, size = 34 }) => {
  const numeric = /^[+\d\s()-]+$/.test(String(name || ""));
  return (
    <span className="gv-av" style={{ width: size, height: size, background: numeric ? "var(--surface-3)" : colorOf(name), color: numeric ? "var(--text-2)" : "#fff", fontSize: size * 0.36 }} aria-hidden="true">
      {numeric ? "#" : initialsOf(name)}
    </span>
  );
};

// ---------------------------------------------------------------- several numbers over the same days, one under the other
/**
 * Every series in its own line, on its own scale (they are too different in size to share one), over the same days.
 * rows: [{ key, title, unit, total, note, days: [{ day, value }] }]. A click on a line asks for that series alone.
 */
export const MultiBars = ({ rows, onPick, emptyText = "Nenhum registro no período." }) => {
  const [mode, setMode] = useState("day");
  const byWeek = mode === "week";
  const lines = (rows || []).map((r) => {
    const all = (r.days || []).map((d) => ({ day: String(d.day).slice(0, 10), value: Number(d.value) || 0 }));
    const points = byWeek ? weeksOf(all) : all;
    return { ...r, points, max: Math.max(1, ...points.map((d) => d.value)) };
  });
  const any = lines.some((r) => r.points.some((d) => d.value > 0));
  const axis = lines[0] ? lines[0].points : [];
  const step = Math.max(1, Math.ceil(axis.length / 12));
  return (
    <div className="gv-multi">
      <div className="gv-bars-top">
        <span className="gv-note">{byWeek ? "Cada barra é uma semana." : "Cada barra é um dia."} Cada linha tem a sua própria escala. Clique em uma linha para ver só ela.</span>
        <Switch label="Agrupar por" value={mode} onChange={setMode} options={[["day", "Dia"], ["week", "Semana"]]} />
      </div>
      {!any ? <EmptyNote>{emptyText}</EmptyNote> : (
        <>
          {lines.map((r) => (
            <button key={r.key} type="button" className="gv-multi-row" onClick={() => onPick && onPick(r.key)} aria-label={`${r.title}: ${nf(r.total)} ${r.unit || ""}. ${r.note || ""} Ver só esta série`}>
              <span className="gv-multi-head">
                <span className="gv-multi-title">{r.title}</span>
                <b>{nf(r.total)}</b>
                {r.note ? <span className="gv-multi-note">{r.note}</span> : null}
              </span>
              <span className="gv-multi-plot" aria-hidden="true">
                {r.points.map((d) => (
                  <span key={d.day} className="gv-multi-col" title={`${d.day.slice(8, 10)}/${d.day.slice(5, 7)}: ${nf(d.value)} ${r.unit || ""}`}>
                    <i style={{ height: `${Math.max(d.value ? 4 : 0, (d.value / r.max) * 100)}%` }} />
                  </span>
                ))}
              </span>
            </button>
          ))}
          <div className="gv-multi-row gv-multi-axis" aria-hidden="true">
            <span className="gv-multi-head" />
            <span className="gv-multi-plot">{axis.map((d, i) => <span key={d.day} className="gv-multi-col">{i % step === 0 ? `${d.day.slice(8, 10)}/${d.day.slice(5, 7)}` : ""}</span>)}</span>
          </div>
        </>
      )}
    </div>
  );
};
