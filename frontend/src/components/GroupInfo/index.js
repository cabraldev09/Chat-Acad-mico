import React, { useContext, useEffect, useMemo, useState } from "react";
import { useHistory, useParams } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import Avatar from "@material-ui/core/Avatar";
import CircularProgress from "@material-ui/core/CircularProgress";
import { BadgeCheck, MessageCircle, ShieldCheck, Users } from "lucide-react";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { wa } from "../chat/chatTheme";
import { AuthContext } from "../../context/Auth/AuthContext";

// Group card in the conversation drawer: description and members (admins first), and who is on the team.
const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  return {
    box: { padding: theme.spacing(2), marginBottom: theme.spacing(1), backgroundColor: c.panel, boxShadow: c.shadow },
    title: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: c.accent, marginBottom: 8 },
    desc: { fontSize: 14, color: c.text, whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 12 },
    row: { display: "flex", alignItems: "center", gap: 10, padding: "6px 0" },
    name: { flex: 1, minWidth: 0, fontSize: 14, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    sub: { display: "block", fontSize: 12, color: c.textSecondary },
    admin: { fontSize: 11, padding: "1px 7px", borderRadius: 999, color: c.accent, border: `1px solid ${c.accent}` },
    staff: { border: 0, background: "transparent", cursor: "pointer", color: c.textSecondary, display: "inline-flex", padding: 4, borderRadius: 6, "&:hover": { color: c.accent } },
    staffOn: { color: "#15803d" },
    muted: { fontSize: 13, color: c.textSecondary },
    search: { width: "100%", boxSizing: "border-box", height: 36, padding: "0 12px", marginBottom: 8, borderRadius: 8, border: `1px solid ${c.divider || "rgba(128,128,128,.35)"}`, background: "transparent", color: c.text, font: "inherit", fontSize: 14, outline: "none", "&:focus": { borderColor: c.accent } },
  };
});

// +55 69 99366-7971, as people read a phone; an internal id of WhatsApp has no phone to show
export const phoneText = (digits) => {
  const d = String(digits || "").replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(d)) {
    const rest = d.slice(4);
    return `+55 ${d.slice(2, 4)} ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  return d ? `+${d}` : "";
};

const GroupInfo = () => {
  const classes = useStyles();
  const { ticketId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const list = (data && data.participants) || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    const digits = q.replace(/\D/g, "");
    return list.filter((p) => String(p.name || "").toLowerCase().includes(q) || (digits && String(p.number || "").includes(digits)));
  }, [data, query]);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(false);
    api.get(`/tickets/${ticketId}/group`).then((r) => alive && setData(r.data)).catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [ticketId]);

  const history = useHistory();
  const { user } = useContext(AuthContext) || {};
  const [opening, setOpening] = useState(null);
  // "Conversar": opens (or reopens) the private conversation with this participant, as on WhatsApp. Someone the system does not know
  // yet is registered with the phone the group shows; a participant whose number WhatsApp hides cannot be reached outside the group.
  const talk = async (p) => {
    setOpening(p.id);
    try {
      let contactId = p.contactId;
      if (!contactId) {
        const { data: found } = await api.post("/contact", { name: p.name || phoneText(p.number), number: p.number, email: "" });
        contactId = found.id;
      }
      const { data: ticket } = await api.post("/tickets", { contactId, userId: user && user.id, status: "open" });
      history.push(`/tickets/${ticket.id}`);
    } catch (err) {
      toastError(err);
    }
    setOpening(null);
  };

  const toggleStaff = async (p) => {
    try {
      await api.put(`/contacts/${p.contactId}/staff`, { isStaff: !p.isStaff });
      setData((d) => ({ ...d, participants: d.participants.map((x) => (x.id === p.id ? { ...x, isStaff: !p.isStaff } : x)) }));
      toast.success(p.isStaff ? "Desmarcado da equipe." : "Marcado como da equipe.");
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <div className={classes.box}>
      <div className={classes.title}><Users size={16} /> {data ? `${data.participants.length} participantes` : "Participantes"}</div>
      {!data && !error && <CircularProgress size={20} />}
      {error && <div className={classes.muted}>Não foi possível ler o grupo agora. Confira se a conexão está ativa.</div>}
      {data && data.description && <div className={classes.desc}>{data.description}</div>}
      {data && data.participants.length === 0 && !error && <div className={classes.muted}>O celular não informou os participantes.</div>}
      {data && data.participants.length > 8 && (
        <input className={classes.search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar participante" aria-label="Buscar participante" />
      )}
      {data && query && shown.length === 0 && <div className={classes.muted}>Ninguém com esse nome ou número.</div>}
      {shown.map((p) => (
        <div key={p.id} className={classes.row}>
          <Avatar src={p.profilePicUrl} style={{ width: 34, height: 34 }}>{(p.name || "?").charAt(0)}</Avatar>
          <div className={classes.name}>
            {p.name || phoneText(p.number) || "Participante"}
            <span className={classes.sub}>{p.name ? (phoneText(p.number) || "Número oculto pelo WhatsApp") : p.number ? "" : "Número oculto pelo WhatsApp"}</span>
          </div>
          {p.isSuperAdmin ? <span className={classes.admin}><ShieldCheck size={11} style={{ verticalAlign: -1 }} /> criador</span>
            : p.isAdmin && <span className={classes.admin}><ShieldCheck size={11} style={{ verticalAlign: -1 }} /> admin</span>}
          {p.number && (
            <button type="button" className={classes.staff} onClick={() => talk(p)} disabled={opening === p.id}
              title="Conversar em particular" aria-label={`Conversar com ${p.name || phoneText(p.number)}`}>
              {opening === p.id ? <CircularProgress size={16} /> : <MessageCircle size={18} />}
            </button>
          )}
          {p.contactId && (
            <button type="button" className={`${classes.staff} ${p.isStaff ? classes.staffOn : ""}`} onClick={() => toggleStaff(p)}
              title={p.isStaff ? "Da equipe (clique para desmarcar)" : "Marcar como da equipe"} aria-label={p.isStaff ? "Desmarcar da equipe" : "Marcar como da equipe"}>
              <BadgeCheck size={18} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export default GroupInfo;
