import React, { useContext, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { AlertTriangle, Check, CheckCircle2, RefreshCw, X } from "lucide-react";
import { AuthContext } from "../../context/Auth/AuthContext";
import { clearFollowUp, closeTicket, dismissInsight, dismissReply, finishTask } from "../../utils/quickActions";

import { PeriodPicker, fmt, minutesText, num, periodParams, useAnalytics, useKit } from "../../components/analytics/kit";
import { BoardHead, CompareStat, CountStat, EmptyNote, Funnel, GlowPanel, GlowStat, Person, PriorityList, SectionTitle, rangeText } from "../../components/peak";
import { PaceRing } from "../../components/analytics/PoloProgress";
import "../../styles/dash.css";

// Meu desempenho: the consultant's own place. Only their numbers (the server reads who is logged in, never a choice of the screen):
// the results of the period with the line over the days, the goal, the place among the consultants, what to do now, the leads and
// the orientation from the daily review. The management has Estatísticas with the whole team.

const when = (v) => { try { return format(parseISO(v), "dd/MM HH:mm"); } catch (e) { return ""; } };
// change against the period before, in percent (points for a rate); null when there is nothing to compare
const change = (now, before, points) => {
  if (before === null || before === undefined || now === null || now === undefined) return null;
  if (points) return Math.round((now - before) * 10) / 10;
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
};
const SERIES = [
  { key: "enrollments", title: "Matrículas", unit: "matrículas" },
  { key: "attendances", title: "Conversas atendidas", unit: "conversas" },
  { key: "peopleContacted", title: "Pessoas contatadas", unit: "pessoas" },
  { key: "messagesSent", title: "Mensagens enviadas", unit: "mensagens" },
];

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


const MyPerformance = () => {
  const c = useKit();
  const history = useHistory();
  const [period, setPeriod] = useState({ range: "month", from: "", to: "" });
  const params = useMemo(() => periodParams(period), [period]);
  const ready = period.range !== "custom" || (period.from && period.to);
  const { data, loading, error, reload } = useAnalytics("/analytics/me/overview", params, !!ready);
  const go = (link) => history.push(link);
  const { user } = useContext(AuthContext);
  // what was concluded or cleared here leaves the list at once (the counts come back from the server right after)
  const [gone, setGone] = useState(() => new Set());
  const hide = (key, on) => setGone((g) => { const n = new Set(g); if (on) n.add(key); else n.delete(key); return n; });
  const act = async (key, action) => {
    hide(key, true);
    const ok = await action(() => { hide(key, false); reload(); });
    if (!ok) hide(key, false);
    else reload();
  };
  const head = (
    <div style={{ marginBottom: 20 }}>
      <BoardHead title="Meu desempenho" sub="Os seus resultados, a sua meta, o que fazer agora e os seus leads. Só você vê estes números.">
        <PeriodPicker value={period} onChange={setPeriod} />
      </BoardHead>
    </div>
  );

  if (!data) {
    return (
      <div className={`${c.page} dash-scope gv-plain`}>
        {head}
        {!ready ? (
          <EmptyNote>Escolha as duas datas do período.</EmptyNote>
        ) : loading && !error ? (
          <div className="gv-board" aria-busy="true" aria-label="Carregando os seus resultados">
            {SERIES.slice(0, 3).map((k) => <CompareStat key={k.key} id={k.key} title={k.title} loading now={0} before={null} />)}
          </div>
        ) : (
          <div className="gv-card" role="alert" style={{ flexDirection: "row", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <AlertTriangle size={16} color="#b45309" /><span style={{ flex: 1, minWidth: 0 }}>Não foi possível carregar o seu desempenho agora.</span>
            <button type="button" className={c.btn} onClick={reload}><RefreshCw size={13} style={{ verticalAlign: -2 }} /> Tentar de novo</button>
          </div>
        )}
      </div>
    );
  }

  const r = data.results || { now: {}, before: null };
  const before = r.before || null;
  const targets = data.targets || {};
  const leads = data.leads || { stages: [], open: 0, waiting: 0, stale: 0 };
  const todo = data.insights || [];
  const coaching = data.coaching;
  const series = data.series || [];
  const badge = rangeText(period);
  // what was done today is the last day of the series, when the period reaches today
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });
  const today = series.find((d) => d.day === todayKey);
  const goals = data.goals || [];
  const main = goals[0];
  // the funnel by who is in a stage or beyond it; the number written is who is in the stage today
  const stages = leads.stages || [];
  const funnel = stages.map((s, i) => ({ key: s.id ?? s.name, name: s.name, value: Number(s.n) || 0, reach: stages.slice(i).reduce((a, x) => a + (Number(x.n) || 0), 0) }));
  const dayGoal = (done, target) => (target > 0 ? `${num(done)} de ${num(target)} da meta do dia` : undefined);
  const waitingReply = (data.focus.conversations || []).filter((v) => !gone.has(`r${v.ticketId}`));
  const dueToday = [...(data.focus.tasks || []).map((k) => ({ key: `t${k.id}`, title: k.title, sub: k.leadName, right: k.overdue ? "atrasada" : when(k.dueAt).slice(-5), bad: k.overdue, link: k.link,
      done: k.leadId ? () => act(`t${k.id}`, (undone) => finishTask(k.leadId, k.id, undone)) : null, doneLabel: "Concluir" })),
    ...(data.focus.followUps || []).map((l) => ({ key: `f${l.leadId}`, title: l.name, sub: "Retorno marcado", right: when(l.at), link: l.link,
      done: () => act(`f${l.leadId}`, (undone) => clearFollowUp(l.leadId, l.at, undone)), doneLabel: "Limpar" }))].filter((k) => !gone.has(k.key));
  const todoShown = todo.filter((it) => !gone.has(`i${it.key}`));

  return (
    <div className={`${c.page} dash-scope gv-plain`} style={{ opacity: loading ? 0.75 : 1, transition: "opacity .2s ease" }}>
      {head}

      {/* 1. the period beside the period before, and the goal (the goals of every polo and consultant are in Metas, in the menu) */}
      <div className="gv-board">
        {SERIES.slice(0, 3).map((k) => (
          <CompareStat key={k.key} id={k.key} title={k.title} nowLabel={badge} now={Number(r.now[k.key]) || 0} before={before && before[k.key] !== undefined && before[k.key] !== null ? before[k.key] : null} />
        ))}
        <section className="gv-funnel-card" data-panel="goal" style={{ display: "grid", minWidth: 0, gridColumn: "1 / -1" }}>
          {main ? (
            <div className="pp-hero" style={{ alignContent: "center" }}>
              <PaceRing pct={main.mine.pct ?? (main.mine.target ? (main.mine.done / main.mine.target) * 100 : 0)} color="#fff" size={104} stroke={10} />
              <div style={{ flex: 1, minWidth: 180 }}>
                <div className="pp-hero-sub" style={{ marginTop: 0 }}>{main.title || "Minha meta"}{main.mine.reached ? " · meta batida" : ` · ${num(main.daysLeft)} dias restantes`}</div>
                <div className="pp-hero-num" style={{ marginTop: 4 }}>{num(main.mine.done)}<small> / {num(main.mine.target)}</small></div>
                <div className="pp-hero-sub">
                  {main.mine.reached ? "Você bateu a meta do período." : `Faltam ${num(main.mine.missing)}${main.mine.pace ? ` · ${String(main.mine.pace).replace(".", ",")} por dia para chegar lá` : ""}`}
                </div>
                {goals.slice(1).map((g) => (
                  <div key={g.id} className="pp-hero-sub" style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 12, borderTop: "1px solid rgba(255,255,255,.18)", paddingTop: 8 }}>
                    <span>{g.title}</span><b style={{ color: "#fff" }}>{num(g.mine.done)} / {num(g.mine.target)}</b>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="gv-card"><h3 className="gv-title">Minha meta</h3><EmptyNote>Você ainda não está em nenhuma meta ativa.</EmptyNote></div>
          )}
        </section>
      </div>

      {/* 3. today */}
      {today && (
        <Section title="Hoje" hint="O que você fez desde a meia-noite.">
          <div className="pk-grid-4">
            <CountStat id="today-attendances" label="Conversas atendidas" value={today.attendances} hint={dayGoal(today.attendances, targets.dailyAttendances)} tone={targets.dailyAttendances > 0 && today.attendances >= targets.dailyAttendances ? "good" : undefined} />
            <CountStat id="today-messages" label="Mensagens enviadas" value={today.messagesSent} hint={dayGoal(today.messagesSent, targets.dailyMessages)} tone={targets.dailyMessages > 0 && today.messagesSent >= targets.dailyMessages ? "good" : undefined} />
            <CountStat id="today-people" label="Pessoas contatadas" value={today.peopleContacted} />
            <CountStat id="today-enrollments" label="Matrículas" value={today.enrollments} />
          </div>
        </Section>
      )}

      {/* 4. what to do now */}
      <Section title="O que fazer agora" hint="Os pontos que dependem de você, do mais urgente ao menos.">
        <div className="pk-grid-wide">
          <GlowPanel id="todo" title="Prioridades">
            {todoShown.length ? <PriorityList items={todoShown.map((it) => ({ key: it.key, tone: it.tone, title: it.title, detail: it.detail, onClick: it.link ? () => go(it.link) : undefined,
              onDismiss: () => act(`i${it.key}`, (undone) => dismissInsight(it.key, undone)) }))} /> : <EmptyNote>Tudo em dia. Nenhum ponto pedindo atenção agora.</EmptyNote>}
          </GlowPanel>
          <GlowPanel id="reply" title={`Responder agora (${num(Math.max(0, Number(data.metrics.pendingReply || 0) - (data.focus.conversations || []).filter((v) => gone.has(`r${v.ticketId}`)).length))})`} sub="Conversas suas em que o cliente falou por último. As mais antigas primeiro.">
            {waitingReply.length === 0 ? <EmptyNote>Ninguém esperando resposta sua.</EmptyNote> : (
              <div className="gv-rowlist">
                {waitingReply.slice(0, 5).map((v) => (
                  <div key={v.ticketId} className="gv-act-row">
                    <button type="button" className="gv-item gv-item-btn" onClick={() => go(v.link)}>
                      <Person name={v.name} size={32} />
                      <span className="gv-item-main"><b>{v.name}</b>{v.lastMessage ? <small className="gv-clip">{v.lastMessage}</small> : null}</span>
                      <span className="gv-cap">{when(v.at)}</span>
                    </button>
                    <span className="gv-acts">
                      <button type="button" className="gv-act" title="Não precisa responder (um ok, um obrigado). Volta se o cliente escrever de novo." onClick={() => act(`r${v.ticketId}`, (undone) => dismissReply(v.ticketId, undone))}><Check size={14} />Já resolvido</button>
                      <button type="button" className="gv-act" title="Encerra o atendimento. Se o cliente escrever de novo, a conversa reabre." onClick={() => act(`r${v.ticketId}`, (undone) => closeTicket(v.ticketId, user && user.id, undone))}><X size={14} />Finalizar</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </GlowPanel>
          <GlowPanel id="due" title={`Tarefas e retornos de hoje (${num(dueToday.length)})`} sub="Tarefas que vencem hoje ou já venceram e leads com o próximo contato marcado para hoje.">
            {dueToday.length === 0 ? <EmptyNote>Nada vencendo hoje.</EmptyNote> : (
              <div className="gv-rowlist">
                {dueToday.slice(0, 8).map((k) => (
                  <div key={k.key} className="gv-act-row">
                    <button type="button" className="gv-item gv-item-btn" onClick={() => go(k.link)}>
                      <span className="gv-item-main"><b>{k.title}</b>{k.sub ? <small>{k.sub}</small> : null}</span>
                      {k.bad ? <span className="gv-tag" data-tone="bad">atrasada</span> : <span className="gv-cap">{k.right}</span>}
                    </button>
                    {k.done && <span className="gv-acts"><button type="button" className="gv-act" onClick={k.done}><CheckCircle2 size={14} />{k.doneLabel}</button></span>}
                  </div>
                ))}
              </div>
            )}
          </GlowPanel>
        </div>
      </Section>

      {/* 5. the other results, each against the period before */}
      <Section title="Mais resultados" hint="No período escolhido, comparados com o período anterior de mesma duração.">
        <div className="pk-grid">
          {RESULTS.map(([key, label, unit, lowerIsBetter]) => {
            const now = r.now[key];
            // the grades of the period before are not counted, so there is nothing to compare them with
            const d = key === "gradesSent" || !before ? null : change(now, before[key], unit === "percent");
            return <GlowStat key={key} id={key} label={label} value={unit === "minutes" && now !== null && now !== undefined ? minutesText(now) : fmt(now, unit)} delta={d} upIsGood={!lowerIsBetter} />;
          })}
        </div>
      </Section>

      {/* 6. the leads */}
      <Section title={`Meus leads agora (${num(leads.open)} em andamento)`} hint="Os seus leads em cada etapa do funil hoje."
        action={<button type="button" className="pk-btn" onClick={() => go("/crm")}>Abrir meu funil</button>}>
        <section className="gv-card" data-panel="funnel">
          {(leads.waiting > 0 || leads.stale > 0) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {leads.waiting > 0 && <button type="button" className="gv-tag" data-tone="bad" style={{ border: 0, cursor: "pointer", font: "inherit", fontSize: 12.5, fontWeight: 650, padding: "5px 12px" }} onClick={() => go("/crm")}>{num(leads.waiting)} sem primeiro contato</button>}
              {leads.stale > 0 && <button type="button" className="gv-tag" data-tone="warn" style={{ border: 0, cursor: "pointer", font: "inherit", fontSize: 12.5, fontWeight: 650, padding: "5px 12px" }} onClick={() => go("/crm?followUp=overdue")}>{num(leads.stale)} esfriando</button>}
            </div>
          )}
          {funnel.some((s) => s.value > 0)
            ? <Funnel steps={funnel} onStep={() => go("/crm")} valueHint="Leads nesta etapa agora" footer="O número é quem está em cada etapa agora; a porcentagem, quem está nela ou adiante." />
            : <EmptyNote>Nenhum lead em andamento com você.</EmptyNote>}
        </section>
      </Section>

      {/* the goals of the consultant's polos (the same cards the management sees) */}

      {/* 7. orientation */}
      <Section title="Orientações para você" hint="Da revisão diária das suas conversas e da comparação com a média da equipe.">
        <div className="pk-grid-wide">
          <GlowPanel id="tips" title="Pelos seus números">
            {(data.tips || []).length === 0 ? <EmptyNote>Nada fora da média da equipe no período. Continue assim.</EmptyNote>
              : <ul className="gv-notes">{(data.tips || []).map((x) => <li key={x}>{x}</li>)}</ul>}
          </GlowPanel>
          <GlowPanel id="coaching" title="Da revisão das suas conversas" sub="A IA lê as conversas do dia, sem dados pessoais, e só mostra o que se repete.">
            {!coaching || (!coaching.items.length && !(coaching.strengths || []).length) ? (
              <EmptyNote>Ainda não há conversas suas revisadas no período.</EmptyNote>
            ) : (
              <>
                <ul className="gv-notes">{coaching.items.map((it) => <li key={`${it.kind}-${it.key}`}>{it.text}</li>)}</ul>
                {(coaching.strengths || []).length > 0 && <div className="gv-cap" style={{ marginTop: 10 }}>Pontos fortes: {coaching.strengths.join(", ")}</div>}
              </>
            )}
          </GlowPanel>
        </div>
      </Section>
    </div>
  );
};

export default MyPerformance;
