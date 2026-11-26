import React, { useEffect, useMemo, useRef, useState } from "react";
import { CircularProgress, makeStyles, useTheme } from "@material-ui/core";
import { Plus, Smile, Sticker } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import EmojiPicker from "../EmojiPicker";
import { wa } from "../chat/chatTheme";

// THE PANEL OF THE COMPOSER, LIKE THE ONE OF WHATSAPP: Emoji, GIF and Figurinhas in one place, switched by the pill on top.
// The GIFs and the stickers are the ones of the number (already received or sent in its conversations: WhatsApp Web does not give the
// favorites of the phone); a tap sends one. "Criar figurinha" turns a picture into a sticker (the server makes it 512 x 512 .webp).
export const FILTERS = [
  { key: "all", label: "Todas" },
  { key: "recent", label: "Recentes" },
  { key: "top", label: "Mais usadas" },
  { key: "received", label: "Recebidas" }
];

// what each filter shows (the list comes newest first from the server)
export const filterStickers = (list, key) => {
  const rows = list || [];
  if (key === "recent") return rows.filter((s) => s.sent).sort((a, b) => String(b.sentAt || "").localeCompare(String(a.sentAt || "")));
  if (key === "top") return rows.filter((s) => (s.uses || 1) > 1).sort((a, b) => (b.uses || 1) - (a.uses || 1));
  if (key === "received") return rows.filter((s) => !s.sent);
  return rows;
};

const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  return {
    root: {
      width: 380,
      maxWidth: "calc(100vw - 24px)",
      height: 440,
      maxHeight: "62vh",
      display: "flex",
      flexDirection: "column",
      background: c.panel,
      color: c.text,
      borderRadius: 18,
      boxShadow: c.float,
      overflow: "hidden",
    },
    top: { display: "flex", justifyContent: "center", padding: "10px 12px 6px", flex: "none" },
    pill: { display: "inline-flex", gap: 2, padding: 3, borderRadius: 999, background: c.panelAlt },
    tab: {
      minWidth: 64,
      height: 34,
      padding: "0 14px",
      border: 0,
      borderRadius: 999,
      background: "transparent",
      color: c.textSecondary,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      font: "inherit",
      fontSize: 13,
      fontWeight: 800,
      letterSpacing: 0.4,
      cursor: "pointer",
      "&:hover": { color: c.text },
      "&[aria-pressed='true']": { background: c.panel, color: c.text, boxShadow: "0 1px 3px rgba(0,0,0,.18)" },
    },
    gifTag: { border: "2px solid currentColor", borderRadius: 5, padding: "0 4px", fontSize: 10, lineHeight: "16px" },
    chips: {
      display: "flex",
      gap: 6,
      padding: "6px 10px 8px",
      overflowX: "auto",
      flex: "none",
      scrollbarWidth: "none",
      "&::-webkit-scrollbar": { display: "none" },
    },
    chip: {
      flex: "none",
      height: 32,
      padding: "0 11px",
      borderRadius: 999,
      border: `1px solid ${c.divider}`,
      background: c.panel,
      color: c.text,
      font: "inherit",
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      "&:hover": { background: c.hover },
      "&[aria-pressed='true']": { borderColor: c.accent, background: c.panelAlt, color: c.text },
    },
    body: {
      flex: 1,
      minHeight: 0,
      overflowY: "auto",
      overflowX: "hidden",
      padding: "0 10px 12px",
      scrollbarWidth: "thin",
    },
    grid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 },
    gifGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 },
    tile: {
      position: "relative",
      aspectRatio: "1 / 1",
      border: 0,
      padding: 4,
      borderRadius: 12,
      background: "transparent",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      "&:hover": { background: c.hover },
      "&:disabled": { cursor: "default" },
      "& img": { width: "100%", height: "100%", objectFit: "contain", display: "block" },
    },
    gifTile: {
      position: "relative",
      aspectRatio: "4 / 3",
      border: 0,
      padding: 0,
      borderRadius: 10,
      overflow: "hidden",
      background: c.panelAlt,
      cursor: "pointer",
      "& video": { width: "100%", height: "100%", objectFit: "cover", display: "block" },
    },
    create: {
      aspectRatio: "1 / 1",
      border: 0,
      borderRadius: 12,
      background: c.panelAlt,
      color: c.text,
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      font: "inherit",
      fontSize: 12,
      fontWeight: 700,
      lineHeight: 1.15,
      textAlign: "center",
      padding: 6,
      "&:hover": { filter: "brightness(.97)" },
      "&:disabled": { opacity: 0.6, cursor: "default" },
    },
    plus: { width: 28, height: 28, borderRadius: 8, background: c.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" },
    note: { fontSize: 13, color: c.textSecondary, padding: "8px 4px", lineHeight: 1.4 },
    link: { border: 0, background: "none", color: c.accent, font: "inherit", fontWeight: 700, cursor: "pointer", padding: 0 },
    center: { display: "flex", justifyContent: "center", padding: 24 },
    busy: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.18)", borderRadius: "inherit" },
    emoji: { flex: 1, minHeight: 0, display: "flex", justifyContent: "center", "& em-emoji-picker": { "--font-family": "inherit", "--rgb-accent": "0, 168, 132", width: "100%", height: "100%", "--border-radius": "0" } },
  };
});

// GIFs and stickers of the number, loaded once per tab
const useLibrary = (ticketId, kind, active) => {
  const [list, setList] = useState(null);
  const [failed, setFailed] = useState(false);
  const load = () => {
    setFailed(false);
    setList(null);
    api.get(`/messages/${ticketId}/stickers`, { params: kind === "gif" ? { kind: "gif" } : {} })
      .then(({ data }) => setList(Array.isArray(data) ? data : []))
      .catch(() => setFailed(true));
  };
  const asked = useRef(false);
  useEffect(() => {
    asked.current = false;
    setList(null);
  }, [ticketId]);
  useEffect(() => {
    if (active && !asked.current) {
      asked.current = true;
      load();
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps
  return { list, failed, load };
};

const ExpressionPanel = ({ ticketId, tab, onTab, onEmoji, onSent, showMedia }) => {
  const classes = useStyles();
  const dark = useTheme().palette.type === "dark";
  const stickers = useLibrary(ticketId, "sticker", showMedia && tab === "stickers");
  const gifs = useLibrary(ticketId, "gif", showMedia && tab === "gif");
  const [filter, setFilter] = useState("all");
  const [sending, setSending] = useState(null);
  const fileRef = useRef(null);

  const shown = useMemo(() => filterStickers(stickers.list, filter), [stickers.list, filter]);

  const send = async (s) => {
    if (sending) return;
    setSending(s.id);
    try {
      await api.post(`/messages/${ticketId}/sticker`, { messageId: s.id, clientKey: `stk-${s.id}-${Date.now()}` });
      onSent();
    } catch (err) {
      toastError(err);
    }
    setSending(null);
  };

  const create = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file || sending) return;
    setSending("create");
    try {
      const form = new FormData();
      form.append("fromMe", true);
      form.append("medias", file);
      form.append("body", "");
      form.append("kind", "sticker");
      form.append("clientKey", `stk-new-${Date.now()}`);
      await api.post(`/messages/${ticketId}`, form);
      onSent();
    } catch (err) {
      toastError(err);
    }
    setSending(null);
  };

  const state = (lib, emptyText) => {
    if (lib.failed) {
      return (
        <div className={classes.note} role="alert">
          Não foi possível carregar. <button type="button" className={classes.link} onClick={lib.load}>Tentar de novo</button>
        </div>
      );
    }
    if (lib.list === null) return <div className={classes.center}><CircularProgress size={22} /></div>;
    if (!lib.list.length) return <div className={classes.note}>{emptyText}</div>;
    return null;
  };

  return (
    <div className={classes.root} role="dialog" aria-label="Emojis, GIFs e figurinhas">
      <div className={classes.top}>
        <div className={classes.pill} role="group" aria-label="Tipo">
          <button type="button" className={classes.tab} aria-pressed={tab === "emoji"} aria-label="Emojis" title="Emojis" onClick={() => onTab("emoji")}>
            <Smile size={20} />
          </button>
          {showMedia && (
            <button type="button" className={classes.tab} aria-pressed={tab === "gif"} aria-label="GIFs" title="GIFs" onClick={() => onTab("gif")}>
              <span className={classes.gifTag}>GIF</span>
            </button>
          )}
          {showMedia && (
            <button type="button" className={classes.tab} aria-pressed={tab === "stickers"} aria-label="Figurinhas" title="Figurinhas" onClick={() => onTab("stickers")}>
              <Sticker size={20} />
            </button>
          )}
        </div>
      </div>

      {tab === "emoji" && (
        <div className={classes.emoji}>
          <EmojiPicker dark={dark} perLine={8} onSelect={onEmoji} />
        </div>
      )}

      {tab === "stickers" && showMedia && (
        <>
          <div className={classes.chips} role="group" aria-label="Filtrar figurinhas">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className={classes.chip} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>
            ))}
          </div>
          <div className={classes.body}>
            <div className={classes.grid}>
              <button type="button" className={classes.create} disabled={!!sending} onClick={() => fileRef.current && fileRef.current.click()} aria-label="Criar figurinha a partir de uma foto">
                {sending === "create" ? <CircularProgress size={22} /> : <span className={classes.plus}><Plus size={18} /></span>}
                Criar figurinha
              </button>
              {shown.map((s) => (
                <button key={s.id} type="button" className={classes.tile} title="Enviar figurinha" aria-label="Enviar figurinha" disabled={!!sending}
                  style={{ opacity: sending && sending !== s.id ? 0.5 : 1 }} onClick={() => send(s)}>
                  <img src={s.url} alt="" loading="lazy" />
                  {sending === s.id && <span className={classes.busy}><CircularProgress size={20} /></span>}
                </button>
              ))}
            </div>
            {state(stickers, "As figurinhas recebidas ou enviadas neste número aparecem aqui.")}
            {stickers.list && stickers.list.length > 0 && !shown.length && (
              <div className={classes.note}>
                {filter === "recent" ? "A equipe ainda não enviou figurinha por este número." : filter === "top" ? "Nenhuma figurinha foi usada mais de uma vez." : "Nenhuma figurinha só recebida."}
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={create} />
        </>
      )}

      {tab === "gif" && showMedia && (
        <div className={classes.body} style={{ paddingTop: 6 }}>
          {state(gifs, "Os GIFs recebidos ou enviados neste número aparecem aqui.") || (
            <div className={classes.gifGrid}>
              {gifs.list.map((g) => (
                <button key={g.id} type="button" className={classes.gifTile} title="Enviar GIF" aria-label="Enviar GIF" disabled={!!sending}
                  style={{ opacity: sending && sending !== g.id ? 0.5 : 1 }} onClick={() => send(g)}>
                  <video src={g.url} muted loop autoPlay playsInline preload="metadata" />
                  {sending === g.id && <span className={classes.busy}><CircularProgress size={20} /></span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ExpressionPanel;
