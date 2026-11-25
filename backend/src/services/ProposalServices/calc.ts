// Scholarship proposal maths. The rules were derived from real proposals and
// reproduce them to the cent (see scripts/channels-e2e.js, "proposal" section):
//
//  * Bolsa aplicada      = 1 - mensalidade com bolsa / mensalidade bruta
//  * Faixas de vencimento = mensalidade com bolsa, +lateFee1Pct (dias 11 a 25), +lateFee2Pct (depois)
//  * A 1ª mensalidade é um valor à parte (por padrão o mesmo das demais; pode ser isenta, R$ 0): ela não muda a bolsa nem a projeção
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
  // the monthly fee with the scholarship (the one of the 2nd installment on); proposals made before it existed have only firstMonthly
  monthly?: number;
  // what the 1st installment costs (by default the same as the others; 0 when waived)
  firstMonthly: number;
  enrollmentFee: number;
  dueDay: number;
  installments: number;
  // semesters the candidate will actually attend (course semesters - entry + 1)
  semesters: number;
  courseSemesters?: number;
  // semesters beyond the curriculum (adaptations / dependencies)
  extraSemesters?: number;
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
  // rules (all default to the classic behavior)
  hasRegression?: boolean; // discount drops from bolsaFirst to bolsaNext after the 1st semester
  hasAdjustment?: boolean; // semester and yearly adjustments
  fixedUntilEnd?: boolean; // same monthly fee until the end of the course
  installmentsFixed?: number | null; // total installments when fixed (null = until the end of the course)
  firstExempt?: boolean; // 1st monthly fee waived
  secondDueDate?: string | null; // due date of the 2nd monthly fee (shown when the 1st is waived)
  // the class of the entry calendar ("Fevereiro") and the day its subjects open in the AVA (text only, no maths)
  entryTurma?: string | null;
  releaseDate?: string | null;
  // the gross fee was changed by the management (otherwise it is the course's price)
  grossUnlocked?: boolean;
  // "parcelado" (post-graduate, technical, short courses): a fixed number of installments of a fixed value, no semester projection
  planType?: "semestral" | "parcelado";
  // the length of the course in months (installment proposals; shown in the header of the PDF)
  durationMonths?: number | null;
  installmentsTotal?: number | null;
  enrollmentExempt?: boolean;
  // the certification fee, paid when the course is concluded: charged ("charge"), waived ("exempt") or not part of the course ("none")
  certification?: "charge" | "exempt" | "none";
  certificationFee?: number;
  // paid at once (a short professional course): the value and the ways of paying it
  singlePayment?: boolean;
  singleValue?: number | null;
  pixDiscountPct?: number;
  cardInstallments?: number;
  cardRatePct?: number; // % a month
  cardPassInterest?: boolean; // the student pays the card's interest
}

export interface CardPlan { installments: number; ratePct: number; passInterest: boolean; installment: number; total: number }
export interface PaymentPlan { value: number; pixPct: number; pix: number; card: CardPlan | null }
export interface InstallmentPlan {
  installments: number;
  first: number;
  monthly: number;
  total: number;
  single: PaymentPlan | null;
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
  // only in a proposal in installments
  plan?: InstallmentPlan;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// the Pix price: the value with the discount, or the discount of a final value typed by the consultant (one updates the other)
export const pixValueOf = (value: number, pct: number): number => r2(Math.max(0, value) * (1 - Math.min(100, Math.max(0, pct)) / 100));
export const pixPctOf = (value: number, final: number): number => (value > 0 ? r2(Math.min(100, Math.max(0, (1 - final / value) * 100))) : 0);

// the card: n installments at a monthly rate. Passing the interest on, each installment is the one of the card machine (Price table:
// value × i / (1 - (1+i)^-n)); not passing it, the school absorbs it and each installment is value / n.
export const cardPlanOf = (value: number, installments: number, ratePct: number, passInterest: boolean): CardPlan => {
  const n = Math.max(1, Math.min(48, Math.round(installments || 1)));
  const i = Math.max(0, ratePct || 0) / 100;
  const each = passInterest && i > 0 ? (value * i) / (1 - Math.pow(1 + i, -n)) : value / n;
  const installment = r2(each);
  return { installments: n, ratePct: r2(Math.max(0, ratePct || 0)), passInterest: !!passInterest, installment, total: r2(installment * n) };
};

// how many installments a course in installments has: the course's own number, else the model's table by duration ("6 months =
// 12 installments"), else the model's fixed total, else one per month of the course
export const installmentsFor = (
  course: { installmentsTotal?: number | null; durationMonths?: number | null } | null,
  byDuration: Array<{ months: number; installments: number }>,
  fixed?: number | null
): number | null => {
  if (course && Number(course.installmentsTotal) > 0) return Number(course.installmentsTotal);
  const months = course ? Number(course.durationMonths) || 0 : 0;
  const hit = months ? byDuration.find(d => Number(d.months) === months) : null;
  if (hit) return Number(hit.installments);
  if (Number(fixed) > 0) return Number(fixed);
  return months || null;
};

export const parseDurationTable = (v: unknown): Array<{ months: number; installments: number }> => {
  let raw: any = v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    try { raw = JSON.parse(s); } catch (e) {
      // "6=12, 9=15" typed by the management
      raw = s.split(/[\n,;]+/).map(x => x.split("=").map(y => Number(String(y).trim()))).map(([months, installments]) => ({ months, installments }));
    }
  }
  return (Array.isArray(raw) ? raw : [])
    .map((x: any) => ({ months: Math.round(Number(x.months)), installments: Math.round(Number(x.installments)) }))
    .filter(x => x.months > 0 && x.months <= 120 && x.installments > 0 && x.installments <= 120);
};

const installmentPlanOf = (p: ProposalParams): InstallmentPlan => {
  const monthly = baseMonthly(p);
  const n = Math.max(1, Math.round(Number(p.installmentsTotal) || 1));
  const first = n > 1 ? firstPayment(p) : monthly;
  const total = r2(first + monthly * (n - 1));
  let single: PaymentPlan | null = null;
  if (p.singlePayment) {
    // paid at once there is no "1st installment": the value is the installments of the course without the waiver of the 1st
    const value = Number(p.singleValue) > 0 ? Number(p.singleValue) : r2(monthly * n);
    const pixPct = Math.max(0, Number(p.pixDiscountPct) || 0);
    single = {
      value: r2(value),
      pixPct: r2(pixPct),
      pix: pixValueOf(value, pixPct),
      card: Number(p.cardInstallments) > 0 ? cardPlanOf(value, Number(p.cardInstallments), Number(p.cardRatePct) || 0, p.cardPassInterest !== false) : null
    };
  }
  return { installments: n, first: r2(first), monthly: r2(monthly), total, single };
};

export const semestralFor = (schedule: SemestralStep[], i: number): number => {
  let pct = 0;
  [...schedule]
    .sort((a, b) => a.from - b.from)
    .forEach(step => {
      if (i >= step.from) pct = step.pct;
    });
  return pct;
};

// the monthly fee with the scholarship: the base of every value but the 1st installment
export const baseMonthly = (p: Pick<ProposalParams, "monthly" | "firstMonthly">): number =>
  Number(p.monthly) > 0 ? Number(p.monthly) : Number(p.firstMonthly);
// what the 1st installment costs: 0 when waived; a proposal from before "monthly" kept the base in firstMonthly
export const firstPayment = (p: Pick<ProposalParams, "monthly" | "firstMonthly" | "firstExempt">): number =>
  p.firstExempt ? 0 : Number(p.firstMonthly);

export const calcProposal = (p: ProposalParams): ProposalResult => {
  if (p.planType === "parcelado") {
    const plan = installmentPlanOf(p);
    const g = Number(p.gross);
    const bolsa = g > 0 ? r2((1 - plan.monthly / g) * 100) : 0;
    return { bolsaApplied: Math.max(0, bolsa), tiers: { onTime: plan.monthly, mid: plan.monthly, late: plan.monthly }, rows: [], plan };
  }
  const first = baseMonthly(p);
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
    const regression = p.hasRegression !== false && !p.fixedUntilEnd;
    const adjusting = p.hasAdjustment !== false && !p.fixedUntilEnd;
    const bolsaAdjust = i === 2 && regression ? Number(p.bolsaFirst) - Number(p.bolsaNext) : 0;
    const semestral = i >= 2 && adjusting ? semestralFor(p.semestralSchedule, i) : 0;
    const a5 = i >= 2 && sem === 1 && adjusting ? Number(p.annualMin) : 0;
    const a11 = i >= 2 && sem === 1 && adjusting ? Number(p.annualMax) : 0;
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
      bolsa: i === 1 || !regression ? Number(p.bolsaFirst) : Number(p.bolsaNext),
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

const plainLevel = (v: any) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export const parseLevels = (v: any): string[] => {
  let list: any = v;
  if (typeof v === "string") {
    try { list = JSON.parse(v); } catch (e) { list = v.split(/[,;\n]/); }
  }
  return Array.isArray(list) ? [...new Set(list.map((x: any) => String(x || "").trim()).filter(Boolean))] as string[] : [];
};
// a model with no levels serves any course; else the level of the course (or its category, e.g. "Pós-graduação - EAD") must be one
// of them. "Graduação" never matches "Pós-graduação".
export const modelFitsCourse = (courseLevels: any, course?: { level?: string | null; category?: string | null } | null) => {
  const levels = parseLevels(courseLevels).map(plainLevel);
  if (!levels.length) return true;
  if (!course) return false;
  const level = plainLevel(course.level);
  const category = plainLevel(course.category);
  return levels.some(l => level === l || new RegExp(`(^|[^a-z-])${l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z])`).test(category));
};
