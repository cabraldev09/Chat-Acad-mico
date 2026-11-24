import React, { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";

import api from "../../services/api";
import { GlowPanel, SectionTitle } from "../peak";

// The goals of every polo in the semester: target, what was done, the pace the period asks for by now and the forecast. The management
// and the consultants see the same cards (the consultant's own polos come first and marked); a click opens the goals of the polos.
const RED = "#dc2626";
const AMBER = "#d97706";
const GREEN = "#16a34a";

export const paceOf = (p) => {
  if (p.target === null || p.target === undefined || p.pct === null || p.pct === undefined) return { tone: "none", color: "#64748b", label: "Sem meta definida" };
  if (p.pct >= 100) return { tone: "reached", color: GREEN, label: "Meta batida" };
  const gap = p.pct - (p.expectedPct || 0);
  if (gap >= 0) return { tone: "ok", color: GREEN, label: "No ritmo" };
  if (gap >= -10) return { tone: "late", color: AMBER, label: "Um pouco atrás" };
  return { tone: "behind", color: RED, label: "Atrasado" };
};
const ORDER = { behind: 0, late: 1, ok: 2, reached: 3, none: 4 };
const sortPolos = (rows, mine) =>
  [...rows].sort((a, b) => {
    const ma = mine.has(Number(a.poloId)) ? 0 : 1, mb = mine.has(Number(b.poloId)) ? 0 : 1;
    if (ma !== mb) return ma - mb;
    const pa = paceOf(a), pb = paceOf(b);
    if (ORDER[pa.tone] !== ORDER[pb.tone]) return ORDER[pa.tone] - ORDER[pb.tone];
    return ((a.pct ?? 0) - (a.expectedPct ?? 0)) - ((b.pct ?? 0) - (b.expectedPct ?? 0)) || String(a.name).localeCompare(String(b.name), "pt-BR");
  });

const fmtDay = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "");
const pctText = (v) => `${String(Math.round(v || 0)).replace(".", ",")}%`;

// the share of the goal as a ring, in the colour of the pace: read at a glance, where a thin bar with a mark was a ruler
export const PaceRing = ({ pct, color, size = 62, stroke = 7 }) => {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ flex: "none" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - p / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" fill="var(--text-1)" style={{ fontSize: size * 0.27, fontWeight: 700, letterSpacing: "-0.02em" }}>{Math.round(Number(pct) || 0)}%</text>
    </svg>
  );
};

// one polo, in the colours of the screen of the goals: the name on a navy band with the share of the goal, then "done of target"
// and one line with what is missing
const PoloCard = ({ p, mine, onOpen }) => {
  const pace = paceOf(p);
  const hasTarget = p.target !== null && p.target !== undefined;
  return (
    <button type="button" className="pp-card" data-mine={mine ? "1" : undefined} onClick={onOpen} aria-label={`${p.name}: ${pace.label}. Abrir as metas dos polos`}>
      <span className="pp-head">
        <span className="pp-name">{p.name}{mine ? <small> · seu polo</small> : null}</span>
        {hasTarget ? <span className="pp-pct" style={{ background: pace.color }}>{pctText(p.pct)}</span> : null}
      </span>
      <span className="pp-body">
        {hasTarget ? <PaceRing pct={p.pct} color={pace.color} size={54} stroke={6} /> : null}
        <span style={{ minWidth: 0, display: "grid", gap: 3 }}>
          <span className="pp-num">{p.done}{hasTarget && <small> de {p.target}</small>}</span>
          <span className="pk-hint" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: pace.color, flex: "none" }} aria-hidden="true" />
            {hasTarget ? (p.missing > 0 ? <>{pace.label}, faltam {p.missing}{p.perDay ? ` (${String(p.perDay).replace(".", ",")} por dia útil)` : ""}</> : "Meta cumprida") : "Sem meta definida"}
          </span>
        </span>
      </span>
    </button>
  );
};

// onlyMine: the reader's own polos and the total (the screen of the consultant); a link opens all of them
const PoloProgress = ({ title = "Metas dos polos", onlyMine = false }) => {
  const history = useHistory();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    setError(false);
    api.get("/dashboard/polos-progress").then(({ data: d }) => setData(d)).catch(() => setError(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error && !data) {
    return (
      <section>
        <SectionTitle title={title} />
        <GlowPanel error onRetry={load} />
      </section>
    );
  }
  if (!data) {
    return (
      <section aria-busy="true">
        <SectionTitle title={title} />
        <div className="pk-grid-4">{[0, 1, 2, 3].map((i) => <div key={i} className="pk pk-skel" style={{ height: 150 }} />)}</div>
      </section>
    );
  }
  const mine = new Set((data.mine || []).map(Number));
  const goal = data.goal;
  const t = data.totals;
  const everyPolo = sortPolos(data.polos || [], mine);
  const narrowed = onlyMine && mine.size > 0;
  const polos = narrowed ? everyPolo.filter((p) => mine.has(Number(p.poloId))) : everyPolo;
  const open = () => history.push("/crm/metas-polos");
  // the pace the whole semester asks for by now: the same mark the polos use (they share the semester)
  const withPace = (data.polos || []).find((p) => p.expectedPct !== null && p.expectedPct !== undefined);
  const expected = withPace ? withPace.expectedPct : goal && goal.daysTotal ? Math.round((goal.elapsed / goal.daysTotal) * 1000) / 10 : 0;
  const totalPace = t ? paceOf({ target: t.target, pct: t.pct, expectedPct: expected }) : null;
  return (
    <section>
      <SectionTitle title={title} action={narrowed && everyPolo.length > polos.length ? <button type="button" className="pk-btn" onClick={open}>Ver todos os polos ({everyPolo.length})</button> : null} hint={goal ? `${goal.title ? `${goal.title}, ` : ""}${fmtDay(goal.startsOn)} a ${fmtDay(goal.endsOn)}, ${goal.daysLeft} ${goal.daysLeft === 1 ? "dia útil restante" : "dias úteis restantes"}` : undefined} />
      {!goal ? (
        <GlowPanel empty emptyText="Nenhum semestre com metas de polo ativo." />
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {t && t.target > 0 && (
            <div className="pp-hero" data-panel="polos-total">
              <PaceRing pct={t.pct} color="#fff" size={92} stroke={9} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="pp-hero-num">{t.done}<small> / {t.target}</small></div>
                <div className="pp-hero-sub">Matrículas de todos os polos no semestre{t.missing > 0 ? ` · faltam ${t.missing}` : ""}</div>
              </div>
              <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                <span className="pp-pct" style={{ background: totalPace.color }}>{totalPace.label}</span>
                {expected > 0 && expected < 100 ? <span className="pp-hero-sub">Ritmo esperado para hoje: {pctText(expected)}</span> : null}
              </div>
            </div>
          )}
          {polos.length === 0 ? <GlowPanel empty emptyText="Nenhum polo com meta neste semestre." /> : (
            <div className="pk-ringgrid">{polos.map((p) => <PoloCard key={p.poloId} p={p} mine={mine.has(Number(p.poloId))} onOpen={open} />)}</div>
          )}
        </div>
      )}
    </section>
  );
};

export default PoloProgress;
