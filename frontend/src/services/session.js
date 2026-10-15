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

// One renewal at a time for the whole screen: the first load (which reads who is signed in) and any request refused
// meanwhile share the same call. Two at once would use the same refresh cookie twice, and the second one is refused.
let renewing = null;
export const refreshSession = () => {
  if (!renewing) {
    renewing = bare
      .post("/auth/refresh_token")
      .then(({ data }) => {
        localStorage.setItem("token", JSON.stringify(data.token));
        return data;
      })
      .catch(() => null)
      .finally(() => {
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
