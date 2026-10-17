import React from "react";
import { useHistory } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, CheckCircle2, RefreshCw, Target, AlertTriangle } from "lucide-react";

import { hm, useShared } from "./shared";

// Visão do gestor: few numbers, each one with something to do.
//   1. Precisa de atenção   what is stuck right now (each card opens the place where it is solved)
//   2. Progresso dos polos  target, pace and forecast of every polo in the current period, the furthest behind first
//   3. Período              four numbers and one chart for the days chosen at the top
const useStyles = makeStyles((theme) => {
  const dark = theme.palette.type === "dark";
  const line = dark ? "rgba(255,255,255,.09)" : "#e3e9f1";
  const soft = dark ? "rgba(255,255,255,.05)" : "#f1f4f8";
  return {
    section: { display: "grid", gap: theme.spacing(1.5), minWidth: 0 },
    head: { display: "flex", alignItems: "baseline", gap: theme.spacing(1.5), flexWrap: "wrap" },
    h: { fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 },
    hint: { fontSize: 13, color: theme.palette.text.secondary },
    alerts: { display: "grid", gap: theme.spacing(1.25), gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" },
    alert: {
      display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "inherit",
      background: dark ? "#0f1826" : "#ffffff", border: `1px solid ${line}`, borderLeftWidth: 4, borderRadius: 14, padding: "12px 14px",
      transition: "border-color .15s, transform .15s", "&:hover": { transform: "translateY(-1px)" },
      "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
    },
    alertN: { fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", minWidth: 40 },
    alertL: { fontSize: 13.5, lineHeight: 1.3, flex: 1 },
    good: { display: "flex", gap: 10, alignItems: "center", fontSize: 14.5, background: dark ? "#0f1826" : "#ffffff", border: `1px solid ${line}`, borderRadius: 14, padding: "14px 16px" },
    polos: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" },
    polo: {
      display: "grid", gap: 10, textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "inherit",
      background: dark ? "#0f1826" : "#ffffff", border: `1px solid ${line}`, borderRadius: 16, padding: theme.spacing(2),
      "&:hover": { borderColor: theme.palette.primary.main },
      "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
    },
    poloTop: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
    poloName: { fontWeight: 700, fontSize: 15, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    poloNum: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" },
    track: { position: "relative", height: 10, borderRadius: 999, background: soft },
    fill: { height: "100%", borderRadius: 999, transition: "width 1s cubic-bezier(.2,.8,.2,1)" },
    mark: { position: "absolute", top: -4, bottom: -4, width: 2, borderRadius: 2, background: dark ? "#e2e8f0" : "#0b1a2e" },
    line: { fontSize: 13, color: theme.palette.text.secondary, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
    badges: { display: "flex", gap: 6, flexWrap: "wrap" },
    badge: { fontSize: 11.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(245,158,11,.16)", color: dark ? "#fbbf24" : "#b45309" },
    badgeRed: { background: "rgba(220,38,38,.14)", color: dark ? "#fca5a5" : "#b91c1c" },
    notice: { display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, padding: "9px 12px", borderRadius: 10, background: "rgba(245,158,11,.14)" },
    band: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", [theme.breakpoints.down("sm")]: { gridTemplateColumns: "repeat(2, 1fr)" } },
    cell: { padding: theme.spacing(0.5, 2, 0.5, 0), "& b": { display: "block", fontSize: 28, letterSpacing: "-0.035em", fontVariantNumeric: "tabular-nums", marginTop: 4 }, "& span": { fontSize: 12.5, color: theme.palette.text.secondary } },
    retry: { border: `1px solid ${line}`, background: "transparent", color: "inherit", borderRadius: 10, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", gap: 6, alignItems: "center" },
  };
});

const RED = "#dc2626";
const AMBER = "#d97706";
const GREEN = "#16a34a";

// how a polo stands: reached, on pace, a little behind or far behind the pace that the period asks for by now
export const paceOf = (p) => {
  if (p.target === null || p.target === undefined || p.pct === null) return { tone: "none", color: "#64748b", label: "Sem meta definida" };
  if (p.pct >= 100) return { tone: "reached", color: GREEN, label: "Meta batida" };
  const gap = p.pct - (p.expectedPct || 0);
  if (gap >= 0) return { tone: "ok", color: GREEN, label: "No ritmo" };
  if (gap >= -10) return { tone: "late", color: AMBER, label: "Um pouco atrás" };
  return { tone: "behind", color: RED, label: "Atrasado" };
};
const ORDER = { behind: 0, late: 1, ok: 2, reached: 3, none: 4 };
export const sortPolos = (rows) =>
  [...rows].sort((a, b) => {
    const pa = paceOf(a), pb = paceOf(b);
    if (ORDER[pa.tone] !== ORDER[pb.tone]) return ORDER[pa.tone] - ORDER[pb.tone];
    return ((a.pct ?? 0) - (a.expectedPct ?? 0)) - ((b.pct ?? 0) - (b.expectedPct ?? 0)) || String(a.name).localeCompare(String(b.name), "pt-BR");
  });

const fmtDay = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "");
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const PoloCard = ({ p, onOpen }) => {
  const c = useStyles();
  const pace = paceOf(p);
  const hasTarget = p.target !== null && p.target !== undefined;
  const width = hasTarget ? Math.min(100, p.pct || 0) : 0;
  const stuck = [
    p.unanswered > 0 && [plural(p.unanswered, "conversa sem resposta", "conversas sem resposta"), true],
    p.onboardingLate > 0 && [`Ambientação parada: ${p.onboardingLate}`, false],
    p.atRisk > 0 && [plural(p.atRisk, "aluno em risco", "alunos em risco"), false],
  ].filter(Boolean);
  return (
    <button type="button" className={c.polo} onClick={onOpen} aria-label={`${p.name}: ${pace.label}. Abrir as metas`}>
      <div className={c.poloTop}>
        <span className={c.poloName} title={p.name}>{p.name}</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: pace.color }}>{pace.label}</span>
      </div>
      <div className={c.poloTop}>
        <span className={c.poloNum}>{p.done}{hasTarget && <span style={{ fontSize: 15, opacity: 0.6, fontWeight: 600 }}> / {p.target}</span>}</span>
        {hasTarget && <span style={{ fontWeight: 700, fontSize: 15, color: pace.color }}>{String(Math.round(p.pct)).replace(".", ",")}%</span>}
      </div>
      {hasTarget && (
        <div className={c.track} role="progressbar" aria-valuenow={Math.round(p.pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`Progresso de ${p.name}`}>
          <div className={c.fill} style={{ width: `${width}%`, background: pace.color }} />
          {p.expectedPct > 0 && p.expectedPct < 100 && <span className={c.mark} style={{ left: `calc(${p.expectedPct}% - 1px)` }} title={`Ritmo esperado hoje: ${Math.round(p.expectedPct)}%`} />}
        </div>
      )}
      {hasTarget ? (
        <div className={c.line}>
          <span>{p.missing > 0 ? <>Faltam <b>{p.missing}</b>{p.perDay ? ` · ${String(p.perDay).replace(".", ",")} por dia útil` : ""}</> : "Meta cumprida"}</span>
          {p.forecast !== null && p.forecast !== undefined && p.pct < 100 && <span>Previsão: <b style={{ color: p.forecast >= p.target ? GREEN : RED }}>{p.forecast}</b></span>}
        </div>
      ) : (
        <div className={c.line}><span>Defina a meta deste polo em Metas.</span></div>
      )}
      {stuck.length > 0 && (
        <div className={c.badges}>
          {stuck.map(([text, red]) => <span key={text} className={`${c.badge} ${red ? c.badgeRed : ""}`}>{text}</span>)}
        </div>
      )}
    </button>
  );
};

const ManagerView = ({ data, error, onRetry, periodName }) => {
  const c = useStyles();
  const s = useShared();
  const history = useHistory();

  if (error && !data) {
    return (
      <div className={s.panel} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <AlertTriangle size={18} color={AMBER} /> <span>Não foi possível carregar a visão do gestor.</span>
        <button type="button" className={c.retry} onClick={onRetry}><RefreshCw size={14} /> Tentar de novo</button>
      </div>
    );
  }
  if (!data) return <div className={s.panel} style={{ opacity: 0.6 }}>Carregando a visão do gestor...</div>;

  const polos = sortPolos(data.polos || []);
  const t = data.totals;
  const goal = data.goal;
  const per = data.period;
  const daily = (per.daily || []).map((d) => ({ ...d, name: new Date(`${d.day}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) }));

  return (
    <div className={s.stack}>
      <section className={c.section} aria-labelledby="mv-alerts">
        <div className={c.head}>
          <h2 className={c.h} id="mv-alerts">Precisa de atenção</h2>
          <span className={c.hint}>Situação de agora, sem relação com o período escolhido</span>
        </div>
        {data.alerts.length === 0 ? (
          <div className={c.good}><CheckCircle2 size={20} color={GREEN} /> Tudo em dia: nada parado nos pontos que acompanhamos.</div>
        ) : (
          <div className={c.alerts}>
            {data.alerts.map((a) => (
              <button key={a.key} type="button" className={c.alert} style={{ borderLeftColor: a.tone === "danger" ? RED : AMBER }} onClick={() => history.push(a.to)}>
                <span className={c.alertN} style={{ color: a.tone === "danger" ? RED : AMBER }}>{a.count}</span>
                <span className={c.alertL}>{a.label}</span>
                <ArrowUpRight size={16} style={{ opacity: 0.5 }} />
              </button>
            ))}
          </div>
        )}
      </section>

      <section className={c.section} aria-labelledby="mv-polos">
        <div className={c.head}>
          <h2 className={c.h} id="mv-polos">Progresso dos polos</h2>
          {goal && (
            <span className={c.hint}>
              {goal.title ? `${goal.title} · ` : ""}{fmtDay(goal.startsOn)} a {fmtDay(goal.endsOn)} · {plural(goal.daysLeft, "dia útil restante", "dias úteis restantes")}
              {t && t.target > 0 ? ` · Geral: ${t.done} de ${t.target} (${String(Math.round(t.pct || 0)).replace(".", ",")}%)` : ""}
            </span>
          )}
        </div>
        {!goal ? (
          <div className={s.panel}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Target size={18} /> Nenhum semestre com metas de polo ativo.
              <button type="button" className={c.retry} onClick={() => history.push("/crm/metas")}>Criar as metas</button>
            </div>
          </div>
        ) : polos.length === 0 ? (
          <div className={s.panel}>Nenhum polo com meta ou matrícula neste semestre.</div>
        ) : (
          <>
            {data.unassignedWon > 0 && (
              <div className={c.notice}><AlertTriangle size={16} color={AMBER} /> {plural(data.unassignedWon, "matrícula do semestre está", "matrículas do semestre estão")} sem polo definido e não {data.unassignedWon === 1 ? "entra" : "entram"} no progresso de nenhum polo.</div>
            )}
            <div className={c.polos}>
              {polos.map((p) => <PoloCard key={p.poloId} p={p} onOpen={() => history.push("/crm/metas-polos")} />)}
            </div>
            <div className={c.hint}>A marca na barra é o ritmo esperado para hoje. A previsão mantém o ritmo que o polo teve até agora.</div>
          </>
        )}
      </section>

      <section className={c.section} aria-labelledby="mv-period">
        <div className={c.head}>
          <h2 className={c.h} id="mv-period">Período</h2>
          <span className={c.hint}>{periodName}</span>
        </div>
        <div className={s.panel}>
          <div className={c.band}>
            <div className={c.cell}><span>Atendimentos</span><b>{per.attendances}</b></div>
            <div className={c.cell}><span>Mensagens</span><b>{per.messages}</b></div>
            <div className={c.cell}><span>Tempo mediano de resposta</span><b style={{ color: per.medianMin === null ? undefined : per.medianMin <= data.slaMinutes ? GREEN : per.medianMin > data.slaMinutes * 2 ? RED : AMBER }}>{hm(per.medianMin)}</b></div>
            <div className={c.cell}><span>Respondidas no prazo ({data.slaMinutes} min)</span><b>{per.withinSlaPct === null ? "—" : `${per.withinSlaPct}%`}</b></div>
          </div>
          {daily.length > 1 && (
            <div style={{ height: 190, marginTop: 14 }}>
              <ResponsiveContainer>
                <BarChart data={daily} margin={{ top: 6, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.35} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                  <Tooltip cursor={{ fill: "rgba(127,127,127,.08)" }} formatter={(v) => [v, "Atendimentos"]} />
                  <Bar dataKey="total" fill="#0693E3" radius={[4, 4, 0, 0]} animationDuration={1000} animationEasing="ease-out" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default ManagerView;
