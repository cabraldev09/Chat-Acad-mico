import React, { useState, useEffect, useContext, useCallback } from "react";
import { useParams, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { makeStyles } from "@material-ui/core";
import Search from "@material-ui/icons/Search";
import KeyboardArrowUp from "@material-ui/icons/KeyboardArrowUp";
import KeyboardArrowDown from "@material-ui/icons/KeyboardArrowDown";
import Close from "@material-ui/icons/Close";
import { Bot } from "lucide-react";
import IconButton from "@material-ui/core/IconButton";
import InputBase from "@material-ui/core/InputBase";

import openSocket from "../../services/socket-io";
import ContactDrawer from "../ContactDrawer";
import MessageInput from "../MessageInput/";
import MessagesList from "../MessagesList";
import ChatHeader from "../chat/ChatHeader";
import api from "../../services/api";
import { ReplyMessageProvider } from "../../context/ReplyingMessage/ReplyingMessageContext";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";
import { wa } from "../chat/chatTheme";
import { AuthContext } from "../../context/Auth/AuthContext";
import TeamBar from "../TeamBar";
import Copilot from "../Copilot";
import { setTyping, clearTyping, useTyping } from "../../utils/typingStore";

const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  return {
    root: { display: "flex", height: "100%", position: "relative", overflow: "hidden" },
    main: { flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" },
    searchBar: {
      flex: "none",
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      padding: theme.spacing(0.75, 1.5),
      backgroundColor: c.header,
      borderBottom: `1px solid ${c.divider}`,
      color: c.textSecondary,
    },
    searchInput: {
      flex: 1,
      height: 36,
      padding: theme.spacing(0, 1.5),
      borderRadius: 10,
      backgroundColor: c.panel,
      color: c.text,
      fontSize: 14,
    },
    count: { fontSize: 13, minWidth: 54, textAlign: "center" },
  };
});

// The first approach of the tutor: who the person is (the data of the enrollment) and the text ready to edit and send. It disappears
// once someone answers. A contact with no enrollment is told apart, so the tutor confirms who it is before the onboarding.
const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "");
const WelcomeBanner = ({ ticket }) => {
  const [welcome, setWelcome] = useState(null);
  useEffect(() => {
    setWelcome(null);
    if (!ticket.id || ticket.segment !== "onboarding" || ticket.firstResponseAt) return;
    api.get(`/tickets/${ticket.id}/welcome`).then(({ data }) => setWelcome(data)).catch(() => undefined);
  }, [ticket.id, ticket.segment, ticket.firstResponseAt, ticket.status]);
  if (!welcome || !welcome.show) return null;
  const f = welcome.facts || {};
  const line = [f.courseName, f.poloName && `Polo ${f.poloName}`, f.rgm && `RGM ${f.rgm}`, f.enrolledAt && `matrícula em ${fmtDay(f.enrolledAt)}`, f.consultantName && `consultor ${f.consultantName}`].filter(Boolean).join(" · ");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 16px", background: welcome.enrolled ? "rgba(6,147,227,.1)" : "rgba(217,119,6,.1)", borderBottom: `1px solid ${welcome.enrolled ? "rgba(6,147,227,.25)" : "rgba(217,119,6,.3)"}`, fontSize: 14 }}>
      <div style={{ flex: 1, minWidth: 220, display: "grid", gap: 2 }}>
        {welcome.enrolled ? (
          <>
            <span><b>Aluno novo para ambientar.</b> O texto de apresentação não é enviado sozinho: confira e envie.</span>
            {line && <span style={{ fontSize: 13, opacity: 0.85 }}>{line}</span>}
            {f.note && <span style={{ fontSize: 13, opacity: 0.85 }}>Observação do consultor: {f.note}</span>}
          </>
        ) : (
          <span><b>Contato sem matrícula no sistema.</b> Confirme quem é antes de começar a ambientação.</span>
        )}
      </div>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("fillMessageInput", { detail: { ticketId: ticket.id, text: welcome.text } }))}
        style={{ border: 0, borderRadius: 10, background: "#0B4279", color: "#fff", padding: "8px 14px", fontFamily: "inherit", fontWeight: 600, cursor: "pointer" }}>
        Usar texto de apresentação
      </button>
    </div>
  );
};

// The AI agent is talking to this lead: a bar nobody misses, so the team follows the conversation and steps in when needed.
const AiBanner = ({ ticket }) => {
  const { user } = useContext(AuthContext);
  const [busy, setBusy] = useState(false);
  // what the robot decided in this conversation (started, did not start and why, failed and why)
  const [why, setWhy] = useState(null);
  if (!ticket.id || !ticket.aiActive || ticket.userId || ticket.status === "closed" || ticket.isGroup || ticket.isHistorical) return null;
  const showWhy = async () => {
    if (why) { setWhy(null); return; }
    try {
      const { data } = await api.get(`/tickets/${ticket.id}/automation`);
      setWhy({ lines: data.lines || [] });
    } catch (err) {
      toastError(err);
    }
  };
  const take = async () => {
    setBusy(true);
    try {
      await api.post(`/tickets/${ticket.id}/claim`);
      toast.success("Você assumiu de novo. A IA parou de responder.");
    } catch (err) {
      toastError(err);
    }
    setBusy(false);
  };
  return (
    <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "5px 12px", minHeight: 40, background: "var(--surface-2, #f0fdfa)", borderBottom: "1px solid var(--line, #e2e8f0)", color: "var(--text-1, #0f172a)", fontSize: 13 }}>
      {/* compact: one line that does not take the room of the messages */}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, background: "#0f766e", color: "#fff", fontWeight: 700, fontSize: 12, flex: "none" }}>
        <Bot size={14} /> IA qualificando
      </span>
      <span style={{ flex: "1 1 160px", minWidth: 0, color: "var(--text-2, #475569)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={`Quando a IA terminar, a conversa volta ${ticket.aiReturnUserId ? "para quem passou o lead" : "para a equipe"}.`}>
        Ao terminar, volta {ticket.aiReturnUserId ? "para quem passou o lead" : "para a equipe"}
      </span>
      <button type="button" onClick={showWhy} style={{ border: 0, background: "transparent", color: "#0f766e", padding: "4px 6px", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        {why ? "Esconder" : "O que a IA fez"}
      </button>
      <button type="button" disabled={busy} onClick={take} style={{ border: "1px solid #0f766e", borderRadius: 8, background: "var(--surface, #fff)", color: "#0f766e", padding: "4px 12px", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
        Assumir de novo
      </button>
      {why && (
        <div style={{ flexBasis: "100%", maxHeight: "30vh", overflowY: "auto", background: "var(--surface, #fff)", border: "1px solid var(--line, #e2e8f0)", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
          {why.lines.length ? why.lines.map((l, i) => (
            <div key={i}>{new Date(l.at).toLocaleTimeString("pt-BR", { timeZone: "America/Porto_Velho" })} · {l.text}</div>
          )) : <div>O servidor ainda não registrou nada para esta conversa (isso acontece logo depois de ele reiniciar). Mande outra mensagem e abra de novo.</div>}
        </div>
      )}
    </div>
  );
};

const Ticket = () => {
  const { ticketId } = useParams();
  const history = useHistory();
  const classes = useStyles();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState({});
  const [ticket, setTicket] = useState({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const typing = useTyping(ticketId);
  const [matches, setMatches] = useState(0);
  const [matchIndex, setMatchIndex] = useState(0);

  useEffect(() => {
    setSearchOpen(false);
    setSearchTerm("");
    setDrawerOpen(false);
  }, [ticketId]);

  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      const fetchTicket = async () => {
        try {
          const { data } = await api.get("/tickets/" + ticketId);
          setContact(data.contact || {});
          setTicket(data);
          setLoading(false);
        } catch (err) {
          setLoading(false);
          toastError(err);
        }
      };
      fetchTicket();
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [ticketId, history]);

  useEffect(() => {
    const socket = openSocket(`chat:${ticketId}`);

    socket.on("connect", () => socket.emit("joinChatBox", ticketId));

    socket.on("ticket", (data) => {
      if (data.action === "update" && +data.ticket?.id === +ticketId) {
        setTicket(data.ticket);
      }
      if (data.action === "tags" && +data.ticketId === +ticketId) {
        setTicket((prev) => ({ ...prev, tags: data.tags }));
      }
      if (data.action === "delete" && +data.ticketId === +ticketId) {
        toast.success("Conversa excluída.");
        history.push("/tickets");
      }
    });

    socket.on("copilot", (data) => {
      if (data.action === "config" || +data.ticketId === +ticketId) {
        window.dispatchEvent(new CustomEvent("copilotRefresh", { detail: data.action === "config" ? {} : { ticketId } }));
      }
    });

    // who is typing: the web chat visitor, the lead of a WhatsApp number, or the AI agent (the lists share the same store)
    socket.on("typing", (data) => {
      if (+data.ticketId !== +ticketId) return;
      setTyping(data.ticketId, data.from, data.kind, data.ms);
    });

    // a new message keeps the header honest: when it changed who has the conversation (a person took it, the agent left, it was reopened),
    // the open chat reads it again instead of waiting for somebody to reload; the person who wrote is not typing anymore
    socket.on("appMessage", (data) => {
      if (data.action !== "create" || +data.message?.ticketId !== +ticketId) return;
      if (!data.message.fromMe) clearTyping(ticketId);
      window.dispatchEvent(new CustomEvent("copilotRefresh", { detail: { ticketId } }));
      const next = data.ticket;
      if (!next) return;
      setTicket((prev) => {
        if (prev.id && (prev.status !== next.status || (prev.userId || null) !== (next.userId || null) || !!prev.aiActive !== !!next.aiActive || (prev.queueId || null) !== (next.queueId || null))) {
          api.get("/tickets/" + ticketId).then(({ data: fresh }) => setTicket(fresh)).catch(() => undefined);
        }
        return prev;
      });
    });

    // a message this person wrote that the channel did not accept (the conversation is theirs already; the text is not lost on screen)
    socket.on("outboundMessage", (data) => {
      if (data.action === "failed" && +data.ticketId === +ticketId) {
        toast.error(data.error === "ownership_changed" ? "A conversa mudou de atendente antes do envio. A mensagem não foi enviada." : data.error === "ERR_REPLY_WINDOW_CLOSED" ? i18n.t("backendErrors.ERR_REPLY_WINDOW_CLOSED") : "Uma mensagem não foi enviada. Confira a conversa e tente de novo.", { toastId: `out-${data.id}` });
      }
    });

    socket.on("contact", (data) => {
      if (data.action === "update") {
        setContact((prev) => (prev.id === data.contact?.id ? { ...prev, ...data.contact } : prev));
      }
    });

    return () => {
      setTyping(ticketId, null, "idle");
      socket.disconnect();
    };
  }, [ticketId, history]);

  const step = (dir) => {
    if (!matches) return;
    setMatchIndex((i) => (i + dir + matches) % matches);
  };

  return (
    <div className={classes.root} id="drawer-container">
      <div className={classes.main}>
        {loading ? (
          <div style={{ height: 60, flex: "none" }} />
        ) : (
          <ChatHeader
            contact={contact}
            ticket={ticket}
            onOpenInfo={() => setDrawerOpen(true)}
            onToggleSearch={() => setSearchOpen((v) => !v)}
            typing={typing}
          />
        )}
        {searchOpen && (
          <div className={classes.searchBar}>
            <Search />
            <InputBase
              autoFocus
              className={classes.searchInput}
              placeholder="Pesquisar nas mensagens carregadas"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setMatchIndex(0);
              }}
              onKeyDown={(e) => e.key === "Enter" && step(e.shiftKey ? -1 : 1)}
            />
            <span className={classes.count}>{searchTerm ? (matches ? `${matchIndex + 1} de ${matches}` : "Nenhuma") : ""}</span>
            <IconButton aria-label="Mostrar menos" size="small" onClick={() => step(-1)} disabled={!matches}>
              <KeyboardArrowUp />
            </IconButton>
            <IconButton aria-label="Mostrar mais" size="small" onClick={() => step(1)} disabled={!matches}>
              <KeyboardArrowDown />
            </IconButton>
            <IconButton aria-label="Fechar" size="small" onClick={() => { setSearchOpen(false); setSearchTerm(""); }}>
              <Close />
            </IconButton>
          </div>
        )}
        <AiBanner ticket={ticket} />
        <Copilot ticket={ticket} />
        <WelcomeBanner ticket={ticket} />
        <TeamBar ticket={ticket} />
        <ReplyMessageProvider>
          <MessagesList
            ticketId={ticketId}
            live={(!!ticket.aiActive && !ticket.userId && ticket.status !== "closed") || ticket.status === "pending"}
            isGroup={ticket.isGroup}
            channel={ticket.whatsapp?.channel}
            searchTerm={searchOpen ? searchTerm : ""}
            matchIndex={matchIndex}
            onMatches={setMatches}
          />
          <MessageInput channel={ticket.whatsapp?.channel || "whatsapp"} ticketStatus={ticket.status} ticketUserId={ticket.userId || null} ticketUserName={ticket.user?.name || ""} aiActive={!!ticket.aiActive} historical={!!ticket.isHistorical} isGroup={!!ticket.isGroup || !!contact.isStaff} readOnly={!!contact.readOnly} contactName={contact.name} />
        </ReplyMessageProvider>
      </div>
      <ContactDrawer open={drawerOpen} handleDrawerClose={() => setDrawerOpen(false)} contact={contact} loading={loading} attendantId={ticket?.userId || null} />
    </div>
  );
};

export default Ticket;
