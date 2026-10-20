import { useEffect, useState } from "react";

// "digitando…" of the conversations, shared by the open chat and the lists: who is typing (the lead or the AI agent) and until when.
// The server says it when it starts and when it stops; the expiry only covers a stop that never arrived.
const state = new Map();
const timers = new Map();
const listeners = new Set();

const tell = (ticketId) => listeners.forEach((fn) => fn(String(ticketId)));

export const setTyping = (ticketId, from, kind, ms) => {
  const id = String(ticketId);
  clearTimeout(timers.get(id));
  timers.delete(id);
  if (!kind || kind === "idle") {
    if (state.delete(id)) tell(id);
    return;
  }
  state.set(id, { from: from === "agent" ? "agent" : "contact", kind });
  tell(id);
  timers.set(id, setTimeout(() => { state.delete(id); tell(id); }, Math.min(Math.max(Number(ms) || 6000, 2000), 35000)));
};

// a message arrived from that person: they are not typing anymore
export const clearTyping = (ticketId) => setTyping(ticketId, null, "idle");

export const useTyping = (ticketId) => {
  const [value, setValue] = useState(() => state.get(String(ticketId)) || null);
  useEffect(() => {
    const id = String(ticketId);
    setValue(state.get(id) || null);
    const fn = (changed) => { if (changed === id) setValue(state.get(id) || null); };
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, [ticketId]);
  return value;
};

// the words WhatsApp uses
export const typingText = (t) => (!t ? "" : t.from === "agent" ? "Agente de IA digitando…" : t.kind === "recording" ? "gravando áudio…" : "digitando…");
