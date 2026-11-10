import api from "../services/api";

// A reaction shows at once on the screen; the server and the phone are told in the background. If anything fails the
// reaction goes back to what it was and the caller shows the error.
const parse = (raw) => {
  try { return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
};

export const reactNow = async (message, emoji) => {
  const before = message.reactions || null;
  const rest = parse(before).filter((r) => !r.fromMe);
  const after = emoji ? JSON.stringify([...rest, { emoji, fromMe: true, sender: "me" }]) : rest.length ? JSON.stringify(rest) : null;
  const tell = (reactions) => window.dispatchEvent(new CustomEvent("message-reactions", { detail: { id: message.id, reactions } }));
  tell(after);
  try {
    await api.post(`/messages/${message.id}/react`, { emoji });
  } catch (err) {
    tell(before);
    throw err;
  }
};
