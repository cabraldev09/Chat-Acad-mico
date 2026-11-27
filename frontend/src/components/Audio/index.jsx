import { renewMediaElement } from "../../services/media-access";
import React, { useEffect, useRef, useState } from "react";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import { Play, Pause, Mic, Headphones, Download } from "lucide-react";
import { wa } from "../chat/chatTheme";

// A voice note or an audio file drawn like WhatsApp's: the picture of who sent it (with a microphone for voice notes), a round
// play button, a bar that can be clicked or dragged, the time under it and the speed (1x, 1,5x, 2x). It never plays by itself.
const LS_NAME = "audioMessageRate";
const RATES = [1, 1.5, 2];

const readRate = () => {
  try {
    const v = parseFloat(localStorage.getItem(LS_NAME) || "1");
    return RATES.includes(v) ? v : 1;
  } catch (e) {
    return 1;
  }
};

const mmss = (s) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const t = Math.floor(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  const dark = theme.palette.type === "dark";
  return {
    root: { width: 300, maxWidth: "100%", boxSizing: "border-box", padding: "2px 0 0", userSelect: "none" },
    row: { display: "flex", alignItems: "center", gap: 8 },
    avatarBox: { position: "relative", flex: "none", width: 46, height: 46 },
    avatar: {
      width: 46, height: 46, borderRadius: "50%", objectFit: "cover", display: "grid", placeItems: "center",
      fontSize: 15, fontWeight: 700, color: "#fff", background: dark ? "#6b7c85" : "#a0aeb6", overflow: "hidden",
    },
    badge: { position: "absolute", right: -3, bottom: -1, display: "grid", placeItems: "center", color: c.accent, filter: `drop-shadow(0 0 1.5px ${dark ? "#000" : "#fff"})` },
    rate: {
      flex: "none", width: 46, height: 26, borderRadius: 13, border: 0, cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 700,
      color: "#fff", background: dark ? "rgba(255,255,255,.28)" : "rgba(11,20,26,.38)", padding: 0,
    },
    play: {
      flex: "none", width: 34, height: 34, border: 0, padding: 0, borderRadius: "50%", cursor: "pointer", display: "grid", placeItems: "center",
      color: c.textSecondary, background: "transparent", "&:hover": { color: c.text }, "&:focus-visible": { outline: `2px solid ${c.accent}` },
      "&[disabled]": { opacity: 0.5, cursor: "default" },
    },
    track: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", position: "relative", paddingTop: 20 },
    range: {
      WebkitAppearance: "none", appearance: "none", display: "block", width: "100%", height: 4, margin: 0, borderRadius: 2, cursor: "pointer",
      outline: "none", background: "transparent",
      "&::-webkit-slider-thumb": { WebkitAppearance: "none", width: 13, height: 13, borderRadius: "50%", background: c.tick, border: 0, marginTop: 0 },
      "&::-moz-range-thumb": { width: 13, height: 13, borderRadius: "50%", background: c.tick, border: 0 },
      "&:focus-visible": { outline: `2px solid ${c.accent}`, outlineOffset: 4 },
      "&[disabled]": { cursor: "default" },
    },
    under: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 18, marginTop: 4 },
    time: { fontSize: 12, lineHeight: "15px", color: c.textSecondary, fontVariantNumeric: "tabular-nums" },
    // the time of the message and the ticks: given by the conversation, on the same line as the length of the audio
    meta: { display: "inline-flex", alignItems: "center", "& > *": { float: "none !important", margin: "0 !important" } },
    dl: { display: "inline-grid", placeItems: "center", color: c.textSecondary, opacity: 0.8, "&:hover": { opacity: 1 } },
    failed: { fontSize: 12.5, color: c.textSecondary },
  };
});

export default function Audio({ url, fromMe, avatarUrl, initials, avatarColor, meta }) {
  const classes = useStyles();
  const theme = useTheme();
  const c = wa(theme);
  const audioRef = useRef(null);
  const [rate, setRate] = useState(readRate);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [failed, setFailed] = useState(false);
  const [picOk, setPicOk] = useState(true);
  const voice = /\.(ogg|opus|oga)(\?|#|$)/i.test(String(url || "")) || !/\.(mp3|m4a|aac|wav|flac)(\?|#|$)/i.test(String(url || ""));

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
    try { localStorage.setItem(LS_NAME, String(rate)); } catch (e) { /* storage blocked */ }
  }, [rate]);

  // only one audio of the conversation plays at a time (as on WhatsApp)
  useEffect(() => {
    const onOther = (e) => {
      const el = audioRef.current;
      if (el && e.detail !== el && !el.paused) el.pause();
    };
    window.addEventListener("chat-audio-play", onOther);
    return () => window.removeEventListener("chat-audio-play", onOther);
  }, []);

  const onMeta = () => {
    const el = audioRef.current;
    if (!el) return;
    // voice notes recorded by browsers often have no length until read to the end: ask the browser to find it
    if (!Number.isFinite(el.duration)) {
      const fix = () => {
        el.removeEventListener("durationchange", fix);
        if (Number.isFinite(el.duration)) { setDuration(el.duration); el.currentTime = 0; }
      };
      el.addEventListener("durationchange", fix);
      try { el.currentTime = 1e7; } catch (e) { /* not seekable yet */ }
      return;
    }
    setDuration(el.duration);
  };

  const toggle = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (!el.paused) { el.pause(); return; }
    el.playbackRate = rate;
    try {
      window.dispatchEvent(new CustomEvent("chat-audio-play", { detail: el }));
      await el.play();
    } catch (err) {
      // the link may have expired: renew it and try once more
      try {
        await renewMediaElement({ currentTarget: el });
        el.playbackRate = rate;
        await el.play();
      } catch (e2) {
        setFailed(true);
      }
    }
  };

  const seek = (e) => {
    const value = Number(e.target.value);
    const el = audioRef.current;
    if (el && Number.isFinite(value)) { el.currentTime = value; setCurrent(value); }
  };

  const nextRate = () => setRate((r) => RATES[(RATES.indexOf(r) + 1) % RATES.length]);

  const shown = playing || current > 0 ? current : duration;
  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  const filled = c.tick;
  const rest = theme.palette.type === "dark" ? "rgba(233,237,239,.25)" : "rgba(11,20,26,.18)";

  const avatar = (
    <span className={classes.avatarBox} aria-hidden="true">
      {avatarUrl && picOk
        ? <img className={classes.avatar} src={avatarUrl} alt="" loading="lazy" onError={() => setPicOk(false)} />
        : <span className={classes.avatar} style={avatarColor ? { background: avatarColor } : undefined}>{initials || (voice ? <Mic size={22} weight="fill" /> : <Headphones size={22} />)}</span>}
      {(initials || (avatarUrl && picOk)) && (
        <span className={classes.badge}>{voice ? <Mic size={18} weight="fill" /> : <Headphones size={18} weight="fill" />}</span>
      )}
    </span>
  );

  return (
    <div className={classes.root}>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onError={renewMediaElement}
        onLoadedMetadata={onMeta}
        onDurationChange={() => { const el = audioRef.current; if (el && Number.isFinite(el.duration)) setDuration(el.duration); }}
        onTimeUpdate={() => { const el = audioRef.current; if (el) setCurrent(el.currentTime); }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrent(0); }}
        style={{ display: "none" }}
      />
      <div className={classes.row}>
        {/* the speed sits where the picture is while it plays, as on WhatsApp */}
        {!fromMe && (playing ? <button type="button" className={classes.rate} onClick={nextRate} aria-label={`Velocidade ${rate}x`}>{String(rate).replace(".", ",")}x</button> : avatar)}
        <button type="button" className={classes.play} onClick={toggle} disabled={failed} aria-label={playing ? "Pausar" : "Ouvir"}>
          {playing ? <Pause size={26} weight="fill" /> : <Play size={26} weight="fill" />}
        </button>
        <div className={classes.track}>
          <input
            type="range"
            className={classes.range}
            min={0}
            max={duration || 0}
            step="any"
            value={Math.min(current, duration || 0)}
            onChange={seek}
            disabled={!duration || failed}
            aria-label="Posição do áudio"
            aria-valuetext={`${mmss(current)} de ${mmss(duration)}`}
            style={{ background: `linear-gradient(to right, ${filled} ${pct}%, ${rest} ${pct}%)` }}
          />
          <div className={classes.under}>
            {failed
              ? <span className={classes.failed}>Não foi possível tocar o áudio</span>
              : <span className={classes.time}>{mmss(shown)}</span>}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {url && (
                <a className={classes.dl} href={url} download target="_blank" rel="noopener noreferrer" aria-label="Baixar o áudio" title="Baixar o áudio">
                  <Download size={15} />
                </a>
              )}
              {meta && <span className={classes.meta}>{meta}</span>}
            </span>
          </div>
        </div>
        {fromMe && (playing ? <button type="button" className={classes.rate} onClick={nextRate} aria-label={`Velocidade ${rate}x`}>{String(rate).replace(".", ",")}x</button> : avatar)}
      </div>
    </div>
  );
}
