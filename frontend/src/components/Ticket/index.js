import React, { useState, useEffect, useContext } from "react";
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

// "Novo aluno": the administration's greeting, ready to edit and send by the tutor. It disappears once someone answers.
const WelcomeBanner = ({ ticket }) => {
  const [welcome, setWelcome] = useState(null);
  useEffect(() => {
    setWelcome(null);
    if (!ticket.id || ticket.segment !== "onboarding" || ticket.firstResponseAt) return;
    api.get(`/tickets/${ticket.id}/welcome`).then(({ data }) => setWelcome(data)).catch(() => undefined);
  }, [ticket.id, ticket.segment, ticket.firstResponseAt, ticket.status]);
  if (!welcome || !welcome.show) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 16px", background: "rgba(6,147,227,.1)", borderBottom: "1px solid rgba(6,147,227,.25)", fontSize: 14 }}>
      <span style={{ flex: 1, minWidth: 220 }}><b>Novo aluno para ambientar.</b> A mensagem de boas-vindas não é enviada sozinha: use o texto pronto e envie quando quiser.</span>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("fillMessageInput", { detail: { ticketId: ticket.id, text: welcome.text } }))}
        style={{ border: 0, borderRadius: 10, background: "#0B4279", color: "#fff", padding: "8px 14px", fontFamily: "inherit", fontWeight: 600, cursor: "pointer" }}>
        Usar texto de boas-vindas
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
      toast.success("Você assumiu a conversa. O agente de IA parou de responder.");
    } catch (err) {
      toastError(err);
    }
    setBusy(false);
  };
  return (
    <div role="status" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 16px", background: "linear-gradient(90deg, #0f766e 0%, #0e7490 100%)", color: "#fff", fontSize: 14 }}>
      <style>{"@keyframes aiPulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.7)}70%{box-shadow:0 0 0 10px rgba(255,255,255,0)}100%{box-shadow:0 0 0 0 rgba(255,255,255,0)}}@media (prefers-reduced-motion: reduce){.ai-pulse{animation:none!important}}"}</style>
      <span className="ai-pulse" style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,.18)", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none", animation: "aiPulse 1.8s infinite" }}>
        <Bot size={19} />
      </span>
      <span style={{ flex: 1, minWidth: 220 }}>
        <b>O agente de IA está atendendo este lead agora.</b> Acompanhe as respostas aqui. Para assumir, clique em Assumir: o agente para na hora e a conversa passa a ser sua.
      </span>
      <button type="button" disabled={busy} onClick={take} style={{ border: 0, borderRadius: 10, background: "#fff", color: "#0f766e", padding: "8px 16px", fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>
        Assumir conversa
      </button>
      <button type="button" onClick={showWhy} style={{ border: "1px solid rgba(255,255,255,.6)", borderRadius: 10, background: "transparent", color: "#fff", padding: "7px 14px", fontFamily: "inherit", fontWeight: 600, cursor: "pointer" }}>
        {why ? "Esconder o que o robô fez" : "Ver o que o robô fez"}
      </button>
      {why && (
        <div style={{ flexBasis: "100%", background: "rgba(0,0,0,.22)", borderRadius: 10, padding: "8px 12px", fontSize: 13 }}>
          {why.lines.length ? why.lines.map((l, i) => (
            <div key={i}>{new Date(l.at).toLocaleTimeString("pt-BR", { timeZone: "America/Porto_Velho" })} · {l.text}</div>
          )) : <div>O servidor ainda não registrou nada para esta conversa (isso acontece logo depois de ele reiniciar). Mande outra mensagem e abra de novo.</div>}
        </div>
      )}
    </div>
  );
};

// The conversation a person took from the agent: the five lines of what the agent learned (what the lead wants, how warm, objections, doubt,
// next step) and "Sugerir resposta", the next answer written by the agent for the consultant to read, send or edit
const HandoffPanel = ({ ticket }) => {
  const [summary, setSummary] = useState(null);
  const [open, setOpen] = useState(true);
  const [suggestion, setSuggestion] = useState(null);
  const [busy, setBusy] = useState(false);
  const show = !!ticket.id && !ticket.aiActive && !!ticket.userId && ticket.status === "open" && !ticket.isGroup && !ticket.isHistorical;
  useEffect(() => {
    setSummary(null);
    setSuggestion(null);
    if (!show) return;
    api.get(`/tickets/${ticket.id}/ai-summary`).then(({ data }) => setSummary(data)).catch(() => setSummary({ lines: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id, show]);
  if (!show) return null;
  const suggest = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/tickets/${ticket.id}/suggest-reply`);
      if (data.text) setSuggestion(data.text);
      else toast.info(data.note || "Sem sugestão agora.");
    } catch (err) {
      toastError(err);
    }
    setBusy(false);
  };
  const send = async () => {
    setBusy(true);
    try {
      await api.post(`/messages/${ticket.id}`, { body: suggestion });
      setSuggestion(null);
    } catch (err) {
      toastError(err);
    }
    setBusy(false);
  };
  const edit = () => {
    window.dispatchEvent(new CustomEvent("fillMessageInput", { detail: { ticketId: ticket.id, text: suggestion } }));
    setSuggestion(null);
  };
  const lines = (summary && summary.lines) || [];
  const btn = { border: 0, borderRadius: 8, padding: "6px 12px", fontFamily: "inherit", fontWeight: 600, cursor: "pointer", fontSize: 13 };
  return (
    <div style={{ padding: "8px 14px", background: "rgba(15,118,110,.08)", borderBottom: "1px solid rgba(15,118,110,.18)", fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Bot size={16} color="#0f766e" />
        <b style={{ color: "#0f766e" }}>{lines.length ? "Resumo do agente de IA" : "Agente de IA"}</b>
        {summary && summary.why && <span style={{ opacity: 0.75 }}>· veio para você porque {summary.why}</span>}
        <span style={{ flex: 1 }} />
        {lines.length > 0 && <button type="button" onClick={() => setOpen((v) => !v)} style={{ ...btn, background: "transparent", color: "#0f766e" }}>{open ? "Esconder" : "Ver resumo"}</button>}
        <button type="button" disabled={busy} onClick={suggest} style={{ ...btn, background: "#0f766e", color: "#fff" }}>{busy && !suggestion ? "Escrevendo…" : "Sugerir resposta"}</button>
      </div>
      {open && lines.length > 0 && (
        <ul style={{ margin: "6px 0 0", paddingLeft: 26, lineHeight: 1.5 }}>
          {lines.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      )}
      {suggestion && (
        <div style={{ marginTop: 8, background: "rgba(255,255,255,.7)", borderRadius: 10, padding: "8px 10px" }}>
          <div style={{ whiteSpace: "pre-wrap", marginBottom: 8 }}>{suggestion}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" disabled={busy} onClick={send} style={{ ...btn, background: "#0f766e", color: "#fff" }}>Enviar</button>
            <button type="button" onClick={edit} style={{ ...btn, background: "transparent", color: "#0f766e", border: "1px solid #0f766e" }}>Editar antes</button>
            <button type="button" onClick={() => setSuggestion(null)} style={{ ...btn, background: "transparent", color: "inherit" }}>Descartar</button>
          </div>
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
        <HandoffPanel ticket={ticket} />
        <WelcomeBanner ticket={ticket} />
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
      <ContactDrawer open={drawerOpen} handleDrawerClose={() => setDrawerOpen(false)} contact={contact} loading={loading} />
    </div>
  );
};

export default Ticket;
