import React, { useContext, useEffect, useMemo, useState } from "react";
import { Redirect, useHistory, useLocation } from "react-router-dom";
import { AlertTriangle, ChevronRight, Clock, Download, FileText, Inbox, ListTodo, TrendingUp, Users, Workflow } from "lucide-react";

import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import StatsHubBar from "../../components/StatsHub";
import { useKit, useAnalytics, useDefinitions, PeriodPicker, periodParams, num, fmt, minutesText } from "../../components/analytics/kit";
import Drawer from "@material-ui/core/Drawer";
import { GlowStat, GlowPanel, GlowRank, SectionTitle, DonutChart, rankRows, CountStat, BoardHead, MetricAreaCard, Person, EmptyNote, rangeText, rangeDates } from "../../components/peak";
import PoloProgress from "../../components/analytics/PoloProgress";
import { ConversationsOverview } from "../Reports";
import { Team, Alerts, OpenbotInsights, Detail, ConfigPanel, PoloBoard, supervisorPeriod } from "../CommercialCenter";
import { Leads, mins } from "../CommercialCenter/ProcessTab";
import Sends from "./Sends";

// Estatísticas: one panel with the real numbers of the system, in tabs. The management sees the whole team; a consultant sees only their
// own numbers (the server decides, whatever is asked); a tutor sees the tutoring. Every block handles loading, empty and error.

const pct = (v) => (v === null || v === undefined ? "-" : `${String(Math.round(v * 10) / 10).replace(".", ",")}%`);
const Failed = ({ onRetry }) => <GlowPanel error onRetry={onRetry} />;
const PERIOD_LABEL = { today: "Hoje", week: "Últimos 7 dias", month: "Este mês", custom: "Período" };

// the production of the whole team, day by day: the days of every consultant added up
const teamSeries = (consultants) => {
  const days = new Map();
  (consultants || []).forEach((p) => (p.series || []).forEach((d) => {
    const t = days.get(d.day) || { day: d.day, attendances: 0, messagesSent: 0, peopleContacted: 0, enrollments: 0 };
    ["attendances", "messagesSent", "peopleContacted", "enrollments"].forEach((k) => { t[k] += Number(d[k]) || 0; });
    days.set(d.day, t);
  }));
  return [...days.values()].sort((x, y) => (x.day < y.day ? -1 : 1));
};
// Resultado do período: the four numbers the management looks for first, one at a time over the days, and what explains them
const RESULT_KEYS = [
  { key: "enrollments", title: "Matrículas", unit: "matrículas", unitOne: "matrícula" },
  { key: "attendances", title: "Conversas atendidas", unit: "conversas", unitOne: "conversa" },
  { key: "peopleContacted", title: "Pessoas contatadas", unit: "pessoas", unitOne: "pessoa" },
  { key: "messagesSent", title: "Mensagens enviadas", unit: "mensagens", unitOne: "mensagem" },
];
// how many of something it took for one enrollment, said the way each number is read
const share = (a, b) => (b > 0 ? `${(Math.round((a / b) * 1000) / 10).toLocaleString("pt-BR")}%` : null);
const Results = ({ params, period }) => {
  const { data, loading, error, reload } = useAnalytics("/analytics/team", params);
  const series = useMemo(() => teamSeries(data && data.consultants), [data]);
  if (error && !data) return <Failed onRetry={reload} />;
  const wait = loading && !data;
  const t = (data && data.totals) || {};
  const badge = rangeText(period);
  const won = Number(t.enrollments) || 0;
  // the conversion of each number into enrollments, in the period on screen
  const rates = {
    enrollments: t.conversion === null || t.conversion === undefined ? null : `${fmt(t.conversion, "percent")} dos leads trabalhados`,
    attendances: share(won, Number(t.attendances)) ? `${share(won, Number(t.attendances))} viraram matrícula` : null,
    peopleContacted: share(won, Number(t.peopleContacted)) ? `${share(won, Number(t.peopleContacted))} viraram matrícula` : null,
    messagesSent: won > 0 ? `${num(Math.round((Number(t.messagesSent) || 0) / won))} mensagens por matrícula` : null,
  };
  const first = t.firstContactMinutes;
  return (
    <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
      <MetricAreaCard title="Resultado do período" badge={`${badge} · escolha o que ver no gráfico`} loading={wait} error={!!error && !data} onRetry={reload}
        metrics={RESULT_KEYS.map((k) => ({ ...k, total: Number(t[k.key]) || 0, note: rates[k.key], days: series.map((d) => ({ day: d.day, value: d[k.key] })) }))} />
      <div className="pk-grid">
        <GlowStat id="conversion" label="Conversão" icon={TrendingUp} tone="violet" loading={wait} value={fmt(t.conversion, "percent")} hint="Matrículas divididas pelos leads trabalhados" />
        <GlowStat id="firstContact" label="Primeiro contato" icon={Clock} tone={first > 15 ? "warn" : "good"} loading={wait} value={first === null || first === undefined ? "—" : minutesText(first)} hint="Média em horário comercial. Ideal: até 15 min" />
        <GlowStat id="pendingReply" label="Aguardando resposta" icon={Inbox} tone={t.pendingReply ? "warn" : undefined} loading={wait} value={num(t.pendingReply)} hint="Lead em negociação que escreveu por último, nos últimos 7 dias" />
        <GlowStat id="tasksOverdue" label="Tarefas atrasadas" icon={ListTodo} tone={t.tasksOverdue ? "bad" : "good"} loading={wait} value={num(t.tasksOverdue)} hint={`${num(t.tasksOpen)} abertas no total`} />
        <GlowStat id="proposals" label="Propostas enviadas" icon={FileText} loading={wait} value={num(t.proposalsSent)} hint={`${num(t.proposalsViewed)} abertas pelo candidato`} />
        <GlowStat id="leadsWorked" label="Leads trabalhados" icon={Users} loading={wait} value={num(t.leadsWorked)} hint={`${num(t.reactivated)} conversas retomadas`} />
      </div>
    </div>
  );
};

// Behind one skipped step: who skipped it, with which lead and when; each line opens the conversation
const SkippedDetail = ({ step, params, onClose }) => {
  const history = useHistory();
  const query = useMemo(() => ({ ...params, step: step.step }), [params, step.step]);
  const { data, loading, error, reload } = useAnalytics("/analytics/process/skipped", query);
  const rows = (data && data.rows) || [];
  const when = (iso) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <Drawer anchor="right" open onClose={onClose} PaperProps={{ style: { width: "min(720px, 100vw)", background: "var(--surface-2)", padding: 16 } }}>
      <GlowPanel title={`Etapa pulada: ${step.label}`} sub="Conversas em que esta etapa ficou sem fazer e uma etapa seguinte já foi feita. A data é a última atualização do processo da conversa."
        action={<button type="button" className="pk-btn" onClick={onClose}>Fechar</button>}
        loading={loading && !data} error={error && !data} onRetry={reload} empty={!!data && !rows.length} emptyText="Nenhuma conversa com esta etapa pulada no período.">
        <table className="pk-table pk-stack">
          <thead><tr><th>Consultor</th><th>Lead</th><th>Atualizado em</th><th aria-label="Abrir" /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ticketId}>
                <td data-main="1" style={{ fontWeight: 600 }}>{r.consultant}</td>
                <td data-label="Lead">{r.leadName}</td>
                <td data-label="Atualizado em" style={{ whiteSpace: "nowrap" }}>{when(r.at)}</td>
                <td className="r"><button type="button" className="pk-btn" onClick={() => history.push(`/tickets/${r.ticketId}`)} aria-label={`Abrir a conversa de ${r.leadName}`}>Abrir conversa</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length >= 200 ? <div className="pk-hint" style={{ marginTop: 10 }}>Mostrando as 200 mais recentes.</div> : null}
      </GlowPanel>
    </Drawer>
  );
};

// "Por que vendemos e por que perdemos": the codes of the cheap reading of the conversations that ended (enrolled or lost) in the period
const WhySales = ({ params }) => {
  const { data, loading, error, reload } = useAnalytics("/analytics/outcomes", params);
  if (error && !data) return <Failed onRetry={reload} />;
  const d = data || { read: 0, enrolled: 0, lost: 0, reasons: [], worked: [], missed: [], ideas: [] };
  const wait = loading && !data;
  return (
    <div className="pk-grid-wide">
      <GlowPanel id="why-lost" tone={d.lost ? "bad" : undefined} title="Por que perdemos" sub={`Lido nas conversas de ${num(d.lost)} leads perdidos ou que pararam de responder`} loading={wait} empty={!d.reasons.length} emptyText="Nenhuma perda lida no período.">
        <GlowRank rows={d.reasons.slice(0, 8).map((r) => ({ key: r.reason, name: r.reason, value: num(r.n), bar: d.lost ? (r.n / d.lost) * 100 : 0 }))} />
        {d.missed.length > 0 && <div className="pk-hint" style={{ marginTop: 10 }}>O que mais faltou nas perdas: {d.missed.slice(0, 3).map((m) => `${m.label} (${num(m.n)})`).join(", ")}.</div>}
      </GlowPanel>
      <GlowPanel id="why-won" tone={d.enrolled ? "good" : undefined} title="O que vendeu" sub={`Nas ${num(d.enrolled)} matrículas e nas ${num(d.lost)} perdas lidas: em quantas conversas cada coisa aconteceu`} loading={wait} empty={!d.worked.length} emptyText="Nenhuma conversa lida no período.">
        <table className="pk-table pk-stack">
          <thead><tr><th>O que o consultor fez</th><th className="r">Matrículas</th><th className="r">Perdas</th></tr></thead>
          <tbody>
            {d.worked.slice(0, 8).map((w) => (
              <tr key={w.key}><td data-main="1">{w.label}</td><td className="r" data-label="Matrículas">{w.won}%</td><td className="r" data-label="Perdas">{w.lost}%</td></tr>
            ))}
          </tbody>
        </table>
        {d.ideas.length > 0 && (
          <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 13, color: "var(--text-1)", display: "grid", gap: 6 }}>
            {d.ideas.map((t) => <li key={t}>{t}</li>)}
          </ul>
        )}
      </GlowPanel>
    </div>
  );
};

const Commercial = ({ params }) => {
  const [skipped, setSkipped] = useState(null);
  const { data, loading, error, reload } = useAnalytics("/analytics/commercial", params);
  if (error && !data) return <Failed onRetry={reload} />;
  const d = data || { volume: {}, stages: [], objections: { byType: [] }, lostReasons: [], sales: { byCity: [], byCourse: [], byConsultant: [] }, process: { skipped: [] } };
  const wait = loading && !data;
  const stalled = (d.stages || []).reduce((t, s) => t + (s.stalled || 0), 0);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="pk-grid">
        <GlowStat id="newContacts" label="Contatos novos" tone="violet" loading={wait} value={num(d.volume.newContacts)} hint="Pessoas contatadas pela primeira vez no período" />
        <GlowStat id="stalled" label={`Parados há ${d.stalledDays || 7} dias ou mais`} tone={stalled ? "warn" : undefined} loading={wait} value={num(stalled)} hint="Leads abertos sem mudar de etapa" />
      </div>
      <div className="pk-grid-wide">
        <GlowPanel title="Onde os leads param" sub="Abertos em cada etapa, parados e tempo médio na etapa" loading={wait} empty={!d.stages.length}>
          <table className="pk-table pk-stack">
            <thead><tr><th>Etapa</th><th className="r">Abertos</th><th className="r">Parados</th><th className="r">Tempo médio</th></tr></thead>
            <tbody>
              {d.stages.map((s) => (
                <tr key={s.stageId}>
                  <td data-main="1"><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: s.color || "var(--pk-accent)", marginRight: 8 }} />{s.name}</td>
                  <td className="r" data-label="Abertos">{num(s.open)}</td>
                  <td className="r" data-label="Parados" style={{ color: s.stalled ? "var(--pk-warn)" : undefined, fontWeight: s.stalled ? 700 : undefined }}>{num(s.stalled)}</td>
                  <td className="r" data-label="Tempo médio">{s.avgDays === null || s.avgDays === undefined ? "-" : `${String(s.avgDays).replace(".", ",")} d`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlowPanel>
        <GlowPanel title="Objeções mais comuns" sub="Da revisão diária das conversas e do agente de IA" loading={wait} empty={!d.objections.byType.length} emptyText="Nenhuma objeção registrada no período.">
          <DonutChart parts={d.objections.byType.slice(0, 7).map((o) => ({ label: o.type, value: o.n + o.agent, unhandled: o.unhandled }))} centerLabel="objeções" note={(o) => (o.unhandled ? `${o.unhandled} sem resposta` : "")} />
        </GlowPanel>
      </div>
      <div className="pk-grid-wide">
        <GlowPanel title="Matrículas por cidade" sub="Onde estão os alunos que se matricularam no período" loading={wait} empty={!d.sales.byCity.length}>
          <DonutChart parts={d.sales.byCity.slice(0, 7).map((x) => ({ label: x.name, value: x.n }))} centerLabel="matrículas" />
        </GlowPanel>
        <GlowPanel title="Etapas do processo" sub={`Cada etapa obrigatória, na ordem do processo: quantas das ${num(d.process.samples || 0)} conversas do período pularam (fizeram a seguinte sem fazer esta). Clique para ver quem pulou.`}
          loading={wait} empty={!(d.process.steps || []).length && !d.process.skipped.length} emptyText="Nenhuma conversa com o processo no período.">
          <div className="mx-list" style={{ gap: 6 }}>
            {(d.process.steps && d.process.steps.length ? d.process.steps : d.process.skipped.map((x) => ({ step: x.step, label: x.label, skipped: x.n, share: d.process.samples ? (x.n * 100) / d.process.samples : 0, done: null, previousShare: null, top: null }))).map((x, idx) => {
              const share = Math.round(x.share || 0);
              const tone = share >= 25 ? "#dc2626" : share >= 10 ? "#d97706" : share > 0 ? "#64748b" : "#16a34a";
              const trend = x.previousShare === null || x.previousShare === undefined ? null : Math.round((x.share || 0) - x.previousShare);
              const body = (
                <>
                  <span style={{ width: 22, height: 22, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 11.5, fontWeight: 700, flex: "none", background: "var(--surface-2, rgba(100,116,139,.12))", color: "var(--text-2)" }}>{idx + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, display: "grid", gap: 4 }}>
                    <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                      <b style={{ fontSize: 13.5, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.label}</b>
                      <span style={{ fontSize: 13, fontWeight: 700, color: tone, flex: "none" }}>{x.skipped ? `${share}% pularam` : "Ninguém pulou"}</span>
                    </span>
                    <span style={{ position: "relative", height: 6, borderRadius: 999, background: "var(--track, rgba(100,116,139,.15))", overflow: "hidden" }}>
                      <span style={{ position: "absolute", inset: 0, width: `${Math.min(100, share)}%`, background: tone, borderRadius: 999 }} />
                    </span>
                    <span style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "var(--text-2)" }}>
                      {x.skipped > 0 && <span>{num(x.skipped)} de {num(d.process.samples || 0)} conversas</span>}
                      {x.done !== null && x.done !== undefined && <span>{num(x.done)} fizeram</span>}
                      {x.top && <span>Mais pulou: <b style={{ color: "var(--text-1)" }}>{x.top.name}</b> ({num(x.top.n)})</span>}
                      {trend !== null && trend !== 0 && <span style={{ color: trend > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>{trend > 0 ? `+${trend}` : trend} p.p. que o período anterior</span>}
                    </span>
                  </span>
                  {x.skipped > 0 && <ChevronRight size={15} aria-hidden="true" style={{ opacity: 0.6, flex: "none" }} />}
                </>
              );
              return x.skipped > 0 ? (
                <button key={x.step} type="button" className="mx-item" onClick={() => setSkipped({ step: x.step, label: x.label, n: x.skipped })} aria-label={`${x.label}: ${share}% pularam. Ver quem pulou`}
                  style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }}>{body}</button>
              ) : (
                <div key={x.step} className="mx-item" style={{ display: "flex", gap: 10, alignItems: "center", opacity: 0.8 }}>{body}</div>
              );
            })}
          </div>
        </GlowPanel>
      </div>
      <WhySales params={params} />
      {skipped && <SkippedDetail step={skipped} params={params} onClose={() => setSkipped(null)} />}
      <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>Origem dos leads, cursos mais procurados e motivos de perda estão na aba Captação.</div>
    </div>
  );
};

const Consultants = ({ params }) => {
  const defs = useDefinitions();
  const { data, loading, error, reload } = useAnalytics("/analytics/commercial", params);
  const proc = useAnalytics("/analytics/process", params);
  const [detail, setDetail] = useState(null);
  const [stops, setStops] = useState(null);
  if (error && !data) return <Failed onRetry={reload} />;
  const rows = (data && data.consultants) || [];
  const top = (data && data.sales && data.sales.top) || [];
  const process = new Map(((proc.data && proc.data.consultants) || []).map((r) => [r.userId, r]));
  const wait = loading && !data;
  const sumOf = (key) => rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);
  const byEnrollments = [...rows].sort((x, y) => (y.enrollments || 0) - (x.enrollments || 0) || (y.conversations || 0) - (x.conversations || 0));
  // the fastest to answer first; who has no answer measured in the period stays out
  const byReply = rows.map((r) => ({ ...r, reply: (process.get(r.userId) || {}).replyMedianMin, sla: (process.get(r.userId) || {}).replyWithinSlaPct }))
    .filter((r) => r.reply !== null && r.reply !== undefined).sort((x, y) => x.reply - y.reply);
  const slowest = Math.max(1, ...byReply.map((r) => r.reply));
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
      <div className="pk-grid-4">
        <CountStat id="team-enrollments" label="Matrículas da equipe" loading={wait} value={sumOf("enrollments")} hint={`${num(rows.filter((r) => r.enrollments > 0).length)} de ${num(rows.length)} consultores matricularam`} />
        <CountStat id="team-conversations" label="Conversas atendidas" loading={wait} value={sumOf("conversations")} hint={share(sumOf("enrollments"), sumOf("conversations")) ? `${share(sumOf("enrollments"), sumOf("conversations"))} viraram matrícula` : "No período"} />
        <CountStat id="team-people" label="Pessoas contatadas" loading={wait} value={sumOf("peopleContacted")} hint={share(sumOf("enrollments"), sumOf("peopleContacted")) ? `${share(sumOf("enrollments"), sumOf("peopleContacted"))} viraram matrícula` : "No período"} />
        <CountStat id="team-stalled" label="Leads parados" tone={sumOf("stalled") ? "warn" : "good"} loading={wait} value={sumOf("stalled")} hint={`${num(sumOf("lost"))} perdidos no período`} />
      </div>
      <div className="pk-grid-wide">
        <GlowPanel id="rank-enrollments" tone="good" title="Ranking de matrículas" sub="Quem mais matriculou no período. Clique no nome para ver os detalhes." loading={wait} empty={!rows.length} emptyText="Nenhum consultor com atividade no período.">
          <GlowRank rows={rankRows(byEnrollments, "name", "enrollments", { limit: 10, onClick: (r) => setDetail(r.userId) })} />
        </GlowPanel>
        <GlowPanel id="rank-reply" title="Tempo de resposta" sub="Mediana para responder o cliente, do mais rápido ao mais lento" loading={proc.loading && !proc.data} empty={!byReply.length} emptyText="Nenhuma resposta medida no período.">
          <GlowRank rows={byReply.slice(0, 10).map((r) => ({ key: String(r.userId), name: r.name, value: mins(r.reply), bar: (r.reply / slowest) * 100, note: r.sla === null || r.sla === undefined ? undefined : `${pct(r.sla)} dentro do prazo`, onClick: () => setDetail(r.userId) }))} />
        </GlowPanel>
      </div>
      <GlowPanel id="consultants" title="Cada consultor no período" sub="Clique na linha para ver a evolução, as metas e as tarefas. Em Conversas, onde cada uma parou no processo." loading={wait} empty={!rows.length} emptyText="Nenhum consultor com atividade no período."
        action={<button type="button" className="pk-btn" onClick={exportCsv} disabled={!rows.length}><Download size={14} style={{ verticalAlign: -2 }} /> Exportar</button>}>
        <div className="pk-scroll">
          <table className="pk-table pk-stack">
            <thead><tr><th>Consultor</th><th className="r">Conversas</th><th className="r">Pessoas</th><th className="r">Matrículas</th><th className="r">Resposta</th><th className="r">Processo seguido</th><th>Parou mais em</th><th className="r">Grades</th><th className="r">Grade faltando</th><th className="r">Com áudio</th><th className="r">Parados</th><th className="r">Perdidos</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const pr = process.get(r.userId);
                const stop = pr && pr.stoppedAt && pr.stoppedAt[0];
                return (
                  <tr key={r.userId} data-click="1" onClick={() => setDetail(r.userId)}>
                    <td data-main="1" style={{ whiteSpace: "nowrap", fontWeight: 600 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><Person name={r.name} size={28} />{r.name}</span></td>
                    <td className="r" data-label="Conversas">
                      <button type="button" className="pk-btn" style={{ padding: "2px 8px" }} onClick={(e) => { e.stopPropagation(); setStops(r); }} aria-label={`Onde as conversas de ${r.name} pararam`}>{num(r.conversations)}</button>
                    </td>
                    <td className="r" data-label="Pessoas">{num(r.peopleContacted)}</td>
                    <td className="r" data-label="Matrículas" style={{ fontWeight: 700 }}>{num(r.enrollments)}</td>
                    <td className="r" data-label="Resposta">{pr ? mins(pr.replyMedianMin) : "-"}</td>
                    <td className="r" data-label="Processo seguido">{pct(r.processAvg)}</td>
                    <td data-label="Parou mais em">{stop ? `${stop.step} (${stop.n})` : "-"}</td>
                    <td className="r" data-label="Grades">{num(r.gradesSent)}</td>
                    <td className="r" data-label="Grade faltando" style={{ color: r.gradeMissing ? "var(--pk-warn)" : undefined }}>{num(r.gradeMissing)}</td>
                    <td className="r" data-label="Com áudio">{pct(r.audioShare)}</td>
                    <td className="r" data-label="Parados">{num(r.stalled)}</td>
                    <td className="r" data-label="Perdidos">{num(r.lost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlowPanel>
      {top.length > 0 && (
        <GlowPanel tone="violet" title="Quem vende o quê" sub="Os 5 maiores pares de consultor e curso no período">
          <GlowRank rows={rankRows(top.map((t) => ({ ...t, label: `${t.name}: ${t.course}` })), "label", "n")} />
        </GlowPanel>
      )}
      {detail && <Detail userId={detail} period={params} defs={defs} onClose={() => setDetail(null)} />}
      {stops && <Leads consultant={stops} params={params} onClose={() => setStops(null)} />}
    </div>
  );
};

// what the screen of the conversations understands as the period: a number of days ending on a day (today when empty)
const conversationRange = (period) => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });
  if (period.range === "today") return { days: 1, date: "" };
  // the week, the month, the cycle or the dates chosen: the days of the range, ending on its last day (at most 31)
  const d = rangeDates(period);
  const days = Math.floor((Date.parse(`${d.to}T00:00:00Z`) - Date.parse(`${d.from}T00:00:00Z`)) / 86400000) + 1;
  return { days: Math.min(31, Math.max(1, days)), date: d.to >= today ? "" : d.to };
};

const Section = ({ title, sub, children }) => (
  <section style={{ minWidth: 0 }}>
    <SectionTitle title={title} hint={sub} />
    {children}
  </section>
);

// Agora: who is working, whose WhatsApp is down, what needs attention and the tasks nobody owns (live, whatever the period)
const Now = ({ params }) => {
  const c = useKit();
  const history = useHistory();
  const defs = useDefinitions();
  const live = useMemo(() => ({ range: "today", ...(params.institutionId ? { institutionId: params.institutionId } : {}) }), [params.institutionId]);
  const { data, error, reload } = useAnalytics("/analytics/team", live);
  const [selected, setSelected] = useState(null);
  // "Dispensar" a recommendation of the OpenBot: hidden at once, then asked of the server (it stays dismissed on the next reading)
  const [dismissed, setDismissed] = useState([]);
  const dismissInsight = async (id) => {
    setDismissed((list) => [...list, id]);
    try {
      await api.put(`/openbot-insights/${id}/resolve`);
    } catch (err) {
      setDismissed((list) => list.filter((x) => x !== id));
      toastError(err);
    }
  };
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
        <Team
          members={data.team || (data.consultants || []).map((b) => ({ user: { ...b.user, role: "consultor", area: "comercial" }, presence: b.presence, ownNumber: false }))}
          canOpen={new Set((data.consultants || []).map((b) => b.user.id))}
          onOpen={setSelected}
        />
        <Alerts alerts={data.alerts} onOpen={setSelected} history={history} />
      </div>
      <OpenbotInsights
        items={(data.openbotInsights || []).filter((i) => !dismissed.includes(i.id))}
        onOpen={(link) => history.push(link)}
        onDismiss={dismissInsight}
      />
      {selected && <Detail userId={selected} period={live} defs={defs} onClose={() => setSelected(null)} />}
    </div>
  );
};

// Visão geral: the one screen of the management. What is happening now, the goals of the polos, the period and the commercial picture.
const Overview = ({ params, period }) => {
  const range = conversationRange(period);
  return (
    <div style={{ display: "grid", gap: 28 }}>
      <Section title="Resultado do período" sub="As quatro frentes lado a lado, com a conversão de cada uma em matrícula. Toque em um número para ver só ele."><Results params={params} period={period} /></Section>
      <Section title="Agora" sub="Quem está trabalhando e o que precisa da sua atenção"><Now params={params} /></Section>
      <PoloProgress title="Progresso dos polos" />
      <Section title="Atendimento" sub="Atendimentos, mensagens, tempos e a fila"><ConversationsOverview days={range.days} date={range.date} /></Section>
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
    <GlowPanel id="training" title="Treinamento sugerido"
      sub={data ? `A IA lê as conversas do dia uma vez por dia, sem CPF, telefone e nomes. Só aparece o que se repete em pelo menos ${data.minReviews} conversas.${data.enabled ? "" : " A leitura diária está desligada."}` : undefined}
      loading={loading && !data}
      action={list.some((x) => x.items.length) ? <button type="button" className={c.btnPrimary} disabled={busy} onClick={suggest} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Workflow size={14} />{busy ? "Escrevendo…" : "Sugerir treinamento"}</button> : null}>
      {!list.length && !(loading && !data) && <EmptyNote>Ainda não há conversas lidas no período para sugerir treinamento.</EmptyNote>}
      <div className="gv-people">
        {list.map((x) => (
          <article key={x.userId} className="gv-person-card">
            <header>
              <Person name={x.name} />
              <b>{x.name}<small>{num(x.reviewed)} {x.reviewed === 1 ? "conversa lida" : "conversas lidas"}</small></b>
            </header>
            {x.items.length ? (
              <ul>{x.items.map((it) => <li key={`${it.kind}-${it.key}`}>{it.text}</li>)}</ul>
            ) : <div className={c.sub} style={{ marginTop: 0 }}>Nada se repetiu no período.</div>}
            {x.strengths && x.strengths.length > 0 && <div className={c.sub} style={{ marginTop: 0 }}>Pontos fortes: {x.strengths.join(", ")}</div>}
            {tips[x.userId] && <div className="gv-tip"><b>Sugestão:</b> {tips[x.userId]}</div>}
          </article>
        ))}
      </div>
    </GlowPanel>
  );
};

export const Tutoring = ({ params }) => {
  const { data, loading, error, reload } = useAnalytics("/analytics/tutoria", params);
  if (error && !data) return <Failed onRetry={reload} />;
  const d = data || { totals: {}, onboardingStalled: [], tutors: [] };
  const t = d.totals || {};
  const wait = loading && !data;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="pk-grid">
        <GlowStat id="students" label="Alunos acompanhados" loading={wait} value={num(t.students)} hint={`${num(t.onboardingOpen)} em ambientação`} />
        <GlowStat id="noContact" label={`Sem contato há ${d.noContactDays || 7} dias`} tone={t.noContact ? "warn" : undefined} loading={wait} value={num(t.noContact)} hint="Nenhuma mensagem do tutor" />
        <GlowStat id="atRisk" label="Risco de evasão" tone={t.atRisk ? "bad" : undefined} loading={wait} value={num(t.atRisk)} hint={`${num(t.atRiskWithFee)} com taxa em aberto`} />
        <GlowStat id="reenrolled" label="Rematrículas" tone="good" loading={wait} value={num(t.reenrolled)} hint="No período" />
      </div>
      <div className="pk-grid-wide">
        <GlowPanel tone="warn" title="Onde a ambientação para" sub="Alunos com a etapa ainda aberta" loading={wait} empty={!d.onboardingStalled.some((s) => s.n)} emptyText="Nenhuma etapa da ambientação parada.">
          <GlowRank rows={rankRows(d.onboardingStalled.filter((s) => s.n), "label", "n")} />
        </GlowPanel>
        <GlowPanel title="Cada tutor" loading={wait} empty={!d.tutors.length} emptyText="Nenhum tutor com alunos.">
          <table className="pk-table pk-stack">
            <thead><tr><th>Tutor</th><th className="r">Alunos</th><th className="r">Sem contato</th><th className="r">Em risco</th><th className="r">Rematrículas</th><th className="r">NPS</th></tr></thead>
            <tbody>
              {d.tutors.map((r) => (
                <tr key={r.tutorId}>
                  <td data-main="1" style={{ fontWeight: 600 }}>{r.name}</td>
                  <td className="r" data-label="Alunos">{num(r.students)}</td>
                  <td className="r" data-label="Sem contato" style={{ color: r.noContact ? "var(--pk-warn)" : undefined }}>{num(r.noContact)}</td>
                  <td className="r" data-label="Em risco" style={{ color: r.atRisk ? "var(--pk-bad)" : undefined }}>{num(r.atRisk)}</td>
                  <td className="r" data-label="Rematrículas">{num(r.reenrolled)}</td>
                  <td className="r" data-label="NPS">{r.nps && r.nps.avg !== undefined && r.nps.avg !== null ? String(Math.round(r.nps.avg * 10) / 10).replace(".", ",") : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlowPanel>
      </div>
    </div>
  );
};

// Estatísticas: one page with the tabs of the management (the tab comes in ?aba=, so the hub bar and a link open the right one). A tab
// already opened stays mounted when the person moves to another one, so going back is instant and nothing blinks.
const TABS = ["geral", "consultores", "polos", "treinamento", "disparos"];
const TITLES = { geral: "Estatísticas", consultores: "Estatísticas: consultores", polos: "Estatísticas: polos e metas", treinamento: "Estatísticas: treinamento", disparos: "Estatísticas: disparos" };
const LEADS = {
  geral: "O resultado do período, o que acontece agora, as metas dos polos, o atendimento e o comercial.",
  consultores: "Cada consultor no período: conversas, matrículas, resposta, o processo e o que cada um vende.",
  polos: "As metas do semestre, os números de cada polo e os horários e metas diárias da equipe.",
  treinamento: "O que a revisão diária da IA encontrou repetindo nas conversas de cada consultor.",
  disparos: "Os pedidos de liberação de disparos e o que cada pessoa enviou e gastou com a Meta e a IA no período.",
};

export default function Statistics() {
  const c = useKit();
  const { search } = useLocation();
  const { user } = useContext(AuthContext);
  const manager = isManager(user);
  const tutor = !!user && ["tutor", "academico"].includes(user.role);
  const wanted = new URLSearchParams(search).get("aba") || "geral";
  const tab = TABS.includes(wanted) ? wanted : "geral";
  // the period can come in the address (the "Ver por consultor" of the Painel do CRM)
  const [period, setPeriod] = useState(() => {
    const q = new URLSearchParams(search);
    const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : "");
    return day(q.get("from")) ? { range: "custom", from: day(q.get("from")), to: day(q.get("to")) || day(q.get("from")) } : { range: "month" };
  });
  const params = useMemo(() => periodParams(period), [period]);
  const [visited, setVisited] = useState(() => new Set([tab]));
  useEffect(() => { setVisited((v) => (v.has(tab) ? v : new Set([...v, tab]))); }, [tab]);
  if (tutor) return <Redirect to="/estatisticas/tutoria" />;
  // a consultant has their own place (Meu desempenho); the statistics of the team are the management's
  if (!manager) return <Redirect to="/meu-desempenho" />;
  const view = { geral: <Overview params={params} period={period} />, consultores: <Consultants params={params} />, polos: <PolosAndGoals params={params} period={period} />, treinamento: <Training params={params} />, disparos: <Sends params={params} /> };
  return (
    <div className={`${c.page} dash-scope gv-plain`}>
      <StatsHubBar />
      <div style={{ marginBottom: 20 }}>
        <BoardHead title={TITLES[tab]} sub={LEADS[tab]}><PeriodPicker value={period} onChange={setPeriod} /></BoardHead>
      </div>
      {TABS.filter((k) => visited.has(k)).map((k) => (
        <div key={k} hidden={k !== tab}>{view[k]}</div>
      ))}
    </div>
  );
}
