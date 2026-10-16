import React, { useContext, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { PlugZap, X } from "lucide-react";

import { WhatsAppsContext } from "../../context/WhatsApp/WhatsAppsContext";
import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";

// A number that stays disconnected stops receiving messages: the alert says so, with how long it has been down, as soon
// as it is more than a blip (a reconnection takes a minute or two on its own).
const DOWN = { DISCONNECTED: 3, TIMEOUT: 3, qrcode: 15, PAIRING: 15, OPENING: 15 };
const WHAT = { DISCONNECTED: "está desconectada", TIMEOUT: "não responde", qrcode: "está esperando a leitura do QR Code", PAIRING: "está esperando o pareamento", OPENING: "está abrindo há muito tempo" };

const since = (min) => (min < 60 ? `${min} min` : min < 1440 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}` : `${Math.floor(min / 1440)} d`);

const ConnectionAlert = () => {
  const { whatsApps } = useContext(WhatsAppsContext);
  const { user } = useContext(AuthContext);
  const history = useHistory();
  const [now, setNow] = useState(Date.now());
  const [hidden, setHidden] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("connAlertHidden") || "[]"); } catch (e) { return []; }
  });
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  // reconnecting is done on the Conexões screen, which only the management and the owner of the number can use
  const down = (whatsApps || [])
    .filter((w) => isManager(user) || (user && w.ownerId === user.id))
    .filter((w) => DOWN[w.status] !== undefined && w.statusSince)
    .map((w) => ({ w, minutes: Math.floor((now - new Date(w.statusSince).getTime()) / 60000), key: `${w.id}:${w.status}:${w.statusSince}` }))
    .filter((d) => d.minutes >= DOWN[d.w.status] && !hidden.includes(d.key));
  if (!down.length) return null;
  const first = down[0];
  const hide = () => {
    const next = [...hidden, ...down.map((d) => d.key)];
    setHidden(next);
    try { sessionStorage.setItem("connAlertHidden", JSON.stringify(next)); } catch (e) { /* the alert just comes back */ }
  };

  return (
    <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", background: "#fff4e5", color: "#7a3e00", borderBottom: "1px solid #ffd8a8", fontSize: 14 }}>
      <PlugZap size={18} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, lineHeight: 1.4 }}>
        {down.length === 1
          ? <>A conexão <b>{first.w.name}</b> {WHAT[first.w.status]} há {since(first.minutes)}. Enquanto estiver assim, as mensagens desse número não chegam.</>
          : <><b>{down.length} conexões</b> com problema: {down.map((d) => `${d.w.name} (${since(d.minutes)})`).join(", ")}. Enquanto estiverem assim, as mensagens desses números não chegam.</>}
      </span>
      <button type="button" onClick={() => history.push("/connections")} style={{ border: 0, background: "#7a3e00", color: "#fff", borderRadius: 8, padding: "6px 12px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Reconectar</button>
      <button type="button" aria-label="Dispensar o aviso" onClick={hide} style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer", display: "flex" }}><X size={18} /></button>
    </div>
  );
};

export default ConnectionAlert;
