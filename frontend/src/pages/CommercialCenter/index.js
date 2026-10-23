import React, { useContext, useEffect, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as ChartTip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Wifi, WifiOff, BarChart3, CalendarClock, Check, ChevronDown, ChevronUp, Download, HeartPulse, ListTodo, Megaphone, MapPin, MonitorCheck, Plus, Search, Gauge, Settings2, Target, Users, X } from "lucide-react";

import Tooltip from "@material-ui/core/Tooltip";
import Drawer from "@material-ui/core/Drawer";
import Button from "@material-ui/core/Button";
import Popover from "@material-ui/core/Popover";
import { AuthContext } from "../../context/Auth/AuthContext";
import { onColor, tint } from "../../utils/color";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import NumberTicker from "../../components/NumberTicker";
import { BRAND, BlockTitle, CompareBars, HistoryChart, Kpi, PeriodPicker, PresenceDot, PRESENCE, Progress, fmt, num, periodParams, useAnalytics, useDefinitions, useKit } from "../../components/analytics/kit";

const DAYS = [["1", "Seg"], ["2", "Ter"], ["3", "Qua"], ["4", "Qui"], ["5", "Sex"], ["6", "Sáb"], ["0", "Dom"]];
const LEVEL = { high: "#dc2626", medium: "#d97706", low: "#0693E3" };
const TAB_HELP = {
  geral: "Resumo da equipe no período escolhido: totais, quem está trabalhando agora e o que precisa da sua atenção.",
  consultores: "Uma lista só: WhatsApp, polos e números de cada consultor. Vincule a polos aqui mesmo e clique no nome para ver a evolução, as metas e as tarefas.",
  polos: "Os números somados por polo e quem está em cada equipe. Para vincular alguém, use a aba Consultores.",
  config: "Defina horários de trabalho, metas diárias e a regra de inatividade. Vale para esta tela e para a de cada consultor.",
};
// where a click on an alert takes the manager (the task screen opens already filtered on that person)
// only the overdue tasks have a screen filtered on the person; every other alert opens that person's detail here (the generic links were MY inbox / MY panel)
const alertLink = (a) => `/crm/tarefas?scope=all&status=overdue&userId=${a.userId}`;

const COLS = [["messagesSent", "Mensagens"], ["attendances", "Atend."], ["leadsWorked", "Leads"], ["reactivated", "Reativ."], ["firstContactMinutes", "1º contato"], ["pendingReply", "Pendentes"], ["enrollments", "Matrículas"], ["conversion", "Conv."], ["tasksOverdue", "Atrasadas"]];

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
    const wa = WA[p.whatsapp.state];
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
              <div className={c.sub}>{PRESENCE[p.state].label}</div>
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
            {["messagesSent", "attendances", "leadsWorked", "firstContactMinutes", "enrollments", "conversion", "pendingReply", "tasksOverdue"].map((k) => <Kpi key={k} k={k} value={m[k]} def={defs[k]} hint={k === "firstContactMinutes" ? firstHint : undefined} tone={k === "tasksOverdue" && m[k] > 0 ? "#dc2626" : undefined} />)}
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
    <Drawer anchor="right" open onClose={onClose} PaperProps={{ style: { width: "min(820px, 100vw)", background: "var(--ui-bg, #f4f7fb)" } }}>
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
const PoloCell = ({ b, polos, onChanged }) => {
  const [anchor, setAnchor] = useState(null);
  const [busy, setBusy] = useState(null);
  // the screen answers at once (the check appears right away); the server confirms in the background and the choice goes back if it refuses
  const [ids, setIds] = useState(b.user.poloIds || []);
  useEffect(() => setIds(b.user.poloIds || []), [b.user.poloIds]);
  const mine = new Set(ids);
  const toggle = async (polo) => {
    const had = mine.has(polo.id);
    setIds((cur) => (had ? cur.filter((x) => x !== polo.id) : [...cur, polo.id]));
    setBusy(polo.id);
    try {
      if (had) await api.delete(`/polos/${polo.id}/members/${b.user.id}`);
      else await api.post(`/polos/${polo.id}/members/${b.user.id}`, { role: "comercial" });
      onChanged();
    } catch (err) {
      setIds((cur) => (had ? [...cur, polo.id] : cur.filter((x) => x !== polo.id)));
      toastError(err);
    }
    setBusy(null);
  };
  const chips = polos.filter((p) => mine.has(p.id));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 150 }} onClick={(e) => e.stopPropagation()}>
      {chips.map((p) => <span key={p.id} title={p.name} style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, fontWeight: 600, padding: "2px 9px", borderRadius: 999, background: "rgba(6,147,227,.12)", color: BRAND.blue }}>{p.name}</span>)}
      <button type="button" aria-label={`Vincular ${b.user.name} a polos`} onClick={(e) => setAnchor(e.currentTarget)} style={{ display: "inline-flex", alignItems: "center", gap: 3, border: "1px dashed rgba(127,140,160,.6)", background: "transparent", color: "inherit", borderRadius: 999, padding: "2px 9px", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: chips.length ? 0.7 : 1 }}>
        {chips.length ? <Plus size={12} /> : <><MapPin size={12} /> Vincular</>}
      </button>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "left" }} transformOrigin={{ vertical: "top", horizontal: "left" }}>
        <div style={{ padding: 8, minWidth: 240, maxHeight: 340, overflowY: "auto" }}>
          <div style={{ padding: "6px 10px", fontSize: 12, opacity: 0.7 }}>Polos de {b.user.name}</div>
          {polos.length === 0 && <div style={{ padding: "8px 10px", fontSize: 13 }}>Nenhum polo cadastrado ainda.</div>}
          {polos.map((p) => (
            <button key={p.id} type="button" disabled={busy === p.id} onClick={() => toggle(p)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, border: 0, background: "transparent", color: "inherit", padding: "8px 10px", borderRadius: 8, fontFamily: "inherit", fontSize: 14, textAlign: "left", cursor: "pointer" }}>
              <span style={{ width: 18, height: 18, borderRadius: 5, display: "grid", placeItems: "center", border: `2px solid ${mine.has(p.id) ? BRAND.cerulean : "rgba(127,140,160,.7)"}`, background: mine.has(p.id) ? BRAND.cerulean : "transparent", color: "#fff", flex: "none" }}>{mine.has(p.id) && <Check size={12} strokeWidth={3} />}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{p.name}{p.city ? <span style={{ opacity: 0.6 }}> · {p.city}{p.state ? `/${p.state}` : ""}</span> : null}</span>
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
};

const WaCell = ({ p }) => {
  const wa = WA[p.whatsapp.state];
  const down = p.whatsapp.state !== "connected";
  return (
    <span title={wa.label + (p.whatsapp.name ? ` · ${p.whatsapp.name}` : "")} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, color: wa.color, whiteSpace: "nowrap" }}>
      {down ? <WifiOff size={14} /> : <Wifi size={14} />}{down ? (p.whatsapp.state === "none" ? "Sem número" : "Desconectado") : "Conectado"}
    </span>
  );
};

const ConsultantsTable = ({ ranked, totals, polos, defs, selected, onSelect, onChanged }) => {
  const c = useKit();
  const [sort, setSort] = useState({ key: "enrollments", dir: -1 });
  const [q, setQ] = useState("");
  const [poloFilter, setPoloFilter] = useState("");
  const [waFilter, setWaFilter] = useState("");
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = ranked.filter((b) => (!term || b.user.name.toLowerCase().includes(term))
      && (!poloFilter || (poloFilter === "none" ? !(b.user.poloIds || []).length : (b.user.poloIds || []).includes(Number(poloFilter))))
      && (!waFilter || (waFilter === "down" ? b.presence.whatsapp.state !== "connected" : b.presence.whatsapp.state === "connected")));
    const val = (b) => (sort.key === "name" ? b.user.name.toLowerCase() : b.metrics[sort.key] === null || b.metrics[sort.key] === undefined ? -1 : b.metrics[sort.key]);
    return [...list].sort((a, b2) => (val(a) < val(b2) ? -1 : val(a) > val(b2) ? 1 : 0) * sort.dir);
  }, [ranked, q, poloFilter, waFilter, sort]);
  const head = (key, label, right) => (
    <th key={key} className={right ? "r" : undefined} title={defs[key] && defs[key].description} onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : key === "name" ? 1 : -1 }))} style={{ cursor: "pointer", whiteSpace: "nowrap" }}>
      {label}{sort.key === key ? (sort.dir === 1 ? <ChevronUp size={12} style={{ verticalAlign: -1, marginLeft: 3 }} /> : <ChevronDown size={12} style={{ verticalAlign: -1, marginLeft: 3 }} />) : null}
    </th>
  );
  const fmtOf = (k) => (k === "conversion" ? "percent" : k === "firstContactMinutes" ? "minutes" : "count");
  return (
    <div className={c.panel}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 10px", height: 34, borderRadius: 10, border: "1px solid rgba(127,140,160,.35)", minWidth: 200, flex: "1 1 200px", maxWidth: 320 }}>
          <Search size={15} style={{ opacity: 0.6 }} />
          <input aria-label="Buscar consultor" placeholder="Buscar consultor" value={q} onChange={(e) => setQ(e.target.value)} style={{ border: 0, outline: "none", background: "transparent", color: "inherit", font: "inherit", fontSize: 13.5, width: "100%" }} />
        </label>
        <select aria-label="Filtrar por polo" className={c.input} value={poloFilter} onChange={(e) => setPoloFilter(e.target.value)} style={{ height: 34 }}>
          <option value="">Todos os polos</option>
          <option value="none">Sem polo</option>
          {polos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select aria-label="Filtrar por WhatsApp" className={c.input} value={waFilter} onChange={(e) => setWaFilter(e.target.value)} style={{ height: 34 }}>
          <option value="">WhatsApp: todos</option>
          <option value="down">Sem WhatsApp conectado</option>
          <option value="up">Com WhatsApp conectado</option>
        </select>
        <span className={c.sub} style={{ marginLeft: "auto" }}>{rows.length} de {ranked.length} consultores</span>
      </div>
      <div className={c.scroll}>
        <table className={c.table} style={{ minWidth: 1040 }}>
          <thead><tr>{head("name", "Consultor")}<th>WhatsApp</th><th>Polos</th>{COLS.map(([k, l]) => head(k, l, true))}</tr></thead>
          <tbody>
            {rows.map((b) => {
              const p = b.presence;
              return (
                <tr key={b.user.id} onClick={() => onSelect(b.user.id)} style={selected === b.user.id ? { background: "rgba(6,147,227,.1)" } : undefined}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                      <span style={{ position: "relative", width: 34, height: 34, flex: "none" }}>
                        <span style={{ width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800, background: "rgba(11,66,121,.1)", color: BRAND.blue }}>{initials(b.user.name)}</span>
                        <span title={p.online ? "Online agora" : "Offline"} style={{ position: "absolute", right: -1, bottom: -1, width: 10, height: 10, borderRadius: "50%", background: p.online ? "#16a34a" : "#94a3b8", border: "2px solid var(--ui-surface, #fff)" }} />
                      </span>
                      <span style={{ display: "grid" }}>
                        <b>{b.user.name}</b>
                        <span className={c.sub} style={{ marginTop: 0 }}><PresenceDot state={p.state} />{PRESENCE[p.state].label}</span>
                      </span>
                    </span>
                  </td>
                  <td><WaCell p={p} /></td>
                  <td><PoloCell b={b} polos={polos} onChanged={onChanged} /></td>
                  {COLS.map(([k]) => <td key={k} className="r" style={k === "tasksOverdue" && b.metrics[k] > 0 ? { color: "#dc2626", fontWeight: 700 } : undefined}>{fmt(b.metrics[k], fmtOf(k))}</td>)}
                </tr>
              );
            })}
            {rows.length === 0 && <tr style={{ cursor: "default" }}><td colSpan={3 + COLS.length} className={c.sub}>Nenhum consultor com esses filtros.</td></tr>}
            <tr style={{ cursor: "default", fontWeight: 700 }}><td>Total</td><td /><td />{COLS.map(([k]) => <td key={k} className="r">{fmt(totals[k], fmtOf(k))}</td>)}</tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

// the team in one picture: bars of messages per person, a line of attendances, and what changed (like a trading board)
const TeamPulse = ({ consultants }) => {
  const c = useKit();
  const rows = [...consultants].sort((a, b) => b.metrics.messagesSent - a.metrics.messagesSent).slice(0, 10).map((b) => ({ name: b.user.name.split(" ")[0], mensagens: b.metrics.messagesSent, atendimentos: b.metrics.attendances, matriculas: b.metrics.enrollments }));
  const any = rows.some((r) => r.mensagens || r.atendimentos || r.matriculas);
  return (
    <div className={`${c.panel} dash-card`}>
      <BlockTitle icon={<Gauge size={16} />} title="Produção da equipe" help="Mensagens enviadas (barras), atendimentos (linha) e matrículas (pontos) de cada consultor no período." />
      {!any ? <div className={c.sub} style={{ padding: "26px 0" }}>Ainda sem produção neste período. Quando alguém enviar mensagens ou atender, o gráfico acende aqui.</div> : (
        <div style={{ width: "100%", height: 280, marginTop: 8 }}>
          <ResponsiveContainer>
            <ComposedChart data={rows} margin={{ top: 10, right: 12, left: -14, bottom: 0 }}>
              <defs>
                <linearGradient id="tp-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity={0.9} /><stop offset="100%" stopColor="#0693e3" stopOpacity={0.15} /></linearGradient>
                <linearGradient id="tp-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#facc15" stopOpacity={0.35} /><stop offset="100%" stopColor="#facc15" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <ChartTip cursor={{ fill: "rgba(34,211,238,.07)" }} />
              <Bar dataKey="mensagens" name="Mensagens" fill="url(#tp-bar)" stroke="#22d3ee" strokeWidth={1.2} radius={[10, 10, 2, 2]} animationDuration={1000} />
              <Area type="monotone" dataKey="atendimentos" name="Atendimentos" stroke="#facc15" strokeWidth={2.6} fill="url(#tp-area)" animationDuration={1400} />
              <Line type="monotone" dataKey="matriculas" name="Matrículas" stroke="#4ade80" strokeWidth={0} dot={{ r: 5, fill: "#4ade80", stroke: "#052e16", strokeWidth: 2 }} animationDuration={1600} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

// ring that fills (the conversion of a polo)
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

const PoloBoard = ({ data, polos, history, setTab }) => {
  const c = useKit();
  const byId = new Map(data.polos.map((p) => [p.poloId, p]));
  // every polo of the system appears, with or without team
  const all = polos.map((p) => ({ poloId: p.id, name: p.name, city: p.city, state: p.state, consultants: (byId.get(p.id) || {}).consultants || 0, totals: (byId.get(p.id) || {}).totals || { messagesSent: 0, leadsWorked: 0, enrollments: 0, conversion: null } }));
  data.polos.forEach((p) => { if (!all.some((x) => x.poloId === p.poloId)) all.push(p); });
  const ranked = [...all].sort((a, b) => (b.totals.enrollments || 0) - (a.totals.enrollments || 0) || (b.totals.messagesSent || 0) - (a.totals.messagesSent || 0));
  const withTeam = ranked.filter((p) => p.consultants > 0);
  const maxE = Math.max(1, ...withTeam.map((p) => p.totals.enrollments || 0));
  const maxM = Math.max(1, ...withTeam.map((p) => p.totals.messagesSent || 0));
  const sum = (k) => withTeam.reduce((s, p) => s + Number(p.totals[k] || 0), 0);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className={`${c.grid4} dash-stagger`}>
        {[["Polos com equipe", withTeam.length, "#22d3ee"], ["Consultores vinculados", withTeam.reduce((s, p) => s + p.consultants, 0), "#818cf8"], ["Mensagens no período", sum("messagesSent"), "#0693e3"], ["Matrículas no período", sum("enrollments"), "#4ade80"]].map(([label, value, tone]) => (
          <div key={label} className={`${c.kpi} dash-card`} style={{ "--tone": tone }}>
            <div className={c.kpiLabel}><span>{label}</span></div>
            <div className={c.kpiValue}><NumberTicker value={value} format={(n) => num(n)} /></div>
          </div>
        ))}
      </div>

      {withTeam.length > 0 && (
        <div className={`${c.cols} `} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))" }}>
          <div className={`${c.panel} dash-card`}>
            <BlockTitle icon={<Gauge size={16} />} title="Corrida de matrículas" help="Quem está na frente no período. A barra cresce em relação ao melhor polo." />
            <div className="dash-race" style={{ marginTop: 14 }}>
              {withTeam.slice(0, 8).map((p, i) => (
                <div key={p.poloId} className="dash-race-row">
                  <span style={{ fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><span style={{ opacity: 0.5, marginRight: 8 }}>{i + 1}</span>{p.name}</span>
                  <span className="dash-race-track"><span className="dash-race-fill" style={{ display: "block", width: `${Math.max(3, ((p.totals.enrollments || 0) / maxE) * 100)}%`, animationDelay: `${i * 90}ms` }} /></span>
                  <b style={{ fontVariantNumeric: "tabular-nums" }}>{num(p.totals.enrollments)}</b>
                </div>
              ))}
            </div>
          </div>
          <div className={`${c.panel} dash-card`}>
            <BlockTitle title="Mensagens, leads e matrículas por polo" help="Os números dos consultores de cada polo, somados." />
            <CompareBars data={withTeam.slice(0, 8).map((p) => ({ name: p.name.split(" - ")[0].slice(0, 14), messagesSent: p.totals.messagesSent, leadsWorked: p.totals.leadsWorked, enrollments: p.totals.enrollments }))} keys={[["messagesSent", "Mensagens", "#22d3ee"], ["leadsWorked", "Leads trabalhados", "#818cf8"], ["enrollments", "Matrículas", "#4ade80"]]} />
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
                    <div><small>Mensagens</small><b><NumberTicker value={p.totals.messagesSent || 0} format={(n) => num(n)} /></b></div>
                    <div><small>Leads</small><b><NumberTicker value={p.totals.leadsWorked || 0} format={(n) => num(n)} /></b></div>
                    <div><small>Matrículas</small><b><NumberTicker value={p.totals.enrollments || 0} format={(n) => num(n)} /></b></div>
                  </div>
                  <Progress value={p.totals.messagesSent || 0} max={maxM} color="linear-gradient(90deg, #22d3ee, #0693e3)" />
                  <div className="dash-team">{team.map((b) => <span key={b.user.id}><i>{(b.user.name || "?").charAt(0).toUpperCase()}</i>{b.user.name.split(" ")[0]}</span>)}</div>
                </>
              ) : (
                <button type="button" className={c.btn} onClick={() => setTab("consultores")}>Vincular consultores</button>
              )}
            </article>
          );
        })}
      </div>
      <div><button type="button" className={c.btn} onClick={() => history.push("/polos")}>Gerenciar polos e funções (tutoria, coordenação)</button></div>
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
  const { data, loading, reload } = useAnalytics("/analytics/team", params, !!ready);
  useEffect(() => { if (data) setConfig(data.config); }, [data]);
  // the polos that exist, to link people to them without leaving this screen
  const [polos, setPolos] = useState([]);
  useEffect(() => { api.get("/polos").then(({ data: list }) => setPolos(Array.isArray(list) ? list.filter((p) => p.active !== false) : [])).catch(() => undefined); }, []);

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
    <div className={`${c.page} dash-scope`}>
      <div style={{ background: "linear-gradient(135deg, #0a3a6d 0%, #0b4279 55%, #0d5aa0 100%)", color: "#fff", borderRadius: 24, padding: "22px 26px 0", marginBottom: 18, boxShadow: "0 30px 60px -34px rgba(8,40,82,.9), inset 0 1px 0 rgba(255,255,255,.14)", position: "relative", overflow: "hidden" }}>
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
          {[["geral", "Visão geral"], ["consultores", "Consultores"], ["polos", "Polos"], ["config", "Configuração"]].map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{ border: 0, background: "transparent", color: "#fff", opacity: tab === k ? 1 : 0.7, fontFamily: "inherit", fontSize: 14, fontWeight: 600, padding: "10px 16px", cursor: "pointer", borderBottom: `3px solid ${tab === k ? BRAND.gorse : "transparent"}`, whiteSpace: "nowrap" }}>{label}</button>
          ))}
        </div>
      </div>

      {loading && !data && <div className={c.sub}>Carregando…</div>}
      {data && tab === "geral" && (
        <div style={{ display: "grid", gap: 16 }}>
          {data.unassigned && data.unassigned.open > 0 && (
            <div role="status" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 16px", borderRadius: 14, background: "rgba(217,119,6,.12)", border: "1px solid rgba(217,119,6,.35)" }}>
              <AlertTriangle size={18} style={{ color: "#d97706", flex: "none" }} />
              <span style={{ flex: 1, minWidth: 220, fontSize: 14 }}>
                <b>{data.unassigned.open} {data.unassigned.open === 1 ? "tarefa sem responsável" : "tarefas sem responsável"}</b>
                {data.unassigned.overdue > 0 ? ` (${data.unassigned.overdue} atrasada${data.unassigned.overdue === 1 ? "" : "s"})` : ""}: eram de quem não conectou o WhatsApp e nenhuma conversa do lead está com outra pessoa.
              </span>
              <button type="button" className={c.btnPrimary} onClick={() => history.push("/crm/tarefas?scope=all&status=open&userId=0")}>Distribuir</button>
            </div>
          )}
          <div className={`${c.grid4} dash-stagger`}>
            {["messagesSent", "attendances", "leadsWorked", "firstContactMinutes", "pendingReply", "enrollments", "conversion", "tasksOverdue"].map((k) => <Kpi key={k} k={k} value={data.totals[k]} def={defs[k]} tone={k === "tasksOverdue" && data.totals[k] > 0 ? "#dc2626" : undefined} />)}
          </div>
          <TeamPulse consultants={data.consultants} />
          <div className={c.cols}>
            <Team consultants={data.consultants} onOpen={(id) => { setSelected(id); setTab("consultores"); }} />
            <Alerts alerts={data.alerts} onOpen={(id) => { setSelected(id); setTab("consultores"); }} history={history} />
          </div>
        </div>
      )}

      {data && tab === "consultores" && (
        <ConsultantsTable ranked={ranked} totals={data.totals} polos={polos} defs={defs} selected={selected} onSelect={setSelected} onChanged={reload} />
      )}
      {selected && <Detail userId={selected} period={params} defs={defs} onClose={() => setSelected(null)} />}

      {data && tab === "polos" && <PoloBoard data={data} polos={polos} history={history} setTab={setTab} />}

      {data && tab === "config" && config && <ConfigPanel config={config} consultants={data.consultants} onSaved={setConfig} />}
    </div>
  );
};

export default CommercialCenter;
