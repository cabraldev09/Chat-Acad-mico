import React, { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { AlertTriangle, BellRing, CheckCheck, Info } from "lucide-react";
import { toast } from "react-toastify";

import api from "../../services/api";
import openSocket from "../../services/socket-io";

// The bell's "Avisos": what the system told this person (a task given to them, a lead the AI handed over, a proposal opened, a fee paid, a
// number down...). They stay until read, so nothing is lost while the person is away from the screen. The server sends only the person's own.
const LEVEL = {
  urgent: { color: "#b91c1c", Icon: AlertTriangle },
  warning: { color: "#b45309", Icon: BellRing },
  info: { color: "var(--accent, #0B4279)", Icon: Info },
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

const row = { display: "flex", gap: 10, alignItems: "flex-start", width: "100%", border: 0, borderBottom: "1px solid var(--line, #e5e7eb)", background: "transparent", padding: "10px 14px", textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" };

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
  return (
    <div>
      {unread > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 14px", borderBottom: "1px solid var(--line, #e5e7eb)" }}>
          <button type="button" onClick={markAll} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: 0, background: "none", color: "var(--accent, #0B4279)", font: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            <CheckCheck size={14} /> Marcar todos como lidos
          </button>
        </div>
      )}
      {list.map((n) => {
        const { color, Icon } = LEVEL[n.level] || LEVEL.info;
        return (
          <button key={n.id} type="button" style={{ ...row, background: n.readAt ? "transparent" : "var(--surface-2, #f8fafc)" }}
            onClick={() => { markRead(n); if (n.link) { history.push(n.link); if (onNavigate) onNavigate(); } }}>
            <Icon size={16} style={{ color, flex: "none", marginTop: 2 }} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: n.readAt ? 500 : 700, overflowWrap: "anywhere" }}>{n.title}</span>
              {n.body && <span style={{ display: "block", fontSize: 12.5, color: "var(--text-2, #64748b)", overflowWrap: "anywhere" }}>{n.body}</span>}
              <span style={{ display: "block", fontSize: 11.5, color: "var(--text-3, #94a3b8)", marginTop: 2 }}>{when(n.createdAt)}</span>
            </span>
            {!n.readAt && <span aria-label="Não lido" style={{ width: 8, height: 8, borderRadius: 99, background: color, flex: "none", marginTop: 6 }} />}
          </button>
        );
      })}
    </div>
  );
};
