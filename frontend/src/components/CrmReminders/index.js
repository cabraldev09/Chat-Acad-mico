import { useContext, useEffect } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import openSocket from "../../services/socket-io";
import { AuthContext } from "../../context/Auth/AuthContext";
import { burst } from "../../pages/CRM/shared";
import alertSound from "../../assets/sound.mp3";
import { getSoundMode } from "../../utils/soundPrefs";

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
      toast.warn(`⚠️ ${a.name} está sem resposta há ${a.minutes} min`, {
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
      const needsManager = manager && (h.noQueue || h.fallback || !h.userId);
      if (!(mine || myQueue || needsManager)) return;
      toast.info(`🤝 ${h.name || "Um lead"} chegou do agente de IA${h.poloName ? ` (${h.poloName})` : ""}: ${h.reason}${h.noQueue ? ". Não há fila comercial com consultores: alguém da gestão precisa assumir." : h.fallback ? ". Veio pela fila de reserva." : ""}${h.outside && h.when ? ` A equipe responde ${h.when}.` : ""}`, {
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
    return () => socket.disconnect();
  }, [user, history]);
  return null;
};

export default CrmReminders;
