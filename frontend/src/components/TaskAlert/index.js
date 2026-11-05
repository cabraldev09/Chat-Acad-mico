import React, { useCallback, useContext, useEffect, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { AlarmClock } from "lucide-react";

import api from "../../services/api";
import { AuthContext } from "../../context/Auth/AuthContext";
import { Notice } from "../Notices";

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
  const parts = [
    overdue > 0 ? `${overdue} ${overdue === 1 ? "tarefa atrasada" : "tarefas atrasadas"}` : null,
    today > 0 ? `${today} ${today === 1 ? "tarefa" : "tarefas"} para hoje` : null,
    triage > 0 ? `${triage} ${triage === 1 ? "lead novo" : "leads novos"} para conferir${triageLate > 0 ? ` (${triageLate} de dias anteriores)` : ""}` : null,
  ].filter(Boolean);
  const said = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}` : parts[0];
  const tail = triage > 0 ? `Informe se é lead ainda hoje${evening ? ", antes do dia fechar" : ""}.` : "Contatos combinados com os leads.";
  return (
    <Notice tone={late ? "danger" : "info"} icon={AlarmClock} title={`${said}. ${tail}`}
      action={overdue + today > 0 ? "Ver tarefas" : "Conferir leads"}
      onAction={() => history.push(overdue + today > 0 ? (overdue > 0 ? "/crm/tarefas?status=overdue" : "/crm/tarefas?status=today") : "/crm/painel")}
      onClose={hide}>
      <b>{said}</b>. {tail}
    </Notice>
  );
};

export default TaskAlert;
