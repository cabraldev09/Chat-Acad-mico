import React, { useCallback, useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, makeStyles } from "@material-ui/core";
import { Shuffle, MailOpen, X } from "lucide-react";
import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles(theme => ({
  bar: { display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 16px", borderBottom: `1px solid ${theme.palette.divider}`, background: theme.palette.background.paper, fontSize: 12, flexWrap: "wrap" },
  note: { flex: "1 1 260px", whiteSpace: "pre-wrap", lineHeight: 1.5, color: theme.palette.text.primary },
  muted: { color: theme.palette.text.secondary },
  button: { textTransform: "none", borderRadius: 8, fontSize: 12 }
}));

const LABEL = { tutoria: "Chamar a tutoria", atendimento: "Chamar o consultor" };
const seenKey = id => `teamHandoffSeen:${id}`;

// The two sides of a student (consultants on the Atendimento number, tutors on the Tutoria number) never read each other's conversations.
// This bar shows the call received from the other side (with the summary), lets whoever attends call the other side, and offers the
// approved opening template when the official number's 24 hours are closed.
export default function TeamBar({ ticket }) {
  const c = useStyles();
  const [info, setInfo] = useState(null);
  const [dialog, setDialog] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(null);
  const show = !!ticket.id && !ticket.isGroup && ticket.status !== "closed";

  const load = useCallback(() => {
    if (!show) return;
    api.get(`/tickets/${ticket.id}/team-handoff`).then(({ data }) => setInfo(data)).catch(() => setInfo(null));
  }, [ticket.id, show]);
  useEffect(() => {
    load();
    try { setHidden(window.localStorage.getItem(seenKey(ticket.id))); } catch (e) { setHidden(null); }
  }, [load, ticket.id, ticket.userId]);
  // the copilot's summary pointed to the other side: it opens the same dialog
  useEffect(() => {
    const open = e => { if (!e.detail || Number(e.detail.ticketId) === Number(ticket.id)) setDialog(true); };
    window.addEventListener("teamHandoffOpen", open);
    return () => window.removeEventListener("teamHandoffOpen", open);
  }, [ticket.id]);

  if (!show || !info) return null;
  const mine = !!ticket.userId;
  const last = info.last && String(info.last.id) !== hidden ? info.last : null;
  const win = info.window || {};
  const closedWindow = win.official && !win.open;
  if (!last && !(info.canCall && mine) && !(closedWindow && mine)) return null;

  const call = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/tickets/${ticket.id}/handoff-team`, { team: info.canCall, note });
      toast.success(`${info.canCall === "tutoria" ? "A tutoria" : "O consultor"} foi chamado no número ${data.connectionName}.`);
      setDialog(false);
      setNote("");
    } catch (e) { toastError(e); }
    setBusy(false);
  };
  const opening = async () => {
    setBusy(true);
    try { await api.post(`/tickets/${ticket.id}/opening-template`); toast.success("Mensagem de abertura enviada. Quando a pessoa responder, a conversa segue normal."); load(); } catch (e) { toastError(e); }
    setBusy(false);
  };
  const dismiss = () => {
    try { window.localStorage.setItem(seenKey(ticket.id), String(last.id)); } catch (e) { /* only on this screen */ }
    setHidden(String(last.id));
  };

  return <>
    {last && <div className={c.bar} role="status">
      <Shuffle size={15} style={{ marginTop: 2 }} />
      <div className={c.note}>{last.note}</div>
      <Button size="small" className={c.button} startIcon={<X size={13} />} onClick={dismiss}>Dispensar</Button>
    </div>}
    {mine && (info.canCall || closedWindow) && <div className={c.bar}>
      {closedWindow && <span className={c.muted} style={{ flex: "1 1 260px" }}>
        Passaram 24 horas desde a última mensagem desta pessoa neste número oficial: só um modelo aprovado pode reabrir a conversa.
        {!win.template && " Configure o modelo de abertura em Configurações → Tutoria."}
      </span>}
      {!closedWindow && <span style={{ flex: 1 }} />}
      {closedWindow && win.template && <Button size="small" variant="outlined" className={c.button} disabled={busy} startIcon={<MailOpen size={13} />} onClick={opening}>Enviar mensagem de abertura</Button>}
      {info.canCall && <Button size="small" className={c.button} disabled={busy} startIcon={<Shuffle size={13} />} onClick={() => setDialog(true)}>{LABEL[info.canCall]}</Button>}
    </div>}
    <Dialog open={dialog} onClose={() => setDialog(false)} fullWidth maxWidth="sm">
      <DialogTitle>{info.canCall ? LABEL[info.canCall] : "Chamar o outro lado"}</DialogTitle>
      <DialogContent>
        <div className={c.muted} style={{ marginBottom: 12, lineHeight: 1.6 }}>
          {info.canCall === "tutoria" ? "O tutor do aluno" : "O consultor do cliente"} recebe um resumo desta conversa feito pela IA e o seu recado, e fala com a pessoa pelo número {info.canCall === "tutoria" ? "da Tutoria" : "de Atendimento"}. Ele não vê esta conversa, e ela continua com você.
        </div>
        <TextField fullWidth multiline minRows={3} variant="outlined" label="Recado (opcional)" value={note} onChange={e => setNote(e.target.value)} inputProps={{ maxLength: 1000 }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setDialog(false)} disabled={busy}>Cancelar</Button>
        <Button color="primary" variant="contained" onClick={call} disabled={busy || !info.canCall}>Chamar</Button>
      </DialogActions>
    </Dialog>
  </>;
}
