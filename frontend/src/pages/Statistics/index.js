import React, { useContext, useState } from "react";
import { Redirect, useHistory, useLocation } from "react-router-dom";
import { AlertTriangle, Sparkles } from "lucide-react";

import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import StatsHubBar from "../../components/StatsHub";
import { ChartCard, RankBars } from "../../components/charts";
import { useKit, useAnalytics, PeriodPicker, periodParams, num } from "../../components/analytics/kit";

// Estatísticas: one panel with the real numbers of the system, in tabs. The management sees the whole team; a consultant sees only their
// own numbers (the server decides, whatever is asked); a tutor sees the tutoring. Every block handles loading, empty and error.

const pct = (v) => (v === null || v === undefined ? "-" : `${String(Math.round(v * 10) / 10).replace(".", ",")}%`);
const rank = (list, nameKey, valueKey, color, note) => {
  const max = Math.max(1, ...list.map((r) => Number(r[valueKey]) || 0));
  return list.slice(0, 8).map((r) => ({ key: String(r[nameKey]), name: String(r[nameKey]), value: num(r[valueKey]), bar: ((Number(r[valueKey]) || 0) / max) * 100, color, note: note ? note(r) : undefined }));
};

const Stat = ({ label, value, hint, tone }) => {
  const c = useKit();
  return (
    <div className={c.kpi} style={{ "--tone": tone || "#0693E3" }}>
      <div className={c.kpiLabel}><span>{label}</span></div>
      <div className={c.kpiValue}>{value}</div>
      {hint ? <div className={c.kpiHint}>{hint}</div> : null}
    </div>
  );
};

const Failed = ({ onRetry }) => {
  const c = useKit();
  return (
    <div className={c.panel} role="alert" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <AlertTriangle size={16} style={{ color: "#b45309" }} />
      <span style={{ flex: 1, minWidth: 0 }}>Não foi possível carregar estes números agora.</span>
      <button type="button" className={c.btn} onClick={onRetry}>Tentar de novo</button>
    </div>
  );
};

const Commercial = ({ params }) => {
  const c = useKit();
  const { data, loading, error, reload } = useAnalytics("/analytics/commercial", params);
  if (error && !data) return <Failed onRetry={reload} />;
  const d = data || { volume: {}, stages: [], objections: { byType: [] }, lostReasons: [], sales: { byCity: [], byCourse: [], byConsultant: [] }, process: { skipped: [] } };
  const wait = loading && !data;
  const enrollments = (d.sales.byConsultant || []).reduce((t, r) => t + r.n, 0);
  const stalled = (d.stages || []).reduce((t, s) => t + (s.stalled || 0), 0);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className={c.grid4}>
        <Stat label="Conversas atendidas" value={wait ? "…" : num(d.volume.conversations)} hint="Cada conversa conta uma vez" tone="#0693E3" />
        <Stat label="Pessoas contatadas" value={wait ? "…" : num(d.volume.peopleContacted)} hint={`${num(d.volume.newContacts)} pela primeira vez`} tone="#7c3aed" />
        <Stat label="Matrículas" value={wait ? "…" : num(enrollments)} hint="Primeiras matrículas e cursos extras" tone="#16a34a" />
        <Stat label={`Parados há ${d.stalledDays || 7} dias ou mais`} value={wait ? "…" : num(stalled)} hint="Leads abertos sem mudar de etapa" tone="#d97706" />
      </div>
      <div className={c.cols}>
        <ChartCard title="Onde os leads param" sub="Abertos em cada etapa, parados e tempo médio na etapa" loading={wait} empty={!d.stages.length}>
          <div className={c.scroll}>
            <table className={c.table}>
              <thead><tr><th>Etapa</th><th className="r">Abertos</th><th className="r">Parados</th><th className="r">Tempo médio</th></tr></thead>
              <tbody>
                {d.stages.map((s) => (
                  <tr key={s.stageId} style={{ cursor: "default" }}>
                    <td><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: s.color || "var(--c-leads)", marginRight: 8 }} />{s.name}</td>
                    <td className="r">{num(s.open)}</td>
                    <td className="r" style={{ color: s.stalled ? "#b45309" : undefined, fontWeight: s.stalled ? 700 : undefined }}>{num(s.stalled)}</td>
                    <td className="r">{s.avgDays === null || s.avgDays === undefined ? "-" : `${String(s.avgDays).replace(".", ",")} d`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
        <ChartCard title="Objeções mais comuns" sub="Da revisão diária das conversas e do agente de IA" loading={wait} empty={!d.objections.byType.length} emptyText="Nenhuma objeção registrada no período.">
          <RankBars rows={rank(d.objections.byType.map((o) => ({ ...o, total: o.n + o.agent })), "type", "total", "warn", (o) => (o.unhandled ? `${o.unhandled} sem resposta` : undefined))} />
        </ChartCard>
      </div>
      <div className={c.cols}>
        <ChartCard title="Matrículas por cidade" sub="Onde estão os alunos que se matricularam no período" loading={wait} empty={!d.sales.byCity.length}><RankBars rows={rank(d.sales.byCity, "name", "n", "won")} /></ChartCard>
        <ChartCard title="Etapas do processo mais puladas" sub="Uma etapa sem fazer enquanto a seguinte já foi feita" loading={wait} empty={!d.process.skipped.length} emptyText="Nenhuma etapa pulada no período.">
          <RankBars rows={rank(d.process.skipped, "label", "n", "lost")} />
        </ChartCard>
      </div>
      <div className={c.sub}>Origem dos leads, cursos mais procurados e motivos de perda estão na aba Captação.</div>
    </div>
  );
};

const Consultants = ({ params }) => {
  const c = useKit();
  const { data, loading, error, reload } = useAnalytics("/analytics/commercial", params);
  if (error && !data) return <Failed onRetry={reload} />;
  const rows = (data && data.consultants) || [];
  const top = (data && data.sales && data.sales.top) || [];
  return (
    <div style={{ display: "grid", gap: 16 }}>
    <ChartCard title="Cada consultor no período" sub="Conversas, pessoas, matrículas e como o processo foi seguido" loading={loading && !data} empty={!rows.length} emptyText="Nenhum consultor com atividade no período.">
      <div className={c.scroll}>
        <table className={c.table}>
          <thead><tr><th>Consultor</th><th className="r">Conversas</th><th className="r">Pessoas</th><th className="r">Matrículas</th><th className="r">Grades enviadas</th><th className="r">Grade faltando</th><th className="r">Com áudio</th><th className="r">Processo seguido</th><th className="r">Parados</th><th className="r">Perdidos</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} style={{ cursor: "default" }}>
                <td style={{ whiteSpace: "nowrap" }}>{r.name}</td>
                <td className="r">{num(r.conversations)}</td>
                <td className="r">{num(r.peopleContacted)}</td>
                <td className="r" style={{ fontWeight: 700 }}>{num(r.enrollments)}</td>
                <td className="r">{num(r.gradesSent)}</td>
                <td className="r" style={{ color: r.gradeMissing ? "#b45309" : undefined }}>{num(r.gradeMissing)}</td>
                <td className="r">{pct(r.audioShare)}</td>
                <td className="r">{pct(r.processAvg)}</td>
                <td className="r">{num(r.stalled)}</td>
                <td className="r">{num(r.lost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
    {top.length > 0 && (
      <ChartCard title="Quem vende o quê" sub="Os 5 maiores pares de consultor e curso no período">
        <RankBars rows={rank(top.map((t) => ({ ...t, label: `${t.name}: ${t.course}` })), "label", "n", "brand")} />
      </ChartCard>
    )}
    </div>
  );
};

const Training = ({ params }) => {
  const c = useKit();
  const { data, loading, error, reload } = useAnalytics("/analytics/coaching", params);
  const [tips, setTips] = useState({});
  const [busy, setBusy] = useState(false);
  if (error && !data) return <Failed onRetry={reload} />;
  const list = ((data && data.consultants) || []).filter((x) => x.items.length || x.reviewed);
  const suggest = async () => {
    setBusy(true);
    try {
      const { data: r } = await api.post("/analytics/coaching/text", params);
      setTips(Object.fromEntries((r.tips || []).map((t) => [t.userId, t.text])));
    } catch (err) { toastError(err); }
    setBusy(false);
  };
  return (
    <ChartCard
      title="Treinamento sugerido"
      sub={data ? `A IA lê as conversas do dia uma vez por dia, sem CPF, telefone e nomes. Só aparece o que se repete em pelo menos ${data.minReviews} conversas.${data.enabled ? "" : " A leitura diária está desligada."}` : ""}
      loading={loading && !data}
      empty={!list.length}
      emptyText="Ainda não há conversas lidas no período para sugerir treinamento."
      action={list.some((x) => x.items.length) ? <button type="button" className={c.btnPrimary} disabled={busy} onClick={suggest} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Sparkles size={14} />{busy ? "Escrevendo…" : "Sugerir treinamento"}</button> : null}
    >
      <div style={{ display: "grid", gap: 10 }}>
        {list.map((x) => (
          <div key={x.userId} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <b>{x.name}</b><span className={c.sub} style={{ marginTop: 0 }}>{num(x.reviewed)} conversa(s) lidas</span>
            </div>
            {x.items.length ? (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13.5, display: "grid", gap: 2 }}>
                {x.items.map((it) => <li key={`${it.kind}-${it.key}`}>{it.text}</li>)}
              </ul>
            ) : <div className={c.sub}>Nada se repetiu no período.</div>}
            {x.strengths && x.strengths.length > 0 && <div className={c.sub}>Pontos fortes: {x.strengths.join(", ")}</div>}
            {tips[x.userId] && <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 8, background: "var(--surface-2)", fontSize: 13.5 }}><b>Sugestão:</b> {tips[x.userId]}</div>}
          </div>
        ))}
      </div>
    </ChartCard>
  );
};

export const Tutoring = ({ params }) => {
  const c = useKit();
  const { data, loading, error, reload } = useAnalytics("/analytics/tutoria", params);
  if (error && !data) return <Failed onRetry={reload} />;
  const d = data || { totals: {}, onboardingStalled: [], tutors: [] };
  const t = d.totals || {};
  const wait = loading && !data;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className={c.grid4}>
        <Stat label="Alunos acompanhados" value={wait ? "…" : num(t.students)} hint={`${num(t.onboardingOpen)} em ambientação`} tone="#0693E3" />
        <Stat label={`Sem contato há ${d.noContactDays || 7} dias`} value={wait ? "…" : num(t.noContact)} hint="Nenhuma mensagem do tutor" tone="#d97706" />
        <Stat label="Risco de evasão" value={wait ? "…" : num(t.atRisk)} hint={`${num(t.atRiskWithFee)} com taxa em aberto`} tone="#dc2626" />
        <Stat label="Rematrículas" value={wait ? "…" : num(t.reenrolled)} hint="No período" tone="#16a34a" />
      </div>
      <div className={c.cols}>
        <ChartCard title="Onde a ambientação para" sub="Alunos com a etapa ainda aberta" loading={wait} empty={!d.onboardingStalled.some((s) => s.n)} emptyText="Nenhuma etapa da ambientação parada.">
          <RankBars rows={rank(d.onboardingStalled, "label", "n", "warn")} />
        </ChartCard>
        <ChartCard title="Cada tutor" loading={wait} empty={!d.tutors.length} emptyText="Nenhum tutor com alunos.">
          <div className={c.scroll}>
            <table className={c.table}>
              <thead><tr><th>Tutor</th><th className="r">Alunos</th><th className="r">Sem contato</th><th className="r">Em risco</th><th className="r">Rematrículas</th><th className="r">NPS</th></tr></thead>
              <tbody>
                {d.tutors.map((r) => (
                  <tr key={r.tutorId} style={{ cursor: "default" }}>
                    <td style={{ whiteSpace: "nowrap" }}>{r.name}</td>
                    <td className="r">{num(r.students)}</td>
                    <td className="r" style={{ color: r.noContact ? "#b45309" : undefined }}>{num(r.noContact)}</td>
                    <td className="r" style={{ color: r.atRisk ? "#dc2626" : undefined }}>{num(r.atRisk)}</td>
                    <td className="r">{num(r.reenrolled)}</td>
                    <td className="r">{r.nps && r.nps.avg !== undefined && r.nps.avg !== null ? String(Math.round(r.nps.avg * 10) / 10).replace(".", ",") : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>
    </div>
  );
};

// Estatísticas → Visão geral, Consultores and Treinamento (the tab comes in ?aba=, so the tabs of the hub bar open them); the other
// tabs of the area (Captação, Matrículas, Atendimento, Tutoria, Equipe agora) are their own screens under the same bar
export default function Statistics() {
  const c = useKit();
  const history = useHistory();
  const { search } = useLocation();
  const { user } = useContext(AuthContext);
  const manager = isManager(user);
  const tutor = !!user && ["tutor", "academico"].includes(user.role);
  const wanted = new URLSearchParams(search).get("aba") || "comercial";
  const tab = manager && ["consultores", "treinamento"].includes(wanted) ? wanted : "comercial";
  const [period, setPeriod] = useState({ range: "month" });
  const params = periodParams(period);
  if (tutor) return <Redirect to="/estatisticas/tutoria" />;
  const titles = { comercial: manager ? "Visão geral" : "Meus números", consultores: "Consultores", treinamento: "Treinamento" };
  const leads = {
    comercial: manager ? "Onde os leads param, objeções, matrículas por cidade e as etapas puladas do processo." : "Os seus números no período, com os mesmos critérios da gestão.",
    consultores: "Cada consultor no período: conversas, pessoas, matrículas, grades, o processo e o que cada um vende.",
    treinamento: "O que a revisão diária da IA encontrou repetindo nas conversas de cada consultor.",
  };
  return (
    <div className={c.page}>
      <StatsHubBar />
      <div className={c.head}>
        <div style={{ minWidth: 0 }}>
          <h1 className={c.h1}>{titles[tab]}</h1>
          <div className={c.lead}>{leads[tab]}</div>
        </div>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>
      {tab === "comercial" && <Commercial params={params} />}
      {tab === "consultores" && <Consultants params={params} />}
      {tab === "treinamento" && <Training params={params} />}
      {!manager && (
        <div className={c.sub} style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span>Mais detalhes:</span>
          <button type="button" className={c.btn} onClick={() => history.push("/reports")}>Meu atendimento</button>
        </div>
      )}
    </div>
  );
}
