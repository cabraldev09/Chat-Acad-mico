import React, { useState, useContext } from "react";
import { toast } from "react-toastify";
import { reactNow } from "../../utils/optimisticReaction";
import { makeStyles } from "@material-ui/core/styles";
import Menu from "@material-ui/core/Menu";
import MenuItem from "@material-ui/core/MenuItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import Reply from "@material-ui/icons/Reply";
import FileCopyOutlined from "@material-ui/icons/FileCopyOutlined";
import Star from "@material-ui/icons/Star";
import StarBorder from "@material-ui/icons/StarBorder";
import Forward from "@material-ui/icons/Forward";
import DeleteOutline from "@material-ui/icons/DeleteOutline";
import Edit from "@material-ui/icons/Edit";
import CheckBoxOutlined from "@material-ui/icons/CheckBoxOutlined";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Typography } from "@material-ui/core";

import api from "../../services/api";
import ForwardDialog from "../chat/ForwardDialog";
import { ReplyMessageContext } from "../../context/ReplyingMessage/ReplyingMessageContext";
import toastError from "../../errors/toastError";
import { wa } from "../chat/chatTheme";

// each channel accepts a different set of reactions; webchat has none
export const REACTIONS = {
  whatsapp: ["👍", "❤️", "😂", "😮", "😢", "🙏"],
  whatsapp_cloud: ["👍", "❤️", "😂", "😮", "😢", "🙏"],
  telegram: ["👍", "❤", "🔥", "😁", "🎉", "🙏"],
  messenger: ["👍", "❤️", "😂", "😮", "😢", "😡"],
  instagram: ["❤️"],
  webchat: [],
};

const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  return {
    reactions: { display: "flex", gap: 2, padding: "4px 10px 8px", borderBottom: `1px solid ${c.divider}`, marginBottom: 4 },
    emoji: {
      width: 36,
      height: 36,
      fontSize: 22,
      lineHeight: "36px",
      textAlign: "center",
      borderRadius: "50%",
      border: "none",
      background: "transparent",
      cursor: "pointer",
      transition: "transform .1s, background-color .1s",
      "&:hover": { backgroundColor: c.hover, transform: "scale(1.18)" },
    },
    emojiOn: { backgroundColor: c.selected },
    icon: { minWidth: 34, color: c.textSecondary },
  };
});

const MessageOptionsMenu = ({ message, menuOpen, handleClose, anchorEl, ticketId, channel = "whatsapp", onSelect }) => {
  const palette = REACTIONS[channel] || REACTIONS.whatsapp;
  const classes = useStyles();
  const { setReplyingMessage } = useContext(ReplyMessageContext);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState("");

  let mine = null;
  try {
    mine = (message.reactions ? JSON.parse(message.reactions) : []).find((r) => r.fromMe)?.emoji || null;
  } catch (e) {
    mine = null;
  }

  const age = Date.now() - new Date(message.createdAt).getTime();
  const isWhatsapp = channel === "whatsapp";
  // WhatsApp's own limits: delete for everyone for about 2 days, edit for about 15 minutes
  const canDeleteForAll = !!message.fromMe && age < 2 * 24 * 3600 * 1000;
  const canEdit = isWhatsapp && !!message.fromMe && !message.mediaUrl && message.mediaType === "chat" && !!message.body && age < 15 * 60 * 1000;

  const run = async (fn) => {
    handleClose();
    try {
      await fn();
    } catch (err) {
      toastError(err);
    }
  };

  const react = (emoji) => run(() => reactNow(message, mine === emoji ? "" : emoji));
  const copy = () =>
    run(async () => {
      await navigator.clipboard.writeText(message.body || "");
      toast.success("Mensagem copiada.");
    });
  const star = () => run(() => api.put(`/messages/${message.id}/star`, { starred: !message.starred }));

  return (
    <>
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Apagar mensagem?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary">
            {canDeleteForAll
              ? "Apagar para todos some também para o contato. Apagar só aqui esconde a mensagem no sistema e não muda nada no WhatsApp."
              : message.fromMe
              ? "O WhatsApp só deixa apagar para todos por cerca de 2 dias. Você pode esconder a mensagem só aqui no sistema; nada muda no WhatsApp."
              : "Esta mensagem é do contato: só dá para escondê-la aqui no sistema, nada muda no WhatsApp."}
          </Typography>
        </DialogContent>
        <DialogActions style={{ flexWrap: "wrap", gap: 8, padding: "8px 16px 16px" }}>
          <Button onClick={() => setConfirmOpen(false)}>Cancelar</Button>
          <Button variant="outlined" onClick={() => { setConfirmOpen(false); run(() => api.delete(`/messages/${message.id}`, { params: { scope: "local" } })); }}>
            Apagar só aqui
          </Button>
          {canDeleteForAll && (
            <Button variant="contained" color="primary" onClick={() => { setConfirmOpen(false); run(() => api.delete(`/messages/${message.id}`)); }}>
              Apagar para todos
            </Button>
          )}
        </DialogActions>
      </Dialog>
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Editar mensagem</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth multiline minRows={3} variant="outlined" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <Typography variant="caption" color="textSecondary" style={{ display: "block", marginTop: 8 }}>
            O contato vê a mensagem com o aviso “editada”. O WhatsApp só permite editar por cerca de 15 minutos.
          </Typography>
        </DialogContent>
        <DialogActions style={{ padding: "8px 16px 16px" }}>
          <Button onClick={() => setEditOpen(false)}>Cancelar</Button>
          <Button variant="contained" color="primary" disabled={!draft.trim() || draft.trim() === (message.body || "").trim()}
            onClick={() => { setEditOpen(false); run(async () => { await api.put(`/messages/${message.id}`, { body: draft.trim() }); toast.success("Mensagem editada."); }); }}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
      <ForwardDialog open={forwardOpen} onClose={() => setForwardOpen(false)} message={message} fromTicketId={ticketId} />
      <Menu
        anchorEl={anchorEl}
        getContentAnchorEl={null}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        open={menuOpen}
        onClose={handleClose}
      >
        {palette.length > 0 && (
          <div className={classes.reactions}>
            {palette.map((e) => (
              <button key={e} type="button" className={`${classes.emoji} ${mine === e ? classes.emojiOn : ""}`} onClick={() => react(e)}>
                {e}
              </button>
            ))}
          </div>
        )}
        <MenuItem onClick={() => { setReplyingMessage(message); handleClose(); }}>
          <ListItemIcon className={classes.icon}><Reply fontSize="small" /></ListItemIcon>
          <ListItemText primary="Responder" />
        </MenuItem>
        {message.body && !message.mediaUrl && (
          <MenuItem onClick={copy}>
            <ListItemIcon className={classes.icon}><FileCopyOutlined fontSize="small" /></ListItemIcon>
            <ListItemText primary="Copiar" />
          </MenuItem>
        )}
        <MenuItem onClick={() => { setForwardOpen(true); handleClose(); }}>
          <ListItemIcon className={classes.icon}><Forward fontSize="small" /></ListItemIcon>
          <ListItemText primary="Encaminhar" />
        </MenuItem>
        <MenuItem onClick={star}>
          <ListItemIcon className={classes.icon}>{message.starred ? <Star fontSize="small" /> : <StarBorder fontSize="small" />}</ListItemIcon>
          <ListItemText primary={message.starred ? "Desfavoritar" : "Favoritar"} />
        </MenuItem>
        {onSelect && (
          <MenuItem onClick={() => { onSelect(message); handleClose(); }}>
            <ListItemIcon className={classes.icon}><CheckBoxOutlined fontSize="small" /></ListItemIcon>
            <ListItemText primary="Selecionar" />
          </MenuItem>
        )}
        {canEdit && (
          <MenuItem onClick={() => { setDraft(message.body || ""); setEditOpen(true); handleClose(); }}>
            <ListItemIcon className={classes.icon}><Edit fontSize="small" /></ListItemIcon>
            <ListItemText primary="Editar" />
          </MenuItem>
        )}
        <MenuItem onClick={() => { setConfirmOpen(true); handleClose(); }}>
          <ListItemIcon className={classes.icon}><DeleteOutline fontSize="small" /></ListItemIcon>
          <ListItemText primary="Apagar" />
        </MenuItem>
      </Menu>
    </>
  );
};

export default MessageOptionsMenu;
