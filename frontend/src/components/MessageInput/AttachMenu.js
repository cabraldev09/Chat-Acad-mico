import React, { useEffect, useState } from "react";
import Popover from "@material-ui/core/Popover";
import Dialog from "@material-ui/core/Dialog";
import DialogTitle from "@material-ui/core/DialogTitle";
import DialogContent from "@material-ui/core/DialogContent";
import DialogActions from "@material-ui/core/DialogActions";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Switch from "@material-ui/core/Switch";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import { Autocomplete } from "@material-ui/lab";
import { makeStyles } from "@material-ui/core/styles";
import { AlignLeft, Camera, ClipboardCopy, Folder, Image as ImageIcon, Plus, Trash2, UserCircle2, Zap } from "lucide-react";
import { toast } from "react-toastify";

import api from "../../services/api";
import NewTicketModal from "../NewTicketModal";
import toastError from "../../errors/toastError";
import { wa } from "../chat/chatTheme";

// The "+" menu, like WhatsApp's: round buttons in a grid, each with its name below.
const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  const dark = theme.palette.type === "dark";
  return {
    paper: {
      overflow: "visible !important",
      borderRadius: 26,
      marginTop: -14,
      padding: "22px 18px 14px",
      background: dark ? "#1f2c33" : "#ffffff",
      border: dark ? "1px solid rgba(255,255,255,.08)" : "1px solid rgba(11,20,26,.06)",
      boxShadow: dark ? "0 10px 40px rgba(0,0,0,.55)" : "0 12px 40px rgba(11,20,26,.22), 0 1px 3px rgba(11,20,26,.1)",
      animation: "attachIn .18s cubic-bezier(.22,1,.36,1)",
      // the little tail pointing at the "+" button
      "&::after": {
        content: '""', position: "absolute", left: 24, bottom: -9, width: 20, height: 20, transform: "rotate(45deg)",
        background: dark ? "#233138" : "#ffffff", borderRadius: 4, boxShadow: dark ? "none" : "3px 3px 6px rgba(11,20,26,.06)",
      },
    },
    grid: { display: "grid", gridTemplateColumns: "repeat(4, 96px)", gap: "18px 8px", [theme.breakpoints.down("xs")]: { gridTemplateColumns: "repeat(3, 88px)" } },
    item: {
      display: "flex", flexDirection: "column", alignItems: "center", gap: 8, border: 0, background: "transparent", cursor: "pointer", color: c.text,
      fontFamily: "inherit", fontSize: 13.5, fontWeight: 500, textAlign: "center", padding: 0, lineHeight: 1.25,
      "&:hover $circle": { transform: "scale(1.07)", boxShadow: dark ? "0 4px 14px rgba(0,0,0,.5)" : "0 6px 16px rgba(11,20,26,.16)" },
      "&:active $circle": { transform: "scale(.96)" },
    },
    circle: {
      width: 60, height: 60, borderRadius: "50%", display: "grid", placeItems: "center", border: 0,
      boxShadow: dark ? "0 2px 10px rgba(0,0,0,.45)" : "0 3px 10px rgba(11,20,26,.18)", transition: "transform .15s, box-shadow .15s",
    },
    sign: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginTop: 14, paddingTop: 8, borderTop: `1px solid ${c.divider}`, fontSize: 13.5, fontWeight: 500, color: c.text },
    "@global": { "@keyframes attachIn": { from: { opacity: 0, transform: "translateY(8px) scale(.97)" }, to: { opacity: 1, transform: "none" } } },
  };
});

const PollDialog = ({ open, ticketId, onClose }) => {
  const [title, setTitle] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setTitle(""); setOptions(["", ""]); setMultiple(false); }
  }, [open]);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const valid = title.trim() && filled.length >= 2 && new Set(filled).size === filled.length;

  const send = async () => {
    setBusy(true);
    try {
      await api.post(`/messages/${ticketId}/poll`, { title, options: filled, multiple });
      toast.success("Enquete enviada.");
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Criar enquete</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth variant="outlined" margin="dense" label="Pergunta" value={title} onChange={(e) => setTitle(e.target.value)} inputProps={{ maxLength: 140 }} />
        {options.map((o, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <TextField fullWidth variant="outlined" margin="dense" label={`Opção ${i + 1}`} value={o} inputProps={{ maxLength: 80 }}
              onChange={(e) => { e && e.persist && e.persist(); return (setOptions((list) => list.map((x, j) => (j === i ? e.target.value : x)))); }} />
            {options.length > 2 && (
              <Button size="small" onClick={() => setOptions((list) => list.filter((x, j) => j !== i))} aria-label="Remover opção" style={{ minWidth: 36 }}><Trash2 size={16} /></Button>
            )}
          </div>
        ))}
        {options.length < 12 && (
          <Button size="small" startIcon={<Plus size={15} />} onClick={() => setOptions((list) => [...list, ""])} style={{ marginTop: 4 }}>Adicionar opção</Button>
        )}
        <div><FormControlLabel control={<Switch color="primary" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} />} label="Permitir mais de uma resposta" /></div>
      </DialogContent>
      <DialogActions style={{ padding: "8px 20px 16px" }}>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" color="primary" disabled={!valid || busy} onClick={send}>Enviar</Button>
      </DialogActions>
    </Dialog>
  );
};

const AttachMenu = ({ anchorEl, onClose, inputs, onQuick, signMessage, setSignMessage, ticketId, channel = "whatsapp", isGroup = false }) => {
  const classes = useStyles();
  const [dialog, setDialog] = useState(null);
  const touch = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const whatsapp = channel === "whatsapp";
  // the personal link of the enrollment form goes in this conversation (the lead fills it in on the phone)
  const sendEnrollmentForm = async () => {
    try {
      const { data } = await api.post(`/tickets/${ticketId}/enrollment-form`);
      toast.success(data.progress > 0 ? `Link da ficha enviado. Ela está ${data.progress}% preenchida.` : "Link da ficha de matrícula enviado.");
    } catch (err) {
      toastError(err);
    }
  };

  // each action has its own solid color with a white icon: readable in the light and in the dark theme
  const items = [
    { label: "Arquivo", tone: "#6d5dfc", icon: <Folder size={26} color="#fff" />, run: () => inputs.doc.current && inputs.doc.current.click() },
    { label: "Fotos e vídeos", tone: "#1f6fe5", icon: <ImageIcon size={26} color="#fff" />, run: () => inputs.media.current && inputs.media.current.click() },
    ...(touch ? [{ label: "Câmera", tone: "#d92d5a", icon: <Camera size={26} color="#fff" />, run: () => inputs.camera.current && inputs.camera.current.click() }] : []),
    ...(whatsapp ? [{ label: "Contato", tone: "#c8571e", icon: <UserCircle2 size={26} color="#fff" />, run: () => setDialog("contact") }] : []),
    ...(whatsapp ? [{ label: "Enquete", tone: "#a86b00", icon: <AlignLeft size={26} color="#fff" strokeWidth={2.6} />, run: () => setDialog("poll") }] : []),
    { label: "Respostas rápidas", tone: "#00806a", icon: <Zap size={26} color="#fff" />, run: onQuick },
    ...(ticketId && !isGroup ? [{ label: "Ficha de matrícula", tone: "#0b4279", icon: <ClipboardCopy size={26} color="#fff" />, run: sendEnrollmentForm }] : []),
  ];

  return (
    <>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={onClose}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
        PaperProps={{ className: classes.paper }}
      >
        <div className={classes.grid}>
          {items.map((it) => (
            <button key={it.label} type="button" className={classes.item} onClick={() => { onClose(); it.run(); }}>
              <span className={classes.circle} style={{ background: it.tone }}>{it.icon}</span>
              {it.label}
            </button>
          ))}
        </div>
        <div className={classes.sign}>
          Assinar com meu nome
          <Switch size="small" color="primary" checked={signMessage} onChange={(e) => setSignMessage(e.target.checked)} />
        </div>
      </Popover>
      <NewTicketModal
        modalOpen={dialog === "contact"}
        title="Enviar contato"
        hideNew
        onClose={() => setDialog(null)}
        onPick={async (contact) => {
          try {
            await api.post(`/messages/${ticketId}/contact`, { contactId: contact.id });
            toast.success(`Contato de ${contact.name} enviado.`);
          } catch (err) {
            toastError(err);
          }
        }}
      />
      <PollDialog open={dialog === "poll"} ticketId={ticketId} onClose={() => setDialog(null)} />
    </>
  );
};

export default AttachMenu;
