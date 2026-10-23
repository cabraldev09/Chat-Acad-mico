import React, { useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { CalendarCheck2, Clock3, MessageCircle, Phone, Target } from "lucide-react";

import { BlockTitle, HistoryChart, Kpi, PeriodPicker, PresenceDot, PRESENCE, Progress, fmt, num, periodParams, useAnalytics, useDefinitions, useKit } from "../../components/analytics/kit";

const when = (v) => { try { return format(parseISO(v), "dd/MM HH:mm"); } catch (e) { return ""; } };

// The consultant's own place: only their numbers (the server never answers anyone else's here), what to do next and where they stand.
const MyStats = () => {
  const c = useKit();
  const history = useHistory();
  const defs = useDefinitions();
  const [period, setPeriod] = useState({ range: "today", from: "", to: "" });
  const params = useMemo(() => periodParams(period), [period]);
  const ready = period.range !== "custom" || (period.from && period.to);
  const { data, loading } = useAnalytics("/analytics/me", params, !!ready);
  const today = useAnalytics("/analytics/me", { range: "today" }, true);

  if (!data) return <div className={c.page}><div className={c.sub}>{loading ? "Carregando…" : "Não foi possível carregar suas estatísticas."}</div></div>;
  const m = data.metrics;
  const t = today.data ? today.data.metrics : m;
  const targets = data.targets || {};
  const presence = PRESENCE[data.presence.state];
  const go = (link) => history.push(link);

  return (
    <div className={c.page}>
      <div className={c.head}>
        <div>
          <h1 className={c.h1}>Minhas estatísticas</h1>
          <div className={c.lead}>Sua central de autogestão: o que você produziu, o que precisa de atenção agora e como está nas metas.</div>
        </div>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      <div className={c.hero} style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, opacity: 0.85 }}><PresenceDot state={data.presence.state} />{presence.label}{data.presence.scheduleToday.length ? ` · meu horário hoje: ${data.presence.scheduleToday.map((s) => `${s.start}–${s.end}`).join(", ")}` : " · sem horário programado hoje"}</div>
        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10 }}>Minha produção hoje</div>
        <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 2 }}>O que você fez desde a meia-noite: mensagens enviadas por você, conversas atendidas, leads trabalhados e matrículas. Quando há meta diária, a barra mostra o quanto falta.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 18, marginTop: 8 }}>
          {[["Mensagens enviadas", t.messagesSent, targets.dailyMessages], ["Atendimentos", t.attendances, targets.dailyAttendances], ["Leads trabalhados", t.leadsWorked, 0], ["Matrículas", t.enrollments, 0]].map(([label, value, target]) => (
            <div key={label} data-hero={label}>
              <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{num(value)}{target > 0 ? <span style={{ fontSize: 15, opacity: 0.8 }}> / {num(target)}</span> : null}</div>
              <div style={{ fontSize: 12.5, opacity: 0.85 }}>{label}</div>
              {target > 0 && <div style={{ marginTop: 6 }}><Progress value={value} max={target} color="#0693E3" /></div>}
            </div>
          ))}
        </div>
      </div>

      <div className={c.grid} style={{ marginBottom: 16 }}>
        {["messagesSent", "attendances", "leadsWorked", "reactivated", "pendingReply", "followUpsDue", "proposalsSent", "enrollments", "conversion", "tasksOverdue"].map((k) => (
          <Kpi key={k} k={k} value={m[k]} def={defs[k]} tone={k === "tasksOverdue" && m[k] > 0 ? "#dc2626" : undefined} />
        ))}
      </div>

      <div className={c.cols}>
        <div className={c.panel}>
          <BlockTitle icon={<Clock3 size={16} />} title={`Responder agora (${num(m.pendingReply)})`} help="Conversas suas em que o cliente falou por último. As mais antigas aparecem primeiro. Clique para abrir e responder." />
          <div style={{ marginTop: 8 }}>
            {data.focus.conversations.length === 0 && <div className={c.sub}>Ninguém esperando resposta sua.</div>}
            {data.focus.conversations.map((v) => (
              <button key={v.ticketId} type="button" className={c.row} onClick={() => go(v.link)}>
                <MessageCircle size={15} /><span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><b>{v.name}</b>{v.lastMessage ? ` · ${v.lastMessage}` : ""}</span><span className={c.sub}>{when(v.at)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className={c.panel}>
          <BlockTitle icon={<CalendarCheck2 size={16} />} title={`Tarefas para hoje (${num(m.tasksOpen)} abertas)`} help="Contatos que você combinou com seus leads e que vencem hoje ou já venceram. Clique para abrir o lead e conclua pela tela de tarefas." />
          <div style={{ marginTop: 8 }}>
            {data.focus.tasks.length === 0 && <div className={c.sub}>Nenhuma tarefa para hoje.</div>}
            {data.focus.tasks.map((k) => (
              <button key={k.id} type="button" className={c.row} onClick={() => go(k.link)}>
                <span style={{ flex: 1, minWidth: 0 }}>{k.title}{k.leadName ? <span style={{ opacity: 0.6 }}> · {k.leadName}</span> : null}</span>
                <b style={{ color: k.overdue ? "#dc2626" : undefined }}>{k.overdue ? "atrasada" : when(k.dueAt).slice(-5)}</b>
              </button>
            ))}
            <button type="button" className={c.btn} style={{ marginTop: 10 }} onClick={() => go("/crm/tarefas")}>Ver todas as tarefas</button>
          </div>
        </div>
        <div className={c.panel}>
          <BlockTitle icon={<Phone size={16} />} title={`Follow-ups de hoje (${num(m.followUpsDue)})`} help="Leads seus com o próximo contato marcado para hoje ou antes. Retome a conversa para não esfriar o lead." />
          <div style={{ marginTop: 8 }}>
            {data.focus.followUps.length === 0 && <div className={c.sub}>Nenhum follow-up vencendo.</div>}
            {data.focus.followUps.map((l) => (
              <button key={l.leadId} type="button" className={c.row} onClick={() => go(l.link)}><span style={{ flex: 1 }}>{l.name}</span><span className={c.sub}>{when(l.at)}</span></button>
            ))}
            <button type="button" className={c.btn} style={{ marginTop: 10 }} onClick={() => go("/crm")}>Abrir meu funil</button>
          </div>
        </div>
      </div>

      <div className={c.cols} style={{ marginTop: 16 }}>
        <div className={c.panel}>
          <BlockTitle title="Minha evolução" help="Suas mensagens, atendimentos e matrículas dia a dia no período escolhido em cima da página." />
          <HistoryChart series={data.series} />
        </div>
        <div className={c.panel}>
          <BlockTitle icon={<Target size={16} />} title="Minhas metas" help="Quantas matrículas você já fez e quantas faltam em cada meta ativa, com o ritmo por dia para chegar lá." />
          {data.goals.length === 0 && <div className={c.sub} style={{ marginTop: 8 }}>Você ainda não está em nenhuma meta ativa.</div>}
          {data.goals.map((g) => (
            <div key={g.id} style={{ margin: "12px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><span>{g.title}</span><b>{num(g.mine.done)} / {num(g.mine.target)}</b></div>
              <Progress value={g.mine.done} max={g.mine.target || 0} />
              <div className={c.sub}>{g.mine.reached ? "Meta batida!" : g.mine.pace ? `Faltam ${num(g.mine.missing)}: ${String(g.mine.pace).replace(".", ",")} matrículas por dia nos ${g.daysLeft} dias restantes` : `${g.daysLeft} dias restantes`}</div>
            </div>
          ))}
          <div style={{ marginTop: 10 }} className={c.sub}>Taxa de conversão no período: <b>{fmt(m.conversion, "percent")}</b></div>
        </div>
      </div>
    </div>
  );
};

export default MyStats;
