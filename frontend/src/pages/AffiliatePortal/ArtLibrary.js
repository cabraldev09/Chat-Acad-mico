import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode.react";
import { Download } from "lucide-react";
import { toast } from "react-toastify";

import { drawArt, loadAluna, loadLogo } from "./ArtMaker";

import { PHRASES } from "./promoContent";

// A shelf of finished arts for posting right away: every phrase in the two colors, and one card for each kind of course.
// Each one already carries the QR Code and the name of the affiliate. The small pictures are drawn on the page, one at a
// time, so the phone does not freeze; the file is drawn again at full size when she downloads it.
const THUMB = { story: [216, 384], feed: [300, 300] };

const THEME_CYCLE = ["azul", "noite", "sol", "claro"];
const buildItems = (groups) => {
  const items = PHRASES.map((phrase, i) => ({ id: `f${i}`, phrase, theme: THEME_CYCLE[i % THEME_CYCLE.length], curso: "", label: phrase }));
  const seen = new Set();
  const picks = [];
  (groups || []).forEach((g) => g.courses.forEach((c) => {
    const key = c.category || g.modality;
    if (!seen.has(key) && picks.length < 6) { seen.add(key); picks.push(c.name); }
  }));
  picks.forEach((curso, i) => items.push({ id: `c${i}`, phrase: PHRASES[i % 2 ? 7 : 1], theme: THEME_CYCLE[(i + 1) % THEME_CYCLE.length], curso, label: curso }));
  return items;
};

const ArtLibrary = ({ nome, link, groups, limit, onMore }) => {
  const [format, setFormat] = useState("story");
  const [thumbs, setThumbs] = useState({});
  const [busy, setBusy] = useState("");
  const items = useMemo(() => buildItems(groups).slice(0, limit || 99), [groups, limit]);
  const qrBox = useRef(null);
  const drawn = useRef(new Set());

  // forgets the pictures when who she is or her link changes
  useEffect(() => { drawn.current = new Set(); setThumbs({}); }, [nome, link]);

  useEffect(() => {
    let off = false;
    (async () => {
      let logo = null;
      let photo = null;
      try {
        const got = await Promise.all([loadLogo(), loadAluna(), document.fonts && document.fonts.load ? document.fonts.load("800 48px Geist") : null]);
        logo = got[0];
        photo = got[1];
      } catch (e) { /* drawn with the font of the system */ }
      const qr = qrBox.current ? qrBox.current.querySelector("canvas") : null;
      const work = document.createElement("canvas");
      const [tw, th] = THUMB[format];
      for (const it of items) {
        const key = `${format}|${it.id}`;
        if (off) return;
        if (drawn.current.has(key)) continue;
        try {
          drawArt(work, { format, theme: it.theme, phrase: it.phrase, curso: it.curso, nome, link, qr, logo, student: photo });
          const small = document.createElement("canvas");
          small.width = tw * 2; small.height = th * 2;
          small.getContext("2d").drawImage(work, 0, 0, small.width, small.height);
          const url = small.toDataURL("image/jpeg", 0.85);
          drawn.current.add(key);
          if (!off) setThumbs((t) => ({ ...t, [key]: url }));
        } catch (e) { /* this one stays empty; the others go on */ }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 40));
      }
    })();
    return () => { off = true; };
  }, [format, items, nome, link]);

  const download = async (it) => {
    setBusy(it.id);
    try {
      const qr = qrBox.current ? qrBox.current.querySelector("canvas") : null;
      const logo = await loadLogo();
      const student = await loadAluna();
      const canvas = document.createElement("canvas");
      drawArt(canvas, { format, theme: it.theme, phrase: it.phrase, curso: it.curso, nome, link, qr, logo, student });
      const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
      if (!blob) throw new Error("no image");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `arte-${it.id}-${format}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) { toast.error("Não foi possível criar a imagem. Tente de novo."); }
    setBusy("");
  };

  const [tw, th] = THUMB[format];
  return (
    <section aria-label="Artes prontas">
      <div className="ca-tools" style={{ marginTop: 6 }}>
        <div className="ca-chips" role="group" aria-label="Formato">
          <button type="button" className="ca-chip" aria-pressed={format === "story"} onClick={() => setFormat("story")}>Story</button>
          <button type="button" className="ca-chip" aria-pressed={format === "feed"} onClick={() => setFormat("feed")}>Feed</button>
        </div>
        <span className="ca-help">Todas já saem com o seu QR Code. Toque em uma para baixar.</span>
        {onMore && <button type="button" className="ca-text-link" style={{ marginLeft: "auto" }} onClick={onMore}>Ver todas as artes</button>}
      </div>
      <div className={`ca-shelf is-${format}`}>
        {items.map((it) => {
          const url = thumbs[`${format}|${it.id}`];
          return (
            <button key={it.id} type="button" className="ca-shelf-item" onClick={() => download(it)} disabled={busy === it.id} aria-label={`Baixar arte: ${it.label}`}>
              <span className="ca-shelf-img" style={{ aspectRatio: `${tw} / ${th}` }}>
                {url ? <img src={url} alt="" draggable={false} /> : <i className="ca-skel" />}
              </span>
              <span className="ca-shelf-cap"><b>{it.curso ? "Curso" : "Frase"}</b>{it.label}</span>
              <span className="ca-shelf-dl"><Download size={15} /></span>
            </button>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: -9999, top: 0, pointerEvents: "none" }} ref={qrBox} aria-hidden="true">
        <QRCode value={link || "https://"} size={480} level="M" includeMargin fgColor="#0b1a2e" bgColor="#ffffff" />
      </div>
    </section>
  );
};

export default ArtLibrary;
