import React, { useCallback, useContext, useEffect, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { AlarmClock, X } from "lucide-react";

import api from "../../services/api";
import { AuthContext } from "../../context/Auth/AuthContext";

// My follow-up tasks that are late or due today. One count for the whole app: the strip on top, the badge of the menu.
export const useMyTasks = () => {
  const { user } = useContext(AuthContext);
  const [counts, setCounts] = useState({ overdue: 0, today: 0, triage: 0, triageLate: 0, onboarding: 0 });
  const load = useCallback(() => {
    if (!user || !user.id) return;
    Promise.all([
      api.get("/lead-tasks", { params: { status: "overdue", scope: "mine" } }),
      api.get("/lead-tasks", { params: { status: "today", scope: "mine" } }),
      // my new leads nobody answered yet: each consultant checks their own before the day closes (the screen of the CRM is not for tutors)
      api.get("/crm/triage", { params: { ownerId: user.id } }).then(({ data }) => data).catch(() => ({ total: 0, late: 0 })),
      // students of mine waiting for the ambientação (tutor: the ones to start; consultant: the ones I sent that have not started)
      api.get("/onboarding/pending").then(({ data }) => data.pending || 0).catch(() => 0),
    ]).then(([a, b, t, o]) => setCounts({ overdue: (a.data || []).length, today: (b.data || []).length, triage: t.total || 0, triageLate: t.late || 0, onboarding: o })).catch(() => undefined);
  }, [user]);
  useEffect(() => {
    load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 2 * 60 * 1000);
    window.addEventListener("tasks:changed", load);
    window.addEventListener("focus", load);
    return () => { clearInterval(timer); window.removeEventListener("tasks:changed", load); window.removeEventListener("focus", load); };
  }, [load]);
  return counts;
};

// The strip on top of every screen: red when something is late, blue when it is only for today. It comes back when the number grows.
const TaskAlert = () => {
  const history = useHistory();
  const location = useLocation();
  const { overdue, today, triage, triageLate } = useMyTasks();
  const total = overdue + today + triage;
  const [hiddenAt, setHiddenAt] = useState(() => {
    try { return Number(sessionStorage.getItem("taskAlertHidden") || 0); } catch (e) { return 0; }
  });
  if (!total || total <= hiddenAt || location.pathname.startsWith("/crm/tarefas")) return null;
  const late = overdue > 0 || triageLate > 0;
  const evening = new Date().getHours() >= 16;
  const hide = () => {
    setHiddenAt(total);
    try { sessionStorage.setItem("taskAlertHidden", String(total)); } catch (e) { /* it just comes back */ }
  };
  return (
    <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", fontSize: 14, borderBottom: `1px solid ${late ? "#fecaca" : "#bfdbfe"}`, background: late ? "#fef2f2" : "#eff6ff", color: late ? "#991b1b" : "#1e3a8a" }}>
      <AlarmClock size={18} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, lineHeight: 1.4 }}>
        {overdue > 0 && <><b>{overdue} {overdue === 1 ? "tarefa atrasada" : "tarefas atrasadas"}</b>{today > 0 || triage > 0 ? (today > 0 && triage > 0 ? ", " : " e ") : "."}</>}
        {today > 0 && <><b>{today} {today === 1 ? "tarefa" : "tarefas"} para hoje</b>{triage > 0 ? " e " : "."}</>}
        {triage > 0 && <>{" "}<b>{triage} {triage === 1 ? "lead novo" : "leads novos"} para conferir</b>{triageLate > 0 ? ` (${triageLate} de dias anteriores)` : ""}.</>}
        {" "}{triage > 0 ? `Informe se é lead ainda hoje${evening ? ", antes do dia fechar" : ""}.` : "Contatos combinados com os leads."}
      </span>
      <button type="button" onClick={() => history.push(overdue + today > 0 ? (overdue > 0 ? "/crm/tarefas?status=overdue" : "/crm/tarefas?status=today") : "/crm/painel")} style={{ border: 0, background: late ? "#991b1b" : "#1e3a8a", color: "#fff", borderRadius: 8, padding: "6px 12px", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>{overdue + today > 0 ? "Ver tarefas" : "Conferir leads"}</button>
      <button type="button" aria-label="Dispensar o aviso" onClick={hide} style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer", display: "flex" }}><X size={18} /></button>
    </div>
  );
};

export default TaskAlert;
