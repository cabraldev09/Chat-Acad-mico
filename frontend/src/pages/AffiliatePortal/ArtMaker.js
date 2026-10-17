import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode.react";
import { Download, Share2 } from "lucide-react";
import { toast } from "react-toastify";

import logoEscolha from "../../assets/brand/escolha-ter-estrela.webp";
import { PHRASES, linkWithoutScheme } from "./promoContent";

// The card of art of the affiliate: the logo, a phrase, the course (optional) and a QR Code of her link, drawn on a canvas
// in the size of a story or of a post. It never shows a price. Everything happens in the browser: nothing is sent anywhere.
export const SIZES = { story: [1080, 1920], feed: [1080, 1080] };
export const THEMES = {
  azul: { label: "Azul", a: "#0b4279", b: "#0693e3", ink: "#ffffff", accent: "#fef84c" },
  noite: { label: "Noite", a: "#08111e", b: "#0b4279", ink: "#ffffff", accent: "#fef84c" },
};
const FONT = 'Geist, system-ui, -apple-system, "Segoe UI", sans-serif';

let logoPromise = null;
export const loadLogo = () => {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = logoEscolha;
    });
  }
  return logoPromise;
};

// breaks a text into lines that fit `maxW`; a word longer than the line (an address) is broken by characters
const wrap = (ctx, text, maxW) => {
  const lines = [];
  let line = "";
  const push = () => { if (line) lines.push(line); line = ""; };
  String(text).split(/\s+/).filter(Boolean).forEach((word) => {
    if (ctx.measureText(word).width > maxW) {
      push();
      let part = "";
      for (const ch of word) {
        if (ctx.measureText(part + ch).width > maxW) { lines.push(part); part = ch; } else part += ch;
      }
      line = part;
      return;
    }
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; } else line = test;
  });
  push();
  return lines;
};

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

export const drawArt = (canvas, { format, theme, phrase, curso, nome, link, qr, logo }) => {
  const [W, H] = SIZES[format] || SIZES.feed;
  const t = THEMES[theme] || THEMES.azul;
  const story = format === "story";
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, W * 0.55, H);
  bg.addColorStop(0, t.a);
  bg.addColorStop(1, t.b);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // a soft light in the corner and a ring behind the phrase: depth without drawing anything that looks like a photo
  const glow = ctx.createRadialGradient(W * 0.92, H * 0.06, 0, W * 0.92, H * 0.06, W * 0.7);
  glow.addColorStop(0, "rgba(255,255,255,.28)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,.09)";
  ctx.lineWidth = 44;
  ctx.beginPath();
  ctx.arc(W * 0.08, story ? H * 0.52 : H * 0.62, W * 0.42, 0, Math.PI * 2);
  ctx.stroke();

  const pad = 84;
  let y = story ? 150 : 76;
  if (logo) {
    const lw = story ? 580 : 380;
    const lh = (lw * logo.naturalHeight) / logo.naturalWidth;
    ctx.drawImage(logo, pad, y, lw, lh);
    y += lh;
  }

  // the phrase: the last line gets the marker, as in the headline of the portal
  const size = story ? 108 : 80;
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textBaseline = "alphabetic";
  const lines = wrap(ctx, phrase, W - pad * 2);
  let ty = (story ? y + 150 : y + 70) + size;
  lines.forEach((ln, i) => {
    if (i === lines.length - 1) {
      ctx.fillStyle = "rgba(254,248,76,.85)";
      ctx.fillRect(pad, ty - size * 0.2, ctx.measureText(ln).width, size * 0.22);
    }
    ctx.fillStyle = t.ink;
    ctx.fillText(ln, pad, ty);
    ty += size * 1.08;
  });

  if (curso) {
    ctx.font = `600 ${story ? 48 : 38}px ${FONT}`;
    const lns = wrap(ctx, curso, W - pad * 2 - 64).slice(0, 2);
    const ph = lns.length * (story ? 58 : 46) + 34;
    const pw = Math.min(W - pad * 2, Math.max(...lns.map((l) => ctx.measureText(l).width)) + 64);
    const py = ty + 16;
    ctx.fillStyle = "rgba(255,255,255,.16)";
    roundRect(ctx, pad, py, pw, ph, 28);
    ctx.fill();
    ctx.fillStyle = t.accent;
    lns.forEach((l, i) => ctx.fillText(l, pad + 32, py + 17 + (story ? 48 : 38) + i * (story ? 58 : 46)));
  }

  // the card with the QR Code: white, so the code reads on any phone
  const cardH = story ? 700 : 300;
  const cx = pad;
  const cy = H - pad - cardH;
  const cw = W - pad * 2;
  ctx.save();
  ctx.shadowColor = "rgba(3,14,32,.45)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, cx, cy, cw, cardH, 40);
  ctx.fill();
  ctx.restore();

  const first = String(nome || "").trim();
  ctx.fillStyle = "#0b1a2e";
  if (story) {
    const qs = 400;
    if (qr) ctx.drawImage(qr, cx + (cw - qs) / 2, cy + 36, qs, qs);
    ctx.textAlign = "center";
    ctx.font = `700 48px ${FONT}`;
    const head = wrap(ctx, "Aponte a câmera e fale com a gente", cw - 120).slice(0, 2);
    head.forEach((l, i) => ctx.fillText(l, cx + cw / 2, cy + 36 + qs + 64 + i * 56));
    ctx.fillStyle = "#5d6f86";
    ctx.font = `500 34px ${FONT}`;
    const lk = wrap(ctx, linkWithoutScheme(link), cw - 80);
    lk.slice(0, 2).forEach((l, i) => ctx.fillText(l, cx + cw / 2, cy + 36 + qs + 64 + head.length * 56 + 6 + i * 42));
    if (first) {
      ctx.fillStyle = "#0b4279";
      ctx.font = `600 34px ${FONT}`;
      ctx.fillText(`Indicação de ${first}`, cx + cw / 2, cy + cardH - 34);
    }
    ctx.textAlign = "left";
  } else {
    const qs = cardH - 56;
    if (qr) ctx.drawImage(qr, cx + 28, cy + 28, qs, qs);
    const tx = cx + 28 + qs + 36;
    const tw = cw - (tx - cx) - 32;
    ctx.font = `700 44px ${FONT}`;
    const head = wrap(ctx, "Aponte a câmera e fale com a gente", tw).slice(0, 3);
    head.forEach((l, i) => ctx.fillText(l, tx, cy + 78 + i * 52));
    ctx.fillStyle = "#5d6f86";
    ctx.font = `500 28px ${FONT}`;
    const lk = wrap(ctx, linkWithoutScheme(link), tw).slice(0, 2);
    lk.forEach((l, i) => ctx.fillText(l, tx, cy + 78 + head.length * 52 + 8 + i * 36));
    if (first) {
      ctx.fillStyle = "#0b4279";
      ctx.font = `600 28px ${FONT}`;
      ctx.fillText(`Indicação de ${first}`, tx, cy + cardH - 34);
    }
  }
};

// the canvas, redrawn when something changes. The QR Code is drawn by a hidden component and copied into the art.
export const ArtCanvas = ({ format, theme, phrase, curso, nome, link, canvasRef, className }) => {
  const own = useRef(null);
  const ref = canvasRef || own;
  const qrBox = useRef(null);
  useEffect(() => {
    let off = false;
    (async () => {
      let logo = null;
      try {
        const loaded = await Promise.all([loadLogo(), document.fonts && document.fonts.load ? document.fonts.load(`700 48px Geist`) : null]);
        logo = loaded[0];
      } catch (e) { /* the art is drawn anyway, with the font of the system */ }
      if (off || !ref.current) return;
      const qr = qrBox.current ? qrBox.current.querySelector("canvas") : null;
      try { drawArt(ref.current, { format, theme, phrase, curso, nome, link, qr, logo }); } catch (e) { /* a canvas that cannot draw leaves the box empty */ }
    })();
    return () => { off = true; };
  }, [format, theme, phrase, curso, nome, link, ref]);
  return (
    <>
      <canvas ref={ref} className={className} role="img" aria-label={`Cartão de divulgação: ${phrase}`} />
      <div ref={qrBox} style={{ position: "absolute", left: -9999, top: 0, pointerEvents: "none" }} aria-hidden="true">
        <QRCode value={link || "https://"} size={480} level="M" includeMargin fgColor="#0b1a2e" bgColor="#ffffff" />
      </div>
    </>
  );
};

export const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
export const fileName = (format) => `cartao-${format === "story" ? "story" : "feed"}.png`;

// the panel: format, theme, phrase and course, with a preview, to download or to share
const ArtMaker = ({ nome, link, courses, initialPhrase, initialCourse }) => {
  const [format, setFormat] = useState("story");
  const [theme, setTheme] = useState("azul");
  const [phrase, setPhrase] = useState(initialPhrase || PHRASES[0]);
  const [curso, setCurso] = useState(initialCourse || "");
  const canvasRef = useRef(null);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const download = async () => {
    const blob = canvasRef.current && (await toBlob(canvasRef.current));
    if (!blob) { toast.error("Não foi possível criar a imagem. Tente de novo."); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName(format);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  const share = async () => {
    const blob = canvasRef.current && (await toBlob(canvasRef.current));
    if (!blob) return;
    const file = new File([blob], fileName(format), { type: "image/png" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: `${phrase} ${link}` });
      else await navigator.share({ text: `${phrase} ${link}`, url: link });
    } catch (e) { /* closed by the person: nothing to do */ }
  };

  return (
    <div className="ca-art-maker">
      <div className="ca-art-preview">
        <ArtCanvas canvasRef={canvasRef} format={format} theme={theme} phrase={phrase} curso={curso} nome={nome} link={link} className={`ca-art-canvas is-${format}`} />
      </div>
      <div className="ca-art-controls">
        <div className="ca-field"><span>Formato</span>
          <div className="ca-chips">
            <button type="button" className="ca-chip" aria-pressed={format === "story"} onClick={() => setFormat("story")}>Story (1080×1920)</button>
            <button type="button" className="ca-chip" aria-pressed={format === "feed"} onClick={() => setFormat("feed")}>Feed (1080×1080)</button>
          </div>
        </div>
        <div className="ca-field"><span>Cor</span>
          <div className="ca-chips">
            {Object.entries(THEMES).map(([k, v]) => <button key={k} type="button" className="ca-chip" aria-pressed={theme === k} onClick={() => setTheme(k)}>{v.label}</button>)}
          </div>
        </div>
        <div className="ca-field"><span>Frase</span>
          <div className="ca-phrases">
            {PHRASES.map((p) => <button key={p} type="button" className="ca-chip" aria-pressed={phrase === p} onClick={() => setPhrase(p)}>{p}</button>)}
          </div>
        </div>
        {courses.length > 0 && (
          <label className="ca-field"><span>Curso na arte (opcional)</span>
            <select value={curso} onChange={(e) => setCurso(e.target.value)}>
              <option value="">Sem curso</option>
              {courses.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
        <div className="ca-link-actions">
          <button type="button" className="ca-btn is-primary" onClick={download}><Download size={16} /> Baixar imagem</button>
          {canShare && <button type="button" className="ca-btn" onClick={share}><Share2 size={16} /> Compartilhar</button>}
        </div>
        <p className="ca-help">O QR Code leva direto para o seu link de indicação. Poste no story ou no feed, ou mande a imagem em conversas e grupos.</p>
      </div>
    </div>
  );
};

export default ArtMaker;
