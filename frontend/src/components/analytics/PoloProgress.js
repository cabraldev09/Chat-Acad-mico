import React, { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import { AlertTriangle, RefreshCw, Target } from "lucide-react";

import api from "../../services/api";

// The goals of every polo in the semester: target, what was done, the pace the period asks for by now and the forecast. The management
// and the consultants see the same cards (the consultant's own polos come first and marked); a click opens the goals of the polos.
const RED = "#dc2626";
const AMBER = "#d97706";
const GREEN = "#16a34a";

const useStyles = makeStyles((theme) => ({
  section: { display: "grid", gap: theme.spacing(1.5), minWidth: 0 },
  head: { display: "flex", alignItems: "baseline", gap: theme.spacing(1.5), flexWrap: "wrap" },
  h: { fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 },
  hint: { fontSize: 13, color: theme.palette.text.secondary },
  panel: { background: "radial-gradient(120% 60% at 50% 122%, color-mix(in srgb, var(--tone, var(--c-leads)) 18%, transparent) 0%, color-mix(in srgb, var(--tone, var(--c-leads)) 6%, transparent) 42%, transparent 70%), var(--surface)", border: "1px solid var(--line)", borderRadius: 18, padding: theme.spacing(2), boxShadow: "inset 0 -2px 0 color-mix(in srgb, var(--tone, var(--c-leads)) 40%, transparent), 0 1px 2px rgba(11,66,121,.05), 0 10px 24px -18px color-mix(in srgb, var(--c-brand) 55%, transparent)" },
  total: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" },
  totalNum: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" },
  polos: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" },
  polo: {
    display: "grid", gap: 10, textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "inherit", minWidth: 0,
    background: "radial-gradient(120% 60% at 50% 122%, color-mix(in srgb, var(--tone, var(--c-leads)) 18%, transparent) 0%, color-mix(in srgb, var(--tone, var(--c-leads)) 6%, transparent) 42%, transparent 70%), var(--surface)", border: "1px solid var(--line)", borderRadius: 18, padding: theme.spacing(2), boxShadow: "inset 0 -2px 0 color-mix(in srgb, var(--tone, var(--c-leads)) 40%, transparent), 0 1px 2px rgba(11,66,121,.05), 0 10px 24px -18px color-mix(in srgb, var(--c-brand) 55%, transparent)",
    transition: "border-color .15s", "&:hover": { borderColor: "var(--line-strong)" },
    "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
  },
  mine: { borderColor: "var(--c-brand, #0B4279)", boxShadow: "0 0 0 1px var(--c-brand, #0B4279) inset, var(--shadow-card)" },
  poloTop: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, minWidth: 0 },
  poloName: { fontWeight: 700, fontSize: 15, minWidth: 0, lineHeight: 1.25, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-word" },
  poloHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, minWidth: 0, minHeight: 38 },
  poloNum: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" },
  tag: { fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 999, background: "var(--c-brand, #0B4279)", color: "#fff", flex: "none" },
  track: { position: "relative", height: 6, borderRadius: 999, background: "var(--track)" },
  fill: { height: "100%", borderRadius: 999, transition: "width .6s cubic-bezier(.2,.8,.2,1)" },
  mark: { position: "absolute", top: -4, bottom: -4, width: 2, borderRadius: 2, background: "var(--text-1)", opacity: 0.55 },
  line: { fontSize: 13, color: theme.palette.text.secondary, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  retry: { border: "1px solid var(--line)", background: "transparent", color: "inherit", borderRadius: 10, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", gap: 6, alignItems: "center" },
  skeleton: { height: 132, borderRadius: "var(--radius-card)", background: "var(--surface-2)", border: "1px solid var(--line)" },
}));

// how a polo stands: reached, on pace, a little behind or far behind the pace that the period asks for by now
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

const PoloCard = ({ p, mine, onOpen }) => {
  const c = useStyles();
  const pace = paceOf(p);
  const hasTarget = p.target !== null && p.target !== undefined;
  return (
    <button type="button" className={`${c.polo} ${mine ? c.mine : ""}`} onClick={onOpen} aria-label={`${p.name}: ${pace.label}. Abrir as metas dos polos`}>
      <div className={c.poloHead}>
        <span className={c.poloName} title={p.name}>{p.name}</span>
        {mine ? <span className={c.tag}>Seu polo</span> : <span style={{ fontSize: 12.5, fontWeight: 700, color: pace.color, flex: "none" }}>{pace.label}</span>}
      </div>
      <div className={c.poloTop}>
        <span className={c.poloNum}>{p.done}{hasTarget && <span style={{ fontSize: 15, opacity: 0.6, fontWeight: 600 }}> / {p.target}</span>}</span>
        {hasTarget && <span style={{ fontWeight: 700, fontSize: 15, color: pace.color }}>{pctText(p.pct)}</span>}
      </div>
      {hasTarget && (
        <div className={c.track} role="progressbar" aria-valuenow={Math.round(p.pct || 0)} aria-valuemin={0} aria-valuemax={100} aria-label={`Progresso de ${p.name}`}>
          <div className={c.fill} style={{ width: `${Math.min(100, p.pct || 0)}%`, background: pace.color }} />
          {p.expectedPct > 0 && p.expectedPct < 100 && <span className={c.mark} style={{ left: `calc(${p.expectedPct}% - 1px)` }} title={`Ritmo esperado hoje: ${Math.round(p.expectedPct)}%`} />}
        </div>
      )}
      <div className={c.line}>
        {hasTarget ? (
          <>
            <span>{p.missing > 0 ? <>Faltam <b>{p.missing}</b>{p.perDay ? ` · ${String(p.perDay).replace(".", ",")} por dia útil` : ""}</> : "Meta cumprida"}</span>
            {mine && <span style={{ fontWeight: 700, color: pace.color }}>{pace.label}</span>}
            {!mine && p.forecast !== null && p.forecast !== undefined && p.pct < 100 && <span>Previsão: <b style={{ color: p.forecast >= p.target ? GREEN : RED }}>{p.forecast}</b></span>}
          </>
        ) : <span>Sem meta definida para o semestre.</span>}
      </div>
    </button>
  );
};

const PoloProgress = ({ title = "Metas dos polos" }) => {
  const c = useStyles();
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
      <section className={c.section}>
        <h2 className={c.h}>{title}</h2>
        <div className={c.panel} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <AlertTriangle size={18} color={AMBER} /> <span>Não foi possível carregar as metas dos polos.</span>
          <button type="button" className={c.retry} onClick={load}><RefreshCw size={14} /> Tentar de novo</button>
        </div>
      </section>
    );
  }
  if (!data) {
    return (
      <section className={c.section} aria-busy="true">
        <h2 className={c.h}>{title}</h2>
        <div className={c.polos}>{[0, 1, 2].map((i) => <div key={i} className={c.skeleton} />)}</div>
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
    <section className={c.section} aria-labelledby="polo-progress">
      <div className={c.head}>
        <h2 className={c.h} id="polo-progress">{title}</h2>
        {goal && <span className={c.hint}>{goal.title ? `${goal.title} · ` : ""}{fmtDay(goal.startsOn)} a {fmtDay(goal.endsOn)} · {goal.daysLeft} {goal.daysLeft === 1 ? "dia útil restante" : "dias úteis restantes"}</span>}
      </div>
      {!goal ? (
        <div className={c.panel} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Target size={18} /> Nenhum semestre com metas de polo ativo.
        </div>
      ) : (
        <>
          {t && t.target > 0 && (
            <div className={c.panel}>
              <div className={c.total}>
                <span className={c.totalNum}>{t.done} <span style={{ fontSize: 16, opacity: 0.6, fontWeight: 600 }}>de {t.target}</span></span>
                <span className={c.hint}>matrículas de todos os polos no semestre</span>
                <span style={{ flex: 1 }} />
                <b style={{ color: totalPace.color }}>{pctText(t.pct)} · {totalPace.label}</b>
              </div>
              <div className={c.track} style={{ marginTop: 10 }}>
                <div className={c.fill} style={{ width: `${Math.min(100, t.pct || 0)}%`, background: totalPace.color }} />
                {expected > 0 && expected < 100 && <span className={c.mark} style={{ left: `calc(${expected}% - 1px)` }} />}
              </div>
            </div>
          )}
          {polos.length === 0 ? <div className={c.panel}>Nenhum polo com meta neste semestre.</div> : (
            <div className={c.polos}>{polos.map((p) => <PoloCard key={p.poloId} p={p} mine={mine.has(Number(p.poloId))} onOpen={open} />)}</div>
          )}
          <div className={c.hint}>A marca na barra é o ritmo esperado para hoje. A previsão mantém o ritmo que o polo teve até agora.</div>
        </>
      )}
    </section>
  );
};

export default PoloProgress;
