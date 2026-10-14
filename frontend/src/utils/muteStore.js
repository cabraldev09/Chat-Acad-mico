// Per-conversation silence, kept in this browser. A silenced conversation still shows its unread badge,
// but makes no sound and no pop-up.
export const FOREVER = 8640000000000000;
const KEY = "notifications-muted-tickets";

const readAll = () => {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || "{}");
    const now = Date.now();
    const alive = {};
    Object.keys(all).forEach((id) => {
      if (all[id] > now) alive[id] = all[id];
    });
    return alive;
  } catch (e) {
    return {};
  }
};

const writeAll = (all) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch (e) {
    /* private window: the silence only lasts until the page is closed */
  }
  window.dispatchEvent(new CustomEvent("ticketMuteChanged"));
};

export const getTicketMute = (ticketId) => readAll()[ticketId] || 0;
export const isTicketMuted = (ticketId) => getTicketMute(ticketId) > Date.now();

export const muteTicket = (ticketId, until) => {
  const all = readAll();
  all[ticketId] = until;
  writeAll(all);
};

export const unmuteTicket = (ticketId) => {
  const all = readAll();
  delete all[ticketId];
  writeAll(all);
};

const tomorrowMorning = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.getTime();
};

export const MUTE_CHOICES = [
  { label: "1 hora", until: () => Date.now() + 60 * 60 * 1000 },
  { label: "8 horas", until: () => Date.now() + 8 * 60 * 60 * 1000 },
  { label: "Até amanhã 8h", until: tomorrowMorning },
  { label: "Até eu reativar", until: () => FOREVER },
];
