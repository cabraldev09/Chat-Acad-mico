import React from "react";
import { toast } from "react-toastify";

import api from "../services/api";
import openSocket from "../services/socket-io";
import { i18n } from "../translate/i18n";

// a reason the server sent (an error code), in words
export const reasonText = (code) => {
  const key = `backendErrors.${code}`;
  return code && i18n.exists(key) ? i18n.t(key) : "Não foi possível enviar.";
};

// the reason of the first pair that did not go, in words
export const failureReason = (pairs) => {
  const code = ((pairs || []).find((x) => x && x.reason) || {}).reason;
  return code ? reasonText(code) : "";
};

// The reasons of the pairs that did not go, one line per reason, with who it was for: "Maria, João: a janela de 24 horas encerrou"
export const failureLines = (pairs) => {
  const byReason = new Map();
  (pairs || []).forEach((p) => {
    if (!p) return;
    const key = p.reason || "";
    if (!byReason.has(key)) byReason.set(key, new Set());
    if (p.name) byReason.get(key).add(p.name);
  });
  return [...byReason.entries()].map(([code, names]) => {
    const who = [...names].slice(0, 3).join(", ") + (names.size > 3 ? ` e mais ${names.size - 3}` : "");
    return `${who ? `${who}: ` : ""}${reasonText(code)}`;
  });
};

const Failed = ({ done, failed, pairs, onRetry }) => (
  <div>
    <div style={{ fontWeight: 700 }}>{done} {done === 1 ? "enviada" : "enviadas"}, {failed} não {failed === 1 ? "saiu" : "saíram"}</div>
    <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13 }}>
      {failureLines(pairs).map((line) => <li key={line}>{line}</li>)}
    </ul>
    <button type="button" onClick={(e) => { e.stopPropagation(); onRetry(); }}
      style={{ marginTop: 8, border: 0, borderRadius: 8, padding: "6px 12px", font: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "#d97706", color: "#fff" }}>
      Tentar de novo
    </button>
  </div>
);

// What the person forwarded keeps going in the background: a toast shows "Enviando 3/12" and ends with the result. What did not go
// says why, per person, and "Tentar de novo" sends only those pairs.
export const trackForward = ({ batchId, total }) => {
  const id = `fwd-${batchId}`;
  toast.info(`Enviando 0/${total}...`, { toastId: id, autoClose: false });
  let socket;
  const stop = () => { try { socket && socket.disconnect(); } catch (e) { /* already closed */ } };
  try {
    socket = openSocket();
    socket.on("forwardProgress", (p) => {
      if (p.batchId !== batchId) return;
      if (!p.finished) {
        toast.update(id, { render: `Enviando ${p.done + p.failed}/${p.total}...` });
        return;
      }
      stop();
      if (p.failed) {
        const retry = async () => {
          toast.dismiss(id);
          try {
            const { data } = await api.post("/messages/forward-batch", { pairs: (p.failedPairs || []).map(({ messageId, ticketId }) => ({ messageId, ticketId })), confirmAssume: true });
            trackForward(data);
          } catch (err) {
            const code = err && err.response && err.response.data && (err.response.data.error || err.response.data.message);
            toast.error(reasonText(code));
          }
        };
        toast.update(id, { render: <Failed done={p.done} failed={p.failed} pairs={p.failedPairs} onRetry={retry} />, type: toast.TYPE.WARNING, autoClose: 20000, closeOnClick: false });
      } else {
        toast.update(id, { render: p.total > 1 ? "Mensagens encaminhadas." : "Mensagem encaminhada.", type: toast.TYPE.SUCCESS, autoClose: 3000 });
      }
    });
    // never leave the toast hanging if the answer gets lost
    setTimeout(() => { stop(); toast.dismiss(id); }, 10 * 60 * 1000);
  } catch (e) {
    toast.update(id, { render: "Encaminhando em segundo plano.", autoClose: 4000 });
  }
};
