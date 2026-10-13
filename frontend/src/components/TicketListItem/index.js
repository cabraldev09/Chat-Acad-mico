import React, { useState, useEffect, useRef, useContext } from "react";
import { useHistory, useParams } from "react-router-dom";
import clsx from "clsx";
import { makeStyles } from "@material-ui/core/styles";
import Avatar from "@material-ui/core/Avatar";
import Tooltip from "@material-ui/core/Tooltip";
import CircularProgress from "@material-ui/core/CircularProgress";
import Group from "@material-ui/icons/Group";

import ChannelIcon from "../ChannelIcon";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { wa, dayLabel, clock } from "../chat/chatTheme";

const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  return {
    row: {
      position: "relative",
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1.5),
      padding: theme.spacing(0, 1.5, 0, 1.5),
      minHeight: 72,
      cursor: "pointer",
      backgroundColor: c.panel,
      transition: "background-color .12s",
      "&:hover": { backgroundColor: c.hover },
    },
    selected: { backgroundColor: `${c.selected} !important` },
    avatarWrap: { position: "relative", flex: "none" },
    avatar: { width: 49, height: 49, backgroundColor: theme.palette.type === "dark" ? "#6b7c85" : "#dfe5e7", color: "#fff" },
    channel: {
      position: "absolute",
      right: -3,
      bottom: -2,
      width: 20,
      height: 20,
      borderRadius: "50%",
      backgroundColor: c.panel,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: `0 0 0 2px ${c.panel}`,
    },
    content: {
      flex: 1,
      minWidth: 0,
      alignSelf: "stretch",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      gap: 3,
      borderBottom: `1px solid ${c.divider}`,
    },
    line: { display: "flex", alignItems: "center", gap: theme.spacing(1), minWidth: 0 },
    name: { flex: 1, minWidth: 0, fontSize: 16, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    time: { flex: "none", fontSize: 12, color: c.textSecondary },
    timeUnread: { color: c.badge, fontWeight: 600 },
    preview: {
      flex: 1,
      minWidth: 0,
      fontSize: 14,
      color: c.textSecondary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    badge: {
      flex: "none",
      minWidth: 20,
      height: 20,
      padding: "0 6px",
      borderRadius: 10,
      fontSize: 12,
      fontWeight: 600,
      lineHeight: "20px",
      textAlign: "center",
      backgroundColor: c.badge,
      color: c.badgeText,
    },
    meta: { display: "flex", alignItems: "center", gap: 6, minWidth: 0, flexWrap: "nowrap", overflow: "hidden" },
    pill: {
      flex: "none",
      maxWidth: 110,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      padding: "0 7px",
      borderRadius: 999,
      fontSize: 11,
      lineHeight: "17px",
      backgroundColor: c.panelAlt,
      color: c.textSecondary,
    },
    dot: { flex: "none", width: 8, height: 8, borderRadius: "50%" },
    accept: {
      flex: "none",
      height: 30,
      padding: "0 14px",
      borderRadius: 999,
      border: "none",
      cursor: "pointer",
      fontFamily: "inherit",
      fontSize: 13,
      fontWeight: 600,
      color: "#fff",
      backgroundColor: c.accent,
      "&:hover": { filter: "brightness(1.08)" },
      "&:disabled": { opacity: 0.7, cursor: "default" },
    },
    closed: { opacity: 0.8 },
  };
});

// markdown markers and the invisible bot mark would look odd in a one-line preview
const plain = (text) =>
  String(text || "")
    .replace(/‎/g, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s*\n\s*/g, " ")
    .trim();

const stamp = (iso) => {
  const d = new Date(iso);
  const label = dayLabel(d);
  return label === "Hoje" ? clock(d) : label === "Ontem" ? "Ontem" : d.toLocaleDateString("pt-BR");
};

const TicketListItem = ({ ticket }) => {
  const classes = useStyles();
  const history = useHistory();
  const [loading, setLoading] = useState(false);
  const { ticketId } = useParams();
  const isMounted = useRef(true);
  const { user } = useContext(AuthContext);

  useEffect(
    () => () => {
      isMounted.current = false;
    },
    []
  );

  const accept = async (e) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await api.put(`/tickets/${ticket.id}`, { status: "open", userId: user?.id });
      history.push(`/tickets/${ticket.id}`);
    } catch (err) {
      toastError(err);
    }
    if (isMounted.current) setLoading(false);
  };

  const unread = ticket.unreadMessages > 0;
  const selected = ticketId && +ticketId === ticket.id;

  return (
    <div
      role="button"
      tabIndex={0}
      className={clsx(classes.row, selected && classes.selected, ticket.status === "closed" && classes.closed)}
      onClick={() => ticket.status !== "pending" && history.push(`/tickets/${ticket.id}`)}
      onKeyDown={(e) => e.key === "Enter" && ticket.status !== "pending" && history.push(`/tickets/${ticket.id}`)}
    >
      <div className={classes.avatarWrap}>
        <Avatar className={classes.avatar} src={ticket?.contact?.profilePicUrl}>
          {ticket.isGroup ? <Group /> : ticket.contact.name.charAt(0)}
        </Avatar>
        <span className={classes.channel}>
          <ChannelIcon channel={ticket.whatsapp?.channel} size={13} />
        </span>
      </div>
      <div className={classes.content}>
        <div className={classes.line}>
          <span className={classes.name} style={{ fontWeight: unread ? 600 : 400 }}>
            {ticket.contact.name}
          </span>
          {ticket.lastMessage && (
            <span className={clsx(classes.time, unread && classes.timeUnread)}>{stamp(ticket.updatedAt)}</span>
          )}
        </div>
        <div className={classes.line}>
          <span className={classes.preview} style={unread ? { color: undefined, fontWeight: 500 } : undefined}>
            {plain(ticket.lastMessage) || "Sem mensagens"}
          </span>
          {ticket.status === "pending" ? (
            <button type="button" className={classes.accept} onClick={accept} disabled={loading}>
              {loading ? <CircularProgress size={14} color="inherit" /> : "Aceitar"}
            </button>
          ) : (
            unread && <span className={classes.badge}>{ticket.unreadMessages > 99 ? "99+" : ticket.unreadMessages}</span>
          )}
        </div>
        <div className={classes.meta}>
          <Tooltip arrow title={ticket.queue?.name || "Sem fila"}>
            <span className={classes.dot} style={{ backgroundColor: ticket.queue?.color || "#9aa4ab" }} />
          </Tooltip>
          {ticket.queue?.name && <span className={classes.pill}>{ticket.queue.name}</span>}
          {ticket.user?.name && <span className={classes.pill}>{ticket.user.name.split(" ")[0]}</span>}
          {(ticket.tags || []).slice(0, 2).map((t) => (
            <span key={t.id} title={t.name} className={classes.pill} style={{ backgroundColor: t.color, color: "#fff" }}>
              {t.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TicketListItem;
