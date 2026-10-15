import { useState, useEffect } from "react";
import { useHistory } from "react-router-dom";
import openSocket, { renewToken } from "../../services/socket-io";
import { toast } from "react-toastify";
import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useAuth = () => {
  const history = useHistory();
  const [isAuth, setIsAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState({});
  const clear = () => {
    localStorage.removeItem("token");
    delete api.defaults.headers.Authorization;
    setIsAuth(false);
    setUser({});
  };
  useEffect(() => {
    // Register once, and eject on unmount. Registering during render multiplied
    // requests and attempted session refreshes even for legitimate 403 responses.
    const request = api.interceptors.request.use(config => {
      try {
        const token = JSON.parse(localStorage.getItem("token") || "null");
        if (token) config.headers.Authorization = `Bearer ${token}`;
      } catch (_) { localStorage.removeItem("token"); }
      return config;
    });
    const response = api.interceptors.response.use(value => value, async error => {
      const original = error.config;
      const authRequest = /\/auth\/(login|refresh_token|logout|signup)/.test(original?.url || "");
      if (error.response?.status === 401 && original && !authRequest && !original._retry) {
        original._retry = true;
        const token = await renewToken(true);
        if (token) { original.headers.Authorization = `Bearer ${token}`; return api(original); }
      }
      if (error.response?.status === 401 && !/\/auth\/login/.test(original?.url || "")) clear();
      return Promise.reject(error);
    });
    return () => { api.interceptors.request.eject(request); api.interceptors.response.eject(response); };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (localStorage.getItem("token")) {
        try {
          const { data } = await api.post("/auth/refresh_token");
          if (active) {
            localStorage.setItem("token", JSON.stringify(data.token));
            api.defaults.headers.Authorization = `Bearer ${data.token}`;
            setIsAuth(true); setUser(data.user);
          }
        } catch (_) { if (active) clear(); }
      }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isAuth || !user.id) return undefined;
    const socket = openSocket();
    socket.on("user", data => { if (data.action === "update" && Number(data.user.id) === Number(user.id)) setUser(data.user); });
    return () => socket.disconnect();
  }, [isAuth, user.id]);

  const handleLogin = async userData => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", userData);
      localStorage.setItem("token", JSON.stringify(data.token));
      api.defaults.headers.Authorization = `Bearer ${data.token}`;
      setUser(data.user); setIsAuth(true);
      toast.success(i18n.t("auth.toasts.success")); history.push("/tickets");
    } catch (err) { toastError(err); } finally { setLoading(false); }
  };
  const handleLogout = async () => {
    setLoading(true);
    try { await api.delete("/auth/logout"); }
    catch (err) { toastError(err); }
    finally { clear(); setLoading(false); history.push("/login"); }
  };
  return { isAuth, user, loading, handleLogin, handleLogout };
};
export default useAuth;
