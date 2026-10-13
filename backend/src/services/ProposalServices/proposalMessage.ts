import { ProposalParams, ProposalResult } from "./calc";

// The text a consultant sends on WhatsApp together with the PDF: a few short
// messages, in the order people read them. Each block can be copied or edited.
export interface MessageBlock {
  id: "intro" | "summary" | "punctuality" | "validity";
  title: string;
  text: string;
}

interface Input {
  leadName: string;
  courseName: string;
  modalityLabel?: string;
  params: ProposalParams;
  result: ProposalResult;
  generatedAt?: Date;
  intro?: string | null; // template override ({{nome}}, {{curso}})
  closing?: string | null;
}

const brl = (n: number) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n: number) =>
  `${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;

const day = (iso?: string | null): string | null => {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};

const fill = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ""));

export const buildProposalMessages = (i: Input): MessageBlock[] => {
  const { params: p, result: r } = i;
  const first = (i.leadName || "").trim().split(" ")[0] || "";
  const vars = { nome: first, curso: i.courseName };
  const when = i.generatedAt || new Date();
  const today = when.toLocaleDateString("pt-BR", { timeZone: "America/Porto_Velho" });

  const intro = fill(
    i.intro && i.intro.trim()
      ? i.intro
      : "{{nome}}, conforme combinamos, estou te encaminhando a proposta da sua bolsa para o curso de *{{curso}}*. 🎓",
    vars
  );

  const lines: string[] = [];
  lines.push(`*${i.courseName}${i.modalityLabel ? ` | ${i.modalityLabel}` : ""}*`);
  lines.push(`*Duração:* ${p.semesters} semestre${p.semesters > 1 ? "s" : ""}`);
  lines.push(`*Mensalidade normal:* ${brl(p.gross)}`);
  lines.push(`*Bolsa aplicada:* ${pct(r.bolsaApplied)}`);
  lines.push(`*Mensalidade com bolsa:* ${brl(p.firstMonthly)}`);

  const d1 = day(p.firstDueDate);
  const d2 = day(p.secondDueDate);
  if (p.firstExempt) {
    lines.push(`*1ª mensalidade:* isenta${d2 ? ` · a 2ª vence em ${d2}` : ""}`);
  } else if (d1) {
    lines.push(`*Vencimento da 1ª mensalidade:* ${d1}`);
  }
  lines.push(`*Taxa de matrícula:* ${brl(p.enrollmentFee)} no ato`);
  if (p.installments) lines.push(`*Neste semestre:* ${p.installments} parcela${p.installments > 1 ? "s" : ""}`);
  lines.push(`*Demais mensalidades:* vencimento todo dia ${p.dueDay}`);

  if (p.fixedUntilEnd) {
    lines.push("*Mensalidade fixa* até o fim do curso, sem reajuste.");
  } else {
    if (p.hasRegression !== false && Number(p.bolsaFirst) !== Number(p.bolsaNext)) {
      lines.push(`*Bolsa:* ${pct(p.bolsaFirst)} no 1º semestre e ${pct(p.bolsaNext)} a partir do 2º.`);
    } else {
      lines.push("*Bolsa:* mantida durante todo o curso.");
    }
    if (p.hasAdjustment !== false) lines.push("*Reajuste:* semestral e anual, conforme a projeção do documento.");
  }
  lines.push(
    p.installmentsFixed
      ? `*Parcelas:* ${p.installmentsFixed} mensalidades.`
      : "*Parcelas:* mensalidades até o fim do curso."
  );

  const punctuality =
    `O valor de *${brl(r.tiers.onTime)}* já considera o desconto de pontualidade. ` +
    `Pagando entre os dias 11 e 25, o valor passa para *${brl(r.tiers.mid)}*. ` +
    `Após o vencimento, fica *${brl(r.tiers.late)}*.`;

  const validity = fill(
    i.closing && i.closing.trim() ? i.closing : "A condição da proposta é válida na data de hoje ({{hoje}}).",
    { ...vars, hoje: today }
  );

  return [
    { id: "intro", title: "Abertura", text: intro },
    { id: "summary", title: "Resumo (vai junto com o PDF)", text: lines.join("\n") },
    { id: "punctuality", title: "Pontualidade", text: punctuality },
    { id: "validity", title: "Validade", text: validity }
  ];
};
