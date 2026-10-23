import React, { useContext, useEffect, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { AlertTriangle, Wifi, WifiOff, BarChart3, CalendarClock, Download, Gauge, HeartPulse, ListTodo, Megaphone, MonitorCheck, Settings2, Target, Users } from "lucide-react";

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
// only the overdue tasks have a screen filtered on the person; every other alert opens that person's detail here (the generic links were MY inbox / MY panel)
const alertLink = (a) => `/crm/tarefas?scope=all&status=overdue&userId=${a.userId}`;

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
      <div className={c.grid4} style={{ marginTop: 14 }}>
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


const WA = {
  connected: { label: "WhatsApp conectado", color: "#16a34a" },
  offline: { label: "WhatsApp desconectado", color: "#dc2626" },
  none: { label: "Não conectou o WhatsApp", color: "#dc2626" },
};
const initials = (name) => String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
const since = (iso) => {
  if (!iso) return "";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return min < 1 ? "agora" : min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.floor(min / 60)} h` : `há ${Math.floor(min / 1440)} d`;
};

// "Equipe agora": who is online right now, when each one last used the system, the schedule of today and whether the WhatsApp works.
// The people that need attention come first (no number, then idle in working hours, then online, then the rest).
const dayTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  const hm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return same ? `hoje ${hm}` : `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hm}`;
};

const Team = ({ consultants, onOpen }) => {
  const c = useKit();
  const rank = (b) => (b.presence.whatsapp.state !== "connected" ? 0 : b.presence.state === "idle" ? 1 : b.presence.online ? 2 : 3);
  const list = [...consultants].sort((a, b) => rank(a) - rank(b) || a.user.name.localeCompare(b.user.name));
  const online = consultants.filter((b) => b.presence.online).length;
  const noNumber = consultants.filter((b) => b.presence.whatsapp.state !== "connected").length;
  return (
    <div className={c.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <BlockTitle icon={<Users size={16} />} title="Equipe agora" />
        <span className={c.sub}><b style={{ color: "#16a34a" }}>{online}</b> online · <b style={{ color: noNumber ? "#dc2626" : undefined }}>{noNumber}</b> sem WhatsApp</span>
      </div>
      {list.length === 0 && <div className={c.sub}>Nenhum consultor cadastrado.</div>}
      {list.map((b) => {
        const p = b.presence;
        const wa = WA[p.whatsapp.state];
        const down = p.whatsapp.state !== "connected";
        const slots = p.scheduleToday.length ? p.scheduleToday.map((s) => `${s.start}–${s.end}`).join(", ") : "";
        return (
          <button key={b.user.id} type="button" onClick={() => onOpen(b.user.id)} className={c.row} style={{ padding: "12px 0", alignItems: "flex-start" }}>
            <span style={{ position: "relative", width: 38, height: 38, flex: "none" }}>
              <span style={{ width: 38, height: 38, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, background: "rgba(11,66,121,.1)", color: BRAND.blue }}>{initials(b.user.name)}</span>
              <span title={p.online ? "Online agora" : "Offline"} style={{ position: "absolute", right: -1, bottom: -1, width: 11, height: 11, borderRadius: "50%", background: p.online ? "#16a34a" : "#94a3b8", border: "2px solid #fff" }} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.user.name}</b>
              <span className={c.sub} style={{ display: "block", marginTop: 0 }}>
                {p.online ? <b style={{ color: "#16a34a" }}>Online agora</b> : p.lastSeenAt ? `Acessou ${dayTime(p.lastSeenAt)}` : "Nunca acessou"}
                {p.lastActivityAt ? ` · última ação ${since(p.lastActivityAt)}` : ""}
              </span>
              <span className={c.sub} style={{ display: "block", marginTop: 0 }}>
                {slots ? `Hoje ${slots}${p.onSchedule ? " · no horário" : " · fora do horário"}` : "Sem horário cadastrado para hoje"}
              </span>
            </span>
            <span title={wa.label} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: wa.color, flex: "none", paddingTop: 2 }}>
              {down ? <WifiOff size={14} /> : <Wifi size={14} />}{down ? (p.whatsapp.state === "none" ? "Sem número" : "Desconectado") : "Conectado"}
            </span>
          </button>
        );
      })}
    </div>
  );
};

// production per consultant: one block with three bars each (the longest bar of each kind is the reference), ranked by enrollments
const Production = ({ ranked }) => {
  const c = useKit();
  const kinds = [["messagesSent", "Mensagens", BRAND.cerulean], ["attendances", "Atendimentos", BRAND.blue], ["enrollments", "Matrículas", "#16a34a"]];
  const max = Object.fromEntries(kinds.map(([k]) => [k, Math.max(1, ...ranked.map((b) => b.metrics[k] || 0))]));
  const any = ranked.some((b) => kinds.some(([k]) => b.metrics[k] > 0));
  return (
    <div className={c.panel}>
      <BlockTitle icon={<Gauge size={16} />} title="Produção por consultor" />
      {!any && <div className={c.sub} style={{ padding: "18px 0" }}>Ainda sem produção neste período. Quando alguém enviar mensagens, atender conversas ou matricular, as barras aparecem aqui.</div>}
      {any && ranked.map((b) => (
        <div key={b.user.id} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 170px) 1fr", gap: 12, alignItems: "center", padding: "10px 0", borderTop: `1px solid rgba(127,140,160,.25)` }}>
          <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.user.name}</b>
          <div style={{ display: "grid", gap: 5 }}>
            {kinds.map(([k, label, color]) => (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "88px 1fr 34px", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span className={c.sub} style={{ marginTop: 0 }}>{label}</span>
                <Progress value={b.metrics[k] || 0} max={max[k]} color={color} />
                <b style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{num(b.metrics[k])}</b>
              </div>
            ))}
          </div>
        </div>
      ))}
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

  return (
    <div className={c.page}>
      <div style={{ background: BRAND.blue, color: "#fff", borderRadius: 18, padding: "20px 24px 0", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 className={c.h1} style={{ color: "#fff" }}>Gestão Comercial</h1>
            <div style={{ fontSize: 13.5, opacity: 0.8, marginTop: 4 }}>{TAB_HELP[tab]}</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <PeriodPicker value={period} onChange={setPeriod} />
            <button type="button" onClick={exportCsv} style={{ border: "1px solid rgba(255,255,255,.4)", background: "transparent", color: "#fff", borderRadius: 10, padding: "7px 14px", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}><Download size={14} style={{ verticalAlign: -2 }} /> Exportar</button>
          </div>
        </div>
        <div role="tablist" style={{ display: "flex", gap: 4, marginTop: 14, overflowX: "auto" }}>
          {[["geral", "Visão geral"], ["consultores", "Consultores"], ["polos", "Polos"], ["ferramentas", "Ferramentas"], ["config", "Configuração"]].map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{ border: 0, background: "transparent", color: "#fff", opacity: tab === k ? 1 : 0.7, fontFamily: "inherit", fontSize: 14, fontWeight: 600, padding: "10px 16px", cursor: "pointer", borderBottom: `3px solid ${tab === k ? BRAND.gorse : "transparent"}`, whiteSpace: "nowrap" }}>{label}</button>
          ))}
        </div>
      </div>

      {loading && !data && <div className={c.sub}>Carregando…</div>}
      {data && tab === "geral" && (
        <div style={{ display: "grid", gap: 16 }}>
          <div className={c.grid4}>
            {["messagesSent", "attendances", "leadsWorked", "reactivated", "pendingReply", "enrollments", "conversion", "tasksOverdue"].map((k) => <Kpi key={k} k={k} value={data.totals[k]} def={defs[k]} tone={k === "tasksOverdue" && data.totals[k] > 0 ? "#dc2626" : undefined} />)}
          </div>
          <div className={c.cols}>
            <Team consultants={data.consultants} onOpen={(id) => { setSelected(id); setTab("consultores"); }} />
            <div className={c.panel}>
              <BlockTitle icon={<AlertTriangle size={16} />} title="Alertas e oportunidades" help="Calculados agora com os dados reais de cada consultor." />
              <div style={{ marginTop: 8 }}>
                {data.alerts.length === 0 && <div className={c.sub}>Nada pedindo atenção agora.</div>}
                {data.alerts.slice(0, 8).map((a, i) => (
                  <button key={`${a.userId}-${a.code}-${i}`} type="button" className={c.row} onClick={() => { if (a.code === "tasks_overdue") history.push(alertLink(a)); else if (a.code === "whatsapp_offline") history.push("/connections"); else { setSelected(a.userId); setTab("consultores"); } }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: LEVEL[a.level], flex: "none" }} />
                    <span style={{ flex: 1 }}><b>{a.name}</b> · {a.text}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <Production ranked={ranked} />
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
