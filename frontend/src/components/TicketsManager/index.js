import React, { useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import clsx from "clsx";
import { makeStyles } from "@material-ui/core/styles";
import SearchIcon from "@material-ui/icons/Search";
import InputBase from "@material-ui/core/InputBase";
import IconButton from "@material-ui/core/IconButton";
import Tooltip from "@material-ui/core/Tooltip";
import Menu from "@material-ui/core/Menu";
import MenuItem from "@material-ui/core/MenuItem";
import Switch from "@material-ui/core/Switch";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import AddIcon from "@material-ui/icons/Add";
import MoreVert from "@material-ui/icons/MoreVert";
import ClearIcon from "@material-ui/icons/Clear";
import ArrowBack from "@material-ui/icons/ArrowBack";
import FilterList from "@material-ui/icons/FilterList";
import { Archive, CheckCircle2, Clock3, Inbox, Layers, MailOpen, MessageCircle, Users } from "lucide-react";
import Keyboard from "@material-ui/icons/Keyboard";

import NewTicketModal from "../NewTicketModal";
import TicketsList from "../TicketsList";
import CommunitiesList from "../CommunitiesList";
import { AuthContext } from "../../context/Auth/AuthContext";
import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import openSocket from "../../services/socket-io";
import ConversationFilters, { ActiveFilters, FiltersButton, useFilterSummary } from "./ConversationFilters";
import { isManager } from "../../utils/access";
import { fetchAllUsers } from "../../pages/Affiliates/shared";
import { wa, getChatAccent, setChatAccent } from "../chat/chatTheme";

const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  return {
    wrapper: {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden",
      backgroundColor: c.panel,
      color: c.text,
    },
    top: {
      flex: "none",
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      padding: theme.spacing(1.25, 1.5, 0.5, 2),
    },
    title: { flex: 1, fontSize: 22, fontWeight: 600, color: c.text },
    iconBtn: { color: c.textSecondary, "&:hover": { backgroundColor: c.hover } },
    searchWrap: { flex: "none", padding: theme.spacing(0.5, 1.5, 1) },
    search: {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1.5),
      height: 38,
      padding: theme.spacing(0, 1.75),
      borderRadius: 20,
      backgroundColor: c.panelAlt,
      border: "1px solid transparent",
      transition: "border-color .15s, background-color .15s",
      "&:focus-within": { borderColor: c.accent, backgroundColor: c.panel },
      "& svg": { fontSize: 20, color: c.textSecondary },
    },
    searchInput: { flex: 1, fontSize: 14, color: c.text },
    chips: {
      flex: "none",
      display: "flex",
      gap: theme.spacing(0.75),
      flexWrap: "wrap",
      padding: theme.spacing(0, 1.5, 1),
    },
    chipIcon: { flex: "none", opacity: 0.85 },
    // the row under the tabs: whose conversations "Atendendo" shows, and "mark all as read" in "Não lidas"
    subRow: { flex: "none", display: "flex", alignItems: "center", gap: 6, padding: theme.spacing(0, 1.5, 1), fontSize: 12.5, color: c.textSecondary },
    seg: {
      height: 26, padding: "0 10px", borderRadius: 999, border: `1px solid ${c.divider || "rgba(0,0,0,.12)"}`, background: "transparent", color: c.text,
      cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, "&:focus-visible": { outline: `2px solid ${c.accent}`, outlineOffset: 2 },
    },
    segOn: { backgroundColor: c.chipOn, color: c.chipOnText, borderColor: "transparent", fontWeight: 600 },
    subLink: { marginLeft: "auto", border: 0, background: "none", color: c.accent, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, padding: 0 },
    chip: {
      flex: "none",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      height: 30,
      padding: theme.spacing(0, 1.4),
      borderRadius: 999,
      border: "1px solid transparent",
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 500,
      fontFamily: "inherit",
      backgroundColor: c.chipBg,
      color: c.chipText,
      transition: "background-color .15s, color .15s, box-shadow .15s, transform .1s",
      "&:hover": { backgroundColor: c.selected },
      "&:active": { transform: "scale(.97)" },
      "&:focus-visible": { outline: `2px solid ${c.accent}`, outlineOffset: 2 },
    },
    chipOn: { backgroundColor: c.chipOn, color: c.chipOnText, fontWeight: 600, "&:hover": { backgroundColor: c.chipOn } },
    chipCount: {
      minWidth: 18,
      padding: "0 5px",
      borderRadius: 999,
      fontSize: 11,
      lineHeight: "18px",
      fontWeight: 700,
      textAlign: "center",
      backgroundColor: c.badge,
      color: c.badgeText,
    },
    filters: {
      flex: "none",
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      padding: theme.spacing(0, 1.5, 1),
    },
    body: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" },
    fab: {
      position: "absolute",
      right: theme.spacing(2),
      bottom: theme.spacing(2),
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: c.accent,
      color: "#fff",
      boxShadow: "0 4px 12px rgba(11,20,26,.25)",
      "&:hover": { backgroundColor: c.accent, filter: "brightness(1.08)" },
    },
    menuSwitch: { marginLeft: theme.spacing(1) },
  };
});

const TicketsManager = () => {
  const classes = useStyles();
  const [searchParam, setSearchParam] = useState("");
  const [searchText, setSearchText] = useState("");
  const location = useLocation();
  const asked = new URLSearchParams(location.search).get("filtro");
  const [filter, setFilter] = useState(["open", "pending", "unread", "everything", "groups", "communities", "closed", "archived"].includes(asked) ? asked : "open");
  const [moreEl, setMoreEl] = useState(null);
  const [newTicketModalOpen, setNewTicketModalOpen] = useState(false);
  const [showAllTickets, setShowAllTickets] = useState(false);
  const [menuEl, setMenuEl] = useState(null);
  const [filtersEl, setFiltersEl] = useState(null);
  const [tags, setTags] = useState([]);
  const [tagId, setTagId] = useState("");
  const searchTimeout = useRef();
  const { user } = useContext(AuthContext);
  const [openCount, setOpenCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const userQueueIds = (user.queues || []).map((q) => q.id);
  const [selectedQueueIds, setSelectedQueueIds] = useState(userQueueIds || []);
  const manager = isManager(user);
  const isAdmin = manager; // the "everything of everyone" view belongs to administration and coordination
  // managers see every sector and can narrow the list to one attendant or one connection
  const [queueTouched, setQueueTouched] = useState(false);
  const [attendantId, setAttendantId] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [attendants, setAttendants] = useState([]);
  const [connections, setConnections] = useState([]);
  const scope = { allQueues: manager && !queueTouched, attendantId, connectionId };
  const filterSummary = useFilterSummary({ manager, queueTouched, selectedQueueIds, userQueues: user?.queues, attendantId, connectionId, tagId, attendants, connections, tags });
  const clearOneFilter = (key) => {
    if (key === "queues") { setQueueTouched(false); setSelectedQueueIds(userQueueIds); }
    if (key === "attendant") setAttendantId("");
    if (key === "connection") setConnectionId("");
    if (key === "tag") setTagId("");
  };
  const clearAllFilters = () => { clearOneFilter("queues"); setAttendantId(""); setConnectionId(""); setTagId(""); };
  useEffect(() => {
    if (!manager) return;
    fetchAllUsers().then(setAttendants).catch(() => undefined);
    api.get("/whatsapp").then(({ data }) => setConnections(data)).catch(() => undefined);
  }, [manager]);

  // "Atendendo" opens on the person's own conversations; "Da equipe" (managers) shows everybody's, each with who attends it
  const [readingAll, setReadingAll] = useState(false);
  const readAll = async () => {
    setReadingAll(true);
    try {
      const { data } = await api.put("/tickets/read-all", { groups: "exclude", attendantId: attendantId || undefined, connectionId: connectionId || undefined });
      setDmUnread(0);
      toast.success(data.count ? `${data.count} conversa${data.count === 1 ? "" : "s"} marcada${data.count === 1 ? "" : "s"} como lida${data.count === 1 ? "" : "s"}.` : "Nenhuma conversa não lida.");
    } catch (err) {
      toastError(err);
    } finally {
      setReadingAll(false);
    }
  };
  // choosing a connection shows everything of that number: the attendant filter would hide the conversations of its owner
  const chooseConnection = (id) => {
    setConnectionId(id);
    if (id) setAttendantId("");
  };

  useEffect(() => () => clearTimeout(searchTimeout.current), []);

  useEffect(() => {
    api.get("/tags").then(({ data }) => setTags(data)).catch(() => undefined);
  }, []);

  const handleSearch = (e) => {
    const value = e.target.value;
    setSearchText(value);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setSearchParam(value.trim().toLowerCase()), 400);
  };

  const clearSearch = () => {
    setSearchText("");
    setSearchParam("");
  };

  useEffect(() => {
    const open = () => setNewTicketModalOpen(true);
    window.addEventListener("openNewConversation", open);
    return () => window.removeEventListener("openNewConversation", open);
  }, []);

  // groups do not show in "Atendendo", so their unread count lives on the Grupos chip (like WhatsApp's unread filter)
  const [groupUnread, setGroupUnread] = useState(0);
  const [dmUnread, setDmUnread] = useState(0);
  useEffect(() => {
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const count = (groups) =>
          api.get("/tickets", { params: { withUnreadMessages: "true", groups, showAll: "true", countOnly: "true", queueIds: JSON.stringify(selectedQueueIds), allQueues: scope.allQueues ? "true" : undefined, attendantId: attendantId || undefined, connectionId: connectionId || undefined } })
            .then(({ data }) => data.count || 0);
        Promise.all([count("only"), count("exclude")]).then(([g, d]) => { setGroupUnread(g); setDmUnread(d); }).catch(() => undefined);
      }, 700);
    };
    refresh();
    const socket = openSocket("notification");
    socket.on("connect", () => socket.emit("joinNotification"));
    socket.on("appMessage", refresh);
    socket.on("ticket", refresh);
    return () => {
      clearTimeout(timer);
      socket.disconnect();
    };
  }, [selectedQueueIds, scope.allQueues, attendantId, connectionId]);

  // "Atendendo" and "Aguardando" counters come from the server (the size of the whole list, not of the pages already loaded) and are asked
  // again whenever a conversation changes hands, so taking a conversation moves the numbers at once, with no reload
  useEffect(() => {
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const base = { groups: "exclude", countOnly: "true", queueIds: JSON.stringify(selectedQueueIds), allQueues: scope.allQueues ? "true" : undefined, attendantId: attendantId || undefined, connectionId: connectionId || undefined, tagId: tagId || undefined };
        api.get("/tickets", { params: { ...base, status: "open", showAll: showAllTickets ? "true" : undefined } }).then(({ data }) => setOpenCount(data.count || 0)).catch(() => undefined);
        api.get("/tickets", { params: { ...base, status: "pending" } }).then(({ data }) => setPendingCount(data.count || 0)).catch(() => undefined);
      }, 400);
    };
    refresh();
    const socket = openSocket("notification");
    socket.on("connect", () => socket.emit("joinNotification"));
    socket.on("ticket", refresh);
    socket.on("appMessage", refresh);
    return () => {
      clearTimeout(timer);
      socket.disconnect();
    };
  }, [selectedQueueIds, scope.allQueues, attendantId, connectionId, tagId, showAllTickets]);

  // the communities of the connected numbers (WhatsApp Web's "Comunidades"): the list and the unread total for the chip
  const [communities, setCommunities] = useState(null);
  useEffect(() => {
    let timer;
    const load = () => {
      clearTimeout(timer);
      timer = setTimeout(() => api.get("/communities").then(({ data }) => setCommunities(data.communities || [])).catch(() => setCommunities((c) => c || [])), 600);
    };
    load();
    const socket = openSocket("notification");
    socket.on("connect", () => socket.emit("joinNotification"));
    ["ticket", "appMessage", "contact"].forEach((evt) => socket.on(evt, load));
    return () => { clearTimeout(timer); socket.disconnect(); };
  }, []);
  const communityUnread = (communities || []).reduce((n, c) => n + (c.unread || 0), 0);

  const searching = searchParam.length > 0;
  const ICONS = { open: MessageCircle, pending: Clock3, unread: MailOpen, groups: Users, communities: Layers, everything: Inbox };
  const chip = (key, label, count) => {
    const Icon = ICONS[key];
    return (
    <button
      key={key}
      type="button"
      className={clsx(classes.chip, filter === key && !searching && classes.chipOn)}
      aria-pressed={filter === key && !searching}
      onClick={() => {
        clearSearch();
        setFilter(key);
      }}
    >
      {Icon && <Icon size={14} className={classes.chipIcon} />}
      {label}
      {count > 0 && <span className={classes.chipCount}>{count > 99 ? "99+" : count}</span>}
    </button>
    );
  };

  return (
    <div className={classes.wrapper}>
      <NewTicketModal modalOpen={newTicketModalOpen} onClose={() => setNewTicketModalOpen(false)} />

      <div className={classes.top}>
        <div className={classes.title}>Conversas</div>
        <Tooltip title="Nova conversa">
          <IconButton className={classes.iconBtn} aria-label="Nova conversa" onClick={() => setNewTicketModalOpen(true)}>
            <AddIcon />
          </IconButton>
        </Tooltip>
        <FiltersButton count={filterSummary.length} onClick={(e) => setFiltersEl(e.currentTarget)} className={classes.iconBtn} />
        <IconButton aria-label="Mais opções" className={classes.iconBtn} onClick={(e) => setMenuEl(e.currentTarget)}>
          <MoreVert />
        </IconButton>
        <Menu anchorEl={menuEl} open={Boolean(menuEl)} onClose={() => setMenuEl(null)} getContentAnchorEl={null}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
          {isAdmin && (
            <MenuItem onClick={() => setShowAllTickets((v) => !v)}>
              <ListItemText primary="Ver conversas de todos" />
              <Switch size="small" color="primary" className={classes.menuSwitch} checked={showAllTickets} />
            </MenuItem>
          )}
          <MenuItem onClick={(e) => { setMenuEl(null); setFiltersEl(document.querySelector("[aria-haspopup='dialog'][title='Filtros']") || e.currentTarget); }}>
            <ListItemIcon style={{ minWidth: 32 }}><FilterList fontSize="small" /></ListItemIcon>
            <ListItemText primary="Filtros" />
          </MenuItem>
          <MenuItem onClick={() => { setMenuEl(null); setChatAccent(getChatAccent() === "blue" ? "green" : "blue"); }}>
            <ListItemIcon style={{ minWidth: 32 }}>
              <span style={{ width: 18, height: 18, borderRadius: "50%", background: getChatAccent() === "blue" ? "#25d366" : "#1a8ff0", display: "inline-block" }} />
            </ListItemIcon>
            <ListItemText primary={getChatAccent() === "blue" ? "Mensagens enviadas em verde" : "Mensagens enviadas em azul"} />
          </MenuItem>
          <MenuItem onClick={() => { setMenuEl(null); window.dispatchEvent(new CustomEvent("openShortcuts")); }}>
            <ListItemIcon style={{ minWidth: 32 }}><Keyboard fontSize="small" /></ListItemIcon>
            <ListItemText primary="Atalhos do teclado" />
          </MenuItem>
        </Menu>
      </div>

      <div className={classes.searchWrap}>
        <div className={classes.search}>
          {searching || searchText ? (
            <IconButton aria-label="Voltar" size="small" onClick={clearSearch} style={{ padding: 2 }}>
              <ArrowBack style={{ fontSize: 20 }} />
            </IconButton>
          ) : (
            <SearchIcon />
          )}
          <InputBase
            className={classes.searchInput}
            placeholder="Pesquisar nome, número ou mensagem"
            value={searchText}
            onChange={handleSearch}
          />
          {searchText && (
            <IconButton aria-label="Limpar" size="small" onClick={clearSearch} style={{ padding: 2 }}>
              <ClearIcon style={{ fontSize: 18 }} />
            </IconButton>
          )}
        </div>
      </div>

      <ActiveFilters items={filterSummary} onRemove={clearOneFilter} onClear={clearAllFilters} />
      <ConversationFilters
        anchorEl={filtersEl} onClose={() => setFiltersEl(null)} onClear={clearAllFilters} active={filterSummary.length > 0}
        userQueues={user?.queues} selectedQueueIds={selectedQueueIds} onQueues={(values) => { setQueueTouched(true); setSelectedQueueIds(values); }}
        queueTouched={queueTouched} onAllQueues={() => clearOneFilter("queues")} manager={manager}
        attendants={attendants} attendantId={attendantId} setAttendantId={setAttendantId} connections={connections} connectionId={connectionId} setConnectionId={chooseConnection}
        tags={tags} tagId={tagId} setTagId={setTagId} isAdmin={isAdmin} showAllTickets={showAllTickets} setShowAllTickets={setShowAllTickets}
      />

      {!searching && (
        <div className={classes.chips}>
          {chip("open", "Atendendo", openCount)}
          {/* nobody waiting: the chip would only be noise (it comes back, with a number, when someone does) */}
          {(pendingCount > 0 || filter === "pending") && chip("pending", "Aguardando", pendingCount)}
          {chip("unread", "Não lidas", dmUnread)}
          {chip("groups", "Grupos", groupUnread)}
          {((communities || []).length > 0 || filter === "communities") && chip("communities", "Comunidades", communityUnread)}
          {chip("everything", "Todas", 0)}
          <button
            type="button"
            className={clsx(classes.chip, (filter === "closed" || filter === "archived") && !searching && classes.chipOn)}
            onClick={(e) => setMoreEl(e.currentTarget)}
          >
            {filter === "closed" ? <CheckCircle2 size={14} className={classes.chipIcon} /> : filter === "archived" ? <Archive size={14} className={classes.chipIcon} /> : null}
            {filter === "closed" ? "Resolvidas" : filter === "archived" ? "Arquivadas" : "Mais"} ▾
          </button>
          <Menu anchorEl={moreEl} open={Boolean(moreEl)} onClose={() => setMoreEl(null)} getContentAnchorEl={null}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }} transformOrigin={{ vertical: "top", horizontal: "left" }}>
            <MenuItem selected={filter === "closed"} onClick={() => { setMoreEl(null); clearSearch(); setFilter("closed"); }}>Resolvidas</MenuItem>
            <MenuItem selected={filter === "archived"} onClick={() => { setMoreEl(null); clearSearch(); setFilter("archived"); }}>Arquivadas</MenuItem>
          </Menu>
        </div>
      )}

      {!searching && filter === "open" && isAdmin && (
        <div className={classes.subRow} role="group" aria-label="De quem são as conversas">
          <button type="button" className={clsx(classes.seg, !showAllTickets && classes.segOn)} aria-pressed={!showAllTickets} onClick={() => setShowAllTickets(false)}>Minhas</button>
          <button type="button" className={clsx(classes.seg, showAllTickets && classes.segOn)} aria-pressed={showAllTickets} onClick={() => setShowAllTickets(true)}>Da equipe</button>
        </div>
      )}
      {!searching && filter === "unread" && dmUnread > 0 && (
        <div className={classes.subRow}>
          <span>{dmUnread} não lida{dmUnread === 1 ? "" : "s"}</span>
          <button type="button" className={classes.subLink} onClick={readAll} disabled={readingAll}>{readingAll ? "Marcando…" : "Marcar todas como lidas"}</button>
        </div>
      )}

      <div className={classes.body}>
        {searching ? (
          <TicketsList tagId={tagId} searchParam={searchParam} showAll={true} selectedQueueIds={selectedQueueIds} {...scope} />
        ) : (
          <>
            {/* both live lists stay mounted so counters and sockets keep updating */}
            <div style={{ display: filter === "open" ? "flex" : "none", flex: 1, minHeight: 0 }}>
              <TicketsList tagId={tagId} status="open" groups="exclude" showAll={showAllTickets} selectedQueueIds={selectedQueueIds} {...scope}
                 />
            </div>
            <div style={{ display: filter === "pending" ? "flex" : "none", flex: 1, minHeight: 0 }}>
              <TicketsList tagId={tagId} status="pending" groups="exclude" selectedQueueIds={selectedQueueIds} {...scope} />
            </div>
            {filter === "groups" && (
              <TicketsList tagId={tagId} groups="only" everything showAll={true} selectedQueueIds={selectedQueueIds} {...scope} />
            )}
            {filter === "communities" && <CommunitiesList communities={communities} />}
            {filter === "unread" && (
              <TicketsList tagId={tagId} withUnreadMessages groups="exclude" showAll={showAllTickets} selectedQueueIds={selectedQueueIds} {...scope} />
            )}
            {filter === "closed" && <TicketsList tagId={tagId} status="closed" showAll={true} selectedQueueIds={selectedQueueIds} {...scope} />}
            {filter === "archived" && <TicketsList tagId={tagId} archived showAll={true} selectedQueueIds={selectedQueueIds} {...scope} />}
            {filter === "everything" && <TicketsList tagId={tagId} everything showAll={true} selectedQueueIds={selectedQueueIds} {...scope} />}
          </>
        )}
        <Tooltip title="Nova conversa">
          <IconButton className={classes.fab} onClick={() => setNewTicketModalOpen(true)} aria-label="Nova conversa">
            <AddIcon />
          </IconButton>
        </Tooltip>
      </div>
    </div>
  );
};

export default TicketsManager;
