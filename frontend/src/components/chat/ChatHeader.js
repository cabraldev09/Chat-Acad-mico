import React, { useContext, useEffect, useState } from "react";
import { Pin, PinOff, Archive, ArchiveRestore, Bell, BellOff, Undo2, CheckCircle2, UserCheck, RotateCcw } from "lucide-react";
import { toast } from "react-toastify";
import { useHistory } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import Avatar from "@material-ui/core/Avatar";
import IconButton from "@material-ui/core/IconButton";
import Tooltip from "@material-ui/core/Tooltip";
import Menu from "@material-ui/core/Menu";
import MenuItem from "@material-ui/core/MenuItem";
import CircularProgress from "@material-ui/core/CircularProgress";
import ArrowBack from "@material-ui/icons/ArrowBack";
import Search from "@material-ui/icons/Search";
import MoreVert from "@material-ui/icons/MoreVert";
import Close from "@material-ui/icons/Close";
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
import { FOREVER, MUTE_CHOICES, getTicketMute, muteTicket, unmuteTicket } from "../../utils/muteStore";

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
    closeChat: { color: c.textSecondary, [theme.breakpoints.down("sm")]: { display: "none" } },
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
    btnLabel: { [theme.breakpoints.down("sm")]: { display: "none" } },
    primary: { backgroundColor: c.accent, borderColor: c.accent, color: "#fff", "&:hover": { backgroundColor: c.accent, filter: "brightness(1.08)" } },
    tag: { display: "inline-block", marginLeft: 6, padding: "0 7px", borderRadius: 999, fontSize: 11, color: "#fff" },
  };
});

const ChatHeader = ({ contact, ticket, onOpenInfo, onToggleSearch, typing }) => {
  const classes = useStyles();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [menuEl, setMenuEl] = useState(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [pinned, setPinned] = useState(!!ticket.pinned);
  const archived = !!ticket.archivedAt;
  useEffect(() => setPinned(!!ticket.pinned), [ticket.id, ticket.pinned]);

  const closeConversation = () => history.push("/tickets");

  const [muteEl, setMuteEl] = useState(null);
  const [mutedUntil, setMutedUntil] = useState(() => getTicketMute(ticket.id));
  useEffect(() => {
    const refresh = () => setMutedUntil(getTicketMute(ticket.id));
    refresh();
    window.addEventListener("ticketMuteChanged", refresh);
    return () => window.removeEventListener("ticketMuteChanged", refresh);
  }, [ticket.id]);
  const muted = mutedUntil > Date.now();
  const muteHint = !muted
    ? "Silenciar esta conversa"
    : mutedUntil === FOREVER
    ? "Silenciada até você reativar"
    : `Silenciada até ${new Date(mutedUntil).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`;

  // Esc leaves the conversation (like WhatsApp Web), unless a dialog, menu or picker is open
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector(".MuiDialog-root, .MuiPopover-root, .MuiMenu-root, .emoji-picker-react, em-emoji-picker")) return;
      closeConversation();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePin = async () => {
    try {
      const next = !pinned;
      await api.put(`/tickets/${ticket.id}/pin`, { pinned: next });
      setPinned(next);
      window.dispatchEvent(new CustomEvent("ticketPinned", { detail: { ticketId: ticket.id, pinned: next } }));
      toast.success(next ? "Conversa fixada no topo." : "Conversa desafixada.");
    } catch (err) {
      toastError(err);
    }
  };

  const toggleArchive = async () => {
    try {
      await api.put(`/tickets/${ticket.id}/archive`, { archived: !archived });
      toast.success(archived ? "Conversa desarquivada." : "Conversa arquivada. Ela volta sozinha se o contato escrever.");
      if (!archived) history.push("/tickets");
    } catch (err) {
      toastError(err);
    }
  };

  const setStatus = async (status, userId) => {
    setLoading(true);
    try {
      await api.put(`/tickets/${ticket.id}`, { status, userId: userId || null });
      toast.success(
        {
          open: ticket.status === "closed" ? "Atendimento reaberto. A conversa voltou para você." : "Você assumiu o atendimento.",
          pending: "Conversa devolvida à fila. Outro atendente pode assumir.",
          closed: "Atendimento finalizado. Se o contato escrever de novo, a conversa reabre.",
        }[status]
      );
      history.push(status === "open" ? `/tickets/${ticket.id}` : "/tickets");
    } catch (err) {
      toastError(err);
    }
    setLoading(false);
  };

  const button = (label, onClick, primary, icon, hint) => (
    <Tooltip title={hint || ""}>
      <span>
        <button type="button" className={`${classes.btn} ${primary ? classes.primary : ""}`} disabled={loading} onClick={onClick} aria-label={label}>
          {loading ? <CircularProgress size={13} color="inherit" /> : icon}
          <span className={classes.btnLabel}>{label}</span>
        </button>
      </span>
    </Tooltip>
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
          <span className={classes.sub}>
            {typing ? <span style={{ color: "#00a884", fontWeight: 500 }}>digitando…</span> : subtitle}
          </span>
        </div>
      </div>
      <div className={classes.actions}>
        {ticket.status === "pending" &&
          button("Aceitar atendimento", () => setStatus("open", user?.id), true, <UserCheck size={16} />, "Assumir esta conversa: ela passa a ser sua")}
        {ticket.status === "open" && (
          <>
            {button("Devolver à fila", () => setStatus("pending", null), false, <Undo2 size={16} />, "A conversa deixa de ser sua e volta para Aguardando, para outro atendente assumir")}
            {button("Finalizar atendimento", () => setStatus("closed", user?.id), true, <CheckCircle2 size={16} />, "Encerra a conversa. Se o contato escrever de novo, ela reabre")}
          </>
        )}
        {ticket.status === "closed" &&
          button("Reabrir atendimento", () => setStatus("open", user?.id), true, <RotateCcw size={16} />, "Traz a conversa de volta para você")}
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
            <Tooltip title={muteHint}>
              <IconButton className={classes.icon} onClick={(e) => setMuteEl(e.currentTarget)} aria-label="Silenciar conversa" style={muted ? { color: "#ed6c02" } : undefined}>
                {muted ? <BellOff size={20} /> : <Bell size={20} />}
              </IconButton>
            </Tooltip>
            <Menu anchorEl={muteEl} open={Boolean(muteEl)} onClose={() => setMuteEl(null)} getContentAnchorEl={null} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
              {MUTE_CHOICES.map((choice) => (
                <MenuItem
                  key={choice.label}
                  onClick={() => {
                    muteTicket(ticket.id, choice.until());
                    setMuteEl(null);
                    toast.success(`Conversa silenciada: ${choice.label.toLowerCase()}.`);
                  }}
                >
                  Silenciar {choice.label.startsWith("Até") ? choice.label.toLowerCase() : `por ${choice.label}`}
                </MenuItem>
              ))}
              {muted && (
                <MenuItem
                  onClick={() => {
                    unmuteTicket(ticket.id);
                    setMuteEl(null);
                    toast.success("Notificações desta conversa reativadas.");
                  }}
                >
                  Reativar notificações
                </MenuItem>
              )}
            </Menu>
            <Tooltip title={pinned ? "Desafixar conversa" : "Fixar conversa no topo"}>
              <IconButton className={classes.icon} onClick={togglePin} aria-label={pinned ? "Desafixar conversa" : "Fixar conversa"}>
                {pinned ? <PinOff size={20} /> : <Pin size={20} />}
              </IconButton>
            </Tooltip>
            <Tooltip title={archived ? "Desarquivar conversa" : "Arquivar conversa"}>
              <IconButton className={classes.icon} onClick={toggleArchive} aria-label={archived ? "Desarquivar conversa" : "Arquivar conversa"}>
                {archived ? <ArchiveRestore size={20} /> : <Archive size={20} />}
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
        <Tooltip title="Fechar conversa (Esc)">
          <IconButton className={classes.closeChat} onClick={closeConversation} aria-label="Fechar conversa">
            <Close />
          </IconButton>
        </Tooltip>
      </div>
    </div>
  );
};

export default ChatHeader;
