import React, { useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { AlertTriangle, Wifi, WifiOff, Settings2, Target, Users, X } from "lucide-react";

import Tooltip from "@material-ui/core/Tooltip";
import Drawer from "@material-ui/core/Drawer";
import Button from "@material-ui/core/Button";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import NumberTicker from "../../components/NumberTicker";
import { BRAND, BlockTitle, CompareBars, HistoryChart, Kpi, PRESENCE, Progress, num, useAnalytics, useKit } from "../../components/analytics/kit";
import { ManagementFeedback } from "../Reports/Management";

const DAYS = [["1", "Seg"], ["2", "Ter"], ["3", "Qua"], ["4", "Qui"], ["5", "Sex"], ["6", "Sáb"], ["0", "Dom"]];
const LEVEL = { high: "#dc2626", medium: "#d97706", low: "#0693E3" };
const dateInPoloTime = (date) => date.toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });

const supervisorPeriod = (period) => {
  const today = dateInPoloTime(new Date());
  const date = period.range === "custom" ? period.to : today;
  if (period.range === "today") return { date: today, days: 1 };
  if (period.range === "week") return { date: today, days: 7 };
  if (period.range === "month") return { date: today, days: Number(today.slice(-2)) };
  if (period.range === "custom" && period.from && period.to) {
    const from = Date.parse(`${period.from}T00:00:00Z`);
    const to = Date.parse(`${period.to}T00:00:00Z`);
    const days = Math.floor((to - from) / 86400000) + 1;
    if (days >= 1 && days <= 31) return { date, days };
    return { date, days: 1, unavailableMessage: "Para gerar o feedback, selecione um período de até 31 dias e confira as datas." };
  }
  if (period.range === "custom") return { date: today, days: 1, unavailableMessage: "Informe as datas inicial e final para gerar o feedback." };
  return { date: today, days: 1 };
};


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
        <label className={c.sub}>Meta diária de mensagens enviadas (opcional). Gera alerta quando a pessoa está no horário e abaixo da meta (0 = sem meta). Prefira a meta de conversas.
          <input type="number" min={0} className={c.input} style={{ width: "100%", marginTop: 4 }} value={form.dailyMessagesTarget} onChange={(e) => setForm({ ...form, dailyMessagesTarget: e.target.value })} />
        </label>
        <label className={c.sub}>Meta diária de conversas atendidas (cada conversa conta uma vez). Aparece na tela do consultor e gera alerta quando ele está no horário e abaixo da meta (0 = sem meta).
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

const Stat = ({ label, value, tone }) => (
  <div style={{ display: "grid", gap: 2 }}>
    <span style={{ fontSize: 11.5, opacity: 0.75 }}>{label}</span>
    <b style={{ fontSize: 14, color: tone }}>{value}</b>
  </div>
);

// the detail of one person opens in a wide panel on the side, over the list: who they are, how they are right now and what they did in the period
const Detail = ({ userId, period, defs, onClose }) => {
  const c = useKit();
  const history = useHistory();
  const { data } = useAnalytics(`/analytics/consultant/${userId}`, period);
  const body = (() => {
    if (!data) return <div style={{ display: "grid", gap: 14 }}>{[0, 1, 2].map((i) => <div key={i} className="ui-skeleton" style={{ height: i === 0 ? 120 : 90, borderRadius: 16 }} />)}</div>;
    const m = data.metrics;
    const p = data.presence;
    const wa = (WA[p.whatsapp.state] || WA.none);
    const down = p.whatsapp.state !== "connected";
    const slots = p.scheduleToday.length ? p.scheduleToday.map((s) => `${s.start}–${s.end}`).join(", ") : "";
    const firstHint = m.firstContactSamples ? `${m.firstContactSamples} ${m.firstContactSamples === 1 ? "lead atendido por ele" : "leads atendidos por ele"}` : down ? "Sem WhatsApp conectado" : "Nenhum lead contatado por ele no período";
    return (
      <div style={{ display: "grid", gap: 18 }}>
        <div className="ui-card" style={{ padding: 18, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ position: "relative", width: 56, height: 56, flex: "none" }}>
              <span style={{ width: 56, height: 56, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 19, fontWeight: 800, background: BRAND.blue, color: "#fff" }}>{initials(data.user.name)}</span>
              <span style={{ position: "absolute", right: 0, bottom: 0, width: 15, height: 15, borderRadius: "50%", background: p.online ? "#16a34a" : "#94a3b8", border: "3px solid var(--ui-surface, #fff)" }} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>{data.user.name}</h2>
              <div className={c.sub}>{(PRESENCE[p.state] || PRESENCE.off).label}</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, paddingTop: 14, borderTop: "1px solid var(--ui-border, rgba(127,140,160,.25))" }}>
            <Stat label="Acesso" value={p.online ? "Online agora" : p.lastSeenAt ? `Acessou ${dayTime(p.lastSeenAt)}` : "Sem registro ainda"} tone={p.online ? "#16a34a" : undefined} />
            <Stat label="Última ação" value={p.lastActivityAt ? `${since(p.lastActivityAt)} (${dayTime(p.lastActivityAt)})` : "Nenhuma no período"} />
            <Stat label="Horário de hoje" value={slots ? `${slots}${p.onSchedule ? " · no horário" : " · fora do horário"}` : "Não cadastrado"} />
            <Stat label="WhatsApp" value={down ? (p.whatsapp.state === "none" ? "Não conectou" : "Desconectado") : `Conectado${p.whatsapp.name ? ` · ${p.whatsapp.name}` : ""}`} tone={wa.color} />
          </div>
        </div>
        <div>
          <BlockTitle title="Números do período" help="Os mesmos números da tela pessoal da pessoa. Passe o mouse em cada cartão para ler o que ele conta." />
          <div className={c.grid4} style={{ marginTop: 10 }}>
            {["attendances", "peopleContacted", "leadsWorked", "firstContactMinutes", "enrollments", "conversion", "pendingReply", "tasksOverdue"].map((k) => <Kpi key={k} k={k} value={m[k]} def={defs[k]} hint={k === "firstContactMinutes" ? firstHint : undefined} tone={k === "tasksOverdue" && m[k] > 0 ? "#dc2626" : undefined} />)}
          </div>
        </div>
        <div className="ui-card" style={{ padding: 18 }}>
          <BlockTitle title="Evolução" help="Mensagens, atendimentos e matrículas de cada dia do período escolhido." />
          <HistoryChart series={data.series} height={220} />
        </div>
        {data.goals.length > 0 && (
          <div className="ui-card" style={{ padding: 18 }}>
            <BlockTitle icon={<Target size={15} />} title="Metas" help="Matrículas feitas e a meta da pessoa nas metas ativas (Metas no menu)." />
            {data.goals.map((g) => (
              <div key={g.id} style={{ margin: "10px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>{g.title}</span><b>{num(g.mine.done)} / {num(g.mine.target)}</b></div>
                <Progress value={g.mine.done} max={g.mine.target || 0} />
              </div>
            ))}
          </div>
        )}
        <div className="ui-card" style={{ padding: 18 }}>
          <BlockTitle title="Tarefas da pessoa" help="As tarefas dela que vencem hoje ou já venceram: só leads que ela atende. Clique para abrir o lead." />
          {data.focus.tasks.length === 0 && <div className={c.sub} style={{ padding: "10px 0" }}>Nenhuma tarefa vencendo hoje nem atrasada.</div>}
          {data.focus.tasks.slice(0, 6).map((t) => (
            <button key={t.id} type="button" className={c.row} onClick={() => history.push(t.link)}><span style={{ flex: 1 }}>{t.title}{t.leadName ? ` · ${t.leadName}` : ""}</span><b style={{ color: t.overdue ? "#dc2626" : undefined }}>{t.overdue ? "atrasada" : "hoje"}</b></button>
          ))}
          {m.tasksOverdue > 0 && <Button size="small" style={{ marginTop: 6 }} onClick={() => history.push(`/crm/tarefas?scope=all&status=overdue&userId=${userId}`)}>Ver as {m.tasksOverdue} atrasadas</Button>}
        </div>
      </div>
    );
  })();
  return (
    <Drawer anchor="right" open onClose={onClose} PaperProps={{ style: { width: "min(820px, 100vw)", background: "var(--surface-2)" } }}>
      <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 2, background: BRAND.blue, color: "#fff" }}>
        <b style={{ fontSize: 15 }}>Detalhes do consultor</b>
        <button type="button" aria-label="Fechar" onClick={onClose} style={{ border: 0, background: "rgba(255,255,255,.14)", color: "#fff", borderRadius: 10, width: 34, height: 34, cursor: "pointer", display: "grid", placeItems: "center" }}><X size={18} /></button>
      </div>
      <div style={{ padding: 20 }}>{body}</div>
    </Drawer>
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
        const wa = (WA[p.whatsapp.state] || WA.none);
        const down = p.whatsapp.state !== "connected";
        const slots = p.scheduleToday.length ? p.scheduleToday.map((s) => `${s.start}–${s.end}`).join(", ") : "";
        return (
          <button key={b.user.id} type="button" onClick={() => onOpen(b.user.id)} className={c.row} style={{ padding: "12px 0", alignItems: "flex-start" }}>
            <span style={{ position: "relative", width: 38, height: 38, flex: "none" }}>
              <span style={{ width: 38, height: 38, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, background: "color-mix(in srgb, var(--c-brand) 14%, transparent)", color: "var(--c-brand)" }}>{initials(b.user.name)}</span>
              <span title={p.online ? "Online agora" : "Offline"} style={{ position: "absolute", right: -1, bottom: -1, width: 11, height: 11, borderRadius: "50%", background: p.online ? "#16a34a" : "#94a3b8", border: "2px solid var(--surface)" }} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.user.name}</b>
              <span className={c.sub} style={{ display: "block", marginTop: 0 }}>
                {p.online ? <b style={{ color: "#16a34a" }}>Online agora</b> : p.lastSeenAt ? `Acessou ${dayTime(p.lastSeenAt)}` : p.lastActivityAt ? `Última atividade ${dayTime(p.lastActivityAt)}` : "Sem registro de acesso ainda"}
                {p.lastActivityAt && (p.online || p.lastSeenAt) ? ` · última ação ${since(p.lastActivityAt)}` : ""}
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

// What needs attention, ONE LINE PER PERSON: the worst problem first (a number that is down explains the rest), the other facts as small chips.
// Everything explains itself at once when the pointer touches it.
const WHY = {
  whatsapp_none: "A pessoa nunca conectou um WhatsApp: não recebe nem envia mensagens. As conversas e tarefas dela ficam paradas.",
  whatsapp_offline: "O WhatsApp da pessoa está desconectado: as mensagens dos clientes não chegam até ele ser reconectado.",
  tasks_overdue: "Tarefas de acompanhamento cujo prazo já passou. Clique para ver quais são.",
  pending_reply: "Conversas abertas em que o cliente foi o último a falar e ainda espera resposta.",
  idle_on_schedule: "No horário de trabalho, sem enviar mensagem, mexer em lead ou concluir tarefa há um tempo.",
  below_messages_target: "Mensagens enviadas hoje abaixo da meta diária, dentro do horário de trabalho.",
  below_attendances_target: "Conversas atendidas hoje abaixo da meta diária, dentro do horário de trabalho.",
  training_needed: "A revisão diária das conversas encontrou o mesmo ponto se repetindo. Veja a aba Treinamento.",
  followups_due: "Leads com o próximo contato marcado para hoje ou antes.",
  no_conversion: "Leads trabalhados no período sem nenhuma matrícula confirmada.",
};
const RANK = { high: 0, medium: 1, low: 2 };

const Alerts = ({ alerts, onOpen, history }) => {
  const c = useKit();
  const people = [];
  alerts.forEach((a) => {
    let g = people.find((x) => x.userId === a.userId);
    if (!g) { g = { userId: a.userId, name: a.name, items: [] }; people.push(g); }
    g.items.push(a);
  });
  people.forEach((g) => g.items.sort((x, y) => RANK[x.level] - RANK[y.level]));
  people.sort((x, y) => RANK[x.items[0].level] - RANK[y.items[0].level] || y.items.length - x.items.length);
  const open = (a) => {
    if (a.code === "tasks_overdue") history.push(`/crm/tarefas?scope=all&status=overdue&userId=${a.userId}`);
    else if (a.code === "whatsapp_offline") history.push("/connections");
    else onOpen(a.userId);
  };
  return (
    <div className={c.panel}>
      <BlockTitle icon={<AlertTriangle size={16} />} title="Alertas e oportunidades" help="Uma linha por pessoa, com o problema mais grave primeiro." />
      <div style={{ marginTop: 8 }}>
        {people.length === 0 && <div className={c.sub} style={{ padding: "14px 0" }}>Nada pedindo atenção agora. Tudo em dia.</div>}
        {people.slice(0, 6).map((g) => {
          const [head, ...rest] = g.items;
          return (
            <div key={g.userId} style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: `1px solid rgba(127,140,160,.22)`, alignItems: "flex-start" }}>
              <span style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: LEVEL[head.level], flex: "none" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</b>
                  <button type="button" className={c.btn} style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => onOpen(g.userId)}>Ver detalhe</button>
                </div>
                <Tooltip title={WHY[head.code] || ""} enterDelay={0} placement="top" arrow>
                  <button type="button" onClick={() => open(head)} style={{ display: "block", textAlign: "left", border: 0, background: "none", font: "inherit", color: "inherit", padding: 0, marginTop: 2, cursor: "pointer", lineHeight: 1.4 }}>{head.text}</button>
                </Tooltip>
                {rest.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {rest.map((a) => (
                      <Tooltip key={a.code} title={WHY[a.code] || ""} enterDelay={0} placement="top" arrow>
                        <button type="button" onClick={() => open(a)} style={{ border: 0, cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: `${LEVEL[a.level]}1f`, color: "inherit" }}>{a.text}</button>
                      </Tooltip>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// the polos of a person, as chips, and a small menu to link or unlink them right here (the person can be in more than one polo)
const Ring = ({ value }) => {
  const r = 26;
  const len = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <span className="dash-ring" style={{ "--ring-len": len }}>
      <svg viewBox="0 0 64 64"><circle className="bg" cx="32" cy="32" r={r} /><circle className="fg" cx="32" cy="32" r={r} style={{ strokeDashoffset: len * (1 - v / 100) }} /></svg>
      <b>{value === null || value === undefined ? "—" : `${Math.round(v)}%`}</b>
    </span>
  );
};

const PoloBoard = ({ data, polos, history, feedbackPeriod }) => {
  const c = useKit();
  const byId = new Map(data.polos.map((p) => [p.poloId, p]));
  // every polo of the system appears, with or without team
  const all = polos.map((p) => ({ poloId: p.id, name: p.name, city: p.city, state: p.state, consultants: (byId.get(p.id) || {}).consultants || 0, totals: (byId.get(p.id) || {}).totals || { attendances: 0, messagesSent: 0, leadsWorked: 0, enrollments: 0, conversion: null } }));
  data.polos.forEach((p) => { if (!all.some((x) => x.poloId === p.poloId)) all.push(p); });
  const ranked = [...all].sort((a, b) => (b.totals.enrollments || 0) - (a.totals.enrollments || 0) || (b.totals.attendances || 0) - (a.totals.attendances || 0));
  const withTeam = ranked.filter((p) => p.consultants > 0);
  const maxM = Math.max(1, ...withTeam.map((p) => p.totals.attendances || 0));
  const sum = (k) => withTeam.reduce((s, p) => s + Number(p.totals[k] || 0), 0);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <ManagementFeedback {...feedbackPeriod} />
      <div className={`${c.grid4} dash-stagger`}>
        {[["Polos com equipe", withTeam.length, "#22d3ee"], ["Consultores vinculados", withTeam.reduce((s, p) => s + p.consultants, 0), "#818cf8"], ["Conversas no período", sum("attendances"), "#0693e3"], ["Matrículas no período", sum("enrollments"), "#4ade80"]].map(([label, value, tone]) => (
          <div key={label} className={`${c.kpi} dash-card`} style={{ "--tone": tone }}>
            <div className={c.kpiLabel}><span>{label}</span></div>
            <div className={c.kpiValue}><NumberTicker value={value} format={(n) => num(n)} /></div>
          </div>
        ))}
      </div>

      {withTeam.length > 0 && (
        <div className={`${c.cols} `} style={{ gridTemplateColumns: "1fr" }}>
          <div className={`${c.panel} dash-card`}>
            <BlockTitle title="Conversas, leads e matrículas por polo" help="Os números dos consultores de cada polo, somados." />
            <CompareBars data={withTeam.slice(0, 8).map((p) => ({ name: p.name.split(" - ")[0].slice(0, 14), attendances: p.totals.attendances, leadsWorked: p.totals.leadsWorked, enrollments: p.totals.enrollments }))} keys={[["attendances", "Conversas", "#22d3ee"], ["leadsWorked", "Leads trabalhados", "#818cf8"], ["enrollments", "Matrículas", "#4ade80"]]} />
          </div>
        </div>
      )}

      <div className="dash-stagger" style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
        {ranked.map((p) => {
          const team = data.consultants.filter((b) => (b.user.poloIds || []).includes(p.poloId));
          return (
            <article key={p.poloId} className={`${c.panel} dash-card dash-polo`} style={{ opacity: p.consultants ? 1 : 0.8 }}>
              <div className="dash-polo-head">
                <Ring value={p.totals.conversion} />
                <div style={{ minWidth: 0 }}>
                  <b style={{ display: "block", fontSize: 16, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.name}>{p.name}</b>
                  <span className={c.sub}>{p.consultants ? `${p.consultants} ${p.consultants === 1 ? "consultor" : "consultores"} · conversão` : "Sem equipe ainda"}</span>
                </div>
              </div>
              {p.consultants > 0 ? (
                <>
                  <div className="dash-polo-stats">
                    <div><small>Conversas</small><b><NumberTicker value={p.totals.attendances || 0} format={(n) => num(n)} /></b></div>
                    <div><small>Leads</small><b><NumberTicker value={p.totals.leadsWorked || 0} format={(n) => num(n)} /></b></div>
                    <div><small>Matrículas</small><b><NumberTicker value={p.totals.enrollments || 0} format={(n) => num(n)} /></b></div>
                  </div>
                  <Progress value={p.totals.attendances || 0} max={maxM} color="var(--c-leads)" />
                  <div className="dash-team">{team.map((b) => <span key={b.user.id}><i>{(b.user.name || "?").charAt(0).toUpperCase()}</i>{b.user.name.split(" ")[0]}</span>)}</div>
                </>
              ) : (
                <button type="button" className={`${c.btn} dash-link`} onClick={() => history.push("/polos")}>Vincular consultores</button>
              )}
            </article>
          );
        })}
      </div>
      <div><button type="button" className={c.btn} onClick={() => history.push("/polos")}>Gerenciar polos e funções (tutoria, coordenação)</button></div>
    </div>
  );
};

// "Equipe agora" became part of Estatísticas: the pieces below are used by its tabs (Visão geral, Consultores, Polos e metas)
export { Team, Alerts, Detail, ConfigPanel, PoloBoard, supervisorPeriod };
