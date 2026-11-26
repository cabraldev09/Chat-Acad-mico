// The phone's own "forward" (whatsapp-web.js Message.forward) calls an internal module of WhatsApp Web by name. When WhatsApp Web
// renames it, the call breaks before anything is sent ("Cannot read properties of undefined (reading 'forwardMessages')"): then the
// copy goes the usual way (the file sent again). Any other error (a timeout, the page lost) may have sent it: that stays uncertain.
export const forwardUnavailable = (err: unknown): boolean => {
  const text = String((err as any)?.message || err || "");
  return /reading 'forwardMessages'|forwardMessages is not a function|WAWebChatForwardMessage|forwardMessage is not a function/i.test(text);
};
