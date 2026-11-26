import React, { useEffect, useState } from "react";
import { CircularProgress } from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";

// The stickers of the number (the ones already received or sent in its conversations): a tap sends it as a WhatsApp sticker.
const StickerPicker = ({ ticketId, onSent }) => {
  const [list, setList] = useState(null);
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(null);
  const load = () => {
    setFailed(false);
    api.get(`/messages/${ticketId}/stickers`).then(({ data }) => setList(data || [])).catch(() => setFailed(true));
  };
  useEffect(load, [ticketId]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async (s) => {
    if (sending) return;
    setSending(s.id);
    try {
      await api.post(`/messages/${ticketId}/sticker`, { messageId: s.id, clientKey: `stk-${s.id}-${Date.now()}` });
      onSent();
    } catch (err) {
      toastError(err);
    }
    setSending(null);
  };
  return (
    <div style={{ width: 320, maxWidth: "calc(100vw - 32px)", maxHeight: 300, overflowY: "auto", padding: 10, borderRadius: 12, background: "var(--surface-1, #fff)", boxShadow: "0 8px 28px rgba(0,0,0,.18)" }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Figurinhas</div>
      {list === null && !failed && <CircularProgress size={20} />}
      {failed && <div style={{ fontSize: 13 }}>Não foi possível carregar as figurinhas. <button type="button" onClick={load} style={{ border: 0, background: "none", color: "var(--accent, #0b6bcb)", font: "inherit", fontWeight: 600, cursor: "pointer" }}>Tentar de novo</button></div>}
      {list && list.length === 0 && <div style={{ fontSize: 13, opacity: 0.75 }}>As figurinhas recebidas ou enviadas neste número aparecem aqui.</div>}
      {list && list.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {list.map((s) => (
            <button key={s.id} type="button" data-compact title="Enviar figurinha" aria-label="Enviar figurinha" disabled={!!sending} onClick={() => send(s)}
              style={{ border: 0, padding: 4, borderRadius: 8, background: "transparent", cursor: "pointer", opacity: sending && sending !== s.id ? 0.5 : 1, aspectRatio: "1 / 1" }}>
              {sending === s.id ? <CircularProgress size={18} /> : <img src={s.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain" }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default StickerPicker;
