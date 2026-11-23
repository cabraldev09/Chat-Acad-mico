import React from "react";

// Peak Chart, by Louis Studios (21st.dev/@louisstudios/components/peak-chart), brought to this system: plain JavaScript, numbers in
// pt-BR, a width that follows the column, no period menu (the page has one filter for every card) and a caption large enough to read
// on a phone. The drawing is the original: a navy card lit from below, a line that draws itself, a dot that lands on the peak and a
// headline that counts up. It only animates while it is on screen, and it stands still for who asked for less motion.

/* Card geometry, in card units (540 wide, 696 tall). */
const CW = 540;
const CH = 696;
const CR = 56;
const HN = CH / CW;
const RN = CR / CW;
/* how far the light spills outside the card (card units) */
const BX = 0.07 * CW;
const BY = 0.07 * CW;

const FIELD_FILL = "#1678ff";
const FIELD_SHADES = [
  { shape: [0.4748, 0.8152, 0.7509, 0.8801, 0.7026], color: "#000000", opacity: 1 },
  { shape: [0.3741, 0.2723, 0.7371, 0.3009, 0.1168], color: "#020000", opacity: 1 },
  { shape: [0.7846, 0.0251, 0.3833, 0.1301, -0.5566], color: "#2e85ff", opacity: 0.4756 },
  { shape: [0.6206, -0.2018, 0.1282, 0.5909, 0.2754], color: "#3584ff", opacity: 0.3146 },
  { shape: [0.6, 1.2391, 0.827, 0.2111, -1.6357], color: "#000d1e", opacity: 1 },
  { shape: [0.0964, 0.5388, 1000, 0.1285, 0.5421], color: "#000005", opacity: 0.2298 },
];
const FIELD_RIMS = [
  { shape: [0.1207, -0.0365, 0.0492], color: "#2667ff", opacity: 1 },
  { shape: [0.0667, -0.0166, 0.0176], color: "#467dff", opacity: 1 },
  { shape: [0.037, -0.0134, 0.0154], color: "#c2ffff", opacity: 0.8091 },
];
const HALO = { cx: 0.4996, cy: 0.6438, sx: 0.2498, sy: 0.2433, opacity: 0.845, color: "#0e50ff" };
const BREATH_GAIN = 0.42;
const GRAIN = 1.7;

/* Plot frame and marks. */
const PLOT_X0 = 20.29;
const PLOT_X1 = 503.69;
const PLOT_TOP = 158.49;
const PLOT_BOTTOM = 385.28;
const LINE_W = 7.1;
const LINE_COLOR = "#6496e2";
const LINE_FALLOFF = 108;
const LINE_POWER = 1.44;
const LINE_CENTER = 12;
const DOT_R = 13;
const DOT_DX = 8;
const DOT_DY = 2.6;
const GRID_DX = 40.64;
const GRID_DY = 40.07;
const GRID_Y0 = 468.7;
const GRID_COLOR = "#5a87e1";
const GRID_ALPHA = 0.23;

/* Timeline (seconds). */
const T_GRID = 0.9;
const T_DRAW0 = 0.25;
const T_DRAW = 2.1;
const T_NUM0 = 1.0;
const T_NUM = 1.7;
const T_ARROW = 2.65;
const T_REST = 3.3;
const T_MORPH = 0.75;

/* The accent the artwork is drawn in; any other accent hue-shifts the canvas. */
const BASE_ACCENT = "#4f8ef7";
const DOT_TOP = "#2680ff";
const DOT_MID = "#75aafa";
const DOT_BOTTOM = "#d0e4fd";
const DOT_GLOW = "#287dff";
const PULSE_COLOR = "#78afff";

const FONT = 'Geist, Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/* ---------- maths ---------- */

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const easeInOut = (x) => { const t = clamp01(x); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const backOut = (x) => { const t = clamp01(x); const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
function erf(x) {
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}
const phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
/** Signed distance to the card outline in card widths, negative inside. */
function sdf(u, v) {
  const qx = Math.abs(u - 0.5) - (0.5 - RN);
  const qy = Math.abs(v - HN / 2) - (HN / 2 - RN);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - RN;
}
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rgbOf(color) {
  const c = String(color).trim();
  const hex = /^#([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/i.exec(c);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split("").map((d) => d + d).join("") : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
  return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
}
const rgba = (color, a) => `rgba(${rgbOf(color).join(",")},${a.toFixed(4)})`;
/** Hue (degrees) and HSL saturation (0..1) of a hex or rgb() colour. */
function hslOf(color) {
  if (!/^\s*(#|rgb)/i.test(color)) return null;
  const [r, g, b] = rgbOf(color).map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d === 0) return [0, 0];
  const sat = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, sat];
}

/* ---------- static layers ---------- */

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// the painted layers depend only on the size: cards of the same width on one screen share them instead of painting each one again
const layerCache = new Map();
const cached = (key, build) => {
  if (!layerCache.has(key)) {
    if (layerCache.size > 12) layerCache.delete(layerCache.keys().next().value);
    layerCache.set(key, build());
  }
  return layerCache.get(key);
};

/** Paints the card glow at `px` pixels per card width: the resting field and a brighter copy for the breath. */
function buildField(px, seed) {
  const w = Math.round(px);
  const h = Math.round(px * HN);
  const rest = makeCanvas(w, h);
  const lift = makeCanvas(w, h);
  const c1 = rest.getContext("2d");
  const c2 = lift.getContext("2d");
  const i1 = c1.createImageData(w, h);
  const i2 = c2.createImageData(w, h);
  const d1 = i1.data;
  const d2 = i2.data;
  const rand = rng(seed);
  const fill = rgbOf(FIELD_FILL);
  const shades = FIELD_SHADES.map(({ shape: [cx, cy, sx, sy, th], color, opacity }) => ({
    cx, cy, isx: 1 / Math.abs(sx), isy: 1 / Math.abs(sy), c: Math.cos(th), s: Math.sin(th), rgb: rgbOf(color), a: opacity,
  }));
  const rims = FIELD_RIMS.map(({ shape: [off, sp, sg], color, opacity }) => ({ off, sp, sg, rgb: rgbOf(color), a: opacity }));
  const k2 = 1 + BREATH_GAIN;
  for (let j = 0; j < h; j++) {
    const v = (j + 0.5) / w;
    for (let i = 0; i < w; i++) {
      const u = (i + 0.5) / w;
      let r = fill[0];
      let g = fill[1];
      let b = fill[2];
      for (const o of shades) {
        const du = u - o.cx;
        const dv = v - o.cy;
        const x = (o.c * du + o.s * dv) * o.isx;
        const y = (-o.s * du + o.c * dv) * o.isy;
        const m = o.a * Math.exp(-0.5 * (x * x + y * y));
        r += m * (o.rgb[0] - r); g += m * (o.rgb[1] - g); b += m * (o.rgb[2] - b);
      }
      let r2 = r;
      let g2 = g;
      let b2 = b;
      for (const o of rims) {
        // inner shadow of the card pushed up by `off`: a blurred box, with extra light in the round corners
        const vs = v + o.off;
        const dx = Math.min(u, 1 - u);
        const dy = Math.min(vs, HN - vs);
        const ratio = Math.min(1, phi((-sdf(u, vs) - o.sp) / o.sg) / Math.max(1e-9, phi((Math.min(dx, dy) - o.sp) / o.sg)));
        const k = 1 - phi((dx - o.sp) / o.sg) * phi((dy - o.sp) / o.sg) * ratio;
        const m = o.a * k;
        r += m * (o.rgb[0] - r); g += m * (o.rgb[1] - g); b += m * (o.rgb[2] - b);
        const m2 = Math.min(1, m * k2);
        r2 += m2 * (o.rgb[0] - r2); g2 += m2 * (o.rgb[1] - g2); b2 += m2 * (o.rgb[2] - b2);
      }
      const n = (rand() + rand() + rand() - 1.5) * 2 * GRAIN;
      const p = (j * w + i) * 4;
      d1[p] = r + n; d1[p + 1] = g + n; d1[p + 2] = b + n; d1[p + 3] = 255;
      d2[p] = r2 + n; d2[p + 1] = g2 + n; d2[p + 2] = b2 + n; d2[p + 3] = 255;
    }
  }
  c1.putImageData(i1, 0, 0);
  c2.putImageData(i2, 0, 0);
  return { rest, lift };
}

/** Soft light that spills from behind the card onto the page; it fades to nothing at the edge of the canvas. */
function buildHalo(px) {
  const s = 0.25;
  const w = Math.max(8, Math.round(((CW + 2 * BX) * px * s) / CW));
  const h = Math.max(8, Math.round(((CH + 2 * BY) * px * s) / CW));
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h);
  const [hr, hg, hb] = rgbOf(HALO.color);
  for (let j = 0; j < h; j++) {
    const y = ((j + 0.5) / h) * (CH + 2 * BY) - BY;
    const v = y / CW;
    const ey = smooth(Math.min(y + BY, CH + BY - y) / BY);
    for (let i = 0; i < w; i++) {
      const x = ((i + 0.5) / w) * (CW + 2 * BX) - BX;
      const u = x / CW;
      const ex = smooth(Math.min(x + BX, CW + BX - x) / BX);
      const a = (u - HALO.cx) / HALO.sx;
      const e = (v - HALO.cy) / HALO.sy;
      const k = Math.exp(-0.5 * (a * a + e * e)) * HALO.opacity * ex * ey;
      const p = (j * w + i) * 4;
      img.data[p] = hr; img.data[p + 1] = hg; img.data[p + 2] = hb; img.data[p + 3] = Math.min(255, k * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Faint grid that fades out upward and toward the sides. */
function buildGrid(px) {
  const w = Math.round(px);
  const h = Math.round(px * HN);
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const s = px / CW;
  ctx.scale(s, s);
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = -6; k <= 6; k++) {
    const x = CW / 2 + GRID_DX * k;
    ctx.moveTo(x, 250); ctx.lineTo(x, CH);
  }
  for (let k = -6; k <= 6; k++) {
    const y = GRID_Y0 + GRID_DY * k;
    if (y < 250 || y > CH) continue;
    ctx.moveTo(0, y); ctx.lineTo(CW, y);
  }
  ctx.stroke();
  // alpha mask: plateau in the lower middle, smooth fade up and out
  const mw = 64;
  const mh = Math.round(64 * HN);
  const m = makeCanvas(mw, mh);
  const mc = m.getContext("2d");
  const img = mc.createImageData(mw, mh);
  for (let j = 0; j < mh; j++) {
    const y = ((j + 0.5) / mh) * CH;
    const my = smooth((y - 350) / 230);
    for (let i = 0; i < mw; i++) {
      const x = ((i + 0.5) / mw) * CW;
      const mx = Math.exp(-0.5 * Math.pow((x - CW / 2) / 92, 2));
      img.data[(j * mw + i) * 4 + 3] = Math.round(255 * GRID_ALPHA * mx * my);
    }
  }
  mc.putImageData(img, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(m, 0, 0, w, h);
  return c;
}

/* ---------- curve ---------- */

/** Monotone cubic (Steffen) through evenly spaced points, sampled once per card unit. It never overshoots, so the highest data point
    is the top of the curve and the dot sits on it. */
function buildCurve(data) {
  const vals = data.length >= 2 ? data : data.length === 1 ? [data[0], data[0]] : [0, 0];
  const n = vals.length;
  let lo = Infinity;
  let hi = -Infinity;
  let pk = 0;
  for (let i = 0; i < n; i++) {
    if (vals[i] < lo) lo = vals[i];
    if (vals[i] > hi) { hi = vals[i]; pk = i; }
  }
  const span = hi - lo || 1;
  const yv = vals.map((v) => (hi === lo ? (PLOT_TOP + PLOT_BOTTOM) / 2 : PLOT_TOP + (1 - (v - lo) / span) * (PLOT_BOTTOM - PLOT_TOP)));
  const h = (PLOT_X1 - PLOT_X0) / (n - 1);
  const sl = [];
  for (let i = 0; i < n - 1; i++) sl.push((yv[i + 1] - yv[i]) / h);
  const m = [sl[0]];
  for (let i = 1; i < n - 1; i++) {
    const a = sl[i - 1];
    const b = sl[i];
    m.push((Math.sign(a) + Math.sign(b)) * Math.min(Math.abs(a), Math.abs(b), 0.25 * Math.abs(a + b)));
  }
  m.push(sl[n - 2]);
  const ys = new Float32Array(CW + 1);
  for (let x = 0; x <= CW; x++) {
    let y;
    if (x <= PLOT_X0) y = yv[0] + (x - PLOT_X0) * m[0];
    else if (x >= PLOT_X1) y = yv[n - 1] + (x - PLOT_X1) * m[n - 1];
    else {
      const t = (x - PLOT_X0) / h;
      const i = Math.min(n - 2, Math.floor(t));
      const f = t - i;
      const f2 = f * f;
      const f3 = f2 * f;
      y = (2 * f3 - 3 * f2 + 1) * yv[i] + (f3 - 2 * f2 + f) * h * m[i] + (-2 * f3 + 3 * f2) * yv[i + 1] + (f3 - f2) * h * m[i + 1];
    }
    ys[x] = y;
  }
  // a flat series has no peak: the dot rests at the last point
  return { ys, peakX: PLOT_X0 + (hi === lo ? n - 1 : pk) * h, lo, hi, n };
}
function curveY(ys, x) {
  const xc = Math.max(0, Math.min(CW, x));
  const i = Math.min(CW - 1, Math.floor(xc));
  const f = xc - i;
  return ys[i] * (1 - f) + ys[i + 1] * f;
}
const lineAlpha = (d) => Math.exp(-Math.pow(Math.abs(d) / LINE_FALLOFF, LINE_POWER));

/* ---------- timeline ---------- */

function inverseEase(target) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (easeInOut(m) < target) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

function frameAt(t) {
  return {
    grid: smooth(t / T_GRID),
    draw: easeInOut((t - T_DRAW0) / T_DRAW),
    dotS: backOut((t - T_DRAW0) / 0.4),
    dotA: smooth((t - T_DRAW0) / 0.2),
    num: easeOut((t - T_NUM0) / T_NUM),
    numA: smooth((t - T_NUM0) / 0.45),
    numY: 1 - easeOut((t - T_NUM0) / 0.7),
    arrow: backOut((t - T_ARROW) / 0.45),
    arrowA: smooth((t - T_ARROW) / 0.18),
    breath: t > T_REST ? 0.6 * Math.pow(Math.sin((Math.PI * (t - T_REST)) / 7), 2) : 0,
  };
}

const ptBR = (v, decimals) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/* ---------- component ---------- */

/**
 * data: the series, oldest first. labels: one per point, for the readout. value: the headline number. format: how the headline is
 * written (default: pt-BR number plus valueSuffix). title above the number, caption below it, updatedText in the top-left corner,
 * badge in the top-right one. trend: "up" | "down" | "none". accent: the colour of the light. width: the card width in pixels.
 */
function PeakCard({ data, labels, value = 0, valueSuffix = "", decimals = 0, format, formatValue, title, caption, updatedText, badge, trend = "none", accent = BASE_ACCENT, width, ariaLabel }) {
  const u = width / CW;
  const series = Array.isArray(data) ? data.map((v) => Number(v) || 0) : [];
  const headline = (v) => (format ? format(v) : `${ptBR(v, decimals)}${valueSuffix}`);

  const cardRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const digitsRef = React.useRef(null);
  const numRef = React.useRef(null);
  const arrowRef = React.useRef(null);
  const readRef = React.useRef(null);
  const readValRef = React.useRef(null);
  const readLabRef = React.useRef(null);

  const live = React.useRef(null);
  if (!live.current) {
    live.current = { curve: buildCurve(series), from: null, morph: 1, labels, value, shownValue: 0, valueFrom: 0, valueT: 1, hover: null, hoverX: 0, hoverMix: 0, fmt: formatValue, headline, kick: () => {} };
  }
  live.current.labels = labels;
  live.current.fmt = formatValue;
  live.current.headline = headline;

  // data changes morph the line
  const key = series.join(",");
  const firstData = React.useRef(true);
  React.useEffect(() => {
    if (firstData.current) { firstData.current = false; return; }
    const L = live.current;
    const next = buildCurve(series);
    const t = easeInOut(L.morph);
    if (L.from && L.morph < 1) {
      const ys = new Float32Array(CW + 1);
      for (let x = 0; x <= CW; x++) ys[x] = L.from.ys[x] + (L.curve.ys[x] - L.from.ys[x]) * t;
      L.from = { ...L.curve, ys, peakX: L.from.peakX + (L.curve.peakX - L.from.peakX) * t };
    } else L.from = L.curve;
    L.curve = next;
    L.morph = 0;
    L.kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // headline value changes re-tween the number
  React.useEffect(() => {
    const L = live.current;
    if (L.value === value) return;
    L.valueFrom = L.shownValue;
    L.value = value;
    L.valueT = 0;
    L.kick();
  }, [value]);

  // the render loop
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const card = cardRef.current;
    if (!canvas || !card) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const L = live.current;
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    // whole device pixels for the bleed and the size, so the canvas is never resampled
    const bxc = Math.ceil(BX * u);
    const byc = Math.ceil(BY * u);
    const bx = bxc * dpr;
    const by = byc * dpr;
    canvas.width = Math.ceil(CW * u * dpr + 2 * bx);
    canvas.height = Math.ceil(CH * u * dpr + 2 * by);
    canvas.style.left = `${-bxc}px`;
    canvas.style.top = `${-byc}px`;
    canvas.style.width = `${canvas.width / dpr}px`;
    canvas.style.height = `${canvas.height / dpr}px`;
    const fieldPx = Math.round(Math.min(width * dpr, 520));
    const { rest: field, lift: bright } = cached(`field:${fieldPx}`, () => buildField(fieldPx, 11));
    const grid = cached(`grid:${Math.round(width * dpr)}`, () => buildGrid(width * dpr));
    const halo = cached(`halo:${Math.round(width)}`, () => buildHalo(width));
    const tLand = (frac) => T_DRAW0 + T_DRAW * inverseEase(frac);

    let clock = reduce ? T_REST + 0.01 : 0;
    let started = reduce;
    let visible = true;
    let raf = 0;
    let last = performance.now();

    const roundRect = () => {
      ctx.beginPath();
      ctx.moveTo(CR, 0);
      ctx.arcTo(CW, 0, CW, CH, CR);
      ctx.arcTo(CW, CH, 0, CH, CR);
      ctx.arcTo(0, CH, 0, 0, CR);
      ctx.arcTo(0, 0, CW, 0, CR);
      ctx.closePath();
    };

    const draw = (dt) => {
      const hovering = L.hover !== null;
      // clock: hold still while hovered during the rest
      if (started && !reduce && !(hovering && clock >= T_REST)) clock += dt;
      const t = clock;
      const F = frameAt(started ? t : 0);
      if (reduce) F.breath = 0;

      // morph
      if (L.morph < 1) L.morph = reduce ? 1 : Math.min(1, L.morph + dt / T_MORPH);
      const mk = easeInOut(L.morph);
      const C = L.curve;
      const morphing = L.from && L.morph < 1;
      const ys = morphing ? new Float32Array(CW + 1) : C.ys;
      if (morphing) for (let x = 0; x <= CW; x++) ys[x] = L.from.ys[x] + (C.ys[x] - L.from.ys[x]) * mk;
      const peakX = morphing ? L.from.peakX + (C.peakX - L.from.peakX) * mk : C.peakX;
      const lo = morphing ? L.from.lo + (C.lo - L.from.lo) * mk : C.lo;
      const hi = morphing ? L.from.hi + (C.hi - L.from.hi) * mk : C.hi;

      // hover easing
      const landed = t >= tLand((peakX + DOT_DX) / CW) && F.dotA > 0.99;
      const wantHover = hovering && (landed || reduce);
      if (L.hover !== null) L.hoverX = reduce ? L.hover : L.hoverX + (L.hover - L.hoverX) * (1 - Math.exp(-dt * 14));
      L.hoverMix = reduce ? (wantHover ? 1 : 0) : L.hoverMix + ((wantHover ? 1 : 0) - L.hoverMix) * (1 - Math.exp(-dt * 10));

      // number
      if (L.valueT < 1) L.valueT = reduce ? 1 : Math.min(1, L.valueT + dt / 0.9);
      const target = L.valueFrom + (L.value - L.valueFrom) * easeOut(L.valueT);
      const shown = target * F.num;
      L.shownValue = shown;
      if (digitsRef.current) {
        const txt = L.headline(F.num >= 1 && L.valueT >= 1 ? L.value : shown);
        if (digitsRef.current.textContent !== txt) digitsRef.current.textContent = txt;
      }
      if (numRef.current) {
        numRef.current.style.opacity = String(F.numA);
        numRef.current.style.transform = `translateY(${(F.numY * 5 * u).toFixed(2)}px)`;
        const blur = Math.abs(F.numY) * 6 * u;
        numRef.current.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "";
      }
      if (arrowRef.current) {
        arrowRef.current.style.opacity = String(F.arrowA);
        arrowRef.current.style.transform = `scale(${Math.max(0, F.arrow).toFixed(3)})`;
      }

      // canvas
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const s = dpr * u;
      ctx.setTransform(s, 0, 0, s, bx, by);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(halo, -BX, -BY, CW + 2 * BX, CH + 2 * BY);
      ctx.save();
      roundRect();
      ctx.clip();
      ctx.drawImage(field, 0, 0, CW, CH);
      if (F.breath > 0.001) {
        ctx.globalAlpha = F.breath;
        ctx.drawImage(bright, 0, 0, CW, CH);
      }
      if (F.grid > 0.001) {
        ctx.globalAlpha = F.grid;
        ctx.drawImage(grid, 0, 0, CW, CH);
      }
      ctx.globalAlpha = 1;

      // line
      const x1 = F.draw * CW;
      if (x1 > 0.5) {
        const g = ctx.createLinearGradient(0, 0, CW, 0);
        // a bright comet head while drawing
        const head = 0.95 * (1 - smooth((F.draw - 0.8) / 0.2));
        for (let i = 0; i <= 54; i++) {
          const x = (i / 54) * CW;
          let a = lineAlpha(x - peakX - LINE_CENTER);
          if (head > 0.001 && x <= x1 + 10) a = Math.max(a, head * Math.exp(-Math.max(0, x1 - x) / 70));
          g.addColorStop(i / 54, rgba(LINE_COLOR, a));
        }
        ctx.strokeStyle = g;
        ctx.lineWidth = LINE_W;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(0, curveY(ys, 0));
        for (let x = 1; x < x1; x++) ctx.lineTo(x, ys[x]);
        ctx.lineTo(x1, curveY(ys, x1));
        ctx.stroke();
      }

      // dot: rides the drawing tip, rests on the peak, follows the pointer on hover
      if (F.dotA > 0.001) {
        const restX = peakX + DOT_DX;
        const baseX = Math.min(x1, restX);
        const dx = baseX + (L.hoverX - baseX) * L.hoverMix;
        const dy = curveY(ys, dx) + DOT_DY * (1 - L.hoverMix) * clamp01(baseX / restX);
        const sinceLand = t - tLand(restX / CW);
        const pulse = sinceLand > 0 && sinceLand < 1.1 && !reduce ? sinceLand / 1.1 : -1;
        ctx.globalAlpha = F.dotA;
        ctx.translate(dx, dy);
        ctx.scale(F.dotS, F.dotS);
        const boost = pulse >= 0 ? Math.sin(Math.PI * Math.min(1, pulse * 1.6)) : 0;
        // halo
        const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
        const ha = (a) => rgba(DOT_GLOW, Math.min(1, a * (1 + 0.9 * boost)));
        hg.addColorStop(0, ha(0.47)); hg.addColorStop(15 / 30, ha(0.47)); hg.addColorStop(17 / 30, ha(0.41));
        hg.addColorStop(19 / 30, ha(0.31)); hg.addColorStop(21 / 30, ha(0.17)); hg.addColorStop(23 / 30, ha(0.1));
        hg.addColorStop(25 / 30, ha(0.06)); hg.addColorStop(27 / 30, ha(0.03)); hg.addColorStop(1, ha(0));
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
        if (pulse >= 0) {
          const r = DOT_R + 26 * easeOut(pulse);
          ctx.strokeStyle = rgba(PULSE_COLOR, 0.55 * (1 - pulse) * (1 - pulse));
          ctx.lineWidth = 2.2 * (1 - pulse) + 0.6;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
        }
        // body
        const bg = ctx.createLinearGradient(0, -DOT_R, 0, DOT_R);
        bg.addColorStop(0, DOT_TOP);
        bg.addColorStop(0.45, DOT_MID);
        bg.addColorStop(1, DOT_BOTTOM);
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(0, 0, DOT_R, 0, Math.PI * 2); ctx.fill();
        ctx.setTransform(s, 0, 0, s, bx, by);
        ctx.globalAlpha = 1;

        // readout
        const rd = readRef.current;
        if (rd) {
          rd.style.opacity = L.hoverMix.toFixed(3);
          // the readout stays inside the card near the sides
          const rx = Math.max(70, Math.min(CW - 70, dx));
          rd.style.transform = `translate(${(rx * u).toFixed(1)}px, ${((dy - 26) * u).toFixed(1)}px) translate(-50%, -100%) scale(${(0.92 + 0.08 * L.hoverMix).toFixed(3)})`;
          if (L.hoverMix > 0.01) {
            const n = C.n;
            const idx = Math.round(((Math.max(PLOT_X0, Math.min(PLOT_X1, dx)) - PLOT_X0) / (PLOT_X1 - PLOT_X0)) * (n - 1));
            const v = hi === lo ? hi : lo + ((PLOT_BOTTOM - curveY(ys, dx)) / (PLOT_BOTTOM - PLOT_TOP)) * (hi - lo);
            const txt = L.fmt ? L.fmt(v, idx) : ptBR(Math.round(v), 0);
            if (readValRef.current && readValRef.current.textContent !== txt) readValRef.current.textContent = txt;
            const lab = (L.labels && L.labels[idx]) || "";
            if (readLabRef.current && readLabRef.current.textContent !== lab) readLabRef.current.textContent = lab;
            if (readLabRef.current) readLabRef.current.style.display = lab ? "" : "none";
          }
        }
      }
      ctx.restore();
    };

    const tick = () => {
      raf = 0;
      const now = performance.now();
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      draw(dt);
      const busy = started && (reduce ? L.morph < 1 || Math.abs(L.hoverMix - (L.hover !== null ? 1 : 0)) > 0.001 : true);
      if (visible && !document.hidden && busy) raf = requestAnimationFrame(tick);
    };
    const kick = () => {
      if (!raf && visible && !document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    L.kick = kick;
    draw(0);
    let io = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        if (visible) { started = true; kick(); }
        else if (raf) { cancelAnimationFrame(raf); raf = 0; }
      });
      io.observe(card);
    } else { started = true; kick(); }
    const onVis = () => { if (!document.hidden) kick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (io) io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      if (raf) cancelAnimationFrame(raf);
      L.kick = () => {};
    };
  }, [width, u]);

  const onMove = (e) => {
    const r = cardRef.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * CW;
    const L = live.current;
    const nx = Math.max(PLOT_X0, Math.min(PLOT_X1, x));
    if (L.hover === null && L.hoverMix < 0.02) L.hoverX = nx;
    L.hover = nx;
    L.kick();
  };
  const onLeave = () => {
    live.current.hover = null;
    live.current.kick();
  };

  // Any accent other than the one the artwork is painted in hue-shifts (and re-saturates) the canvas.
  const tint = (() => {
    const a = hslOf(accent);
    const b = hslOf(BASE_ACCENT);
    if (!a || !b) return undefined;
    let d = a[0] - b[0];
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    const k = b[1] > 0 ? a[1] / b[1] : 1;
    if (Math.abs(d) < 0.5 && Math.abs(k - 1) < 0.02) return undefined;
    return `hue-rotate(${d.toFixed(1)}deg) saturate(${Math.min(1.6, k).toFixed(3)})`;
  })();

  const px = (n) => `${(n * u).toFixed(3)}px`;
  const textBase = { position: "absolute", whiteSpace: "nowrap", fontFamily: FONT, fontWeight: 400, margin: 0, lineHeight: 1 };
  const trendColor = trend === "down" ? "#f08a8a" : "#93cfa2";
  const finalText = headline(value);
  // a long headline ("3 h 20 min") shrinks to stay inside the card
  const fit = Math.min(1, 6.2 / Math.max(1, finalText.length));
  const sr = `${title || ""}: ${finalText}${caption ? `. ${caption}` : ""}`;

  return (
    <div ref={cardRef} data-peak-chart="" role="img" aria-label={ariaLabel || sr}
      style={{ position: "relative", width, height: width * HN, borderRadius: px(CR), flex: "none", fontFamily: FONT, color: "#fff", userSelect: "none", WebkitUserSelect: "none" }}>
      <canvas ref={canvasRef} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", filter: tint }} />
      {/* chart hover surface */}
      <div onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={onLeave} onPointerCancel={onLeave}
        style={{ position: "absolute", left: 0, top: px(96), width: "100%", height: px(330), touchAction: "pan-y", cursor: "crosshair" }} />
      {updatedText ? <p style={{ ...textBase, left: px(45.6), top: px(45), fontSize: px(21), color: "#99a3b6", maxWidth: px(280), overflow: "hidden", textOverflow: "ellipsis" }}>{updatedText}</p> : null}
      {badge ? (
        <span style={{ position: "absolute", right: px(42), top: px(33), height: px(42), borderRadius: px(21), padding: `0 ${px(20)}`, display: "flex", alignItems: "center", background: "rgba(255,255,255,0.13)", color: "#c4d4f2", fontSize: px(22), whiteSpace: "nowrap" }}>{badge}</span>
      ) : null}

      {/* hover readout */}
      <div ref={readRef} aria-hidden="true"
        style={{ position: "absolute", left: 0, top: 0, opacity: 0, pointerEvents: "none", zIndex: 2, display: "flex", alignItems: "baseline", gap: 6, padding: "5px 9px", borderRadius: 9, background: "rgba(18,36,72,0.72)", border: "1px solid rgba(160,195,255,0.22)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", whiteSpace: "nowrap", fontFamily: FONT }}>
        <span ref={readValRef} style={{ fontSize: 13, fontWeight: 600, color: "#fff" }} />
        <span ref={readLabRef} style={{ fontSize: 11.5, color: "#aebcd6" }} />
      </div>

      <p style={{ ...textBase, left: px(24), right: px(24), textAlign: "center", top: px(432), fontSize: px(28), color: "#b4bccb", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</p>
      <div ref={numRef} style={{ position: "absolute", left: 0, right: 0, top: px(474), height: px(92), display: "flex", justifyContent: "center", alignItems: "center", opacity: 0 }}>
        <div style={{ position: "relative", fontFamily: FONT, fontWeight: 600, fontSize: px(89.2 * fit), lineHeight: 1, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
          <span style={{ position: "relative", display: "inline-block", fontVariantNumeric: "tabular-nums" }}>
            <span style={{ visibility: "hidden" }}>{finalText}</span>
            <span ref={digitsRef} style={{ position: "absolute", right: 0, top: 0 }}>{finalText}</span>
          </span>
          {trend !== "none" && (
            <svg ref={arrowRef} viewBox="0 0 8 8" aria-hidden="true"
              style={{ position: "absolute", left: "100%", marginLeft: px(7), top: px(8), width: px(13), height: px(13), overflow: "visible", transformOrigin: "0% 100%", opacity: 0, rotate: trend === "down" ? "90deg" : undefined }}>
              <path d="M0.6 7.4 L7.2 0.8 M2 0.6 L7.4 0.6 L7.4 6" fill="none" stroke={trendColor} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
        </div>
      </div>
      {caption ? <p style={{ ...textBase, left: px(28), right: px(28), textAlign: "center", top: px(584), fontSize: px(24), lineHeight: 1.25, whiteSpace: "normal", color: "#b4bccb" }}>{caption}</p> : null}
    </div>
  );
}

// The card fills its column (between 220 and `maxWidth` pixels) and keeps its proportions.
export default function PeakChart({ maxWidth = 340, className, style, ...props }) {
  const box = React.useRef(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const measure = () => {
      // the light spills a little outside the card: the card leaves that room inside its column, so nothing overflows the page
      const w = Math.round(Math.max(180, Math.min(maxWidth, el.clientWidth / (1 + (2 * BX) / CW))));
      setWidth((old) => (Math.abs(old - w) > 3 ? w : old));
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxWidth]);
  return (
    <div ref={box} className={className} style={{ width: "100%", minWidth: 0, display: "flex", justifyContent: "center", ...style }}>
      {width > 0 ? <PeakCard width={width} {...props} /> : <div style={{ width: "100%", maxWidth, aspectRatio: `${CW} / ${CH}`, borderRadius: 30, background: "#0a1626" }} />}
    </div>
  );
}
