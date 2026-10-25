import React, { useContext, useEffect } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import openSocket from "../../services/socket-io";
import { AuthContext } from "../../context/Auth/AuthContext";
import { burst } from "../../pages/CRM/shared";
import alertSound from "../../assets/sound.mp3";
import { getSoundMode } from "../../utils/soundPrefs";

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

// a title and one short line, instead of one long sentence
const AlertToast = ({ title, line, detail }) => (
  <div>
    <div style={{ fontWeight: 700 }}>{title}</div>
    <div style={{ marginTop: 2 }}>{line}</div>
    {detail ? <div style={{ marginTop: 2, fontSize: 12.5, opacity: 0.75 }}>{detail}</div> : null}
  </div>
);

// Toast when one of my follow-up tasks becomes due
const CrmReminders = () => {
  const { user } = useContext(AuthContext);
  const history = useHistory();
  useEffect(() => {
    if (!user || !user.id) return undefined;
    const socket = openSocket();
    socket.on("crmReminder", (t) => {
      if (t.userId && t.userId !== user.id) return;
      toast.info(`⏰ ${t.title}${t.leadName ? ` — ${t.leadName}` : ""}`, {
        autoClose: 12000,
        onClick: () => history.push(`/crm?lead=${t.leadId}`),
      });
    });
    // a new lead nobody answered in time: the owner and the managers are warned
    socket.on("leadAlert", (a) => {
      const manager = user.profile === "admin" || user.role === "admin" || user.role === "coordenacao";
      if (!(a.ownerId === user.id || manager)) return;
      toast.warn(<AlertToast title="Lead sem resposta" line={<><b>{prettyName(a.name)}</b> espera há {howLong(a.minutes)}</>} detail={a.ownerId === user.id ? "É seu: toque para abrir" : "Toque para abrir o lead"} />, {
        autoClose: 20000,
        onClick: () => history.push(`/crm?lead=${a.leadId}`),
      });
      if (a.ownerId === user.id || getSoundMode() === "all") {
        try {
          new Audio(alertSound).play().catch(() => {});
        } catch (e) {
          /* the browser may block sound before the first click */
        }
      }
    });
    // the AI agent handed a conversation to the commercial team: the consultor who took it (or the queue, or the managers) hears it now
    socket.on("aiHandoff", (h) => {
      const manager = user.profile === "admin" || user.role === "admin" || user.role === "coordenacao";
      const mine = h.userId === user.id;
      const myQueue = !h.userId && h.queueId && (user.queues || []).some((q) => q.id === h.queueId);
      const needsManager = manager && (h.noQueue || h.noTeam || h.fallback || !h.userId);
      if (!(mine || myQueue || needsManager)) return;
      const lead = h.name || "Um lead";
      toast.info(`🤝 ${lead} chegou do agente de IA${h.poloName ? ` (${h.poloName})` : ""}: ${h.reason}${h.noQueue ? ". Não há fila comercial: alguém da gestão precisa assumir." : h.noTeam ? ". O polo não tem consultor: a conversa ficou na fila do polo e alguém da gestão precisa colocar um consultor ou assumir." : h.fallback ? ". Veio pela fila central." : ""}${h.outside && h.when ? ` A equipe responde ${h.when}.` : ""}`, {
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
      toast.info(`⏳ ${a.leadName || "Um aluno"} está perto de ${a.hours} horas sem o primeiro contato. Faltam cerca de ${a.left} h`, {
        autoClose: 30000,
        onClick: () => history.push("/ambientacao"),
      });
    });
    // a student passed the limit (24 h) without the tutor's first contact: administration and coordination are warned, and so is the tutor
    socket.on("onboardingAlert", (a) => {
      const manager = user.profile === "admin" || user.role === "admin" || user.role === "coordenacao";
      if (!(manager || a.tutorId === user.id)) return;
      toast.warn(`⏰ ${a.leadName || "Um aluno"} está há mais de ${a.hours} horas sem ser ambientado`, {
        autoClose: 30000,
        onClick: () => history.push("/ambientacao"),
      });
    });
    // nobody answered a conversation handed over by the AI: the consultor, then the managers, are warned (the second time it changes hands)
    socket.on("handoffAlert", (a) => {
      const manager = user.profile === "admin" || user.role === "admin" || user.role === "coordenacao";
      if (!(a.userId === user.id || manager)) return;
      const who = a.name || "Um lead";
      toast.warn(`⏳ ${who} segue sem atendimento humano. ${a.note}`, {
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
        autoClose: false,
        onClick: () => history.push("/connections"),
      });
    });
    // enrollment fee confirmed by Efí
    socket.on("payment", (d) => {
      burst(window.innerWidth - 200, 90);
      toast.success(`💰 ${d.leadName} pagou a taxa de matrícula (${Number(d.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`, {
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
      toast.info(<AlertToast title="Nova tarefa para você" line={<>{t.title}{t.leadName ? <> — <b>{prettyName(t.leadName)}</b></> : null}</>} detail={t.by ? `Enviada por ${t.by}` : "Toque para abrir as tarefas"} />, {
        autoClose: 15000,
        onClick: () => history.push("/crm/tarefas?status=today"),
      });
      ding();
    });
    // a student was sent to the ambientação (the tutor receives it; the consultant who sold it sees where it went and when it ends)
    socket.on("onboardingAssigned", (a) => {
      if (a.userId !== user.id) return;
      window.dispatchEvent(new CustomEvent("tasks:changed", { detail: { remote: true } }));
      const mineAsTutor = a.tutorId === user.id;
      const title = a.kind === "done" ? "Ambientação concluída" : mineAsTutor ? "Aluno novo para ambientar" : "Seu aluno foi para a ambientação";
      toast.info(<AlertToast title={title} line={<><b>{prettyName(a.leadName)}</b>{a.poloName ? ` · ${a.poloName}` : ""}</>} detail="Toque para abrir a ambientação" />, {
        autoClose: 15000,
        onClick: () => history.push("/ambientacao"),
      });
      if (mineAsTutor) ding();
    });
    // a student entered the risk of dropping out
    socket.on("riskAlert", (a) => {
      const manager = user.profile === "admin" || user.role === "admin" || user.role === "coordenacao";
      if (!(manager || a.tutorId === user.id || a.ownerId === user.id)) return;
      toast.warn(<AlertToast title="Aluno em risco de evasão" line={<><b>{prettyName(a.leadName)}</b> está há {a.days} dias sem notícias</>} detail="Toque para abrir a Retenção" />, {
        autoClose: 20000,
        onClick: () => history.push("/crm/retencao"),
      });
    });
    return () => socket.disconnect();
  }, [user, history]);
  return null;
};

export default CrmReminders;
