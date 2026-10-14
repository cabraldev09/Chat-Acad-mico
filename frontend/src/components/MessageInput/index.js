import React, { useState, useEffect, useContext, useRef } from "react";
import "emoji-mart/css/emoji-mart.css";
import { useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Picker } from "emoji-mart";
import clsx from "clsx";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import InputBase from "@material-ui/core/InputBase";
import IconButton from "@material-ui/core/IconButton";
import CircularProgress from "@material-ui/core/CircularProgress";
import ClickAwayListener from "@material-ui/core/ClickAwayListener";
import Popover from "@material-ui/core/Popover";
import Switch from "@material-ui/core/Switch";
import Add from "@material-ui/icons/Add";
import Mood from "@material-ui/icons/Mood";
import Send from "@material-ui/icons/Send";
import Mic from "@material-ui/icons/Mic";
import Close from "@material-ui/icons/Close";
import DeleteOutline from "@material-ui/icons/DeleteOutline";
import InsertDriveFile from "@material-ui/icons/InsertDriveFile";
import Image from "@material-ui/icons/Image";
import CameraAlt from "@material-ui/icons/CameraAlt";
import Edit from "@material-ui/icons/Edit";

import api from "../../services/api";
import MediaPreview from "../MediaPreview";
import { shrinkImage, isImageFile } from "../../utils/imageTools";
import RecordingTimer from "./RecordingTimer";
import { ReplyMessageContext } from "../../context/ReplyingMessage/ReplyingMessageContext";
import { AuthContext } from "../../context/Auth/AuthContext";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import toastError from "../../errors/toastError";
import { wa } from "../chat/chatTheme";

const MIC_ERRORS = {
  NotAllowedError: "Permita o uso do microfone no navegador (ícone de cadeado ao lado do endereço) e tente de novo.",
  PermissionDeniedError: "Permita o uso do microfone no navegador (ícone de cadeado ao lado do endereço) e tente de novo.",
  NotFoundError: "Nenhum microfone encontrado neste computador.",
  NotReadableError: "O microfone está sendo usado por outro programa.",
};

const AUDIO_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
const extensionOf = (mime) => (/mp4|aac/.test(mime) ? "m4a" : /ogg/.test(mime) ? "ogg" : "webm");

const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  return {
    wrap: { flex: "none", position: "relative", backgroundColor: c.wallpaper },
    drop: {
      position: "absolute",
      inset: 0,
      zIndex: 5,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 15,
      fontWeight: 600,
      color: c.accent,
      backgroundColor: c.panel,
      border: `2px dashed ${c.accent}`,
      borderRadius: 8,
    },
    reply: { display: "flex", alignItems: "stretch", gap: 8, padding: theme.spacing(1, 1.5, 0) },
    replyCard: { flex: 1, minWidth: 0, display: "flex", borderRadius: 8, overflow: "hidden", backgroundColor: c.panel },
    replyBar: { flex: "none", width: 4, backgroundColor: "#06cf9c" },
    replyBarMe: { backgroundColor: "#53bdeb" },
    replyBody: { padding: "6px 10px", minWidth: 0, fontSize: 13.5, color: c.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    replyName: { display: "block", fontSize: 13, fontWeight: 600, color: "#06cf9c" },
    bar: {
      display: "flex",
      alignItems: "flex-end",
      gap: theme.spacing(0.25),
      margin: theme.spacing(0.5, 2, 1.75),
      padding: "6px 8px",
      borderRadius: 28,
      backgroundColor: c.panel,
      boxShadow: c.float,
      border: `1px solid ${c.divider}`,
      [theme.breakpoints.down("xs")]: { margin: theme.spacing(0.5, 1, 1) },
    },
    icon: { color: c.textSecondary, padding: 9, transition: "color .15s, background-color .15s", "&:hover": { color: c.accent, backgroundColor: c.hover } },
    iconOn: { color: c.accent, transform: "rotate(45deg)" },
    field: {
      flex: 1,
      minWidth: 0,
      position: "relative",
      display: "flex",
      alignItems: "center",
      minHeight: 42,
      padding: "0 6px",
    },
    input: { flex: 1, fontSize: 15, color: c.text, padding: "9px 0", "& textarea": { lineHeight: "21px" } },
    send: {
      width: 42,
      height: 42,
      flex: "none",
      background: "linear-gradient(140deg, #0693e3 0%, #0b4279 100%)",
      color: "#fff",
      boxShadow: "0 4px 12px rgba(6,147,227,.35)",
      transition: "transform .12s, box-shadow .15s",
      "&:hover": { background: "linear-gradient(140deg, #0693e3 0%, #0b4279 100%)", filter: "brightness(1.08)", transform: "translateY(-1px)" },
      "&:active": { transform: "scale(.94)" },
      "&.Mui-disabled": { background: "linear-gradient(140deg, #0693e3 0%, #0b4279 100%)", opacity: 0.5, color: "#fff", boxShadow: "none" },
    },
    mic: { color: c.textSecondary },
    emojiBox: {
      position: "absolute",
      bottom: "100%",
      left: 0,
      zIndex: 20,
      marginBottom: 12,
      transformOrigin: "bottom left",
      animation: "emojiIn .16s ease-out",
      maxWidth: "calc(100vw - 24px)",
      "& .emoji-mart": {
        width: "min(372px, calc(100vw - 24px)) !important",
        fontFamily: "inherit",
        color: c.text,
        backgroundColor: c.panel,
        border: `1px solid ${c.divider}`,
        borderRadius: 22,
        boxShadow: c.float,
        overflow: "hidden",
      },
      "& .emoji-mart-bar": { borderColor: c.divider },
      "& .emoji-mart-anchors": { padding: "0 6px" },
      "& .emoji-mart-anchor": { color: c.textSecondary, padding: "12px 4px 10px", transition: "color .15s" },
      "& .emoji-mart-anchor:hover, & .emoji-mart-anchor-selected": { color: `${c.accent} !important` },
      "& .emoji-mart-anchor-bar": { backgroundColor: "#0693e3 !important", height: 3, borderRadius: 3 },
      "& .emoji-mart-search": { margin: "10px 12px 4px" },
      "& .emoji-mart-search input": {
        fontFamily: "inherit",
        fontSize: 14,
        padding: "9px 14px",
        color: c.text,
        backgroundColor: c.inputBg,
        border: "2px solid transparent",
        borderRadius: 999,
        outline: "none",
        transition: "border-color .15s",
        "&:focus": { borderColor: "#0693e3" },
        "&::placeholder": { color: c.textSecondary },
      },
      "& .emoji-mart-search-icon": { top: 6, right: 8 },
      "& .emoji-mart-scroll": { height: 250, padding: "0 8px 8px", ...theme.scrollbarStyles },
      "& .emoji-mart-category .emoji-mart-category-label": { margin: 0, padding: 0, fontFamily: "inherit" },
      "& .emoji-mart-category .emoji-mart-category-label span": {
        fontFamily: "inherit",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: ".02em",
        color: c.textSecondary,
        padding: "10px 6px 6px",
        backgroundColor: `${c.panel} !important`,
      },
      "& .emoji-mart-emoji": { borderRadius: 12, transition: "transform .1s" },
      "& .emoji-mart-emoji:hover": { transform: "scale(1.18)" },
      "& .emoji-mart-emoji:hover:before, & .emoji-mart-emoji-native:hover": { backgroundColor: `${c.hover} !important` },
      "& .emoji-mart-emoji span": { cursor: "pointer" },
      "& .emoji-mart-no-results": { color: c.textSecondary, fontFamily: "inherit" },
    },
    blocked: { padding: theme.spacing(2), textAlign: "center", fontSize: 14, color: c.textSecondary },
    menuItem: { display: "flex", alignItems: "center", gap: 14, padding: "10px 22px 10px 16px", cursor: "pointer", fontSize: 15, color: c.text, "&:hover": { backgroundColor: c.hover } },
    menuIcon: { width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" },
    menuSwitch: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "6px 12px 6px 22px", fontSize: 14, color: c.textSecondary, borderTop: `1px solid ${c.divider}` },
    quick: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: "100%",
      maxHeight: 220,
      overflowY: "auto",
      margin: 0,
      padding: theme.spacing(0.5, 0),
      listStyle: "none",
      backgroundColor: c.panel,
      borderTop: `1px solid ${c.divider}`,
      boxShadow: "0 -4px 12px rgba(11,20,26,.12)",
      "& li": { padding: theme.spacing(1, 2), fontSize: 14, color: c.text, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", "&:hover": { backgroundColor: c.hover } },
      "& b": { color: c.accent, marginRight: 8 },
    },
    recorder: { flex: 1, display: "flex", alignItems: "center", gap: theme.spacing(1) },
    rec: { display: "flex", alignItems: "center", gap: 8, flex: 1, color: c.text, fontSize: 15 },
    recDot: { width: 10, height: 10, borderRadius: "50%", backgroundColor: "#ea0038", animation: "waPulse 1.2s ease-in-out infinite" },
    "@global": {
      "@keyframes waPulse": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.25 } },
      "@keyframes emojiIn": { from: { opacity: 0, transform: "translateY(8px) scale(.96)" }, to: { opacity: 1, transform: "none" } },
    },
    preview: { display: "flex", flexDirection: "column", backgroundColor: c.header, borderTop: `1px solid ${c.divider}` },
    previewTop: { display: "flex", alignItems: "center", gap: 8, padding: theme.spacing(1, 1.5), color: c.textSecondary, fontSize: 14 },
    previewStage: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200, maxHeight: 340, padding: theme.spacing(1, 2), backgroundColor: c.wallpaper },
    previewImg: { maxWidth: "100%", maxHeight: 320, borderRadius: 8, boxShadow: c.shadow },
    previewFile: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: c.textSecondary, "& svg": { fontSize: 72 } },
    thumbs: { display: "flex", gap: 8, padding: theme.spacing(1, 1.5), overflowX: "auto" },
    thumb: { flex: "none", width: 54, height: 54, borderRadius: 8, overflow: "hidden", cursor: "pointer", border: "2px solid transparent", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: c.panelAlt, color: c.textSecondary, "& img": { width: "100%", height: "100%", objectFit: "cover" } },
    thumbOn: { borderColor: c.accent },
    previewBar: { display: "flex", alignItems: "center", gap: 8, padding: theme.spacing(1, 1.5, 1.5) },
  };
});

const EMOJI_PT = {
  search: "Buscar emoji",
  clear: "Limpar",
  notfound: "Nenhum emoji encontrado",
  skintext: "Escolha o tom de pele",
  categorieslabel: "Categorias de emoji",
  categories: {
    search: "Resultados da busca",
    recent: "Usados recentemente",
    smileys: "Carinhas e pessoas",
    people: "Pessoas e corpo",
    nature: "Animais e natureza",
    foods: "Comidas e bebidas",
    activity: "Atividades",
    places: "Viagens e lugares",
    objects: "Objetos",
    symbols: "Símbolos",
    flags: "Bandeiras",
    custom: "Personalizados",
  },
  categorieslabel2: "",
  skintones: { 1: "Tom padrão", 2: "Tom claro", 3: "Tom médio-claro", 4: "Tom médio", 5: "Tom médio-escuro", 6: "Tom escuro" },
};

const isImage = (f) => f && f.type && f.type.startsWith("image/");

const MessageInput = ({ ticketStatus, historical }) => {
  const classes = useStyles();
  const emojiDark = useTheme().palette.type === "dark";
  const { ticketId } = useParams();

  const [medias, setMedias] = useState([]);
  const [captions, setCaptions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [inputMessage, setInputMessage] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [quickAnswers, setQuickAnswer] = useState([]);
  const [typeBar, setTypeBar] = useState(false);
  const [attachEl, setAttachEl] = useState(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();
  const recorderRef = useRef(null);
  const docInput = useRef();
  const mediaInput = useRef();
  const cameraInput = useRef();
  const { setReplyingMessage, replyingMessage } = useContext(ReplyMessageContext);
  const { user } = useContext(AuthContext);
  const [signMessage, setSignMessage] = useLocalStorage("signOption", true);
  const open = ticketStatus === "open";

  useEffect(() => {
    inputRef.current && inputRef.current.focus();
  }, [replyingMessage]);

  // leaving the conversation (or the page) must not leave the microphone on
  useEffect(
    () => () => {
      const r = recorderRef.current;
      if (r && r.stream) r.stream.getTracks().forEach((t) => t.stop());
    },
    []
  );

  useEffect(() => {
    inputRef.current && inputRef.current.focus();
    return () => {
      setInputMessage("");
      setShowEmoji(false);
      setMedias([]);
      setCaptions([]);
      setReplyingMessage(null);
    };
  }, [ticketId, setReplyingMessage]);

  const addFiles = async (files, append = false) => {
    const incoming = Array.from(files || []);
    if (!incoming.length) return;
    const room = append ? Math.max(0, 10 - medias.length) : 10;
    if (incoming.length > room) toast.info("Você pode enviar até 10 arquivos de uma vez.");
    const list = await Promise.all(incoming.slice(0, room).map((f) => shrinkImage(f)));
    if (!list.length) return;
    if (append) {
      setMedias((cur) => [...cur, ...list]);
      setCaptions((cur) => [...cur, ...list.map(() => "")]);
      setCurrent(medias.length);
    } else {
      setMedias(list);
      setCaptions(list.map(() => ""));
      setCurrent(0);
    }
  };

  const clearMedias = () => {
    setMedias([]);
    setCaptions([]);
    setCurrent(0);
  };

  const loadQuick = async (value) => {
    if (value && value.indexOf("/") === 0) {
      try {
        const { data } = await api.get("/quickAnswers/", { params: { searchParam: value.substring(1) } });
        setQuickAnswer(data.quickAnswers);
        setTypeBar(data.quickAnswers.length > 0);
      } catch (err) {
        setTypeBar(false);
      }
    } else {
      setTypeBar(false);
    }
  };

  // tells the contact "digitando…" where the channel supports it (the server also throttles)
  const lastTyping = useRef(0);
  const handleChange = (e) => {
    setInputMessage(e.target.value);
    loadQuick(e.target.value);
    if (ticketStatus === "open" && e.target.value && !e.target.value.startsWith("/") && Date.now() - lastTyping.current > 4000) {
      lastTyping.current = Date.now();
      api.post(`/tickets/${ticketId}/typing`).catch(() => {});
    }
  };

  // Ctrl+V with a picture or file on the clipboard (print screen, copied image) goes to the preview
  const handlePaste = (e) => {
    if (e.clipboardData.files && e.clipboardData.files.length) {
      e.preventDefault();
      addFiles(e.clipboardData.files, medias.length > 0);
    }
  };

  const handleSend = async () => {
    if (!inputMessage.trim()) return;
    setLoading(true);
    try {
      await api.post(`/messages/${ticketId}`, {
        read: 1,
        fromMe: true,
        mediaUrl: "",
        body: signMessage ? `*${user?.name}:*\n${inputMessage.trim()}` : inputMessage.trim(),
        quotedMsg: replyingMessage,
      });
    } catch (err) {
      toastError(err);
    }
    setInputMessage("");
    setShowEmoji(false);
    setLoading(false);
    setReplyingMessage(null);
  };

  const handleUploadMedia = async () => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("fromMe", true);
      medias.forEach((media, i) => {
        formData.append("medias", media);
        // the caption travels with each file (documents keep their own name)
        formData.append("body", captions[i] || "");
      });
      await api.post(`/messages/${ticketId}`, formData);
      clearMedias();
    } catch (err) {
      toastError(err);
    }
    setLoading(false);
  };

  // returns what was recorded, or null when nothing was
  const finishRecording = () =>
    new Promise((resolve) => {
      const r = recorderRef.current;
      recorderRef.current = null;
      if (!r) {
        resolve(null);
        return;
      }
      const done = () => {
        r.stream.getTracks().forEach((t) => t.stop());
        resolve({ blob: new Blob(r.chunks, { type: r.type }), ms: Date.now() - r.startedAt, type: r.type });
      };
      if (r.rec.state === "inactive") {
        done();
        return;
      }
      r.rec.onstop = done;
      r.rec.stop();
    });

  const startRecording = async () => {
    setLoading(true);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
        toast.error("Este navegador não permite gravar áudio. Use o Chrome, Edge ou Safari atualizado.");
        setLoading(false);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mimeType = AUDIO_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      rec.start(250);
      recorderRef.current = { rec, stream, chunks, type: rec.mimeType || mimeType || "audio/webm", startedAt: Date.now() };
      setRecording(true);
    } catch (err) {
      toast.error(MIC_ERRORS[err && err.name] || "Não foi possível gravar o áudio.");
    }
    setLoading(false);
  };

  const sendAudio = async () => {
    setLoading(true);
    try {
      const result = await finishRecording();
      if (!result || result.ms < 700 || result.blob.size < 1000) {
        toast.info("Áudio muito curto. Segure a gravação por mais tempo.");
      } else {
        const formData = new FormData();
        formData.append("medias", result.blob, `audio-${Date.now()}.${extensionOf(result.type)}`);
        formData.append("body", "");
        formData.append("fromMe", true);
        await api.post(`/messages/${ticketId}`, formData);
      }
    } catch (err) {
      toastError(err);
    }
    setRecording(false);
    setLoading(false);
  };

  const cancelAudio = async () => {
    await finishRecording();
    setRecording(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (open) addFiles(e.dataTransfer.files);
  };

  // ---------------------------------------------------------------- media preview
  if (medias.length > 0) {
    return (
      <MediaPreview
        medias={medias}
        setMedias={setMedias}
        captions={captions}
        setCaptions={setCaptions}
        current={current}
        setCurrent={setCurrent}
        loading={loading}
        onSend={handleUploadMedia}
        onClose={clearMedias}
        onAdd={(files) => addFiles(files, true)}
      />
    );
  }

  if (!open) {
    return (
      <div className={classes.wrap}>
        <div className={classes.blocked}>
          {ticketStatus === "pending"
            ? "Aceite a conversa para responder."
            : historical
            ? "Esta conversa é do histórico do WhatsApp. Clique em Reabrir atendimento para voltar a responder."
            : ticketStatus === "closed"
            ? "Conversa resolvida. Reabra para voltar a responder."
            : ""}
        </div>
      </div>
    );
  }

  const attachItems = [
    { label: "Documento", color: "#7f66ff", icon: <InsertDriveFile />, ref: docInput },
    { label: "Fotos e vídeos", color: "#007bfc", icon: <Image />, ref: mediaInput },
    { label: "Câmera", color: "#ff2e74", icon: <CameraAlt />, ref: cameraInput },
  ];

  return (
    <div
      className={classes.wrap}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {dragging && <div className={classes.drop}>Solte para enviar arquivos</div>}

      {replyingMessage && (
        <div className={classes.reply}>
          <div className={classes.replyCard}>
            <span className={clsx(classes.replyBar, replyingMessage.fromMe && classes.replyBarMe)} />
            <div className={classes.replyBody}>
              <span className={classes.replyName} style={replyingMessage.fromMe ? { color: "#53bdeb" } : undefined}>
                {replyingMessage.fromMe ? "Você" : replyingMessage.contact?.name || "Contato"}
              </span>
              {replyingMessage.body}
            </div>
          </div>
          <IconButton className={classes.icon} onClick={() => setReplyingMessage(null)}>
            <Close />
          </IconButton>
        </div>
      )}

      {typeBar && (
        <ul className={classes.quick}>
          {quickAnswers.map((value) => (
            <li
              key={value.id || value.shortcut}
              onClick={() => {
                setInputMessage(value.message);
                setTypeBar(false);
              }}
            >
              <b>{value.shortcut}</b>
              {value.message}
            </li>
          ))}
        </ul>
      )}

      <div className={classes.bar}>
        {recording ? (
          <div className={classes.recorder}>
            <IconButton className={classes.icon} onClick={cancelAudio} disabled={loading}>
              <DeleteOutline />
            </IconButton>
            <div className={classes.rec}>
              <span className={classes.recDot} />
              <RecordingTimer />
            </div>
            <IconButton className={classes.send} onClick={sendAudio} disabled={loading}>
              {loading ? <CircularProgress size={20} color="inherit" /> : <Send />}
            </IconButton>
          </div>
        ) : (
          <>
            <IconButton className={classes.icon} onClick={() => setShowEmoji((v) => !v)} disabled={loading}>
              <Mood />
            </IconButton>
            {showEmoji && (
              <div className={classes.emojiBox}>
                <ClickAwayListener onClickAway={() => setShowEmoji(false)}>
                  <Picker
                    native
                    perLine={8}
                    emojiSize={26}
                    emojiButtonSize={40}
                    showPreview={false}
                    showSkinTones={false}
                    title=""
                    color="#0693e3"
                    theme={emojiDark ? "dark" : "light"}
                    i18n={EMOJI_PT}
                    onSelect={(e) => setInputMessage((s) => s + e.native)}
                  />
                </ClickAwayListener>
              </div>
            )}
            <IconButton
              className={clsx(classes.icon, attachEl && classes.iconOn)}
              onClick={(e) => setAttachEl(e.currentTarget)}
              disabled={loading}
              style={{ transition: "transform .15s" }}
            >
              <Add />
            </IconButton>
            <Popover
              open={Boolean(attachEl)}
              anchorEl={attachEl}
              onClose={() => setAttachEl(null)}
              anchorOrigin={{ vertical: "top", horizontal: "left" }}
              transformOrigin={{ vertical: "bottom", horizontal: "left" }}
              PaperProps={{ style: { borderRadius: 14, marginTop: -8, overflow: "hidden" } }}
            >
              {attachItems.map((it) => (
                <div
                  key={it.label}
                  className={classes.menuItem}
                  onClick={() => {
                    setAttachEl(null);
                    it.ref.current && it.ref.current.click();
                  }}
                >
                  <span className={classes.menuIcon} style={{ backgroundColor: it.color }}>
                    {it.icon}
                  </span>
                  {it.label}
                </div>
              ))}
              <div className={classes.menuItem} onClick={() => { setAttachEl(null); setInputMessage("/"); loadQuick("/"); inputRef.current && inputRef.current.focus(); }}>
                <span className={classes.menuIcon} style={{ backgroundColor: "#00a884" }}><Edit /></span>
                Respostas rápidas
              </div>
              <div className={classes.menuSwitch}>
                Assinar com meu nome
                <Switch size="small" color="primary" checked={signMessage} onChange={(e) => setSignMessage(e.target.checked)} />
              </div>
            </Popover>
            <input ref={docInput} hidden multiple type="file" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            <input ref={mediaInput} hidden multiple type="file" accept="image/*,video/*" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            <input ref={cameraInput} hidden type="file" accept="image/*" capture="environment" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />

            <div className={classes.field}>
              <InputBase
                inputRef={(el) => {
                  if (el) inputRef.current = el;
                }}
                className={classes.input}
                placeholder="Digite uma mensagem"
                multiline
                maxRows={6}
                value={inputMessage}
                onChange={handleChange}
                disabled={loading}
                onPaste={handlePaste}
                onKeyPress={(e) => {
                  if (loading || e.shiftKey) return;
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
            </div>
            {inputMessage.trim() ? (
              <IconButton className={classes.send} onClick={handleSend} disabled={loading}>
                {loading ? <CircularProgress size={20} color="inherit" /> : <Send />}
              </IconButton>
            ) : (
              <IconButton className={clsx(classes.icon, classes.mic)} onClick={startRecording} disabled={loading} style={{ width: 44, height: 44 }}>
                <Mic />
              </IconButton>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MessageInput;
