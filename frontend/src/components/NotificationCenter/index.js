import React, { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { AlertTriangle, BellRing, CheckCheck, Clock3, FileText, GraduationCap, Info, ListTodo, Users, Wallet, WifiOff } from "lucide-react";

import api from "../../services/api";
import openSocket from "../../services/socket-io";
import { noticeToast } from "../../utils/modernToast";

// The bell's "Avisos": what the system told this person (a task given to them, a lead the AI handed over, a proposal opened, a fee paid, a
// number down...). They stay until read, so nothing is lost while the person is away from the screen. The server sends only the person's own.
const LEVEL = {
  urgent: { color: "#dc2626", Icon: AlertTriangle },
  warning: { color: "#d97706", Icon: BellRing },
  info: { color: "#0b6bcb", Icon: Info },
};
// the icon says what it is about at a glance; the color says how urgent it is
const KIND_ICON = {
  task_assigned: ListTodo, task_soon: Clock3, proposal_viewed: FileText, payment_paid: Wallet, budget: Wallet, safety_paused: WifiOff,
  whatsapp: WifiOff, sla_soon: Clock3, unassigned: Users, training: GraduationCap,
};
// the kinds that already have their own pop-up elsewhere (no second pop-up for the same thing)
const HAS_TOAST = new Set(["task_assigned", "ai_handoff", "budget", "onboarding_late"]);

const when = (iso) => {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  if (mins < 24 * 60) return `há ${Math.round(mins / 60)} h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

export const useNotices = () => {
  const history = useHistory();
  const [state, setState] = useState({ list: null, unread: 0, failed: false });
  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications", { params: { limit: 40 } });
      setState({ list: data.notifications || [], unread: data.unread || 0, failed: false });
    } catch (_) {
      setState((s) => ({ ...s, list: s.list || [], failed: true }));
    }
  }, []);
  useEffect(() => {
    load();
    const socket = openSocket();
    socket.on("notification", (data) => {
      const n = data && data.notification;
      if (!n) return;
      setState((s) => ({ ...s, list: [n, ...(s.list || []).filter((x) => x.id !== n.id)].slice(0, 40), unread: s.unread + 1 }));
      if (!HAS_TOAST.has(n.kind)) {
        // the same card everywhere: its title, one sentence and the button to where it is solved
        noticeToast({ id: `notice-${n.id}`, title: n.title, body: n.body, level: n.level, actionLabel: "Abrir", onAction: n.link ? () => { window.dispatchEvent(new CustomEvent("openNotice", { detail: n })); } : null });
      }
    });
    const again = () => load();
    window.addEventListener("socketReconnected", again);
    return () => { socket.disconnect(); window.removeEventListener("socketReconnected", again); };
  }, [load]);
  const markRead = async (n) => {
    if (n.readAt) return;
    setState((s) => ({ ...s, list: s.list.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)), unread: Math.max(0, s.unread - 1) }));
    try { await api.put(`/notifications/${n.id}/read`); } catch (_) { load(); }
  };
  const markAll = async () => {
    setState((s) => ({ ...s, list: (s.list || []).map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })), unread: 0 }));
    try { await api.put("/notifications/read-all"); } catch (_) { load(); }
  };
  // the button of a pop-up opens the notice the same way a click on the bell does
  useEffect(() => {
    const open = (e) => {
      const n = e.detail;
      if (!n) return;
      if (!n.readAt) {
        setState((s) => ({ ...s, list: (s.list || []).map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)), unread: Math.max(0, s.unread - 1) }));
        api.put(`/notifications/${n.id}/read`).catch(() => undefined);
      }
      if (n.link) history.push(n.link);
    };
    window.addEventListener("openNotice", open);
    return () => window.removeEventListener("openNotice", open);
  }, [history]);
  return { ...state, reload: load, markRead, markAll };
};

const dayOf = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return "Antes";
};
const pill = (on) => ({ border: 0, borderRadius: 999, padding: "4px 11px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer", background: on ? "color-mix(in srgb, var(--accent, #0B4279) 12%, transparent)" : "transparent", color: on ? "var(--accent, #0B4279)" : "var(--text-2, #64748b)" });

// The list of the bell: grouped by day (Hoje, Ontem, Antes), the unread first in weight and with a dot, an icon of what it is about,
// "há X min", a filter for the unread only and "Marcar todos como lidos". A click marks it read and opens where it is solved.
export const NoticeList = ({ notices, onNavigate }) => {
  const history = useHistory();
  const [onlyUnread, setOnlyUnread] = useState(false);
  const { list, unread, failed, markRead, markAll, reload } = notices;
  if (list === null) return <div style={{ padding: 16, fontSize: 13, color: "var(--text-2, #64748b)" }}>Carregando os avisos...</div>;
  if (failed && !list.length) {
    return (
      <div style={{ padding: 16, fontSize: 13 }}>
        Não foi possível carregar os avisos. <button type="button" onClick={reload} style={{ border: 0, background: "none", color: "var(--accent, #0B4279)", font: "inherit", fontWeight: 600, cursor: "pointer", padding: 0 }}>Tentar de novo</button>
      </div>
    );
  }
  if (!list.length) return <div style={{ padding: 16, fontSize: 13, color: "var(--text-2, #64748b)" }}>Nenhum aviso por enquanto. Tarefas novas, leads encaminhados, propostas abertas e alertas da equipe aparecem aqui.</div>;
  const shown = onlyUnread ? list.filter((n) => !n.readAt) : list;
  const groups = ["Hoje", "Ontem", "Antes"].map((label) => ({ label, items: shown.filter((n) => dayOf(n.createdAt) === label) })).filter((g) => g.items.length);
  // the cards of the Notification Center of the Mac: icon of the kind in a rounded square, title in bold with the time on the right, the
  // text under it; grouped by day, with the filter of the unread ones
  return (
    <div>
      <div className="mac-notes-head">
        <b>Avisos</b>
        {unread > 0 && (
          <button type="button" className="mac-notes-clear" onClick={markAll}>
            <CheckCheck size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Marcar todos como lidos
          </button>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 10px 6px", flexWrap: "wrap" }}>
        <button type="button" onClick={() => setOnlyUnread(false)} aria-pressed={!onlyUnread} style={pill(!onlyUnread)}>Todos</button>
        <button type="button" onClick={() => setOnlyUnread(true)} aria-pressed={onlyUnread} style={pill(onlyUnread)}>Não lidos{unread ? ` ${unread}` : ""}</button>
      </div>
      {groups.length === 0 && <div style={{ padding: 16, fontSize: 13, color: "var(--text-2, #64748b)" }}>Tudo lido.</div>}
      {groups.map((g) => (
        <div key={g.label}>
          <div style={{ padding: "6px 14px 2px", fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-2, #64748b)" }}>{g.label}</div>
          <div className="mac-notes">
            {g.items.map((n) => {
              const { color, Icon: LevelIcon } = LEVEL[n.level] || LEVEL.info;
              const Icon = KIND_ICON[n.kind] || LevelIcon;
              return (
                <button key={n.id} type="button" className={`mac-note${n.readAt ? " is-read" : ""}`}
                  onClick={() => { markRead(n); if (n.link) { history.push(n.link); if (onNavigate) onNavigate(); } }}>
                  <span className="mac-note-icon" style={{ background: `linear-gradient(160deg, ${color}, ${color}cc)` }} aria-hidden="true"><Icon size={16} /></span>
                  <span className="mac-note-text">
                    <span className="mac-note-head">
                      <span className="mac-note-title">{n.title}</span>
                      <span className="mac-note-time">{when(n.createdAt)}</span>
                      {!n.readAt && <span aria-label="Não lido" style={{ width: 8, height: 8, borderRadius: 99, background: color, flex: "none", alignSelf: "center" }} />}
                    </span>
                    {n.body && <span className="mac-note-body">{n.body}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
