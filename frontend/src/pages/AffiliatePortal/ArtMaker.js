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
  azul: { shade: "rgba(8,33,63,.55)", shade2: "rgba(8,33,63,.92)", dawnA: "rgba(255,150,110,.26)", dawnB: "rgba(255,214,150,.5)", logoGlow: "rgba(255,255,255,.3)", logoWashA: "rgba(125,215,255,.38)", logoWashB: "rgba(255,255,255,0)", label: "Azul", a: "#0b4279", b: "#0693e3", ink: "#ffffff", sub: "rgba(255,255,255,.82)", accent: "#fef84c", marker: "rgba(254,248,76,.9)", chip: "rgba(255,255,255,.16)", chipInk: "#ffffff", glow: "rgba(255,255,255,.3)", ring: "rgba(255,255,255,.1)", dot: "rgba(255,255,255,.12)", halo: "rgba(255,255,255,.16)" },
  noite: { shade: "rgba(4,10,20,.6)", shade2: "rgba(4,10,20,.94)", dawnA: "rgba(255,110,120,.2)", dawnB: "rgba(255,180,110,.42)", logoGlow: "rgba(6,147,227,.38)", logoWashA: "rgba(125,215,255,.34)", logoWashB: "rgba(255,255,255,0)", label: "Noite", a: "#08111e", b: "#0b4279", ink: "#ffffff", sub: "rgba(255,255,255,.78)", accent: "#fef84c", marker: "rgba(254,248,76,.9)", chip: "rgba(255,255,255,.12)", chipInk: "#ffffff", glow: "rgba(6,147,227,.4)", ring: "rgba(255,255,255,.07)", dot: "rgba(255,255,255,.1)", halo: "rgba(6,147,227,.28)" },
  sol: { shade: "rgba(11,66,121,.5)", shade2: "rgba(11,66,121,.9)", dawnA: "rgba(255,120,70,.2)", dawnB: "rgba(255,255,255,.6)", logoGlow: "rgba(255,255,255,.55)", logoWashA: "rgba(11,66,121,.22)", logoWashB: "rgba(255,255,255,0)", label: "Sol", a: "#ffd23f", b: "#fef84c", ink: "#0b1a2e", sub: "rgba(11,26,46,.78)", accent: "#0b4279", marker: "rgba(11,66,121,.9)", chip: "rgba(11,26,46,.1)", chipInk: "#0b1a2e", glow: "rgba(255,255,255,.7)", ring: "rgba(11,66,121,.1)", dot: "rgba(11,66,121,.13)", halo: "rgba(255,255,255,.5)", markerInk: "#ffffff" },
  claro: { shade: "rgba(11,66,121,.42)", shade2: "rgba(11,66,121,.9)", dawnA: "rgba(255,170,120,.22)", dawnB: "rgba(255,226,172,.6)", logoGlow: "rgba(6,147,227,.16)", logoWashA: "rgba(6,147,227,.22)", logoWashB: "rgba(255,255,255,0)", label: "Claro", a: "#ffffff", b: "#d6e8fb", ink: "#0b1a2e", sub: "rgba(11,26,46,.75)", accent: "#0b4279", marker: "rgba(254,248,76,.95)", chip: "rgba(11,66,121,.08)", chipInk: "#0b4279", glow: "rgba(6,147,227,.22)", ring: "rgba(11,66,121,.07)", dot: "rgba(11,66,121,.12)", halo: "rgba(6,147,227,.16)" },
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

// the font size at which the longest word fits in `maxW`: a word is never cut in two ("Administraç / ão")
const fitWords = (ctx, text, weight, maxW, size, min = 20) => {
  let sz = size;
  const widest = () => { ctx.font = `${weight} ${sz}px ${FONT}`; return Math.max(0, ...String(text).split(/\s+/).map((w) => ctx.measureText(w).width)); };
  while (widest() > maxW && sz > min) sz -= 1;
  return sz;
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

// the models of the art: where the photo, the headline and the QR Code go
export const LAYOUTS = { classico: "Clássico", destaque: "Foto grande", curso: "Foco no curso", centro: "Centralizado" };
export const LAYOUT_KEYS = Object.keys(LAYOUTS);

// a text on one line: the size goes down until it fits (no line break in a title that must stay whole)
const fitOne = (ctx, text, weight, maxW, size, min = 18) => {
  let sz = size;
  ctx.font = `${weight} ${sz}px ${FONT}`;
  while (ctx.measureText(text).width > maxW && sz > min) { sz -= 1; ctx.font = `${weight} ${sz}px ${FONT}`; }
  return sz;
};

// the photo of the student with its edges melted: the bottom fades out (so nothing cuts her off) and so do the sides of the ribbon
const meltedPhoto = (img, w, h, { bottom = 0.58, left = 0.16, right = 0.12 } = {}) => {
  const c = document.createElement("canvas");
  c.width = Math.round(w);
  c.height = Math.round(h);
  const o = c.getContext("2d");
  o.drawImage(img, 0, 0, c.width, c.height);
  o.globalCompositeOperation = "destination-in";
  const v = o.createLinearGradient(0, 0, 0, c.height);
  v.addColorStop(0, "rgba(0,0,0,1)");
  v.addColorStop(bottom, "rgba(0,0,0,1)");
  v.addColorStop(1, "rgba(0,0,0,0)");
  o.fillStyle = v;
  o.fillRect(0, 0, c.width, c.height);
  const hz = o.createLinearGradient(0, 0, c.width, 0);
  hz.addColorStop(0, "rgba(0,0,0,0)");
  hz.addColorStop(left, "rgba(0,0,0,1)");
  hz.addColorStop(1 - right, "rgba(0,0,0,1)");
  hz.addColorStop(1, "rgba(0,0,0,0)");
  o.fillStyle = hz;
  o.fillRect(0, 0, c.width, c.height);
  return c;
};

// photo centered by her face (about 59% of the picture) and resting on `bottom`
const putPhoto = (ctx, img, { faceX, bottom, h, fade }) => {
  const w = h * (img.naturalWidth / img.naturalHeight);
  const x = faceX - w * 0.59;
  const y = bottom - h;
  ctx.drawImage(meltedPhoto(img, w, h, fade), x, y);
  return { x, y, w, h, faceY: y + h * 0.34 };
};

// the light of the dawn: warm at the bottom edge, rising and dissolving, with a glow behind the photo
const dawn = (ctx, W, H, t, glowX) => {
  const g = ctx.createLinearGradient(0, H * 0.42, 0, H);
  g.addColorStop(0, "rgba(255,170,100,0)");
  g.addColorStop(0.55, t.dawnA);
  g.addColorStop(1, t.dawnB);
  ctx.fillStyle = g;
  ctx.fillRect(0, H * 0.42, W, H * 0.58);
  const r = ctx.createRadialGradient(glowX, H * 0.92, 0, glowX, H * 0.92, W * 0.75);
  r.addColorStop(0, t.dawnB);
  r.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = r;
  ctx.fillRect(0, H * 0.3, W, H * 0.7);
  ctx.globalAlpha = 1;
};

const background = (ctx, W, H, t, glowX) => {
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
  dawn(ctx, W, H, t, glowX);
};

// the headline, in lines that fit; returns where it ends
const headline = (ctx, t, phrase, x, y, maxW, size0, { align = "left", maxLines = 4 } = {}) => {
  const size = fitWords(ctx, phrase, 800, maxW, size0);
  ctx.font = `800 ${size}px ${FONT}`;
  const lines = wrap(ctx, phrase, maxW).slice(0, maxLines);
  ctx.save();
  ctx.textAlign = align;
  ctx.shadowColor = t.ink === "#ffffff" ? "rgba(3,14,32,.38)" : "rgba(255,255,255,0)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = t.ink;
  let ty = y + size;
  lines.forEach((ln) => { ctx.fillText(ln, x, ty); ty += size * 1.06; });
  ctx.restore();
  return ty - size * 0.5;
};

// the course, or the courses, or the benefits: what the person is looking for. `limit` is the lowest point allowed.
const offer = (ctx, t, { x, y, maxW, limit, story, curso, courseTags }) => {
  let by = y;
  if (curso) {
    ctx.font = `500 ${story ? 32 : 26}px ${FONT}`;
    ctx.fillStyle = t.sub;
    ctx.fillText("Curso a distância", x + 4, by + (story ? 30 : 24));
    by += story ? 52 : 40;
    const fs0 = fitWords(ctx, curso, 800, maxW - 64, story ? 62 : 46);
    ctx.font = `800 ${fs0}px ${FONT}`;
    const lh0 = Math.round(fs0 * 1.13);
    const room = Math.max(1, Math.floor((limit - by - 36) / lh0));
    const all = wrap(ctx, curso, maxW - 64);
    const lns = all.slice(0, Math.min(3, room));
    if (all.length > lns.length) lns[lns.length - 1] = `${lns[lns.length - 1].replace(/\s+\S*$/, "")}…`;
    const bw = Math.min(maxW, Math.max(...lns.map((l) => ctx.measureText(l).width)) + 64);
    const bh = lns.length * lh0 + 36;
    ctx.save();
    ctx.shadowColor = "rgba(3,14,32,.28)";
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, x, by, bw, bh, 30);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#0b4279";
    ctx.fillRect(x, by + 26, 10, bh - 52);
    ctx.fillStyle = "#0b1a2e";
    lns.forEach((l, i) => ctx.fillText(l, x + 36, by + 18 + Math.round(fs0 * 0.9) + i * lh0));
    return by + bh + 22;
  }
  if (courseTags.length) {
    ctx.font = `500 ${story ? 32 : 26}px ${FONT}`;
    ctx.fillStyle = t.sub;
    ctx.fillText("Graduação a distância em", x + 4, by + (story ? 30 : 24));
    by += story ? 56 : 44;
    courseTags.slice(0, story ? 3 : 2).forEach((c) => {
      const label = c.length > 26 ? `${c.slice(0, 25)}…` : c;
      const size = story ? 38 : 28;
      const padY = story ? 17 : 12;
      if (by + size + padY * 2 > limit) return;
      const r = pill(ctx, x, by, label, { size, bg: "#ffffff", ink: "#0b4279", weight: 700, padX: story ? 32 : 24, padY });
      by += r.h + (story ? 16 : 10);
    });
    return by;
  }
  BENEFITS.forEach((b) => {
    const size = story ? 36 : 26;
    const padY = story ? 16 : 11;
    if (by + size + padY * 2 > limit) return;
    const r = pill(ctx, x, by, b, { size, bg: t.chip, ink: t.chipInk, weight: 700, padX: story ? 32 : 24, padY, icon: "dot" });
    by += r.h + (story ? 14 : 9);
  });
  return by;
};

// the white card with the QR Code. "wide": the code on the left and the text on the right (the title always on one line).
// "tall": the code on top and the text under it.
const qrCard = (ctx, { x, y, w, h, qr, link, nome, story, mode = "wide" }) => {
  ctx.save();
  ctx.shadowColor = "rgba(3,14,32,.4)";
  ctx.shadowBlur = 54;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x, y, w, h, 44);
  ctx.fill();
  ctx.restore();
  const first = String(nome || "").trim();
  if (mode === "tall") {
    const qs = w - 64;
    if (qr) ctx.drawImage(qr, x + 32, y + 28, qs, qs);
    ctx.textAlign = "center";
    const mid = x + w / 2;
    ctx.fillStyle = "#0b1a2e";
    fitOne(ctx, "Fale com a gente", 800, w - 48, story ? 46 : 34);
    let ky = y + 28 + qs + (story ? 62 : 46);
    ctx.fillText("Fale com a gente", mid, ky);
    ctx.fillStyle = "#5d6f86";
    fitOne(ctx, "Aponte a câmera do celular", 500, w - 48, story ? 27 : 20);
    ctx.fillText("Aponte a câmera do celular", mid, ky + (story ? 38 : 28));
    if (first) {
      ctx.fillStyle = "#0b4279";
      fitOne(ctx, `Indicação de ${first}`, 700, w - 48, story ? 26 : 20);
      ctx.fillText(`Indicação de ${first}`, mid, ky + (story ? 80 : 58));
    }
    ctx.textAlign = "left";
    return;
  }
  const qs = h - (story ? 84 : 56);
  const qx = x + (story ? 42 : 28);
  const qy = y + (h - qs) / 2;
  if (qr) ctx.drawImage(qr, qx, qy, qs, qs);
  const tx = qx + qs + (story ? 40 : 30);
  const tw = x + w - tx - (story ? 36 : 26);
  let ky = qy + (story ? 56 : 40);
  ctx.fillStyle = "#0b1a2e";
  fitOne(ctx, "Fale com a gente", 800, tw, story ? 54 : 38);
  ctx.fillText("Fale com a gente", tx, ky);
  ctx.fillStyle = "#5d6f86";
  ky += story ? 40 : 30;
  const subSize = fitOne(ctx, "Aponte a câmera do celular para o QR Code.", 500, tw, story ? 29 : 22, 20);
  const sub = "Aponte a câmera do celular para o QR Code.";
  if (ctx.measureText(sub).width <= tw) { ctx.fillText(sub, tx, ky); ky += story ? 14 : 8; }
  else { ctx.font = `500 ${subSize}px ${FONT}`; wrap(ctx, sub, tw).slice(0, 2).forEach((l) => { ctx.fillText(l, tx, ky); ky += subSize + 6; }); ky -= 10; }
  ky += story ? 22 : 14;
  const wp = pill(ctx, tx, ky, "WhatsApp", { size: story ? 28 : 21, bg: "#25D366", ink: "#ffffff", weight: 700, padX: story ? 24 : 18, padY: story ? 11 : 8, icon: "dot" });
  ky += wp.h + (story ? 38 : 26);
  ctx.fillStyle = "#0b4279";
  fitOne(ctx, linkWithoutScheme(link), 600, tw, story ? 25 : 19, 14);
  ctx.fillText(linkWithoutScheme(link), tx, ky);
  if (first) {
    ctx.fillStyle = "#5d6f86";
    fitOne(ctx, `Indicação de ${first}`, 600, tw, story ? 26 : 20, 14);
    ctx.fillText(`Indicação de ${first}`, tx, ky + (story ? 36 : 26));
  }
};

export const drawArt = (canvas, { format, theme, phrase, curso, courseTags = [], nome, link, qr, logo, student, layout = "classico" }) => {
  const [W, H] = SIZES[format] || SIZES.feed;
  const t = THEMES[theme] || THEMES.azul;
  const story = format === "story";
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "alphabetic";
  const pad = story ? 84 : 76;
  const wideH = story ? 460 : 286;
  const wideY = H - pad + 10 - wideH;
  const L = LAYOUTS[layout] ? layout : "classico";

  if (L === "classico") {
    background(ctx, W, H, t, W * 0.7);
    let y = story ? 120 : 64;
    if (logo) y += drawLogo(ctx, logo, pad, y, story ? 540 : 280, t);
    const size = story ? 104 : 66;
    const head = headline(ctx, t, phrase, pad, y + (story ? 80 : 40), story ? W - pad * 2 : Math.round(W * 0.56) - pad, size);
    if (student) {
      const sh = story ? Math.min(940, wideY + 70 - (head + 6)) : Math.min(720, wideY + 60 - 90);
      putPhoto(ctx, student, { faceX: story ? W * 0.66 : W * 0.72, bottom: wideY + (story ? 70 : 60), h: sh, fade: { bottom: 0.62 } });
    }
    offer(ctx, t, { x: pad, y: head + (story ? 36 : 22), maxW: story ? W * 0.5 : Math.round(W * 0.56) - pad, limit: wideY - 24, story, curso, courseTags });
    qrCard(ctx, { x: pad, y: wideY, w: W - pad * 2, h: wideH, qr, link, nome, story });
    return;
  }

  if (L === "destaque") {
    background(ctx, W, H, t, W * 0.5);
    if (student) {
      const ph = story ? 1180 : 860;
      putPhoto(ctx, student, { faceX: W * 0.5, bottom: (story ? 150 : 30) + ph, h: ph, fade: { bottom: 0.72, left: 0.1, right: 0.1 } });
    }
    // a shade of the color of the card rises from the bottom, so the words rest on it
    const shade = ctx.createLinearGradient(0, H * (story ? 0.42 : 0.36), 0, H);
    shade.addColorStop(0, "rgba(255,255,255,0)");
    shade.addColorStop(0.55, `${t.shade}`);
    shade.addColorStop(1, t.shade2);
    ctx.fillStyle = shade;
    ctx.fillRect(0, H * 0.3, W, H * 0.7);
    if (logo) drawLogo(ctx, logo, pad, story ? 110 : 56, story ? 520 : 260, t);
    const size = story ? 96 : 62;
    const cardH = story ? 400 : 250;
    const cardY = H - pad + 10 - cardH;
    ctx.font = `800 ${size}px ${FONT}`;
    const lines = wrap(ctx, phrase, W - pad * 2).slice(0, 3);
    const tyTop = cardY - 34 - lines.length * size * 1.06 - (curso || courseTags.length ? 0 : 0);
    headline(ctx, t, phrase, pad, tyTop, W - pad * 2, size, { maxLines: 3 });
    qrCard(ctx, { x: pad, y: cardY, w: W - pad * 2, h: cardH, qr, link, nome, story });
    if (curso) {
      const r = pill(ctx, pad, tyTop - (story ? 92 : 70), curso.length > 30 ? `${curso.slice(0, 29)}…` : curso, { size: story ? 38 : 28, bg: "#ffffff", ink: "#0b4279", weight: 800, padX: 30, padY: story ? 16 : 12 });
      return r;
    }
    return;
  }

  if (L === "curso") {
    background(ctx, W, H, t, W * 0.3);
    if (student) {
      const ph = story ? 1000 : 760;
      putPhoto(ctx, student, { faceX: story ? W * 0.78 : W * 0.8, bottom: H - (story ? 120 : 40), h: ph, fade: { bottom: 0.7, left: 0.2, right: 0.06 } });
    }
    let y = story ? 110 : 60;
    if (logo) y += drawLogo(ctx, logo, pad, y, story ? 500 : 250, t);
    ctx.font = `600 ${story ? 36 : 28}px ${FONT}`;
    ctx.fillStyle = t.sub;
    ctx.fillText(curso ? "Graduação a distância" : "Seu próximo passo", pad + 4, y + (story ? 100 : 62));
    const big = curso || courseTags[0] || phrase;
    // the size goes down until the longest word fits: a name is never broken in the middle
    const colW = story ? W * 0.62 : W * 0.5;
    let size = story ? 112 : 74;
    const longest = (sz) => { ctx.font = `800 ${sz}px ${FONT}`; return Math.max(...String(big).split(/\s+/).map((w) => ctx.measureText(w).width)); };
    while (longest(size) > colW && size > 36) size -= 4;
    const bottom = headline(ctx, t, big, pad, y + (story ? 126 : 76), colW, size, { maxLines: 4 });
    ctx.font = `500 ${story ? 36 : 28}px ${FONT}`;
    ctx.fillStyle = t.sub;
    wrap(ctx, curso ? "EAD e semipresencial, com tutoria depois da matrícula." : phrase, story ? W * 0.58 : W * 0.46).slice(0, 3).forEach((l, i) => ctx.fillText(l, pad + 4, bottom + (story ? 44 : 34) + i * (story ? 46 : 36)));
    const cw = story ? 420 : 300;
    const ch = story ? 590 : 400;
    qrCard(ctx, { x: pad, y: H - pad + 10 - ch, w: cw, h: ch, qr, link, nome, story, mode: "tall" });
    return;
  }

  // "centro": everything centered, the photo in the middle and the QR Code under her
  background(ctx, W, H, t, W * 0.5);
  if (logo) {
    const lw = story ? 520 : 270;
    const lh = (lw * logo.naturalHeight) / logo.naturalWidth;
    drawLogo(ctx, logo, (W - lw) / 2, story ? 100 : 50, lw, t);
    const size = story ? 94 : 60;
    const head = headline(ctx, t, phrase, W / 2, (story ? 100 : 50) + lh + (story ? 40 : 14), W - pad * 2, size, { align: "center", maxLines: 3 });
    if (student) {
      const ph = story ? 880 : 520;
      putPhoto(ctx, student, { faceX: W * 0.5, bottom: wideY + (story ? 60 : 30), h: Math.min(ph, wideY + (story ? 60 : 30) - head + 10), fade: { bottom: 0.66, left: 0.16, right: 0.16 } });
    }
    if (curso || courseTags.length) {
      const label = curso || courseTags.slice(0, 2).join(" · ");
      ctx.font = `700 ${story ? 38 : 28}px ${FONT}`;
      const tw = Math.min(W - pad * 2, ctx.measureText(label.length > 40 ? `${label.slice(0, 39)}…` : label).width + 60);
      pill(ctx, (W - tw) / 2, head + (story ? 6 : 4), label.length > 40 ? `${label.slice(0, 39)}…` : label, { size: story ? 38 : 28, bg: "#ffffff", ink: "#0b4279", weight: 800, padX: 30, padY: story ? 16 : 12 });
    }
  }
  qrCard(ctx, { x: pad, y: wideY, w: W - pad * 2, h: wideH, qr, link, nome, story });
};

// the canvas, redrawn when something changes. The QR Code is drawn by a hidden component and copied into the art.
export const ArtCanvas = ({ format, theme, phrase, curso, courseTags, person = "foto", layout = "classico", nome, link, canvasRef, className }) => {
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
      try { drawArt(ref.current, { format, theme, phrase, curso, courseTags, nome, link, qr, logo, student, layout }); } catch (e) { /* a canvas that cannot draw leaves the box empty */ }
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, theme, phrase, curso, (courseTags || []).join("|"), person, layout, nome, link, ref]);
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
  const [layout, setLayout] = useState("classico");
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
        <ArtCanvas canvasRef={canvasRef} format={format} theme={theme} phrase={phrase} curso={curso} courseTags={courses.slice(0, 3)} person={person} layout={layout} nome={nome} link={link} className={`ca-art-canvas is-${format}`} />
      </div>
      <div className="ca-art-controls">
        <div className="ca-field"><span>Formato</span>
          <div className="ca-chips">
            <button type="button" className="ca-chip" aria-pressed={format === "story"} onClick={() => setFormat("story")}>Story (1080×1920)</button>
            <button type="button" className="ca-chip" aria-pressed={format === "feed"} onClick={() => setFormat("feed")}>Feed (1080×1080)</button>
          </div>
        </div>
        <div className="ca-field"><span>Modelo</span>
          <div className="ca-chips">
            {LAYOUT_KEYS.map((k) => <button key={k} type="button" className="ca-chip" aria-pressed={layout === k} onClick={() => setLayout(k)}>{LAYOUTS[k]}</button>)}
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
