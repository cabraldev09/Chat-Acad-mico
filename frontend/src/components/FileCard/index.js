import React, { useEffect, useRef, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import { Download } from "lucide-react";

import api from "../../services/api";

// Card of a file in the conversation, like WhatsApp's: for a PDF, a picture of the first page on top, then the name
// and "2 páginas · 169 KB · pdf". Other files show the same card without the picture.
const useStyles = makeStyles(() => ({
  card: {
    display: "block",
    // fills the bubble (a caption makes it wide); alone it stays a reasonable size, and never wider than the screen
    width: "100%",
    minWidth: 220,
    maxWidth: 520,
    boxSizing: "border-box",
    margin: "-2px -3px 5px -4px",
    borderRadius: 12,
    overflow: "hidden",
    textDecoration: "none",
    color: "inherit",
    background: "rgba(11,20,26,.07)",
    transition: "background-color .15s",
    "&:hover": { background: "rgba(11,20,26,.11)" },
  },
  thumb: {
    position: "relative",
    aspectRatio: "16 / 9",
    overflow: "hidden",
    background: "rgba(255,255,255,.55)",
    borderBottom: "1px solid rgba(11,20,26,.08)",
    "& img": { display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", animation: "fileThumbIn .3s ease-out" },
  },
  shade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 40, background: "linear-gradient(transparent, rgba(0,0,0,.10))", pointerEvents: "none" },
  row: { display: "flex", alignItems: "center", gap: 10, padding: "9px 10px" },
  badge: {
    flex: "none", width: 34, height: 40, borderRadius: 6, display: "grid", placeItems: "center", color: "#fff",
    fontSize: 10.5, fontWeight: 800, letterSpacing: ".03em", boxShadow: "0 1px 2px rgba(0,0,0,.25)",
  },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, lineHeight: "18px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" },
  sub: { marginTop: 2, fontSize: 12, opacity: 0.7 },
  dl: { flex: "none", opacity: 0.75 },
  "@global": { "@keyframes fileThumbIn": { from: { opacity: 0 }, to: { opacity: 1 } } },
}));

const COLORS = { pdf: "#e5453a", doc: "#2b6cde", docx: "#2b6cde", xls: "#1f8f4e", xlsx: "#1f8f4e", ppt: "#d9622b", pptx: "#d9622b", zip: "#8a6d3b", txt: "#6b7a85", csv: "#1f8f4e" };

const sizeOf = (bytes) => (bytes > 1048576 ? `${(bytes / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const cache = new Map();

const FileCard = ({ url, name }) => {
  const classes = useStyles();
  const ext = (String(name || "").split(".").pop() || "").toLowerCase();
  const isPdf = ext === "pdf";
  const box = useRef(null);
  const canvasHost = useRef(null);
  const [info, setInfo] = useState(cache.get(url) || null);

  // the picture is only made when the card comes into view (long conversations have many files)
  useEffect(() => {
    if (!isPdf || !box.current) return undefined;
    let cancelled = false;
    const render = async () => {
      try {
        const [pdfjs, worker, { data }] = await Promise.all([
          import("pdfjs-dist/build/pdf.mjs"),
          import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
          api.get(url, { responseType: "blob" }),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const buffer = await data.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: buffer, isEvalSupported: false }).promise;
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (520 * Math.min(window.devicePixelRatio || 1, 2)) / base.width });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        const meta = { pages: doc.numPages, size: data.size, image: canvas.toDataURL("image/jpeg", 0.8) };
        cache.set(url, meta);
        if (!cancelled) setInfo(meta);
      } catch (e) {
        // the card still works without the picture; the reason stays in the console for whoever investigates
        // eslint-disable-next-line no-console
        console.warn("PDF preview failed:", e);
        if (!cancelled) setInfo({ failed: true });
      }
    };
    if (cache.has(url)) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting)) {
        observer.disconnect();
        render();
      }
    }, { rootMargin: "200px" });
    observer.observe(box.current);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [url, isPdf]);

  const sub = [info && info.pages ? `${info.pages} ${info.pages === 1 ? "página" : "páginas"}` : null, info && info.size ? sizeOf(info.size) : null, ext || "arquivo"].filter(Boolean).join(" · ");

  return (
    <a ref={box} className={classes.card} href={url} target="_blank" rel="noopener noreferrer" download={name}>
      {isPdf && info && info.image && (
        <div className={classes.thumb} ref={canvasHost}>
          <img src={info.image} alt="" />
          <span className={classes.shade} />
        </div>
      )}
      <div className={classes.row}>
        <span className={classes.badge} style={{ background: COLORS[ext] || "#6b7a85" }}>{(ext || "ARQ").slice(0, 4).toUpperCase()}</span>
        <div className={classes.info}>
          <div className={classes.name}>{name}</div>
          <div className={classes.sub}>{sub}</div>
        </div>
        <Download size={18} className={classes.dl} />
      </div>
    </a>
  );
};

export default FileCard;
