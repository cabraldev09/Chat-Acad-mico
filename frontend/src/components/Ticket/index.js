import React, { useState, useEffect } from "react";
import { useParams, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { makeStyles } from "@material-ui/core";
import Search from "@material-ui/icons/Search";
import KeyboardArrowUp from "@material-ui/icons/KeyboardArrowUp";
import KeyboardArrowDown from "@material-ui/icons/KeyboardArrowDown";
import Close from "@material-ui/icons/Close";
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
import { wa } from "../chat/chatTheme";

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
  const [contactTyping, setContactTyping] = useState(false);
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

    // only the web chat reports that the visitor is typing; other channels never send it
    let typingTimer;
    socket.on("typing", (data) => {
      if (+data.ticketId !== +ticketId) return;
      setContactTyping(true);
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => setContactTyping(false), 5000);
    });

    socket.on("contact", (data) => {
      if (data.action === "update") {
        setContact((prev) => (prev.id === data.contact?.id ? { ...prev, ...data.contact } : prev));
      }
    });

    return () => {
      clearTimeout(typingTimer);
      setContactTyping(false);
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
            typing={contactTyping}
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
            <IconButton size="small" onClick={() => step(-1)} disabled={!matches}>
              <KeyboardArrowUp />
            </IconButton>
            <IconButton size="small" onClick={() => step(1)} disabled={!matches}>
              <KeyboardArrowDown />
            </IconButton>
            <IconButton size="small" onClick={() => { setSearchOpen(false); setSearchTerm(""); }}>
              <Close />
            </IconButton>
          </div>
        )}
        <WelcomeBanner ticket={ticket} />
        <ReplyMessageProvider>
          <MessagesList
            ticketId={ticketId}
            isGroup={ticket.isGroup}
            channel={ticket.whatsapp?.channel}
            searchTerm={searchOpen ? searchTerm : ""}
            matchIndex={matchIndex}
            onMatches={setMatches}
          />
          <MessageInput channel={ticket.whatsapp?.channel || "whatsapp"} ticketStatus={ticket.status} historical={!!ticket.isHistorical} isGroup={!!ticket.isGroup || !!contact.isStaff} readOnly={!!contact.readOnly} contactName={contact.name} />
        </ReplyMessageProvider>
      </div>
      <ContactDrawer open={drawerOpen} handleDrawerClose={() => setDrawerOpen(false)} contact={contact} loading={loading} />
    </div>
  );
};

export default Ticket;
