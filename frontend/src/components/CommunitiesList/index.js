import React, { useState } from "react";
import { useHistory, useParams } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import Avatar from "@material-ui/core/Avatar";
import { toast } from "react-toastify";
import { ChevronDown, ChevronRight, Megaphone, Users } from "lucide-react";

import { wa } from "../chat/chatTheme";

const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  return {
    root: { flex: 1, minHeight: 0, overflowY: "auto", ...theme.scrollbarStyles, color: c.text },
    head: { display: "flex", alignItems: "center", gap: 12, width: "100%", border: 0, background: "transparent", color: "inherit", fontFamily: "inherit", textAlign: "left", cursor: "pointer", padding: "10px 14px", "&:hover": { backgroundColor: c.hover } },
    squareAvatar: { width: 44, height: 44, borderRadius: 12, backgroundColor: c.panelAlt, color: c.textSecondary },
    name: { flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    badge: { minWidth: 20, height: 20, borderRadius: 10, padding: "0 6px", backgroundColor: c.accent, color: "#fff", fontSize: 12, fontWeight: 700, display: "grid", placeItems: "center" },
    row: { display: "flex", alignItems: "center", gap: 12, width: "100%", border: 0, background: "transparent", color: "inherit", fontFamily: "inherit", textAlign: "left", cursor: "pointer", padding: "7px 14px 7px 40px", "&:hover": { backgroundColor: c.hover } },
    rowOn: { backgroundColor: c.hover },
    rowName: { fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    rowSub: { fontSize: 12.5, color: c.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    icon: { width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", flex: "none", backgroundColor: c.panelAlt, color: c.accent },
    empty: { padding: 28, textAlign: "center", color: c.textSecondary, fontSize: 14, lineHeight: 1.5 },
  };
});

// "Comunidades" like the list of WhatsApp Web: each community opens into its announcements group and the groups inside it.
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
            <button type="button" className={classes.head} onClick={() => setOpen((o) => ({ ...o, [c.id]: !isOpen }))} aria-expanded={isOpen}>
              <Avatar variant="rounded" src={c.profilePicUrl} className={classes.squareAvatar}><Users size={20} /></Avatar>
              <span className={classes.name}>{c.name}</span>
              {c.unread > 0 && <span className={classes.badge}>{c.unread > 99 ? "99+" : c.unread}</span>}
              {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
            {isOpen && rows.map((g) => (
              <button key={g.contactId} type="button" className={`${classes.row} ${String(g.ticketId) === String(ticketId) ? classes.rowOn : ""}`} onClick={() => go(g)}>
                {g.announcement ? (
                  <span className={classes.icon}><Megaphone size={18} /></span>
                ) : (
                  <Avatar src={g.profilePicUrl} style={{ width: 38, height: 38 }}><Users size={18} /></Avatar>
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div className={classes.rowName}>{g.announcement ? "Avisos" : g.name}</div>
                  {g.lastMessage && <div className={classes.rowSub}>{g.lastMessage}</div>}
                </span>
                {g.unread > 0 && <span className={classes.badge}>{g.unread > 99 ? "99+" : g.unread}</span>}
              </button>
            ))}
            {isOpen && rows.length === 0 && <div className={classes.rowSub} style={{ padding: "4px 14px 10px 40px" }}>Nenhum grupo desta comunidade apareceu ainda.</div>}
          </div>
        );
      })}
    </div>
  );
};

export default CommunitiesList;
