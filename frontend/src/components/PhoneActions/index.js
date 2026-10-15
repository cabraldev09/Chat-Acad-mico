import React, { useState, useEffect } from "react";
import { useHistory, useParams } from "react-router-dom";
import { Popover, ButtonBase, Typography, Divider, makeStyles } from "@material-ui/core";
import { Phone, MessageSquare, Copy, ExternalLink } from "lucide-react";
import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { validPhone } from "../../utils/phoneNumbers";
import { wa } from "../chat/chatTheme";

const useStyles = makeStyles(theme => {
  const c = wa(theme);
  return {
    link: { color: "inherit", textDecoration: "underline", cursor: "pointer", border: 0, padding: 0, background: "none", font: "inherit", display: "inline" },
    paper: { width: 388, maxWidth: "calc(100vw - 24px)", padding: 14, borderRadius: 24, background: c.panelAlt, color: c.text, boxShadow: "0 5px 24px rgba(0,0,0,.23)", border: "1px solid rgba(127,127,127,.22)" },
    header: { display: "flex", gap: 12, alignItems: "center", padding: "1px 1px 14px" },
    avatar: { width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: "50%", background: theme.palette.action.hover, flexShrink: 0 },
    actions: { borderRadius: 16, overflow: "hidden", background: c.panel },
    action: { width: "100%", display: "flex", justifyContent: "flex-start", gap: 16, textAlign: "left", padding: "15px 18px", fontSize: 14, color: "inherit", "&:hover": { background: theme.palette.action.hover }, "&.Mui-disabled": { opacity: .5 } },
  };
});

const PhoneActions = ({ href, children }) => {
  const classes = useStyles();
  const history = useHistory();
  const { ticketId } = useParams();
  const number = validPhone(String(href || "").replace(/^tel:/, ""));
  const [anchor, setAnchor] = useState(null);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!anchor || !number || !ticketId) return undefined;
    let active = true;
    setState(null);
    api.get(`/tickets/${ticketId}/phone`, { params: { number } })
      .then(({ data }) => { if (active) setState(data); })
      .catch(() => { if (active) setState({ unavailable: true }); });
    return () => { active = false; };
  }, [anchor, number, ticketId]);
  if (!number) return <span>{children}</span>;
  const display = state?.formatted || children || number;
  const chat = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/tickets/${ticketId}/phone`, { number });
      setAnchor(null);
      history.push(`/tickets/${data.id}`);
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };
  const subtitle = !ticketId ? "Número de telefone" : !state ? "Verificando o número…" : state.unavailable ? "Não foi possível verificar o WhatsApp agora." : state.registered ? "Esse número de telefone já está no WhatsApp." : "Número válido. Disponibilidade no WhatsApp não confirmada.";
  return <>
    <button type="button" className={classes.link} onClick={e => { e.stopPropagation(); setAnchor(e.currentTarget); }} aria-haspopup="dialog" aria-expanded={!!anchor}>{children}</button>
    <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)}
      anchorOrigin={{ vertical: "top", horizontal: "center" }} transformOrigin={{ vertical: "bottom", horizontal: "center" }} marginThreshold={12}
      PaperProps={{ className: classes.paper, role: "dialog", "aria-label": `Ações para ${number}` }}>
      <div className={classes.header}><div className={classes.avatar}><Phone size={21} /></div><div><Typography style={{ fontWeight: 600, fontSize: 16 }}>{display}</Typography><Typography variant="body2" color="textSecondary" style={{ marginTop: 3, fontSize: 12 }}>{subtitle}</Typography></div></div>
      <div className={classes.actions}>
        {ticketId && <><ButtonBase className={classes.action} disabled={busy || !state?.registered} onClick={chat}><MessageSquare size={22} />Conversar com {display}</ButtonBase><Divider /></>}
        <ButtonBase className={classes.action} component="a" href={`https://wa.me/${number.slice(1)}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={22} />Abrir no WhatsApp</ButtonBase><Divider />
        <ButtonBase className={classes.action} component="a" href={`tel:${number}`}><Phone size={22} />Ligar pelo telefone</ButtonBase><Divider />
        <ButtonBase className={classes.action} onClick={async () => { try { await navigator.clipboard.writeText(number); toast.success("Número copiado."); setAnchor(null); } catch (err) { toastError(err); } }}><Copy size={22} />Copiar número</ButtonBase>
      </div>
    </Popover>
  </>;
};
export default PhoneActions;
