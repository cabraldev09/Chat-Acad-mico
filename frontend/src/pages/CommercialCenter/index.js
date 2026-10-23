import React, { useContext, useEffect, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { AlertTriangle, BarChart3, CalendarClock, Download, Gauge, HeartPulse, ListTodo, Megaphone, MonitorCheck, Settings2, Target, Users } from "lucide-react";

import { AuthContext } from "../../context/Auth/AuthContext";
import { canOperateRetention } from "../../utils/access";
import { onColor, tint } from "../../utils/color";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { BRAND, BlockTitle, CompareBars, HistoryChart, Kpi, PeriodPicker, PresenceDot, PRESENCE, Progress, fmt, num, periodParams, useAnalytics, useDefinitions, useKit } from "../../components/analytics/kit";

const DAYS = [["1", "Seg"], ["2", "Ter"], ["3", "Qua"], ["4", "Qui"], ["5", "Sex"], ["6", "Sáb"], ["0", "Dom"]];
const LEVEL = { high: "#dc2626", medium: "#d97706", low: "#0693E3" };
const TAB_HELP = {
  geral: "Resumo da equipe no período escolhido: totais, quem está trabalhando agora e o que precisa da sua atenção.",
  consultores: "Compare cada consultor lado a lado. Clique em um nome para ver a evolução, as metas e as tarefas dele.",
  polos: "Os mesmos números somados por polo, para comparar o desempenho de cada unidade.",
  ferramentas: "Tudo o que a gestão comercial usa no dia a dia, num só lugar: tarefas, retenção, ambientação, agendamentos, campanhas e estatísticas.",
  config: "Defina horários de trabalho, metas diárias e a regra de inatividade. Vale para esta tela e para a de cada consultor.",
};
// where a click on an alert takes the manager (the task screen opens already filtered on that person)
const alertLink = (a) => (a.code === "tasks_overdue" ? `/crm/tarefas?scope=all&status=overdue&userId=${a.userId}` : a.link);

const COLS = [["messagesSent", "Mensagens"], ["attendances", "Atend."], ["leadsWorked", "Leads"], ["reactivated", "Reativ."], ["pendingReply", "Pendentes"], ["enrollments", "Matrículas"], ["conversion", "Conv."], ["tasksOverdue", "Atrasadas"]];

const ConfigPanel = ({ config, consultants, onSaved }) => {
  const c = useKit();
  const [form, setForm] = useState(config);
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(config), [config]);
  const slot = (uid, dow) => ((form.schedules[uid] || {})[dow] || [])[0] || { start: "", end: "" };
  const setSlot = (uid, dow, part, value) => {
    const cur = slot(uid, dow);
    const next = { ...cur, [part]: value };
    const schedules = { ...form.schedules, [uid]: { ...(form.schedules[uid] || {}) } };
    if (!next.start && !next.end) delete schedules[uid][dow];
    else schedules[uid][dow] = [next];
    setForm({ ...form, schedules });
  };
  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/analytics/config", form);
      toast.success("Configuração salva. Os painéis foram atualizados.");
      onSaved(data);
    } catch (err) { toastError(err); }
    setSaving(false);
  };
  return (
    <div className={c.panel}>
      <BlockTitle icon={<Settings2 size={16} />} title="Horários, metas e regras de produtividade" help="O que está aqui vale para os dois ambientes: este painel de gestão e a tela de Estatísticas de cada consultor." />
      <div className={c.grid} style={{ marginTop: 16 }}>
        <label className={c.sub}>Considerar parado após (minutos sem atividade). Quem está no horário de trabalho e passa desse tempo sem enviar mensagem, mexer em lead ou concluir tarefa aparece como "No horário, sem atividade".
          <input type="number" min={1} max={240} className={c.input} style={{ width: "100%", marginTop: 4 }} value={form.activeWindowMinutes} onChange={(e) => setForm({ ...form, activeWindowMinutes: e.target.value })} />
        </label>
        <label className={c.sub}>Meta diária de mensagens enviadas. Aparece na tela do consultor e gera alerta quando ele está no horário e abaixo da meta (0 = sem meta).
          <input type="number" min={0} className={c.input} style={{ width: "100%", marginTop: 4 }} value={form.dailyMessagesTarget} onChange={(e) => setForm({ ...form, dailyMessagesTarget: e.target.value })} />
        </label>
        <label className={c.sub}>Meta diária de atendimentos (conversas diferentes atendidas por dia). Aparece na tela do consultor (0 = sem meta).
          <input type="number" min={0} className={c.input} style={{ width: "100%", marginTop: 4 }} value={form.dailyAttendancesTarget} onChange={(e) => setForm({ ...form, dailyAttendancesTarget: e.target.value })} />
        </label>
      </div>
      <div style={{ marginTop: 22 }}><BlockTitle title="Horário de trabalho por consultor" help="Preencha início e fim de cada dia em que a pessoa trabalha. Deixe em branco os dias de folga. O horário serve para dizer quem está no expediente e quem está parado." /></div>
      <div className={c.scroll}>
        <table className={c.table} style={{ minWidth: 760 }}>
          <thead><tr><th>Consultor</th>{DAYS.map(([, d]) => <th key={d}>{d}</th>)}</tr></thead>
          <tbody>
            {consultants.map((b) => (
              <tr key={b.user.id} style={{ cursor: "default" }}>
                <td>{b.user.name}</td>
                {DAYS.map(([dow, d]) => (
                  <td key={dow}>
                    <input aria-label={`${b.user.name} ${d} início`} type="time" className={c.input} style={{ width: 92 }} value={slot(b.user.id, dow).start} onChange={(e) => setSlot(b.user.id, dow, "start", e.target.value)} />
                    <input aria-label={`${b.user.name} ${d} fim`} type="time" className={c.input} style={{ width: 92, marginTop: 4 }} value={slot(b.user.id, dow).end} onChange={(e) => setSlot(b.user.id, dow, "end", e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className={c.btnPrimary} disabled={saving} onClick={save}>{saving ? "Salvando…" : "Salvar configuração"}</button>
        <a className={c.btn} href="/crm/metas" onClick={(e) => { e.preventDefault(); window.location.assign("/crm/metas"); }} style={{ textDecoration: "none", color: "inherit" }}>Gerenciar metas de matrícula</a>
      </div>
    </div>
  );
};

const Detail = ({ userId, period, defs, onClose }) => {
  const c = useKit();
  const history = useHistory();
  const { data } = useAnalytics(`/analytics/consultant/${userId}`, period);
  if (!data) return <div className={c.panel}><div className={c.sub}>Carregando…</div></div>;
  const m = data.metrics;
  return (
    <div className={c.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 className={c.h2}><PresenceDot state={data.presence.state} />{data.user.name}</h2>
        <button type="button" className={c.btn} onClick={onClose}>Fechar</button>
      </div>
      <div className={c.sub}>{PRESENCE[data.presence.state].label}{data.presence.scheduleToday.length ? ` · hoje ${data.presence.scheduleToday.map((s) => `${s.start}–${s.end}`).join(", ")}` : " · sem horário cadastrado para hoje"}</div>
      <div className={c.grid} style={{ marginTop: 14 }}>
        {["messagesSent", "attendances", "leadsWorked", "enrollments", "conversion", "pendingReply", "proposalsSent", "tasksOverdue"].map((k) => <Kpi key={k} k={k} value={m[k]} def={defs[k]} />)}
      </div>
      <div style={{ marginTop: 18 }}><BlockTitle title="Evolução" help="Mensagens, atendimentos e matrículas de cada dia do período escolhido." /></div>
      <HistoryChart series={data.series} />
      {data.goals.length > 0 && (
        <>
          <div style={{ marginTop: 14 }}><BlockTitle icon={<Target size={15} />} title="Metas" help="Matrículas feitas e a meta da pessoa nas metas ativas (Metas no menu)." /></div>
          {data.goals.map((g) => (
            <div key={g.id} style={{ margin: "8px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>{g.title}</span><b>{num(g.mine.done)} / {num(g.mine.target)}</b></div>
              <Progress value={g.mine.done} max={g.mine.target || 0} />
            </div>
          ))}
        </>
      )}
      {data.focus.tasks.length > 0 && (
        <>
          <div style={{ marginTop: 14 }}><BlockTitle title="Tarefas que pedem atenção" help="As tarefas que vencem hoje ou já venceram. Clique para abrir o lead." /></div>
          {data.focus.tasks.slice(0, 4).map((t) => (
            <button key={t.id} type="button" className={c.row} onClick={() => history.push(t.link)}><span style={{ flex: 1 }}>{t.title}{t.leadName ? ` · ${t.leadName}` : ""}</span><b style={{ color: t.overdue ? "#dc2626" : undefined }}>{t.overdue ? "atrasada" : "hoje"}</b></button>
          ))}
        </>
      )}
    </div>
  );
};

const TOOLS = [
  { to: "/crm/tarefas", label: "Tarefas de acompanhamento", text: "O que cada pessoa precisa fazer hoje e o que está atrasado.", icon: ListTodo, color: "#0693E3" },
  { to: "/crm/retencao", label: "Retenção", text: "Alunos em risco de sair e o contato para segurá-los.", icon: HeartPulse, color: "#dc2626", needs: "retention" },
  { to: "/ambientacao", label: "Ambientação", text: "Acompanhe os alunos novos nos primeiros dias de curso.", icon: MonitorCheck, color: "#0d9488" },
  { to: "/schedules", label: "Agendamentos", text: "Mensagens programadas para sair no dia e hora certos.", icon: CalendarClock, color: "#7c3aed" },
  { to: "/campaigns", label: "Campanhas", text: "Envios em massa para listas de contatos.", icon: Megaphone, color: "#ea580c" },
  { to: "/reports", label: "Estatísticas", text: "Os números individuais de cada consultor e o progresso dos polos.", icon: BarChart3, color: "#16a34a" },
];

const Tools = () => {
  const history = useHistory();
  const { user } = useContext(AuthContext);
  return (
    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
      {TOOLS.filter((t) => t.needs !== "retention" || canOperateRetention(user)).map((t) => {
        const Icon = t.icon;
        return (
          <button key={t.to} type="button" onClick={() => history.push(t.to)} style={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", padding: 18, borderRadius: 14, border: "1px solid rgba(127,140,160,.22)", background: "transparent", display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: tint(t.color, 0.16), color: t.color }}><Icon size={20} /></span>
            <b style={{ fontSize: 15.5 }}>{t.label}</b>
            <span style={{ fontSize: 13, opacity: 0.75 }}>{t.text}</span>
          </button>
        );
      })}
    </div>
  );
};

const CommercialCenter = () => {
  const c = useKit();
  const history = useHistory();
  const defs = useDefinitions();
  const [period, setPeriod] = useState({ range: "today", from: "", to: "" });
  const [tab, setTab] = useState("geral");
  const [selected, setSelected] = useState(null);
  const [config, setConfig] = useState(null);
  const params = useMemo(() => periodParams(period), [period]);
  const ready = period.range !== "custom" || (period.from && period.to);
  const { data, loading } = useAnalytics("/analytics/team", params, !!ready);
  useEffect(() => { if (data) setConfig(data.config); }, [data]);

  const exportCsv = async () => {
    try {
      const { data: csv } = await api.get("/analytics/team/export.csv", { params, responseType: "blob" });
      const url = URL.createObjectURL(csv);
      const a = document.createElement("a");
      a.href = url; a.download = `gestao-comercial-${period.range}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toastError(err); }
  };

  const ranked = useMemo(() => (data ? [...data.consultants].sort((a, b) => b.metrics.enrollments - a.metrics.enrollments || b.metrics.messagesSent - a.metrics.messagesSent) : []), [data]);
  const presence = data ? data.consultants.reduce((acc, b) => ({ ...acc, [b.presence.state]: (acc[b.presence.state] || 0) + 1 }), {}) : {};

  return (
    <div className={c.page}>
      <div className={c.head}>
        <div>
          <h1 className={c.h1}>Centro de Gestão Comercial</h1>
          <div className={c.lead}>Produtividade, presença e resultados dos consultores sob sua gestão. Os números são os mesmos que cada consultor vê em Estatísticas.</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <PeriodPicker value={period} onChange={setPeriod} />
          <button type="button" className={c.btn} onClick={exportCsv}><Download size={14} style={{ verticalAlign: -2 }} /> Exportar</button>
        </div>
      </div>

      <div className={c.chips} role="tablist" style={{ marginBottom: 18 }}>
        {[["geral", "Visão geral"], ["consultores", "Consultores"], ["polos", "Polos"], ["ferramentas", "Ferramentas"], ["config", "Configuração"]].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`${c.chip} ${tab === k ? c.chipOn : ""}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      <div className={c.sub} style={{ margin: "-6px 0 16px" }}>{TAB_HELP[tab]}</div>
      {loading && !data && <div className={c.sub}>Carregando…</div>}
      {data && tab === "geral" && (
        <div style={{ display: "grid", gap: 16 }}>
          <div className={c.grid}>
            {["messagesSent", "attendances", "leadsWorked", "reactivated", "pendingReply", "enrollments", "conversion", "tasksOverdue"].map((k) => <Kpi key={k} k={k} value={data.totals[k]} def={defs[k]} tone={k === "tasksOverdue" && data.totals[k] > 0 ? "#dc2626" : undefined} />)}
          </div>
          <div className={c.cols}>
            <div className={c.panel}>
              <BlockTitle icon={<Users size={16} />} title="Presença agora" help="Quem está trabalhando neste momento. Cruza a atividade real (mensagens, leads, tarefas dos últimos minutos) com o horário de trabalho configurado. Ativo = fez algo há pouco; No horário, sem atividade = deveria estar trabalhando e não fez nada; Fora do horário = fora do expediente." />
              <div style={{ marginTop: 10 }}>
                {Object.keys(PRESENCE).map((k) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 14 }}><span><PresenceDot state={k} />{PRESENCE[k].label}</span><b>{presence[k] || 0}</b></div>
                ))}
              </div>
            </div>
            <div className={c.panel}>
              <BlockTitle icon={<AlertTriangle size={16} />} title="Alertas e oportunidades" help="O que pede atenção agora: tarefas atrasadas, conversas esperando resposta, gente parada no horário de trabalho e leads sem matrícula. Clique para ver o detalhe: as tarefas abrem já filtradas na pessoa." />
              <div style={{ marginTop: 8 }}>
                {data.alerts.length === 0 && <div className={c.sub}>Nada pedindo atenção agora.</div>}
                {data.alerts.slice(0, 8).map((a, i) => (
                  <button key={`${a.userId}-${a.code}-${i}`} type="button" className={c.row} onClick={() => { if (a.code === "idle_on_schedule" || a.code.startsWith("below")) { setSelected(a.userId); setTab("consultores"); } else history.push(alertLink(a)); }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: LEVEL[a.level], flex: "none" }} />
                    <span style={{ flex: 1 }}><b>{a.name}</b> · {a.text}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={c.panel}>
            <BlockTitle icon={<Gauge size={16} />} title="Produção por consultor" help="Barras com mensagens enviadas, atendimentos e matrículas de cada consultor no período. Passe o mouse para ver os números." />
            <CompareBars data={ranked.map((b) => ({ name: b.user.name.split(" ")[0], messagesSent: b.metrics.messagesSent, attendances: b.metrics.attendances, enrollments: b.metrics.enrollments }))} keys={[["messagesSent", "Mensagens", BRAND.cerulean], ["attendances", "Atendimentos", BRAND.blue], ["enrollments", "Matrículas", "#16a34a"]]} />
          </div>
        </div>
      )}

      {data && tab === "consultores" && (
        <div className={c.cols} style={{ gridTemplateColumns: selected ? "minmax(0,1.4fr) minmax(0,1fr)" : "1fr" }}>
          <div className={c.panel}>
            <BlockTitle title="Consultores lado a lado" help="Mensagens: enviadas por pessoas. Atend.: conversas diferentes atendidas. Leads: leads trabalhados. Reativ.: contatos retomados após 7 dias parados. Pendentes: conversas esperando resposta. Conv.: matrículas ÷ leads trabalhados. Atrasadas: tarefas vencidas. Passe o mouse no título da coluna para ler a definição completa." />
            <div className={c.scroll}>
              <table className={c.table} style={{ minWidth: 820 }}>
                <thead><tr><th>Consultor</th><th>Presença</th>{COLS.map(([k, l]) => <th key={k} className="r" title={defs[k] && defs[k].description}>{l}</th>)}</tr></thead>
                <tbody>
                  {ranked.map((b) => (
                    <tr key={b.user.id} onClick={() => setSelected(b.user.id)} style={selected === b.user.id ? { background: "rgba(6,147,227,.1)" } : undefined}>
                      <td><b>{b.user.name}</b></td>
                      <td><PresenceDot state={b.presence.state} />{PRESENCE[b.presence.state].label}</td>
                      {COLS.map(([k]) => <td key={k} className="r" style={k === "tasksOverdue" && b.metrics[k] > 0 ? { color: "#dc2626", fontWeight: 700 } : undefined}>{fmt(b.metrics[k], k === "conversion" ? "percent" : "count")}</td>)}
                    </tr>
                  ))}
                  <tr style={{ cursor: "default", fontWeight: 700 }}><td>Total</td><td />{COLS.map(([k]) => <td key={k} className="r">{fmt(data.totals[k], k === "conversion" ? "percent" : "count")}</td>)}</tr>
                </tbody>
              </table>
            </div>
          </div>
          {selected && <Detail userId={selected} period={params} defs={defs} onClose={() => setSelected(null)} />}
        </div>
      )}

      {data && tab === "polos" && (
        <div style={{ display: "grid", gap: 16 }}>
          {data.polos.length === 0 && <div className={c.panel}><div className={c.sub}>Nenhum consultor vinculado a polo ainda. Vincule os consultores aos polos em Configurações.</div></div>}
          {data.polos.length > 0 && (
            <>
              <div className={c.panel}>
                <BlockTitle title="Comparação entre polos" help="Os números dos consultores de cada polo, somados. Um consultor entra no polo em que está cadastrado como membro." />
                <CompareBars data={data.polos.map((p) => ({ name: p.name, messagesSent: p.totals.messagesSent, leadsWorked: p.totals.leadsWorked, enrollments: p.totals.enrollments }))} keys={[["messagesSent", "Mensagens", BRAND.cerulean], ["leadsWorked", "Leads trabalhados", BRAND.blue], ["enrollments", "Matrículas", "#16a34a"]]} />
              </div>
              <div className={c.panel + " " + c.scroll}>
                <table className={c.table} style={{ minWidth: 640 }}>
                  <thead><tr><th>Polo</th><th className="r">Consultores</th><th className="r">Mensagens</th><th className="r">Leads</th><th className="r">Matrículas</th><th className="r">Conversão</th></tr></thead>
                  <tbody>{data.polos.map((p) => <tr key={p.poloId} style={{ cursor: "default" }}><td><b>{p.name}</b></td><td className="r">{p.consultants}</td><td className="r">{num(p.totals.messagesSent)}</td><td className="r">{num(p.totals.leadsWorked)}</td><td className="r">{num(p.totals.enrollments)}</td><td className="r">{fmt(p.totals.conversion, "percent")}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "ferramentas" && <Tools />}
      {data && tab === "config" && config && <ConfigPanel config={config} consultants={data.consultants} onSaved={setConfig} />}
    </div>
  );
};

export default CommercialCenter;
