import React, { useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { AlertTriangle, CalendarCheck2, ChevronRight, Clock3, Lightbulb, MessageCircle, Phone, RefreshCw, Target, TrendingUp } from "lucide-react";

import { BlockTitle, HistoryChart, PeriodPicker, Progress, fmt, num, periodParams, useAnalytics, useKit } from "../../components/analytics/kit";
import { Delta } from "../../components/charts";
import "../../styles/dash.css";

// Meu desempenho: the consultant's own place. Only their numbers (the server reads who is logged in, never a choice of the screen):
// what to do now, the commercial results against the period before, the leads, the goals and the production of the day, and
// orientation from the daily review and from the numbers. The management has its own area (Gestão comercial) with the whole team.

const when = (v) => { try { return format(parseISO(v), "dd/MM HH:mm"); } catch (e) { return ""; } };
const TONE = { danger: "#dc2626", warn: "#d97706", good: "#16a34a", info: "#0693E3" };
// change against the period before, in percent (points for a rate); null when there is nothing to compare
const change = (now, before, points) => {
  if (before === null || before === undefined || now === null || now === undefined) return null;
  if (points) return Math.round((now - before) * 10) / 10;
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
};

const RESULTS = [
  ["leadsWorked", "Leads trabalhados"],
  ["peopleContacted", "Pessoas contatadas"],
  ["proposalsSent", "Propostas enviadas"],
  ["gradesSent", "Grades enviadas"],
  ["enrollments", "Matrículas"],
  ["conversion", "Conversão", "percent"],
  ["firstContactMinutes", "Tempo do 1º contato", "minutes", true],
];

const Section = ({ title, hint, children, action }) => {
  const c = useKit();
  return (
    <section style={{ marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div><h2 className={c.h2} style={{ fontSize: 16 }}>{title}</h2>{hint && <div className={c.sub}>{hint}</div>}</div>
        {action}
      </div>
      {children}
    </section>
  );
};

const MyPerformance = () => {
  const c = useKit();
  const history = useHistory();
  const [period, setPeriod] = useState({ range: "month", from: "", to: "" });
  const params = useMemo(() => periodParams(period), [period]);
  const ready = period.range !== "custom" || (period.from && period.to);
  const { data, loading, error, reload } = useAnalytics("/analytics/me/overview", params, !!ready);
  const today = useAnalytics("/analytics/me", { range: "today" }, true);
  const go = (link) => history.push(link);

  if (!data) {
    return (
      <div className={c.page}>
        <h1 className={c.h1}>Meu desempenho</h1>
        {loading && !error ? (
          <div style={{ display: "grid", gap: 12, marginTop: 16 }}>{[0, 1, 2].map((i) => <div key={i} className={c.panel} style={{ height: 90, opacity: 0.5 }} />)}</div>
        ) : (
          <div className={c.panel} role="alert" style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <AlertTriangle size={16} color="#b45309" /><span style={{ flex: 1, minWidth: 0 }}>Não foi possível carregar o seu desempenho agora.</span>
            <button type="button" className={c.btn} onClick={reload}><RefreshCw size={13} style={{ verticalAlign: -2 }} /> Tentar de novo</button>
          </div>
        )}
      </div>
    );
  }

  const r = data.results || { now: {}, before: null };
  const t = today.data ? today.data.metrics : data.metrics;
  const targets = data.targets || {};
  const leads = data.leads || { stages: [], open: 0, waiting: 0, stale: 0 };
  const maxStage = Math.max(1, ...leads.stages.map((s) => s.n));
  const todo = data.insights || [];
  const coaching = data.coaching;

  return (
    <div className={`${c.page} dash-scope`}>
      <div className={c.head}>
        <div style={{ minWidth: 0 }}>
          <h1 className={c.h1}>Meu desempenho</h1>
          <div className={c.lead}>O que você precisa fazer agora, os seus resultados comerciais, os seus leads e metas. Só você vê estes números.</div>
        </div>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      {/* 1. what to do now */}
      <Section title="O que fazer agora" hint="Os pontos que dependem de você, do mais urgente ao menos.">
        <div className={c.cols}>
          <div className={c.panel}>
            {todo.length === 0 && <div className={c.sub}>Tudo em dia. Nenhum ponto pedindo atenção agora.</div>}
            {todo.map((it) => (
              <button key={it.key} type="button" className={c.row} onClick={() => go(it.link)}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: TONE[it.tone] || TONE.info, flex: "none" }} />
                <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block" }}>{it.title}</b><span className={c.sub}>{it.detail}</span></span>
                <ChevronRight size={15} style={{ color: "var(--text-2)", flex: "none" }} />
              </button>
            ))}
          </div>
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

      {/* 2. commercial results */}
      <Section title="Meus resultados comerciais" hint="No período escolhido. A seta compara com o período anterior de mesma duração.">
        <div className={c.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
          {RESULTS.map(([key, label, unit, inverse]) => {
            const now = key === "gradesSent" ? r.now.gradesSent : r.now[key];
            const before = r.before ? r.before[key] : null;
            const d = key === "gradesSent" ? null : change(now, before, unit === "percent");
            return (
              <div key={key} className={c.kpi}>
                <div className={c.kpiLabel}><span>{label}</span></div>
                <div className={c.kpiValue}>{fmt(now, unit)}</div>
                <div style={{ marginTop: 4, minHeight: 20 }}>{d !== null && <Delta value={d} unit={unit === "percent" ? " p.p." : "%"} inverse={inverse} />}</div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* 3. leads and goals */}
      <div className={c.cols} style={{ marginTop: 22 }}>
        <div className={c.panel}>
          <BlockTitle icon={<TrendingUp size={16} />} title={`Meus leads agora (${num(leads.open)} em andamento)`} help="Os seus leads em cada etapa do funil hoje." />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
            {leads.waiting > 0 && <button type="button" className={c.btn} style={{ color: "#dc2626" }} onClick={() => go("/crm")}>{num(leads.waiting)} sem primeiro contato</button>}
            {leads.stale > 0 && <button type="button" className={c.btn} style={{ color: "#b45309" }} onClick={() => go("/crm?followUp=overdue")}>{num(leads.stale)} esfriando</button>}
          </div>
          {leads.stages.filter((s) => s.n > 0).length === 0 && <div className={c.sub}>Nenhum lead em andamento com você.</div>}
          {leads.stages.filter((s) => s.n > 0).map((s) => (
            <div key={s.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 150px) 1fr 40px", gap: 10, alignItems: "center", padding: "5px 0", fontSize: 13.5 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.name}>{s.name}</span>
              <div className={c.bar}><div className={c.fill} style={{ width: `${(s.n / maxStage) * 100}%`, background: s.color || undefined }} /></div>
              <b style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{num(s.n)}</b>
            </div>
          ))}
          <button type="button" className={c.btn} style={{ marginTop: 10 }} onClick={() => go("/crm")}>Abrir meu funil</button>
        </div>
        <div className={c.panel}>
          <BlockTitle icon={<Target size={16} />} title="Hoje e minhas metas" help="O que você fez desde a meia-noite e quanto falta em cada meta ativa." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 12, margin: "10px 0 14px" }}>
            {[["Conversas", t.attendances, targets.dailyAttendances], ["Pessoas", t.peopleContacted, 0], ["Leads", t.leadsWorked, 0], ["Matrículas", t.enrollments, 0]].map(([label, value, target]) => (
              <div key={label}>
                <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{num(value)}{target > 0 ? <span style={{ fontSize: 13, opacity: 0.7 }}> / {num(target)}</span> : null}</div>
                <div className={c.sub} style={{ marginTop: 0 }}>{label} hoje</div>
                {target > 0 && <div style={{ marginTop: 4 }}><Progress value={value} max={target} color="#0693E3" /></div>}
              </div>
            ))}
          </div>
          {data.goals.length === 0 && <div className={c.sub}>Você ainda não está em nenhuma meta ativa.</div>}
          {data.goals.map((g) => (
            <div key={g.id} style={{ margin: "10px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}><span>{g.title}</span><b>{num(g.mine.done)} / {num(g.mine.target)}</b></div>
              <Progress value={g.mine.done} max={g.mine.target || 0} />
              <div className={c.sub}>{g.mine.reached ? "Meta batida." : g.mine.pace ? `Faltam ${num(g.mine.missing)}: ${String(g.mine.pace).replace(".", ",")} matrículas por dia nos ${g.daysLeft} dias restantes` : `${g.daysLeft} dias restantes`}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. orientation */}
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

      {/* 5. evolution */}
      <Section title="Minha evolução" hint="Mensagens, conversas e matrículas por dia no período.">
        <div className={c.panel}><HistoryChart series={data.series} /></div>
      </Section>
    </div>
  );
};

export default MyPerformance;
