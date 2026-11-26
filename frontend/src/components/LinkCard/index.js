import React, { useEffect, useState } from "react";

import api from "../../services/api";

// The card of a link in a message (as on WhatsApp): the picture, the title and the site, read by the server (only links that are in a
// message the person may read). While it loads, and when the page has nothing to show, nothing appears: the link stays as text.
const cache = new Map();
const URL_RE = /https?:\/\/[^\s<>"'`]+/i;

export const hasLink = (body) => URL_RE.test(String(body || ""));

const LinkCard = ({ messageId, fromMe }) => {
  const [card, setCard] = useState(cache.has(messageId) ? cache.get(messageId) : undefined);
  useEffect(() => {
    if (cache.has(messageId)) return undefined;
    let alive = true;
    api.get(`/messages/${encodeURIComponent(messageId)}/link-preview`)
      .then(({ data }) => { cache.set(messageId, data.card || null); if (alive) setCard(data.card || null); })
      .catch(() => { cache.set(messageId, null); if (alive) setCard(null); });
    return () => { alive = false; };
  }, [messageId]);
  if (!card) return null;
  return (
    <a
      href={card.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "block", margin: "0 0 6px", borderRadius: 8, overflow: "hidden", textDecoration: "none", color: "inherit",
        background: fromMe ? "rgba(0,0,0,.06)" : "rgba(0,0,0,.04)", maxWidth: 360,
      }}
    >
      {card.image && (
        <img src={card.image} alt="" loading="lazy" referrerPolicy="no-referrer"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
          style={{ display: "block", width: "100%", maxHeight: 190, objectFit: "cover" }} />
      )}
      <div style={{ padding: "6px 10px 8px" }}>
        {card.title && <div style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.3, overflowWrap: "anywhere" }}>{card.title}</div>}
        {card.description && (
          <div style={{ fontSize: 12.5, opacity: 0.75, marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{card.description}</div>
        )}
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>{card.site}</div>
      </div>
    </a>
  );
};

export default LinkCard;
