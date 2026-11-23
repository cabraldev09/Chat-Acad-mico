import React, { useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { AlertTriangle, CalendarCheck2, Clock3, Lightbulb, MessageCircle, Phone, RefreshCw } from "lucide-react";

import { BlockTitle, PeriodPicker, fmt, minutesText, num, periodParams, useAnalytics, useKit } from "../../components/analytics/kit";
import { ACCENT, CountStat, GlowFunnel, GlowPanel, GlowRing, GlowStat, PeakChart, PeakRow, SectionTitle, TodoList, dayLabel } from "../../components/peak";
import PoloProgress from "../../components/analytics/PoloProgress";
import "../../styles/dash.css";

// Meu desempenho: the consultant's own place. Only their numbers (the server reads who is logged in, never a choice of the screen):
// the results of the period with the line over the days, the goal, the place among the consultants, what to do now, the leads and
// the orientation from the daily review. The management has Estatísticas with the whole team.

const when = (v) => { try { return format(parseISO(v), "dd/MM HH:mm"); } catch (e) { return ""; } };
const PERIOD_LABEL = { today: "Hoje", week: "Últimos 7 dias", month: "Este mês", custom: "Período" };
// change against the period before, in percent (points for a rate); null when there is nothing to compare
const change = (now, before, points) => {
  if (before === null || before === undefined || now === null || now === undefined) return null;
  if (points) return Math.round((now - before) * 10) / 10;
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
};
const against = (d) => (d === null ? "Sem período anterior para comparar" : d === 0 ? "Igual ao período anterior" : `${d > 0 ? "+" : ""}${d}% contra o período anterior`);

const RESULTS = [
  ["leadsWorked", "Leads trabalhados"],
  ["proposalsSent", "Propostas enviadas"],
  ["gradesSent", "Grades enviadas"],
  ["messagesSent", "Mensagens enviadas"],
];

const Section = ({ title, hint, children, action }) => (
  <section style={{ marginTop: 28, minWidth: 0 }}>
    <SectionTitle title={title} hint={hint} action={action} />
    {children}
  </section>
);

const ordinal = (n) => `${num(n)}º`;

const MyPerformance = () => {
  const c = useKit();
  const history = useHistory();
  const [period, setPeriod] = useState({ range: "month", from: "", to: "" });
  const params = useMemo(() => periodParams(period), [period]);
  const ready = period.range !== "custom" || (period.from && period.to);
  const { data, loading, error, reload } = useAnalytics("/analytics/me/overview", params, !!ready);
  const go = (link) => history.push(link);

  if (!data) {
    return (
      <div className={c.page}>
        <div className={c.head}>
          <h1 className={c.h1}>Meu desempenho</h1>
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
        {!ready ? (
          <div className={c.panel}>Escolha as duas datas do período.</div>
        ) : loading && !error ? (
          <PeakRow label="Carregando os seus resultados">
            {[0, 1, 2].map((i) => <div key={i} className="pk pk-skel" style={{ aspectRatio: "540 / 696", borderRadius: 30, width: "100%", maxWidth: 340, justifySelf: "center" }} aria-hidden="true" />)}
          </PeakRow>
        ) : (
          <div className={c.panel} role="alert" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <AlertTriangle size={16} color="#b45309" /><span style={{ flex: 1, minWidth: 0 }}>Não foi possível carregar o seu desempenho agora.</span>
            <button type="button" className={c.btn} onClick={reload}><RefreshCw size={13} style={{ verticalAlign: -2 }} /> Tentar de novo</button>
          </div>
        )}
      </div>
    );
  }

  const r = data.results || { now: {}, before: null };
  const before = r.before || {};
  const targets = data.targets || {};
  const leads = data.leads || { stages: [], open: 0, waiting: 0, stale: 0 };
  const todo = data.insights || [];
  const coaching = data.coaching;
  const team = data.team || {};
  const series = data.series || [];
  const labels = series.map((d) => dayLabel(d.day));
  const badge = period.cycle ? "Ciclo" : PERIOD_LABEL[period.range] || "Período";
  // what was done today is the last day of the series, when the period reaches today
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });
  const today = series.find((d) => d.day === todayKey);
  const goals = data.goals || [];
  const main = goals[0];
  const peaks = [
    { key: "enrollments", title: "Matrículas", accent: ACCENT.good },
    { key: "attendances", title: "Conversas atendidas", accent: ACCENT.brand },
    { key: "peopleContacted", title: "Pessoas contatadas", accent: ACCENT.violet },
  ];
  const compare = [
    ["Conversão", r.now.conversion, team.conversion, "percent", false],
    ["Tempo do 1º contato", r.now.firstContactMinutes, team.firstContact === null || team.firstContact === undefined ? null : Math.round(team.firstContact), "minutes", true],
  ];

  return (
    <div className={`${c.page} dash-scope`} style={{ opacity: loading ? 0.75 : 1, transition: "opacity .2s ease" }}>
      <div className={c.head}>
        <div style={{ minWidth: 0 }}>
          <h1 className={c.h1}>Meu desempenho</h1>
          <div className={c.lead}>Os seus resultados, a sua meta, o que fazer agora e os seus leads. Só você vê estes números.</div>
        </div>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      {/* 1. the results of the period, each with its line over the days */}
      <PeakRow label="Meus resultados no período">
        {peaks.map((p) => {
          const d = change(r.now[p.key], before[p.key]);
          return <PeakChart key={p.key} title={p.title} value={Number(r.now[p.key]) || 0} data={series.map((x) => x[p.key])} labels={labels} accent={p.accent} badge={badge}
            trend={d === null || d === 0 ? "none" : d > 0 ? "up" : "down"} caption={against(d)} />;
        })}
      </PeakRow>

      {/* 2. the goal and the place among the consultants */}
      <div className="pk-grid-wide" style={{ marginTop: 6 }}>
        <GlowPanel id="goal" tone="good" title={main ? main.title : "Minha meta"} sub={main ? (main.mine.reached ? "Meta batida." : `${num(main.daysLeft)} dias restantes`) : undefined} empty={!main} emptyText="Você ainda não está em nenhuma meta ativa.">
          {main && (
            <>
              <GlowRing pct={main.mine.pct ?? (main.mine.target ? (main.mine.done / main.mine.target) * 100 : 0)} facts={[
                { label: "Feitas", value: num(main.mine.done) },
                { label: "Meta", value: num(main.mine.target) },
                { label: "Faltam", value: num(main.mine.missing) },
                { label: "Ritmo necessário", value: main.mine.reached || !main.mine.pace ? "—" : `${String(main.mine.pace).replace(".", ",")} por dia` },
              ]} />
              {goals.slice(1).map((g) => (
                <div key={g.id} style={{ marginTop: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13.5 }}><span>{g.title}</span><b>{num(g.mine.done)} / {num(g.mine.target)}</b></div>
                  <div className="pk-rank" style={{ marginTop: 6 }}><span className="track" style={{ display: "block", height: 6, borderRadius: 999, background: "var(--track)", overflow: "hidden" }}><span className="fill" style={{ display: "block", width: `${g.mine.target ? Math.min(100, (g.mine.done / g.mine.target) * 100) : 0}%` }} /></span></div>
                </div>
              ))}
            </>
          )}
        </GlowPanel>
        <GlowPanel id="position" title="Minha posição na equipe" sub="Em matrículas no período. Você vê só o seu lugar, nunca o número dos colegas.">
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 46, fontWeight: 650, letterSpacing: "-0.03em", lineHeight: 1 }}>{team.position ? ordinal(team.position.rank) : "—"}</span>
            <span className="pk-hint">{team.position ? `de ${num(team.position.of)} consultores` : "Sem posição no período"}</span>
          </div>
          <table className="pk-table" style={{ marginTop: 14 }}>
            <thead><tr><th>Comparação</th><th className="r">Você</th><th className="r">Equipe</th></tr></thead>
            <tbody>
              {compare.map(([label, mine, avg, unit, lowerIsBetter]) => {
                const known = mine !== null && mine !== undefined && avg !== null && avg !== undefined;
                const better = known && (lowerIsBetter ? mine <= avg : mine >= avg);
                return (
                  <tr key={label}>
                    <td>{label}</td>
                    <td className="r" style={{ fontWeight: 700, color: known ? (better ? "var(--pk-good)" : "var(--pk-warn)") : undefined }}>{fmt(mine, unit)}</td>
                    <td className="r">{fmt(avg, unit)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </GlowPanel>
      </div>

      {/* 3. today */}
      {today && (
        <Section title="Hoje" hint="O que você fez desde a meia-noite.">
          <div className="pk-grid-4">
            <CountStat id="today-attendances" label="Conversas atendidas" value={today.attendances} hint={targets.dailyAttendances > 0 ? `Meta do dia: ${num(targets.dailyAttendances)}` : undefined} tone={targets.dailyAttendances > 0 && today.attendances >= targets.dailyAttendances ? "good" : undefined} />
            <CountStat id="today-messages" label="Mensagens enviadas" value={today.messagesSent} hint={targets.dailyMessages > 0 ? `Meta do dia: ${num(targets.dailyMessages)}` : undefined} tone={targets.dailyMessages > 0 && today.messagesSent >= targets.dailyMessages ? "good" : undefined} />
            <CountStat id="today-people" label="Pessoas contatadas" value={today.peopleContacted} tone="violet" />
            <CountStat id="today-enrollments" label="Matrículas" value={today.enrollments} tone="good" />
          </div>
        </Section>
      )}

      {/* 4. what to do now */}
      <Section title="O que fazer agora" hint="Os pontos que dependem de você, do mais urgente ao menos.">
        <div className={c.cols}>
          <GlowPanel id="todo" title="Prioridades" empty={!todo.length} emptyText="Tudo em dia. Nenhum ponto pedindo atenção agora.">
            <TodoList items={todo.map((it) => ({ key: it.key, tone: it.tone, title: it.title, detail: it.detail, onClick: it.link ? () => go(it.link) : undefined }))} />
          </GlowPanel>
          <div className={c.panel}>
            <BlockTitle icon={<Clock3 size={16} />} title={`Responder agora (${num(data.metrics.pendingReply)})`} help="Conversas suas em que o cliente falou por último. As mais antigas primeiro." />
            {data.focus.conversations.length === 0 && <div className={c.sub} style={{ marginTop: 6 }}>Ninguém esperando resposta sua.</div>}
            {data.focus.conversations.slice(0, 5).map((v) => (
              <button key={v.ticketId} type="button" className={c.row} onClick={() => go(v.link)}>
                <MessageCircle size={15} /><span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><b>{v.name}</b>{v.lastMessage ? ` · ${v.lastMessage}` : ""}</span><span className={c.sub}>{when(v.at)}</span>
              </button>
            ))}
            <div style={{ marginTop: 14 }}><BlockTitle icon={<CalendarCheck2 size={16} />} title={`Tarefas e retornos de hoje (${num(data.focus.tasks.length + data.focus.followUps.length)})`} help="Tarefas que vencem hoje ou já venceram e leads com o próximo contato marcado para hoje." /></div>
            {data.focus.tasks.length + data.focus.followUps.length === 0 && <div className={c.sub} style={{ marginTop: 6 }}>Nada vencendo hoje.</div>}
            {data.focus.tasks.slice(0, 4).map((k) => (
              <button key={`t${k.id}`} type="button" className={c.row} onClick={() => go(k.link)}>
                <span style={{ flex: 1, minWidth: 0 }}>{k.title}{k.leadName ? <span style={{ opacity: 0.6 }}> · {k.leadName}</span> : null}</span>
                <b style={{ color: k.overdue ? "#dc2626" : undefined }}>{k.overdue ? "atrasada" : when(k.dueAt).slice(-5)}</b>
              </button>
            ))}
            {data.focus.followUps.slice(0, 4).map((l) => (
              <button key={`f${l.leadId}`} type="button" className={c.row} onClick={() => go(l.link)}><Phone size={14} /><span style={{ flex: 1 }}>{l.name}</span><span className={c.sub}>{when(l.at)}</span></button>
            ))}
          </div>
        </div>
      </Section>

      {/* 5. the other results, each against the period before */}
      <Section title="Mais resultados" hint="No período escolhido, comparados com o período anterior de mesma duração.">
        <div className="pk-grid">
          {RESULTS.map(([key, label, unit, lowerIsBetter]) => {
            const now = r.now[key];
            // the grades of the period before are not counted, so there is nothing to compare them with
            const d = key === "gradesSent" ? null : change(now, before[key], unit === "percent");
            return <GlowStat key={key} id={key} label={label} value={unit === "minutes" && now !== null && now !== undefined ? minutesText(now) : fmt(now, unit)} delta={d} upIsGood={!lowerIsBetter} />;
          })}
        </div>
      </Section>

      {/* 6. the leads */}
      <Section title={`Meus leads agora (${num(leads.open)} em andamento)`} hint="Os seus leads em cada etapa do funil hoje."
        action={<button type="button" className={c.btn} onClick={() => go("/crm")}>Abrir meu funil</button>}>
        <GlowPanel empty={!leads.stages.some((s) => s.n > 0)} emptyText="Nenhum lead em andamento com você.">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: leads.waiting > 0 || leads.stale > 0 ? 14 : 0 }}>
            {leads.waiting > 0 && <button type="button" className="pk-btn" style={{ color: "var(--pk-bad)" }} onClick={() => go("/crm")}>{num(leads.waiting)} sem primeiro contato</button>}
            {leads.stale > 0 && <button type="button" className="pk-btn" style={{ color: "var(--pk-warn)" }} onClick={() => go("/crm?followUp=overdue")}>{num(leads.stale)} esfriando</button>}
          </div>
          <GlowFunnel steps={leads.stages.filter((s) => s.n > 0).map((s) => ({ key: s.id, name: s.name, value: s.n, color: s.color || undefined }))} />
        </GlowPanel>
      </Section>

      {/* the goals of every polo: how the consultant's polo is doing and the others (the same cards the management sees) */}
      <div style={{ marginTop: 28 }}><PoloProgress title="Metas dos meus polos" onlyMine /></div>

      {/* 7. orientation */}
      <Section title="Orientações para você" hint="Da revisão diária das suas conversas e da comparação com a média da equipe.">
        <div className={c.cols}>
          <div className={c.panel}>
            <BlockTitle icon={<Lightbulb size={16} />} title="Pelos seus números" />
            {(data.tips || []).length === 0 && <div className={c.sub} style={{ marginTop: 6 }}>Nada fora da média da equipe no período. Continue assim.</div>}
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 6, fontSize: 13.5 }}>{(data.tips || []).map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
          <div className={c.panel}>
            <BlockTitle icon={<Lightbulb size={16} />} title="Da revisão das suas conversas" help="A IA lê as conversas do dia, sem dados pessoais, e só mostra o que se repete." />
            {!coaching || (!coaching.items.length && !(coaching.strengths || []).length) ? (
              <div className={c.sub} style={{ marginTop: 6 }}>Ainda não há conversas suas revisadas no período.</div>
            ) : (
              <>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 6, fontSize: 13.5 }}>{coaching.items.map((it) => <li key={`${it.kind}-${it.key}`}>{it.text}</li>)}</ul>
                {(coaching.strengths || []).length > 0 && <div className={c.sub} style={{ marginTop: 8 }}>Pontos fortes: {coaching.strengths.join(", ")}</div>}
              </>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
};

export default MyPerformance;
