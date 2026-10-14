import React, { useEffect, useState } from "react";
import { useParams, useHistory } from "react-router-dom";
import ShortcutsDialog from "../../components/ShortcutsDialog";
import clsx from "clsx";
import { makeStyles } from "@material-ui/core/styles";
import ChatBubbleOutline from "@material-ui/icons/ChatBubbleOutline";
import LockOutlined from "@material-ui/icons/LockOutlined";

import TicketsManager from "../../components/TicketsManager/";
import Ticket from "../../components/Ticket/";
import { wa } from "../../components/chat/chatTheme";

const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  return {
    root: {
      display: "flex",
      height: `calc(100% - ${theme.sizing.appBar}px)`,
      overflow: "hidden",
      backgroundColor: c.panelAlt,
      [theme.breakpoints.up("md")]: {
        margin: theme.spacing(1.5),
        height: `calc(100% - ${theme.sizing.appBar}px - ${theme.spacing(3)}px)`,
        borderRadius: 14,
        border: `1px solid ${c.divider}`,
        boxShadow: theme.palette.type === "dark" ? "none" : "0 1px 3px rgba(11,20,26,.08)",
      },
    },
    left: {
      flex: "none",
      width: "clamp(340px, 30%, 440px)",
      display: "flex",
      flexDirection: "column",
      minWidth: 0,
      borderRight: `1px solid ${c.divider}`,
      backgroundColor: c.panel,
      [theme.breakpoints.down("sm")]: { width: "100%", borderRight: "none" },
    },
    leftHidden: { [theme.breakpoints.down("sm")]: { display: "none" } },
    right: {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      backgroundColor: c.wallpaper,
    },
    rightHidden: { [theme.breakpoints.down("sm")]: { display: "none" } },
    empty: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing(1.5),
      textAlign: "center",
      padding: theme.spacing(4),
      backgroundColor: c.panelAlt,
      borderBottom: `6px solid ${c.accent}`,
      color: c.textSecondary,
    },
    emptyIcon: {
      width: 84,
      height: 84,
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.palette.type === "dark" ? "#182229" : "#e1f5ec",
      color: c.accent,
      "& svg": { fontSize: 44 },
    },
    emptyTitle: { color: c.text, fontSize: 30, fontWeight: 300, letterSpacing: "-0.01em" },
    emptyText: { maxWidth: 420, fontSize: 14, lineHeight: 1.5 },
    emptyNote: {
      marginTop: theme.spacing(6),
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 12,
      "& svg": { fontSize: 14 },
    },
  };
});

const Chat = () => {
  const classes = useStyles();
  const { ticketId } = useParams();
  const history = useHistory();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // keyboard shortcuts for the conversations screen (the list is on screen, so it is read straight from the page)
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "k") {
        e.preventDefault();
        const input = document.querySelector('input[placeholder^="Pesquisar nome"]');
        if (input) input.focus();
      } else if (mod && key === "/") {
        e.preventDefault();
        setShortcutsOpen(true);
      } else if (e.altKey && key === "n") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("openNewConversation"));
      } else if (e.altKey && key === "m") {
        e.preventDefault();
        const box = document.querySelector('textarea[placeholder="Digite uma mensagem"]');
        if (box) box.focus();
      } else if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        const ids = [...document.querySelectorAll("[data-ticket-id]")].filter((el) => el.offsetParent !== null).map((el) => el.getAttribute("data-ticket-id"));
        if (!ids.length) return;
        const at = ids.indexOf(String(ticketId));
        const next = e.key === "ArrowDown" ? (at + 1) % ids.length : (at <= 0 ? ids.length - 1 : at - 1);
        history.push(`/tickets/${ids[next]}`);
      }
    };
    const open = () => setShortcutsOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("openShortcuts", open);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("openShortcuts", open);
    };
  }, [ticketId, history]);

  return (
    <div className={classes.root}>
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <aside className={clsx(classes.left, ticketId && classes.leftHidden)}>
        <TicketsManager />
      </aside>
      <section className={clsx(classes.right, !ticketId && classes.rightHidden)}>
        {ticketId ? (
          <Ticket />
        ) : (
          <div className={classes.empty}>
            <div className={classes.emptyIcon}>
              <ChatBubbleOutline />
            </div>
            <div className={classes.emptyTitle}>Chat Acadêmico</div>
            <div className={classes.emptyText}>
              Selecione uma conversa à esquerda para começar a atender. Novas mensagens dos candidatos aparecem aqui em tempo
              real, de todos os canais.
            </div>
            <div className={classes.emptyNote}>
              <LockOutlined /> Conversas protegidas e separadas por etapa: cada equipe vê só o que é seu.
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default Chat;
