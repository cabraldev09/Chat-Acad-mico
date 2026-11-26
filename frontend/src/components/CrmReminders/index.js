import React, { useContext, useEffect } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import openSocket from "../../services/socket-io";
import { AuthContext } from "../../context/Auth/AuthContext";
import { burst } from "../../pages/CRM/shared";
import alertSound from "../../assets/sound.mp3";
import { getSoundMode } from "../../utils/soundPrefs";
import { noticeToast } from "../../utils/modernToast";
import { alreadyHere, batchToast, namesLine } from "../../utils/toastBatch";

// "62215 min" says nothing: 45 min, 2 h 10 min, 3 days
const howLong = (minutes) => {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m} min`;
  if (m < 1440) return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 60)} h`;
  const d = Math.floor(m / 1440);
  return `${d} ${d === 1 ? "dia" : "dias"}`;
};

// a contact saved only by its number shows the number the way people read it: +55 69 99366-7971
const prettyName = (name) => {
  const digits = String(name || "").replace(/\D/g, "");
  if (!name || String(name).replace(/[\d\s+()-]/g, "").length > 0) return name || "Um lead";
  if (/^55\d{10,11}$/.test(digits)) {
    const rest = digits.slice(4);
    return `+55 ${digits.slice(2, 4)} ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  return `+${digits}`;
};

// Toast when one of my follow-up tasks becomes due
const CrmReminders = () => {
  const { user } = useContext(AuthContext);
  const history = useHistory();
  useEffect(() => {
    if (!user || !user.id) return undefined;
    const socket = openSocket();
    socket.on("crmReminder", (t) => {
      // only the person the task is given to (a task without a person no longer pops up for every manager)
      if (Number(t.userId) !== Number(user.id)) return;
      toast.info(`${t.title}${t.leadName ? ` — ${t.leadName}` : ""}`, {
        autoClose: 12000,
        onClick: () => history.push(`/crm?lead=${t.leadId}`),
      });
    });
    socket.on("budgetAlert", (a) => {
      if (user.profile !== "admin" && user.role !== "admin") return;
      toast.warn(a.text, { toastId: `budget:${a.key}:${a.level}`, autoClose: 30000, onClick: () => history.push("/configuracoes?secao=limites") });
    });
    // a lead nobody answered in time: the owner and the managers are warned. Several in the same minute become one pop-up with the
    // count (the server already leaves out "obrigado", stickers and waits that started days ago), and a conversation already open
    // on the screen does not pop up
    socket.on("leadAlert", (a) => {
      const manager = user.profile === "admin" || user.role === "admin" || user.role === "coordenacao";
      const mine = a.ownerId === user.id;
      if (!(mine || manager)) return;
      const link = a.ticketId ? `/tickets/${a.ticketId}` : `/crm?lead=${a.leadId}`;
      if (alreadyHere(link)) return;
      batchToast("leadAlert", { ...a, mine, link }, (items) => {
        const escalated = items.some((i) => i.escalated);
        const anyMine = items.some((i) => i.mine);
        if (items.length === 1) {
          const [i] = items;
          noticeToast({
            id: `lead-alert:${i.ticketId || i.leadId}`,
            level: i.escalated ? "urgent" : "warning",
            title: i.escalated ? "Prazo escalado" : "Lead sem resposta",
            body: `${prettyName(i.name)} espera resposta há ${howLong(i.minutes)}.${i.mine ? " É seu." : ""}`,
            actionLabel: "Abrir conversa",
            onAction: () => history.push(i.link),
          });
        } else {
          noticeToast({
            id: `lead-alert:batch:${Date.now()}`,
            level: escalated ? "urgent" : "warning",
            title: `${items.length} leads esperando resposta`,
            body: `${namesLine(items.map((i) => prettyName(i.name)))}. ${anyMine ? "Alguns são seus." : "Distribua ou responda."}`,
            actionLabel: "Ver conversas",
            onAction: () => history.push("/tickets"),
          });
        }
        if (anyMine || getSoundMode() === "all") {
          try {
            new Audio(alertSound).play().catch(() => {});
          } catch (e) {
            /* the browser may block sound before the first click */
          }
        }
      });
    });
    // the AI agent handed a conversation to the commercial team: the consultor who took it (or the queue, or the managers) hears it now
    socket.on("aiHandoff", (h) => {
      const manager = user.profile === "admin" || user.role === "admin" || user.role === "coordenacao";
      const mine = h.userId === user.id;
      const myQueue = !h.userId && h.queueId && (user.queues || []).some((q) => q.id === h.queueId);
      const needsManager = manager && (h.noQueue || h.noTeam || h.fallback || !h.userId);
      if (!(mine || myQueue || needsManager)) return;
      const lead = h.name || "Um lead";
      toast.info(`${lead} chegou do agente de IA${h.poloName ? ` (${h.poloName})` : ""}: ${h.reason}${h.noQueue ? ". Não há fila comercial: alguém da gestão precisa assumir." : h.noTeam ? ". O polo não tem consultor: a conversa ficou na fila do polo e alguém da gestão precisa colocar um consultor ou assumir." : h.fallback ? ". Veio pela fila central." : ""}${h.outside && h.when ? ` A equipe responde ${h.when}.` : ""}`, {
        autoClose: 20000,
        onClick: () => history.push(`/tickets/${h.ticketId}`),
      });
      if (mine || getSoundMode() === "all") {
        try {
          new Audio(alertSound).play().catch(() => {});
        } catch (e) {
          /* the browser may block sound before the first click */
        }
      }
    });
    // the tutor is reminded a few hours before the limit
    socket.on("onboardingReminder", (a) => {
      if (a.tutorId !== user.id) return;
      toast.info(`${a.leadName || "Um aluno"} está perto de ${a.hours} horas sem o primeiro contato. Faltam cerca de ${a.left} h`, {
        autoClose: 30000,
        onClick: () => history.push("/ambientacao"),
      });
    });
    // a student passed the limit (24 h) without the tutor's first contact: administration and coordination are warned, and so is the tutor
    socket.on("onboardingAlert", (a) => {
      const manager = user.profile === "admin" || user.role === "admin" || user.role === "coordenacao";
      if (!(manager || a.tutorId === user.id)) return;
      toast.warn(`${a.leadName || "Um aluno"} está há mais de ${a.hours} horas sem ser ambientado`, {
        autoClose: 30000,
        onClick: () => history.push("/ambientacao"),
      });
    });
    // nobody answered a conversation handed over by the AI: the consultor, then the managers, are warned (the second time it changes hands)
    socket.on("handoffAlert", (a) => {
      const manager = user.profile === "admin" || user.role === "admin" || user.role === "coordenacao";
      if (!(a.userId === user.id || manager)) return;
      const who = a.name || "Um lead";
      toast.warn(`${who} segue sem atendimento humano. ${a.note}`, {
        autoClose: 25000,
        onClick: () => history.push(`/tickets/${a.ticketId}`),
      });
      if (a.userId === user.id) {
        try {
          new Audio(alertSound).play().catch(() => {});
        } catch (e) {
          /* the browser may block sound before the first click */
        }
      }
    });
    // a number stopped being connected: its owner and the administrators must scan the QR Code again
    socket.on("whatsappAlert", (a) => {
      const admin = user.profile === "admin" || user.role === "admin" || user.role === "coordenacao";
      if (!(a.ownerId === user.id || admin)) return;
      toast.error(`O WhatsApp “${a.name}” desconectou. Abra Conexões e leia o QR Code de novo para voltar a receber mensagens (as mensagens que já chegaram continuam guardadas aqui).`, {
        autoClose: 20000,
        onClick: () => history.push("/connections"),
      });
    });
    // enrollment fee confirmed by Efí
    socket.on("payment", (d) => {
      burst(window.innerWidth - 200, 90);
      toast.success(`${d.leadName} pagou a taxa de matrícula (${Number(d.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`, {
        autoClose: 15000,
        onClick: () => history.push(`/crm?lead=${d.leadId}`),
      });
    });
    // a task was given to me (a colleague, the system, a student sent to my ambientação): I hear it now and the lists refresh
    const ding = () => {
      try { new Audio(alertSound).play().catch(() => {}); } catch (e) { /* the browser may block sound before the first click */ }
    };
    socket.on("taskAssigned", (t) => {
      if (t.userId !== user.id) return;
      window.dispatchEvent(new CustomEvent("tasks:changed", { detail: { remote: true } }));
      noticeToast({
        id: `task:${t.id || t.title}`,
        level: "info",
        title: "Nova tarefa para você",
        body: `${t.title}${t.leadName ? `: ${prettyName(t.leadName)}` : ""}.${t.by ? ` Enviada por ${t.by}.` : ""}`,
        actionLabel: "Ver tarefas",
        onAction: () => history.push("/crm/tarefas?status=today"),
      });
      ding();
    });
    // a student was sent to the ambientação (the tutor receives it; the consultant who sold it sees where it went and when it ends)
    socket.on("onboardingAssigned", (a) => {
      if (a.userId !== user.id) return;
      window.dispatchEvent(new CustomEvent("tasks:changed", { detail: { remote: true } }));
      const mineAsTutor = a.tutorId === user.id;
      const title = a.kind === "done" ? "Ambientação concluída" : mineAsTutor ? "Aluno novo para ambientar" : "Seu aluno foi para a ambientação";
      noticeToast({
        id: `onboarding:${a.leadId || a.leadName}:${a.kind || "new"}`,
        level: "info",
        title,
        body: `${prettyName(a.leadName)}${a.poloName ? ` · ${a.poloName}` : ""}`,
        actionLabel: "Abrir ambientação",
        onAction: () => history.push("/ambientacao"),
      });
      if (mineAsTutor) ding();
    });
    // a student entered the risk of dropping out
    socket.on("riskAlert", (a) => {
      const manager = user.profile === "admin" || user.role === "admin" || user.role === "coordenacao";
      if (!(manager || a.tutorId === user.id || a.ownerId === user.id)) return;
      batchToast("riskAlert", a, (items) => noticeToast({
        id: `risk:${items.map((i) => i.leadId).join(",")}`,
        level: "warning",
        title: items.length === 1 ? "Aluno em risco de evasão" : `${items.length} alunos em risco de evasão`,
        body: items.length === 1 ? `${prettyName(items[0].leadName)} está há ${items[0].days} dias sem notícias.` : `${namesLine(items.map((i) => prettyName(i.leadName)))} estão sem notícias.`,
        actionLabel: "Abrir Retenção",
        onAction: () => history.push("/crm/retencao"),
      }));
    });
    return () => socket.disconnect();
  }, [user, history]);
  return null;
};

export default CrmReminders;
