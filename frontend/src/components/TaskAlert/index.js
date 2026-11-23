import React, { useContext, useEffect, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { AlarmClock } from "lucide-react";

import api from "../../services/api";
import openSocket from "../../services/socket-io";
import { AuthContext } from "../../context/Auth/AuthContext";
import { Notice } from "../Notices";

// My follow-up tasks that are late or due today. One count for the whole app (the strip on top and the badge of the menu share it: one
// request for everybody that shows it, not one per component), read again when a task of mine changes, on focus and every 2 minutes.
const EMPTY = { overdue: 0, today: 0, triage: 0, triageLate: 0, onboarding: 0 };
const shared = { counts: EMPTY, listeners: new Set(), userId: null, timer: null, pending: null, socket: null };
const publish = (counts) => { shared.counts = counts; shared.listeners.forEach((fn) => fn(counts)); };
const loadShared = () => {
  if (!shared.userId || shared.pending) return shared.pending;
  const me = shared.userId;
  shared.pending = Promise.all([
    api.get("/lead-tasks/counts", { params: { scope: "mine" } }).then(({ data }) => data).catch(() => null),
    // my new leads nobody answered yet: each consultant checks their own before the day closes (the screen of the CRM is not for tutors)
    api.get("/crm/triage", { params: { ownerId: me } }).then(({ data }) => data).catch(() => ({ total: 0, late: 0 })),
    // students of mine waiting for the ambientação (tutor: the ones to start; consultant: the ones I sent that have not started)
    api.get("/onboarding/pending").then(({ data }) => data.pending || 0).catch(() => 0),
  ]).then(([c, t, o]) => {
    if (shared.userId !== me) return;
    publish({ overdue: c ? c.overdue : shared.counts.overdue, today: c ? c.today : shared.counts.today, triage: t.total || 0, triageLate: t.late || 0, onboarding: o });
  }).finally(() => { shared.pending = null; });
  return shared.pending;
};
const start = (userId) => {
  if (shared.userId === userId && shared.timer) return;
  shared.userId = userId;
  clearInterval(shared.timer);
  shared.timer = setInterval(() => { if (document.visibilityState === "visible") loadShared(); }, 2 * 60 * 1000);
  window.addEventListener("tasks:changed", loadShared);
  window.addEventListener("focus", loadShared);
  if (!shared.socket) {
    shared.socket = openSocket();
    // a task of mine changed somewhere (given to me, closed by the system, moved by the sweep)
    shared.socket.on("taskChanged", () => loadShared());
    shared.socket.on("taskAssigned", () => loadShared());
  }
  loadShared();
};

export const useMyTasks = () => {
  const { user } = useContext(AuthContext);
  const [counts, setCounts] = useState(shared.counts);
  useEffect(() => {
    if (!user || !user.id) return undefined;
    shared.listeners.add(setCounts);
    start(user.id);
    setCounts(shared.counts);
    return () => { shared.listeners.delete(setCounts); };
  }, [user]);
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
