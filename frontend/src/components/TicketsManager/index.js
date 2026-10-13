import React, { useContext, useEffect, useRef, useState } from "react";
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

import NewTicketModal from "../NewTicketModal";
import TicketsList from "../TicketsList";
import { AuthContext } from "../../context/Auth/AuthContext";
import TicketsQueueSelect from "../TicketsQueueSelect";
import { wa } from "../chat/chatTheme";

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
  const [filter, setFilter] = useState("open"); // open | pending | closed | unread
  const [newTicketModalOpen, setNewTicketModalOpen] = useState(false);
  const [showAllTickets, setShowAllTickets] = useState(false);
  const [menuEl, setMenuEl] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const searchTimeout = useRef();
  const { user } = useContext(AuthContext);
  const [openCount, setOpenCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const userQueueIds = (user.queues || []).map((q) => q.id);
  const [selectedQueueIds, setSelectedQueueIds] = useState(userQueueIds || []);
  const isAdmin = user.profile.toUpperCase() === "ADMIN";

  useEffect(() => {
    if (isAdmin) setShowAllTickets(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => clearTimeout(searchTimeout.current), []);

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
            selectedQueueIds={selectedQueueIds}
            userQueues={user?.queues}
            onChange={(values) => setSelectedQueueIds(values)}
          />
        </div>
      )}

      {!searching && (
        <div className={classes.chips}>
          {chip("open", "Atendendo", openCount)}
          {chip("pending", "Aguardando", pendingCount)}
          {chip("unread", "Não lidas", 0)}
          {chip("groups", "Grupos", 0)}
          {chip("closed", "Resolvidas", 0)}
          {chip("archived", "Arquivadas", 0)}
        </div>
      )}

      <div className={classes.body}>
        {searching ? (
          <TicketsList searchParam={searchParam} showAll={true} selectedQueueIds={selectedQueueIds} />
        ) : (
          <>
            {/* both live lists stay mounted so counters and sockets keep updating */}
            <div style={{ display: filter === "open" ? "flex" : "none", flex: 1, minHeight: 0 }}>
              <TicketsList status="open" groups="exclude" showAll={showAllTickets} selectedQueueIds={selectedQueueIds}
                updateCount={(v) => setOpenCount(v)} />
            </div>
            <div style={{ display: filter === "pending" ? "flex" : "none", flex: 1, minHeight: 0 }}>
              <TicketsList status="pending" groups="exclude" selectedQueueIds={selectedQueueIds} updateCount={(v) => setPendingCount(v)} />
            </div>
            {filter === "groups" && (
              <TicketsList groups="only" showAll={true} selectedQueueIds={selectedQueueIds} />
            )}
            {filter === "unread" && (
              <TicketsList withUnreadMessages showAll={showAllTickets} selectedQueueIds={selectedQueueIds} />
            )}
            {filter === "closed" && <TicketsList status="closed" showAll={true} selectedQueueIds={selectedQueueIds} />}
            {filter === "archived" && <TicketsList archived showAll={true} selectedQueueIds={selectedQueueIds} />}
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
