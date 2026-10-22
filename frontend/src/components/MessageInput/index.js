import React, { useState, useEffect, useContext, useRef } from "react";
import { useParams } from "react-router-dom";
import { toast } from "react-toastify";
import EmojiPicker from "../EmojiPicker";
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
import { fillQuickVars } from "../../utils/quickVars";
import RecordingTimer from "./RecordingTimer";
import AttachMenu from "./AttachMenu";
import { ReplyMessageContext } from "../../context/ReplyingMessage/ReplyingMessageContext";
import { AuthContext } from "../../context/Auth/AuthContext";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import toastError from "../../errors/toastError";
import { wa } from "../chat/chatTheme";
import { isManager } from "../../utils/access";
import { getDraft, setDraft } from "../../utils/drafts";

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
      background: c.accent,
      color: "#fff",
      boxShadow: "0 3px 10px rgba(0,168,132,.35)",
      transition: "transform .12s, box-shadow .15s",
      "&:hover": { background: c.accent, filter: "brightness(1.08)", transform: "translateY(-1px)" },
      "&:active": { transform: "scale(.94)" },
      "&.Mui-disabled": { background: c.accent, opacity: 0.5, color: "#fff", boxShadow: "none" },
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
      borderRadius: 18,
      overflow: "hidden",
      boxShadow: c.float,
      "& em-emoji-picker": { "--font-family": "inherit", "--rgb-accent": "0, 168, 132", height: 380, maxHeight: "60vh" },
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
    quickOn: { backgroundColor: c.selected },
    quickHint: { fontSize: 12, color: c.textSecondary, cursor: "default", textAlign: "right", borderTop: `1px solid ${c.divider}`, "&:hover": { backgroundColor: "transparent !important" } },
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

const isImage = (f) => f && f.type && f.type.startsWith("image/");

// one key per send: if the same request is repeated (double click, retry after a timeout) the server sends it only once
const newKey = () => (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const MessageInput = ({ ticketStatus, aiActive, historical, isGroup, contactName, channel, readOnly, ticketUserId, ticketUserName }) => {
  const classes = useStyles();
  const emojiDark = useTheme().palette.type === "dark";
  const { ticketId } = useParams();

  const [medias, setMedias] = useState([]);
  const [captions, setCaptions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [inputMessage, setInputMessage] = useState("");
  // other parts of the screen (the tutor's welcome banner) can put a ready text in the box; the person still sends it
  useEffect(() => {
    const fill = (e) => {
      if (!e.detail || String(e.detail.ticketId) !== String(ticketId)) return;
      setInputMessage(e.detail.text || "");
      setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
    };
    window.addEventListener("fillMessageInput", fill);
    return () => window.removeEventListener("fillMessageInput", fill);
  }, [ticketId]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [quickAnswers, setQuickAnswer] = useState([]);
  const [typeBar, setTypeBar] = useState(false);
  const [quickIndex, setQuickIndex] = useState(0);
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
  // groups and conversations from the phone's history are written in directly: the first message opens them
  // Whoever sends the first message of a conversation nobody attends (waiting, or with the AI agent) becomes its attendant: the server decides it
  // in the same write as the send. A conversation that belongs to someone else is read-only here: it is transferred or taken over on purpose.
  const mine = !ticketUserId || ticketUserId === user?.id;
  const open = ((ticketStatus === "open" || ticketStatus === "pending") && mine) || !!isGroup || !!historical;
  const takesOnSend = ticketStatus === "pending" && !ticketUserId && !isGroup && !historical;

  useEffect(() => {
    inputRef.current && inputRef.current.focus();
  }, [replyingMessage]);

  // an upload or a recording ended: the cursor is back in the box
  useEffect(() => {
    if (!loading && inputRef.current) inputRef.current.focus();
  }, [loading]);

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
    // what was typed and not sent comes back when the conversation is opened again
    setInputMessage(getDraft(ticketId));
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
        setQuickIndex(0);
        setTypeBar(data.quickAnswers.length > 0);
      } catch (err) {
        setTypeBar(false);
      }
    } else {
      setTypeBar(false);
    }
  };

  // puts a quick reply in the field, with its variables filled in ({{nome}}, {{saudacao}}, ...), ready to edit
  const pickQuick = (answer) => {
    setInputMessage(fillQuickVars(answer.message, { contactName, agentName: user && user.name }));
    setTypeBar(false);
    inputRef.current && inputRef.current.focus();
  };

  // tells the contact "digitando…" where the channel supports it (the server also throttles)
  const lastTyping = useRef(0);
  const draftTimer = useRef(null);
  const handleChange = (e) => {
    setInputMessage(e.target.value);
    const id = ticketId;
    const text = e.target.value;
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => setDraft(id, text), 300);
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

  // messages typed one after the other go out in the order they were typed, one request at a time
  const sendQueue = useRef(Promise.resolve());

  const handleSend = () => {
    const text = inputMessage.trim();
    if (!text) return;
    const quoted = replyingMessage;
    const body = signMessage ? `*${user?.name}:*\n${text}` : text;
    // the box is free at once, with the cursor in it: the next message can be typed while this one goes out
    clearTimeout(draftTimer.current);
    setDraft(ticketId, "");
    setInputMessage("");
    setShowEmoji(false);
    setReplyingMessage(null);
    if (inputRef.current) inputRef.current.focus();
    sendQueue.current = sendQueue.current.then(async () => {
      try {
        await api.post(`/messages/${ticketId}`, { read: 1, fromMe: true, mediaUrl: "", body, quotedMsg: quoted, clientKey: newKey() });
      } catch (err) {
        toastError(err);
        // what was typed comes back, unless something new is already being typed
        setInputMessage((current) => (current ? current : text));
      }
    });
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
      formData.append("clientKey", newKey());
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
        formData.append("clientKey", newKey());
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

  // a channel or an announcement group where only the administrators write
  if (readOnly) {
    return (
      <div className={classes.wrap}>
        <div className={classes.blocked}>Só os administradores podem escrever aqui. Você acompanha as mensagens, mas não responde.</div>
      </div>
    );
  }

  if (!open) {
    return (
      <div className={classes.wrap}>
        <div className={classes.blocked}>
          {ticketUserId && ticketUserId !== user?.id && ticketStatus !== "closed"
            ? `Esta conversa está com ${ticketUserName || "outro atendente"}. Você acompanha as mensagens, mas só quem atende responde. Peça a transferência${isManager(user) ? " ou use Assumir conversa no topo" : ""}.`
            : ticketStatus === "pending"
            ? aiActive
              ? "O agente de IA está atendendo esta conversa. Clique em Aceitar para assumir e responder você mesmo."
              : "Aceite a conversa para responder."
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
          <IconButton aria-label="Fechar" className={classes.icon} onClick={() => setReplyingMessage(null)}>
            <Close />
          </IconButton>
        </div>
      )}

      {typeBar && (
        <ul className={classes.quick} data-quick-list>
          {quickAnswers.map((value, i) => (
            <li
              key={value.id || value.shortcut}
              className={i === quickIndex ? classes.quickOn : undefined}
              onMouseEnter={() => setQuickIndex(i)}
              onClick={() => pickQuick(value)}
            >
              <b>{value.shortcut}</b>
              {fillQuickVars(value.message, { contactName, agentName: user && user.name })}
            </li>
          ))}
          <li className={classes.quickHint}>↑ ↓ escolher · Enter ou Tab inserir · Esc fechar</li>
        </ul>
      )}

      <div className={classes.bar}>
        {recording ? (
          <div className={classes.recorder}>
            <IconButton aria-label="Excluir" className={classes.icon} onClick={cancelAudio} disabled={loading}>
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
            <IconButton aria-label="Emojis" className={classes.icon} onClick={() => setShowEmoji((v) => !v)} disabled={loading}>
              <Mood />
            </IconButton>
            {showEmoji && (
              <div className={classes.emojiBox}>
                <ClickAwayListener onClickAway={() => setShowEmoji(false)}>
                  <div>
                    <EmojiPicker dark={emojiDark} onSelect={(emoji) => setInputMessage((s) => s + emoji)} />
                  </div>
                </ClickAwayListener>
              </div>
            )}
            <IconButton aria-label="Adicionar"
              className={clsx(classes.icon, attachEl && classes.iconOn)}
              onClick={(e) => setAttachEl(e.currentTarget)}
              disabled={loading}
              style={{ transition: "transform .15s" }}
            >
              <Add />
            </IconButton>
            <AttachMenu
              anchorEl={attachEl}
              onClose={() => setAttachEl(null)}
              inputs={{ doc: docInput, media: mediaInput, camera: cameraInput }}
              onQuick={() => { setInputMessage("/"); loadQuick("/"); inputRef.current && inputRef.current.focus(); }}
              signMessage={signMessage}
              setSignMessage={setSignMessage}
              ticketId={ticketId}
              channel={channel}
            />
            <input ref={docInput} hidden multiple type="file" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            <input ref={mediaInput} hidden multiple type="file" accept="image/*,video/*" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            <input ref={cameraInput} hidden type="file" accept="image/*" capture="environment" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />

            <div className={classes.field}>
              <InputBase
                inputRef={(el) => {
                  if (el) inputRef.current = el;
                }}
                className={classes.input}
                placeholder={takesOnSend ? "Ao enviar, a conversa passa a ser sua" : "Digite uma mensagem"}
                multiline
                maxRows={6}
                value={inputMessage}
                onChange={handleChange}
                readOnly={loading}
                onPaste={handlePaste}
                onKeyDown={(e) => { e && e.persist && e.persist();
                  if (!typeBar || !quickAnswers.length) return;
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setQuickIndex((i) => (e.key === "ArrowDown" ? (i + 1) % quickAnswers.length : (i - 1 + quickAnswers.length) % quickAnswers.length));
                  } else if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    pickQuick(quickAnswers[quickIndex] || quickAnswers[0]);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setTypeBar(false);
                  }
                }}
                onKeyPress={(e) => {
                  if (loading || e.shiftKey) return;
                  if (e.key === "Enter") {
                    e.preventDefault();
                    // Enter while the quick reply list is open inserts the reply (handled in onKeyDown)
                    if (typeBar && quickAnswers.length) return;
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
              <IconButton aria-label="Gravar áudio" className={clsx(classes.icon, classes.mic)} onClick={startRecording} disabled={loading} style={{ width: 44, height: 44 }}>
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
