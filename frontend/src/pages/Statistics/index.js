import React, { useContext, useEffect, useMemo, useState } from "react";
import { Redirect, useHistory, useLocation } from "react-router-dom";
import { AlertTriangle, Download, Sparkles } from "lucide-react";

import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import StatsHubBar from "../../components/StatsHub";
import { ChartCard, RankBars } from "../../components/charts";
import { useKit, useAnalytics, useDefinitions, PeriodPicker, periodParams, num } from "../../components/analytics/kit";
import PoloProgress from "../../components/analytics/PoloProgress";
import { ConversationsOverview } from "../Reports";
import { Team, Alerts, Detail, ConfigPanel, PoloBoard, supervisorPeriod } from "../CommercialCenter";
import { Leads, mins } from "../CommercialCenter/ProcessTab";

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
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <Stat label="Pessoas contatadas" value={wait ? "…" : num(d.volume.peopleContacted)} hint={`${num(d.volume.newContacts)} pela primeira vez`} tone="#7c3aed" />
        <Stat label="Matrículas dos consultores" value={wait ? "…" : num(enrollments)} hint="Primeiras matrículas e cursos extras" tone="#16a34a" />
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
  const defs = useDefinitions();
  const { data, loading, error, reload } = useAnalytics("/analytics/commercial", params);
  const proc = useAnalytics("/analytics/process", params);
  const [detail, setDetail] = useState(null);
  const [stops, setStops] = useState(null);
  if (error && !data) return <Failed onRetry={reload} />;
  const rows = (data && data.consultants) || [];
  const top = (data && data.sales && data.sales.top) || [];
  const process = new Map(((proc.data && proc.data.consultants) || []).map((r) => [r.userId, r]));
  const exportCsv = async () => {
    try {
      const { data: csv } = await api.get("/analytics/team/export.csv", { params, responseType: "blob" });
      const url = URL.createObjectURL(csv);
      const a = document.createElement("a");
      a.href = url; a.download = `consultores-${params.range}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toastError(err); }
  };
  return (
    <div style={{ display: "grid", gap: 16 }}>
    <ChartCard title="Cada consultor no período" sub="Clique no nome para ver a evolução, as metas e as tarefas. Em Conversas, onde cada uma parou no processo." loading={loading && !data} empty={!rows.length} emptyText="Nenhum consultor com atividade no período."
      action={<button type="button" className={c.btn} onClick={exportCsv} disabled={!rows.length}><Download size={14} style={{ verticalAlign: -2 }} /> Exportar</button>}>
      <div className={c.scroll}>
        <table className={c.table}>
          <thead><tr><th>Consultor</th><th className="r">Conversas</th><th className="r">Pessoas</th><th className="r">Matrículas</th><th className="r">Resposta</th><th className="r">Processo seguido</th><th>Parou mais em</th><th className="r">Grades</th><th className="r">Grade faltando</th><th className="r">Com áudio</th><th className="r">Parados</th><th className="r">Perdidos</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const pr = process.get(r.userId);
              const stop = pr && pr.stoppedAt && pr.stoppedAt[0];
              return (
                <tr key={r.userId} onClick={() => setDetail(r.userId)}>
                  <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{r.name}</td>
                  <td className="r">
                    <button type="button" className={c.btn} style={{ padding: "2px 8px" }} onClick={(e) => { e.stopPropagation(); setStops(r); }} aria-label={`Onde as conversas de ${r.name} pararam`}>{num(r.conversations)}</button>
                  </td>
                  <td className="r">{num(r.peopleContacted)}</td>
                  <td className="r" style={{ fontWeight: 700 }}>{num(r.enrollments)}</td>
                  <td className="r">{pr ? mins(pr.replyMedianMin) : "-"}</td>
                  <td className="r">{pct(r.processAvg)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{stop ? `${stop.step} (${stop.n})` : "-"}</td>
                  <td className="r">{num(r.gradesSent)}</td>
                  <td className="r" style={{ color: r.gradeMissing ? "#b45309" : undefined }}>{num(r.gradeMissing)}</td>
                  <td className="r">{pct(r.audioShare)}</td>
                  <td className="r">{num(r.stalled)}</td>
                  <td className="r">{num(r.lost)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ChartCard>
    {top.length > 0 && (
      <ChartCard title="Quem vende o quê" sub="Os 5 maiores pares de consultor e curso no período">
        <RankBars rows={rank(top.map((t) => ({ ...t, label: `${t.name}: ${t.course}` })), "label", "n", "brand")} />
      </ChartCard>
    )}
    {detail && <Detail userId={detail} period={params} defs={defs} onClose={() => setDetail(null)} />}
    {stops && <Leads consultant={stops} params={params} onClose={() => setStops(null)} />}
    </div>
  );
};

// what the screen of the conversations understands as the period: a number of days ending on a day (today when empty)
const conversationRange = (period) => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });
  if (period.range === "week") return { days: 7, date: "" };
  if (period.range === "month") return { days: Math.max(1, Number(today.slice(-2))), date: "" };
  if (period.range === "custom" && period.from && period.to) {
    const days = Math.floor((Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / 86400000) + 1;
    return { days: Math.min(31, Math.max(1, days)), date: period.to >= today ? "" : period.to };
  }
  return { days: 1, date: "" };
};

const Section = ({ title, sub, children }) => {
  const c = useKit();
  return (
    <section style={{ display: "grid", gap: 12, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>{title}</h2>
        {sub && <span className={c.sub} style={{ marginTop: 0 }}>{sub}</span>}
      </div>
      {children}
    </section>
  );
};

// Agora: who is working, whose WhatsApp is down, what needs attention and the tasks nobody owns (live, whatever the period)
const Now = ({ params }) => {
  const c = useKit();
  const history = useHistory();
  const defs = useDefinitions();
  const live = useMemo(() => ({ range: "today", ...(params.institutionId ? { institutionId: params.institutionId } : {}) }), [params.institutionId]);
  const { data, error, reload } = useAnalytics("/analytics/team", live);
  const [selected, setSelected] = useState(null);
  if (error && !data) return <Failed onRetry={reload} />;
  if (!data) return <div className={c.cols}><div className={c.panel} style={{ minHeight: 160, opacity: 0.6 }} /><div className={c.panel} style={{ minHeight: 160, opacity: 0.6 }} /></div>;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {data.unassigned && data.unassigned.open > 0 && (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 16px", borderRadius: 14, background: "rgba(217,119,6,.12)", border: "1px solid rgba(217,119,6,.35)" }}>
          <AlertTriangle size={18} style={{ color: "#d97706", flex: "none" }} />
          <span style={{ flex: 1, minWidth: 200, fontSize: 14 }}>
            <b>{data.unassigned.open} {data.unassigned.open === 1 ? "tarefa sem responsável" : "tarefas sem responsável"}</b>
            {data.unassigned.overdue > 0 ? ` (${data.unassigned.overdue} atrasada${data.unassigned.overdue === 1 ? "" : "s"})` : ""}
          </span>
          <button type="button" className={c.btnPrimary} onClick={() => history.push("/crm/tarefas?scope=all&status=open&userId=0")}>Distribuir</button>
        </div>
      )}
      <div className={c.cols}>
        <Team consultants={data.consultants} onOpen={setSelected} />
        <Alerts alerts={data.alerts} onOpen={setSelected} history={history} />
      </div>
      {selected && <Detail userId={selected} period={live} defs={defs} onClose={() => setSelected(null)} />}
    </div>
  );
};

// Visão geral: the one screen of the management. What is happening now, the goals of the polos, the period and the commercial picture.
const Overview = ({ params, period }) => {
  const range = conversationRange(period);
  return (
    <div style={{ display: "grid", gap: 28 }}>
      <Section title="Agora" sub="Quem está trabalhando e o que precisa da sua atenção"><Now params={params} /></Section>
      <PoloProgress title="Progresso dos polos" />
      <Section title="Período" sub="Atendimentos, mensagens, tempos e a fila"><ConversationsOverview days={range.days} date={range.date} /></Section>
      <Section title="Comercial" sub="Onde os leads param, objeções, cidades e o processo"><Commercial params={params} /></Section>
    </div>
  );
};

// Polos e metas: the numbers of each polo with its team, and the working hours and daily targets of the team
const PolosAndGoals = ({ params, period }) => {
  const c = useKit();
  const history = useHistory();
  const { data, error, reload } = useAnalytics("/analytics/team", params);
  const [polos, setPolos] = useState([]);
  const [config, setConfig] = useState(null);
  useEffect(() => { api.get("/polos").then(({ data: list }) => setPolos(Array.isArray(list) ? list.filter((p) => p.active !== false) : [])).catch(() => undefined); }, []);
  useEffect(() => { if (data) setConfig(data.config); }, [data]);
  if (error && !data) return <Failed onRetry={reload} />;
  if (!data) return <div className={c.panel} style={{ minHeight: 200, opacity: 0.6 }} />;
  return (
    <div style={{ display: "grid", gap: 28 }}>
      <PoloProgress title="Metas dos polos no semestre" />
      <Section title="Cada polo no período" sub="Os números somados por polo e quem está em cada equipe">
        <PoloBoard data={data} polos={polos} history={history} feedbackPeriod={supervisorPeriod(period)} />
      </Section>
      {config && (
        <Section title="Horários e metas diárias" sub="Valem para a equipe agora e para a tela de cada consultor">
          <ConfigPanel config={config} consultants={data.consultants} onSaved={setConfig} />
        </Section>
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

// Estatísticas: one page with the tabs of the management (the tab comes in ?aba=, so the hub bar and a link open the right one). A tab
// already opened stays mounted when the person moves to another one, so going back is instant and nothing blinks.
const TABS = ["geral", "consultores", "polos", "treinamento"];
const TITLES = { geral: "Visão geral", consultores: "Consultores", polos: "Polos e metas", treinamento: "Treinamento" };
const LEADS = {
  geral: "O que acontece agora, as metas dos polos, o período e o comercial.",
  consultores: "Cada consultor no período: conversas, matrículas, resposta, o processo e o que cada um vende.",
  polos: "As metas do semestre, os números de cada polo e os horários e metas diárias da equipe.",
  treinamento: "O que a revisão diária da IA encontrou repetindo nas conversas de cada consultor.",
};

export default function Statistics() {
  const c = useKit();
  const { search } = useLocation();
  const { user } = useContext(AuthContext);
  const manager = isManager(user);
  const tutor = !!user && ["tutor", "academico"].includes(user.role);
  const wanted = new URLSearchParams(search).get("aba") || "geral";
  const tab = TABS.includes(wanted) ? wanted : "geral";
  const [period, setPeriod] = useState({ range: "today" });
  const params = useMemo(() => periodParams(period), [period]);
  const [visited, setVisited] = useState(() => new Set([tab]));
  useEffect(() => { setVisited((v) => (v.has(tab) ? v : new Set([...v, tab]))); }, [tab]);
  if (tutor) return <Redirect to="/estatisticas/tutoria" />;
  // a consultant has their own place (Meu desempenho); the statistics of the team are the management's
  if (!manager) return <Redirect to="/meu-desempenho" />;
  const view = { geral: <Overview params={params} period={period} />, consultores: <Consultants params={params} />, polos: <PolosAndGoals params={params} period={period} />, treinamento: <Training params={params} /> };
  return (
    <div className={`${c.page} dash-scope`}>
      <StatsHubBar />
      <div className={c.head}>
        <div style={{ minWidth: 0 }}>
          <h1 className={c.h1}>{TITLES[tab]}</h1>
          <div className={c.lead}>{LEADS[tab]}</div>
        </div>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>
      {TABS.filter((k) => visited.has(k)).map((k) => (
        <div key={k} hidden={k !== tab}>{view[k]}</div>
      ))}
    </div>
  );
}
