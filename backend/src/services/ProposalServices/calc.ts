// Scholarship proposal maths. The rules were derived from real proposals and
// reproduce them to the cent (see scripts/channels-e2e.js, "proposal" section):
//
//  * Bolsa aplicada      = 1 - primeira mensalidade / mensalidade bruta
//  * Faixas de vencimento = primeira mensalidade, +lateFee1Pct (dias 11 a 25), +lateFee2Pct (depois)
//  * Projeção por semestre, semestre i >= 2:
//      ajuste de bolsa    = bolsaPrimeiroSemestre - bolsaDemais   (apenas no 2º semestre)
//      reajuste semestral = degrau configurável (ex.: 2% do 2º ao 5º, 3% do 6º em diante)
//      reajuste anual     = mínimo (5%) / teto (11%), nos semestres ".1" (janeiro)
//      mensalidade_i      = mensalidade_(i-1) * (1 + (ajuste + semestral + anual)/100)   [sem arredondar no meio]

export interface SemestralStep {
  from: number;
  pct: number;
}

export interface ProposalParams {
  gross: number;
  firstMonthly: number;
  enrollmentFee: number;
  dueDay: number;
  installments: number;
  // semesters the candidate will actually attend (course semesters - entry + 1)
  semesters: number;
  courseSemesters?: number;
  // semester of the course the candidate enters (transfer students start later)
  entrySemester?: number;
  admissionType?: string | null;
  startYear: number;
  startSemester: 1 | 2;
  bolsaFirst: number;
  bolsaNext: number;
  punctualityPct: number;
  lateFee1Pct: number;
  lateFee2Pct: number;
  annualMin: number;
  annualMax: number;
  semestralSchedule: SemestralStep[];
  projectionFrom?: number | null;
  projectionTo?: number | null;
  firstDueDate?: string | null;
}

export interface ProjectionRow {
  semester: number;
  // semester number inside the course (differs from `semester` for transfers)
  courseSemester: number;
  period: string;
  bolsa: number;
  bolsaAdjust: number;
  semestral: number;
  annualMin: number;
  totalMin: number;
  monthlyMin: number;
  annualMax: number;
  totalMax: number;
  monthlyMax: number;
  diff: number;
}

export interface ProposalResult {
  bolsaApplied: number;
  tiers: { onTime: number; mid: number; late: number };
  rows: ProjectionRow[];
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const semestralFor = (schedule: SemestralStep[], i: number): number => {
  let pct = 0;
  [...schedule]
    .sort((a, b) => a.from - b.from)
    .forEach(step => {
      if (i >= step.from) pct = step.pct;
    });
  return pct;
};

export const calcProposal = (p: ProposalParams): ProposalResult => {
  const first = Number(p.firstMonthly);
  const gross = Number(p.gross);
  const bolsaApplied = gross > 0 ? r2((1 - first / gross) * 100) : 0;

  const tiers = {
    onTime: r2(first),
    mid: r2(first * (1 + p.lateFee1Pct / 100)),
    late: r2(first * (1 + p.lateFee2Pct / 100))
  };

  const all: ProjectionRow[] = [];
  let m5 = first;
  let m11 = first;
  let year = p.startYear;
  let sem: number = p.startSemester;

  for (let i = 1; i <= p.semesters; i += 1) {
    if (i > 1) {
      sem = sem === 2 ? 1 : 2;
      if (sem === 1) year += 1;
    }
    const bolsaAdjust = i === 2 ? Number(p.bolsaFirst) - Number(p.bolsaNext) : 0;
    const semestral = i >= 2 ? semestralFor(p.semestralSchedule, i) : 0;
    const a5 = i >= 2 && sem === 1 ? Number(p.annualMin) : 0;
    const a11 = i >= 2 && sem === 1 ? Number(p.annualMax) : 0;
    const t5 = bolsaAdjust + semestral + a5;
    const t11 = bolsaAdjust + semestral + a11;
    if (i > 1) {
      m5 *= 1 + t5 / 100;
      m11 *= 1 + t11 / 100;
    }
    all.push({
      semester: i,
      courseSemester: (p.entrySemester || 1) - 1 + i,
      period: `${year}.${sem}`,
      bolsa: i === 1 ? Number(p.bolsaFirst) : Number(p.bolsaNext),
      bolsaAdjust,
      semestral,
      annualMin: a5,
      totalMin: t5,
      monthlyMin: r2(m5),
      annualMax: a11,
      totalMax: t11,
      monthlyMax: r2(m11),
      diff: i > 1 ? r2(m11 - m5) : 0
    });
  }

  const from = p.projectionFrom && p.projectionFrom > 0 ? p.projectionFrom : 1;
  const to = p.projectionTo && p.projectionTo > 0 ? p.projectionTo : p.semesters;
  return {
    bolsaApplied,
    tiers,
    rows: all.filter(r => r.semester >= from && r.semester <= to)
  };
};
