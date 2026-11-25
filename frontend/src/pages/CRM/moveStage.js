// Moving a lead between columns. Taking an enrolled student back to an open column undoes the enrollment (the server asks for the
// confirmation): the person confirms in the system's dialog, and the move is sent again with that answer.
import api from "../../services/api";
import { confirmDialog } from "../../components/ConfirmDialog";

/** true when moved, false when the person gave up; other errors are thrown */
export const putStage = async (leadId, stage, extra = {}) => {
  try {
    await api.put(`/leads/${leadId}/stage`, { stageId: stage.id, ...extra });
    return true;
  } catch (err) {
    const code = err && err.response && err.response.data && err.response.data.error;
    if (code !== "ERR_ENROLL_UNDO_CONFIRM") throw err;
    const ok = await confirmDialog({
      title: "Desfazer a matrícula?",
      message: `O lead volta para “${stage.name}” e deixa de contar como matriculado. A ambientação pendente é cancelada e a tutoria deixa de ver o aluno. Fica registrado no histórico.`,
      confirmText: "Desfazer a matrícula",
      tone: "danger",
    });
    if (!ok) return false;
    await api.put(`/leads/${leadId}/stage`, { stageId: stage.id, ...extra, undoEnroll: true });
    return true;
  }
};
