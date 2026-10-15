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

function connectToSocket() {
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

export default connectToSocket;
