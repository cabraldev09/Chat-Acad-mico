import React from "react";
import { toast } from "react-toastify";

import api from "../services/api";
import toastError from "../errors/toastError";

// The small "done here" actions of the boards ("O que fazer agora", "Prioridades"): each one acts at once, says so in a notice with
// "Desfazer", and the undo puts everything back as it was.
const undoToast = (text, onUndo) =>
  toast.success(
    ({ closeToast }) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span>{text}</span>
        <button
          type="button"
          style={{ border: 0, background: "transparent", color: "inherit", fontWeight: 700, textDecoration: "underline", cursor: "pointer", font: "inherit", padding: 0 }}
          onClick={() => { if (closeToast) closeToast(); onUndo(); }}
        >
          Desfazer
        </button>
      </span>
    ),
    { autoClose: 7000 }
  );

const run = async (call, text, undoCall, onUndone) => {
  try {
    await call();
  } catch (err) {
    toastError(err);
    return false;
  }
  undoToast(text, async () => {
    try {
      await undoCall();
      if (onUndone) onUndone();
    } catch (err) {
      toastError(err);
    }
  });
  return true;
};

// a priority leaves the person's list until tomorrow
export const dismissInsight = (key, onUndone) =>
  run(() => api.post("/analytics/insights/dismiss", { key }), "Dispensado até amanhã.", () => api.post("/analytics/insights/dismiss", { key, undo: true }), onUndone);

// the last message of the client needs no answer: out of "Responder agora" until the client writes again
export const dismissReply = (ticketId, onUndone) =>
  run(() => api.post(`/tickets/${ticketId}/reply-dismiss`), "Marcado como resolvido. Volta se o cliente escrever de novo.", () => api.post(`/tickets/${ticketId}/reply-dismiss`, { undo: true }), onUndone);

// the conversation is closed (the same as "Finalizar atendimento")
export const closeTicket = (ticketId, userId, onUndone) =>
  run(() => api.put(`/tickets/${ticketId}`, { status: "closed", userId }), "Atendimento finalizado.", () => api.put(`/tickets/${ticketId}`, { status: "open", userId }), onUndone);

// a task is concluded
export const finishTask = (leadId, taskId, onUndone) =>
  run(() => api.put(`/leads/${leadId}/tasks/${taskId}/done`, { done: true }), "Tarefa concluída.", () => api.put(`/leads/${leadId}/tasks/${taskId}/done`, { done: false }), onUndone);

// the return scheduled with the lead is cleared
export const clearFollowUp = (leadId, previousAt, onUndone) =>
  run(() => api.put(`/leads/${leadId}`, { nextFollowUpAt: null }), "Retorno retirado.", () => api.put(`/leads/${leadId}`, { nextFollowUpAt: previousAt }), onUndone);
