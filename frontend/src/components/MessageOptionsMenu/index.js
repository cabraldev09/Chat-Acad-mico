import React, { useState, useContext, useEffect } from "react";
import { toast } from "react-toastify";
import { reactNow } from "../../utils/optimisticReaction";
import { makeStyles } from "@material-ui/core/styles";
import Popover from "@material-ui/core/Popover";
import Divider from "@material-ui/core/Divider";
import Menu from "@material-ui/core/Menu";
import MenuItem from "@material-ui/core/MenuItem";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Typography } from "@material-ui/core";

import api from "../../services/api";
import { phoneText } from "../GroupInfo";
import ForwardDialog from "../chat/ForwardDialog";
import { ReplyMessageContext } from "../../context/ReplyingMessage/ReplyingMessageContext";
import toastError from "../../errors/toastError";
import { wa } from "../chat/chatTheme";
import EmojiPicker from "../EmojiPicker";
import { topEmojis } from "../../utils/emojiUsage";
import { Plus } from "lucide-react";

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
    paper: {
      width: 228, maxWidth: "calc(100vw - 24px)", padding: "5px 0", borderRadius: 16,
      background: theme.palette.type === "dark" ? "rgba(35,45,51,.97)" : "rgba(250,250,250,.97)",
      color: c.text, border: "1px solid rgba(127,127,127,.18)",
      boxShadow: "0 6px 24px rgba(0,0,0,.20), 0 1px 4px rgba(0,0,0,.12)", backdropFilter: "blur(24px)",
      "& .MuiMenuItem-root": { minHeight: 32, padding: "5px 20px", fontSize: 14, lineHeight: "22px", margin: "0 5px", borderRadius: 7 },
      "& .MuiMenuItem-root:hover": { background: theme.palette.type === "dark" ? "#40515c" : "#d9eaf3" },
      "& .MuiDivider-root": { margin: "5px 15px" },
    },
    reactionPaper: { borderRadius: 30, padding: "5px 6px", background: c.panelAlt, boxShadow: "0 3px 14px rgba(0,0,0,.18)" },
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

// Who received, read and listened to a message sent from a number by QR Code, each with the time, as on the phone ("Dados da mensagem")
const when = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const who = (p) => p.name || phoneText(p.number) || "Participante";
export const SeenBy = ({ messageId }) => {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let alive = true;
    setState({ loading: true });
    api.get(`/messages/${messageId}/info`)
      .then((r) => alive && setState({ data: r.data }))
      .catch(() => alive && setState({ error: true }));
    return () => { alive = false; };
  }, [messageId]);
  if (state.loading) return <Typography variant="body2" style={{ marginTop: 12, opacity: 0.75 }}>Consultando o celular…</Typography>;
  if (state.error) return <Typography variant="body2" style={{ marginTop: 12 }}>Não foi possível consultar o celular agora.</Typography>;
  const d = state.data;
  if (!d.available) {
    return d.reason === "channel"
      ? <Typography variant="body2" style={{ marginTop: 12, opacity: 0.75 }}>Quem leu cada mensagem só aparece em números conectados por QR Code.</Typography>
      : d.reason === "phone" ? <Typography variant="body2" style={{ marginTop: 12, opacity: 0.75 }}>O celular não informou quem recebeu esta mensagem (ela pode ser antiga demais ou o número estar desconectado).</Typography> : null;
  }
  const section = (title, list, remaining, empty) => (
    <div style={{ marginTop: 14 }}>
      <Typography variant="subtitle2">{title}{list.length ? ` (${list.length})` : ""}</Typography>
      {list.length === 0 && <Typography variant="body2" style={{ opacity: 0.7 }}>{empty}</Typography>}
      {list.map((p) => (
        <div key={`${title}-${p.id}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0", fontSize: 14 }}>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{who(p)}</span>
          <span style={{ flex: "none", opacity: 0.7, fontSize: 12.5 }}>{when(p.at)}</span>
        </div>
      ))}
      {remaining > 0 && <Typography variant="body2" style={{ opacity: 0.7 }}>Faltam {remaining}</Typography>}
    </div>
  );
  return (
    <div>
      {section("Lida por", d.read, d.readRemaining, "Ninguém leu ainda.")}
      {d.played.length > 0 && section("Ouvida por", d.played, d.playedRemaining, "")}
      {section("Entregue a", d.delivery, d.deliveryRemaining, d.read.length ? "Todos que receberam já leram." : "Ainda não foi entregue.")}
    </div>
  );
};

const MessageOptionsMenu = ({ message, menuOpen, handleClose, anchorEl, ticketId, channel = "whatsapp", onSelect }) => {
  // WhatsApp (QR Code and the official API) accepts any emoji: the six most used and "+" for all of them
  const anyEmoji = channel === "whatsapp" || channel === "whatsapp_cloud";
  const palette = anyEmoji ? topEmojis(6) : REACTIONS[channel] || REACTIONS.whatsapp;
  const [allEmojis, setAllEmojis] = useState(false);
  const classes = useStyles();
  const { setReplyingMessage } = useContext(ReplyMessageContext);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [reactionAnchor, setReactionAnchor] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);

  let mine = null;
  try {
    mine = (message.reactions ? JSON.parse(message.reactions) : []).find((r) => r.fromMe)?.emoji || null;
  } catch (e) {
    mine = null;
  }

  const age = Date.now() - new Date(message.createdAt).getTime();
  const isWhatsapp = channel === "whatsapp";
  // WhatsApp's own limits: delete for everyone for about 2 days, edit for about 15 minutes
  // the official API of the Meta cannot delete a message on the contact's phone: there it is "only here"
  const canDeleteForAll = isWhatsapp && !!message.fromMe && age < 2 * 24 * 3600 * 1000;
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
              : message.fromMe && channel === "whatsapp_cloud"
              ? "Pelo número oficial (API da Meta) não é possível apagar no celular do contato. Você pode esconder a mensagem só aqui no sistema."
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
      <Dialog open={infoOpen} onClose={() => setInfoOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Dados da mensagem</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{message.fromMe ? "Enviada" : "Recebida"} em {new Date(message.createdAt).toLocaleString("pt-BR")}</Typography>
          {message.fromMe && <Typography variant="body2" style={{ marginTop: 12 }}>{Number(message.ack) >= 3 ? "Lida" : Number(message.ack) >= 2 ? "Entregue" : Number(message.ack) >= 1 ? "Enviada" : "Aguardando confirmação"}</Typography>}
          {message.isEdited && <Typography variant="body2" style={{ marginTop: 12 }}>Mensagem editada</Typography>}
          {infoOpen && message.fromMe && <SeenBy messageId={message.id} />}
        </DialogContent>
        <DialogActions><Button onClick={() => setInfoOpen(false)}>Fechar</Button></DialogActions>
      </Dialog>
      <Popover open={!!reactionAnchor} anchorEl={reactionAnchor} onClose={() => { setReactionAnchor(null); setAllEmojis(false); }}
        anchorOrigin={{ vertical: "top", horizontal: "right" }} transformOrigin={{ vertical: "bottom", horizontal: "right" }}
        PaperProps={{ className: classes.reactionPaper }}>
        {allEmojis ? <EmojiPicker onSelect={(emoji) => { setReactionAnchor(null); setAllEmojis(false); react(emoji); }} perLine={8} /> : (
        <div style={{ display: "flex", alignItems: "center" }} role="group" aria-label="Reagir à mensagem">
          {palette.map((emoji) => <button key={emoji} type="button" aria-label={`Reagir com ${emoji}`}
            aria-pressed={mine === emoji} className={`${classes.emoji} ${mine === emoji ? classes.emojiOn : ""}`}
            onClick={() => { setReactionAnchor(null); react(emoji); }}>{emoji}</button>)}
          {anyEmoji && <button type="button" aria-label="Mais emojis" title="Mais emojis" className={classes.emoji} onClick={() => setAllEmojis(true)}><Plus size={18} /></button>}
        </div>)}
      </Popover>
      <Menu anchorEl={anchorEl} getContentAnchorEl={null} open={menuOpen} onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}
        marginThreshold={12} PaperProps={{ className: classes.paper }} MenuListProps={{ dense: true, "aria-label": "Ações da mensagem" }}>
        <MenuItem onClick={() => { setReplyingMessage(message); handleClose(); }}>Responder</MenuItem>
        {palette.length > 0 && <MenuItem onClick={() => { setReactionAnchor(anchorEl); handleClose(); }}>Reagir</MenuItem>}
        <MenuItem onClick={star}>{message.starred ? "Desfavoritar" : "Favoritar"}</MenuItem>
        <MenuItem onClick={() => { setForwardOpen(true); handleClose(); }}>Encaminhar</MenuItem>
        {message.body && <MenuItem onClick={copy}>Copiar</MenuItem>}
        {canEdit && <MenuItem onClick={() => { setDraft(message.body || ""); setEditOpen(true); handleClose(); }}>Editar</MenuItem>}
        <MenuItem onClick={() => { setInfoOpen(true); handleClose(); }}>Dados</MenuItem>
        <Divider />
        <MenuItem onClick={() => { setConfirmOpen(true); handleClose(); }}>Apagar</MenuItem>
        {onSelect && <Divider />}
        {onSelect && <MenuItem onClick={() => { onSelect(message); handleClose(); }}>Selecionar mensagens</MenuItem>}
      </Menu>
    </>
  );
};

export default MessageOptionsMenu;
