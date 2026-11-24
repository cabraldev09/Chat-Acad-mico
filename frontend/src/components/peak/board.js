import React, { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useChartTheme } from "../charts";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Inbox, X } from "lucide-react";
import { Menu, MenuItem } from "@material-ui/core";

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
export const RANGE_LABEL = { today: "Hoje", week: "Semana", month: "Mês", custom: "Período", cycle: "Semestre" };

// The "Semestre" (what the team calls the cycle) is the period of the goals of the polos registered in Metas, e.g. "Graduação 1º
// semestre de 2027", never the monthly goals of the team: the list comes from /goals/semesters, asked once and shared by every screen.
let semestersAsked = null;
const loadSemesters = () => {
  if (!semestersAsked) {
    semestersAsked = api.get("/goals/semesters").then(({ data }) => (Array.isArray(data) ? data : [])
      .filter((g) => g && g.startsOn && g.endsOn)
      .map((g) => ({ id: g.id, title: g.title || "", from: String(g.startsOn).slice(0, 10), endsOn: String(g.endsOn).slice(0, 10), current: !!g.current })))
      .catch(() => { semestersAsked = null; return []; });
  }
  return semestersAsked;
};
// the semester in force (today inside it): its start, up to today (or its end, when it is over)
export const loadCycle = () => loadSemesters().then((list) => {
  const today = iso(new Date());
  const g = list.find((x) => x.current) || list.find((x) => x.from <= today && today <= x.endsOn) || null;
  if (!g) return null;
  return { from: g.from, to: g.endsOn < today ? g.endsOn : today < g.from ? g.endsOn : today, endsOn: g.endsOn, title: g.title };
});
export const useCycle = () => {
  const [cycle, setCycle] = useState(undefined);
  useEffect(() => { let alive = true; loadCycle().then((c) => { if (alive) setCycle(c); }); return () => { alive = false; }; }, []);
  return cycle;
};

// every semester registered in Metas (in force and archived), the newest first: "Semestre" picks one of them
export const loadCycles = () => loadSemesters();
export const useCycles = () => {
  const [list, setList] = useState(undefined);
  useEffect(() => { let alive = true; loadCycles().then((l) => { if (alive) setList(l); }); return () => { alive = false; }; }, []);
  return list;
};

const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const dayOf = (key) => new Date(`${key}T12:00:00`);
const addDays = (key, n) => { const d = dayOf(key); d.setDate(d.getDate() + n); return iso(d); };
// (mondayOf, above, gives the Monday of the week of a day: the week goes from Monday to Sunday)
const lastDayOf = (month) => { const [y, m] = month.split("-").map(Number); return iso(new Date(y, m, 0)); };
const monthText = (month) => `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} de ${month.slice(0, 4)}`;
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const cycleDates = (c) => {
  const today = iso(new Date());
  return { from: c.from, to: c.endsOn < today ? c.endsOn : today < c.from ? c.endsOn : today };
};

// the two dates of what was chosen. Semana: the week chosen (Monday to Sunday; the current one up to today). Mês: the month chosen (the
// current one up to today). Período: the dates typed. Ciclo: the cycle of goals chosen (the one in force when none was picked).
export const rangeDates = (value, cycle) => {
  const today = iso(new Date());
  const v = value || {};
  if (v.range === "today") return { from: today, to: today };
  if (v.range === "week") {
    const from = v.week || mondayOf(today);
    const end = addDays(from, 6);
    return { from, to: end > today ? today : end };
  }
  if (v.range === "custom") return { from: v.from || today, to: v.to || today };
  if (v.range === "cycle") {
    if (v.cycleFrom && v.cycleTo) return { from: v.cycleFrom, to: v.cycleTo };
    if (cycle) return { from: cycle.from, to: cycle.to };
  }
  const month = v.month || today.slice(0, 7);
  const end = lastDayOf(month);
  return { from: `${month}-01`, to: end > today ? today : end };
};
export const rangeText = (value, cycle) => {
  const v = value || {};
  const today = iso(new Date());
  if (v.range === "today") return "Hoje";
  if (v.range === "week") return !v.week || v.week === mondayOf(today) ? "Esta semana" : `${br(v.week)} a ${br(addDays(v.week, 6))}`;
  if (v.range === "month" || !v.range) return !v.month || v.month === today.slice(0, 7) ? "Este mês" : cap(monthText(v.month));
  if (v.range === "cycle") return v.cycleTitle || (cycle && cycle.title) || "Semestre";
  const d = rangeDates(v, cycle);
  return `${br(d.from)} a ${br(d.to)}`;
};


// A button in the look of the period buttons that opens a list (the semester, the month): the chosen one is marked, the keyboard moves in
// the list and Esc closes it; on the phone the list opens below the button and scrolls inside itself.
const WhichMenu = ({ label, items, value, onPick, ariaLabel }) => {
  const [anchor, setAnchor] = useState(null);
  const current = items.find((i) => String(i.value) === String(value));
  return (
    <>
      <button type="button" className="gv-which-btn" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={!!anchor} onClick={(e) => setAnchor(e.currentTarget)}>
        <span className="gv-which-btn-text">{label || (current && current.label) || ""}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} getContentAnchorEl={null}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }} transformOrigin={{ vertical: "top", horizontal: "left" }}
        PaperProps={{ className: "gv-which-menu" }} MenuListProps={{ "aria-label": ariaLabel, role: "listbox" }}>
        {items.map((i) => {
          const on = String(i.value) === String(value);
          return (
            <MenuItem key={i.value} selected={on} role="option" aria-selected={on} onClick={() => { setAnchor(null); onPick(i.value); }}>
              <span className="gv-which-mark" aria-hidden="true">{on ? <Check size={14} /> : null}</span>
              <span className="gv-which-item"><span>{i.label}</span>{i.hint ? <small>{i.hint}</small> : null}</span>
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
};

// The second half of the picker: WHICH week, month or cycle (or the two dates of "Período"), always the same height as the buttons
const PeriodWhich = ({ value, onChange, cycles }) => {
  const today = iso(new Date());
  const thisWeek = mondayOf(today);
  const thisMonth = today.slice(0, 7);
  if (value.range === "week") {
    const week = value.week || thisWeek;
    return (
      <span className="gv-which" role="group" aria-label="Qual semana">
        <button type="button" className="gv-step" aria-label="Semana anterior" onClick={() => onChange({ ...value, week: addDays(week, -7) })}><ChevronLeft size={16} /></button>
        <span className="gv-which-text">{week === thisWeek ? `Esta semana · ${br(week)} a ${br(addDays(week, 6))}` : `${br(week)} a ${br(addDays(week, 6))}`}</span>
        <button type="button" className="gv-step" aria-label="Próxima semana" disabled={week >= thisWeek} onClick={() => onChange({ ...value, week: addDays(week, 7) })}><ChevronRight size={16} /></button>
      </span>
    );
  }
  if (value.range === "month") {
    const month = value.month || thisMonth;
    const months = Array.from({ length: 24 }, (_, i) => { const d = new Date(Number(thisMonth.slice(0, 4)), Number(thisMonth.slice(5, 7)) - 1 - i, 1); return iso(d).slice(0, 7); });
    const shift = (n) => { const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1); onChange({ ...value, month: iso(d).slice(0, 7) }); };
    return (
      <span className="gv-which" role="group" aria-label="Qual mês">
        <button type="button" className="gv-step" aria-label="Mês anterior" disabled={month <= months[months.length - 1]} onClick={() => shift(-1)}><ChevronLeft size={16} /></button>
        <WhichMenu ariaLabel="Mês" value={month} label={month === thisMonth ? "Este mês" : cap(monthText(month))}
          items={months.map((m) => ({ value: m, label: m === thisMonth ? "Este mês" : cap(monthText(m)) }))}
          onPick={(m) => onChange({ ...value, month: m })} />
        <button type="button" className="gv-step" aria-label="Próximo mês" disabled={month >= thisMonth} onClick={() => shift(1)}><ChevronRight size={16} /></button>
      </span>
    );
  }
  if (value.range === "cycle") {
    if (!cycles || !cycles.length) return <span className="gv-which"><span className="gv-which-text">{cycles === undefined ? "Carregando os semestres..." : "Nenhum semestre cadastrado em Metas"}</span></span>;
    const year = (key) => `${br(key)}/${key.slice(2, 4)}`;
    const items = cycles.map((c) => ({ value: c.id, label: c.title || "Semestre", hint: `${year(c.from)} a ${year(c.endsOn)}${c.current ? " · em vigor" : ""}` }));
    const chosen = cycles.find((c) => String(c.id) === String(value.cycleId)) || cycles.find((c) => c.current) || cycles[0];
    return (
      <span className="gv-which">
        <WhichMenu ariaLabel="Qual semestre" value={chosen.id} label={`${chosen.title || "Semestre"} · ${year(chosen.from)} a ${year(chosen.endsOn)}`} items={items}
          onPick={(id) => { const c = cycles.find((x) => String(x.id) === String(id)); if (c) onChange({ ...value, cycleId: c.id, cycleTitle: c.title, cycleFrom: cycleDates(c).from, cycleTo: cycleDates(c).to }); }} />
      </span>
    );
  }
  if (value.range === "custom") {
    return (
      <span className="gv-which gv-dates">
        <input aria-label="De" type="date" value={value.from || ""} max={value.to || today} onChange={(e) => onChange({ ...value, from: e.target.value })} />
        <span>até</span>
        <input aria-label="Até" type="date" value={value.to || ""} min={value.from || undefined} max={today} onChange={(e) => onChange({ ...value, to: e.target.value })} />
      </span>
    );
  }
  return null;
};

/** Hoje | Semana | Mês | Período | Ciclo, and beside it which one: the week, the month, the two dates or the cycle of goals. */
export const RangePicker = ({ value, onChange, cycle }) => {
  const cycles = useCycles();
  const pick = (range) => {
    if (range === "custom") { const d = rangeDates(value, cycle); onChange({ ...value, range, from: value.from || d.from, to: value.to || d.to }); return; }
    if (range === "cycle") {
      // the semester in force (today inside it), else the newest one
      const today = iso(new Date());
      const list = cycles || [];
      const c = list.find((x) => x.current) || list.find((x) => x.from <= today && today <= x.endsOn) || list[0];
      if (c) { const d = cycleDates(c); onChange({ ...value, range, cycleId: c.id, cycleTitle: c.title, cycleFrom: d.from, cycleTo: d.to }); return; }
      if (cycle) { onChange({ ...value, range, cycleTitle: cycle.title, cycleFrom: cycle.from, cycleTo: cycle.to }); return; }
    }
    onChange({ ...value, range });
  };
  const noCycle = cycles !== undefined && !cycles.length && !cycle;
  return (
    <div className="gv-range">
      <div className="gv-seg" role="group" aria-label="Período">
        {Object.keys(RANGE_LABEL).map((k) => (
          <button key={k} type="button" aria-pressed={value.range === k} disabled={k === "cycle" && noCycle} onClick={() => pick(k)}
            title={k === "cycle" && noCycle ? "Nenhum semestre cadastrado em Metas" : undefined}>
            {RANGE_LABEL[k]}
          </button>
        ))}
      </div>
      <PeriodWhich value={value} onChange={onChange} cycles={cycles} />
    </div>
  );
};

// ---------------------------------------------------------------- the funnel, drawn as a funnel
/**
 * Each stage is a slice of the funnel: as wide as the leads that are in it or beyond it (`reach`), narrowing into the next one.
 * steps: [{ key, name, value, reach }]. `value` is the number written (the leads of the stage); without `reach` the value is used.
 */
// The funnel in layers (after the "Funnel Chart" of bklit on 21st.dev, made vertical so every stage of the CRM fits, also on the phone):
// each stage is a slice that narrows smoothly into the next one, with two soft rings around it; the share of who reached the stage
// sits in a pill in the middle, the name on the left and the number of leads in the stage now on the right.
const FUN_LAYERS = [{ scale: 1, opacity: 0.16 }, { scale: 0.9, opacity: 0.32 }, { scale: 0.8, opacity: 1 }];
const funPath = (w0, w1, h) => {
  // a curved slice from the width w0 (top) to w1 (bottom), centred in a box 100 wide
  const m = 50;
  const c = h * 0.55;
  return `M ${m - w0} 0 C ${m - w0} ${c}, ${m - w1} ${h - c}, ${m - w1} ${h} L ${m + w1} ${h} C ${m + w1} ${h - c}, ${m + w0} ${c}, ${m + w0} 0 Z`;
};
export const Funnel = ({ steps, onStep, footer, valueHint }) => {
  const [hover, setHover] = useState(null);
  const rows = (steps || []).map((s) => ({ ...s, value: Number(s.value) || 0, reach: Number(s.reach === undefined ? s.value : s.reach) || 0 }));
  const top = Math.max(1, ...rows.map((s) => s.reach));
  // half-width of a slice, in a box 100 wide: never thinner than a line that can still be seen and clicked
  const half = (s) => 3 + 47 * (s.reach / top);
  const H = 38;
  return (
    <div className="gv-fun" role="list" data-hover={hover === null ? undefined : "1"} onMouseLeave={() => setHover(null)}>
      {rows.map((s, i) => {
        const w0 = half(s);
        const w1 = i + 1 < rows.length ? half(rows[i + 1]) : Math.max(3, w0 * 0.82);
        const share = rows[0].reach > 0 ? Math.round((s.reach / rows[0].reach) * 100) : 0;
        const Tag = onStep ? "button" : "div";
        return (
          <Tag key={s.key} type={onStep ? "button" : undefined} className="gv-fun-row" role="listitem" data-empty={s.value ? undefined : "1"}
            data-on={hover === i ? "1" : undefined} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
            onClick={onStep ? () => onStep(s) : undefined} style={{ "--i": i }}
            aria-label={`${s.name}: ${nf(s.value)} agora. ${share}% chegaram até aqui`}>
            <span className="gv-fun-name" title={s.name}>{s.name}</span>
            <span className="gv-fun-shape" aria-hidden="true">
              <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="gv-fun-svg">
                {FUN_LAYERS.map((l) => (
                  <path key={l.scale} d={funPath(w0 * l.scale, w1 * l.scale, H)} className="gv-fun-layer" opacity={l.opacity} />
                ))}
              </svg>
              <span className="gv-fun-pill">{share}%</span>
            </span>
            <span className="gv-fun-val" title={valueHint}><b>{nf(s.value)}</b></span>
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
        <li key={it.key} data-tone={PRIORITY_TONE[it.tone] || "info"} className={it.onDismiss ? "gv-prio-dismissable" : undefined}>
          {/* "Dispensar até amanhã": the point leaves the list for the rest of the day */}
          {it.onDismiss ? <button type="button" className="gv-prio-x" onClick={it.onDismiss} aria-label={`Dispensar até amanhã: ${it.title}`} title="Dispensar até amanhã"><X size={15} /></button> : null}
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


// ---------------------------------------------------------------- one metric at a time over the days (the interactive area chart
// of shadcn, after "Area Charts 2" and "Chart Area" on 21st.dev): the tabs on top carry the total of each metric, the chart shows
// the chosen one on its own scale, with every day of the period (a day with nothing is 0, never a gap)
const ddmm = (k) => `${String(k).slice(8, 10)}/${String(k).slice(5, 7)}`;
const fillGaps = (points) => {
  if (points.length < 2) return points;
  const by = new Map(points.map((p) => [p.day, p.value]));
  const out = [];
  const d = new Date(`${points[0].day}T12:00:00`);
  const end = new Date(`${points[points.length - 1].day}T12:00:00`);
  while (d <= end) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ day: k, value: by.get(k) || 0 });
    d.setDate(d.getDate() + 1);
  }
  return out;
};
const MetricTip = ({ active, payload, unit, unitOne, week }) => {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="mx-tip">
      <span>{week ? `Semana de ${ddmm(p.day)}` : ddmm(p.day)}</span>
      <b>{nf(p.value)} {p.value === 1 && unitOne ? unitOne : unit}</b>
    </div>
  );
};
/**
 * metrics: [{ key, title, unit, unitOne, total, note, days: [{ day, value }] }]. loading, error and onRetry as in GlowPanel.
 */
export const MetricAreaCard = ({ title, badge, metrics, loading, error, onRetry }) => {
  const t = useChartTheme();
  const [shown, setShown] = useState(metrics && metrics[0] ? metrics[0].key : null);
  const [mode, setMode] = useState("day");
  const current = (metrics || []).find((m) => m.key === shown) || (metrics || [])[0];
  const week = mode === "week";
  const points = useMemo(() => {
    if (!current) return [];
    const all = fillGaps((current.days || []).map((d) => ({ day: String(d.day).slice(0, 10), value: Number(d.value) || 0 })).sort((a, b) => (a.day < b.day ? -1 : 1)));
    return week ? weeksOf(all) : all;
  }, [current, week]);
  const best = points.reduce((b, p) => (p.value > (b ? b.value : 0) ? p : b), null);
  const any = points.some((p) => p.value > 0);
  const color = t.c.brand;
  const unitOf = (v) => (v === 1 && current && current.unitOne ? current.unitOne : current ? current.unit : "");
  return (
    <section className="mx-chart" aria-busy={loading ? "true" : undefined}>
      <div className="mx-chart-top">
        <div style={{ minWidth: 0 }}>
          <h3 className="mx-title">{title}</h3>
          {badge ? <div className="mx-sub">{badge}</div> : null}
        </div>
        <Switch label="Agrupar por" value={mode} onChange={setMode} options={[["day", "Dia"], ["week", "Semana"]]} />
      </div>
      <div className="mx-tabs" role="group" aria-label="O que mostrar no gráfico">
        {(metrics || []).map((m) => (
          <button key={m.key} type="button" className="mx-tab" aria-pressed={current && current.key === m.key} onClick={() => setShown(m.key)}>
            <span className="mx-tab-title">{m.title}</span>
            {loading ? <span className="pk-skel" style={{ height: 26, width: 56, borderRadius: 6 }} aria-hidden="true" /> : <b>{nf(m.total)}</b>}
            {m.note ? <small>{m.note}</small> : null}
          </button>
        ))}
      </div>
      {error ? (
        <div className="pk-state" role="alert">
          <span>Não foi possível carregar estes números agora.</span>
          {onRetry ? <button type="button" className="pk-btn" onClick={onRetry}>Tentar de novo</button> : null}
        </div>
      ) : loading ? (
        <div className="pk-skel mx-chart-plot" aria-hidden="true" />
      ) : !any ? (
        <div className="mx-chart-plot mx-chart-empty"><EmptyNote>Nada registrado no período.</EmptyNote></div>
      ) : (
        <>
          <div className="mx-chart-plot" role="img" aria-label={`${current.title} ${week ? "por semana" : "por dia"}: total ${nf(current.total)}${best ? `, melhor ${week ? "semana" : "dia"} ${ddmm(best.day)} com ${nf(best.value)}` : ""}`}>
            <ResponsiveContainer>
              <AreaChart data={points} margin={{ top: 10, right: 6, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="mx-area-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.32} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={t.grid} strokeDasharray="3 4" />
                <XAxis dataKey="day" tickFormatter={ddmm} tickLine={false} axisLine={false} tick={{ fontSize: 11.5, fill: t.axis }} tickMargin={8} minTickGap={18} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11.5, fill: t.axis }} width={48} />
                <Tooltip cursor={{ stroke: t.axis, strokeDasharray: "3 3" }} content={<MetricTip unit={current.unit} unitOne={current.unitOne} week={week} />} />
                <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2.25} fill="url(#mx-area-fill)" activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff", fill: color }} dot={points.length <= 14 ? { r: 3, fill: color, strokeWidth: 0 } : false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mx-chart-foot">
            <span>Total no período: <b>{nf(current.total)} {unitOf(current.total)}</b></span>
            {best ? <span>{week ? "Melhor semana" : "Melhor dia"}: <b>{ddmm(best.day)} ({nf(best.value)})</b></span> : null}
          </div>
        </>
      )}
    </section>
  );
};
