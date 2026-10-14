import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import Avatar from "@material-ui/core/Avatar";
import CircularProgress from "@material-ui/core/CircularProgress";
import { BadgeCheck, ShieldCheck, Users } from "lucide-react";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { wa } from "../chat/chatTheme";

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
  };
});

const GroupInfo = () => {
  const classes = useStyles();
  const { ticketId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(false);
    api.get(`/tickets/${ticketId}/group`).then((r) => alive && setData(r.data)).catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [ticketId]);

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
      {data && data.participants.map((p) => (
        <div key={p.id} className={classes.row}>
          <Avatar src={p.profilePicUrl} style={{ width: 34, height: 34 }}>{(p.name || p.number || "?").charAt(0)}</Avatar>
          <div className={classes.name}>
            {p.name || (p.number ? `+${p.number}` : "Participante")}
            {p.name && p.number && <span className={classes.sub}>+{p.number}</span>}
          </div>
          {p.isAdmin && <span className={classes.admin}><ShieldCheck size={11} style={{ verticalAlign: -1 }} /> admin</span>}
          {p.contactId && (
            <button type="button" className={`${classes.staff} ${p.isStaff ? classes.staffOn : ""}`} onClick={() => toggleStaff(p)}
              title={p.isStaff ? "Da equipe (clique para desmarcar)" : "Marcar como da equipe"}>
              <BadgeCheck size={18} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export default GroupInfo;
