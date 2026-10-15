import openSocket from "socket.io-client";
import api from "./api";
import { getBackendUrl } from "../config";

// Live updates (new messages, ticks, notifications) need a valid login at every (re)connection.
// The access token lasts 15 minutes and the server may restart (an update), so a socket that reconnects with the
// token it had when it was opened is refused and the screen silently stops updating. Here the token is renewed:
//  - every 9 minutes while the system is open, and when the tab comes back;
//  - whenever the server says the token is no longer good (authError), the socket reconnects with the new one.
const currentToken = () => {
  try {
    return JSON.parse(localStorage.getItem("token"));
  } catch (e) {
    return null;
  }
};

const expiresInSeconds = (token) => {
  try {
    const payload = JSON.parse(atob(String(token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.exp - Date.now() / 1000;
  } catch (e) {
    return 0;
  }
};

let renewing = null;
export const renewToken = (force = false) => {
  const token = currentToken();
  if (!token) return Promise.resolve(null);
  if (!force && expiresInSeconds(token) > 180) return Promise.resolve(token);
  if (!renewing) {
    renewing = api
      .post("/auth/refresh_token")
      .then(({ data }) => {
        localStorage.setItem("token", JSON.stringify(data.token));
        api.defaults.headers.Authorization = `Bearer ${data.token}`;
        return data.token;
      })
      .catch(() => null)
      .finally(() => {
        renewing = null;
      });
  }
  return renewing;
};

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
    transports: ["websocket", "polling", "flashsocket"],
    query: { token: currentToken() },
  });

  // every new attempt carries the latest token
  socket.io.on("reconnect_attempt", () => {
    socket.io.opts.query = { token: currentToken() };
  });

  // the connection came back after a gap (server update, network): lists read what they missed
  let wasConnected = false;
  socket.on("connect", () => {
    if (wasConnected) window.dispatchEvent(new Event("socketReconnected"));
    wasConnected = true;
  });

  // the server refused the token: renew it and connect again. A refused socket does not retry by itself, and a plain
  // connect() would reuse the old handshake: the connection is closed so the new attempt carries the new token.
  // Few tries per minute: a login that cannot be renewed must not turn into a loop of connections.
  const authErrors = [];
  socket.on("authError", async () => {
    const now = Date.now();
    while (authErrors.length && now - authErrors[0] > 60000) authErrors.shift();
    authErrors.push(now);
    if (authErrors.length > 3) return;
    const token = await renewToken(true);
    if (!token) return;
    socket.io.opts.query = { token };
    try { socket.io.engine.close(); } catch (e) { /* already closed */ }
    setTimeout(() => socket.connect(), 100);
  });

  return socket;
}

export default connectToSocket;
