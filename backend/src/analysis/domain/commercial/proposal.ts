// What the academic result means for the commercial team (ported from the original system): indicators and the
// message for the candidate. It never changes the forecast and promises no financial condition.

export interface CommercialProposalInput {
  studentName: string | null;
  courseName: string | null;
  totalSubjects: number;
  exemptedSubjects: number;
  totalPeriods: number;
  projectedPeriods: number | null;
  estimatedCompletionTerm: string | null;
}

export interface CommercialProposal {
  exemptedPercentage: number;
  savedTerms: number | null;
  isHighValue: boolean;
  highValueReason: string | null;
}

export const buildCommercialProposal = (input: CommercialProposalInput): CommercialProposal => {
  const exemptedPercentage = input.totalSubjects ? Math.round((input.exemptedSubjects / input.totalSubjects) * 100) : 0;
  const savedTerms = input.projectedPeriods !== null && input.totalPeriods > 0 ? Math.max(0, input.totalPeriods - input.projectedPeriods) : null;
  const isHighValue = exemptedPercentage >= 50;
  return { exemptedPercentage, savedTerms, isHighValue, highValueReason: isHighValue ? `${exemptedPercentage}% da grade foi aproveitada.` : null };
};

export const buildCommercialMessage = (input: CommercialProposalInput): string => {
  const proposal = buildCommercialProposal(input);
  return [
    `Olá${input.studentName ? `, ${input.studentName}` : ""}! Temos uma ótima notícia sobre seu aproveitamento curricular 🎓`,
    "",
    input.courseName ? `Curso: *${input.courseName}*` : null,
    `✓ *${input.exemptedSubjects} disciplinas* já aproveitadas (${proposal.exemptedPercentage}% da grade).`,
    proposal.savedTerms !== null && proposal.savedTerms > 0 ? `✓ Projeção de até *${proposal.savedTerms} semestre(s)* a menos no percurso.` : null,
    input.estimatedCompletionTerm ? `✓ Previsão acadêmica de conclusão: *${input.estimatedCompletionTerm}*.` : null,
    "",
    "Vamos conversar para escolher a melhor condição de matrícula?",
    "",
    "*Estimativas sujeitas à oferta de disciplinas, matrícula e condições comerciais vigentes.*"
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
};
