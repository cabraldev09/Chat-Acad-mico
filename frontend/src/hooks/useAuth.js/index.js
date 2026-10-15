import { useState, useEffect } from "react";
import { useHistory } from "react-router-dom";
import openSocket from "../../services/socket-io";
import { refreshSession } from "../../services/session";
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
  // the API client renews the login by itself (services/api.js); when it cannot, it tells the app to sign out
  useEffect(() => {
    const onExpired = () => clear();
    window.addEventListener("sessionExpired", onExpired);
    return () => window.removeEventListener("sessionExpired", onExpired);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (localStorage.getItem("token")) {
        // shares the renewal with any request that was refused while this one runs
        const data = await refreshSession();
        if (active) {
          if (data) { api.defaults.headers.Authorization = `Bearer ${data.token}`; setIsAuth(true); setUser(data.user); } else clear();
        }
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
