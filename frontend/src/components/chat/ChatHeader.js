import React, { useContext, useState } from "react";
import { useHistory } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import Avatar from "@material-ui/core/Avatar";
import IconButton from "@material-ui/core/IconButton";
import Tooltip from "@material-ui/core/Tooltip";
import CircularProgress from "@material-ui/core/CircularProgress";
import ArrowBack from "@material-ui/icons/ArrowBack";
import Search from "@material-ui/icons/Search";
import MoreVert from "@material-ui/icons/MoreVert";
import LocalOfferOutlined from "@material-ui/icons/LocalOfferOutlined";
import ScheduleIcon from "@material-ui/icons/Schedule";

import ChannelIcon from "../ChannelIcon";
import TicketOptionsMenu from "../TicketOptionsMenu";
import TicketTagsDialog from "../TicketTagsDialog";
import ScheduleMessageDialog from "../ScheduleMessageDialog";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { wa } from "./chatTheme";

const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  return {
    bar: {
      flex: "none",
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      minHeight: 60,
      padding: theme.spacing(0.75, 1.5),
      backgroundColor: c.header,
      borderBottom: `1px solid ${c.divider}`,
    },
    back: { color: c.textSecondary, [theme.breakpoints.up("md")]: { display: "none" } },
    who: { flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: theme.spacing(1.5), cursor: "pointer" },
    avatar: { width: 40, height: 40 },
    names: { minWidth: 0, display: "flex", flexDirection: "column" },
    name: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 16,
      fontWeight: 500,
      color: c.text,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    sub: {
      fontSize: 13,
      color: c.textSecondary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    actions: { flex: "none", display: "flex", alignItems: "center", gap: 2 },
    icon: { color: c.textSecondary },
    btn: {
      height: 34,
      padding: "0 14px",
      marginLeft: 6,
      borderRadius: 999,
      border: `1px solid ${c.divider}`,
      cursor: "pointer",
      fontFamily: "inherit",
      fontSize: 13,
      fontWeight: 600,
      color: c.text,
      backgroundColor: c.panel,
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      "&:hover": { backgroundColor: c.hover },
      "&:disabled": { opacity: 0.6, cursor: "default" },
      [theme.breakpoints.down("xs")]: { padding: "0 10px" },
    },
    primary: { backgroundColor: c.accent, borderColor: c.accent, color: "#fff", "&:hover": { backgroundColor: c.accent, filter: "brightness(1.08)" } },
    tag: { display: "inline-block", marginLeft: 6, padding: "0 7px", borderRadius: 999, fontSize: 11, color: "#fff" },
  };
});

const ChatHeader = ({ contact, ticket, onOpenInfo, onToggleSearch }) => {
  const classes = useStyles();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [menuEl, setMenuEl] = useState(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const setStatus = async (status, userId) => {
    setLoading(true);
    try {
      await api.put(`/tickets/${ticket.id}`, { status, userId: userId || null });
      history.push(status === "open" ? `/tickets/${ticket.id}` : "/tickets");
    } catch (err) {
      toastError(err);
    }
    setLoading(false);
  };

  const button = (label, onClick, primary) => (
    <button type="button" className={`${classes.btn} ${primary ? classes.primary : ""}`} disabled={loading} onClick={onClick}>
      {loading && <CircularProgress size={13} color="inherit" />}
      {label}
    </button>
  );

  const subtitle = [
    ticket.isGroup ? "Grupo" : contact.number && !String(contact.number).includes("_") ? `+${contact.number}` : null,
    ticket.queue?.name,
    ticket.user ? `Atendente: ${ticket.user.name}` : ticket.status === "pending" ? "Aguardando atendimento" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={classes.bar}>
      <IconButton className={classes.back} onClick={() => history.push("/tickets")}>
        <ArrowBack />
      </IconButton>
      <div className={classes.who} onClick={onOpenInfo} role="button" tabIndex={0}>
        <Avatar className={classes.avatar} src={contact.profilePicUrl}>
          {contact.name?.charAt(0)}
        </Avatar>
        <div className={classes.names}>
          <span className={classes.name}>
            <ChannelIcon channel={ticket.whatsapp?.channel} size={15} />
            {contact.name}
            {(ticket.tags || []).slice(0, 3).map((t) => (
              <span key={t.id} className={classes.tag} style={{ backgroundColor: t.color }}>
                {t.name}
              </span>
            ))}
          </span>
          <span className={classes.sub}>{subtitle}</span>
        </div>
      </div>
      <div className={classes.actions}>
        {ticket.status === "pending" && button("Aceitar", () => setStatus("open", user?.id), true)}
        {ticket.status === "open" && (
          <>
            {button("Devolver", () => setStatus("pending", null))}
            {button("Resolver", () => setStatus("closed", user?.id), true)}
          </>
        )}
        {ticket.status === "closed" && button("Reabrir", () => setStatus("open", user?.id), true)}
        <Tooltip title="Pesquisar na conversa">
          <IconButton className={classes.icon} onClick={onToggleSearch}>
            <Search />
          </IconButton>
        </Tooltip>
        {ticket.id && (
          <>
            <Tooltip title="Etiquetas">
              <IconButton className={classes.icon} onClick={() => setTagsOpen(true)}>
                <LocalOfferOutlined />
              </IconButton>
            </Tooltip>
            <Tooltip title="Agendar mensagem">
              <IconButton className={classes.icon} onClick={() => setScheduleOpen(true)}>
                <ScheduleIcon />
              </IconButton>
            </Tooltip>
            <TicketTagsDialog open={tagsOpen} onClose={() => setTagsOpen(false)} ticket={ticket} />
            <ScheduleMessageDialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} ticket={ticket} />
          </>
        )}
        {ticket.status === "open" && (
          <>
            <IconButton className={classes.icon} onClick={(e) => setMenuEl(e.currentTarget)}>
              <MoreVert />
            </IconButton>
            <TicketOptionsMenu ticket={ticket} anchorEl={menuEl} menuOpen={Boolean(menuEl)} handleClose={() => setMenuEl(null)} />
          </>
        )}
      </div>
    </div>
  );
};

export default ChatHeader;
