import React, { useState, useEffect, useContext, useRef, useCallback } from "react";
import { useHistory } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import Dialog from "@material-ui/core/Dialog";
import Avatar from "@material-ui/core/Avatar";
import IconButton from "@material-ui/core/IconButton";
import InputBase from "@material-ui/core/InputBase";
import CircularProgress from "@material-ui/core/CircularProgress";
import Close from "@material-ui/icons/Close";
import Search from "@material-ui/icons/Search";
import PersonAdd from "@material-ui/icons/PersonAdd";
import ClearIcon from "@material-ui/icons/Clear";

import api from "../../services/api";
import ContactModal from "../ContactModal";
import ChannelIcon from "../ChannelIcon";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { wa } from "../chat/chatTheme";

const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  return {
    paper: { height: "min(86vh, 760px)", borderRadius: 18, backgroundColor: c.panelAlt, overflow: "hidden" },
    top: { flex: "none", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", padding: theme.spacing(2, 2, 1.5) },
    title: { fontSize: 17, fontWeight: 600, color: c.text },
    close: { position: "absolute", right: 14, top: 10, backgroundColor: c.panel, border: `1px solid ${c.divider}`, color: c.text, "&:hover": { backgroundColor: c.hover } },
    searchWrap: { flex: "none", padding: theme.spacing(0.5, 2, 1.5) },
    search: {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1.25),
      height: 44,
      padding: theme.spacing(0, 1.5),
      borderRadius: 22,
      backgroundColor: c.panel,
      border: "2px solid transparent",
      transition: "border-color .15s, box-shadow .15s",
      "&:focus-within": { borderColor: "#7bc89a", boxShadow: "0 0 0 3px rgba(37,211,102,.18)" },
      "& svg": { color: c.textSecondary },
    },
    input: { flex: 1, fontSize: 16, color: c.text },
    body: { flex: 1, minHeight: 0, overflowY: "auto", padding: theme.spacing(0, 2, 2), ...theme.scrollbarStyles },
    card: { backgroundColor: c.panel, borderRadius: 14, overflow: "hidden", marginBottom: theme.spacing(1.5) },
    heading: { margin: theme.spacing(1.5, 1.5, 0.75), fontSize: 15, fontWeight: 600, color: c.textSecondary },
    letter: { margin: theme.spacing(1.5, 1.5, 0.75), fontSize: 15, fontWeight: 700, color: c.textSecondary },
    row: {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1.75),
      padding: theme.spacing(0.75, 1.5),
      cursor: "pointer",
      "&:hover": { backgroundColor: c.hover },
      "& + &": { position: "relative" },
    },
    avatar: { width: 42, height: 42, flex: "none", backgroundColor: theme.palette.type === "dark" ? "#6b7c85" : "#dfe5e7", color: "#fff" },
    names: { flex: 1, minWidth: 0, borderBottom: `1px solid ${c.divider}`, padding: "7px 0", "$row:last-child &": { borderBottom: "none" } },
    name: { fontSize: 16, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    sub: { fontSize: 13, color: c.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    action: { width: 42, height: 42, flex: "none", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: c.accent, color: "#fff" },
    empty: { padding: theme.spacing(4, 2), textAlign: "center", color: c.textSecondary, fontSize: 14 },
    more: { display: "flex", justifyContent: "center", padding: theme.spacing(1.5) },
  };
});

const phoneLabel = (c) => {
  const n = String(c.number || "");
  if (n.includes("_")) return n.replace(/^[a-z]+_/, "");
  return n ? `+${n}` : "";
};

// "Nova conversa": search first, then add a contact, recent chats and the full A–Z list.
const NewTicketModal = ({ modalOpen, onClose }) => {
  const classes = useStyles();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const bodyRef = useRef();

  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recents, setRecents] = useState([]);
  const [creating, setCreating] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [newContact, setNewContact] = useState({});

  // reset when opened; load recent conversations
  useEffect(() => {
    if (!modalOpen) return;
    setQuery("");
    setSearch("");
    setPage(1);
    setContacts([]);
    const queueIds = JSON.stringify((user.queues || []).map((q) => q.id));
    Promise.all(
      ["open", "pending", "closed"].map((status) =>
        api.get("/tickets", { params: { status, showAll: "true", queueIds } }).then((r) => r.data.tickets).catch(() => [])
      )
    ).then((lists) => {
      const seen = new Set();
      const out = [];
      lists
        .flat()
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .forEach((t) => {
          if (!t.contact || t.isGroup || seen.has(t.contact.id)) return;
          seen.add(t.contact.id);
          out.push({ ...t.contact, channel: t.whatsapp?.channel });
        });
      setRecents(out.slice(0, 5));
    });
  }, [modalOpen, user]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
      setContacts([]);
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;
    setLoading(true);
    api
      .get("/contacts", { params: { searchParam: search, pageNumber: page } })
      .then(({ data }) => {
        if (cancelled) return;
        setContacts((prev) => (page === 1 ? data.contacts : [...prev, ...data.contacts]));
        setHasMore(data.hasMore);
      })
      .catch(toastError)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [search, page, modalOpen]);

  const onScroll = useCallback(
    (e) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
      if (hasMore && !loading && scrollHeight - scrollTop - clientHeight < 160) setPage((p) => p + 1);
    },
    [hasMore, loading]
  );

  const open = async (contactId) => {
    if (!contactId || creating) return;
    setCreating(true);
    try {
      const { data: ticket } = await api.post("/tickets", { contactId, userId: user.id, status: "open" });
      history.push(`/tickets/${ticket.id}`);
      onClose();
    } catch (err) {
      toastError(err);
    }
    setCreating(false);
  };

  const row = (c) => (
    <div key={c.id} className={classes.row} onClick={() => open(c.id)}>
      <Avatar className={classes.avatar} src={c.profilePicUrl}>
        {(c.name || "?").charAt(0).toUpperCase()}
      </Avatar>
      <div className={classes.names}>
        <div className={classes.name}>{c.name}</div>
        <div className={classes.sub}>{phoneLabel(c)}</div>
      </div>
      {c.channel && <ChannelIcon channel={c.channel} size={16} />}
    </div>
  );

  // group the alphabetical list by first letter
  const groups = [];
  [...contacts]
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR", { sensitivity: "base" }))
    .forEach((c) => {
      const letter = (String(c.name || "#").normalize("NFD").replace(/[̀-ͯ]/g, "").charAt(0) || "#").toUpperCase();
      const key = /[A-Z]/.test(letter) ? letter : "#";
      const last = groups[groups.length - 1];
      if (last && last.letter === key) last.items.push(c);
      else groups.push({ letter: key, items: [c] });
    });

  const searching = search.length > 0;

  return (
    <>
      <ContactModal
        open={contactModalOpen}
        initialValues={newContact}
        onClose={() => setContactModalOpen(false)}
        onSave={(contact) => {
          setContactModalOpen(false);
          open(contact.id);
        }}
      />
      <Dialog open={modalOpen} onClose={onClose} fullWidth maxWidth="xs" PaperProps={{ className: classes.paper }}>
        <div className={classes.top}>
          <span className={classes.title}>Nova conversa</span>
          <IconButton className={classes.close} size="small" onClick={onClose} aria-label="Fechar">
            <Close />
          </IconButton>
        </div>
        <div className={classes.searchWrap}>
          <div className={classes.search}>
            <Search />
            <InputBase
              autoFocus
              className={classes.input}
              placeholder="Nome ou telefone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <IconButton size="small" onClick={() => setQuery("")} style={{ padding: 3 }}>
                <ClearIcon style={{ fontSize: 18 }} />
              </IconButton>
            )}
          </div>
        </div>

        <div ref={bodyRef} className={classes.body} onScroll={onScroll}>
          <div className={classes.card}>
            <div
              className={classes.row}
              onClick={() => {
                setNewContact(query.trim() ? (/^[+\d\s()-]{6,}$/.test(query.trim()) ? { number: query.replace(/\D/g, "") } : { name: query.trim() }) : {});
                setContactModalOpen(true);
              }}
            >
              <span className={classes.action}>
                <PersonAdd />
              </span>
              <div className={classes.names} style={{ borderBottom: "none" }}>
                <div className={classes.name}>{query.trim() ? `Adicionar “${query.trim()}” como novo contato` : "Novo contato"}</div>
              </div>
            </div>
          </div>

          {!searching && recents.length > 0 && (
            <>
              <div className={classes.heading}>Conversas recentes</div>
              <div className={classes.card}>{recents.map(row)}</div>
            </>
          )}

          {searching ? (
            <>
              <div className={classes.heading}>Resultados</div>
              {contacts.length > 0 ? (
                <div className={classes.card}>{contacts.map(row)}</div>
              ) : (
                !loading && <div className={classes.empty}>Nenhum contato encontrado. Use “Adicionar como novo contato” acima.</div>
              )}
            </>
          ) : (
            <>
              {groups.length > 0 && <div className={classes.heading}>Todos os contatos</div>}
              {groups.map((g) => (
                <React.Fragment key={g.letter}>
                  <div className={classes.letter}>{g.letter}</div>
                  <div className={classes.card}>{g.items.map(row)}</div>
                </React.Fragment>
              ))}
              {!loading && contacts.length === 0 && <div className={classes.empty}>Você ainda não tem contatos. Adicione o primeiro acima.</div>}
            </>
          )}
          {loading && (
            <div className={classes.more}>
              <CircularProgress size={22} />
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
};

export default NewTicketModal;
