import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { makeStyles } from "@material-ui/core/styles";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";


// Photo and video viewer with arrows (like WhatsApp Web): opened from anywhere with openGallery(items, index)
export const openGallery = (items, index = 0) =>
  window.dispatchEvent(new CustomEvent("openGallery", { detail: { items, index } }));

const useStyles = makeStyles(() => ({
  overlay: {
    position: "fixed", inset: 0, zIndex: 1600, background: "rgba(11,20,26,.94)", display: "flex", flexDirection: "column",
    animation: "galleryIn .18s ease-out",
  },
  top: { flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", color: "#e9edef" },
  title: { flex: 1, minWidth: 0, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  count: { fontSize: 13, opacity: 0.7, marginRight: 8 },
  btn: {
    width: 40, height: 40, borderRadius: "50%", border: 0, background: "transparent", color: "#e9edef", cursor: "pointer",
    display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", transition: "background-color .15s",
    "&:hover": { background: "rgba(255,255,255,.12)" },
  },
  stage: { flex: 1, minHeight: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 64px 16px" },
  media: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 4, animation: "galleryMedia .22s ease-out" },
  nav: {
    position: "absolute", top: "50%", transform: "translateY(-50%)", width: 48, height: 48, borderRadius: "50%", border: 0,
    background: "rgba(255,255,255,.1)", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
    "&:hover": { background: "rgba(255,255,255,.22)" }, "&[disabled]": { opacity: 0.25, cursor: "default" },
  },
  "@global": {
    "@keyframes galleryIn": { from: { opacity: 0 }, to: { opacity: 1 } },
    "@keyframes galleryMedia": { from: { opacity: 0, transform: "scale(.98)" }, to: { opacity: 1, transform: "none" } },
  },
}));

// straight from the server: fast, and the browser keeps what was already seen in the conversation
const Photo = ({ url, className }) => <img className={className} src={url} alt="" decoding="async" />;

const MediaGallery = () => {
  const classes = useStyles();
  const [state, setState] = useState(null);

  useEffect(() => {
    const open = (e) => setState({ items: e.detail.items || [], index: e.detail.index || 0 });
    window.addEventListener("openGallery", open);
    return () => window.removeEventListener("openGallery", open);
  }, []);

  const close = useCallback(() => setState(null), []);
  const go = useCallback((d) => setState((s) => (s ? { ...s, index: Math.min(Math.max(s.index + d, 0), s.items.length - 1) } : s)), []);

  useEffect(() => {
    if (!state) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state, close, go]);

  if (!state || !state.items.length) return null;
  const item = state.items[state.index];

  return createPortal(
    <div className={classes.overlay} role="dialog" aria-modal="true" aria-label="Visualizador de mídia" onClick={close}>
      <div className={classes.top} onClick={(e) => e.stopPropagation()}>
        <div className={classes.title}>{item.title || (item.fromMe ? "Você" : "Contato")}{item.date ? ` · ${item.date}` : ""}</div>
        <span className={classes.count}>{state.index + 1} / {state.items.length}</span>
        <a className={classes.btn} href={item.url} download title="Baixar" onClick={(e) => e.stopPropagation()}><Download size={20} /></a>
        <button type="button" className={classes.btn} title="Fechar (Esc)" onClick={close}><X size={22} /></button>
      </div>
      <div className={classes.stage}>
        <button type="button" className={classes.nav} style={{ left: 12 }} disabled={state.index === 0} title="Anterior (←)" onClick={(e) => { e.stopPropagation(); go(-1); }}>
          <ChevronLeft size={26} />
        </button>
        <div style={{ display: "contents" }} onClick={(e) => e.stopPropagation()}>
          {item.type === "video"
            ? <video key={item.url} className={classes.media} src={item.url} controls autoPlay />
            : <Photo key={item.url} url={item.url} className={classes.media} />}
        </div>
        <button type="button" className={classes.nav} style={{ right: 12 }} disabled={state.index === state.items.length - 1} title="Próxima (→)" onClick={(e) => { e.stopPropagation(); go(1); }}>
          <ChevronRight size={26} />
        </button>
      </div>
    </div>,
    document.body
  );
};

export default MediaGallery;
