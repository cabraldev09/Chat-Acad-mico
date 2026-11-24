import React, { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { AlertTriangle, BellRing, CheckCheck, Info } from "lucide-react";
import { toast } from "react-toastify";

import api from "../../services/api";
import openSocket from "../../services/socket-io";

// The bell's "Avisos": what the system told this person (a task given to them, a lead the AI handed over, a proposal opened, a fee paid, a
// number down...). They stay until read, so nothing is lost while the person is away from the screen. The server sends only the person's own.
const LEVEL = {
  urgent: { color: "#dc2626", Icon: AlertTriangle },
  warning: { color: "#d97706", Icon: BellRing },
  info: { color: "#0b6bcb", Icon: Info },
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
        const opts = { toastId: `notice-${n.id}`, autoClose: n.level === "urgent" ? false : 8000 };
        const text = `${n.title}${n.body ? ` · ${n.body}` : ""}`;
        if (n.level === "urgent") toast.error(text, opts);
        else if (n.level === "warning") toast.warning(text, opts);
        else toast.info(text, opts);
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
  return { ...state, reload: load, markRead, markAll };
};


export const NoticeList = ({ notices, onNavigate }) => {
  const history = useHistory();
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
  // the cards of the Notification Center of the Mac: icon in a rounded square, title in bold with the time on the right, the text under it
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
      <div className="mac-notes">
        {list.map((n) => {
          const { color, Icon } = LEVEL[n.level] || LEVEL.info;
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
  );
};
