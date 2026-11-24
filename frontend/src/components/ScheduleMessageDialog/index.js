import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogActions, Button, InputBase, makeStyles } from "@material-ui/core";
import { CalendarClock, X } from "lucide-react";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const pad = n => String(n).padStart(2, "0");
const dayOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeOf = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const at = (days, hour) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const nextMonday = () => {
  const d = new Date();
  const add = ((8 - d.getDay()) % 7) || 7;
  return at(add, 9);
};
// the quick choices most people want; the fields below take any other day and hour
const QUICK = [
  ["Em 1 hora", () => { const d = new Date(Date.now() + 3600000); d.setSeconds(0, 0); return d; }],
  ["Amanhã às 9h", () => at(1, 9)],
  ["Amanhã às 14h", () => at(1, 14)],
  ["Segunda às 9h", nextMonday],
];
const MAX = 4096;

const useStyles = makeStyles(theme => {
  const dark = theme.palette.type === "dark";
  const line = dark ? "rgba(255,255,255,.12)" : "rgba(15,23,42,.12)";
  return {
    paper: { borderRadius: 18, border: `1px solid ${line}`, margin: 16, width: "calc(100% - 32px)", maxWidth: 520 },
    head: { display: "flex", alignItems: "flex-start", gap: 12, padding: "20px 20px 8px" },
    headIcon: { width: 36, height: 36, flex: "none", borderRadius: 10, display: "grid", placeItems: "center", background: dark ? "rgba(56,189,248,.14)" : "rgba(2,132,199,.10)", color: dark ? "#7dd3fc" : "#0369a1" },
    title: { margin: 0, fontSize: 17, fontWeight: 700, lineHeight: 1.3 },
    sub: { margin: "2px 0 0", fontSize: 13, color: theme.palette.text.secondary, overflowWrap: "anywhere" },
    close: { marginLeft: "auto", border: 0, background: "transparent", color: theme.palette.text.secondary, width: 36, height: 36, borderRadius: 10, cursor: "pointer", display: "grid", placeItems: "center", flex: "none", "&:hover": { background: theme.palette.action.hover } },
    // nothing scrolls inside: the dialog grows with what it holds
    body: { padding: "8px 20px 4px", overflow: "visible" },
    label: { display: "block", fontSize: 12.5, fontWeight: 600, color: theme.palette.text.secondary, margin: "12px 0 6px" },
    quick: { display: "flex", flexWrap: "wrap", gap: 8 },
    chip: {
      height: 34, padding: "0 12px", borderRadius: 999, border: `1px solid ${line}`, background: "transparent", color: theme.palette.text.primary,
      fontFamily: "inherit", fontSize: 13, fontWeight: 500, cursor: "pointer", "&:hover": { background: theme.palette.action.hover },
    },
    chipOn: { borderColor: theme.palette.primary.main, background: dark ? "rgba(56,189,248,.14)" : "rgba(2,132,199,.10)", color: theme.palette.primary.main },
    row: { display: "grid", gridTemplateColumns: "1fr 140px", gap: 8, [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr 1fr" } },
    field: {
      height: 42, padding: "0 12px", borderRadius: 10, border: `1px solid ${line}`, fontSize: 14, colorScheme: dark ? "dark" : "light",
      "&.Mui-focused": { borderColor: theme.palette.primary.main },
    },
    area: { padding: "10px 12px", borderRadius: 10, border: `1px solid ${line}`, fontSize: 14, lineHeight: 1.5, alignItems: "flex-start", "&.Mui-focused": { borderColor: theme.palette.primary.main } },
    when: { marginTop: 8, fontSize: 12.5, color: theme.palette.text.secondary },
    whenBad: { color: theme.palette.error.main },
    meta: { display: "flex", justifyContent: "flex-end", fontSize: 12, color: theme.palette.text.secondary, marginTop: 4 },
    foot: { padding: "12px 20px 16px", gap: 8 },
    btn: { height: 38, borderRadius: 10, textTransform: "none", fontWeight: 600, padding: "0 16px" },
  };
});

const ScheduleMessageDialog = ({ open, onClose, ticket }) => {
  const classes = useStyles();
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  // each time it opens, it starts at "in 1 hour"
  useEffect(() => {
    if (!open) return;
    const d = QUICK[0][1]();
    setDay(dayOf(d));
    setTime(timeOf(d));
  }, [open]);

  const sendAt = day && time ? new Date(`${day}T${time}`) : null;
  const valid = sendAt && !Number.isNaN(sendAt.getTime());
  const past = valid && sendAt.getTime() < Date.now() - 60000;
  const whenText = !valid
    ? "Escolha o dia e a hora."
    : past
    ? "Esse horário já passou. Escolha um dia e uma hora no futuro."
    : `Será enviada ${sendAt.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })} às ${timeOf(sendAt)}.`;
  const quickOn = label => {
    if (!valid) return false;
    const d = QUICK.find(q => q[0] === label)[1]();
    return dayOf(d) === day && timeOf(d) === time;
  };

  const save = async () => {
    if (!body.trim()) return toast.error("Escreva a mensagem.");
    if (!valid || past) return toast.error("Escolha um dia e uma hora no futuro.");
    setSaving(true);
    try {
      await api.post("/schedules", {
        contactId: ticket.contact && ticket.contact.id,
        ticketId: ticket.id,
        whatsappId: ticket.whatsappId,
        body,
        sendAt: sendAt.toISOString(),
      });
      toast.success("Mensagem agendada.");
      setBody("");
      onClose();
    } catch (err) {
      toastError(err);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth scroll="body" PaperProps={{ className: classes.paper }} aria-labelledby="schedule-title">
      <div className={classes.head}>
        <span className={classes.headIcon}><CalendarClock size={18} /></span>
        <div style={{ minWidth: 0 }}>
          <h2 id="schedule-title" className={classes.title}>Agendar mensagem</h2>
          <p className={classes.sub}>Para {ticket?.contact?.name || "este contato"}. Sai sozinha no horário escolhido.</p>
        </div>
        <button type="button" className={classes.close} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
      </div>
      <DialogContent className={classes.body}>
        <span className={classes.label}>Quando</span>
        <div className={classes.quick}>
          {QUICK.map(([label, make]) => (
            <button key={label} type="button" className={`${classes.chip} ${quickOn(label) ? classes.chipOn : ""}`} aria-pressed={quickOn(label)}
              onClick={() => { const d = make(); setDay(dayOf(d)); setTime(timeOf(d)); }}>
              {label}
            </button>
          ))}
        </div>
        <div className={classes.row} style={{ marginTop: 10 }}>
          <InputBase className={classes.field} type="date" value={day} onChange={e => setDay(e.target.value)} inputProps={{ "aria-label": "Dia do envio", min: dayOf(new Date()) }} />
          <InputBase className={classes.field} type="time" value={time} onChange={e => setTime(e.target.value)} inputProps={{ "aria-label": "Hora do envio" }} />
        </div>
        <div className={`${classes.when} ${past || !valid ? classes.whenBad : ""}`} role="status">{whenText}</div>
        <label className={classes.label} htmlFor="schedule-body">Mensagem</label>
        <InputBase id="schedule-body" className={classes.area} fullWidth multiline minRows={4} maxRows={10} placeholder="Escreva a mensagem que será enviada"
          value={body} onChange={e => setBody(e.target.value.slice(0, MAX))} />
        <div className={classes.meta}>{body.length}/{MAX}</div>
      </DialogContent>
      <DialogActions className={classes.foot}>
        <Button onClick={onClose} variant="outlined" className={classes.btn}>Cancelar</Button>
        <Button onClick={save} color="primary" variant="contained" className={classes.btn} disabled={saving || !body.trim() || !valid || past}>
          {saving ? "Agendando..." : "Agendar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ScheduleMessageDialog;
