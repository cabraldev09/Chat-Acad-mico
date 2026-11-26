// THE OFFER OF A RECOVERY CAMPAIGN: what the management decides before the send (the monthly fee: a fixed value or a scholarship over the
// course's price; the enrollment fee or exempt; the start; until when it holds; the approach after the reply). Pure: no database here.
export const APPROACHES = ["ia", "proposta", "consultor"] as const;
export type Approach = typeof APPROACHES[number];

export interface Offer {
  monthlyMode: "fixo" | "bolsa";
  monthly?: number | null;
  bolsaPct?: number | null;
  enrollmentFee?: number | null;
  enrollmentExempt?: boolean;
  startDate?: string | null;
  validUntil: string;
}

const isDay = (v: any): boolean => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const money = (n: number): string => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");
const br = (d: string): string => d.split("-").reverse().join("/");

// what the management typed, checked: a broken offer never goes out (the error code names the field)
export const cleanOffer = (raw: any): Offer => {
  if (!raw || typeof raw !== "object") throw new Error("ERR_OFFER_INVALID");
  const mode = raw.monthlyMode === "bolsa" ? "bolsa" : "fixo";
  const monthly = Number(raw.monthly);
  const bolsa = Number(raw.bolsaPct);
  if (mode === "fixo" && !(monthly > 0 && monthly < 100000)) throw new Error("ERR_OFFER_MONTHLY");
  if (mode === "bolsa" && !(bolsa > 0 && bolsa < 100)) throw new Error("ERR_OFFER_BOLSA");
  const exempt = !!raw.enrollmentExempt;
  const fee = Number(raw.enrollmentFee);
  if (!exempt && !(fee >= 0 && fee < 100000)) throw new Error("ERR_OFFER_FEE");
  if (!isDay(raw.validUntil)) throw new Error("ERR_OFFER_VALID_UNTIL");
  if (raw.startDate && !isDay(raw.startDate)) throw new Error("ERR_OFFER_START");
  return {
    monthlyMode: mode,
    monthly: mode === "fixo" ? Math.round(monthly * 100) / 100 : null,
    bolsaPct: mode === "bolsa" ? Math.round(bolsa * 100) / 100 : null,
    enrollmentFee: exempt ? 0 : Math.round(fee * 100) / 100,
    enrollmentExempt: exempt,
    startDate: raw.startDate || null,
    validUntil: raw.validUntil
  };
};

export interface OfferValues { monthly: number | null; fee: number; exempt: boolean; start: string | null; until: string; text: Record<string, string> }

// the offer for one person: the monthly fee of the scholarship is over the price of the course of that lead (no course, no price: the
// value stays empty and the consultant tells it). The texts fill the {{n}} of the template and what the AI may say.
export const offerFor = (offer: Offer, coursePrice: number | null): OfferValues => {
  const monthly = offer.monthlyMode === "fixo"
    ? Number(offer.monthly) || null
    : coursePrice && coursePrice > 0 ? Math.round(coursePrice * (1 - Number(offer.bolsaPct || 0) / 100) * 100) / 100 : null;
  const fee = offer.enrollmentExempt ? 0 : Number(offer.enrollmentFee) || 0;
  return {
    monthly,
    fee,
    exempt: !!offer.enrollmentExempt,
    start: offer.startDate || null,
    until: offer.validUntil,
    text: {
      oferta_mensalidade: monthly ? money(monthly) : "",
      oferta_taxa: offer.enrollmentExempt || !fee ? "isenta" : money(fee),
      oferta_inicio: offer.startDate ? br(offer.startDate) : "",
      oferta_prazo: br(offer.validUntil)
    }
  };
};

// the offer is still valid on that day (the last day counts)
export const offerValid = (until: string, today: string): boolean => isDay(until) && until >= today;

// what the AI says when the person asks the price during the campaign: only the values the management set, and the next step
export const offerAnswer = (v: OfferValues): string => {
  const parts = [
    v.text.oferta_mensalidade ? `Nesta condição, a mensalidade fica em ${v.text.oferta_mensalidade}` : "Nesta condição, o consultor do seu polo confirma o valor da mensalidade do seu curso",
    v.exempt ? "a taxa de matrícula é isenta" : `a taxa de matrícula é de ${v.text.oferta_taxa}`
  ];
  const start = v.text.oferta_inicio ? ` O início é em ${v.text.oferta_inicio}.` : "";
  return `${parts.join(", e ")}.${start} A condição vale até ${v.text.oferta_prazo}. Quer que eu chame o consultor para fazer a sua matrícula?`;
};

// the values the AI may write (anything else with money, a percentage or a date stays blocked)
// (an exempt fee is said in the words of offerAnswer: "a taxa de matrícula é isenta"; "isenta" alone stays blocked anywhere else)
export const offerTokens = (v: OfferValues): string[] => [v.text.oferta_mensalidade, v.exempt ? "a taxa de matrícula é isenta" : v.text.oferta_taxa, v.text.oferta_inicio, v.text.oferta_prazo].filter(Boolean);

// the first answer after the person replies to a recovery campaign (the template, Utility, carried no value: the offer comes now, inside
// the 24 h window opened by the reply)
export const offerIntro = (v: OfferValues): string => `Que bom falar com você de novo! Separamos uma condição para você retomar os estudos. ${offerAnswer(v)}`;
