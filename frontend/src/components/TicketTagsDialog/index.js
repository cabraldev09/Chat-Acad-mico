import React, { useContext, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { Dialog, DialogContent, DialogActions, Button, CircularProgress, InputBase, makeStyles } from "@material-ui/core";
import { Check, Search, Tag, X } from "lucide-react";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";

const useStyles = makeStyles(theme => {
  const dark = theme.palette.type === "dark";
  const line = dark ? "rgba(255,255,255,.12)" : "rgba(15,23,42,.12)";
  return {
    paper: { borderRadius: 18, border: `1px solid ${line}`, margin: 16, width: "calc(100% - 32px)", maxWidth: 460 },
    head: { display: "flex", alignItems: "flex-start", gap: 12, padding: "20px 20px 12px" },
    headIcon: { width: 36, height: 36, flex: "none", borderRadius: 10, display: "grid", placeItems: "center", background: dark ? "rgba(56,189,248,.14)" : "rgba(2,132,199,.10)", color: dark ? "#7dd3fc" : "#0369a1" },
    title: { margin: 0, fontSize: 17, fontWeight: 700, lineHeight: 1.3 },
    sub: { margin: "2px 0 0", fontSize: 13, color: theme.palette.text.secondary },
    close: { marginLeft: "auto", border: 0, background: "transparent", color: theme.palette.text.secondary, width: 36, height: 36, borderRadius: 10, cursor: "pointer", display: "grid", placeItems: "center", "&:hover": { background: theme.palette.action.hover } },
    body: { padding: "4px 20px 12px", overflow: "visible" },
    search: { display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 12px", marginBottom: 12, borderRadius: 10, border: `1px solid ${line}`, color: theme.palette.text.secondary, "&:focus-within": { borderColor: theme.palette.primary.main } },
    list: { display: "flex", flexWrap: "wrap", gap: 8, maxHeight: "min(320px, 50vh)", overflowY: "auto", padding: 2 },
    pill: {
      display: "inline-flex", alignItems: "center", gap: 8, minHeight: 36, padding: "0 14px 0 10px", borderRadius: 999, cursor: "pointer",
      border: `1px solid ${line}`, background: "transparent", color: theme.palette.text.primary, fontFamily: "inherit", fontSize: 13.5, fontWeight: 500,
      transition: "background .15s, border-color .15s",
      "&:hover": { background: theme.palette.action.hover },
      "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
    },
    dot: { width: 10, height: 10, borderRadius: "50%", flex: "none" },
    tick: { width: 16, display: "grid", placeItems: "center", flex: "none" },
    state: { padding: "20px 4px", textAlign: "center", color: theme.palette.text.secondary, fontSize: 13.5, lineHeight: 1.5 },
    foot: { padding: "12px 20px 16px", borderTop: `1px solid ${line}`, gap: 8, flexWrap: "wrap" },
    count: { marginRight: "auto", fontSize: 13, color: theme.palette.text.secondary },
    btn: { height: 38, borderRadius: 10, textTransform: "none", fontWeight: 600, padding: "0 16px" },
  };
});

const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

const TicketTagsDialog = ({ open, onClose, ticket, onSaved }) => {
  const classes = useStyles();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const [tags, setTags] = useState(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  // what the conversation had when the dialog opened: an update of the conversation arriving meanwhile does not undo the choice being made
  const [initial, setInitial] = useState([]);

  const load = () => {
    setFailed(false);
    setTags(null);
    api.get("/tags").then(({ data }) => setTags(Array.isArray(data) ? data : [])).catch(() => setFailed(true));
  };
  useEffect(() => {
    if (!open) return;
    load();
    const now = (ticket?.tags || []).map(t => t.id);
    setInitial(now);
    setSelected(now);
    setQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticket?.id]);

  const toggle = id => setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  const shown = (tags || []).filter(t => !query.trim() || String(t.name).toLowerCase().includes(query.trim().toLowerCase()));
  const changed = !sameSet(selected, initial);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put(`/tickets/${ticket.id}/tags`, { tagIds: selected });
      toast.success("Etiquetas atualizadas.");
      onSaved && onSaved(data.tags);
      onClose();
    } catch (err) {
      toastError(err);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth PaperProps={{ className: classes.paper }} aria-labelledby="tags-title">
      <div className={classes.head}>
        <span className={classes.headIcon}><Tag size={18} /></span>
        <div>
          <h2 id="tags-title" className={classes.title}>Etiquetas da conversa</h2>
          <p className={classes.sub}>Marque o assunto para achar a conversa depois.</p>
        </div>
        <button type="button" className={classes.close} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
      </div>
      <DialogContent className={classes.body}>
        {tags && tags.length > 8 && (
          <label className={classes.search}>
            <Search size={16} />
            <InputBase fullWidth placeholder="Buscar etiqueta" value={query} onChange={e => setQuery(e.target.value)} inputProps={{ "aria-label": "Buscar etiqueta" }} />
          </label>
        )}
        {failed ? (
          <div className={classes.state}>
            Não foi possível carregar as etiquetas.
            <div style={{ marginTop: 10 }}><Button size="small" variant="outlined" onClick={load}>Tentar de novo</Button></div>
          </div>
        ) : !tags ? (
          <div className={classes.state}><CircularProgress size={22} /></div>
        ) : tags.length === 0 ? (
          <div className={classes.state}>
            Nenhuma etiqueta criada ainda.
            {isManager(user) && <div style={{ marginTop: 10 }}><Button size="small" variant="outlined" onClick={() => { onClose(); history.push("/tags"); }}>Criar etiquetas</Button></div>}
          </div>
        ) : shown.length === 0 ? (
          <div className={classes.state}>Nenhuma etiqueta com esse nome.</div>
        ) : (
          <div className={classes.list} role="group" aria-label="Etiquetas">
            {shown.map(t => {
              const on = selected.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  className={classes.pill}
                  onClick={() => toggle(t.id)}
                  style={on ? { borderColor: t.color, background: `${t.color}22` } : undefined}
                >
                  <span className={classes.tick}>{on ? <Check size={15} color={t.color} /> : <span className={classes.dot} style={{ background: t.color }} />}</span>
                  {t.name}
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
      <DialogActions className={classes.foot}>
        <span className={classes.count}>{selected.length === 0 ? "Nenhuma marcada" : selected.length === 1 ? "1 marcada" : `${selected.length} marcadas`}</span>
        <Button onClick={onClose} variant="outlined" className={classes.btn}>Cancelar</Button>
        <Button onClick={save} color="primary" variant="contained" className={classes.btn} disabled={saving || !changed || !tags}>
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TicketTagsDialog;
