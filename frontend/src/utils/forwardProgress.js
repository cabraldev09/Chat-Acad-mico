import { toast } from "react-toastify";

import openSocket from "../services/socket-io";

// What the person forwarded keeps going in the background: a toast shows "Enviando 3/12" and ends with the result.
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
      if (p.failed) toast.update(id, { render: `${p.done} enviadas, ${p.failed} não saíram. Tente de novo as que faltam.`, type: toast.TYPE.WARNING, autoClose: 8000 });
      else toast.update(id, { render: p.total > 1 ? "Mensagens encaminhadas." : "Mensagem encaminhada.", type: toast.TYPE.SUCCESS, autoClose: 3000 });
    });
    // never leave the toast hanging if the answer gets lost
    setTimeout(() => { stop(); toast.dismiss(id); }, 10 * 60 * 1000);
  } catch (e) {
    toast.update(id, { render: "Encaminhando em segundo plano.", autoClose: 4000 });
  }
};
