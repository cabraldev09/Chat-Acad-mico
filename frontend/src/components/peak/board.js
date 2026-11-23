import React, { useMemo, useState } from "react";

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
