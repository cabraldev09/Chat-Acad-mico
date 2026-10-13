import React, { useState, useEffect, useContext, useRef } from "react";
import "emoji-mart/css/emoji-mart.css";
import { useParams } from "react-router-dom";
import { Picker } from "emoji-mart";
import clsx from "clsx";
import { makeStyles } from "@material-ui/core/styles";
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
import RecordingTimer from "./RecordingTimer";
import { ReplyMessageContext } from "../../context/ReplyingMessage/ReplyingMessageContext";
import { AuthContext } from "../../context/Auth/AuthContext";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import toastError from "../../errors/toastError";
import { wa } from "../chat/chatTheme";

let Mp3Recorder = null;

const initRecorder = async () => {
  if (!Mp3Recorder) {
    try {
      const MicRecorder = (await import("mic-recorder-to-mp3")).default;
      Mp3Recorder = new MicRecorder({ bitRate: 128 });
    } catch (error) {
      console.error("Failed to initialize recorder:", error);
      return null;
    }
  }
  return Mp3Recorder;
};

const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  return {
    wrap: { flex: "none", position: "relative", backgroundColor: c.header, borderTop: `1px solid ${c.divider}` },
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
    bar: { display: "flex", alignItems: "flex-end", gap: theme.spacing(0.5), padding: theme.spacing(1, 1.5) },
    icon: { color: c.textSecondary, padding: 8 },
    iconOn: { color: c.accent, transform: "rotate(45deg)" },
    field: {
      flex: 1,
      minWidth: 0,
      position: "relative",
      display: "flex",
      alignItems: "center",
      minHeight: 42,
      padding: "0 14px",
      borderRadius: 22,
      backgroundColor: c.inputBg,
    },
    input: { flex: 1, fontSize: 15, color: c.text, padding: "9px 0", "& textarea": { lineHeight: "21px" } },
    send: {
      width: 44,
      height: 44,
      flex: "none",
      backgroundColor: c.accent,
      color: "#fff",
      "&:hover": { backgroundColor: c.accent, filter: "brightness(1.08)" },
      "&.Mui-disabled": { backgroundColor: c.accent, opacity: 0.55, color: "#fff" },
    },
    mic: { color: c.textSecondary },
    emojiBox: { position: "absolute", bottom: "100%", left: 8, zIndex: 20, marginBottom: 6 },
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
    "@global": { "@keyframes waPulse": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.25 } } },
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

const MessageInput = ({ ticketStatus }) => {
  const classes = useStyles();
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

  const addFiles = (files) => {
    const list = Array.from(files || []).slice(0, 10);
    if (!list.length) return;
    setMedias(list);
    setCaptions(list.map(() => ""));
    setCurrent(0);
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

  const handleChange = (e) => {
    setInputMessage(e.target.value);
    loadQuick(e.target.value);
  };

  const handlePaste = (e) => {
    if (e.clipboardData.files && e.clipboardData.files.length) {
      e.preventDefault();
      addFiles(e.clipboardData.files);
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

  const startRecording = async () => {
    setLoading(true);
    try {
      const recorder = await initRecorder();
      if (!recorder) throw new Error("Recorder not available");
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await recorder.start();
      setRecording(true);
    } catch (err) {
      toastError(err);
    }
    setLoading(false);
  };

  const sendAudio = async () => {
    setLoading(true);
    try {
      const recorder = await initRecorder();
      if (!recorder) throw new Error("Recorder not available");
      const [, blob] = await recorder.stop().getMp3();
      if (blob.size >= 10000) {
        const formData = new FormData();
        const filename = `${new Date().getTime()}.mp3`;
        formData.append("medias", blob, filename);
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
    try {
      const recorder = await initRecorder();
      if (recorder) await recorder.stop().getMp3();
    } catch (err) {
      toastError(err);
    }
    setRecording(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (open) addFiles(e.dataTransfer.files);
  };

  // ---------------------------------------------------------------- media preview
  if (medias.length > 0) {
    const file = medias[current];
    const url = isImage(file) ? URL.createObjectURL(file) : null;
    return (
      <div className={classes.preview}>
        <div className={classes.previewTop}>
          <IconButton className={classes.icon} onClick={clearMedias}>
            <Close />
          </IconButton>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
        </div>
        <div className={classes.previewStage}>
          {url ? (
            <img className={classes.previewImg} src={url} alt={file.name} />
          ) : (
            <div className={classes.previewFile}>
              <InsertDriveFile />
              <span>{file.name}</span>
              <span style={{ fontSize: 12 }}>{(file.size / 1024).toFixed(0)} KB · sem pré-visualização</span>
            </div>
          )}
        </div>
        {medias.length > 1 && (
          <div className={classes.thumbs}>
            {medias.map((m, i) => (
              <div key={i} className={clsx(classes.thumb, i === current && classes.thumbOn)} onClick={() => setCurrent(i)}>
                {isImage(m) ? <img src={URL.createObjectURL(m)} alt="" /> : <InsertDriveFile />}
              </div>
            ))}
          </div>
        )}
        <div className={classes.previewBar}>
          <div className={classes.field}>
            <InputBase
              fullWidth
              autoFocus
              multiline
              maxRows={4}
              className={classes.input}
              placeholder="Adicione uma legenda"
              value={captions[current] || ""}
              onChange={(e) => setCaptions((cs) => cs.map((c2, i) => (i === current ? e.target.value : c2)))}
              onKeyPress={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !loading) {
                  e.preventDefault();
                  handleUploadMedia();
                }
              }}
            />
          </div>
          <IconButton className={classes.send} onClick={handleUploadMedia} disabled={loading}>
            {loading ? <CircularProgress size={20} color="inherit" /> : <Send />}
          </IconButton>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <div className={classes.wrap}>
        <div className={classes.blocked}>
          {ticketStatus === "pending"
            ? "Aceite a conversa para responder."
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
                    perLine={9}
                    showPreview={false}
                    showSkinTones={false}
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
