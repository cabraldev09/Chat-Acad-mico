import React, { useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { AlertTriangle, CheckCircle2, ChevronRight, Wifi, WifiOff, Settings2, Target, Users, X } from "lucide-react";
import { colorOf, initialsOf } from "../../utils/avatar";
import "../../styles/peak.css";

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

const AREAS = [
  { key: "comercial", label: "Comercial" },
  { key: "tutoria", label: "Tutoria" },
  { key: "relacionamento", label: "Relacionamento" },
  { key: "gestao", label: "Gestão" },
];
const ROLE_LABEL = { consultor: "Consultor(a)", tutor: "Tutor(a)", academico: "Acadêmico", relacionamento: "Relacionamento", coordenacao: "Coordenação", admin: "Administração" };
const TONES = { on: "#16a34a", warn: "#d97706", bad: "#dc2626", off: "#94a3b8" };
// one reading of where the person is: online and working, online but stopped, in working hours but out of the system, or offline
const statusOf = (p) => {
  if (p.online && p.state === "active") return { tone: "on", rank: 1, text: `Online${p.lastActivityAt ? ` · última ação ${since(p.lastActivityAt)}` : ""}` };
  if (p.online) return { tone: p.onSchedule ? "warn" : "on", rank: p.onSchedule ? 0 : 2, text: p.onSchedule ? `Online, sem ação${p.lastActivityAt ? ` ${since(p.lastActivityAt)}` : " hoje"}` : "Online" };
  if (p.onSchedule) return { tone: "warn", rank: 0, text: `No horário e fora do sistema${p.lastSeenAt ? ` · acessou ${dayTime(p.lastSeenAt)}` : ""}` };
  return { tone: "off", rank: 3, text: p.lastSeenAt ? `Offline · acessou ${dayTime(p.lastSeenAt)}` : "Ainda não acessou o sistema" };
};
const waProblem = (m) => m.presence.whatsapp.state !== "connected" && (m.ownNumber || m.presence.whatsapp.state === "none");

// "Equipe agora": the whole team (consultants, tutors, academic, relationship, coordination), grouped by area, in real time. Each line says
// only what matters: the state (with the dot), the schedule of today when there is one, and the WhatsApp only when it has a problem.
const Team = ({ members, canOpen, onOpen }) => {
  const c = useKit();
  const [area, setArea] = useState("all");
  const [q, setQ] = useState("");
  const list = (members || []).map((m) => ({ ...m, status: statusOf(m.presence) }));
  const present = AREAS.filter((a) => list.some((m) => m.user.area === a.key));
  const online = list.filter((m) => m.presence.online).length;
  const attention = list.filter((m) => m.status.tone === "warn" || waProblem(m)).length;
  const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const shown = list
    .filter((m) => area === "all" || m.user.area === area)
    .filter((m) => !q.trim() || norm(m.user.name).includes(norm(q.trim())));
  const groups = present
    .map((a) => ({ ...a, items: shown.filter((m) => m.user.area === a.key).sort((x, y) => (waProblem(y) - waProblem(x)) || x.status.rank - y.status.rank || x.user.name.localeCompare(y.user.name, "pt-BR")) }))
    .filter((g) => g.items.length);
  const chip = (key, label, n) => (
    <button key={key} type="button" onClick={() => setArea(key)} aria-pressed={area === key}
      style={{ border: `1px solid ${area === key ? "var(--c-brand)" : "var(--line)"}`, background: area === key ? "color-mix(in srgb, var(--c-brand) 10%, transparent)" : "transparent", color: area === key ? "var(--c-brand)" : "var(--text-2)", borderRadius: 999, padding: "4px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
      {label}{typeof n === "number" ? ` ${n}` : ""}
    </button>
  );
  return (
    <div className={c.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <BlockTitle icon={<Users size={16} />} title="Equipe agora" />
        <span className={c.sub} style={{ display: "inline-flex", gap: 10, alignItems: "center", marginTop: 0 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: TONES.on }} /><b style={{ color: "var(--text-1)" }}>{online}</b> online</span>
          {attention > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: TONES.warn }} /><b style={{ color: "var(--text-1)" }}>{attention}</b> pedem atenção</span>}
        </span>
      </div>
      {list.length === 0 ? <div className={c.sub} style={{ marginTop: 10 }}>Ninguém da equipe cadastrado ainda. Cadastre em Usuários.</div> : (
        <>
          {(present.length > 1 || list.length > 8) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "10px 0 2px" }}>
              {present.length > 1 && [chip("all", "Todos", list.length), ...present.map((a) => chip(a.key, a.label, list.filter((m) => m.user.area === a.key).length))]}
              {list.length > 8 && (
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pessoa" aria-label="Buscar pessoa na equipe"
                  style={{ marginLeft: "auto", minWidth: 0, flex: "1 1 140px", maxWidth: 220, border: "1px solid var(--line)", borderRadius: 10, padding: "6px 10px", fontFamily: "inherit", fontSize: 13, background: "transparent", color: "inherit" }} />
              )}
            </div>
          )}
          {groups.length === 0 && <div className={c.sub} style={{ marginTop: 10 }}>Ninguém encontrado.</div>}
          {groups.map((g) => (
            <div key={g.key} style={{ marginTop: 10 }}>
              {(present.length > 1 && area === "all") && (
                <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-2)", margin: "6px 0 2px" }}>
                  {g.label} · {g.items.filter((m) => m.presence.online).length} de {g.items.length} online
                </div>
              )}
              {g.items.map((m) => {
                const p = m.presence;
                const tone = TONES[m.status.tone];
                const slots = p.scheduleToday.length ? p.scheduleToday.map((sl) => `${sl.start}–${sl.end}`).join(", ") : "";
                const clickable = canOpen && canOpen.has(m.user.id);
                const Tag = clickable ? "button" : "div";
                return (
                  <Tag key={m.user.id} type={clickable ? "button" : undefined} onClick={clickable ? () => onOpen(m.user.id) : undefined} className={c.row}
                    style={{ padding: "10px 0", alignItems: "center", cursor: clickable ? "pointer" : "default" }} title={clickable ? "Ver os números desta pessoa" : undefined}>
                    <span style={{ position: "relative", width: 36, height: 36, flex: "none" }}>
                      <span style={{ width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 700, background: "color-mix(in srgb, var(--c-brand) 14%, transparent)", color: "var(--c-brand)" }}>{initials(m.user.name)}</span>
                      <span aria-hidden="true" style={{ position: "absolute", right: -1, bottom: -1, width: 11, height: 11, borderRadius: "50%", background: tone, border: "2px solid var(--card-bg, #fff)" }} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: "grid", gap: 1 }}>
                      <span style={{ display: "flex", gap: 6, alignItems: "baseline", minWidth: 0 }}>
                        <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.user.name}</b>
                        <span style={{ fontSize: 11.5, color: "var(--text-2)", flex: "none" }}>{ROLE_LABEL[m.user.role] || ""}</span>
                      </span>
                      <span style={{ fontSize: 12.5, color: m.status.tone === "off" ? "var(--text-2)" : tone, fontWeight: m.status.tone === "off" ? 400 : 600 }}>{m.status.text}</span>
                    </span>
                    <span style={{ display: "grid", justifyItems: "end", gap: 2, flex: "none", fontSize: 12 }}>
                      {slots && <span style={{ color: "var(--text-2)" }}>{slots}</span>}
                      {waProblem(m) && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600, color: TONES.bad }}>
                          <WifiOff size={13} />{p.whatsapp.state === "none" ? "Sem WhatsApp" : "WhatsApp desconectado"}
                        </span>
                      )}
                    </span>
                  </Tag>
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
};

// What needs attention, ONE LINE PER PERSON: the worst problem first (a number that is down explains the rest), the other facts as small chips.
// Everything explains itself at once when the pointer touches it.
const WHY = {
  whatsapp_none: "A pessoa nunca conectou um WhatsApp: não recebe nem envia mensagens. As conversas e tarefas dela ficam paradas.",
  whatsapp_offline: "O WhatsApp da pessoa está desconectado: as mensagens dos clientes não chegam até ele ser reconectado.",
  tasks_overdue: "Tarefas de acompanhamento cujo prazo já passou. Clique para ver quais são.",
  pending_reply: "Leads em negociação que escreveram por último nos últimos 7 dias e esperam resposta. Não contam matriculado, ganho ou perdido, aluno, nem ok, obrigado ou figurinha.",
  forgotten_reply: "Conversas em que o cliente escreveu por último há mais de 7 dias e ninguém respondeu. Retome ou marque como resolvida.",
  idle_on_schedule: "No horário de trabalho, sem enviar mensagem, mexer em lead ou concluir tarefa há um tempo.",
  below_messages_target: "Mensagens enviadas hoje abaixo da meta diária, dentro do horário de trabalho.",
  below_attendances_target: "Conversas atendidas hoje abaixo da meta diária, dentro do horário de trabalho.",
  training_needed: "A revisão diária das conversas encontrou o mesmo ponto se repetindo. Veja a aba Treinamento.",
  followups_due: "Leads com o próximo contato marcado para hoje ou antes.",
  no_conversion: "Leads trabalhados no período sem nenhuma matrícula confirmada.",
};
const RANK = { high: 0, medium: 1, low: 2 };

const groupByPerson = (alerts) => {
  const people = [];
  alerts.forEach((a) => {
    let g = people.find((x) => x.userId === a.userId);
    if (!g) { g = { userId: a.userId, name: a.name, items: [] }; people.push(g); }
    g.items.push(a);
  });
  people.forEach((g) => g.items.sort((x, y) => RANK[x.level] - RANK[y.level]));
  return people.sort((x, y) => RANK[x.items[0].level] - RANK[y.items[0].level] || y.items.length - x.items.length);
};

// What needs attention and where there is room to grow, in two parts: "Precisa de atenção" (the WhatsApp down, late tasks, clients waiting,
// someone stopped in working hours) and "Oportunidades" (below the goal of the day, follow-ups of today, leads with no enrollment, training).
// One line per person, the worst first; the reason is written under it, not hidden in a tooltip.
const Alerts = ({ alerts, onOpen, history }) => {
  const c = useKit();
  const [showAll, setShowAll] = useState(false);
  const attention = groupByPerson(alerts.filter((a) => a.level !== "low"));
  const chances = groupByPerson(alerts.filter((a) => a.level === "low"));
  const open = (a) => {
    if (a.code === "tasks_overdue") history.push(`/crm/tarefas?scope=all&status=overdue&userId=${a.userId}`);
    else if (a.code === "whatsapp_offline" || a.code === "whatsapp_none") history.push("/connections");
    else if (a.code === "pending_reply" || a.code === "forgotten_reply") history.push("/tickets");
    else onOpen(a.userId);
  };
  const TONE = { high: "bad", medium: "warn", low: "info" };
  const limit = showAll ? 99 : 4;
  const block = (title, hint, people, tone) => people.length > 0 && (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "0 0 6px" }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: tone }}>{title} · {people.length}</span>
        <span className="mx-sub" style={{ margin: 0 }}>{hint}</span>
      </div>
      <div className="mx-list">
        {people.slice(0, limit).map((g) => {
          const [head, ...rest] = g.items;
          return (
            <div key={g.userId} className="mx-item" style={{ alignItems: "flex-start", borderLeft: `3px solid ${LEVEL[head.level]}` }}>
              <span className="mx-avatar" style={{ background: colorOf(g.name) }} aria-hidden="true">{initialsOf(g.name)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <b className="mx-name" style={{ fontSize: 13.5 }}>{g.name}</b>
                  <button type="button" className="mx-go" style={{ border: 0, background: "none", cursor: "pointer", padding: "6px 0", font: "inherit", fontSize: 12.5, fontWeight: 650, color: "var(--c-brand)" }} onClick={() => open(head)}>
                    {head.code === "tasks_overdue" ? "Ver tarefas" : head.code === "pending_reply" || head.code === "forgotten_reply" ? "Ver conversas" : head.code.startsWith("whatsapp") ? "Ver conexão" : "Ver detalhe"} <ChevronRight size={15} aria-hidden="true" />
                  </button>
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>{head.text}</div>
                {WHY[head.code] && <div className="mx-sub" style={{ marginTop: 2 }}>{WHY[head.code]}</div>}
                {rest.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {rest.map((a) => (
                      <Tooltip key={a.code} title={WHY[a.code] || ""} enterDelay={0} placement="top" arrow>
                        <button type="button" className="mx-pill" data-tone={TONE[a.level]} onClick={() => open(a)} style={{ border: 0, cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 650 }}>{a.text}</button>
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
  const hidden = Math.max(0, attention.length - 4) + Math.max(0, chances.length - 4);
  return (
    <div className={c.panel}>
      <div className="mx-head">
        <span className="mx-ico" data-tone={attention.length ? TONE[attention[0].items[0].level] : chances.length ? "info" : "good"} aria-hidden="true"><AlertTriangle size={17} /></span>
        <div style={{ minWidth: 0 }}>
          <h3 className="mx-title">Alertas e oportunidades</h3>
          <div className="mx-sub">O que precisa de ação agora e onde a equipe pode render mais hoje.</div>
        </div>
      </div>
      {attention.length === 0 && chances.length === 0 ? (
        <div className="mx-empty"><span className="mx-ico" data-tone="good" aria-hidden="true"><CheckCircle2 size={17} /></span><div><b>Tudo em dia</b><span>Nada pedindo atenção agora.</span></div></div>
      ) : (
        <>
          {block("Precisa de atenção", "resolva primeiro", attention, "#dc2626")}
          {block("Oportunidades", "metas do dia, retornos e conversão", chances, "#2563eb")}
          {hidden > 0 && !showAll && (
            <button type="button" onClick={() => setShowAll(true)} style={{ marginTop: 10, border: 0, background: "none", color: "var(--c-brand)", fontWeight: 650, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
              Ver mais {hidden} {hidden === 1 ? "pessoa" : "pessoas"}
            </button>
          )}
        </>
      )}
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
        {[["Polos com equipe", withTeam.length], ["Consultores vinculados", withTeam.reduce((s, p) => s + p.consultants, 0)], ["Conversas no período", sum("attendances")], ["Matrículas no período", sum("enrollments")]].map(([label, value]) => (
          <div key={label} className={`${c.kpi} dash-card`}>
            <div className={c.kpiLabel}><span>{label}</span></div>
            <div className={c.kpiValue}><NumberTicker value={value} format={(n) => num(n)} /></div>
          </div>
        ))}
      </div>

      {withTeam.length > 0 && (
        <div className={`${c.cols} `} style={{ gridTemplateColumns: "1fr" }}>
          <div className={`${c.panel} dash-card`}>
            <BlockTitle title="Conversas, leads e matrículas por polo" help="Os números dos consultores de cada polo, somados." />
            <CompareBars data={withTeam.slice(0, 8).map((p) => ({ name: p.name.split(" - ")[0].slice(0, 14), attendances: p.totals.attendances, leadsWorked: p.totals.leadsWorked, enrollments: p.totals.enrollments }))} keys={[["attendances", "Conversas", "leads"], ["leadsWorked", "Leads trabalhados", "brand"], ["enrollments", "Matrículas", "won"]]} />
          </div>
        </div>
      )}

      <div className="dash-stagger" style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))" }}>
        {ranked.map((p) => {
          const team = data.consultants.filter((b) => (b.user.poloIds || []).includes(p.poloId));
          return (
            <article key={p.poloId} className={`${c.panel} dash-card dash-polo`} style={{ opacity: p.consultants ? 1 : 0.8 }}>
              <div className="dash-polo-head">
                <Ring value={p.totals.conversion} />
                <div style={{ minWidth: 0 }}>
                  <b style={{ display: "block", fontSize: 15, lineHeight: 1.3, letterSpacing: "-0.01em", overflowWrap: "anywhere" }}>{p.name}</b>
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

// What the OpenBot recommends to the management, written through the API (scope insights:write): the administrators only (the server sends an
// empty list to everybody else). Always plain text (React escapes it; no HTML or Markdown is read), with the origin "OpenBot" and the date
// on every item, and only totals: the server refuses personal data. "Dispensar" hides the item; nothing runs because of what it says.
const INSIGHT_TONE = { urgent: "bad", warning: "warn", info: "info" };
const INSIGHT_COLOR = { urgent: "#dc2626", warning: "#d97706", info: "#0693E3" };
const OpenbotInsights = ({ items, onDismiss, onOpen }) => {
  const c = useKit();
  if (!items || items.length === 0) return null;
  const day = (iso) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Porto_Velho", day: "2-digit", month: "2-digit" });
  return (
    <div className={c.panel} data-testid="openbot-insights">
      <div className="mx-head">
        <span className="mx-ico" data-tone="info" aria-hidden="true"><AlertTriangle size={17} /></span>
        <div style={{ minWidth: 0 }}>
          <h3 className="mx-title">Recomendações do OpenBot</h3>
          <div className="mx-sub">Sugestões geradas pelo OpenBot a partir dos indicadores consolidados, sem dados de pessoas. Só a administração vê.</div>
        </div>
      </div>
      <div className="mx-list" style={{ marginTop: 8 }}>
        {items.map((item) => (
          <div key={item.id} className="mx-item" style={{ alignItems: "flex-start", borderLeft: `3px solid ${INSIGHT_COLOR[item.level] || INSIGHT_COLOR.info}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className="mx-pill" data-tone={INSIGHT_TONE[item.level] || "info"} style={{ fontSize: 12, fontWeight: 650 }}>OpenBot</span>
                <span className="mx-sub" style={{ margin: 0 }}>{day(item.createdAt)}</span>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 650, marginTop: 4, overflowWrap: "anywhere" }}>{item.title}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.45, overflowWrap: "anywhere" }}>{item.body}</div>
              <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                {item.link && (
                  <button type="button" className="mx-go" style={{ border: 0, background: "none", cursor: "pointer", padding: "6px 0", font: "inherit", fontSize: 12.5, fontWeight: 650, color: "var(--c-brand)" }} onClick={() => onOpen(item.link)}>
                    Ver detalhe <ChevronRight size={15} aria-hidden="true" />
                  </button>
                )}
                <button type="button" style={{ border: 0, background: "none", cursor: "pointer", padding: "6px 0", font: "inherit", fontSize: 12.5, fontWeight: 650, color: "#64748b" }} onClick={() => onDismiss(item.id)}>
                  Dispensar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export { Team, Alerts, OpenbotInsights, Detail, ConfigPanel, PoloBoard, supervisorPeriod };
