import React, { useContext, useEffect, useRef, useState } from "react";
import { Pin, PinOff, Archive, ArchiveRestore, Bell, BellOff, BellRing, Check, Undo2, CheckCircle2, UserCheck, RotateCcw, Bot, Search, Tag, MoreVertical, CalendarClock, Shuffle, Repeat2, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { useHistory } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import Avatar from "@material-ui/core/Avatar";
import { colorOf, initialsOf } from "../../utils/avatar";
import IconButton from "@material-ui/core/IconButton";
import Tooltip from "@material-ui/core/Tooltip";
import Menu from "@material-ui/core/Menu";
import MenuItem from "@material-ui/core/MenuItem";
import ListSubheader from "@material-ui/core/ListSubheader";
import Divider from "@material-ui/core/Divider";
import CircularProgress from "@material-ui/core/CircularProgress";
import ArrowBack from "@material-ui/icons/ArrowBack";
import Close from "@material-ui/icons/Close";

import ChannelIcon from "../ChannelIcon";
import TransferTicketModal from "../TransferTicketModal";
import ConfirmationModal from "../ConfirmationModal";
import { can as canDo } from "../Can";
import { accessLevel } from "../../utils/access";
import TicketTagsDialog from "../TicketTagsDialog";
import ScheduleMessageDialog from "../ScheduleMessageDialog";
import { isManager } from "../../utils/access";
import { prettyNumber } from "../ContactDrawer";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { wa } from "./chatTheme";
import { typingText } from "../../utils/typingStore";
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
    count: { position: "absolute", top: 4, right: 2, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, lineHeight: "16px", background: c.accent, color: "#fff" },
    menu: { minWidth: 280, maxWidth: "calc(100vw - 24px)", borderRadius: 14, border: `1px solid ${c.divider}`, boxShadow: "0 12px 32px rgba(0,0,0,.24)", "& .MuiList-padding": { padding: "6px 0" } },
    menuHead: { lineHeight: "28px", padding: "6px 16px 0", fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: c.textSecondary, background: "transparent" },
    menuItem: { gap: 12, alignItems: "flex-start", padding: "8px 16px", whiteSpace: "normal", minHeight: 44 },
    menuIcon: { width: 20, flex: "none", display: "grid", placeItems: "center", paddingTop: 1, color: c.textSecondary },
    menuText: { display: "flex", flexDirection: "column", minWidth: 0 },
    menuLabel: { fontSize: 14, fontWeight: 500, color: c.text },
    menuHint: { fontSize: 12, color: c.textSecondary, marginTop: 1 },
    danger: { "& $menuLabel, & $menuIcon": { color: theme.palette.error.main } },
    menuDivider: { margin: "6px 0" },
  };
});

const ChatHeader = ({ contact: contactProp, ticket, onOpenInfo, onToggleSearch, typing }) => {
  const contact = contactProp || {};
  const classes = useStyles();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
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
  const compact = barWidth < 760;
  const [moreEl, setMoreEl] = useState(null);
  const moreRef = useRef(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // "Chamar a tutoria / o consultor" lives in this menu; the bar under the header only says what it needs to (the call received, the 24 hours)
  const [teamCall, setTeamCall] = useState(null);
  useEffect(() => {
    setTeamCall(null);
    const on = (e) => { if (e.detail && Number(e.detail.ticketId) === Number(ticket.id)) setTeamCall(e.detail.canCall || null); };
    window.addEventListener("teamHandoffInfo", on);
    return () => window.removeEventListener("teamHandoffInfo", on);
  }, [ticket.id]);
  const can = (action) => canDo(accessLevel(user), action);
  const menuItem = (icon, label, onClick, hint, danger) => (
    <MenuItem key={label} className={`${classes.menuItem} ${danger ? classes.danger : ""}`} onClick={() => { setMoreEl(null); onClick(); }}>
      <span className={classes.menuIcon}>{icon}</span>
      <span className={classes.menuText}>
        <span className={classes.menuLabel}>{label}</span>
        {hint && <span className={classes.menuHint}>{hint}</span>}
      </span>
    </MenuItem>
  );
  const deleteTicket = async () => {
    try {
      await api.delete(`/tickets/${ticket.id}`);
      history.push("/tickets");
    } catch (err) {
      toastError(err);
    }
  };

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
  const soundIcon = soundPref === "alert" ? <BellRing size={18} /> : soundPref === "mute" ? <BellOff size={18} /> : <Bell size={18} />;
  const SOUND_LABEL = {
    alert: "Contato de alerta: sempre toca",
    mute: "Silenciado: nunca toca",
    default: soundMode === "all" ? "Segue o padrão: toca" : "Segue o padrão: em silêncio",
  };

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

  // archiving leaves the conversation; the notice offers to undo it right there (the conversation also comes back if the contact writes)
  const setArchived = async (next, id = ticket.id) => {
    try {
      await api.put(`/tickets/${id}/archive`, { archived: next });
      return true;
    } catch (err) {
      toastError(err);
      return false;
    }
  };
  const toggleArchive = async () => {
    const id = ticket.id;
    if (!(await setArchived(!archived, id))) return;
    if (archived) {
      toast.success("Conversa desarquivada. Ela voltou para a lista.");
      return;
    }
    history.push("/tickets");
    toast.success(
      ({ closeToast }) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>Conversa arquivada. Ela volta sozinha se o contato escrever.</span>
          <button
            type="button"
            style={{ border: 0, background: "transparent", color: "inherit", fontWeight: 700, textDecoration: "underline", cursor: "pointer", font: "inherit", padding: 0 }}
            onClick={async () => {
              closeToast && closeToast();
              if (await setArchived(false, id)) {
                toast.success("Arquivamento desfeito.");
                history.push(`/tickets/${id}`);
              }
            }}
          >
            Desfazer
          </button>
        </span>
      ),
      { autoClose: 7000 }
    );
  };

  // the management takes a conversation from its attendant on purpose (it is registered who took it from whom)
  const takeOver = async () => {
    if (!window.confirm(`Assumir esta conversa de ${ticket.user?.name || "outro atendente"}? Ela passa a ser sua e ${ticket.user?.name || "o atendente"} deixa de responder.`)) return;
    setLoading(true);
    try {
      await api.post(`/tickets/${ticket.id}/take`);
      toast.success("Você assumiu a conversa.");
    } catch (err) {
      toastError(err);
    }
    setLoading(false);
  };

  const setStatus = async (status, userId) => {
    setLoading(true);
    try {
      // taking the conversation is a claim decided by the server (it refuses when someone else already has it); the rest is a plain update
      if (status === "open" && userId) await api.post(`/tickets/${ticket.id}/claim`);
      else await api.put(`/tickets/${ticket.id}`, { status, userId: userId || null });
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

  // hand the conversation to the AI agent (it answers the last message now) or take it back from it
  const setAi = async (active) => {
    setLoading(true);
    try {
      const { data } = await api.post(`/tickets/${ticket.id}/ai`, { active });
      // the consultant stays in the conversation and follows the AI; when it finishes qualifying, the lead comes back to them
      toast.success(!active ? "Você assumiu de novo: a IA parou de responder." : data && data.answeredNow ? "A IA está qualificando o lead e já vai responder. Quando terminar, a conversa volta para você." : "A IA está qualificando o lead: responde a próxima mensagem. Quando terminar, a conversa volta para você.");
    } catch (err) {
      toastError(err);
    }
    setLoading(false);
  };

  // team members' chats work like groups: no queue, so no accept / give back / finish buttons
  const plain = !!ticket.isGroup || !!contact.isStaff;
  // the tutoring talks to enrolled students: no "qualify the lead" there
  const tutoring = ["onboarding", "support"].includes(String(ticket.segment || ""));
  const SHORT = { "IA qualificar o lead": "IA qualificar", "Aceitar atendimento": "Aceitar", "Devolver à fila": "Devolver", "Finalizar atendimento": "Finalizar", "Reabrir atendimento": "Reabrir" };
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

  // a contact with no saved name shows the number as its name: the line below does not repeat it
  const numberLine = c => {
    const number = String(c.number || "");
    if (!number || number.includes("_")) return null;
    const nameDigits = String(c.name || "").replace(/\D/g, "");
    if (!c.name || nameDigits === number || nameDigits === number.replace(/^55/, "")) return "Contato não salvo";
    return prettyNumber(number);
  };
  const subtitle = [
    ticket.isHistorical ? "Histórico" : null,
    ticket.isGroup ? "Grupo" : numberLine(contact),
    ticket.queue?.name,
    ticket.user ? `Atendente: ${ticket.user.name}` : ticket.status === "pending" ? (ticket.aiActive ? "IA qualificando o lead" : "Aguardando atendimento") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={classes.bar} ref={barRef}>
      <IconButton aria-label="Voltar" className={classes.back} onClick={() => history.push("/tickets")}>
        <ArrowBack />
      </IconButton>
      <div className={classes.who} onClick={onOpenInfo} role="button" tabIndex={0} aria-label={`Dados de ${contact.name || "contato"}`}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenInfo && onOpenInfo(); } }}>
        <Avatar className={classes.avatar} src={contact.profilePicUrl} style={contact.profilePicUrl ? undefined : { background: colorOf(contact.number || contact.name), color: "#fff", fontWeight: 700 }}>
          {initialsOf(contact.name)}
        </Avatar>
        <div className={classes.names}>
          <span className={classes.name}>
            <ChannelIcon channel={ticket.whatsapp?.channel} size={15} />
            {contact.name}
          </span>
          <span className={classes.sub}>
            {typing ? <span style={{ color: "#00a884", fontWeight: 500 }}>{typing.from === "agent" && <Bot size={13} style={{ verticalAlign: -2, marginRight: 4 }} />}{typingText(typing)}</span> : subtitle}
          </span>
        </div>
      </div>
      <div className={classes.actions}>
        {ticket.status === "pending" && !plain &&
          button("Aceitar atendimento", () => setStatus("open", user?.id), true, <UserCheck size={16} />, "Assumir esta conversa: ela passa a ser sua")}
        {ticket.status === "pending" && !plain && !tutoring && !ticket.aiActive &&
          button("IA qualificar o lead", () => setAi(true), false, <Bot size={16} />, "A IA continua a qualificação de onde o lead está e devolve a conversa para você no fim")}
        {ticket.status === "open" && !plain && ticket.userId && ticket.userId !== user?.id && isManager(user) &&
          button("Assumir conversa", takeOver, true, <UserCheck size={16} />, `Tira a conversa de ${ticket.user?.name || "outro atendente"}: ela passa a ser sua`)}
        {ticket.status === "open" && !plain && (
          <>
            {!tutoring && button("IA qualificar o lead", () => setAi(true), false, <Bot size={16} />, "A IA continua a qualificação de onde o lead está e devolve a conversa para você no fim")}
            {button("Devolver à fila", () => setStatus("pending", null), false, <Undo2 size={16} />, "A conversa deixa de ser sua e volta para Aguardando, para outro atendente assumir")}
            {button("Finalizar atendimento", () => setStatus("closed", user?.id), true, <CheckCircle2 size={16} />, "Encerra a conversa. Se o contato escrever de novo, ela reabre")}
          </>
        )}
        {ticket.status === "closed" && !plain &&
          button("Reabrir atendimento", () => setStatus("open", user?.id), true, <RotateCcw size={16} />, "Traz a conversa de volta para você")}
        <Tooltip title="Pesquisar na conversa">
          <IconButton className={classes.icon} aria-label="Buscar na conversa" onClick={onToggleSearch}>
            <Search size={20} />
          </IconButton>
        </Tooltip>
        {ticket.id && !compact && (
          <Tooltip title={(ticket.tags || []).length ? `Etiquetas: ${ticket.tags.map((t) => t.name).join(", ")}` : "Etiquetas"}>
            <IconButton className={classes.icon} aria-label="Etiquetas" onClick={() => setTagsOpen(true)} style={{ position: "relative" }}>
              <Tag size={20} />
              {(ticket.tags || []).length > 0 && <span className={classes.count}>{ticket.tags.length}</span>}
            </IconButton>
          </Tooltip>
        )}
        {ticket.id && (
          <>
            <Tooltip title="Mais ações">
              <IconButton ref={moreRef} className={classes.icon} onClick={(e) => setMoreEl(e.currentTarget)} aria-label="Mais ações da conversa" aria-haspopup="menu" aria-expanded={Boolean(moreEl)}>
                <MoreVertical size={20} />
              </IconButton>
            </Tooltip>
            <Menu anchorEl={moreEl} open={Boolean(moreEl)} onClose={() => setMoreEl(null)} getContentAnchorEl={null} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }} PaperProps={{ className: classes.menu }}>
              <ListSubheader disableSticky className={classes.menuHead}>Organizar</ListSubheader>
              {compact && menuItem(<Tag size={18} />, "Etiquetas", () => setTagsOpen(true), (ticket.tags || []).length ? `${ticket.tags.length} na conversa` : "Marque o assunto da conversa")}
              {menuItem(pinned ? <PinOff size={18} /> : <Pin size={18} />, pinned ? "Desafixar" : "Fixar no topo", togglePin, pinned ? "Volta para a ordem normal da lista" : "Fica sempre no começo da lista")}
              {menuItem(archived ? <ArchiveRestore size={18} /> : <Archive size={18} />, archived ? "Desarquivar" : "Arquivar", toggleArchive, archived ? "Volta para a lista de conversas" : "Sai da lista e volta se o contato escrever")}
              <ListSubheader disableSticky className={classes.menuHead}>Mensagens e avisos</ListSubheader>
              {menuItem(<CalendarClock size={18} />, "Agendar mensagem", () => setScheduleOpen(true), "Envia sozinha no dia e na hora que você escolher")}
              {menuItem(soundIcon, "Som desta conversa", () => setSoundEl(moreRef.current), SOUND_LABEL[soundPref])}
              {(teamCall || ticket.status === "open") && <ListSubheader disableSticky className={classes.menuHead}>Encaminhar</ListSubheader>}
              {teamCall && menuItem(<Shuffle size={18} />, teamCall === "tutoria" ? "Chamar a tutoria" : "Chamar o consultor", () => window.dispatchEvent(new CustomEvent("teamHandoffOpen", { detail: { ticketId: ticket.id } })), "O outro lado recebe um resumo e o seu recado")}
              {ticket.status === "open" && menuItem(<Repeat2 size={18} />, "Transferir", () => setTransferOpen(true), "Passa a conversa para outra pessoa ou fila")}
              {ticket.status === "open" && can("ticket-options:deleteTicket") && <Divider className={classes.menuDivider} />}
              {ticket.status === "open" && can("ticket-options:deleteTicket") && menuItem(<Trash2 size={18} />, "Excluir conversa", () => setDeleteOpen(true), "Apaga as mensagens desta conversa", true)}
            </Menu>
            <Menu anchorEl={soundEl} open={Boolean(soundEl)} onClose={() => setSoundEl(null)} getContentAnchorEl={null} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }} PaperProps={{ className: classes.menu }}>
              <ListSubheader disableSticky className={classes.menuHead}>Som desta conversa</ListSubheader>
              {SOUND_CHOICES.map((choice) => (
                <MenuItem
                  key={choice.value}
                  selected={soundPref === choice.value}
                  className={classes.menuItem}
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
                >
                  <span className={classes.menuIcon}>{soundPref === choice.value ? <Check size={18} /> : null}</span>
                  <span className={classes.menuText}>
                    <span className={classes.menuLabel}>{choice.label}</span>
                    <span className={classes.menuHint}>{choice.hint}</span>
                  </span>
                </MenuItem>
              ))}
            </Menu>
            <TicketTagsDialog open={tagsOpen} onClose={() => setTagsOpen(false)} ticket={ticket} />
            <ScheduleMessageDialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} ticket={ticket} />
            <TransferTicketModal modalOpen={transferOpen} onClose={() => setTransferOpen(false)} ticketid={ticket.id} ticketWhatsappId={ticket.whatsappId} ticketSegment={ticket.segment} />
            <ConfirmationModal title={`Excluir a conversa com ${contact.name || "este contato"}?`} open={deleteOpen} onClose={setDeleteOpen} onConfirm={deleteTicket}>
              Todas as mensagens desta conversa serão apagadas. Isso não pode ser desfeito.
            </ConfirmationModal>
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
