import React, { useContext, useEffect, useState } from "react";
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
import { AuthContext } from "../../context/Auth/AuthContext";
import { wa } from "./chatTheme";

const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  return {
    search: { display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px", borderRadius: 10, backgroundColor: c.panelAlt, marginBottom: 8, color: c.textSecondary },
    list: { maxHeight: 340, overflowY: "auto", margin: "0 -8px" },
    row: { display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", cursor: "pointer", borderRadius: 8, "&:hover": { backgroundColor: c.hover } },
    name: { flex: 1, minWidth: 0, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    sub: { fontSize: 12, color: c.textSecondary },
    empty: { padding: 24, textAlign: "center", color: c.textSecondary, fontSize: 14 },
  };
});

// Pick the open/waiting conversations a message should be forwarded to.
const ForwardDialog = ({ open, onClose, message, messages, fromTicketId }) => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelected([]);
    setFilter("");
    setLoading(true);
    const queueIds = JSON.stringify((user.queues || []).map((q) => q.id));
    Promise.all(
      ["open", "pending"].map((status) => api.get("/tickets", { params: { status, showAll: "false", queueIds } }))
    )
      .then(([a, b]) => setTickets([...a.data.tickets, ...b.data.tickets].filter((t) => String(t.id) !== String(fromTicketId))))
      .catch(toastError)
      .finally(() => setLoading(false));
  }, [open, user, fromTicketId]);

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const send = async () => {
    setSending(true);
    try {
      // one or several messages, in the order they were written
      const list = messages && messages.length ? messages : [message];
      // the server checks everything now and sends in the background: the window closes at once
      const { data } = await api.post("/messages/forward-batch", { messageIds: list.map((m) => m.id), ticketIds: selected });
      onClose();
      trackForward(data);
    } catch (err) {
      toastError(err);
    }
    setSending(false);
  };

  const shown = tickets.filter((t) => !filter || String((t.contact && t.contact.name) || "").toLowerCase().includes(filter.toLowerCase()));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Encaminhar mensagem</DialogTitle>
      <DialogContent>
        <div className={classes.search}>
          <Search style={{ fontSize: 20 }} />
          <InputBase fullWidth placeholder="Buscar conversa" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div className={classes.list}>
          {loading ? (
            <div className={classes.empty}><CircularProgress size={22} /></div>
          ) : shown.length === 0 ? (
            <div className={classes.empty}>Nenhuma conversa aberta para receber a mensagem.</div>
          ) : (
            shown.map((t) => (
              <div key={t.id} className={classes.row} onClick={() => toggle(t.id)}>
                <Checkbox color="primary" checked={selected.includes(t.id)} style={{ padding: 4 }} />
                <Avatar src={t.contact && t.contact.profilePicUrl} style={{ width: 36, height: 36 }}>{String((t.contact && t.contact.name) || "").charAt(0)}</Avatar>
                <div className={classes.name}>
                  {(t.contact && t.contact.name) || "Sem nome"}
                  <div className={classes.sub}>{t.queue?.name || "Sem fila"}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined" color="secondary">Cancelar</Button>
        <Button onClick={send} variant="contained" color="primary" disabled={!selected.length || sending}>
          {sending ? <CircularProgress size={18} /> : `Encaminhar${selected.length ? ` (${selected.length})` : ""}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ForwardDialog;
