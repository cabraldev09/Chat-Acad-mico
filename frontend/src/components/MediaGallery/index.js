import { renewMediaElement } from "../../services/media-access";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { makeStyles } from "@material-ui/core/styles";
import { ChevronLeft, ChevronRight, Download, X, ZoomIn, ZoomOut } from "lucide-react";


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
  // the zoom of the photo stays in the photo (a pinch on the trackpad used to enlarge the whole page of the browser)
  photo: { touchAction: "none", userSelect: "none", WebkitUserDrag: "none", transformOrigin: "center center", willChange: "transform" },
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
const MIN = 1;
const MAX = 5;
const clamp = (v) => Math.min(MAX, Math.max(MIN, v));
export const zoomStep = (scale, deltaY) => clamp(scale * Math.exp(-deltaY * 0.01));

const Photo = ({ url, className, zoom, setZoom }) => {
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const move = (dx, dy) => setZoom((z) => (z.s > 1 ? { ...z, x: z.x + dx, y: z.y + dy } : z));
  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: zoom.s };
    }
  };
  const onPointerMove = (e) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, now);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const s = clamp(pinch.current.s * (d / (pinch.current.d || d)));
      setZoom((z) => (s === 1 ? { s: 1, x: 0, y: 0 } : { ...z, s }));
    } else if (pointers.current.size === 1) move(now.x - prev.x, now.y - prev.y);
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  return (
    <img
      onError={renewMediaElement} className={className} src={url} alt="" decoding="async" draggable={false}
      style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`, cursor: zoom.s > 1 ? "grab" : "zoom-in", transition: pinch.current ? "none" : "transform .08s ease-out" }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onDoubleClick={() => setZoom((z) => (z.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 }))}
    />
  );
};

const MediaGallery = () => {
  const classes = useStyles();
  const [state, setState] = useState(null);
  const [zoom, setZoom] = useState({ s: 1, x: 0, y: 0 });
  const zoomNow = useRef(zoom);
  zoomNow.current = zoom;
  const overlay = useRef(null);

  useEffect(() => {
    const open = (e) => setState({ items: e.detail.items || [], index: e.detail.index || 0 });
    window.addEventListener("openGallery", open);
    return () => window.removeEventListener("openGallery", open);
  }, []);

  const close = useCallback(() => setState(null), []);
  // a new photo opens whole
  useEffect(() => { setZoom({ s: 1, x: 0, y: 0 }); }, [state && state.index, state && state.items]);
  // the pinch of the trackpad arrives as a wheel with Ctrl (Safari: gesture events): it zooms the photo, never the page; with the photo
  // enlarged, the plain wheel moves it. Native listeners, because React's wheel cannot cancel the browser's zoom.
  useEffect(() => {
    const el = overlay.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const { deltaY } = e;
        setZoom((z) => { const s = zoomStep(z.s, deltaY); return s === 1 ? { s: 1, x: 0, y: 0 } : { ...z, s }; });
      } else if (zoomNow.current.s > 1) {
        e.preventDefault();
        const { deltaX, deltaY } = e;
        setZoom((z) => ({ ...z, x: z.x - deltaX, y: z.y - deltaY }));
      }
    };
    const stop = (e) => e.preventDefault();
    el.addEventListener("wheel", onWheel, { passive: false });
    ["gesturestart", "gesturechange", "gestureend"].forEach((t) => el.addEventListener(t, stop));
    return () => {
      el.removeEventListener("wheel", onWheel);
      ["gesturestart", "gesturechange", "gestureend"].forEach((t) => el.removeEventListener(t, stop));
    };
  }, [state]);
  const zoomBy = (f) => setZoom((z) => { const s = clamp(z.s * f); return s === 1 ? { s: 1, x: 0, y: 0 } : { ...z, s }; });
  const go = useCallback((d) => setState((s) => (s ? { ...s, index: Math.min(Math.max(s.index + d, 0), s.items.length - 1) } : s)), []);

  useEffect(() => {
    if (!state) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      // Cmd/Ctrl + and - zoom the photo, not the page; 0 shows it whole
      if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=")) { e.preventDefault(); setZoom((z) => ({ ...z, s: clamp(z.s * 1.25) })); }
      if ((e.ctrlKey || e.metaKey) && e.key === "-") { e.preventDefault(); setZoom((z) => { const s = clamp(z.s / 1.25); return s === 1 ? { s: 1, x: 0, y: 0 } : { ...z, s }; }); }
      if ((e.ctrlKey || e.metaKey) && e.key === "0") { e.preventDefault(); setZoom({ s: 1, x: 0, y: 0 }); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state, close, go]);

  if (!state || !state.items.length) return null;
  const item = state.items[state.index];

  return createPortal(
    <div ref={overlay} className={classes.overlay} role="dialog" aria-modal="true" aria-label="Visualizador de mídia" onClick={close}>
      <div className={classes.top} onClick={(e) => e.stopPropagation()}>
        <div className={classes.title}>{item.title || (item.fromMe ? "Você" : "Contato")}{item.date ? ` · ${item.date}` : ""}</div>
        <span className={classes.count}>{state.index + 1} / {state.items.length}</span>
        {item.type !== "video" ? (
          <>
            <button type="button" className={classes.btn} title="Diminuir (Cmd -)" aria-label="Diminuir" disabled={zoom.s <= 1} onClick={() => zoomBy(1 / 1.5)}><ZoomOut size={20} /></button>
            <button type="button" className={classes.btn} title="Ampliar (Cmd +)" aria-label="Ampliar" disabled={zoom.s >= MAX} onClick={() => zoomBy(1.5)}><ZoomIn size={20} /></button>
          </>
        ) : null}
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
            : <Photo key={item.url} url={item.url} className={`${classes.media} ${classes.photo}`} zoom={zoom} setZoom={setZoom} />}
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
