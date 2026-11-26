import React from "react";
import { toast } from "react-toastify";
import { labelOfKind, shownText } from "../../utils/mediaLabel";
import { colorOf, initialsOf } from "../../utils/avatar";

// Pop-up for a new message, on any screen of the system: who wrote, what, and a click takes you there.
// It leaves by itself after a few seconds, and when the conversation is opened (dismissMessageToast).
const LABEL = {
  image: "📷 Imagem",
  video: "🎥 Vídeo",
  audio: "🎤 Áudio",
  document: "📄 Documento",
  application: "📄 Documento",
  location: "📍 Localização",
  vcard: "👤 Contato",
};

const previewOf = (message, ticket, contact) => {
  const body = String(message.body || "").replace(/\*|_|~/g, "").trim();
  const kind = labelOfKind(message.mediaType, message.mediaUrl) || LABEL[message.mediaType];
  const caption = shownText(body, message.mediaType, message.mediaUrl);
  let text = kind && (!body || caption === kind) ? kind : kind ? `${kind.split(" ")[0]} ${body}` : body || "Nova mensagem";
  if (ticket.isGroup && message.contact && message.contact.name) text = `${message.contact.name.split(" ")[0]}: ${text}`;
  return text.length > 110 ? `${text.slice(0, 110)}…` : text;
};

// the photo of the contact (QR Code, or read for the official number through a QR connection); otherwise colored initials
const Avatar = ({ contact }) => {
  const [failed, setFailed] = React.useState(false);
  if (contact.profilePicUrl && !failed) return <img className="msgtoast-avatar" src={contact.profilePicUrl} alt="" onError={() => setFailed(true)} />;
  return <span className="msgtoast-avatar msgtoast-initial" style={{ background: colorOf(contact.number || contact.name) }}>{initialsOf(contact.name)}</span>;
};

const Body = ({ ticket, contact, message }) => (
  <div className="msgtoast">
    <Avatar contact={contact} />
    <div className="msgtoast-text">
      <div className="msgtoast-name">{ticket.isGroup ? `${contact.name}` : contact.name}</div>
      <div className="msgtoast-msg">{previewOf(message, ticket, contact)}</div>
    </div>
    <span className="msgtoast-time">{new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</span>
  </div>
);

const idOf = (ticketId) => `msg-${ticketId}`;

export const showMessageToast = ({ ticket, contact, message }, onOpen) => {
  const id = idOf(ticket.id);
  const content = <Body ticket={ticket} contact={contact} message={message} />;
  // a second message from the same conversation replaces the card instead of stacking one per message
  if (toast.isActive(id)) {
    toast.update(id, { render: content, autoClose: 5000, onClick: onOpen });
    return;
  }
  toast(content, {
    toastId: id,
    autoClose: 5000,
    closeButton: false,
    hideProgressBar: false,
    pauseOnFocusLoss: false,
    className: "msgtoast-card",
    progressClassName: "msgtoast-progress",
    onClick: onOpen,
  });
};

export const dismissMessageToast = (ticketId) => toast.dismiss(idOf(ticketId));
