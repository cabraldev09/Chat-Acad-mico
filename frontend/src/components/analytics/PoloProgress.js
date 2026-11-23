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
const PaceRing = ({ pct, color, size = 62, stroke = 7 }) => {
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
const TONE_OF = { reached: "good", ok: "good", late: "warn", behind: "bad", none: undefined };

const PoloCard = ({ p, mine, onOpen }) => {
  const pace = paceOf(p);
  const hasTarget = p.target !== null && p.target !== undefined;
  return (
    <button type="button" className="pk" data-tone={TONE_OF[pace.tone]} onClick={onOpen} aria-label={`${p.name}: ${pace.label}. Abrir as metas dos polos`}
      style={{ padding: "16px 16px 14px", display: "grid", gap: 10, ...(mine ? { borderColor: "var(--c-brand)", boxShadow: "0 0 0 1px var(--c-brand), 0 10px 22px -14px rgba(11,66,121,.45)" } : {}) }}>
      <span style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, minWidth: 0 }} title={p.name}>{p.name}</span>
        {mine ? <span className="pk-badge" style={{ background: "#0b4279", color: "#fff", flex: "none" }}>Seu polo</span> : null}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {hasTarget ? <PaceRing pct={p.pct} color={pace.color} /> : null}
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 26, fontWeight: 750, letterSpacing: "-0.03em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums", color: "var(--text-1)" }}>
            {p.done}{hasTarget && <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-2)" }}> de {p.target}</span>}
          </span>
          <span className="pk-badge" data-tone={TONE_OF[pace.tone]} style={{ marginTop: 6 }}>{pace.label}</span>
        </span>
      </span>
      <span className="pk-hint">
        {hasTarget ? (
          <>
            {p.missing > 0 ? <>Faltam <b>{p.missing}</b>{p.perDay ? `, ${String(p.perDay).replace(".", ",")} por dia útil` : ""}</> : "Meta cumprida"}
            {p.forecast !== null && p.forecast !== undefined && p.pct < 100 ? <>. Previsão no ritmo atual: <b style={{ color: p.forecast >= p.target ? GREEN : RED }}>{p.forecast}</b></> : null}
          </>
        ) : "Sem meta definida para o semestre."}
      </span>
    </button>
  );
};

const PoloProgress = ({ title = "Metas dos polos" }) => {
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
  const polos = sortPolos(data.polos || [], mine);
  const open = () => history.push("/crm/metas-polos");
  // the pace the whole semester asks for by now: the same mark the polos use (they share the semester)
  const withPace = (data.polos || []).find((p) => p.expectedPct !== null && p.expectedPct !== undefined);
  const expected = withPace ? withPace.expectedPct : goal && goal.daysTotal ? Math.round((goal.elapsed / goal.daysTotal) * 1000) / 10 : 0;
  const totalPace = t ? paceOf({ target: t.target, pct: t.pct, expectedPct: expected }) : null;
  return (
    <section>
      <SectionTitle title={title} hint={goal ? `${goal.title ? `${goal.title}, ` : ""}${fmtDay(goal.startsOn)} a ${fmtDay(goal.endsOn)}, ${goal.daysLeft} ${goal.daysLeft === 1 ? "dia útil restante" : "dias úteis restantes"}` : undefined} />
      {!goal ? (
        <GlowPanel empty emptyText="Nenhum semestre com metas de polo ativo." />
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {t && t.target > 0 && (
            <GlowPanel id="polos-total" tone={TONE_OF[totalPace.tone] || "brand"}>
              <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
                <PaceRing pct={t.pct} color={totalPace.color} size={84} stroke={9} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 34, fontWeight: 750, letterSpacing: "-0.03em", lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{t.done} <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text-2)" }}>de {t.target}</span></div>
                  <div className="pk-hint" style={{ marginTop: 4 }}>Matrículas de todos os polos no semestre</div>
                </div>
                <div style={{ display: "grid", gap: 4, justifyItems: "end" }}>
                  <span className="pk-badge" data-tone={TONE_OF[totalPace.tone]}>{totalPace.label}</span>
                  {expected > 0 && expected < 100 ? <span className="pk-hint">Ritmo esperado para hoje: {pctText(expected)}</span> : null}
                </div>
              </div>
            </GlowPanel>
          )}
          {polos.length === 0 ? <GlowPanel empty emptyText="Nenhum polo com meta neste semestre." /> : (
            <div className="pk-grid-4">{polos.map((p) => <PoloCard key={p.poloId} p={p} mine={mine.has(Number(p.poloId))} onOpen={open} />)}</div>
          )}
        </div>
      )}
    </section>
  );
};

export default PoloProgress;
