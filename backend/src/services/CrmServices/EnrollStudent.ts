import { Op } from "sequelize";

import AppError from "../../errors/AppError";
import Lead from "../../models/Lead";
import LeadCommercial from "../../models/LeadCommercial";
import Student from "../../models/Student";
import { createStudent, normalizeRgm } from "../../analysis/Store";

// THE ENROLLMENT CARRIES THE RGM. The consultant confirms the enrollment with the registration number the institution gave the student:
// it stays on the lead and the student of the portal is created with it at once (the tutor only informs the academic e-mail afterwards).

// the RGM as it is kept, or a refusal the consultant understands
export const rgmOf = (value: unknown): string => {
  const rgm = normalizeRgm(value);
  if (!rgm) throw new AppError("Informe o RGM do aluno para confirmar a matrícula.", 400);
  if (!/^[A-Za-z0-9.\-/]+$/.test(rgm)) throw new AppError("RGM inválido: use só letras, números e traços.", 400);
  return rgm;
};

// an RGM belongs to one student: refused when another lead or another student of the portal already has it (checked before anything changes)
export const assertRgmFree = async (rgm: string, leadId: number): Promise<void> => {
  const other = await Lead.findOne({ where: { rgm, id: { [Op.ne]: leadId } } as any, attributes: ["id", "name"] });
  if (other) throw new AppError(`Este RGM já está na matrícula de ${other.name}. Confira o número.`, 409);
  const student = await Student.findOne({ where: { rgm }, attributes: ["id", "name", "leadId"] });
  if (student && student.leadId && student.leadId !== leadId) throw new AppError(`Este RGM já é do aluno ${student.name} no portal. Confira o número.`, 409);
};

// the student of the portal for this enrollment: created with the RGM, or the one already there (registered by hand before) linked to the lead
export const studentForEnrollment = async (input: { lead: Lead; rgm: string; courseName: string | null; poloId: number | null; tutorId: number | null }): Promise<Student> => {
  const { lead, rgm } = input;
  const existing = await Student.findOne({ where: { rgm } });
  if (existing) {
    await existing.update({
      leadId: lead.id,
      poloId: input.poloId || existing.poloId || null,
      responsibleUserId: input.tutorId || existing.responsibleUserId || null,
      courseName: existing.courseName || input.courseName || null,
      phone: existing.phone || lead.phone || null
    } as any);
    return existing;
  }
  return createStudent({ rgm, name: lead.name, phone: lead.phone || null, courseName: input.courseName, poloId: input.poloId, responsibleUserId: input.tutorId, leadId: lead.id });
};

const phoneText = (phone: string | null | undefined): string => {
  const d = String(phone || "").replace(/\D/g, "");
  return d ? `+${d}` : "não informado";
};

// What the tutor reads when the student arrives: who it is, what was sold and by whom, in one note of the conversation
export const handoverNote = async (input: { lead: Lead; rgm: string; courseName: string | null; poloName: string; consultantName: string | null; note?: string | null }): Promise<string> => {
  const commercial = await LeadCommercial.findOne({ where: { leadId: input.lead.id }, attributes: ["summary"] }).catch(() => null);
  const lines = [
    "Ficha de passagem para a tutoria",
    `Aluno: ${input.lead.name}`,
    `WhatsApp: ${phoneText(input.lead.phone)}`,
    `Curso: ${input.courseName || "não informado"}`,
    `Polo: ${input.poloName}`,
    `RGM: ${input.rgm}`,
    `Consultor: ${input.consultantName || "não informado"}`,
    ...(input.note ? [`Observação do consultor: ${String(input.note).trim()}`] : []),
    ...(commercial && commercial.summary ? [`Resumo do atendimento: ${String(commercial.summary).replace(/\s+/g, " ").trim()}`] : [])
  ];
  return lines.join("\n").slice(0, 1800);
};
