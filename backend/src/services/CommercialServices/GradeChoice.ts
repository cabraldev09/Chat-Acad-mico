// Which grade of the catalogue belongs to a course, and what is written under the PDF when it is sent (pure: tested without a database).

const plain = (s: string): string =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const modalityOf = (m: string | null | undefined): string | null => {
  const t = plain(m || "");
  if (!t) return null;
  if (t.includes("semi")) return "semipresencial";
  if (t.includes("ead") || t.includes("distancia")) return "ead";
  if (t.includes("presencial")) return "presencial";
  return t;
};

const termNumber = (t: string | null | undefined): number => {
  const m = String(t || "").match(/(20\d{2})\D*([12])?/);
  return m ? Number(m[1]) * 10 + Number(m[2] || 0) : 0;
};

interface GradeLike {
  id: number;
  courseName: string;
  modality?: string | null;
  curriculumTerm?: string | null;
}

// The course of the catalogue is "Pedagogia" (Semipresencial) while the matrix on file may be "PEDAGOGIA (LICENCIATURA)" (EAD): the name decides,
// and the modality is only a preference. A matrix of another modality is better than "no grade", the agent says how the course is offered.
export const chooseGrade = <G extends GradeLike>(all: G[], course: { name: string; modality?: string | null }, intake: string | null): { grade: G | null; current: boolean } => {
  const name = plain(course.name);
  const modality = modalityOf(course.modality);
  const named = all.filter(g => g.courseName && (plain(g.courseName) === name || plain(g.courseName).replace(/\s*\(.*\)\s*$/, "") === name));
  const loose = named.length ? named : all.filter(g => g.courseName && plain(g.courseName).startsWith(name));
  if (!loose.length) return { grade: null, current: false };
  const sameModality = loose.filter(g => !modality || !g.modality || modalityOf(g.modality) === modality);
  const pool = sameModality.length ? sameModality : loose;
  const newest = [...pool].sort((a, b) => termNumber(b.curriculumTerm) - termNumber(a.curriculumTerm))[0];
  if (!intake) return { grade: newest, current: true };
  const inEffect = pool.filter(g => termNumber(g.curriculumTerm) <= termNumber(intake)).sort((a, b) => termNumber(b.curriculumTerm) - termNumber(a.curriculumTerm));
  const grade = inEffect[0] || newest;
  return { grade, current: grade.id === newest.id };
};

// The text under the PDF: the summary written for WhatsApp (it already lists the internships) when it fits, else a short one built from the
// matrix. Always the internships, because that is what the person asked about; at most 1000 characters (the limit of a caption is 1024).
export const gradeCaption = (grade: { courseName: string; whatsappSummary?: string | null; totalInternshipHours?: number | null }, internships: Array<{ semester: number; discipline: string; hours: number | null }>): string => {
  const summary = String(grade.whatsappSummary || "").trim();
  const usable = summary && !summary.includes("{{");
  const stages = internships.map(s => `• ${s.semester}º semestre: ${s.discipline}${s.hours ? ` (${s.hours} h)` : ""}`);
  const mentionsStages = /est[aá]gio/i.test(summary);
  let text = usable ? summary : `📚 *${String(grade.courseName).replace(/\s*\(.*\)\s*$/, "")}*`;
  if (!mentionsStages && stages.length) text += `\n\n🏫 *Estágio supervisionado*${grade.totalInternshipHours ? `: ${grade.totalInternshipHours} horas no total` : ""}\n${stages.join("\n")}`;
  if (text.length <= 1000) return text;
  // too long: whole lines only, the stages kept
  const lines = text.split("\n");
  const out: string[] = [];
  let size = 0;
  for (const line of lines) {
    if (size + line.length + 1 > 990) break;
    out.push(line);
    size += line.length + 1;
  }
  return out.join("\n").trim();
};

// What the agent says right after the grade: how the internship works and that the tutors follow the student. Only facts of the matrix and of the
// knowledge base (the tutoring guides on documents, deadlines and activities).
export const internshipPitch = (grade: { totalInternshipHours?: number | null }, internships: Array<{ semester: number; discipline: string; hours: number | null }>): string => {
  const tutoring = "A tutoria acompanha você durante todo o curso: orienta sobre plataforma, atividades, provas e prazos";
  if (!internships.length && !(grade.totalInternshipHours || 0)) {
    return `Este curso não tem estágio obrigatório na matriz. ${tutoring}.`;
  }
  const hours = grade.totalInternshipHours || internships.reduce((t, x) => t + (x.hours || 0), 0);
  const first = [...internships].sort((a, b) => a.semester - b.semester)[0];
  const where = internships.length ? ` (${internships.map(x => x.discipline).join(", ")})` : "";
  return `O estágio supervisionado soma ${hours ? `${hours} horas` : "uma carga obrigatória"}${first ? `, a partir do ${first.semester}º semestre` : ""}${where}. Nessa fase a tutoria acompanha você de perto: orienta sobre a documentação, os prazos e as atividades do estágio, e segue com você até o fim do curso.`;
};

// The person already sees the PDF arrive: the agent must not announce it. Whole sentences that say "I sent / I will send the grade" are dropped.
const ANNOUNCE = /(?:^|(?<=[.!?\n]))[^.!?\n]*\b(?:(?:j[aá] )?(?:enviei|encaminhei|mandei|anexei)|vou (?:te )?(?:enviar|encaminhar|mandar|anexar)|estou (?:te )?(?:enviando|encaminhando|mandando)|segue (?:a|o|em anexo)|em anexo)\b[^.!?\n]*\b(?:grade|matriz|pdf|arquivo|curricular)\b[^.!?\n]*[.!?]?|(?:^|(?<=[.!?\n]))[^.!?\n]*\b(?:grade|matriz|pdf)\b[^.!?\n]*\b(?:j[aá] foi enviad[oa]|foi enviad[oa]|j[aá] est[aá] (?:no|em) (?:seu|anexo)|enviad[oa] (?:acima|com))\b[^.!?\n]*[.!?]?/gi;

export const stripGradeAnnouncement = (text: string): string =>
  String(text || "")
    .replace(ANNOUNCE, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \t]+/gm, "")
    .trim();
