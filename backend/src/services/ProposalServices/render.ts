import { logoDataUri, brandLogoDataUri } from "../../helpers/LogoFile";
import { fmtDateTime } from "../../helpers/AppTime";

import { ProposalParams, ProposalResult, firstPayment } from "./calc";

export interface RenderInput {
  title: string; // course name
  modalityLabel?: string; // e.g. "EAD - Graduação"
  leadName: string;
  institution?: { name: string; cnpj?: string | null; logoFile?: string | null; brandColor?: string | null; footer?: string | null } | null;
  params: ProposalParams;
  result: ProposalResult;
  texts: { bolsaNote?: string | null; observation?: string | null; disclaimer?: string | null; finalMessage?: string | null };
  generatedAt: Date;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const brl = (n: number) =>
  `R$ ${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct1 = (n: number) =>
  `${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const pct2 = (n: number) =>
  `${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const dash = (n: number, f: (x: number) => string) => (n ? f(n) : "-");




const fmtDate = (d: Date) => fmtDateTime(d);

// the university's own logo; the Cruzeiro do Sul ones without an upload use the brand's logo (another university without one shows only its name)
const proposalLogo = (inst: RenderInput["institution"]): string | null =>
  logoDataUri(inst?.logoFile) || (/cruzeiro do sul/i.test(String(inst?.name || "")) ? brandLogoDataUri() : null);


// a proposal in installments (post-graduate, technical, short courses): fixed installments, the fees, and the ways of paying it at once
const installmentsHtml = (p: ProposalParams, r: ProposalResult, i: RenderInput, firstDue: string | null, secondDue: string | null): string => {
  const plan = r.plan as NonNullable<ProposalResult["plan"]>;
  const enrollment = p.enrollmentExempt || !(Number(p.enrollmentFee) > 0) ? "isenta" : `${brl(p.enrollmentFee)} <span class="muted">(no ato da inscrição)</span>`;
  const cert =
    p.certification === "charge" && Number(p.certificationFee) > 0
      ? `<div class="kv"><b>Taxa de certificação:</b> ${brl(Number(p.certificationFee))} <span class="muted">(paga ao concluir o curso)</span></div>`
      : p.certification === "exempt"
      ? `<div class="kv"><b>Taxa de certificação:</b> isenta</div>`
      : "";
  const single = plan.single;
  const firstLine = plan.installments > 1 && Math.abs(plan.first - plan.monthly) >= 0.01
    ? `<div class="kv"><b>1ª parcela:</b> ${plan.first === 0 ? `isenta (${brl(0)})` : brl(plan.first)}${firstDue ? ` <span class="muted">(vencimento ${firstDue})</span>` : ""}</div>`
    : firstDue ? `<div class="kv"><b>1ª parcela vence em:</b> ${firstDue}</div>` : "";
  const parcels = single
    ? `<div class="kv"><b>Valor do curso:</b> ${brl(single.value)} <span class="muted">(parcela única)</span></div>${firstDue ? `<div class="kv"><b>Vencimento:</b> ${firstDue}</div>` : ""}`
    : `<div class="kv"><b>Parcelas:</b> ${plan.installments} de ${brl(plan.monthly)} <span class="muted">(valor fixo, sem reajuste)</span></div>${firstLine}
<div class="kv"><b>Demais parcelas:</b> todo dia ${p.dueDay}${secondDue && plan.first === 0 ? ` <span class="muted">(a 2ª vence em ${secondDue})</span>` : ""}</div>`;
  const ways = single
    ? `<h2>Formas de pagamento</h2>
<ul>
<li><b>Boleto:</b> ${brl(single.value)}</li>
${single.pixPct > 0 ? `<li><b>Pix:</b> ${brl(single.pix)} <span class="muted">(${pct1(single.pixPct)} de desconto)</span></li>` : ""}
${single.card ? `<li><b>Cartão de crédito:</b> ${single.card.installments}x de ${brl(single.card.installment)}${single.card.installments > 1 ? (single.card.passInterest && single.card.ratePct > 0 ? ` <span class="muted">(com juros de ${pct2(single.card.ratePct)} ao mês; total ${brl(single.card.total)})</span>` : ` <span class="muted">(sem juros; total ${brl(single.card.total)})</span>`) : ""}</li>` : ""}
</ul>`
    : "";
  const total = single ? single.value : plan.total;
  return `${single ? "" : `<div class="kv"><b>Mensalidade cheia:</b> ${brl(p.gross)}</div>`}
${r.bolsaApplied > 0.004 && !single ? `<div class="kv"><b>Bolsa aplicada:</b> ${pct2(r.bolsaApplied)}${i.texts.bolsaNote ? ` <span class="muted">(${esc(i.texts.bolsaNote)})</span>` : ""}</div>` : ""}
${parcels}
<div class="kv" style="margin-top:8px"><b>Taxa de matrícula:</b> ${enrollment}</div>
${cert}
${i.texts.observation ? `<div class="obs">Observação: ${esc(i.texts.observation)}</div>` : ""}
${ways}
<h2>Produtos ou serviços</h2>
<table class="prod"><thead><tr><th>Produto</th><th>Condição</th><th class="r">Valor</th></tr></thead>
<tbody><tr><td><b>${esc(i.title)}</b>${i.modalityLabel ? `<div class="muted">${esc(i.modalityLabel)}</div>` : ""}</td>
<td>${single ? "Parcela única" : `${plan.installments} parcelas`}</td><td class="r">${brl(total)}</td></tr></tbody></table>
<div class="total"><span>Valor total do curso</span><span>${brl(total)}</span></div>
`;
};

export const renderProposalHtml = (i: RenderInput): string => {
  const { params: p, result: r } = i;
  const logo = proposalLogo(i.institution);
  // the color of the university's brand on the titles of the table (only a valid #RRGGBB reaches the page)
  const brand = /^#[0-9a-fA-F]{6}$/.test(String(i.institution?.brandColor || "")) ? String(i.institution?.brandColor) : null;
  const first = firstPayment(p);
  // the enrollment fee is charged at the act of the enrollment: it is in the order (and its total) unless the proposal waives it
  const fee = Number(p.enrollmentFee) || 0;
  const feeCharged = !p.enrollmentExempt && fee > 0;
  const firstDiscount = p.gross > 0 ? Math.max(0, (1 - first / p.gross) * 100) : 0;
  const firstDue = p.firstDueDate ? new Date(`${p.firstDueDate}T12:00:00`).toLocaleDateString("pt-BR") : null;
  const secondDue = p.secondDueDate ? new Date(`${p.secondDueDate}T12:00:00`).toLocaleDateString("pt-BR") : null;
  const release = p.releaseDate ? new Date(`${p.releaseDate}T12:00:00`).toLocaleDateString("pt-BR") : null;
  // extra rules only appear when a model departs from the classic behavior
  const rules: string[] = [];
  if (p.fixedUntilEnd) rules.push("Mensalidade fixa até o fim do curso, sem reajuste.");
  else {
    if (p.hasRegression === false) rules.push("A bolsa é mantida durante todo o curso.");
    if (p.hasAdjustment === false) rules.push("Sem reajuste semestral ou anual.");
  }
  if (p.installmentsFixed) rules.push(`Total de ${p.installmentsFixed} mensalidades.`);

  const rows = r.rows
    .map(
      row => `<tr>
<td>${row.courseSemester <= (p.courseSemesters || 99) ? `${row.courseSemester}º` : "Adapt."}</td><td>${esc(row.period)}</td><td>${pct1(row.bolsa)}</td>
<td>${dash(row.bolsaAdjust, pct1)}</td><td>${dash(row.semestral, pct1)}</td>
<td>${dash(row.annualMin, pct1)}</td><td>${dash(row.totalMin, pct1)}</td><td class="m">${brl(row.monthlyMin)}</td>
<td>${dash(row.annualMax, pct1)}</td><td>${dash(row.totalMax, pct1)}</td><td class="m">${brl(row.monthlyMax)}</td>
<td>${row.diff ? brl(row.diff) : "-"}</td></tr>`
    )
    .join("");

  const semestralHtml = (): string => `<div class="kv"><b>Mensalidade bruta atual:</b> ${brl(p.gross)}</div>
<div class="kv"><b>Bolsa aplicada:</b> ${pct2(r.bolsaApplied)}${i.texts.bolsaNote ? ` <span class="muted">(${esc(i.texts.bolsaNote)})</span>` : ""}</div>
<div class="kv"><b>Primeira Mensalidade:</b> ${p.firstExempt ? `isenta (${brl(0)})` : brl(first)}${firstDue ? ` <span class="muted">(vencimento ${firstDue})</span>` : ""}${p.firstExempt && secondDue ? ` <span class="muted">(a 2ª mensalidade vence em ${secondDue})</span>` : ""}</div>
<div class="kv" style="margin-top:8px"><b>Taxa de matrícula:</b> ${feeCharged ? `${brl(fee)} <span class="muted">(no ato da inscrição)</span>` : "isenta"}</div>
<div class="kv"><b>Demais mensalidades:</b> todo dia ${p.dueDay}</div>
<div class="kv"><b>Quantidade de parcelas desse semestre:</b> ${p.installments}</div>
${p.entryTurma ? `<div class="kv"><b>Turma de ingresso:</b> ${esc(p.entryTurma)} de ${p.startYear}/${p.startSemester}${release ? ` <span class="muted">(disciplinas liberadas no AVA até ${release})</span>` : ""}</div>` : ""}
${rules.map(t => `<div class="kv muted">${esc(t)}</div>`).join("")}

<h2>2ª mensalidade em diante. (Pontualidade já inclusa de ${p.punctualityPct}%).</h2>
<ul>
<li><b>Até o dia ${p.dueDay}:</b> ${brl(r.tiers.onTime)} <span class="muted">(com desconto de pontualidade de ${p.punctualityPct}%)</span></li>
<li><b>Dias ${p.dueDay + 1} a 25:</b> ${brl(r.tiers.mid)} <span class="muted">(Perde desconto de pontualidade de ${p.lateFee1Pct}%.)</span></li>
<li><b>Após o vencimento:</b> ${brl(r.tiers.late)} <span class="muted">(Perde desconto de pontualidade de ${p.lateFee2Pct}%.)</span></li>
</ul>
${i.texts.observation ? `<div class="obs">Observação: ${esc(i.texts.observation)}</div>` : ""}

<h2>Projeção por semestre</h2>
${i.texts.disclaimer ? `<div class="note">${esc(i.texts.disclaimer)}</div>` : ""}
<table class="proj"><thead><tr>
<th>Sem.</th><th>Período</th><th>Bolsa</th><th>Ajuste bolsa</th><th>Reajuste semestral</th><th>Anual ${Number(p.annualMin)}%</th><th>Ajustes totais ${Number(p.annualMin)}%</th><th>Mensalidade ${Number(p.annualMin)}%</th><th>Anual ${Number(p.annualMax)}%</th><th>Ajustes totais ${Number(p.annualMax)}%</th><th>Mensalidade ${Number(p.annualMax)}%</th><th>Diferença/ mês</th>
</tr></thead><tbody>${rows}</tbody></table>

<h2>Produtos ou serviços</h2>
<table class="prod"><thead><tr><th>Produto</th><th>Preço</th><th>Desconto</th><th class="r">Sub-total</th></tr></thead>
<tbody><tr><td><b>${esc(i.title)}</b>${i.modalityLabel ? `<div class="muted">${esc(i.modalityLabel)}</div>` : ""}<div class="muted">${p.firstExempt ? "1ª mensalidade isenta" : "1ª mensalidade"}</div></td>
<td>${brl(p.gross)}</td><td>${p.firstExempt ? "Isenta" : pct2(firstDiscount)}</td><td class="r">${brl(first)}</td></tr>
<tr><td><b>Taxa de matrícula</b><div class="muted">no ato da inscrição</div></td>
<td>${feeCharged ? brl(fee) : "-"}</td><td>${feeCharged ? "-" : "Isenta"}</td><td class="r">${brl(feeCharged ? fee : 0)}</td></tr></tbody></table>
<div class="total"><span>Valor total do pedido</span><span>${brl(first + (feeCharged ? fee : 0))}</span></div>

`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Proposta - ${esc(i.leadName)}</title>
<style>
@page{size:A4;margin:14mm 12mm}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#1f2937;font:12.5px/1.4 Inter,Geist,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{max-width:820px;margin:0 auto;padding:14px 22px}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:12px}
.head img{max-height:56px;max-width:220px}
.inst{text-align:right;font-size:12px}.inst b{display:block;font-size:13px}
h1{font-size:23px;margin:0 0 3px;letter-spacing:-.02em}
h2{font-size:14.5px;margin:14px 0 6px;break-after:avoid}
.muted{color:#6b7280;font-size:12px}
.kv{margin:2px 0}.kv b{font-weight:700}
ul{margin:6px 0 8px;padding-left:18px}li{margin:2px 0}
.obs{font-style:italic;margin:8px 0}
.note{background:#eaf2ff;border-radius:6px;padding:7px 10px;font-size:11px;color:#374151;margin-bottom:8px}
table{width:100%;border-collapse:collapse}
.proj{font-size:10.5px}
.proj th{color:#2547b3;font-weight:700;text-align:right;padding:6px 5px;border-bottom:1px solid #e5e7eb;background:#f3f6fb}
.proj td{text-align:right;padding:4px 5px;border-bottom:1px solid #eef0f3}
.proj th:first-child,.proj td:first-child,.proj th:nth-child(2),.proj td:nth-child(2){text-align:left}
.proj td.m{font-weight:700;color:#1d3a8a;background:#e8f0ff}
.proj tr:nth-child(even) td{background:#f8f9fb}.proj tr:nth-child(even) td.m{background:#e8f0ff}
.prod th{text-align:left;font-size:11px;color:#6b7280;padding:7px 8px;border-bottom:1px solid #e5e7eb;letter-spacing:.04em;text-transform:uppercase}
.prod td{padding:7px 8px;border-bottom:1px solid #eef0f3}
.prod .r{text-align:right}
.total{break-inside:avoid;display:flex;justify-content:space-between;background:#e8f8ef;padding:9px 10px;margin-top:6px;font-weight:700;border-radius:4px}
.final{margin-top:4px}
${brand ? `.proj th{color:${brand}}.proj td.m{color:${brand}}h1{color:${brand}}` : ""}
.foot{margin-top:14px;padding-top:8px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:10.5px;white-space:pre-line}
.compact{font-size:12px;line-height:1.32}.compact h2{margin:10px 0 5px}.compact .proj td{padding:3px 5px}.compact .proj th{padding:4px 5px}.compact .prod td{padding:5px 8px}.compact .head{margin-bottom:8px}.compact .note{margin-bottom:5px}
</style></head><body><div class="page${r.rows.length > 6 ? " compact" : ""}">
<div class="head">
  <div>${logo ? `<img src="${logo}" alt="">` : ""}</div>
  <div class="inst"><b>${esc(i.institution?.name || "")}</b>${i.institution?.cnpj ? `CNPJ ${esc(i.institution.cnpj)}` : ""}</div>
</div>
<h1>Proposta de Bolsa - ${esc(i.title)}</h1>
<div class="muted">${
  p.planType === "parcelado"
    ? (p.durationMonths ? `Duração: ${p.durationMonths} meses` : "")
    : (p.entrySemester || 1) > 1
    ? `Ingresso no ${p.entrySemester}º semestre${p.admissionType ? ` (${esc(p.admissionType)})` : ""} · ${p.semesters} semestre${p.semesters > 1 ? "s" : ""} a cursar${p.extraSemesters ? ` (inclui ${p.extraSemesters} de adaptação)` : ""}`
    : `Semestres: ${p.semesters}${p.extraSemesters ? ` (inclui ${p.extraSemesters} de adaptação)` : ""}`
}${i.modalityLabel ? `${p.planType === "parcelado" && !p.durationMonths ? "" : " · "}${esc(i.modalityLabel)}` : ""}</div>
<div class="muted" style="margin-top:6px">Proposta destinada a <b style="color:#1f2937">${esc(i.leadName)}</b></div>
<div class="muted" style="margin:8px 0 10px">Documento gerado em ${esc(fmtDate(i.generatedAt))}</div>

${p.planType === "parcelado" && r.plan ? installmentsHtml(p, r, i, firstDue, secondDue) : semestralHtml()}
<h2>Mensagem final</h2>
<div class="final">${esc(i.texts.finalMessage || "")}</div>
${i.institution?.footer ? `<div class="foot">${esc(i.institution.footer)}</div>` : ""}
</div></body></html>`;
};
