import { describe, expect, it } from "vitest";

import { forChannel, toWhatsapp } from "../../src/helpers/ChannelText";
import { splitIntoBlocks } from "../../src/services/CommercialServices/Blocks";
import { EXPLAIN_DOCS, MEC_CORE_BLOCK, NORMS, explainCourse } from "../../src/services/CommercialServices/MecKnowledge";
import { isStale } from "../../src/services/CommercialServices/Norms";

describe("Markdown never reaches WhatsApp", () => {
  it("turns **bold**, titles, links, tables and bullets into what WhatsApp shows", () => {
    expect(toWhatsapp("O curso é **semipresencial**.")).toBe("O curso é *semipresencial*.");
    expect(toWhatsapp("### Como funciona\nTexto")).toBe("*Como funciona*\nTexto");
    expect(toWhatsapp("Veja [a grade](https://exemplo.com/grade.pdf) agora")).toBe("Veja a grade: https://exemplo.com/grade.pdf agora");
    expect(toWhatsapp("| Curso | Duração |\n|---|---|\n| Pedagogia | 8 semestres |")).toBe("Curso - Duração\n\nPedagogia - 8 semestres");
    expect(toWhatsapp("* RG\n* CPF")).toBe("- RG\n- CPF");
    expect(toWhatsapp("Use `isso` e\n---\nfim")).toBe("Use isso e\n\nfim");
  });
  it("leaves what is already WhatsApp alone", () => {
    expect(toWhatsapp("*1* - Quero me matricular\n*2* - Financeiro")).toBe("*1* - Quero me matricular\n*2* - Financeiro");
    expect(toWhatsapp("Isso é _importante_ e *essencial*")).toBe("Isso é _importante_ e *essencial*");
    expect(toWhatsapp("- um\n- dois")).toBe("- um\n- dois");
  });
  it("Instagram and Messenger get plain text", () => {
    expect(forChannel("Isso é **essencial**", "instagram")).toBe("Isso é essencial");
    expect(forChannel("Isso é **essencial**", "whatsapp")).toBe("Isso é *essencial*");
  });
  it("every bubble is clean, and a short answer is one bubble", () => {
    const out = splitIntoBlocks("**Pedagogia** tem 8 semestres e é semipresencial: combina estudos digitais, aulas com professores e uma parte presencial.\n\nQuer que eu explique como funciona?");
    expect(out.join(" ")).not.toMatch(/\*\*|#|\]\(/);
    expect(out.length).toBeLessThanOrEqual(2);
  });
});

describe("the national norms the agents know", () => {
  it("has the four norms with number and date of the publication", () => {
    const keys = NORMS.map(n => n.key);
    expect(keys).toEqual(["decreto-12456-2025", "portaria-378-2025", "portaria-381-2025", "portaria-506-2025"]);
    expect(NORMS[0].number).toContain("19 de maio de 2025");
    expect(NORMS[1].number).toContain("19 de maio de 2025");
    expect(NORMS[2].number).toContain("20 de maio de 2025");
    expect(NORMS[3].number).toContain("10 de julho de 2025");
    NORMS.forEach(n => expect(n.sourceUrl).toMatch(/^https:\/\//));
  });
  it("states the percentages and the transition without turning them into classes per week", () => {
    const all = NORMS.map(n => n.summary).join("\n");
    expect(all).toMatch(/30% da carga horária em atividades presenciais e mais 20%/);
    expect(all).toMatch(/19 de maio de 2027/);
    expect(all).toMatch(/Não são uma quantidade fixa de aulas/);
    expect(all).toMatch(/Nenhum curso de graduação é 100% on-line|nenhum curso de graduação é 100% on-line/i);
  });
  it("the guide keeps national, institutional and not confirmed apart", () => {
    const guide = EXPLAIN_DOCS.find(d => d.topic === "institutional/mec-formats")!;
    expect(guide.content).toMatch(/REGRA NACIONAL/);
    expect(guide.content).toMatch(/REGRA DA INSTITUIÇÃO/);
    expect(guide.content).toMatch(/AINDA NÃO CONFIRMADO/);
    expect(EXPLAIN_DOCS.map(d => d.topic)).toEqual(expect.arrayContaining(["institutional/mec-licenciaturas", "institutional/mec-transition"]));
    expect(MEC_CORE_BLOCK).toMatch(/nunca responda só/i);
  });
  it("a norm never checked, or checked long ago, is stale", () => {
    expect(isStale({ reviewedAt: null })).toBe(true);
    expect(isStale({ reviewedAt: new Date() })).toBe(false);
    expect(isStale({ reviewedAt: new Date(Date.now() - 200 * 86400000) })).toBe(true);
  });
});

describe("the explanation of one course", () => {
  const rule = { mecImpacted: true, percentualPresencial: 30, percentualSincrono: 20, teoriaAoVivo: true, praticaPresencial: true, cronogramaPraticasDefinido: false, transitionStatus: "em_adequacao", currentDelivery: null, futureDelivery: "Semipresencial", transitionNote: null, commercialApprovedText: null };

  it("Pedagogia without a class: the national rule is firm, the rest is not confirmed", () => {
    const e = explainCourse({ area: "educacao_ciencias", catalogModality: "SEMIPRESENCIAL", rule, cohort: null });
    expect(e.nacional.regra).toMatch(/Licenciaturas não podem ser ofertadas a distância/);
    expect(e.nacional.regra).toMatch(/30%/);
    expect(e.nacional.transicao).toMatch(/19\/05\/2027/);
    expect(e.nacional.transicao).toMatch(/não significa que as práticas de todas as turmas só começam em maio de 2027/);
    expect(e.nacional.observacao).toMatch(/Nunca os converta em número de aulas/);
    expect(e.naoConfirmado.join(" ")).toMatch(/quantidade de encontros presenciais/);
    expect(e.naoConfirmado.join(" ")).toMatch(/local das atividades/);
    expect(JSON.stringify(e)).not.toMatch(/100% on-?line/i);
  });
  it("a class with what was confirmed moves those items out of 'not confirmed'", () => {
    const e = explainCourse({
      area: "educacao_ciencias", catalogModality: "SEMIPRESENCIAL", rule,
      cohort: { id: 1, label: "Pedagogia 2026/2", intakeTerm: "2026/2", intakeDate: "2026-08-03", contractedModality: "SEMIPRESENCIAL", transitionRegime: "semipresencial_transicao", transitionNote: null, expectedCalendar: "Encontros presenciais aos sábados, um por mês.", presencialStart: null, syncRules: "Aulas ao vivo às quartas à noite.", practiceSchedule: null, practiceDefined: false, assessmentsStatus: "nao_definido", assessmentsNote: null, activityLocation: "Polo de Porto Velho" }
    });
    const confirmed = e.institucional.confirmado.join(" ");
    expect(confirmed).toMatch(/Formato contratado nesta turma: semipresencial/);
    expect(confirmed).toMatch(/Calendário previsto: Encontros presenciais aos sábados/);
    expect(confirmed).toMatch(/Aulas síncronas: Aulas ao vivo às quartas/);
    expect(confirmed).toMatch(/Local das atividades presenciais: Polo de Porto Velho/);
    expect(confirmed).toMatch(/ingresso em 03\/08\/2026/);
    expect(e.nacional.regimeDaTurma).toMatch(/art\. 9º, § 4º/);
    expect(e.naoConfirmado).toEqual(expect.arrayContaining(["A data de início das atividades presenciais", "O cronograma das práticas", "A situação das avaliações"]));
    expect(e.naoConfirmado.join(" ")).not.toMatch(/calendário previsto|local das atividades/i);
  });
  it("Direito is presencial only; an uncited course follows the decree", () => {
    expect(explainCourse({ area: "presencial", catalogModality: null, rule: null, cohort: null }).nacional.regra).toMatch(/só pode ser ofertado no formato presencial/);
    expect(explainCourse({ area: "livre", catalogModality: "EAD", rule: null, cohort: null }).nacional.regra).toMatch(/10% presenciais/);
  });
  it("health courses keep the 40% of the Portaria", () => {
    const e = explainCourse({ area: "saude_eng_agro", catalogModality: null, rule: { ...rule, percentualPresencial: 40 }, cohort: null });
    expect(e.nacional.regra).toMatch(/40%/);
    expect(e.nacional.regra).toMatch(/Não podem ser ofertados totalmente a distância/);
  });
});
