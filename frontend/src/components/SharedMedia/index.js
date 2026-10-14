import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import { ExternalLink, FileText, Image as ImageIcon, Link2, Play, Star } from "lucide-react";

import api from "../../services/api";
import { wa } from "../chat/chatTheme";
import { openGallery } from "../MediaGallery";

const TABS = [
  ["media", "Mídias", ImageIcon],
  ["docs", "Documentos", FileText],
  ["links", "Links", Link2],
  ["starred", "Favoritas", Star],
];

const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  return {
    box: { backgroundColor: c.panel, boxShadow: c.shadow, marginBottom: theme.spacing(1) },
    tabs: { display: "flex", borderBottom: `1px solid ${c.divider}` },
    tab: {
      flex: 1, border: 0, background: "none", cursor: "pointer", padding: "10px 4px", fontSize: 12.5, color: c.textSecondary,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 3, borderBottom: "2px solid transparent", transition: "color .15s, border-color .15s",
      "&:hover": { color: c.text },
    },
    tabOn: { color: c.accent, borderBottomColor: c.accent },
    body: { padding: theme.spacing(1.5), minHeight: 90 },
    grid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3 },
    thumb: {
      position: "relative", aspectRatio: "1 / 1", background: c.panelAlt, border: 0, padding: 0, cursor: "pointer", overflow: "hidden",
      display: "grid", placeItems: "center", color: c.textSecondary,
      "& img": { width: "100%", height: "100%", objectFit: "cover", transition: "transform .3s" },
      "&:hover img": { transform: "scale(1.06)" },
    },
    play: { position: "absolute", color: "#fff", filter: "drop-shadow(0 1px 3px rgba(0,0,0,.6))" },
    row: {
      display: "flex", alignItems: "center", gap: theme.spacing(1), padding: theme.spacing(0.75, 0), color: c.text, textDecoration: "none",
      borderBottom: `1px solid ${c.divider}`, fontSize: 14, "&:last-child": { borderBottom: 0 }, "&:hover": { color: c.accent },
    },
    text: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    when: { fontSize: 11.5, color: c.textSecondary },
    empty: { textAlign: "center", color: c.textSecondary, fontSize: 13.5, padding: theme.spacing(2, 1) },
  };
});

const when = (d) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });

const SharedMedia = () => {
  const classes = useStyles();
  const { ticketId } = useParams();
  const [tab, setTab] = useState("media");
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!ticketId) return undefined;
    let alive = true;
    setRows(null);
    api.get(`/messages/${ticketId}/list`, { params: { kind: tab } })
      .then(({ data }) => alive && setRows(data))
      .catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, [ticketId, tab]);

  const empty = {
    media: "Nenhuma foto ou vídeo nesta conversa.",
    docs: "Nenhum documento nesta conversa.",
    links: "Nenhum link nesta conversa.",
    starred: "Marque mensagens com a estrela para encontrá-las aqui.",
  }[tab];

  return (
    <div className={classes.box}>
      <div className={classes.tabs} role="tablist">
        {TABS.map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`${classes.tab} ${tab === k ? classes.tabOn : ""}`} onClick={() => setTab(k)}>
            <Icon size={17} /> {label}
          </button>
        ))}
      </div>
      <div className={classes.body}>
        {rows && rows.length === 0 && <div className={classes.empty}>{empty}</div>}
        {tab === "media" && rows && rows.length > 0 && (
          <div className={classes.grid}>
            {rows.map((m, i) => (
              <button key={m.id} type="button" className={classes.thumb} title="Abrir"
                onClick={() => openGallery(rows.map((x) => ({ url: x.mediaUrl, type: x.mediaType, fromMe: x.fromMe, date: when(x.createdAt) })), i)}>
                {m.mediaType === "image" ? <img src={m.mediaUrl} alt="" loading="lazy" /> : <Play size={26} className={classes.play} style={{ position: "static" }} />}
              </button>
            ))}
          </div>
        )}
        {tab === "docs" && rows && rows.map((m) => (
          <a key={m.id} className={classes.row} href={m.mediaUrl} target="_blank" rel="noopener noreferrer" download>
            <FileText size={18} />
            <span className={classes.text}>{m.body || "Documento"}</span>
            <span className={classes.when}>{when(m.createdAt)}</span>
          </a>
        ))}
        {tab === "links" && rows && rows.map((l, i) => (
          <a key={`${l.id}-${i}`} className={classes.row} href={l.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} />
            <span className={classes.text}>{l.url}</span>
            <span className={classes.when}>{when(l.createdAt)}</span>
          </a>
        ))}
        {tab === "starred" && rows && rows.map((m) => (
          <div key={m.id} className={classes.row}>
            <Star size={16} fill="#f5c400" color="#f5c400" />
            <span className={classes.text} title={m.body}>{m.fromMe ? "Você: " : ""}{m.body || "Mídia"}</span>
            <span className={classes.when}>{when(m.createdAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SharedMedia;
