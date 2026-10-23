import React, { useEffect, useRef, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import { Camera, FileText, Film, Mic, Sticker, Download } from "lucide-react";
import CircularProgress from "@material-ui/core/CircularProgress";

import api from "../../services/api";
import toastError from "../../errors/toastError";

// A message whose file did not come (the download failed, or it was copied from the phone's history without files).
// One click brings it from the phone.
const LABEL_RE = /^[\p{Extended_Pictographic}\s]*(Imagem|Vídeo|Áudio|Mensagem de voz|Documento|Figurinha|Foto)$/u;
const KINDS = ["image", "video", "audio", "document"];

export const needsMedia = (m) =>
  !m.isDeleted && !m.mediaUrl && (KINDS.includes(m.mediaType) || (m.mediaType === "chat" && LABEL_RE.test(m.body || "")));

const guess = (m) => {
  if (m.mediaType !== "chat") return m.mediaType;
  const b = m.body || "";
  if (/Imagem|Foto|Figurinha/.test(b)) return "image";
  if (/Vídeo/.test(b)) return "video";
  if (/Áudio|voz/.test(b)) return "audio";
  return "document";
};

const ICON = { image: Camera, video: Film, audio: Mic, document: FileText };
const NAME = { image: "Imagem", video: "Vídeo", audio: "Áudio", document: "Documento" };

const useStyles = makeStyles(() => ({
  box: {
    display: "flex", alignItems: "center", gap: 10, minWidth: 220, margin: "-2px -3px 4px -4px", padding: "10px 12px",
    borderRadius: 12, background: "rgba(11,20,26,.07)",
  },
  icon: { flex: "none", width: 38, height: 38, borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(11,20,26,.10)" },
  text: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: "18px" },
  hint: { fontSize: 12, opacity: 0.7 },
  btn: {
    flex: "none", display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, border: 0, cursor: "pointer",
    font: "inherit", fontSize: 13, fontWeight: 600, color: "#fff", background: "#00a884", transition: "filter .15s, transform .1s",
    "&:hover": { filter: "brightness(1.08)" }, "&:active": { transform: "scale(.96)" }, "&[disabled]": { opacity: 0.6, cursor: "default" },
  },
}));

// At most two files are asked from the phone at once, so scrolling through a long history never floods it
let running = 0;
const waiting = [];
const pump = () => {
  while (running < 2 && waiting.length) {
    const job = waiting.shift();
    running += 1;
    job().finally(() => {
      running -= 1;
      pump();
    });
  }
};
const enqueue = (job) => new Promise((resolve, reject) => {
  waiting.push(() => job().then(resolve, reject));
  pump();
});

const MediaPlaceholder = ({ message }) => {
  const classes = useStyles();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const box = useRef(null);
  const tried = useRef(false);
  const kind = guess(message);
  const Icon = kind === "image" && /Figurinha/.test(message.body || "") ? Sticker : ICON[kind] || FileText;

  const load = async (manual) => {
    setBusy(true);
    setFailed(false);
    try {
      // the server brings the file from the phone; the screen is updated by the message event
      await enqueue(() => api.post(`/messages/${message.id}/media`));
    } catch (err) {
      setFailed(true);
      if (manual) toastError(err);
    } finally {
      setBusy(false);
    }
  };

  // loads by itself as soon as it is on screen: pictures, voice notes, PDFs and stickers appear without a click
  useEffect(() => {
    if (!box.current) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !tried.current) {
        tried.current = true;
        observer.disconnect();
        load(false);
      }
    }, { rootMargin: "150px" });
    observer.observe(box.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.id]);

  return (
    <div className={classes.box} ref={box}>
      <span className={classes.icon}><Icon size={19} /></span>
      <div className={classes.text}>
        {NAME[kind]}
        <div className={classes.hint}>{busy ? "Buscando no celular…" : failed ? "Não foi possível carregar" : "Carregando…"}</div>
      </div>
      {(failed || busy) && (
        <button type="button" className={classes.btn} onClick={() => load(true)} disabled={busy} title="Baixar o arquivo do celular">
          {busy ? <CircularProgress size={14} color="inherit" /> : <Download size={15} />} {failed ? "Tentar de novo" : "Buscando"}
        </button>
      )}
    </div>
  );
};

export default MediaPlaceholder;
