// Unsent text of each conversation, kept on this device (like WhatsApp's "Rascunho"). The list listens to the event.
const key = (id) => `draft:${id}`;

export const getDraft = (id) => {
  try {
    return localStorage.getItem(key(id)) || "";
  } catch (e) {
    return "";
  }
};

export const setDraft = (id, text) => {
  try {
    if (text && text.trim()) localStorage.setItem(key(id), text);
    else localStorage.removeItem(key(id));
  } catch (e) {
    /* storage blocked: the draft just is not kept */
  }
  window.dispatchEvent(new CustomEvent("chatDraft", { detail: { ticketId: Number(id) } }));
};
