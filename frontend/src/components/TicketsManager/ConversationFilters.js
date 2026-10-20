import React, { useMemo, useState } from "react";
import clsx from "clsx";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import useMediaQuery from "@material-ui/core/useMediaQuery";
import Popover from "@material-ui/core/Popover";
import Drawer from "@material-ui/core/Drawer";
import Switch from "@material-ui/core/Switch";
import InputBase from "@material-ui/core/InputBase";
import { Check, Search, SlidersHorizontal, Users, X } from "lucide-react";

import { wa } from "../chat/chatTheme";

// The filters of the conversations: one panel instead of a row of cut dropdowns. Queues, attendant, connection and labels are chips and a short list, the
// active ones are shown (and removed) under the search, and everything clears with one click. The state is the one of TicketsManager.
const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  return {
    panel: { width: 360, maxWidth: "100vw", maxHeight: "min(78vh, 640px)", display: "flex", flexDirection: "column", background: c.panel, color: c.text },
    sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "86vh" },
    head: { display: "flex", alignItems: "center", gap: 8, padding: theme.spacing(1.75, 2, 1) },
    headTitle: { flex: 1, fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" },
    link: { border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: c.accent, padding: "4px 6px", borderRadius: 8, "&:hover": { background: c.hover }, "&:disabled": { opacity: 0.4, cursor: "default" } },
    close: { border: "none", background: c.chipBg, color: c.textSecondary, width: 30, height: 30, borderRadius: 10, cursor: "pointer", display: "grid", placeItems: "center", "&:hover": { background: c.selected } },
    body: { overflowY: "auto", padding: theme.spacing(0, 2, 1.5) },
    section: { marginTop: theme.spacing(1.5) },
    label: { fontSize: 12, fontWeight: 700, color: c.textSecondary, letterSpacing: ".02em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 },
    chips: { display: "flex", flexWrap: "wrap", gap: 6 },
    chip: {
      display: "inline-flex", alignItems: "center", gap: 6, minHeight: 30, padding: "0 12px", borderRadius: 999, border: "1px solid transparent", cursor: "pointer",
      fontFamily: "inherit", fontSize: 13, fontWeight: 500, background: c.chipBg, color: c.chipText, transition: "background .15s, border-color .15s, color .15s, transform .1s",
      "&:hover": { background: c.selected }, "&:active": { transform: "scale(.97)" },
      "&:focus-visible": { outline: `2px solid ${c.accent}`, outlineOffset: 2 },
    },
    chipOn: { background: c.chipOn, color: c.chipOnText, borderColor: c.chipOn, "&:hover": { background: c.chipOn } },
    dot: { width: 9, height: 9, borderRadius: "50%", flex: "none" },
    find: { display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 10px", borderRadius: 10, background: c.panelAlt, marginBottom: 6, "& svg": { color: c.textSecondary, flex: "none" } },
    findInput: { flex: 1, fontSize: 13.5, color: c.text },
    people: { maxHeight: 190, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 },
    person: {
      display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 10, border: "none", background: "none", cursor: "pointer", textAlign: "left",
      fontFamily: "inherit", fontSize: 13.5, color: c.text, "&:hover": { background: c.hover }, "&:focus-visible": { outline: `2px solid ${c.accent}` },
    },
    personOn: { background: c.selected },
    avatar: { width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, background: c.chipBg, color: c.chipText, flex: "none" },
    grow: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    row: { display: "flex", alignItems: "center", gap: 10, marginTop: theme.spacing(1.75), padding: "10px 12px", borderRadius: 12, background: c.panelAlt },
    rowText: { flex: 1, fontSize: 13.5, fontWeight: 600 },
    rowHint: { display: "block", fontSize: 12, fontWeight: 400, color: c.textSecondary },
    // the strip of what is filtering the list now
    strip: { flex: "none", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: theme.spacing(0, 1.5, 1) },
    tag: { display: "inline-flex", alignItems: "center", gap: 6, maxWidth: "100%", height: 26, padding: "0 4px 0 10px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, background: c.chipOn, color: c.chipOnText },
    tagX: { border: "none", background: "rgba(0,0,0,.12)", color: "inherit", width: 18, height: 18, borderRadius: "50%", display: "grid", placeItems: "center", cursor: "pointer", padding: 0, "&:hover": { background: "rgba(0,0,0,.22)" } },
    tagText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    trigger: { position: "relative" },
    badge: { position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, padding: "0 4px", fontSize: 10, fontWeight: 700, lineHeight: "16px", textAlign: "center", background: c.accent, color: "#fff", pointerEvents: "none" },
  };
});

const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

export const useFilterSummary = ({ manager, queueTouched, selectedQueueIds, userQueues, attendantId, connectionId, tagId, attendants, connections, tags }) =>
  useMemo(() => {
    const items = [];
    if (queueTouched) {
      const names = (userQueues || []).filter((q) => selectedQueueIds.includes(q.id)).map((q) => q.name);
      items.push({ key: "queues", label: names.length ? `Fila: ${names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ")}` : "Nenhuma fila" });
    }
    if (manager && attendantId) items.push({ key: "attendant", label: `Atendente: ${(attendants.find((u) => u.id === attendantId) || {}).name || "—"}` });
    if (manager && connectionId) items.push({ key: "connection", label: `Conexão: ${(connections.find((x) => x.id === connectionId) || {}).name || "—"}` });
    if (tagId) items.push({ key: "tag", label: `Etiqueta: ${(tags.find((t) => t.id === tagId) || {}).name || "—"}` });
    return items;
  }, [manager, queueTouched, selectedQueueIds, userQueues, attendantId, connectionId, tagId, attendants, connections, tags]);

// the button of the top bar, with the number of filters on
export const FiltersButton = ({ count, onClick, className, iconBtn }) => {
  const classes = useStyles();
  return (
    <span className={classes.trigger}>
      <button type="button" className={iconBtn || className} onClick={onClick} aria-label={count ? `Filtros (${count} ativos)` : "Filtros"} title="Filtros" aria-haspopup="dialog"
        style={{ border: "none", background: "transparent", cursor: "pointer", width: 40, height: 40, borderRadius: "50%", display: "grid", placeItems: "center", color: "inherit" }}>
        <SlidersHorizontal size={20} />
      </button>
      {count > 0 && <span className={classes.badge}>{count}</span>}
    </span>
  );
};

export const ActiveFilters = ({ items, onRemove, onClear }) => {
  const classes = useStyles();
  if (!items.length) return null;
  return (
    <div className={classes.strip} role="group" aria-label="Filtros ativos">
      {items.map((it) => (
        <span key={it.key} className={classes.tag}>
          <span className={classes.tagText}>{it.label}</span>
          <button type="button" className={classes.tagX} onClick={() => onRemove(it.key)} aria-label={`Remover o filtro ${it.label}`}><X size={11} /></button>
        </span>
      ))}
      {items.length > 1 && <button type="button" className={classes.link} onClick={onClear}>Limpar tudo</button>}
    </div>
  );
};

const FiltersPanel = ({
  onClose, onClear, active, userQueues, selectedQueueIds, onQueues, queueTouched, onAllQueues, manager, attendants, attendantId, setAttendantId,
  connections, connectionId, setConnectionId, tags, tagId, setTagId, isAdmin, showAllTickets, setShowAllTickets,
}) => {
  const classes = useStyles();
  const [find, setFind] = useState("");
  const people = useMemo(() => attendants.filter((u) => !find.trim() || String(u.name || "").toLowerCase().includes(find.trim().toLowerCase())), [attendants, find]);
  const toggleQueue = (id) => onQueues(selectedQueueIds.includes(id) ? selectedQueueIds.filter((x) => x !== id) : [...selectedQueueIds, id]);
  return (
    <>
      <div className={classes.head}>
        <span className={classes.headTitle}>Filtros</span>
        <button type="button" className={classes.link} onClick={onClear} disabled={!active}>Limpar</button>
        <button type="button" className={classes.close} onClick={onClose} aria-label="Fechar os filtros"><X size={16} /></button>
      </div>
      <div className={classes.body}>
        {(userQueues || []).length > 0 && (
          <div className={classes.section}>
            <div className={classes.label}>Filas</div>
            <div className={classes.chips}>
              {manager && (
                <button type="button" className={clsx(classes.chip, !queueTouched && classes.chipOn)} onClick={onAllQueues} aria-pressed={!queueTouched}>
                  {!queueTouched && <Check size={13} />}Todas as filas
                </button>
              )}
              {userQueues.map((q) => {
                const on = (queueTouched || !manager) && selectedQueueIds.includes(q.id);
                return (
                  <button key={q.id} type="button" className={clsx(classes.chip, on && classes.chipOn)} onClick={() => toggleQueue(q.id)} aria-pressed={on}>
                    <span className={classes.dot} style={{ background: q.color || "#8696a0" }} />{q.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {manager && (
          <div className={classes.section}>
            <div className={classes.label}>Atendente</div>
            <div className={classes.find}><Search size={15} /><InputBase className={classes.findInput} placeholder="Buscar atendente" value={find} onChange={(e) => setFind(e.target.value)} inputProps={{ "aria-label": "Buscar atendente" }} /></div>
            <div className={classes.people} role="listbox" aria-label="Atendente">
              <button type="button" role="option" aria-selected={!attendantId} className={clsx(classes.person, !attendantId && classes.personOn)} onClick={() => setAttendantId("")}>
                <span className={classes.avatar}><Users size={13} /></span><span className={classes.grow}>Todos os atendentes</span>{!attendantId && <Check size={15} />}
              </button>
              {people.map((u) => (
                <button key={u.id} type="button" role="option" aria-selected={attendantId === u.id} className={clsx(classes.person, attendantId === u.id && classes.personOn)} onClick={() => setAttendantId(attendantId === u.id ? "" : u.id)}>
                  <span className={classes.avatar}>{initials(u.name)}</span><span className={classes.grow}>{u.name}</span>{attendantId === u.id && <Check size={15} />}
                </button>
              ))}
            </div>
          </div>
        )}
        {manager && connections.length > 0 && (
          <div className={classes.section}>
            <div className={classes.label}>Conexão</div>
            <div className={classes.chips}>
              <button type="button" className={clsx(classes.chip, !connectionId && classes.chipOn)} onClick={() => setConnectionId("")} aria-pressed={!connectionId}>Todas</button>
              {connections.map((x) => (
                <button key={x.id} type="button" className={clsx(classes.chip, connectionId === x.id && classes.chipOn)} onClick={() => setConnectionId(connectionId === x.id ? "" : x.id)} aria-pressed={connectionId === x.id}>{x.name}</button>
              ))}
            </div>
          </div>
        )}
        {tags.length > 0 && (
          <div className={classes.section}>
            <div className={classes.label}>Etiquetas</div>
            <div className={classes.chips}>
              {tags.map((t) => (
                <button key={t.id} type="button" className={clsx(classes.chip, tagId === t.id && classes.chipOn)} onClick={() => setTagId(tagId === t.id ? "" : t.id)} aria-pressed={tagId === t.id}>
                  <span className={classes.dot} style={{ background: t.color || "#8696a0" }} />{t.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {isAdmin && (
          <label className={classes.row}>
            <span className={classes.rowText}>Ver conversas de todos<span className={classes.rowHint}>Inclui as conversas dos outros atendentes</span></span>
            <Switch size="small" color="primary" checked={showAllTickets} onChange={(e) => setShowAllTickets(e.target.checked)} inputProps={{ "aria-label": "Ver conversas de todos" }} />
          </label>
        )}
      </div>
    </>
  );
};

// Popover on a wide screen, bottom sheet on a phone
const ConversationFilters = ({ anchorEl, onClose, ...rest }) => {
  const classes = useStyles();
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down("xs"));
  const open = Boolean(anchorEl);
  const body = <FiltersPanel onClose={onClose} {...rest} />;
  if (narrow) {
    return (
      <Drawer anchor="bottom" open={open} onClose={onClose} classes={{ paper: classes.sheet }}>
        <div className={classes.panel} style={{ width: "100%", maxHeight: "86vh" }}>{body}</div>
      </Drawer>
    );
  }
  return (
    <Popover open={open} anchorEl={anchorEl} onClose={onClose} getContentAnchorEl={null} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }} PaperProps={{ style: { borderRadius: 16, overflow: "hidden", boxShadow: "0 18px 48px rgba(11,20,26,.28)" } }}>
      <div className={classes.panel}>{body}</div>
    </Popover>
  );
};

export default ConversationFilters;
