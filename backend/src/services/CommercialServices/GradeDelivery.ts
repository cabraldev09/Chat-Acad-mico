import { Slots } from "./Slots";
import Ticket from "../../models/Ticket";
import { AcademicCtx, findCourse, runAcademicTool } from "./Academic";

// The grade is delivered by the system, not left to the model to remember the tool: the person asked for it, said "yes" to the offer, or the lead
// is about to go to the consultant. Whatever happens, the lead hears the truth (the PDF came, or a person was asked to send it) and a failure
// is never silent: the slots say it (gradeUnavailable) and the hook of the turn turns it into a task.
export interface GradeDelivery {
  // what the person reads after the PDF (or instead of it)
  text: string;
  // the slots the delivery found out / changed
  patch: Slots;
  tools: string[];
  sent: boolean;
  // the PDF did not go out: a person has to
  failed: boolean;
}

interface Deps {
  ticket: Ticket | null;
  // the simulator reads and says what it would do, never sends
  sandbox: boolean;
  agentId: number;
}

const plainName = (n: string): string => String(n || "").replace(/\s*\(.*$/, "").trim();

export const deliverGrade = async (d: Deps, slots: Slots, courseText: string | null, again = false): Promise<GradeDelivery | null> => {
  const ctx: AcademicCtx = { ticket: d.ticket, dryRun: d.sandbox || !d.ticket, slots: { ...slots }, patch: {}, cacheHits: 0, agentId: d.agentId };
  const named = courseText ? await findCourse({ courseName: courseText }) : null;
  const course = named || (slots.courseId || slots.courseName ? await findCourse({ courseId: slots.courseId, courseName: slots.courseName }) : null);
  // no course yet: the model asks which one
  if (!course) return null;
  const sameCourse = Number(slots.courseId) === course.id;
  if (sameCourse && !again) {
    if (slots.gradeSent) return null;
    if (slots.gradeUnavailable) {
      return { text: `Já pedi ao consultor do seu polo para te enviar a grade de ${plainName(course.name)}. Assim que ele tiver o arquivo, chega por aqui.`, patch: {}, tools: [], sent: false, failed: false };
    }
  }
  const found = await runAcademicTool("buscar_grade", { courseId: course.id }, ctx);
  const sent = found && found.gradeId ? await runAcademicTool("enviar_material", { gradeId: found.gradeId }, ctx) : null;
  const base: Slots = { ...ctx.patch, courseId: course.id, courseName: course.name, gradeAsked: true };
  const name = plainName(course.name);

  if (sent && sent.enviado) {
    const text = String(sent.texto_estagio_tutoria || "").trim() || "Qualquer dúvida sobre o estágio ou a rotina do curso, é só me falar.";
    return { text, patch: { ...base, internshipExplained: true, tutoringExplained: true, pendingOffer: null }, tools: ["buscar_grade", "enviar_material"], sent: true, failed: false };
  }
  if (sent && sent.simulado) {
    return { text: `(Simulação: aqui o PDF da grade de ${name} seria enviado.)\n\n${String(sent.texto_estagio_tutoria || "").trim()}`.trim(), patch: { ...base, internshipExplained: true, tutoringExplained: true, pendingOffer: null }, tools: ["buscar_grade", "enviar_material"], sent: true, failed: false };
  }
  // the summary went in writing, or nothing went: a person sends the PDF
  const partial = !!(sent && sent.parcial);
  const text = partial
    ? `Te mandei o resumo da grade de ${name} com os estágios, e já pedi ao consultor do seu polo para enviar o PDF completo.`
    : `Não consegui anexar a grade de ${name} agora, mas já avisei o consultor do seu polo para te enviar o PDF.`;
  return { text, patch: { ...base, gradeUnavailable: true, pendingOffer: null }, tools: found && found.gradeId ? ["buscar_grade", "enviar_material"] : ["buscar_grade"], sent: false, failed: true };
};
