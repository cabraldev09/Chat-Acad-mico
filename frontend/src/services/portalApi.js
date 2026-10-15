import axios from "axios";
import { getBackendUrl } from "../config";

// The Portal do Aluno talks to the server with its own token (not the one of the team): a student never touches the
// staff session, and a staff session is never used here.
const TOKEN_KEY = "portalToken";

export const portalToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
};
export const setPortalToken = (token) => {
  try { if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY); } catch (e) { /* private window */ }
};

const portalApi = axios.create({ baseURL: getBackendUrl() });
portalApi.interceptors.request.use((config) => {
  const token = portalToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default portalApi;
