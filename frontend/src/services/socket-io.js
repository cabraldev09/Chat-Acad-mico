import openSocket from "socket.io-client";
import { currentToken, renewToken } from "./session";
import { getBackendUrl } from "../config";

// Live updates (new messages, ticks, notifications) need a valid login at every (re)connection.
// The access token lasts 15 minutes and the server may restart (an update), so a socket that reconnects with the
// token it had when it was opened is refused and the screen silently stops updating. Here the token is renewed:
//  - every 9 minutes while the system is open, and when the tab comes back;
//  - whenever the server says the token is no longer good (authError), the socket reconnects with the new one.
// the renewal lives in session.js; it is exported from here as well for the places that already import it
export { renewToken, refreshSession } from "./session";

let timerStarted = false;
const startRenewal = () => {
  if (timerStarted) return;
  timerStarted = true;
  setInterval(() => renewToken(), 9 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") renewToken();
  });
};

function createSocket() {
  startRenewal();
  const socket = openSocket(getBackendUrl(), {
    transports: ["websocket", "polling"],
    auth: { token: currentToken() },
  });

  // every new attempt carries the latest token
  socket.io.on("reconnect_attempt", () => {
    socket.auth = { token: currentToken() };
  });

  // the connection came back after a gap (server update, network): lists read what they missed
  let wasConnected = false;
  socket.on("connect", () => {
    if (wasConnected) window.dispatchEvent(new Event("socketReconnected"));
    wasConnected = true;
  });

  // the server refused the token: renew it and connect again (a refused socket does not retry by itself)
  // at most a few tries per minute: a login that cannot be renewed must not turn into a loop of connections
  const tries = [];
  const reauthenticate = async () => {
    const now = Date.now();
    while (tries.length && now - tries[0] > 60000) tries.shift();
    tries.push(now);
    if (tries.length > 4) return;
    const token = await renewToken(true);
    if (!token) return;
    socket.auth = { token };
    // authError arrives immediately before the server closes the connection.
    setTimeout(() => socket.connect(), 50);
  };
  socket.on("authError", reauthenticate);
  socket.on("connect_error", (error) => {
    if (error.message === "ERR_SESSION_EXPIRED") reauthenticate();
  });

  return socket;
}

// ------------------------------------------------------------------ one connection for many components
// Every component used to open its own connection (about ten on the conversations screen), and the server answers each
// event once per connection. Components that need the same thing now share one: `openSocket(key)` gives each of them
// its own handle over the connection of that key; `disconnect()` on a handle removes only what that component listened
// to, and the connection closes when the last handle leaves.
//
// The key stands for the rooms the server puts a connection in (see joinTickets / joinNotification / joinChatBox):
// the lists of conversations rely on the rooms to receive only their own status, so components that join different
// rooms must not share a connection. No key = the connection that joins no room.
const shared = new Map(); // key -> { socket, users, timer }

function openSharedSocket(key = "global") {
  let entry = shared.get(key);
  if (!entry) {
    entry = { socket: createSocket(), users: 0, timer: null };
    shared.set(key, entry);
  }
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  entry.users += 1;
  const { socket } = entry;
  const mine = []; // [event, handler] registered through this handle
  let open = true;

  const handle = {
    on(event, handler) {
      mine.push([event, handler]);
      socket.on(event, handler);
      // a handle that joins an already open connection would never see "connect": give it the one it is waiting for
      if (event === "connect" && socket.connected) setTimeout(() => { if (open) handler(); }, 0);
      return handle;
    },
    off(event, handler) {
      for (let i = mine.length - 1; i >= 0; i -= 1) {
        if (mine[i][0] === event && (!handler || mine[i][1] === handler)) {
          socket.off(event, mine[i][1]);
          mine.splice(i, 1);
        }
      }
      return handle;
    },
    emit: (...args) => socket.emit(...args),
    connect: () => handle,
    get connected() { return socket.connected; },
    disconnect() {
      if (!open) return handle;
      open = false;
      mine.forEach(([event, handler]) => socket.off(event, handler));
      mine.length = 0;
      entry.users -= 1;
      if (entry.users <= 0) {
        // a change of screen closes some components and opens others right away: keep the connection a moment
        entry.timer = setTimeout(() => {
          if (entry.users <= 0) {
            socket.disconnect();
            if (shared.get(key) === entry) shared.delete(key);
          }
        }, 3000);
      }
      return handle;
    },
  };
  return handle;
}

// diagnostics: which connections are open and how many components use each (type window.__socketStats() in the console)
if (typeof window !== "undefined") {
  window.__socketStats = () => Array.from(shared, ([key, e]) => ({ key, components: e.users, connected: e.socket.connected }));
}

export default openSharedSocket;
