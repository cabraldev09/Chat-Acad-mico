import React, { useEffect, useRef, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Dialog from "@material-ui/core/Dialog";
import DialogTitle from "@material-ui/core/DialogTitle";
import DialogContent from "@material-ui/core/DialogContent";
import DialogActions from "@material-ui/core/DialogActions";
import Button from "@material-ui/core/Button";
import Avatar from "@material-ui/core/Avatar";
import Checkbox from "@material-ui/core/Checkbox";
import InputBase from "@material-ui/core/InputBase";
import CircularProgress from "@material-ui/core/CircularProgress";
import Search from "@material-ui/icons/Search";

import api from "../../services/api";
import { trackForward } from "../../utils/forwardProgress";
import toastError from "../../errors/toastError";
import { wa } from "./chatTheme";

const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  return {
    search: { display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px", borderRadius: 10, backgroundColor: c.panelAlt, marginBottom: 8, color: c.textSecondary },
    list: { maxHeight: 340, overflowY: "auto", margin: "0 -8px" },
    section: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: c.textSecondary, padding: "10px 8px 4px" },
    row: { display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", cursor: "pointer", borderRadius: 8, "&:hover": { backgroundColor: c.hover } },
    rowOff: { cursor: "default", opacity: 0.55, "&:hover": { backgroundColor: "transparent" } },
    name: { flex: 1, minWidth: 0, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    sub: { fontSize: 12, color: c.textSecondary },
    warn: { fontSize: 12, color: "#b45309" },
    empty: { padding: 24, textAlign: "center", color: c.textSecondary, fontSize: 14 },
    more: { display: "flex", justifyContent: "center", padding: 8 },
    confirm: { marginTop: 10, padding: "10px 12px", borderRadius: 10, fontSize: 14, backgroundColor: c.panelAlt, color: c.text },
  };
});

// +55 69 99366-7971, as people read a phone
const phoneText = (digits) => {
  const d = String(digits || "").replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(d)) {
    const rest = d.slice(4);
    return `+55 ${d.slice(2, 4)} ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  return d ? `+${d}` : "";
};

// Where to forward one or several messages: the conversations the person may write in (searched on the server, page by page) and,
// when searching, the contacts with no open conversation (the forward opens one). A conversation of the official number outside the
// 24 h cannot receive it; taking conversations that are waiting is confirmed first.
const ForwardDialog = ({ open, onClose, message, messages, fromTicketId }) => {
  const classes = useStyles();
  const [data, setData] = useState({ tickets: [], contacts: [], hasMore: false, page: 1 });
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [filter, setFilter] = useState("");
  const [askAssume, setAskAssume] = useState(false);
  // every ticket seen while searching, so a choice made under one search is not lost under another
  const known = useRef(new Map());

  const load = async (q, page) => {
    setLoading(true);
    setFailed(false);
    try {
      const { data: res } = await api.get("/forward/targets", { params: { q, page } });
      const tickets = (res.tickets || []).filter((t) => String(t.id) !== String(fromTicketId));
      tickets.forEach((t) => known.current.set(t.id, t));
      setData((d) => ({ tickets: page > 1 ? [...d.tickets, ...tickets] : tickets, contacts: page > 1 ? d.contacts : res.contacts || [], hasMore: !!res.hasMore, page }));
    } catch (err) {
      setFailed(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    setSelected([]);
    setSelectedContacts([]);
    setFilter("");
    setAskAssume(false);
    known.current = new Map();
    load("", 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fromTicketId]);

  // the search runs on the server a moment after the person stops typing
  const firstSearch = useRef(true);
  useEffect(() => {
    if (!open) return undefined;
    if (firstSearch.current) { firstSearch.current = false; return undefined; }
    const timer = setTimeout(() => load(filter, 1), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const toggle = (t) => {
    if (t.windowClosed) return;
    setAskAssume(false);
    setSelected((s) => (s.includes(t.id) ? s.filter((x) => x !== t.id) : [...s, t.id]));
  };
  const toggleContact = (id) => {
    setAskAssume(false);
    setSelectedContacts((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const total = selected.length + selectedContacts.length;
  const waitingCount = selected.filter((id) => (known.current.get(id) || {}).waiting).length;

  const send = async (confirmed) => {
    if (waitingCount > 0 && !confirmed) {
      setAskAssume(true);
      return;
    }
    setSending(true);
    try {
      // one or several messages, in the order they were written
      const list = messages && messages.length ? messages : [message];
      const body = { messageIds: list.map((m) => m.id), ticketIds: selected, contactIds: selectedContacts, confirmAssume: !!confirmed };
      // the server checks everything now and sends in the background: the window closes at once
      const { data: res } = await api.post("/messages/forward-batch", body);
      onClose();
      trackForward(res);
    } catch (err) {
      toastError(err);
    }
    setSending(false);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Encaminhar mensagem</DialogTitle>
      <DialogContent>
        <div className={classes.search}>
          <Search style={{ fontSize: 20 }} />
          <InputBase fullWidth placeholder="Buscar conversa ou contato" value={filter} onChange={(e) => setFilter(e.target.value)} inputProps={{ "aria-label": "Buscar conversa ou contato" }} />
        </div>
        <div className={classes.list}>
          {failed ? (
            <div className={classes.empty}>
              Não foi possível carregar as conversas. <Button size="small" color="primary" onClick={() => load(filter, 1)}>Tentar de novo</Button>
            </div>
          ) : loading && data.tickets.length === 0 && data.contacts.length === 0 ? (
            <div className={classes.empty}><CircularProgress size={22} /></div>
          ) : data.tickets.length === 0 && data.contacts.length === 0 ? (
            <div className={classes.empty}>{filter.trim() ? "Nenhuma conversa ou contato com esse nome ou número." : "Nenhuma conversa aberta para receber a mensagem."}</div>
          ) : (
            <>
              {data.tickets.length > 0 && <div className={classes.section}>Conversas</div>}
              {data.tickets.map((t) => (
                <div key={`t-${t.id}`} className={`${classes.row} ${t.windowClosed ? classes.rowOff : ""}`} onClick={() => toggle(t)} aria-disabled={t.windowClosed || undefined}>
                  <Checkbox color="primary" checked={selected.includes(t.id)} disabled={t.windowClosed} style={{ padding: 4 }} inputProps={{ "aria-label": t.name || "Conversa" }} />
                  <Avatar src={t.profilePicUrl || undefined} style={{ width: 36, height: 36 }}>{String(t.name || "").charAt(0)}</Avatar>
                  <div className={classes.name}>
                    {t.name || "Sem nome"}
                    <div className={classes.sub}>{[t.queueName, t.connectionName].filter(Boolean).join(" · ") || "Sem fila"}</div>
                    {t.windowClosed && <div className={classes.warn}>Fora da janela de 24 h do número oficial</div>}
                    {!t.windowClosed && t.waiting && <div className={classes.warn}>Aguardando atendimento</div>}
                  </div>
                </div>
              ))}
              {data.hasMore && (
                <div className={classes.more}>
                  <Button size="small" color="primary" disabled={loading} onClick={() => load(filter, data.page + 1)}>{loading ? "Carregando…" : "Carregar mais"}</Button>
                </div>
              )}
              {data.contacts.length > 0 && <div className={classes.section}>Contatos sem conversa aberta</div>}
              {data.contacts.map((c) => (
                <div key={`c-${c.id}`} className={classes.row} onClick={() => toggleContact(c.id)}>
                  <Checkbox color="primary" checked={selectedContacts.includes(c.id)} style={{ padding: 4 }} inputProps={{ "aria-label": c.name || "Contato" }} />
                  <Avatar src={c.profilePicUrl || undefined} style={{ width: 36, height: 36 }}>{String(c.name || "").charAt(0)}</Avatar>
                  <div className={classes.name}>
                    {c.name || phoneText(c.number)}
                    <div className={classes.sub}>{phoneText(c.number)} · abre uma conversa nova</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        {askAssume && (
          <div className={classes.confirm} role="alert">
            Ao encaminhar, você assume {waitingCount} {waitingCount === 1 ? "conversa que está aguardando" : "conversas que estão aguardando"} atendimento.
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined" color="secondary">Cancelar</Button>
        <Button onClick={() => send(askAssume)} variant="contained" color="primary" disabled={!total || sending}>
          {sending ? <CircularProgress size={18} /> : askAssume ? "Assumir e encaminhar" : `Encaminhar${total ? ` (${total})` : ""}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ForwardDialog;
