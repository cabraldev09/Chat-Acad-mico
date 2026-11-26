import axios from "axios";
import { getBackendUrl } from "../config";

// The login of the person: the access token (15 minutes) and its renewal through the refresh cookie.
// Kept apart from the API client so the client can use it without a circular import.

// a bare client: the renewal must never pass through the interceptors that call it
const bare = axios.create({ baseURL: getBackendUrl(), withCredentials: true });

export const currentToken = () => {
  try {
    return JSON.parse(localStorage.getItem("token"));
  } catch (e) {
    return null;
  }
};

export const expiresInSeconds = (token) => {
  try {
    const payload = JSON.parse(atob(String(token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.exp - Date.now() / 1000;
  } catch (e) {
    return 0;
  }
};

// What a renewal answers:
//  - the new login (data), when it worked;
//  - null, ONLY when the server says the login is gone (401 or 403): the person must sign in again;
//  - a rejection with `transient = true`, when it failed for a reason of the moment (no network, 429, 5xx, a server restarting) even after
//    a few tries (1, 2 and 4 seconds): the person stays signed in and the caller tries again later.
export const RENEW_WAITS = [1000, 2000, 4000];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const renewOnce = async () => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const { data } = await bare.post("/auth/refresh_token");
      localStorage.setItem("token", JSON.stringify(data.token));
      return data;
    } catch (error) {
      const status = error && error.response && error.response.status;
      if (status === 401 || status === 403) return null;
      if (attempt >= RENEW_WAITS.length) {
        error.transient = true;
        throw error;
      }
      await wait(RENEW_WAITS[attempt]);
    }
  }
};

// One renewal at a time for the whole screen: the first load (which reads who is signed in) and any request refused meanwhile share the
// same call, so the server is not asked twice for the same thing. (The login is SLIDING: every renewal makes the server issue a new refresh
// cookie, but it does NOT rotate: the previous cookie stays valid until it expires or a logout changes the person's tokenVersion. Two calls at
// once with the same cookie therefore both work; sharing one is only to spare the server.)
let renewing = null;
export const refreshSession = () => {
  if (!renewing) {
    renewing = renewOnce().finally(() => {
      renewing = null;
    });
  }
  return renewing;
};

export const renewToken = (force = false) => {
  const token = currentToken();
  if (!token) return Promise.resolve(null);
  if (!force && expiresInSeconds(token) > 180) return Promise.resolve(token);
  return refreshSession().then((data) => (data ? data.token : null));
};
