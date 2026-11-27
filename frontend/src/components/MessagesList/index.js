import { renewMediaElement } from "../../services/media-access";
import { looksLikeFileName, shownText } from "../../utils/mediaLabel";

import React, { useState, useEffect, useLayoutEffect, useReducer, useRef, useCallback } from "react";
import clsx from "clsx";
import { makeStyles, useTheme } from "@material-ui/core";
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
import { Check, Bot, Play, Film } from "lucide-react";
import { useTyping } from "../../utils/typingStore";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from "@material-ui/core";
import ForwardDialog from "../chat/ForwardDialog";
import InsertDriveFile from "@material-ui/icons/InsertDriveFile";

import openSocket from "../../services/socket-io";
import MarkdownWrapper from "../MarkdownWrapper";
import VcardPreview from "../VcardPreview";
import LocationPreview from "../LocationPreview";
import ModalImageCors, { imageRatio, rememberRatio } from "../ModalImageCors";
import MediaGallery, { openGallery } from "../MediaGallery";
import MessageOptionsMenu, { REACTIONS } from "../MessageOptionsMenu";
import ReactionBar from "../ReactionBar";
import Audio from "../Audio";
import FileCard from "../FileCard";
import LinkCard, { hasLink } from "../LinkCard";
import MediaPlaceholder, { needsMedia } from "../MediaPlaceholder";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import whatsBackground from "../../assets/wa-background.png";
import whatsBackgroundDark from "../../assets/wa-background-dark.png";
import { wa, dayLabel, clock, friendlyBody } from "../chat/chatTheme";
import { initialsOf } from "../../utils/avatar";

// the day and the time of a message, in full (shown when the pointer is over its time)
const fullDate = (date) => new Date(date).toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  const dark = theme.palette.type === "dark";
  const bubble = (bg, color) => ({
    position: "relative",
    maxWidth: "min(68%, 600px)",
    minWidth: 84,
    padding: "6px 7px 8px 9px",
    borderRadius: 8,
    background: bg,
    color,
    boxShadow: c.shadow,
    // read comfortably on a laptop screen without zoom (the team asked for bigger text)
    fontSize: 16,
    lineHeight: "22px",
    wordBreak: "break-word",
    // the conversation shares the screen with the list on tablets: the bubble may use more of what is left
    [theme.breakpoints.down("sm")]: { maxWidth: "80%" },
    [theme.breakpoints.down("xs")]: { maxWidth: "88%" },
    "&:hover $chevron": { opacity: 1 },
  });

  return {
    wrapper: { position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" },
    pickBar: {
      position: "absolute", top: 0, left: 0, right: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 4, padding: "6px 12px",
      backgroundColor: c.header, borderBottom: `1px solid ${c.divider}`, color: c.text, boxShadow: c.shadow, animation: "pickIn .16s ease-out",
    },
    pickCount: { flex: 1, fontSize: 15, marginLeft: 6 },
    // like WhatsApp Web: the whole line is tinted edge to edge and a round box sits in the left margin
    pickRow: {
      cursor: "pointer", position: "relative", userSelect: "none",
      "&::before": { content: '""', position: "absolute", top: -2, bottom: -2, left: -100, right: -100, backgroundColor: "transparent", transition: "background-color .15s", pointerEvents: "none" },
      "&:hover::before": { backgroundColor: dark ? "rgba(255,255,255,.04)" : "rgba(11,20,26,.04)" },
      "& > *": { position: "relative", zIndex: 1 },
    },
    pickRowOn: { "&::before, &:hover::before": { backgroundColor: dark ? "rgba(0,168,132,.22)" : "rgba(37,211,102,.18)" } },
    pickMark: {
      position: "absolute !important", left: -42, top: "50%", marginTop: -10, width: 20, height: 20, borderRadius: "50%", boxSizing: "border-box",
      border: `2px solid ${c.textSecondary}`, display: "grid", placeItems: "center", color: "#fff", transition: "background-color .12s, border-color .12s",
      [theme.breakpoints.down("sm")]: { left: -28 },
    },
    pickMarkOn: { backgroundColor: c.accent, borderColor: c.accent },
    listPicking: { overflowX: "hidden", [theme.breakpoints.down("sm")]: { paddingLeft: theme.spacing(5) } },
    pickGo: { backgroundColor: c.accent, color: "#fff", borderRadius: 999, padding: "5px 16px", fontSize: 14, fontWeight: 600, marginLeft: 8, "&:hover": { backgroundColor: c.accent, filter: "brightness(.92)" } },
    "@global": {
      "@keyframes pickIn": { from: { opacity: 0, transform: "translateY(-8px)" }, to: { opacity: 1, transform: "none" } },
      "@keyframes typingDot": { "0%, 60%, 100%": { transform: "translateY(0)", opacity: 0.45 }, "30%": { transform: "translateY(-5px)", opacity: 1 } },
      "@keyframes typingIn": { from: { opacity: 0, transform: "translateY(6px) scale(.96)" }, to: { opacity: 1, transform: "none" } },
    },
    list: {
      flex: 1,
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      padding: theme.spacing(1.5, 2, 1),
      backgroundColor: c.wallpaper,
      backgroundImage: `url(${dark ? whatsBackgroundDark : whatsBackground})`,
      backgroundSize: 412,
      // the screen keeps the reading place by itself (keepPlace below): the browser's own correction would move it twice
      overflowAnchor: "none",
      ...theme.scrollbarStyles,
      [theme.breakpoints.up("md")]: { padding: theme.spacing(1.5, 7, 1) },
    },
    content: { display: "flex", flexDirection: "column", flex: "none" },
    row: { display: "flex", marginTop: 2 },
    rowIn: { justifyContent: "flex-start" },
    rowOut: { justifyContent: "flex-end" },
    rowFirst: { marginTop: 10 },
    bubbleIn: {
      ...bubble(c.bubbleIn, c.text),
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
    // the little tail of the last bubble of a sequence, as in the WhatsApp app
    tailed: {
      "&::before": { content: '""', position: "absolute", top: 0, width: 8, height: 13 },
    },
    // "digitando…" as WhatsApp draws it today: a small bubble at the end of the conversation with three dots that rise one after the other
    typingRow: { display: "flex", marginTop: 8 },
    typingBubble: {
      display: "inline-flex", alignItems: "center", gap: 5, minHeight: 36, padding: "0 16px", borderRadius: 18, borderBottomLeftRadius: 5, boxShadow: c.shadow,
      background: c.bubbleIn, border: `1px solid ${dark ? "rgba(255,255,255,.04)" : "rgba(11,20,26,.06)"}`,
      animation: "typingIn .18s ease-out",
    },
    typingBubbleAgent: { background: c.bubbleOutBg, borderBottomLeftRadius: 18, borderBottomRightRadius: 5, border: 0 },
    typingDot: {
      width: 8, height: 8, borderRadius: "50%", backgroundColor: c.textSecondary, opacity: 0.55, animation: "typingDot 1.3s infinite ease-in-out",
      "&:nth-child(2)": { animationDelay: ".18s" }, "&:nth-child(3)": { animationDelay: ".36s" },
      "@media (prefers-reduced-motion: reduce)": { animation: "none", opacity: 0.7 },
    },
    typingBot: { marginRight: 2, color: c.bubbleOutText, opacity: 0.9 },
    sticker: {
      background: "transparent !important", boxShadow: "none !important", border: "0 !important", padding: "0 !important", minWidth: 0,
      display: "flex", flexDirection: "column",
      "& $media": { margin: 0, overflow: "visible" },
      // the time and the ticks of a sticker go in a small chip under its corner (as on WhatsApp), never over the transparent picture
      "& $meta": {
        position: "static", float: "none", display: "inline-flex", alignSelf: "flex-end", margin: "2px 2px 0", padding: "1px 7px", borderRadius: 999,
        color: c.textSecondary, backgroundColor: c.chatChip, boxShadow: c.shadow, textShadow: "none",
      },
    },
    reactBtn: {
      alignSelf: "center", flex: "none", width: 30, height: 30, borderRadius: "50%", border: 0, padding: 0, margin: "0 6px", cursor: "pointer",
      display: "inline-flex", alignItems: "center", justifyContent: "center", color: c.textSecondary,
      background: c.panel, boxShadow: c.shadow, opacity: 0, transition: "opacity .12s, transform .12s",
      "&:hover": { transform: "scale(1.1)", color: c.accent },
    },
    // on a phone (no hover) the button stays visible, lighter, so a reaction is one tap away
    rowHover: { "&:hover $reactBtn, & $reactBtn:focus-visible": { opacity: 1 }, "@media (hover: none)": { "& $reactBtn": { opacity: 0.55 } } },
    tailedIn: {
      borderTopLeftRadius: 0,
      "&::before": { left: -8, background: c.bubbleIn, clipPath: "polygon(100% 0, 0 0, 100% 100%)" },
    },
    tailedOut: {
      borderTopRightRadius: 0,
      "&::before": { right: -8, background: c.bubbleOutBg, clipPath: "polygon(0 0, 100% 0, 0 100%)" },
    },
    match: { outline: `2px solid ${dark ? "#667781" : "#ffd279"}`, outlineOffset: 1 },
    matchActive: { outline: `3px solid ${c.accent}`, outlineOffset: 1 },
    sender: { fontSize: 14, fontWeight: 600, color: c.sender, marginBottom: 1, display: "block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    // the little picture of who wrote, beside the first bubble of each person in a group (the next ones keep the same indent)
    senderAvatar: { flex: "none", width: 28, height: 28, borderRadius: "50%", marginRight: 6, alignSelf: "flex-start", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 700, color: "#fff", overflow: "hidden", objectFit: "cover" },
    senderGap: { flex: "none", width: 34 },
    forwarded: { display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, fontStyle: "italic", color: c.textSecondary, marginBottom: 2 },
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
    quoteBody: { padding: "5px 9px", minWidth: 0, fontSize: 14, color: c.textSecondary, maxHeight: 64, overflow: "hidden" },
    quoteName: { display: "block", fontSize: 12.5, fontWeight: 700, color: c.quoteName, marginBottom: 1 },
    text: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", "& p": { margin: 0 } },
    deleted: { fontStyle: "italic", color: c.textSecondary, display: "flex", alignItems: "center", gap: 6 },
    transcript: { fontSize: 13.5, lineHeight: "19px", margin: "6px 2px 2px", maxWidth: 320, overflowWrap: "anywhere", whiteSpace: "pre-wrap" },
    transcriptLabel: { display: "block", fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: c.textSecondary, marginBottom: 2 },
    meta: {
      float: "right",
      display: "inline-flex",
      alignItems: "center",
      gap: 3,
      margin: "7px 0 -5px 12px",
      fontSize: 12,
      lineHeight: "15px",
      fontVariantNumeric: "tabular-nums",
      color: c.time,
      userSelect: "none",
    },
    // the time over a picture or a video without caption: bottom right, on a dark shade (as on WhatsApp)
    metaOnMedia: {
      position: "absolute",
      right: 7,
      bottom: 5,
      margin: 0,
      float: "none",
      color: "#fff !important",
      textShadow: "0 0 2px rgba(0,0,0,.5)",
      zIndex: 2,
      pointerEvents: "none",
      "& $ack": { color: "#fff !important" },
      "& $ackRead": { color: "#53bdeb !important" },
    },
    mediaShade: {
      position: "absolute", left: 0, right: 0, bottom: 0, height: 34, pointerEvents: "none", zIndex: 1,
      background: "linear-gradient(to bottom, transparent, rgba(0,0,0,.42))",
    },
    // a picture, a video or a map fills the bubble edge to edge: 3 px of the bubble around it, up to 330 px wide
    mediaBubble: {
      padding: 3,
      width: 336,
      boxSizing: "border-box",
      "& > $sender, & > $forwarded": { margin: "2px 6px 3px" },
      "& > $quote": { margin: "0 0 3px" },
      "& $media": { margin: 0 },
      "& $text": { padding: "5px 6px 6px 7px" },
    },
    // the menu arrow over a picture: white on a soft shade, not a patch of the bubble color
    chevronOnMedia: {
      top: 6, right: 6, color: "#fff", background: "radial-gradient(rgba(0,0,0,.38), rgba(0,0,0,0) 72%) !important",
    },
    ack: { fontSize: 16, color: c.time, marginLeft: 1 },
    ackRead: { fontSize: 16, color: c.tick },
    media: { margin: "-2px -3px 4px -4px", position: "relative", borderRadius: 6, overflow: "hidden", lineHeight: 0 },
    videoBox: { position: "relative", width: "100%", borderRadius: 6, overflow: "hidden", background: "#000", cursor: "pointer" },
    video: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block", background: "#000" },
    videoPlay: {
      position: "absolute", left: "50%", top: "50%", width: 52, height: 52, margin: "-26px 0 0 -26px", borderRadius: "50%", border: 0, padding: 0,
      display: "grid", placeItems: "center", color: "#fff", background: "rgba(11,20,26,.55)", cursor: "pointer", zIndex: 1,
      "&:focus-visible": { outline: "2px solid #fff" },
    },
    videoLen: {
      position: "absolute", left: 8, bottom: 5, zIndex: 2, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, lineHeight: "15px",
      color: "#fff", textShadow: "0 0 2px rgba(0,0,0,.5)", pointerEvents: "none", fontVariantNumeric: "tabular-nums",
    },
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
      minWidth: "min(230px, 100%)",
      "& svg": { fontSize: 32, color: c.textSecondary, flex: "none" },
    },
    docName: { flex: 1, minWidth: 0, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
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
    // the day stays on top while the conversation scrolls (as on WhatsApp): the next day's label takes its place
    day: { alignSelf: "center", margin: "12px 0 8px", padding: "5px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 400, color: c.textSecondary, backgroundColor: c.chatChip, boxShadow: c.shadow, position: "sticky", top: 8, zIndex: 3 },
    // the rounded pill in the middle of the conversation (as it was before #232), drawn above the floating day label: when both meet, it stays readable
    unreadDivider: {
      alignSelf: "center",
      position: "relative",
      zIndex: 4,
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
    let changed = false;
    // the file of a message is compared without its access token (the link is renewed every hour; the file is the same)
    const file = (u) => String(u || "").split("?")[0];
    const sig = (m) => `${m.ack}|${m.reactions}|${m.isDeleted}|${m.body}|${m.starred}|${file(m.mediaUrl)}|${m.isEdited}|${m.read}`;
    const index = new Map(state.map((m, i) => [m.id, i]));
    let next = state;
    action.payload.forEach((message) => {
      const i = index.get(message.id);
      if (i !== undefined) {
        // a periodic refresh that finds nothing new must not redraw the whole conversation
        if (sig(next[i]) !== sig(message)) {
          if (next === state) next = state.slice();
          next[i] = message;
          changed = true;
        }
      } else fresh.push(message);
    });
    if (!fresh.length && !changed) return state;
    if (!fresh.length) return next;
    // older pages go in front, newer ones (a refresh after a gap) at the end: always in the order they were written
    return [...fresh, ...next].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }
  if (action.type === "ADD_MESSAGE") {
    const i = state.findIndex((m) => m.id === action.payload.id);
    if (i !== -1) state[i] = action.payload;
    else {
      // the real copy of something typed here: the local one (same text, sent by us) goes away
      if (action.payload.fromMe) {
        const local = state.findIndex((m) => m.pending && m.body === action.payload.body);
        if (local !== -1) state.splice(local, 1);
      }
      state.push(action.payload);
    }
    return [...state];
  }
  if (action.type === "UPDATE_MESSAGE") {
    const i = state.findIndex((m) => m.id === action.payload.id);
    if (i !== -1) state[i] = action.payload;
    return [...state];
  }
  if (action.type === "SET_REACTIONS") {
    const i = state.findIndex((m) => m.id === action.payload.id);
    if (i === -1) return state;
    const next = [...state];
    next[i] = { ...state[i], reactions: action.payload.reactions };
    return next;
  }
  // a message just typed shows at once (clock), and gives way to the real one when the server stores it
  if (action.type === "ADD_LOCAL") {
    if (state.some((m) => m.id === action.payload.id)) return state;
    return [...state, action.payload];
  }
  if (action.type === "DROP_LOCAL") return state.filter((m) => m.id !== action.payload);
  if (action.type === "RESET") return [];
  return state;
};

// The stored file carries a unique part so two files with the same name never overwrite each other: "Nome~k3F9a.pdf"
// (older files: "Nome.k3F9a.pdf"). The person must see the real name.
const REAL_NAME = (name) =>
  name
    .replace(/~[A-Za-z0-9]{5}(\.[^.]+)$/, "$1")
    // older files: five characters with at least a capital letter and a digit, right before the extension (a rare random
    // name without both stays as it is: harmless, and no real name like "v2024" or "final" is cut)
    .replace(/\.(?=[A-Za-z0-9]{5}\.[^.]+$)(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Z])[A-Za-z0-9]{5}(\.[^.]+)$/, "$1");

const fileNameOf = (m) => {
  const last = (m.mediaUrl || "").split("?")[0].split("/").pop() || "";
  // a file called "Histórico 90%.pdf" is not valid URL text: decoding it throws, and that must not close the conversation
  let decoded = last;
  try { decoded = decodeURIComponent(last); } catch (e) { /* keep the name as it is */ }
  const fromUrl = REAL_NAME(decoded);
  // WhatsApp puts the file name in the text of a document sent without a caption; a short caption ("Segue") is not a name
  const bodyIsName = m.body && m.body.length < 120 && !m.body.includes("\n") && /\.[A-Za-z0-9]{2,5}$/.test(m.body);
  return bodyIsName ? m.body : fromUrl || "arquivo";
};

const isOnlyFileName = (m) => !m.body || looksLikeFileName(m.body, m.mediaUrl) || /^[\p{Extended_Pictographic}\s]*(Imagem|Vídeo|Áudio|Mensagem de voz|Documento|Figurinha|Foto)$/u.test(m.body) || m.body === (m.mediaUrl || "").split("?")[0].split("/").pop() || /^\d{10,}\.\w{2,5}$/.test(m.body);


// Who wrote, in a group: each person with their own name and color (as on WhatsApp). The color is always the same for the same person.
const SENDER_LIGHT = ["#1f7aa8", "#c2410c", "#7c3aed", "#0f766e", "#be123c", "#a16207", "#4d7c0f", "#a21caf", "#0369a1", "#b91c1c"];
const SENDER_DARK = ["#53bdeb", "#fdba74", "#c4b5fd", "#5eead4", "#fda4af", "#fde047", "#bef264", "#f0abfc", "#7dd3fc", "#fca5a5"];
export const senderColor = (key, dark) => {
  const list = dark ? SENDER_DARK : SENDER_LIGHT;
  if (typeof key === "number") return list[key % list.length];
  return list[[...String(key ?? "")].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % list.length];
};
// the same person in a row shares one header; in a conversation with one person only "you" or "them" matter
export const senderKey = (m, isGroup) => (m.fromMe ? "me" : isGroup ? `c${m.contactId ?? (m.contact && m.contact.id) ?? "?"}` : "them");
const phoneLabel = (digits) => {
  const d = String(digits || "").replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(d)) {
    const rest = d.slice(4);
    return `+55 ${d.slice(2, 4)} ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  return d ? `+${d}` : "";
};
// never an empty name: the name, else the phone written as people read it, else "Participante"
export const senderName = (contact) => {
  if (!contact) return "Participante";
  const name = String(contact.name || "").trim();
  if (name && !/^\+?[\d\s().-]{8,}$/.test(name) && name !== "Contato sem telefone") return name;
  return phoneLabel(contact.number || name) || "Participante";
};

const lengthOf = (s) => {
  if (!Number.isFinite(s) || s <= 0) return "";
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

// A video in the bubble, as on WhatsApp: the first frame fills the bubble (its space is kept while it loads), a play button in the
// middle and the length at the bottom left; a click opens it in the gallery. GIFs loop silently in place.
const VideoThumb = ({ m, classes, overlay, onOpen }) => {
  const [ratio, setRatio] = useState(() => imageRatio(m.mediaUrl));
  const [length, setLength] = useState("");
  const src = m.mediaUrl && !m.isGif && !m.mediaUrl.includes("#") ? `${m.mediaUrl}#t=0.1` : m.mediaUrl;
  const onMeta = (e) => {
    const el = e.currentTarget;
    setRatio(rememberRatio(m.mediaUrl, el.videoWidth, el.videoHeight));
    setLength(lengthOf(el.duration));
  };
  return (
    <div className={classes.videoBox} style={{ aspectRatio: String(ratio || 4 / 3) }} onClick={m.isGif ? undefined : onOpen}>
      {m.isGif ? (
        <video onError={renewMediaElement} onLoadedMetadata={onMeta} className={classes.video} src={src} autoPlay loop muted playsInline />
      ) : (
        <>
          <video onError={renewMediaElement} onLoadedMetadata={onMeta} className={classes.video} src={src} preload="metadata" muted playsInline />
          <button type="button" className={classes.videoPlay} aria-label="Assistir ao vídeo" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
            <Play size={26} weight="fill" />
          </button>
          {length && <span className={classes.videoLen}><Film size={14} aria-hidden="true" />{length}</span>}
        </>
      )}
      {overlay}
    </div>
  );
};

const MessagesList = ({ ticketId, isGroup, channel, searchTerm = "", matchIndex = 0, onMatches, live = false }) => {
  const classes = useStyles();
  const dark = useTheme().palette.type === "dark";
  const [messagesList, dispatch] = useReducer(reducer, []);
  const messagesListRef = useRef([]);
  messagesListRef.current = messagesList;
  // a conversation the AI agent or nobody has yet is read again more often: a missed live event never keeps the team behind the lead
  const liveRef = useRef(false);
  liveRef.current = !!live;
  const [pageNumber, setPageNumber] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState({});
  // select several messages (forward, star, hide)
  const [picked, setPicked] = useState(null);
  const [forwardMany, setForwardMany] = useState(false);
  const [confirmMany, setConfirmMany] = useState(false);
  const lastPick = useRef(null);
  // a click picks or unpicks one; with Shift it takes the whole stretch since the last click
  const togglePick = (id, range = false) => setPicked((p) => {
    const ids = messagesListRef.current.filter((m) => !m.isDeleted && !m.pending).map((m) => m.id);
    const from = ids.indexOf(lastPick.current);
    const to = ids.indexOf(id);
    lastPick.current = id;
    if (range && from !== -1 && to !== -1) {
      const stretch = ids.slice(Math.min(from, to), Math.max(from, to) + 1);
      return [...new Set([...p, ...stretch])];
    }
    return p.includes(id) ? p.filter((x) => x !== id) : [...p, id];
  });
  useEffect(() => {
    if (!picked) return undefined;
    // Esc leaves the selection only: it must not also close the conversation (the header listens for the same key)
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); setPicked(null); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [picked]);
  useEffect(() => { setPicked(null); }, [ticketId]);
  const [anchorEl, setAnchorEl] = useState(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [firstUnreadId, setFirstUnreadId] = useState(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const currentTicketId = useRef(ticketId);
  const listRef = useRef();
  const typing = useTyping(ticketId);
  // the live connection is down: the screen keeps reading the conversation by itself, and says so
  const [rtDown, setRtDown] = useState(false);
  const atBottomRef = useRef(true);
  const bubbleRefs = useRef({});

  const contentRef = useRef();
  // the message at the top of what the person is reading, and how far from the top of the list it is: when something above it
  // changes height (an older page arrives, a picture loads), the list moves by the same amount and the person stays in place
  const anchorRef = useRef(null);
  // one older page at a time (several scroll events come before the page starts loading)
  const pageLoading = useRef(false);

  const captureAnchor = useCallback(() => {
    const el = listRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const rows = content.querySelectorAll("[data-mid]");
    const top = el.getBoundingClientRect().top;
    let lo = 0;
    let hi = rows.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (rows[mid].getBoundingClientRect().bottom > top) { found = mid; hi = mid - 1; } else lo = mid + 1;
    }
    anchorRef.current = found === -1 ? null : { node: rows[found], offset: rows[found].getBoundingClientRect().top - top };
  }, []);

  // at the end of the conversation: stay at the end; elsewhere: keep the message being read where it was
  const keepPlace = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    if (atBottomRef.current) {
      if (el.scrollHeight - el.scrollTop - el.clientHeight > 1) el.scrollTop = el.scrollHeight;
      return;
    }
    const a = anchorRef.current;
    if (!a || !a.node.isConnected) return;
    const diff = a.node.getBoundingClientRect().top - el.getBoundingClientRect().top - a.offset;
    if (Math.abs(diff) >= 1) el.scrollTop += diff;
  }, []);

  // never an animated scroll that the person did not ask for: it would fight with their own scrolling
  const scrollToBottom = useCallback((smooth) => {
    const el = listRef.current;
    if (!el) return;
    atBottomRef.current = true;
    const far = el.scrollHeight - el.scrollTop - el.clientHeight > el.clientHeight * 1.5;
    if (smooth && !far && el.scrollTo) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    else el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
    setFirstUnreadId(null);
    setUnreadTotal(0);
    setNewCount(0);
    setAtBottom(true);
    atBottomRef.current = true;
    anchorRef.current = null;
    pageLoading.current = false;
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
          pageLoading.current = false;
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
        pageLoading.current = false;
        toastError(err);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [pageNumber, ticketId, scrollToBottom]);

  useEffect(() => {
    const socket = openSocket(`chat:${ticketId}`);
    // newest messages again (no "mark as read"): after a reconnection, when coming back to the tab, and every 25 s
    // while it is open, so a missed live event never leaves the conversation behind
    const resync = async () => {
      try {
        const { data } = await api.get("/messages/" + ticketId, { params: { pageNumber: 1, silent: 1 } });
        if (currentTicketId.current === ticketId) {
          // new messages at the end: keepPlace follows them only if the person is already at the end
          dispatch({ type: "LOAD_MESSAGES", payload: data.messages });
        }
      } catch (e) {
        /* the next round tries again */
      }
    };
    let first = true;
    // the server confirms the room; if it does not, try again a few times (otherwise this conversation would never get live messages)
    const join = (attempt = 0) => {
      socket.emit("joinChatBox", ticketId, (ack) => {
        if (ack && ack.ok) return;
        if (attempt < 3) setTimeout(() => join(attempt + 1), 1500 * (attempt + 1));
      });
    };
    socket.on("connect", () => {
      setRtDown(false);
      join();
      if (!first) resync();
      first = false;
    });
    socket.on("disconnect", () => setRtDown(true));
    socket.on("connect_error", () => setRtDown(true));
    // reactions appear at once (see utils/optimisticReaction): the server answers later
    const onReactions = (e) => dispatch({ type: "SET_REACTIONS", payload: e.detail });
    window.addEventListener("message-reactions", onReactions);
    // what is typed in the box appears here at once; if the send fails it goes away (the box gets the text back)
    const onLocal = (e) => {
      const d = e.detail || {};
      if (String(d.ticketId) !== String(ticketId)) return;
      dispatch({ type: "ADD_LOCAL", payload: { id: `local-${d.key}`, body: d.body, fromMe: true, ack: 0, read: true, pending: true, isDeleted: false, mediaType: "chat", createdAt: new Date().toISOString(), quotedMsg: d.quotedMsg || null } });
      // the person just wrote: show what they wrote (at once, no animation)
      atBottomRef.current = true;
      setTimeout(() => scrollToBottom(false), 0);
    };
    const onLocalDrop = (e) => dispatch({ type: "DROP_LOCAL", payload: `local-${(e.detail || {}).key}` });
    window.addEventListener("pending-message", onLocal);
    window.addEventListener("pending-message-drop", onLocalDrop);
    let tick = 0;
    const poll = setInterval(() => {
      tick += 1;
      if (liveRef.current || (tick % 3 === 0 && document.visibilityState === "visible")) resync();
    }, 8000);
    const onVisible = () => document.visibilityState === "visible" && resync();
    document.addEventListener("visibilitychange", onVisible);
    socket.on("appMessage", (data) => {
      if (data.action === "create") {
        // at the end, the list follows the new message by itself (keepPlace); reading older messages, the place stays and the
        // button at the bottom counts what arrived (also for messages sent by the AI agent or a colleague)
        const known = messagesListRef.current.some((x) => x.id === data.message.id);
        dispatch({ type: "ADD_MESSAGE", payload: data.message });
        if (!atBottomRef.current && !known) setNewCount((n) => n + 1);
      }
      if (data.action === "update") dispatch({ type: "UPDATE_MESSAGE", payload: data.message });
    });
    return () => {
      clearInterval(poll);
      window.removeEventListener("message-reactions", onReactions);
      window.removeEventListener("pending-message", onLocal);
      window.removeEventListener("pending-message-drop", onLocalDrop);
      document.removeEventListener("visibilitychange", onVisible);
      socket.disconnect();
    };
  }, [ticketId, scrollToBottom]);

  // pictures, videos and file previews change the height AFTER the list was scrolled to the end: while the person is at
  // the end, keep them there as things load (otherwise the conversation "jumps" when it is opened)
  // the whole conversation is one block: whatever changes its height (a picture or a video that loads, a link card, the
  // "digitando" bubble, the box to write that grows) is corrected in the same frame, before it is painted
  useEffect(() => {
    const el = listRef.current;
    const content = contentRef.current;
    if (!el || !content || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => keepPlace());
    observer.observe(content);
    observer.observe(el);
    return () => observer.disconnect();
  }, [keepPlace, ticketId]);

  // an older page put in front, a message added or replaced: corrected before the browser paints, so nothing "jumps"
  useLayoutEffect(() => {
    keepPlace();
  }, [messagesList, typing, keepPlace]);

  const onScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const bottom = scrollHeight - scrollTop - clientHeight < 80;
    atBottomRef.current = bottom;
    if (bottom !== atBottom) setAtBottom(bottom);
    if (bottom && newCount) setNewCount(0);
    captureAnchor();
    // near the top: the previous page comes; the place is kept by keepPlace when it arrives
    if (hasMore && !loading && !pageLoading.current && scrollTop < 300) {
      pageLoading.current = true;
      setPageNumber((p) => p + 1);
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
  // every photo and video of the loaded conversation, opened at this one
  const openMedia = (m) => {
    const list = messagesList
      .filter((x) => !x.isDeleted && x.mediaUrl && (x.mediaType === "image" || x.mediaType === "video"))
      .map((x) => ({
        url: x.mediaUrl,
        type: x.mediaType,
        fromMe: x.fromMe,
        title: x.fromMe ? "Você" : x.contact && x.contact.name,
        date: new Date(x.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
      }));
    openGallery(list, Math.max(0, list.findIndex((x) => x.url === m.mediaUrl)));
  };

  // meta: the time and the ticks, for the parts that place them themselves (audio, contact, location); overlay: the same over a
  // picture or a video without caption
  const renderMedia = (m, { meta, overlay } = {}) => {
    // the retention policy deleted the file on purpose (Configurações > Retenção de dados): nothing to bring back from the phone
    if (!m.mediaUrl && m.mediaPurgedAt) {
      return (
        <div className={classes.deleted}>
          <Block style={{ fontSize: 16 }} />
          {m.mediaType === "audio" ? "Áudio apagado pela política de retenção" : "Arquivo apagado pela política de retenção"}
        </div>
      );
    }
    if (needsMedia(m)) return <MediaPlaceholder message={m} />;
    if (m.mediaType === "location" && (m.body || "").split("|").length >= 2) {
      const [image, link, description] = m.body.split("|");
      return <LocationPreview image={image} link={link} description={description || null} overlay={overlay} meta={meta} />;
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
      return <VcardPreview vcard={m.body} contact={contact} numbers={numbers[0]?.number} meta={meta} fromMe={m.fromMe} />;
    }
    if (m.mediaType === "image") {
      const sticker = /\.webp(\?|$)/i.test(m.mediaUrl || "");
      return (
        <div className={classes.media}>
          <ModalImageCors imageUrl={m.mediaUrl} sticker={sticker} onOpen={() => openMedia(m)} overlay={sticker ? null : overlay} />
        </div>
      );
    }
    // the text of the voice note (written down once by the transcription), for whoever can already read this conversation
    if (m.mediaType === "audio") {
      const pic = !m.fromMe && m.contact && m.contact.profilePicUrl;
      const name = !m.fromMe && m.contact ? senderName(m.contact) : "";
      return (
        <>
          <Audio
            url={m.mediaUrl}
            fromMe={m.fromMe}
            avatarUrl={pic || null}
            initials={name ? initialsOf(name) : null}
            avatarColor={name ? colorOfSender(m, false) : null}
            meta={meta}
          />
          {m.transcript && (
            <div className={classes.transcript}>
              <span className={classes.transcriptLabel}>Transcrição</span>
              {m.transcript}
            </div>
          )}
        </>
      );
    }
    if (m.mediaType === "video") {
      return (
        <div className={classes.media}>
          <VideoThumb m={m} classes={classes} overlay={overlay} onOpen={() => openMedia(m)} />
        </div>
      );
    }
    return <FileCard url={m.mediaUrl} name={fileNameOf(m)} />;
  };

  const ack = (m) => {
    if (!m.fromMe) return null;
    if (m.ack < 0) return <ErrorOutline className={classes.ack} style={{ fontSize: 15, color: "#ea0038" }} titleAccess="Falha no envio" />;
    // the clock is only for the first moments: a message older than 2 minutes was surely sent
    if (m.ack === 0 && Date.now() - new Date(m.createdAt).getTime() < 120000) return <AccessTime className={classes.ack} style={{ fontSize: 14 }} />;
    if (m.ack === 0) return <Done className={classes.ack} />;
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
        {shownText(m.quotedMsg?.body, m.quotedMsg?.mediaType, m.quotedMsg?.mediaUrl)}
      </div>
    </div>
  );

  const items = [];
  // in a group, each person gets the next color in the order they first appear (no two of the first ten share one), as on WhatsApp
  const colorSlot = new Map();
  if (isGroup) messagesList.forEach((m) => { if (!m.fromMe && !colorSlot.has(senderKey(m, true))) colorSlot.set(senderKey(m, true), colorSlot.size); });
  const colorOfSender = (m, darkMode) => senderColor(colorSlot.has(senderKey(m, true)) ? colorSlot.get(senderKey(m, true)) : senderKey(m, true), darkMode);
  messagesList.forEach((m, i) => {
    const prev = messagesList[i - 1];
    const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
    // a new person (in a group, each participant; elsewhere, you or them) or a new day starts a new sequence of bubbles
    const newSender = !prev || senderKey(prev, isGroup) !== senderKey(m, isGroup) || newDay || m.id === firstUnreadId;
    const groupIn = isGroup && !m.fromMe;
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
    // stickers (webp) show alone, without a bubble, like on WhatsApp
    const isSticker = m.mediaType === "image" && /\.webp(\?|$)/i.test(m.mediaUrl || "");
    const filePurged = !m.mediaUrl && !!m.mediaPurgedAt;
    const hasMedia = m.mediaUrl || filePurged || needsMedia(m) || m.mediaType === "location" || m.mediaType === "vcard";
    const mediaOnly = hasMedia && (m.mediaType === "image" || m.mediaType === "video") && isOnlyFileName(m);
    const showText = !m.isDeleted && !m.bodyPurgedAt && !(hasMedia && (isOnlyFileName(m) || filePurged || m.mediaType === "vcard" || m.mediaType === "location" || m.mediaType === "audio"));
    const live = !m.isDeleted && !m.bodyPurgedAt;
    const isMap = m.mediaType === "location" && (m.body || "").split("|").length >= 2;
    const mapText = isMap && !!(m.body.split("|")[2] || "").trim();
    // pictures, videos and maps fill the bubble edge to edge (as on WhatsApp)
    const visual = live && !isSticker && ((!!m.mediaUrl && (m.mediaType === "image" || m.mediaType === "video")) || isMap);
    const header = (groupIn && newSender) || (m.isForwarded && !m.isDeleted) || !!m.quotedMsg;
    // the time over the picture (no caption), inside the player or the card (audio, contact, map with a name), or after the content
    const overTime = visual && (isMap ? !mapText : mediaOnly);
    const placedTime = live && (m.mediaType === "audio" || m.mediaType === "vcard" || (isMap && mapText)) && !needsMedia(m) && !filePurged;
    const metaEl = (extra) => (
      <span className={clsx(classes.meta, extra)} title={fullDate(m.createdAt)}>
        {m.starred && <Star style={{ fontSize: 12 }} />}
        {clock(m.createdAt)}
        {ack(m)}
      </span>
    );
    const rx = reactionsOf(m);
    const isMatch = matchIds.includes(m.id);
    const isActive = isMatch && matchIds[matchIndex] === m.id;

    items.push(
      <div
        key={m.id}
        data-mid={m.id}
        className={clsx(classes.row, classes.rowHover, mine ? classes.rowOut : classes.rowIn, newSender && classes.rowFirst, picked && !m.isDeleted && classes.pickRow, picked && picked.includes(m.id) && classes.pickRowOn)}
        onClick={picked && !m.isDeleted ? (e) => togglePick(m.id, e.shiftKey) : undefined}
      >
        {mine && !picked && !m.isDeleted && !m.pending && (REACTIONS[channel] || REACTIONS.whatsapp).length > 0 && (
          <ReactionBar message={m} channel={channel} className={classes.reactBtn} />
        )}
        {groupIn && (newSender
          ? (m.contact && m.contact.profilePicUrl
            ? <img className={classes.senderAvatar} src={m.contact.profilePicUrl} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
            : <span className={classes.senderAvatar} style={{ background: colorOfSender(m, false) }} aria-hidden="true">{initialsOf(senderName(m.contact))}</span>)
          : <span className={classes.senderGap} aria-hidden="true" />)}
        {picked && !m.isDeleted && (
          <span className={clsx(classes.pickMark, picked.includes(m.id) && classes.pickMarkOn)}>
            {picked.includes(m.id) && <Check size={14} strokeWidth={3} />}
          </span>
        )}
        <div
          ref={(el) => {
            bubbleRefs.current[m.id] = el;
          }}
          className={clsx(
            mine ? classes.bubbleOut : classes.bubbleIn,
            newSender && !isSticker && classes.tailed,
            newSender && !isSticker && (mine ? classes.tailedOut : classes.tailedIn),
            isSticker && classes.sticker,
            visual && classes.mediaBubble,
            rx.length > 0 && classes.withReactions,
            isMatch && classes.match,
            isActive && classes.matchActive
          )}
        >
          {!m.isDeleted && !m.pending && (
            <IconButton aria-label="Mostrar mais"
              size="small"
              className={clsx(classes.chevron, visual && !header && classes.chevronOnMedia)}
              onClick={(e) => {
                setSelectedMessage(m);
                setAnchorEl(e.currentTarget);
              }}
            >
              <ExpandMore />
            </IconButton>
          )}
          {groupIn && newSender && <span className={classes.sender} style={{ color: colorOfSender(m, dark) }}>{senderName(m.contact)}</span>}
          {m.isForwarded && !m.isDeleted && <div className={classes.forwarded}><Forward style={{ fontSize: 15 }} aria-hidden="true" />Encaminhada</div>}
          {m.quotedMsg && renderQuote(m)}
          {m.isDeleted ? (
            <div className={classes.deleted}>
              <Block style={{ fontSize: 16 }} />
              Mensagem apagada
              <span className={classes.meta} title={fullDate(m.createdAt)}>{clock(m.createdAt)}</span>
            </div>
          ) : m.bodyPurgedAt ? (
            <div className={classes.deleted}>
              <Block style={{ fontSize: 16 }} />
              Conteúdo apagado pela política de retenção
              <span className={classes.meta} title={fullDate(m.createdAt)}>{clock(m.createdAt)}</span>
            </div>
          ) : (
            <>
              {hasMedia && renderMedia(m, {
                meta: placedTime ? metaEl() : null,
                overlay: overTime ? <><span className={classes.mediaShade} />{metaEl(classes.metaOnMedia)}</> : null,
              })}
              {showText && (
                <div className={classes.text}>
                  {!hasMedia && !m.isDeleted && hasLink(m.body) && <LinkCard messageId={m.id} fromMe={mine} />}
                  <MarkdownWrapper>{friendlyBody(m.body)}</MarkdownWrapper>
                  <span className={classes.meta} title={fullDate(m.createdAt)}>
                    {m.starred && <Star style={{ fontSize: 12 }} />}
                    {m.isEdited && <span style={{ fontStyle: "italic" }}>editada</span>}
                    {clock(m.createdAt)}
                    {ack(m)}
                  </span>
                </div>
              )}
              {!showText && !overTime && !placedTime && metaEl()}
              {!showText && !overTime && !placedTime && <div style={{ clear: "both" }} />}
            </>
          )}
          {rx.length > 0 && (
            <span className={classes.reactions}>
              {[...new Set(rx.map((r) => r.emoji))].join("")}
              {rx.length > 1 && <span style={{ fontSize: 11 }}>{rx.length}</span>}
            </span>
          )}
        </div>
        {!mine && !picked && !m.isDeleted && (REACTIONS[channel] || REACTIONS.whatsapp).length > 0 && (
          <ReactionBar message={m} channel={channel} className={classes.reactBtn} />
        )}
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
                  try { await Promise.all(chosen.map((m) => api.put(`/messages/${m.id}/star`, { starred: !allStarred }))); } catch (err) { toastError(err); }
                  setPicked(null);
                }}>{allStarred ? <StarBorder /> : <Star />}</IconButton>
              <Button size="small" className={classes.pickGo} disabled={!picked.length} startIcon={<Forward />} onClick={() => setForwardMany(true)}>Encaminhar{picked.length ? ` (${picked.length})` : ""}</Button>
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
                  try { await Promise.all(chosen.map((m) => api.delete(`/messages/${m.id}`, { params: { scope: "local" } }))); } catch (err) { toastError(err); }
                  setPicked(null);
                }}>Apagar só aqui</Button>
              </DialogActions>
            </Dialog>
          </>
        );
      })()}
      <div ref={listRef} id="messagesList" className={clsx(classes.list, picked && classes.listPicking)} onScroll={onScroll}>
        {messagesList.length === 0 && !loading && <div className={classes.empty}>Nenhuma mensagem ainda. Diga olá!</div>}
        <div ref={contentRef} className={classes.content}>
        {messagesList.length > 0 && items}
        {rtDown && (
          <div role="status" style={{ alignSelf: "center", margin: "8px 0", padding: "4px 12px", borderRadius: 999, fontSize: 12, background: "rgba(237,108,2,.15)", color: "#b45309" }}>
            Sem conexão em tempo real. Atualizando a cada 8 segundos.
          </div>
        )}
        {typing && (
          <div className={clsx(classes.typingRow, typing.from === "agent" ? classes.rowOut : classes.rowIn)} aria-live="polite" aria-label={typing.from === "agent" ? "O agente de IA está digitando" : "O contato está digitando"}>
            <div className={clsx(classes.typingBubble, typing.from === "agent" && classes.typingBubbleAgent)}>
              {typing.from === "agent" && <Bot size={15} className={classes.typingBot} />}
              <span className={classes.typingDot} />
              <span className={classes.typingDot} />
              <span className={classes.typingDot} />
            </div>
          </div>
        )}
        </div>
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
