import React, { useState, useEffect, useRef, useContext } from "react";
import { useHistory, useParams } from "react-router-dom";
import clsx from "clsx";
import { makeStyles } from "@material-ui/core/styles";
import Avatar from "@material-ui/core/Avatar";
import Tooltip from "@material-ui/core/Tooltip";
import CircularProgress from "@material-ui/core/CircularProgress";
import Group from "@material-ui/icons/Group";
import Menu from "@material-ui/core/Menu";
import MenuItem from "@material-ui/core/MenuItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import { Pin, PinOff, Archive, ArchiveRestore, ChevronDown, BellOff, BellRing, MailOpen, Check, CheckCheck, Clock, AlertCircle, Camera, Video, Mic, FileText, MapPin, Contact, Sticker, Bot } from "lucide-react";
import { getDraft } from "../../utils/drafts";
import { getContactSound, onSoundPrefsChange } from "../../utils/soundPrefs";

import ChannelIcon from "../ChannelIcon";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";
import { useTyping, typingText } from "../../utils/typingStore";
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
    // the labels share the line: when they do not all fit, each one gets shorter with "..." instead of the last being cut in half
    pill: {
      flex: "0 1 auto",
      minWidth: 0,
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
    pin: { flex: "none", color: c.textSecondary, display: "flex" },
    tick: { display: "inline-flex", verticalAlign: "-3px", marginRight: 4, color: c.textSecondary },
    more: {
      flex: "none",
      width: 24,
      height: 24,
      padding: 0,
      border: "none",
      borderRadius: "50%",
      background: "transparent",
      color: c.textSecondary,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      opacity: 0,
      transition: "opacity .12s",
      "$row:hover &, &:focus-visible": { opacity: 1 },
      "@media (hover: none)": { opacity: 1 },
      "&:hover": { backgroundColor: c.hover },
    },
  };
});

// markdown markers and the invisible bot mark would look odd in a one-line preview
// WhatsApp previews media with an icon and a short label instead of a file name
const KIND = {
  image: [Camera, "Foto"],
  video: [Video, "Vídeo"],
  audio: [Mic, "Áudio"],
  ptt: [Mic, "Mensagem de voz"],
  document: [FileText, ""],
  location: [MapPin, "Localização"],
  vcard: [Contact, "Contato"],
  sticker: [Sticker, "Figurinha"],
};

const plain = (text) =>
  String(text || "")
    .replace(/‎/g, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s*\n\s*/g, " ")
    .trim();

export const stamp = (iso) => {
  const d = new Date(iso);
  const label = dayLabel(d);
  if (label === "Hoje") return clock(d);
  if (label === "Ontem") return "Ontem";
  // like WhatsApp: the weekday for the last week, the date after that
  if (Date.now() - d.getTime() < 6 * 86400000) return d.toLocaleDateString("pt-BR", { weekday: "long" });
  return d.toLocaleDateString("pt-BR");
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

  // a waiting conversation can be read before it is accepted: always by the administration, and by the team when it already sits in a polo's queue
  // (the agent may be talking to the lead; whoever wants to step in accepts it)
  const canOpen = ticket.status !== "pending" || !!ticket.isGroup || isManager(user) || !!ticket.queue;

  const typing = useTyping(ticket.id);

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

  const [menuEl, setMenuEl] = useState(null);
  const [soundPref, setSoundPref] = useState("default");
  useEffect(() => {
    const refresh = () => setSoundPref(getContactSound(ticket.contact && ticket.contact.id));
    refresh();
    return onSoundPrefsChange(refresh);
  }, [ticket.contact && ticket.contact.id]);
  const run = async (e, fn) => {
    e.stopPropagation();
    setMenuEl(null);
    try {
      await fn();
    } catch (err) {
      toastError(err);
    }
  };
  const togglePin = (e) =>
    run(e, async () => {
      const pinned = !ticket.pinned;
      await api.put(`/tickets/${ticket.id}/pin`, { pinned });
      window.dispatchEvent(new CustomEvent("ticketPinned", { detail: { ticketId: ticket.id, pinned } }));
    });
  const toggleArchive = (e) =>
    run(e, () => api.put(`/tickets/${ticket.id}/archive`, { archived: !ticket.archivedAt }));

  const unread = ticket.unreadMessages > 0;
  const selected = ticketId && +ticketId === ticket.id;

  // unsent text typed in this conversation (kept on this device)
  const [, bumpDraft] = useState(0);
  useEffect(() => {
    const onDraft = (e) => e.detail && e.detail.ticketId === ticket.id && bumpDraft((n) => n + 1);
    window.addEventListener("chatDraft", onDraft);
    return () => window.removeEventListener("chatDraft", onDraft);
  }, [ticket.id]);
  const draft = !selected ? getDraft(ticket.id) : "";
  // a contact card shows the person's name, never the card's raw text
  const cardName = /^\s*BEGIN:VCARD/i.test(ticket.lastMessage || "") ? ((/(?:^|\n)FN[^:\n]*:([^\n\r]+)/i.exec(ticket.lastMessage) || [])[1] || "Contato").trim() : null;
  const kindOf = KIND[cardName ? "vcard" : ticket.lastMessageType] || [];
  const previewText = cardName || (ticket.lastMessageType === "vcard" ? String(ticket.lastMessage || "").replace(/^👤\s*/, "") : null) || plain(ticket.lastMessage) || kindOf[1] || "";
  const [KindIcon, kindLabel] = KIND[cardName ? "vcard" : ticket.lastMessageType] || [];

  return (
    <div
      role="button"
      tabIndex={0}
      data-ticket-id={ticket.id}
      className={clsx(classes.row, selected && classes.selected, ticket.status === "closed" && classes.closed)}
      onClick={() => canOpen && history.push(`/tickets/${ticket.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && canOpen) history.push(`/tickets/${ticket.id}`);
        // arrow keys walk the list like WhatsApp Web (only rows that are on screen: other tabs stay mounted, hidden)
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          const rows = Array.from(document.querySelectorAll("[data-ticket-id]")).filter((el) => el.offsetParent !== null);
          const next = rows[rows.indexOf(e.currentTarget) + (e.key === "ArrowDown" ? 1 : -1)];
          if (next) {
            e.preventDefault();
            next.focus();
            next.scrollIntoView({ block: "nearest" });
          }
        }
      }}
    >
      <div className={classes.avatarWrap}>
        <Avatar className={classes.avatar} src={ticket?.contact?.profilePicUrl}>
          {ticket.isGroup ? <Group /> : String((ticket.contact && ticket.contact.name) || "?").charAt(0)}
        </Avatar>
        <span className={classes.channel}>
          <ChannelIcon channel={ticket.whatsapp?.channel} size={13} />
        </span>
      </div>
      <div className={classes.content}>
        <div className={classes.line}>
          <span className={classes.name} style={{ fontWeight: unread ? 600 : 400 }}>
            {(ticket.contact && ticket.contact.name) || "Sem nome"}
          </span>
          {ticket.lastMessage && (
            <span className={clsx(classes.time, unread && classes.timeUnread)}>{stamp(ticket.lastMessageAt || ticket.updatedAt)}</span>
          )}
        </div>
        <div className={classes.line}>
          <span className={classes.preview} style={unread ? { color: undefined, fontWeight: 500 } : undefined}>
            {ticket.lastMessageFromMe && ticket.lastMessage && (
              <span className={classes.tick} title={ticket.lastMessageAck < 0 ? "Falha no envio" : ["Enviando", "Enviada", "Entregue", "Lida", "Ouvida"][ticket.lastMessageAck] || ""} style={{ color: ticket.lastMessageAck >= 3 ? "#53bdeb" : ticket.lastMessageAck < 0 ? "#ea0038" : undefined }}>
                {ticket.lastMessageAck < 0 ? <AlertCircle size={15} /> : (ticket.lastMessageAck === 0 && Date.now() - new Date(ticket.lastMessageAt || ticket.updatedAt).getTime() < 120000) ? <Clock size={14} /> : ticket.lastMessageAck === 1 ? <Check size={16} /> : <CheckCheck size={16} />}
              </span>
            )}
            {typing ? (
              <span style={{ color: "#00a884", fontWeight: 500 }}>{typing.from === "agent" && <Bot size={14} style={{ verticalAlign: -2, marginRight: 4 }} />}{typingText(typing)}</span>
            ) : draft ? (
              <>
                <span style={{ color: "#1fa855", fontWeight: 500 }}>Rascunho: </span>
                {plain(draft)}
              </>
            ) : (
              <>
                {ticket.isGroup && ticket.lastMessageAuthor && !ticket.lastMessageFromMe && (
                  <span style={{ opacity: 0.85 }}>{ticket.lastMessageAuthor.split(" ")[0]}: </span>
                )}
                {KindIcon && <KindIcon size={14} style={{ verticalAlign: -2, marginRight: 4, opacity: 0.7 }} />}
                {previewText || "Sem mensagens"}
              </>
            )}
          </span>
          {soundPref === "mute" && (
            <Tooltip arrow title="Contato silenciado">
              <span className={classes.pin}><BellOff size={14} /></span>
            </Tooltip>
          )}
          {soundPref === "alert" && (
            <Tooltip arrow title="Contato de alerta: sempre toca o som">
              <span className={classes.pin} style={{ color: "#c9a800" }}><BellRing size={14} /></span>
            </Tooltip>
          )}
          {ticket.pinned && (
            <Tooltip arrow title="Fixada no topo">
              <span className={classes.pin}><Pin size={14} /></span>
            </Tooltip>
          )}
          {ticket.status === "pending" && !ticket.isGroup && ticket.aiActive && (
            <Tooltip arrow title="O agente de IA está atendendo. Abra para acompanhar e aceite para assumir.">
              <span className={classes.pin} style={{ color: "#0f766e" }}><Bot size={15} /></span>
            </Tooltip>
          )}
          {ticket.status === "pending" && !ticket.isGroup ? (
            <button type="button" className={classes.accept} onClick={accept} disabled={loading}>
              {loading ? <CircularProgress size={14} color="inherit" /> : "Aceitar"}
            </button>
          ) : (
            unread && <span className={classes.badge} style={soundPref === "mute" ? { backgroundColor: "#8696a0" } : undefined}>{ticket.unreadMessages > 99 ? "99+" : ticket.unreadMessages}</span>
          )}
          <button type="button" className={classes.more} aria-label="Mais opções da conversa" title="Mais opções" onClick={(e) => { e.stopPropagation(); setMenuEl(e.currentTarget); }}>
            <ChevronDown size={16} />
          </button>
          <Menu anchorEl={menuEl} open={Boolean(menuEl)} onClose={() => setMenuEl(null)} onClick={(e) => e.stopPropagation()} getContentAnchorEl={null}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
            <MenuItem onClick={togglePin}>
              <ListItemIcon style={{ minWidth: 34 }}>{ticket.pinned ? <PinOff size={18} /> : <Pin size={18} />}</ListItemIcon>
              <ListItemText primary={ticket.pinned ? "Desafixar" : "Fixar no topo"} />
            </MenuItem>
            <MenuItem onClick={(e) => run(e, async () => { await api.put(`/tickets/${ticket.id}/unread`); })}>
              <ListItemIcon style={{ minWidth: 34 }}><MailOpen size={18} /></ListItemIcon>
              <ListItemText primary="Marcar como não lida" />
            </MenuItem>
            <MenuItem onClick={toggleArchive}>
              <ListItemIcon style={{ minWidth: 34 }}>{ticket.archivedAt ? <ArchiveRestore size={18} /> : <Archive size={18} />}</ListItemIcon>
              <ListItemText primary={ticket.archivedAt ? "Desarquivar" : "Arquivar"} />
            </MenuItem>
          </Menu>
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
          {(ticket.tags || []).length > 2 && (
            <Tooltip arrow title={(ticket.tags || []).slice(2).map((t) => t.name).join(", ")}>
              <span className={classes.pill} style={{ flex: "none" }}>+{ticket.tags.length - 2}</span>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
};

export default TicketListItem;
