import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode.react";
import { Download, Share2 } from "lucide-react";
import { toast } from "react-toastify";

import logoEscolha from "../../assets/brand/escolha-ter-estrela.webp";
import { PHRASES, linkWithoutScheme } from "./promoContent";
import aluna from "../../assets/brand/aluna.webp";

// The card of art of the affiliate: the logo, a headline that speaks to the person, the course (or the courses), a student, and a QR
// Code of her link, drawn on a canvas in the size of a story or of a post. It never shows a price or promises anything of the
// institution. Everything happens in the browser: nothing is sent anywhere.
export const SIZES = { story: [1080, 1920], feed: [1080, 1080] };
export const THEMES = {
  azul: { logoGlow: "rgba(255,255,255,.3)", logoWashA: "rgba(125,215,255,.38)", logoWashB: "rgba(255,255,255,0)", label: "Azul", a: "#0b4279", b: "#0693e3", ink: "#ffffff", sub: "rgba(255,255,255,.82)", accent: "#fef84c", marker: "rgba(254,248,76,.9)", chip: "rgba(255,255,255,.16)", chipInk: "#ffffff", glow: "rgba(255,255,255,.3)", ring: "rgba(255,255,255,.1)", dot: "rgba(255,255,255,.12)", halo: "rgba(255,255,255,.16)" },
  noite: { logoGlow: "rgba(6,147,227,.38)", logoWashA: "rgba(125,215,255,.34)", logoWashB: "rgba(255,255,255,0)", label: "Noite", a: "#08111e", b: "#0b4279", ink: "#ffffff", sub: "rgba(255,255,255,.78)", accent: "#fef84c", marker: "rgba(254,248,76,.9)", chip: "rgba(255,255,255,.12)", chipInk: "#ffffff", glow: "rgba(6,147,227,.4)", ring: "rgba(255,255,255,.07)", dot: "rgba(255,255,255,.1)", halo: "rgba(6,147,227,.28)" },
  sol: { logoGlow: "rgba(255,255,255,.55)", logoWashA: "rgba(11,66,121,.22)", logoWashB: "rgba(255,255,255,0)", label: "Sol", a: "#ffd23f", b: "#fef84c", ink: "#0b1a2e", sub: "rgba(11,26,46,.78)", accent: "#0b4279", marker: "rgba(11,66,121,.9)", chip: "rgba(11,26,46,.1)", chipInk: "#0b1a2e", glow: "rgba(255,255,255,.7)", ring: "rgba(11,66,121,.1)", dot: "rgba(11,66,121,.13)", halo: "rgba(255,255,255,.5)", markerInk: "#ffffff" },
  claro: { logoGlow: "rgba(6,147,227,.16)", logoWashA: "rgba(6,147,227,.22)", logoWashB: "rgba(255,255,255,0)", label: "Claro", a: "#ffffff", b: "#d6e8fb", ink: "#0b1a2e", sub: "rgba(11,26,46,.75)", accent: "#0b4279", marker: "rgba(254,248,76,.95)", chip: "rgba(11,66,121,.08)", chipInk: "#0b4279", glow: "rgba(6,147,227,.22)", ring: "rgba(11,66,121,.07)", dot: "rgba(11,66,121,.12)", halo: "rgba(6,147,227,.16)" },
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

// the student of the art: a photo with the background taken out, so she stands on any color of the card
let alunaPromise = null;
export const loadAluna = () => {
  if (!alunaPromise) {
    alunaPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = aluna;
    });
  }
  return alunaPromise;
};

// The logo with a soft light behind it and a wash of gradient over the star, so it melts into the card instead of looking cut out.
const drawLogo = (ctx, logo, x, y, w, t) => {
  const h = (w * logo.naturalHeight) / logo.naturalWidth;
  const glow = ctx.createRadialGradient(x + w * 0.3, y + h * 0.5, 0, x + w * 0.3, y + h * 0.5, w * 0.62);
  glow.addColorStop(0, t.logoGlow);
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - w * 0.4, y - h * 0.6, w * 1.8, h * 2.2);
  const off = document.createElement("canvas");
  off.width = Math.round(w);
  off.height = Math.round(h);
  const o = off.getContext("2d");
  o.drawImage(logo, 0, 0, off.width, off.height);
  o.globalCompositeOperation = "source-atop";
  const wash = o.createLinearGradient(0, 0, off.width * 0.5, off.height);
  wash.addColorStop(0, t.logoWashA);
  wash.addColorStop(1, t.logoWashB);
  o.fillStyle = wash;
  o.fillRect(0, 0, off.width, off.height);
  ctx.drawImage(off, x, y);
  return h;
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

// a pill with a text; returns its width so the next one can follow
const pill = (ctx, x, y, text, { size = 36, bg, ink, weight = 600, padX = 30, padY = 16, icon = "" }) => {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const iw = icon ? size * 0.9 : 0;
  const w = ctx.measureText(text).width + padX * 2 + iw;
  const h = size + padY * 2;
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.textBaseline = "middle";
  if (icon) { ctx.beginPath(); ctx.arc(x + padX + size * 0.25, y + h / 2, size * 0.2, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillText(text, x + padX + iw, y + h / 2 + 1);
  ctx.textBaseline = "alphabetic";
  return { w, h };
};

// a small four-pointed spark
const spark = (ctx, x, y, r, color) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
};

const BENEFITS = ["100% online", "Estude no seu ritmo", "Fale com um consultor"];

export const drawArt = (canvas, { format, theme, phrase, curso, courseTags = [], nome, link, qr, logo, student }) => {
  const [W, H] = SIZES[format] || SIZES.feed;
  const t = THEMES[theme] || THEMES.azul;
  const story = format === "story";
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "alphabetic";

  // ---- the background: a gradient, soft lights, a ring and a field of dots (depth without a photo)
  const bg = ctx.createLinearGradient(0, 0, W * 0.6, H);
  bg.addColorStop(0, t.a);
  bg.addColorStop(1, t.b);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.95, H * 0.04, 0, W * 0.95, H * 0.04, W * 0.8);
  glow.addColorStop(0, t.glow);
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const glow2 = ctx.createRadialGradient(W * 0.05, H * 0.8, 0, W * 0.05, H * 0.8, W * 0.7);
  glow2.addColorStop(0, t.glow);
  glow2.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = t.ring;
  ctx.lineWidth = 46;
  ctx.beginPath();
  ctx.arc(W * 0.04, story ? H * 0.5 : H * 0.6, W * 0.44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = t.dot;
  for (let gx = 0; gx < 8; gx += 1) for (let gy = 0; gy < 6; gy += 1) {
    ctx.beginPath();
    ctx.arc(W - 70 - gx * 36, (story ? 410 : 70) + gy * 36, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const pad = story ? 84 : 76;
  const cardH = story ? 480 : 290;
  const cy = H - pad + 10 - cardH;
  let y = story ? 120 : 64;
  if (logo) {
    const lw = story ? 540 : 280;
    y += drawLogo(ctx, logo, pad, y, lw, t);
  }

  // ---- the headline: the last line gets the marker
  const textW = story ? W - pad * 2 : Math.round(W * 0.56) - pad;
  const size = story ? 104 : 66;
  ctx.font = `800 ${size}px ${FONT}`;
  const lines = wrap(ctx, phrase, textW).slice(0, 4);
  let ty = y + (story ? 80 : 40) + size;
  ctx.save();
  ctx.shadowColor = t.ink === "#ffffff" ? "rgba(3,14,32,.35)" : "rgba(255,255,255,.0)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;
  lines.forEach((ln) => {
    ctx.fillStyle = t.ink;
    ctx.fillText(ln, pad, ty);
    ty += size * 1.06;
  });
  ctx.restore();
  const headBottom = ty - size * 0.5;

  // ---- the student: a photo with the background taken out (behind the card and the texts)
  if (student) {
    const ratio = student.naturalWidth / student.naturalHeight;
    const hMax = story ? 920 : 700;
    const sh = story ? Math.min(hMax, cy + 110 - (headBottom + 6)) : Math.min(hMax, cy + 80 - 90);
    const sw = sh * ratio;
    // her face sits at about 59% of the picture: it goes to the right part of the card
    const sx = (story ? W * 0.66 : W * 0.72) - sw * 0.59;
    const sy = cy + (story ? 110 : 80) - sh;
    const faceX = sx + sw * 0.59;
    const faceY = sy + sh * 0.34;
    const halo = ctx.createRadialGradient(faceX, faceY, 0, faceX, faceY, sw * 0.38);
    halo.addColorStop(0, t.halo);
    halo.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(faceX - sw * 0.4, faceY - sw * 0.4, sw * 0.8, sw * 0.8);
    ctx.save();
    ctx.shadowColor = "rgba(3,14,32,.28)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 10;
    ctx.drawImage(student, sx, sy, sw, sh);
    ctx.restore();
  }

  // ---- the course (or the courses): this is what the person is looking for
  const left = pad;
  let by = headBottom + (story ? 36 : 22);
  const maxLeft = story ? W * 0.5 : textW;
  if (curso) {
    ctx.font = `500 ${story ? 32 : 26}px ${FONT}`;
    ctx.fillStyle = t.sub;
    ctx.fillText("Curso a distância", left + 4, by + (story ? 30 : 24));
    by += story ? 52 : 40;
    ctx.font = `800 ${story ? 62 : 46}px ${FONT}`;
    const lh0 = story ? 70 : 54;
    const room = Math.max(1, Math.floor((cy - 24 - by - 36) / lh0));
    const all = wrap(ctx, curso, Math.min(maxLeft, story ? 560 : textW));
    const lns = all.slice(0, Math.min(3, room));
    if (all.length > lns.length) lns[lns.length - 1] = `${lns[lns.length - 1].replace(/\s+\S*$/, "")}…`;
    const lh = story ? 70 : 54;
    const bw = Math.min(maxLeft, Math.max(...lns.map((l) => ctx.measureText(l).width)) + 64);
    const bh = lns.length * lh + 36;
    ctx.save();
    ctx.shadowColor = "rgba(3,14,32,.28)";
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, left, by, bw, bh, 30);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#0b4279";
    ctx.fillRect(left, by + 26, 10, bh - 52);
    ctx.fillStyle = "#0b1a2e";
    lns.forEach((l, i) => ctx.fillText(l, left + 36, by + 18 + (story ? 56 : 42) + i * lh));
    by += bh + 22;
  } else if (courseTags.length) {
    ctx.font = `500 ${story ? 32 : 26}px ${FONT}`;
    ctx.fillStyle = t.sub;
    ctx.fillText("Graduação a distância em", left + 4, by + (story ? 30 : 24));
    by += story ? 56 : 44;
    courseTags.slice(0, story ? 3 : 2).forEach((c) => {
      const label = c.length > 26 ? `${c.slice(0, 25)}…` : c;
      const size = story ? 38 : 28;
      const padY = story ? 17 : 12;
      // only what fits above the card
      if (by + size + padY * 2 > cy - 24) return;
      const r = pill(ctx, left, by, label, { size, bg: "#ffffff", ink: "#0b4279", weight: 700, padX: story ? 32 : 24, padY });
      by += r.h + (story ? 16 : 10);
    });
  } else {
    BENEFITS.forEach((b) => {
      const size = story ? 36 : 26;
      const padY = story ? 16 : 11;
      if (by + size + padY * 2 > cy - 24) return;
      const r = pill(ctx, left, by, b, { size, bg: t.chip, ink: t.chipInk, weight: 700, padX: story ? 32 : 24, padY, icon: "dot" });
      by += r.h + (story ? 14 : 9);
    });
  }

  // ---- the card with the QR Code: white, so the code reads on any phone
  const cx = pad;
  const cw = W - pad * 2;
  ctx.save();
  ctx.shadowColor = "rgba(3,14,32,.42)";
  ctx.shadowBlur = 54;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, cx, cy, cw, cardH, 44);
  ctx.fill();
  ctx.restore();
  const qs = cardH - (story ? 84 : 56);
  const qx = cx + (story ? 42 : 28);
  const qy = cy + (cardH - qs) / 2;
  if (qr) ctx.drawImage(qr, qx, qy, qs, qs);
  const tx = qx + qs + (story ? 44 : 32);
  const tw = cx + cw - tx - (story ? 40 : 28);
  // the text of the card runs down in order, each line under the one before
  let ky = qy + (story ? 56 : 40);
  ctx.fillStyle = "#0b1a2e";
  ctx.font = `800 ${story ? 52 : 38}px ${FONT}`;
  wrap(ctx, "Fale com a gente", tw).slice(0, 2).forEach((l) => { ctx.fillText(l, tx, ky); ky += story ? 56 : 42; });
  ctx.fillStyle = "#5d6f86";
  ctx.font = `500 ${story ? 29 : 22}px ${FONT}`;
  ky -= story ? 12 : 10;
  wrap(ctx, "Aponte a câmera do celular para o QR Code.", tw).slice(0, 2).forEach((l) => { ctx.fillText(l, tx, ky + (story ? 22 : 16)); ky += story ? 36 : 28; });
  ky += story ? 18 : 8;
  const wp = pill(ctx, tx, ky, "WhatsApp", { size: story ? 28 : 21, bg: "#25D366", ink: "#ffffff", weight: 700, padX: story ? 24 : 18, padY: story ? 11 : 8, icon: "dot" });
  ky += wp.h + (story ? 38 : 26);
  ctx.fillStyle = "#0b4279";
  ctx.font = `600 ${story ? 25 : 19}px ${FONT}`;
  wrap(ctx, linkWithoutScheme(link), tw).slice(0, 1).forEach((l) => ctx.fillText(l, tx, ky));
  const first = String(nome || "").trim();
  if (first) {
    ctx.fillStyle = "#5d6f86";
    ctx.font = `600 ${story ? 26 : 20}px ${FONT}`;
    ctx.fillText(`Indicação de ${first}`, tx, ky + (story ? 36 : 26));
  }
};

// the canvas, redrawn when something changes. The QR Code is drawn by a hidden component and copied into the art.
export const ArtCanvas = ({ format, theme, phrase, curso, courseTags, person = "foto", nome, link, canvasRef, className }) => {
  const own = useRef(null);
  const ref = canvasRef || own;
  const qrBox = useRef(null);
  useEffect(() => {
    let off = false;
    (async () => {
      let logo = null;
      let student = null;
      try {
        const loaded = await Promise.all([loadLogo(), person === "none" ? null : loadAluna(), document.fonts && document.fonts.load ? document.fonts.load(`800 48px Geist`) : null]);
        logo = loaded[0];
        student = loaded[1];
      } catch (e) { /* the art is drawn anyway, with the font of the system */ }
      if (off || !ref.current) return;
      const qr = qrBox.current ? qrBox.current.querySelector("canvas") : null;
      try { drawArt(ref.current, { format, theme, phrase, curso, courseTags, nome, link, qr, logo, student }); } catch (e) { /* a canvas that cannot draw leaves the box empty */ }
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, theme, phrase, curso, (courseTags || []).join("|"), person, nome, link, ref]);
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
  const [person, setPerson] = useState("foto");
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
        <ArtCanvas canvasRef={canvasRef} format={format} theme={theme} phrase={phrase} curso={curso} courseTags={courses.slice(0, 3)} person={person} nome={nome} link={link} className={`ca-art-canvas is-${format}`} />
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
        <div className="ca-field"><span>Foto</span>
          <div className="ca-chips">
            <button type="button" className="ca-chip" aria-pressed={person === "foto"} onClick={() => setPerson("foto")}>Com a aluna</button>
            <button type="button" className="ca-chip" aria-pressed={person === "none"} onClick={() => setPerson("none")}>Sem foto</button>
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
