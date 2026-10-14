import React, { useState, useEffect, useReducer, useRef, useCallback } from "react";
import clsx from "clsx";
import { makeStyles } from "@material-ui/core";
import CircularProgress from "@material-ui/core/CircularProgress";
import IconButton from "@material-ui/core/IconButton";
import AccessTime from "@material-ui/icons/AccessTime";
import Block from "@material-ui/icons/Block";
import ErrorOutline from "@material-ui/icons/ErrorOutline";
import Done from "@material-ui/icons/Done";
import DoneAll from "@material-ui/icons/DoneAll";
import ExpandMore from "@material-ui/icons/ExpandMore";
import GetApp from "@material-ui/icons/GetApp";
import Star from "@material-ui/icons/Star";
import KeyboardArrowDown from "@material-ui/icons/KeyboardArrowDown";
import Close from "@material-ui/icons/Close";
import Forward from "@material-ui/icons/Forward";
import StarBorder from "@material-ui/icons/StarBorder";
import DeleteOutline from "@material-ui/icons/DeleteOutline";
import CheckCircle from "@material-ui/icons/CheckCircle";
import RadioButtonUnchecked from "@material-ui/icons/RadioButtonUnchecked";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from "@material-ui/core";
import ForwardDialog from "../chat/ForwardDialog";
import InsertDriveFile from "@material-ui/icons/InsertDriveFile";

import openSocket from "../../services/socket-io";
import MarkdownWrapper from "../MarkdownWrapper";
import VcardPreview from "../VcardPreview";
import LocationPreview from "../LocationPreview";
import ModalImageCors from "../ModalImageCors";
import MediaGallery, { openGallery } from "../MediaGallery";
import MessageOptionsMenu from "../MessageOptionsMenu";
import Audio from "../Audio";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import whatsBackground from "../../assets/wa-background.png";
import whatsBackgroundDark from "../../assets/wa-background-dark.png";
import { wa, dayLabel, clock } from "../chat/chatTheme";

const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  const dark = theme.palette.type === "dark";
  const bubble = (bg, color) => ({
    position: "relative",
    maxWidth: "min(68%, 600px)",
    minWidth: 84,
    padding: "7px 11px 8px 12px",
    borderRadius: 18,
    background: bg,
    color,
    boxShadow: c.shadow,
    fontSize: 14.5,
    lineHeight: "20px",
    letterSpacing: "-0.003em",
    wordBreak: "break-word",
    [theme.breakpoints.down("xs")]: { maxWidth: "86%" },
    "&:hover $chevron": { opacity: 1 },
  });

  return {
    wrapper: { position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" },
    pickBar: {
      position: "absolute", top: 0, left: 0, right: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 4, padding: "6px 12px",
      backgroundColor: c.header, borderBottom: `1px solid ${c.divider}`, color: c.text, boxShadow: c.shadow, animation: "pickIn .16s ease-out",
    },
    pickCount: { flex: 1, fontSize: 15, marginLeft: 6 },
    pickRow: { cursor: "pointer", transition: "background-color .12s", "&:hover": { backgroundColor: "rgba(127,127,127,.08)" } },
    pickRowOn: { backgroundColor: "rgba(0,168,132,.16) !important" },
    pickMark: { alignSelf: "center", flex: "none", margin: "0 8px", color: c.textSecondary },
    pickMarkOn: { color: c.accent },
    "@global": { "@keyframes pickIn": { from: { opacity: 0, transform: "translateY(-8px)" }, to: { opacity: 1, transform: "none" } } },
    list: {
      flex: 1,
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      padding: theme.spacing(1.5, 2, 1),
      backgroundColor: c.wallpaper,
      backgroundImage: `url(${dark ? whatsBackgroundDark : whatsBackground})`,
      backgroundSize: 412,
      ...theme.scrollbarStyles,
      [theme.breakpoints.up("md")]: { padding: theme.spacing(1.5, 7, 1) },
    },
    row: { display: "flex", marginTop: 3 },
    rowIn: { justifyContent: "flex-start" },
    rowOut: { justifyContent: "flex-end" },
    rowFirst: { marginTop: 12 },
    bubbleIn: {
      ...bubble(c.bubbleIn, c.text),
      border: `1px solid ${dark ? "rgba(255,255,255,.04)" : "rgba(11,20,26,.06)"}`,
    },
    bubbleOut: {
      ...bubble(c.bubbleOutBg, c.bubbleOutText),
      "& a": { color: c.linkOut },
      "& $meta": { color: c.timeOut },
      "& $ack": { color: c.ackOut },
      "& $ackRead": { color: c.ackReadOut },
      "& $quote": { backgroundColor: c.quoteOut },
      "& $quoteBar": { backgroundColor: c.quoteBar },
      "& $quoteBarMe": { backgroundColor: c.quoteBarMe },
      "& $quoteName": { color: c.quoteName },
      "& $quoteBody": { color: c.textSecondary },
      "& $doc": { backgroundColor: dark ? "rgba(0,0,0,.18)" : "rgba(11,20,26,.06)" },
      "& $deleted": { color: c.textSecondary },
    },
    tailed: {},
    tailedIn: { borderTopLeftRadius: 5 },
    tailedOut: { borderTopRightRadius: 5 },
    match: { outline: `2px solid ${dark ? "#667781" : "#ffd279"}`, outlineOffset: 1 },
    matchActive: { outline: `3px solid ${c.accent}`, outlineOffset: 1 },
    sender: { fontSize: 13, fontWeight: 600, color: c.sender, marginBottom: 1 },
    chevron: {
      position: "absolute",
      top: 2,
      right: 2,
      width: 26,
      height: 26,
      padding: 0,
      opacity: 0,
      transition: "opacity .12s",
      color: c.textSecondary,
      zIndex: 2,
      background: "inherit",
      borderRadius: 13,
      "&:hover": { background: "inherit" },
    },
    quote: {
      display: "flex",
      marginBottom: 5,
      borderRadius: 10,
      overflow: "hidden",
      cursor: "pointer",
      backgroundColor: c.quoteIn,
    },
    quoteOut: { backgroundColor: c.quoteOut },
    quoteBar: { flex: "none", width: 4, backgroundColor: c.quoteBar },
    quoteBarMe: { backgroundColor: c.quoteBarMe },
    quoteBody: { padding: "5px 9px", minWidth: 0, fontSize: 13, color: c.textSecondary, maxHeight: 64, overflow: "hidden" },
    quoteName: { display: "block", fontSize: 12.5, fontWeight: 700, color: c.quoteName, marginBottom: 1 },
    text: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", "& p": { margin: 0 } },
    deleted: { fontStyle: "italic", color: c.textSecondary, display: "flex", alignItems: "center", gap: 6 },
    meta: {
      float: "right",
      display: "inline-flex",
      alignItems: "center",
      gap: 3,
      margin: "7px 0 -5px 12px",
      fontSize: 11,
      lineHeight: "15px",
      fontVariantNumeric: "tabular-nums",
      color: c.time,
      userSelect: "none",
    },
    metaOnMedia: {
      position: "absolute",
      right: 10,
      bottom: 12,
      margin: 0,
      float: "none",
      color: "#fff",
      textShadow: "0 0 3px rgba(0,0,0,.7)",
      zIndex: 1,
    },
    ack: { fontSize: 16, color: c.time },
    ackRead: { fontSize: 16, color: c.tick },
    media: { margin: "-2px -3px 4px -4px", position: "relative", borderRadius: 6, overflow: "hidden", lineHeight: 0 },
    video: { display: "block", maxWidth: "100%", width: 300, borderRadius: 6 },
    doc: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      margin: "0 -3px 4px -4px",
      padding: 10,
      borderRadius: 6,
      backgroundColor: dark ? "rgba(0,0,0,.18)" : "rgba(11,20,26,.05)",
      textDecoration: "none",
      color: "inherit",
      minWidth: 230,
      "& svg": { fontSize: 32, color: c.textSecondary, flex: "none" },
    },
    docName: { flex: 1, minWidth: 0, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    reactions: {
      position: "absolute",
      left: 8,
      bottom: -13,
      display: "inline-flex",
      alignItems: "center",
      gap: 2,
      height: 22,
      padding: "0 6px",
      borderRadius: 11,
      fontSize: 13,
      backgroundColor: c.panel,
      boxShadow: "0 1px 3px rgba(11,66,121,.25)",
      zIndex: 2,
    },
    withReactions: { marginBottom: 14 },
    day: { alignSelf: "center", margin: "14px 0 8px", padding: "4px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600, letterSpacing: ".01em", color: c.textSecondary, backgroundColor: c.chatChip, backdropFilter: "blur(6px)", boxShadow: c.shadow },
    unreadDivider: {
      alignSelf: "center",
      margin: "14px 0 8px",
      padding: "5px 16px",
      borderRadius: 999,
      textAlign: "center",
      fontSize: 12,
      fontWeight: 700,
      color: c.pillText,
      backgroundColor: c.pill,
      boxShadow: c.shadow,
    },
    empty: { margin: "auto", padding: "10px 18px", borderRadius: 999, fontSize: 13, color: c.textSecondary, backgroundColor: c.chatChip, boxShadow: c.shadow, textAlign: "center" },
    loading: { position: "absolute", top: 8, left: "50%", marginLeft: -16, zIndex: 3, color: c.accent },
    fab: {
      position: "absolute",
      right: 20,
      bottom: 14,
      width: 42,
      height: 42,
      zIndex: 3,
      backgroundColor: c.panel,
      color: c.accent,
      boxShadow: c.float,
      "&:hover": { backgroundColor: c.panel, filter: "brightness(.97)" },
    },
    fabBadge: {
      position: "absolute",
      top: -8,
      left: "50%",
      transform: "translateX(-50%)",
      minWidth: 20,
      height: 20,
      padding: "0 5px",
      borderRadius: 10,
      fontSize: 11,
      fontWeight: 700,
      lineHeight: "20px",
      textAlign: "center",
      backgroundColor: c.badge,
      color: c.badgeText,
    },
  };
});

const reducer = (state, action) => {
  if (action.type === "LOAD_MESSAGES") {
    const fresh = [];
    action.payload.forEach((message) => {
      const i = state.findIndex((m) => m.id === message.id);
      if (i !== -1) state[i] = message;
      else fresh.push(message);
    });
    return [...fresh, ...state];
  }
  if (action.type === "ADD_MESSAGE") {
    const i = state.findIndex((m) => m.id === action.payload.id);
    if (i !== -1) state[i] = action.payload;
    else state.push(action.payload);
    return [...state];
  }
  if (action.type === "UPDATE_MESSAGE") {
    const i = state.findIndex((m) => m.id === action.payload.id);
    if (i !== -1) state[i] = action.payload;
    return [...state];
  }
  if (action.type === "RESET") return [];
  return state;
};

const fileNameOf = (m) => {
  const fromUrl = decodeURIComponent((m.mediaUrl || "").split("/").pop() || "");
  return m.body && m.body.length < 120 && !m.body.includes("\n") ? m.body : fromUrl || "arquivo";
};

const isOnlyFileName = (m) => !m.body || m.body === (m.mediaUrl || "").split("/").pop() || /^\d{10,}\.\w{2,5}$/.test(m.body);

const MessagesList = ({ ticketId, isGroup, channel, searchTerm = "", matchIndex = 0, onMatches }) => {
  const classes = useStyles();
  const [messagesList, dispatch] = useReducer(reducer, []);
  const [pageNumber, setPageNumber] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState({});
  // select several messages (forward, star, hide)
  const [picked, setPicked] = useState(null);
  const [forwardMany, setForwardMany] = useState(false);
  const [confirmMany, setConfirmMany] = useState(false);
  const togglePick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  useEffect(() => {
    if (!picked) return undefined;
    const onKey = (e) => e.key === "Escape" && setPicked(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [picked]);
  useEffect(() => { setPicked(null); }, [ticketId]);
  const [anchorEl, setAnchorEl] = useState(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [firstUnreadId, setFirstUnreadId] = useState(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const currentTicketId = useRef(ticketId);
  const listRef = useRef();
  const atBottomRef = useRef(true);
  const bubbleRefs = useRef({});

  const scrollToBottom = useCallback((smooth) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
    setFirstUnreadId(null);
    setUnreadTotal(0);
    setNewCount(0);
    currentTicketId.current = ticketId;
  }, [ticketId]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get("/messages/" + ticketId, { params: { pageNumber } });
        if (currentTicketId.current === ticketId) {
          dispatch({ type: "LOAD_MESSAGES", payload: data.messages });
          setHasMore(data.hasMore);
          setLoading(false);
          if (pageNumber === 1) {
            const unread = data.messages.filter((m) => !m.fromMe && m.read === false);
            if (unread.length) {
              setFirstUnreadId(unread[0].id);
              setUnreadTotal(unread.length);
            }
            setTimeout(() => scrollToBottom(false), 30);
          }
        }
      } catch (err) {
        setLoading(false);
        toastError(err);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [pageNumber, ticketId, scrollToBottom]);

  useEffect(() => {
    const socket = openSocket();
    socket.on("connect", () => socket.emit("joinChatBox", ticketId));
    socket.on("appMessage", (data) => {
      if (data.action === "create") {
        dispatch({ type: "ADD_MESSAGE", payload: data.message });
        if (data.message.fromMe || atBottomRef.current) setTimeout(() => scrollToBottom(true), 30);
        else setNewCount((n) => n + 1);
      }
      if (data.action === "update") dispatch({ type: "UPDATE_MESSAGE", payload: data.message });
    });
    return () => {
      socket.disconnect();
    };
  }, [ticketId, scrollToBottom]);

  const onScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const bottom = scrollHeight - scrollTop - clientHeight < 80;
    atBottomRef.current = bottom;
    setAtBottom(bottom);
    if (bottom) setNewCount(0);
    if (hasMore && !loading && scrollTop < 60) {
      const prevHeight = scrollHeight;
      setPageNumber((p) => p + 1);
      // keep the reading position when older messages are prepended
      setTimeout(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      }, 700);
    }
  };

  // ------------------------------------------------------------ in-chat search
  const term = searchTerm.trim().toLowerCase();
  const matchIds = term
    ? messagesList.filter((m) => !m.isDeleted && (m.body || "").toLowerCase().includes(term)).map((m) => m.id)
    : [];
  const matchKey = matchIds.join(",");

  useEffect(() => {
    if (onMatches) onMatches(matchIds.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchKey]);

  useEffect(() => {
    const id = matchIds[matchIndex];
    const el = id && bubbleRefs.current[id];
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchIndex, matchKey]);

  const jumpTo = (id) => {
    const el = bubbleRefs.current[id];
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.animate([{ filter: "brightness(.85)" }, { filter: "none" }], { duration: 900 });
    }
  };

  // ---------------------------------------------------------------- rendering
  const renderMedia = (m) => {
    if (m.mediaType === "location" && (m.body || "").split("|").length >= 2) {
      const [image, link, description] = m.body.split("|");
      return <LocationPreview image={image} link={link} description={description || null} />;
    }
    if (m.mediaType === "vcard") {
      const numbers = [];
      let contact = "";
      (m.body || "").split("\n").forEach((line) => {
        const values = line.split(":");
        values.forEach((v, i) => {
          if (v.indexOf("+") !== -1) numbers.push({ number: v });
          if (v.indexOf("FN") !== -1) contact = values[i + 1];
        });
      });
      return <VcardPreview contact={contact} numbers={numbers[0]?.number} />;
    }
    if (m.mediaType === "image") {
      return (
        <div className={classes.media}>
          <ModalImageCors
            imageUrl={m.mediaUrl}
            onOpen={() => {
              // every photo and video of the loaded conversation, opened at this one
              const items = messagesList
                .filter((x) => !x.isDeleted && x.mediaUrl && (x.mediaType === "image" || x.mediaType === "video"))
                .map((x) => ({
                  url: x.mediaUrl,
                  type: x.mediaType,
                  fromMe: x.fromMe,
                  title: x.fromMe ? "Você" : x.contact && x.contact.name,
                  date: new Date(x.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
                }));
              openGallery(items, Math.max(0, items.findIndex((x) => x.url === m.mediaUrl)));
            }}
          />
        </div>
      );
    }
    if (m.mediaType === "audio") return <Audio url={m.mediaUrl} />;
    if (m.mediaType === "video") {
      return (
        <div className={classes.media}>
          <video className={classes.video} src={m.mediaUrl} controls preload="metadata" />
        </div>
      );
    }
    return (
      <a className={classes.doc} href={m.mediaUrl} target="_blank" rel="noopener noreferrer" download>
        <InsertDriveFile />
        <span className={classes.docName}>{fileNameOf(m)}</span>
        <GetApp />
      </a>
    );
  };

  const ack = (m) => {
    if (!m.fromMe) return null;
    if (m.ack < 0) return <ErrorOutline className={classes.ack} style={{ fontSize: 15, color: "#ea0038" }} titleAccess="Falha no envio" />;
    if (m.ack === 0) return <AccessTime className={classes.ack} style={{ fontSize: 14 }} />;
    if (m.ack === 1) return <Done className={classes.ack} />;
    if (m.ack === 2) return <DoneAll className={classes.ack} />;
    if (m.ack >= 3) return <DoneAll className={classes.ackRead} />;
    return <Done className={classes.ack} />;
  };

  let reactionList = [];
  const reactionsOf = (m) => {
    try {
      reactionList = m.reactions ? JSON.parse(m.reactions) : [];
    } catch (e) {
      reactionList = [];
    }
    return reactionList;
  };

  const renderQuote = (m) => (
    <div className={clsx(classes.quote, m.fromMe && classes.quoteOut)} onClick={() => jumpTo(m.quotedMsg?.id)}>
      <span className={clsx(classes.quoteBar, m.quotedMsg?.fromMe && classes.quoteBarMe)} />
      <div className={classes.quoteBody}>
        <span className={classes.quoteName} style={m.quotedMsg?.fromMe ? { color: "#53bdeb" } : undefined}>
          {m.quotedMsg?.fromMe ? "Você" : m.quotedMsg?.contact?.name || "Contato"}
        </span>
        {m.quotedMsg?.body}
      </div>
    </div>
  );

  const items = [];
  messagesList.forEach((m, i) => {
    const prev = messagesList[i - 1];
    const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
    const newSender = !prev || prev.fromMe !== m.fromMe || newDay;
    if (newDay) {
      items.push(
        <span key={`day-${m.id}`} className={classes.day}>
          {dayLabel(m.createdAt)}
        </span>
      );
    }
    if (m.id === firstUnreadId) {
      items.push(
        <div key="unread" className={classes.unreadDivider}>
          {unreadTotal} {unreadTotal === 1 ? "mensagem não lida" : "mensagens não lidas"}
        </div>
      );
    }
    const mine = m.fromMe;
    const hasMedia = m.mediaUrl || m.mediaType === "location" || m.mediaType === "vcard";
    const mediaOnly = hasMedia && (m.mediaType === "image" || m.mediaType === "video") && isOnlyFileName(m);
    const showText = !m.isDeleted && !(hasMedia && (isOnlyFileName(m) || m.mediaType === "vcard" || m.mediaType === "location" || m.mediaType === "audio"));
    const rx = reactionsOf(m);
    const isMatch = matchIds.includes(m.id);
    const isActive = isMatch && matchIds[matchIndex] === m.id;

    items.push(
      <div
        key={m.id}
        className={clsx(classes.row, mine ? classes.rowOut : classes.rowIn, newSender && classes.rowFirst, picked && !m.isDeleted && classes.pickRow, picked && picked.includes(m.id) && classes.pickRowOn)}
        onClick={picked && !m.isDeleted ? () => togglePick(m.id) : undefined}
      >
        {picked && !m.isDeleted && (
          <span className={clsx(classes.pickMark, picked.includes(m.id) && classes.pickMarkOn)}>
            {picked.includes(m.id) ? <CheckCircle /> : <RadioButtonUnchecked />}
          </span>
        )}
        <div
          ref={(el) => {
            bubbleRefs.current[m.id] = el;
          }}
          className={clsx(
            mine ? classes.bubbleOut : classes.bubbleIn,
            newSender && classes.tailed,
            newSender && (mine ? classes.tailedOut : classes.tailedIn),
            rx.length > 0 && classes.withReactions,
            isMatch && classes.match,
            isActive && classes.matchActive
          )}
        >
          {!m.isDeleted && (
            <IconButton
              size="small"
              className={classes.chevron}
              onClick={(e) => {
                setSelectedMessage(m);
                setAnchorEl(e.currentTarget);
              }}
            >
              <ExpandMore />
            </IconButton>
          )}
          {isGroup && !mine && newSender && <div className={classes.sender}>{m.contact?.name}</div>}
          {m.quotedMsg && renderQuote(m)}
          {m.isDeleted ? (
            <div className={classes.deleted}>
              <Block style={{ fontSize: 16 }} />
              Mensagem apagada
              <span className={classes.meta}>{clock(m.createdAt)}</span>
            </div>
          ) : (
            <>
              {hasMedia && renderMedia(m)}
              {showText && (
                <div className={classes.text}>
                  <MarkdownWrapper>{m.body}</MarkdownWrapper>
                  <span className={classes.meta}>
                    {m.starred && <Star style={{ fontSize: 12 }} />}
                    {m.isEdited && <span style={{ fontStyle: "italic" }}>editada</span>}
                    {clock(m.createdAt)}
                    {ack(m)}
                  </span>
                </div>
              )}
              {!showText && (
                <span className={clsx(classes.meta, mediaOnly && classes.metaOnMedia)}>
                  {m.starred && <Star style={{ fontSize: 12 }} />}
                  {clock(m.createdAt)}
                  {ack(m)}
                </span>
              )}
              {!showText && !mediaOnly && <div style={{ clear: "both" }} />}
            </>
          )}
          {rx.length > 0 && (
            <span className={classes.reactions}>
              {[...new Set(rx.map((r) => r.emoji))].join("")}
              {rx.length > 1 && <span style={{ fontSize: 11 }}>{rx.length}</span>}
            </span>
          )}
        </div>
      </div>
    );
  });

  return (
    <div className={classes.wrapper}>
      <MediaGallery />
      <MessageOptionsMenu
        message={selectedMessage}
        anchorEl={anchorEl}
        menuOpen={Boolean(anchorEl)}
        handleClose={() => setAnchorEl(null)}
        ticketId={ticketId}
        channel={channel}
        onSelect={(m) => setPicked([m.id])}
      />
      {picked && (() => {
        const chosen = messagesList.filter((m) => picked.includes(m.id));
        const allStarred = chosen.length > 0 && chosen.every((m) => m.starred);
        return (
          <>
            <div className={classes.pickBar}>
              <IconButton size="small" onClick={() => setPicked(null)} aria-label="Cancelar seleção" title="Cancelar (Esc)"><Close /></IconButton>
              <span className={classes.pickCount}>{picked.length} {picked.length === 1 ? "selecionada" : "selecionadas"}</span>
              <IconButton size="small" disabled={!picked.length} title={allStarred ? "Desfavoritar" : "Favoritar"}
                onClick={async () => {
                  try { for (const m of chosen) await api.put(`/messages/${m.id}/star`, { starred: !allStarred }); } catch (err) { toastError(err); }
                  setPicked(null);
                }}>{allStarred ? <StarBorder /> : <Star />}</IconButton>
              <IconButton size="small" disabled={!picked.length} title="Encaminhar" onClick={() => setForwardMany(true)}><Forward /></IconButton>
              <IconButton size="small" disabled={!picked.length} title="Apagar só aqui" onClick={() => setConfirmMany(true)}><DeleteOutline /></IconButton>
            </div>
            <ForwardDialog open={forwardMany} onClose={() => { setForwardMany(false); setPicked(null); }} messages={chosen} fromTicketId={ticketId} />
            <Dialog open={confirmMany} onClose={() => setConfirmMany(false)} maxWidth="xs" fullWidth>
              <DialogTitle>Apagar {picked.length} {picked.length === 1 ? "mensagem" : "mensagens"} só aqui?</DialogTitle>
              <DialogContent>
                <Typography variant="body2" color="textSecondary">As mensagens somem no sistema, mas continuam no WhatsApp do contato. Para apagar para todos, use o menu de cada mensagem.</Typography>
              </DialogContent>
              <DialogActions style={{ padding: "8px 16px 16px" }}>
                <Button onClick={() => setConfirmMany(false)}>Cancelar</Button>
                <Button variant="contained" color="primary" onClick={async () => {
                  setConfirmMany(false);
                  try { for (const m of chosen) await api.delete(`/messages/${m.id}`, { params: { scope: "local" } }); } catch (err) { toastError(err); }
                  setPicked(null);
                }}>Apagar só aqui</Button>
              </DialogActions>
            </Dialog>
          </>
        );
      })()}
      <div ref={listRef} id="messagesList" className={classes.list} onScroll={onScroll}>
        {messagesList.length > 0 ? items : !loading && <div className={classes.empty}>Nenhuma mensagem ainda. Diga olá!</div>}
      </div>
      {loading && <CircularProgress size={28} className={classes.loading} />}
      {!atBottom && (
        <IconButton className={classes.fab} onClick={() => scrollToBottom(true)} aria-label="Ir para o fim">
          {newCount > 0 && <span className={classes.fabBadge}>{newCount}</span>}
          <KeyboardArrowDown />
        </IconButton>
      )}
    </div>
  );
};

export default MessagesList;
