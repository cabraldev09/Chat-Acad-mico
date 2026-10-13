import React, { useState, useContext } from "react";
import { toast } from "react-toastify";
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

import api from "../../services/api";
import ConfirmationModal from "../ConfirmationModal";
import ForwardDialog from "../chat/ForwardDialog";
import { ReplyMessageContext } from "../../context/ReplyingMessage/ReplyingMessageContext";
import toastError from "../../errors/toastError";
import { wa } from "../chat/chatTheme";

const QUICK = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

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

const MessageOptionsMenu = ({ message, menuOpen, handleClose, anchorEl, ticketId }) => {
  const classes = useStyles();
  const { setReplyingMessage } = useContext(ReplyMessageContext);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);

  let mine = null;
  try {
    mine = (message.reactions ? JSON.parse(message.reactions) : []).find((r) => r.fromMe)?.emoji || null;
  } catch (e) {
    mine = null;
  }

  const run = async (fn) => {
    handleClose();
    try {
      await fn();
    } catch (err) {
      toastError(err);
    }
  };

  const react = (emoji) => run(() => api.post(`/messages/${message.id}/react`, { emoji: mine === emoji ? "" : emoji }));
  const copy = () =>
    run(async () => {
      await navigator.clipboard.writeText(message.body || "");
      toast.success("Mensagem copiada.");
    });
  const star = () => run(() => api.put(`/messages/${message.id}/star`, { starred: !message.starred }));

  return (
    <>
      <ConfirmationModal
        title="Apagar mensagem?"
        open={confirmOpen}
        onClose={setConfirmOpen}
        onConfirm={() => run(() => api.delete(`/messages/${message.id}`))}
      >
        A mensagem será apagada para todos na conversa.
      </ConfirmationModal>
      <ForwardDialog open={forwardOpen} onClose={() => setForwardOpen(false)} message={message} fromTicketId={ticketId} />
      <Menu
        anchorEl={anchorEl}
        getContentAnchorEl={null}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        open={menuOpen}
        onClose={handleClose}
      >
        <div className={classes.reactions}>
          {QUICK.map((e) => (
            <button key={e} type="button" className={`${classes.emoji} ${mine === e ? classes.emojiOn : ""}`} onClick={() => react(e)}>
              {e}
            </button>
          ))}
        </div>
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
        {message.fromMe && (
          <MenuItem onClick={() => { setConfirmOpen(true); handleClose(); }}>
            <ListItemIcon className={classes.icon}><DeleteOutline fontSize="small" /></ListItemIcon>
            <ListItemText primary="Apagar" />
          </MenuItem>
        )}
      </Menu>
    </>
  );
};

export default MessageOptionsMenu;
