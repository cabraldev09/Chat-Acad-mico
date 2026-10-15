import React, { useState } from "react";
import { useHistory, useParams } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import Avatar from "@material-ui/core/Avatar";
import { toast } from "react-toastify";
import { ChevronDown, ChevronRight, Megaphone, Users } from "lucide-react";

import { wa } from "../chat/chatTheme";
import { stamp } from "../TicketListItem";

const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  return {
    root: { flex: 1, minHeight: 0, overflowY: "auto", ...theme.scrollbarStyles, color: c.text },
    // one row for everything: photo, name and time on top, the last message and the unread count under it (as in WhatsApp)
    item: { display: "flex", alignItems: "center", gap: 14, width: "100%", border: 0, background: "transparent", color: "inherit", fontFamily: "inherit", textAlign: "left", cursor: "pointer", padding: "9px 14px", "&:hover": { backgroundColor: c.hover } },
    itemOn: { backgroundColor: c.hover },
    sub: { paddingLeft: 34 },
    squareAvatar: { width: 49, height: 49, borderRadius: 14, backgroundColor: c.panelAlt, color: c.textSecondary, flex: "none" },
    avatar: { width: 49, height: 49, backgroundColor: c.panelAlt, color: c.textSecondary, flex: "none" },
    body: { flex: 1, minWidth: 0, display: "grid", gap: 2 },
    top: { display: "flex", alignItems: "baseline", gap: 8 },
    name: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    time: { fontSize: 12, color: c.textSecondary, flex: "none" },
    timeNew: { color: c.accent, fontWeight: 600 },
    bottom: { display: "flex", alignItems: "center", gap: 8, minHeight: 22 },
    preview: { flex: 1, minWidth: 0, fontSize: 14, color: c.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    badge: { minWidth: 20, height: 20, borderRadius: 10, padding: "0 6px", backgroundColor: c.accent, color: "#fff", fontSize: 12, fontWeight: 700, display: "grid", placeItems: "center", flex: "none" },
    icon: { width: 49, height: 49, borderRadius: "50%", display: "grid", placeItems: "center", flex: "none", backgroundColor: c.panelAlt, color: c.accent },
    empty: { padding: 28, textAlign: "center", color: c.textSecondary, fontSize: 14, lineHeight: 1.5 },
    note: { padding: "4px 14px 12px 82px", fontSize: 13, color: c.textSecondary },
  };
});

const Row = ({ classes, avatar, name, time, preview, unread, active, sub, onClick, trailing, expanded }) => (
  <button type="button" className={`${classes.item} ${sub ? classes.sub : ""} ${active ? classes.itemOn : ""}`} onClick={onClick} aria-expanded={expanded}>
    {avatar}
    <span className={classes.body}>
      <span className={classes.top}>
        <span className={classes.name}>{name}</span>
        {time && <span className={`${classes.time} ${unread > 0 ? classes.timeNew : ""}`}>{time}</span>}
      </span>
      <span className={classes.bottom}>
        <span className={classes.preview}>{preview}</span>
        {unread > 0 && <span className={classes.badge}>{unread > 99 ? "99+" : unread}</span>}
        {trailing}
      </span>
    </span>
  </button>
);

// "Comunidades" like the list of WhatsApp Web: the most recent first, each one opens into its announcements group and the
// groups inside it, each with its photo, last message, time and unread count.
const CommunitiesList = ({ communities }) => {
  const classes = useStyles();
  const history = useHistory();
  const { ticketId } = useParams();
  const [open, setOpen] = useState({});

  if (!communities) return <div className={classes.empty}>Carregando...</div>;
  if (communities.length === 0) {
    return (
      <div className={classes.empty}>
        Nenhuma comunidade ainda.<br />
        As comunidades dos números conectados aparecem aqui sozinhas, alguns minutos depois da conexão.
      </div>
    );
  }

  const go = (g) => {
    if (g.ticketId) history.push(`/tickets/${g.ticketId}`);
    else toast.info("Este grupo ainda não tem mensagens. Ele abre aqui quando alguém escrever.");
  };

  return (
    <div className={classes.root}>
      {communities.map((c) => {
        const isOpen = open[c.id] !== false && (open[c.id] || communities.length === 1);
        const rows = [c.announcement ? { ...c.announcement, announcement: true } : null, ...c.groups].filter(Boolean);
        return (
          <div key={c.id}>
            <Row
              classes={classes}
              expanded={isOpen}
              avatar={<Avatar variant="rounded" src={c.profilePicUrl} className={classes.squareAvatar}><Users size={22} /></Avatar>}
              name={c.name}
              time={c.lastMessageAt ? stamp(c.lastMessageAt) : ""}
              preview={c.lastMessage ? `${c.lastGroup ? `${c.lastGroup}: ` : ""}${c.lastMessage}` : "Toque para ver os grupos"}
              unread={c.unread}
              onClick={() => setOpen((o) => ({ ...o, [c.id]: !isOpen }))}
              trailing={isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            />
            {isOpen && rows.map((g) => (
              <Row
                key={g.contactId}
                classes={classes}
                sub
                active={String(g.ticketId) === String(ticketId)}
                avatar={g.announcement
                  ? <span className={classes.icon}><Megaphone size={20} /></span>
                  : <Avatar src={g.profilePicUrl} className={classes.avatar}><Users size={22} /></Avatar>}
                name={g.announcement ? "Avisos" : g.name}
                time={g.lastMessageAt ? stamp(g.lastMessageAt) : ""}
                preview={g.lastMessage || (g.announcement ? "Avisos da comunidade" : "Sem mensagens ainda")}
                unread={g.unread}
                onClick={() => go(g)}
              />
            ))}
            {isOpen && rows.length === 0 && <div className={classes.note}>Nenhum grupo desta comunidade apareceu ainda.</div>}
          </div>
        );
      })}
    </div>
  );
};

export default CommunitiesList;
