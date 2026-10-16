import React, { useContext, useEffect, useRef, useState } from "react";
import { Pin, PinOff, Archive, ArchiveRestore, Bell, BellOff, BellRing, Check, Undo2, CheckCircle2, UserCheck, RotateCcw } from "lucide-react";
import { toast } from "react-toastify";
import { useHistory } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import Avatar from "@material-ui/core/Avatar";
import IconButton from "@material-ui/core/IconButton";
import Tooltip from "@material-ui/core/Tooltip";
import Menu from "@material-ui/core/Menu";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import MoreHoriz from "@material-ui/icons/MoreHoriz";
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
import { SOUND_CHOICES, getContactSound, setContactSound, getSoundMode, onSoundPrefsChange } from "../../utils/soundPrefs";

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
    who: { flex: 1, minWidth: 120, display: "flex", alignItems: "center", gap: theme.spacing(1.5), cursor: "pointer" },
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

const ChatHeader = ({ contact: contactProp, ticket, onOpenInfo, onToggleSearch, typing }) => {
  const contact = contactProp || {};
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

  // the panel (not the window) decides how much room the buttons get: full labels, short labels, or icons only
  const barRef = useRef(null);
  const [barWidth, setBarWidth] = useState(1200);
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver((entries) => setBarWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const labelMode = barWidth >= 1050 ? "full" : barWidth >= 760 ? "short" : "none";
  const compact = barWidth < 1050;
  const [moreEl, setMoreEl] = useState(null);

  const [soundEl, setSoundEl] = useState(null);
  const [soundPref, setSoundPref] = useState("default");
  const [soundMode, setSoundMode] = useState("all");
  useEffect(() => {
    const refresh = () => {
      setSoundPref(getContactSound(ticket.contact?.id || contact.id));
      setSoundMode(getSoundMode());
    };
    refresh();
    return onSoundPrefsChange(refresh);
  }, [ticket.contact?.id, contact.id]);
  const soundIcon = soundPref === "alert" ? <BellRing size={20} /> : soundPref === "mute" ? <BellOff size={20} /> : <Bell size={20} />;
  const soundHint =
    soundPref === "alert"
      ? "Contato de alerta: sempre toca o som"
      : soundPref === "mute"
      ? "Contato silenciado: nunca toca o som"
      : soundMode === "all"
      ? "Som desta conversa: segue o padrão (toca)"
      : "Som desta conversa: segue o padrão (silêncio). Marque como alerta para tocar";

  // Esc leaves the conversation (like WhatsApp Web), unless a dialog, menu or picker is open
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // only what is really open blocks it: closed menus can stay in the page (hidden), they must not take Esc away
      const open = Array.from(document.querySelectorAll("[data-quick-list], .MuiDialog-root, .MuiPopover-root, .MuiMenu-root, .emoji-mart, .emoji-picker-react, em-emoji-picker, [role='dialog']")).some(
        (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"
      );
      if (open) return;
      // what was typed stays as a draft, so leaving is safe
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
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
      // the person already has another open conversation: take the user there instead of an error
      const openId = err && err.response && err.response.data && err.response.data.data && err.response.data.data.ticketId;
      if (err && err.response && err.response.data && err.response.data.error === "ERR_OTHER_OPEN_TICKET" && openId) {
        toast.info("Esta pessoa já tem uma conversa aberta. Abri ela para você.");
        history.push(`/tickets/${openId}`);
      } else {
        toastError(err);
      }
    }
    setLoading(false);
  };

  // team members' chats work like groups: no queue, so no accept / give back / finish buttons
  const plain = !!ticket.isGroup || !!contact.isStaff;
  const SHORT = { "Aceitar atendimento": "Aceitar", "Devolver à fila": "Devolver", "Finalizar atendimento": "Finalizar", "Reabrir atendimento": "Reabrir" };
  const button = (label, onClick, primary, icon, hint) => (
    <Tooltip title={hint || ""}>
      <span>
        <button type="button" className={`${classes.btn} ${primary ? classes.primary : ""}`} disabled={loading} onClick={onClick} aria-label={label}>
          {loading ? <CircularProgress size={13} color="inherit" /> : icon}
          {labelMode !== "none" && <span>{labelMode === "full" ? label : SHORT[label] || label}</span>}
        </button>
      </span>
    </Tooltip>
  );

  const subtitle = [
    ticket.isHistorical ? "Histórico" : null,
    ticket.isGroup ? "Grupo" : contact.number && !String(contact.number).includes("_") ? `+${contact.number}` : null,
    ticket.queue?.name,
    ticket.user ? `Atendente: ${ticket.user.name}` : ticket.status === "pending" ? "Aguardando atendimento" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={classes.bar} ref={barRef}>
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
        {ticket.status === "pending" && !plain &&
          button("Aceitar atendimento", () => setStatus("open", user?.id), true, <UserCheck size={16} />, "Assumir esta conversa: ela passa a ser sua")}
        {ticket.status === "open" && !plain && (
          <>
            {button("Devolver à fila", () => setStatus("pending", null), false, <Undo2 size={16} />, "A conversa deixa de ser sua e volta para Aguardando, para outro atendente assumir")}
            {button("Finalizar atendimento", () => setStatus("closed", user?.id), true, <CheckCircle2 size={16} />, "Encerra a conversa. Se o contato escrever de novo, ela reabre")}
          </>
        )}
        {ticket.status === "closed" && !plain &&
          button("Reabrir atendimento", () => setStatus("open", user?.id), true, <RotateCcw size={16} />, "Traz a conversa de volta para você")}
        <Tooltip title="Pesquisar na conversa">
          <IconButton className={classes.icon} onClick={onToggleSearch}>
            <Search />
          </IconButton>
        </Tooltip>
        {ticket.id && (
          <>
            {!compact && (
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
              </>
            )}
            {!compact && (
            <Tooltip title={soundHint}>
              <IconButton
                className={classes.icon}
                onClick={(e) => setSoundEl(e.currentTarget)}
                aria-label="Som desta conversa"
                style={soundPref === "alert" ? { color: "#c9a800" } : soundPref === "mute" ? { color: "#ed6c02" } : undefined}
              >
                {soundIcon}
              </IconButton>
            </Tooltip>
            )}
            <Menu anchorEl={soundEl} open={Boolean(soundEl)} onClose={() => setSoundEl(null)} getContentAnchorEl={null} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
              {SOUND_CHOICES.map((choice) => (
                <MenuItem
                  key={choice.value}
                  selected={soundPref === choice.value}
                  onClick={() => {
                    setContactSound(ticket.contact?.id || contact.id, choice.value);
                    setSoundEl(null);
                    toast.success(
                      {
                        default: "Este contato volta a seguir o som padrão do sistema.",
                        alert: "Contato de alerta: o som sempre toca para ele.",
                        mute: "Contato silenciado: o som não toca para ele.",
                      }[choice.value]
                    );
                  }}
                  style={{ alignItems: "flex-start", whiteSpace: "normal", maxWidth: 320 }}
                >
                  <span style={{ width: 22, flex: "none", paddingTop: 2 }}>{soundPref === choice.value && <Check size={16} />}</span>
                  <span>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{choice.label}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{choice.hint}</div>
                  </span>
                </MenuItem>
              ))}
            </Menu>
            {!compact && (
              <>
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
              </>
            )}
            {compact && (
              <>
                <Tooltip title="Mais ações da conversa">
                  <IconButton className={classes.icon} onClick={(e) => setMoreEl(e.currentTarget)} aria-label="Mais ações da conversa">
                    <MoreHoriz />
                  </IconButton>
                </Tooltip>
                <Menu anchorEl={moreEl} open={Boolean(moreEl)} onClose={() => setMoreEl(null)} getContentAnchorEl={null} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
                  <MenuItem onClick={() => { setMoreEl(null); setTagsOpen(true); }}>
                    <ListItemIcon style={{ minWidth: 36 }}><LocalOfferOutlined fontSize="small" /></ListItemIcon>Etiquetas
                  </MenuItem>
                  <MenuItem onClick={() => { setMoreEl(null); setScheduleOpen(true); }}>
                    <ListItemIcon style={{ minWidth: 36 }}><ScheduleIcon fontSize="small" /></ListItemIcon>Agendar mensagem
                  </MenuItem>
                  <MenuItem onClick={() => { const anchor = moreEl; setMoreEl(null); setSoundEl(anchor); }}>
                    <ListItemIcon style={{ minWidth: 36 }}>{soundIcon}</ListItemIcon>Som desta conversa
                  </MenuItem>
                  <MenuItem onClick={() => { setMoreEl(null); togglePin(); }}>
                    <ListItemIcon style={{ minWidth: 36 }}>{pinned ? <PinOff size={20} /> : <Pin size={20} />}</ListItemIcon>{pinned ? "Desafixar conversa" : "Fixar conversa no topo"}
                  </MenuItem>
                  <MenuItem onClick={() => { setMoreEl(null); toggleArchive(); }}>
                    <ListItemIcon style={{ minWidth: 36 }}>{archived ? <ArchiveRestore size={20} /> : <Archive size={20} />}</ListItemIcon>{archived ? "Desarquivar conversa" : "Arquivar conversa"}
                  </MenuItem>
                </Menu>
              </>
            )}
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
