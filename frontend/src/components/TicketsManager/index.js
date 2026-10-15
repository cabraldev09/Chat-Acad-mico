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
import Select from "@material-ui/core/Select";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import AddIcon from "@material-ui/icons/Add";
import MoreVert from "@material-ui/icons/MoreVert";
import ClearIcon from "@material-ui/icons/Clear";
import ArrowBack from "@material-ui/icons/ArrowBack";
import FilterList from "@material-ui/icons/FilterList";
import Keyboard from "@material-ui/icons/Keyboard";

import NewTicketModal from "../NewTicketModal";
import TicketsList from "../TicketsList";
import CommunitiesList from "../CommunitiesList";
import { AuthContext } from "../../context/Auth/AuthContext";
import api from "../../services/api";
import openSocket from "../../services/socket-io";
import TicketsQueueSelect from "../TicketsQueueSelect";
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
    title: { flex: 1, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: c.text },
    iconBtn: { color: c.textSecondary, "&:hover": { backgroundColor: c.hover } },
    searchWrap: { flex: "none", padding: theme.spacing(0.5, 1.5, 1) },
    search: {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1.5),
      height: 38,
      padding: theme.spacing(0, 1.5),
      borderRadius: 10,
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
    chip: {
      flex: "none",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      height: 28,
      padding: theme.spacing(0, 1.25),
      borderRadius: 999,
      border: "none",
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 500,
      fontFamily: "inherit",
      backgroundColor: c.chipBg,
      color: c.chipText,
      transition: "background-color .15s, color .15s",
      "&:hover": { backgroundColor: c.selected },
    },
    chipOn: { backgroundColor: c.chipOn, color: c.chipOnText, "&:hover": { backgroundColor: c.chipOn } },
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
  const [showFilters, setShowFilters] = useState(false);
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
  useEffect(() => {
    if (!manager) return;
    fetchAllUsers().then(setAttendants).catch(() => undefined);
    api.get("/whatsapp").then(({ data }) => setConnections(data)).catch(() => undefined);
  }, [manager]);

  useEffect(() => {
    if (isAdmin) setShowAllTickets(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const socket = openSocket();
    socket.on("connect", () => socket.emit("joinNotification"));
    socket.on("appMessage", refresh);
    socket.on("ticket", refresh);
    return () => {
      clearTimeout(timer);
      socket.disconnect();
    };
  }, [selectedQueueIds, scope.allQueues, attendantId, connectionId]);

  // the communities of the connected numbers (WhatsApp Web's "Comunidades"): the list and the unread total for the chip
  const [communities, setCommunities] = useState(null);
  useEffect(() => {
    let timer;
    const load = () => {
      clearTimeout(timer);
      timer = setTimeout(() => api.get("/communities").then(({ data }) => setCommunities(data.communities || [])).catch(() => setCommunities((c) => c || [])), 600);
    };
    load();
    const socket = openSocket();
    socket.on("connect", () => socket.emit("joinNotification"));
    ["ticket", "appMessage", "contact"].forEach((evt) => socket.on(evt, load));
    return () => { clearTimeout(timer); socket.disconnect(); };
  }, []);
  const communityUnread = (communities || []).reduce((n, c) => n + (c.unread || 0), 0);

  const searching = searchParam.length > 0;
  const chip = (key, label, count) => (
    <button
      key={key}
      type="button"
      className={clsx(classes.chip, filter === key && !searching && classes.chipOn)}
      onClick={() => {
        clearSearch();
        setFilter(key);
      }}
    >
      {label}
      {count > 0 && <span className={classes.chipCount}>{count > 99 ? "99+" : count}</span>}
    </button>
  );

  return (
    <div className={classes.wrapper}>
      <NewTicketModal modalOpen={newTicketModalOpen} onClose={() => setNewTicketModalOpen(false)} />

      <div className={classes.top}>
        <div className={classes.title}>Conversas</div>
        <Tooltip title="Nova conversa">
          <IconButton className={classes.iconBtn} onClick={() => setNewTicketModalOpen(true)}>
            <AddIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Filtrar por fila">
          <IconButton className={classes.iconBtn} onClick={() => setShowFilters((v) => !v)}>
            <FilterList />
          </IconButton>
        </Tooltip>
        <IconButton className={classes.iconBtn} onClick={(e) => setMenuEl(e.currentTarget)}>
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
          <MenuItem onClick={() => { setShowFilters((v) => !v); setMenuEl(null); }}>
            <ListItemIcon style={{ minWidth: 32 }}><FilterList fontSize="small" /></ListItemIcon>
            <ListItemText primary="Filtrar por fila" />
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
            <IconButton size="small" onClick={clearSearch} style={{ padding: 2 }}>
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
            <IconButton size="small" onClick={clearSearch} style={{ padding: 2 }}>
              <ClearIcon style={{ fontSize: 18 }} />
            </IconButton>
          )}
        </div>
      </div>

      {showFilters && (
        <div className={classes.filters}>
          <TicketsQueueSelect
            style={{ flex: 1 }}
            selectedQueueIds={selectedQueueIds} {...scope}
            userQueues={user?.queues}
            onChange={(values) => { setQueueTouched(true); setSelectedQueueIds(values); }}
          />
          {manager && (
            <>
              <Select displayEmpty value={attendantId} onChange={(e) => setAttendantId(e.target.value)} style={{ minWidth: 130 }}
                renderValue={(v) => { const u = attendants.find((x) => x.id === v); return u ? u.name : "Todos os atendentes"; }}>
                <MenuItem value="">Todos os atendentes</MenuItem>
                {attendants.map((u) => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}
              </Select>
              <Select displayEmpty value={connectionId} onChange={(e) => setConnectionId(e.target.value)} style={{ minWidth: 130 }}
                renderValue={(v) => { const c = connections.find((x) => x.id === v); return c ? c.name : "Todas as conexões"; }}>
                <MenuItem value="">Todas as conexões</MenuItem>
                {connections.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </>
          )}
          {tags.length > 0 && (
            <Select
              displayEmpty
              value={tagId}
              onChange={(e) => setTagId(e.target.value)}
              style={{ minWidth: 130 }}
              renderValue={(v) => {
                const t = tags.find((x) => x.id === v);
                return t ? t.name : "Todas as etiquetas";
              }}
            >
              <MenuItem value="">Todas as etiquetas</MenuItem>
              {tags.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: t.color, marginRight: 8, flex: "none" }} />
                  {t.name}
                </MenuItem>
              ))}
            </Select>
          )}
        </div>
      )}

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
            {filter === "closed" ? "Resolvidas" : filter === "archived" ? "Arquivadas" : "Mais"} ▾
          </button>
          <Menu anchorEl={moreEl} open={Boolean(moreEl)} onClose={() => setMoreEl(null)} getContentAnchorEl={null}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }} transformOrigin={{ vertical: "top", horizontal: "left" }}>
            <MenuItem selected={filter === "closed"} onClick={() => { setMoreEl(null); clearSearch(); setFilter("closed"); }}>Resolvidas</MenuItem>
            <MenuItem selected={filter === "archived"} onClick={() => { setMoreEl(null); clearSearch(); setFilter("archived"); }}>Arquivadas</MenuItem>
          </Menu>
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
                updateCount={(v) => setOpenCount(v)} />
            </div>
            <div style={{ display: filter === "pending" ? "flex" : "none", flex: 1, minHeight: 0 }}>
              <TicketsList tagId={tagId} status="pending" groups="exclude" selectedQueueIds={selectedQueueIds} {...scope} updateCount={(v) => setPendingCount(v)} />
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
