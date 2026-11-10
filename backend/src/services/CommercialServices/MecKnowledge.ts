import { AreaId } from "./MecAreas";

// What the commercial agent knows about the national rules of the MEC and how it separates them from what the institution organized and from what is
// still to be confirmed. The texts below were read from the official publications (Diário Oficial da União) of:
//   Decreto nº 12.456, de 19/05/2025            formats of offer (presencial, semipresencial, a distância) and their minimum percentages
//   Portaria MEC nº 378, de 19/05/2025          which courses can be offered in which format
//   Portaria MEC nº 381, de 20/05/2025          transition rules (two years) and the courses that can no longer be EaD
//   Portaria MEC nº 506, de 10/07/2025          faculty, in-person activities and assessments, platforms and polos
// The agent never mixes the three kinds of information: NATIONAL (what the norm demands), INSTITUTIONAL (what the institution registered for the
// offer or the class) and NOT CONFIRMED (what depends on an institutional publication).

export const NORM_VERSION = "mec-2025-v1";

export interface NormSeed {
  key: string;
  title: string;
  number: string;
  kind: "decreto" | "portaria";
  publishedAt: string;
  sourceUrl: string;
  summary: string;
}

export const NORMS: NormSeed[] = [
  {
    key: "decreto-12456-2025",
    title: "Decreto nº 12.456/2025: formatos de oferta e percentuais",
    number: "Decreto nº 12.456, de 19 de maio de 2025",
    kind: "decreto",
    publishedAt: "2025-05-20",
    sourceUrl: "https://www2.camara.leg.br/legin/fed/decret/2025/decreto-12456-19-maio-2025-797463-publicacaooriginal-175414-pe.html",
    summary: [
      "Regra NACIONAL (Decreto nº 12.456, de 19/05/2025, publicado no DOU de 20/05/2025). Não é uma decisão da instituição: vale para todas as instituições de ensino superior.",
      "Os cursos de graduação têm três formatos de oferta: presencial, semipresencial e a distância (art. 4º). O ato de autorização do curso diz qual é o formato, e a instituição não pode ofertá-lo em formato diferente do autorizado. Os três formatos têm a mesma duração e o mesmo prazo de integralização (art. 5º).",
      "Como o decreto define (art. 3º): atividade presencial é a que estudante e docente fazem no mesmo lugar e ao mesmo tempo; atividade síncrona é a feita por áudio e vídeo, em tempo real, com estudante e docente em lugares diferentes; atividade síncrona mediada é uma síncrona com grupo de no máximo 70 estudantes por docente ou mediador pedagógico e controle de frequência; atividade assíncrona é a feita sem encontro em tempo real.",
      "Presencial: no mínimo 70% da carga horária em atividades presenciais (art. 10). Semipresencial: no mínimo 30% da carga horária em atividades presenciais e mais 20% em atividades presenciais ou síncronas mediadas (art. 11); as diretrizes curriculares de cada curso podem exigir mais. A distância (EaD): no mínimo 10% da carga horária em atividades presenciais e mais 10% em presenciais ou síncronas mediadas (art. 12). Por isso nenhum curso de graduação é 100% on-line.",
      "Esses números são percentuais mínimos sobre a carga horária total do curso. Não são uma quantidade fixa de aulas por semana nem por mês: como os encontros serão distribuídos é uma decisão da instituição, no projeto pedagógico do curso.",
      "Direito, Medicina, Enfermagem, Odontologia e Psicologia só podem ser ofertados no formato presencial (art. 8º). É vedada a oferta a distância de cursos da área da saúde e de licenciaturas (art. 9º).",
      "A instituição precisa controlar a frequência nas atividades presenciais e síncronas mediadas (art. 6º) e aplicar avaliações de aprendizagem presenciais em todas as unidades curriculares oferecidas, parcial ou totalmente, a distância (art. 23).",
      "Prazo de adaptação: as instituições e os cursos devem cumprir integralmente o decreto em até dois anos, contados da publicação, ou seja, até 19 de maio de 2027 (art. 41). As regras de transição foram detalhadas por portaria do MEC (veja a Portaria nº 381/2025). O diploma não identifica o formato de oferta do curso (art. 100 do Decreto nº 9.235, na redação dada por este decreto)."
    ].join("\n")
  },
  {
    key: "portaria-378-2025",
    title: "Portaria MEC nº 378/2025: quais cursos podem ser semipresenciais, a distância ou só presenciais",
    number: "Portaria MEC nº 378, de 19 de maio de 2025",
    kind: "portaria",
    publishedAt: "2025-05-20",
    sourceUrl: "https://sead.ufba.br/sites/sead.ufba.br/files/portaria_mec_no_378_de_19_de_maio_de_2025_-_portaria_mec_no_378_de_19_de_maio_de_2025_-_dou_-_imprensa_nacional.pdf",
    summary: [
      "Regra NACIONAL (Portaria MEC nº 378, de 19/05/2025, DOU de 20/05/2025): dispõe sobre os formatos de oferta dos cursos de graduação.",
      "Somente presencial (art. 5º): Direito, Enfermagem, Medicina, Odontologia e Psicologia, com pelo menos 70% da carga horária em atividades presenciais; Medicina deve ser integralmente presencial, sem carga horária a distância.",
      "Educação e Ciências Naturais, Matemática e Estatística (art. 7º): cursos de bacharelado, licenciatura e tecnologia podem ser semipresenciais, com pelo menos 30% de atividades presenciais e 20% de atividades presenciais ou síncronas mediadas. É o caso das licenciaturas, como Pedagogia.",
      "Saúde e Bem-Estar, Engenharia, Produção e Construção, e Agricultura, Silvicultura, Pesca e Veterinária (art. 8º): cursos de bacharelado e tecnologia podem ser semipresenciais, com pelo menos 40% de atividades presenciais e 20% de atividades presenciais ou síncronas mediadas.",
      "Os cursos dos artigos 7º e 8º não podem ser ofertados a distância (art. 9º). As diretrizes curriculares de cada curso prevalecem quando exigirem percentuais maiores (art. 2º).",
      "Cursos não citados (por exemplo Administração e Ciências Contábeis) podem ser ofertados em qualquer formato, respeitados os percentuais do Decreto nº 12.456/2025 (art. 10). A classificação é feita por curso, pela área da classificação oficial (Cine Brasil); casos omissos são analisados pela Secretaria de Regulação e Supervisão da Educação Superior do MEC (art. 12)."
    ].join("\n")
  },
  {
    key: "portaria-381-2025",
    title: "Portaria MEC nº 381/2025: transição de dois anos e cursos que deixam de ser EaD",
    number: "Portaria MEC nº 381, de 20 de maio de 2025",
    kind: "portaria",
    publishedAt: "2025-05-21",
    sourceUrl: "https://abmes.org.br/arquivos/legislacoes/Portaria-mec-381-2025-05-20.pdf",
    summary: [
      "Regra NACIONAL (Portaria MEC nº 381, de 20/05/2025, DOU de 21/05/2025): regras de transição para a aplicação do Decreto nº 12.456/2025.",
      "As instituições e seus cursos devem atender integralmente ao decreto e às portarias em até dois anos a partir da publicação do decreto, isto é, até 19 de maio de 2027 (art. 2º). Esse é o PRAZO LIMITE de adaptação. Ele não significa que as aulas práticas ou presenciais de todas as turmas só começarão em maio de 2027: a instituição pode adotar cronogramas específicos, desde que cumpra a lei até o fim do prazo.",
      "Cursos de graduação a distância que foram autorizados antes do decreto e passaram a ser vedados nesse formato (licenciaturas e cursos da área da saúde) entram em processo de extinção: o status passa a \"em extinção\" no sistema do MEC após 90 dias da publicação do decreto, e a instituição não pode matricular novos ingressantes nesses cursos a distância (art. 8º, §§ 1º e 2º).",
      "Quem já estava matriculado nesses cursos tem direito de concluir no formato previsto no ato de matrícula, e a instituição deve garantir a oferta a distância até dois anos depois do prazo de integralização do curso (art. 8º, §§ 3º e 4º).",
      "A instituição pode obter, por processo simplificado, autorização para oferecer o mesmo curso no formato semipresencial, quando esse formato for permitido (art. 9º). Quem se matricular nesse curso semipresencial durante o período de transição fica sujeito à adaptação da estrutura curricular durante a integralização do curso (art. 9º, § 4º).",
      "Cursos semipresenciais só podem ser ofertados por instituições credenciadas para a distância e com polos vinculados no sistema e-MEC (art. 6º, § 2º, e art. 9º, § 3º). Pedidos de autorização em formatos vedados não são aceitos (art. 6º, § 3º)."
    ].join("\n")
  },
  {
    key: "portaria-506-2025",
    title: "Portaria MEC nº 506/2025: docentes, atividades presenciais, avaliações, plataformas e polos",
    number: "Portaria MEC nº 506, de 10 de julho de 2025",
    kind: "portaria",
    publishedAt: "2025-07-14",
    sourceUrl: "https://sites.unipampa.edu.br/ead/files/2025/07/portaria-mec-no-506-de-10-de-julho-de-2025.pdf",
    summary: [
      "Regra NACIONAL (Portaria MEC nº 506, de 10/07/2025, DOU de 14/07/2025): regulamenta o Decreto nº 12.456/2025 sobre docentes, mediadores, atividades presenciais, avaliações, materiais, plataformas e polos.",
      "Docentes dos cursos semipresenciais e a distância têm formação em pós-graduação, preferencialmente mestrado ou doutorado, atuando na área da sua formação (art. 2º). O docente pode ser auxiliado por mediadores pedagógicos, que atuam sob a supervisão do professor, e por tutores com atribuições administrativas (arts. 4º e 5º).",
      "As diretrizes curriculares de cada curso podem definir atividades obrigatoriamente presenciais, como estágios, práticas profissionais e laboratórios. A instituição deve prever no projeto pedagógico do curso quais são essas atividades, e elas podem ocorrer na sede, em campi, nos polos, em ambientes profissionais ou em outros espaços previstos no projeto (art. 8º).",
      "As atividades de extensão devem ser presenciais, em localidade compatível com a do polo em que o estudante está matriculado (art. 9º).",
      "Cada unidade curricular oferecida total ou parcialmente a distância tem duração mínima de dez semanas e pelo menos uma avaliação de aprendizagem presencial; as avaliações substitutivas e de recuperação dessas provas também são presenciais. Outras avaliações podem ser a distância, se previstas no projeto pedagógico (art. 10). As avaliações presenciais não contam como carga horária presencial do curso (art. 11).",
      "Os cursos semipresenciais e a distância oferecem ambiente virtual de aprendizagem, videoconferência e acervo digital, com acessibilidade (art. 13). Os polos têm regras de criação, endereço e extinção informadas ao MEC (arts. 14 a 26).",
      "Prazo: as instituições atendem integralmente a portaria em até dois anos da publicação do decreto, isto é, até 19 de maio de 2027; cursos autorizados a partir da publicação do decreto cumprem as regras de imediato (art. 27)."
    ].join("\n")
  }
];

// The guide of how to explain it: how the agent speaks, and how it keeps national, institutional and unconfirmed apart
export const EXPLAIN_DOCS: Array<{ title: string; topic: string; keywords: string; content: string }> = [
  {
    title: "Como explicar os formatos de ensino (EaD, semipresencial e presencial)",
    topic: "institutional/mec-formats",
    keywords: "ead, a distância, semipresencial, presencial, online, on-line, modalidade, formato, como funciona, aulas ao vivo, síncrona, presencial mínimo",
    content: [
      "Quem pergunta se o curso é on-line, EaD, semipresencial ou presencial quer saber como vai estudar na prática. Nunca responda só \"é semipresencial\" ou \"é online\": explique o que isso significa. Separe sempre três tipos de informação e não os misture:",
      "1) REGRA NACIONAL: o que a lei do MEC exige. Pode ser afirmado com segurança.",
      "2) REGRA DA INSTITUIÇÃO: como a Cruzeiro do Sul Virtual organiza as aulas, as práticas, os horários, as atividades, as avaliações, os estágios e os polos. Só afirme o que a ferramenta de regras do curso devolver como confirmado.",
      "3) AINDA NÃO CONFIRMADO: cronograma, quantidade de encontros presenciais e detalhes que dependem de divulgação da instituição. Diga com clareza que ainda não foi divulgado e que o consultor confirma quando houver data oficial. Nunca invente.",
      "EaD (a distância): a maior parte das atividades é feita pela plataforma, de forma assíncrona e com aulas ao vivo. Pelo novo marco do MEC, mesmo o EaD exige uma parte presencial e uma parte síncrona mínimas (10% e 10% da carga horária) e avaliações presenciais. Não diga que é integralmente on-line.",
      "Semipresencial: combina estudos digitais, atividades síncronas com professor e atividades presenciais. A regra nacional exige no mínimo 30% da carga horária em atividades presenciais e mais 20% em presenciais ou síncronas mediadas (40% presenciais nos bacharelados de Saúde, Engenharia e Agricultura). Esses números são mínimos da carga horária total do curso: não os transforme em número de aulas por semana, por mês ou em dias de polo.",
      "Presencial: predominância de atividades presenciais (no mínimo 70% da carga horária). Direito, Medicina, Enfermagem, Odontologia e Psicologia só podem ser ofertados assim.",
      "A classificação é por curso e por oferta: consulte sempre a ferramenta de regra do curso antes de explicar. Use a mesma explicação para quem pergunta \"é online?\", \"precisa ir ao polo?\", \"tem aula presencial?\" ou \"como funciona?\".",
      "Modelo de resposta, em até três frases: o que a regra nacional exige, o que a instituição já confirmou para este curso e o que ainda não foi divulgado, com o próximo passo (o consultor confirma). Não use listas longas nem títulos."
    ].join("\n")
  },
  {
    title: "Por que Pedagogia e outras licenciaturas são semipresenciais",
    topic: "institutional/mec-licenciaturas",
    keywords: "pedagogia, licenciatura, licenciaturas, por que semipresencial, ead antigo, novo marco, formação de professores, letras, história, educação física licenciatura",
    content: [
      "Quando a pessoa perguntar por que Pedagogia (ou outra licenciatura) é semipresencial, explique nesta ordem, em linguagem simples:",
      "- O MEC atualizou as regras da formação superior em 2025 (Decreto nº 12.456 e Portaria nº 378). A partir dessas regras, cursos de licenciatura não podem mais ser ofertados no formato a distância (EaD) tradicional.",
      "- O formato semipresencial combina estudos digitais, atividades ao vivo acompanhadas por professores e componentes presenciais. A regra nacional exige no mínimo 30% da carga horária em atividades presenciais e 20% em atividades presenciais ou síncronas mediadas.",
      "- Como os encontros serão organizados em cada turma (calendário, polos, horários, avaliações e práticas) segue o projeto pedagógico do curso e as orientações da instituição. Se isso ainda não foi divulgado, diga que será informado e que o consultor confirma.",
      "Não diga apenas que Pedagogia \"é online\": sempre mencione a parte presencial exigida. Não afirme quantas aulas presenciais haverá, em quais dias ou em qual local sem confirmação registrada para a turma."
    ].join("\n")
  },
  {
    title: "Transição das regras do MEC até maio de 2027",
    topic: "institutional/mec-transition",
    keywords: "transição, maio de 2027, prazo, dois anos, adaptação, extinção, quando começam as aulas presenciais, práticas, cronograma, turma, ingresso",
    content: [
      "O que a regra nacional diz: o MEC deu prazo de até dois anos, a partir de 19/05/2025, para as instituições e os cursos cumprirem integralmente o novo marco. O limite é 19 de maio de 2027 (Decreto nº 12.456, art. 41; Portaria nº 381, art. 2º).",
      "Cuidado ao explicar: esse prazo é o limite de adaptação das instituições. NÃO significa que as aulas práticas ou presenciais de todas as turmas só começarão em maio de 2027, nem que começam antes. A instituição pode definir cronogramas específicos por curso e por turma, respeitando a lei e o enquadramento de cada oferta.",
      "Cursos que eram a distância e passaram a ser vedados nesse formato (licenciaturas e saúde) deixam de receber novos ingressantes como EaD; quem já estava matriculado conclui no formato do contrato de matrícula (Portaria nº 381, art. 8º). Para os novos ingressantes, a oferta é semipresencial e a estrutura curricular pode passar por adaptação durante o curso (art. 9º, § 4º).",
      "O que a instituição confirmou para cada curso e turma (data de ingresso, regime de transição, calendário, início das atividades presenciais, regras das aulas síncronas, cronograma das práticas, situação das avaliações e local das atividades) vem da ferramenta de regras do curso. O que não estiver registrado é \"ainda não confirmado\": diga isso com clareza e não invente datas."
    ].join("\n")
  }
];

// the short core that goes in the cached prompt of the commercial agent: what must never be forgotten even without a tool call
export const MEC_CORE_BLOCK = [
  "Regras do MEC (Decreto 12.456/2025 e Portarias 378, 381 e 506 de 2025). Separe sempre: REGRA NACIONAL (o que a lei exige), REGRA DA INSTITUIÇÃO (só o que a ferramenta de regras do curso devolver confirmado) e AINDA NÃO CONFIRMADO (diga que o consultor confirma; nunca invente).",
  "- Formatos: presencial (mínimo 70% presencial), semipresencial (mínimo 30% presencial + 20% presencial ou síncrono mediado; 40% presencial em bacharelados de Saúde, Engenharias e Agricultura) e a distância (mínimo 10% presencial + 10% presencial ou síncrono mediado). Nenhum curso de graduação é 100% on-line: nunca responda só \"é online\" ou \"é semipresencial\", explique o que significa na prática.",
  "- São mínimos da carga horária total: nunca os transforme em número de aulas por semana ou por mês, nem em dias de polo.",
  "- Direito, Medicina, Enfermagem, Odontologia e Psicologia: só presencial. Licenciaturas (como Pedagogia) e saúde não podem ser EaD: são semipresenciais.",
  "- Prazo de adaptação até 19/05/2027: é o limite das instituições, não a data em que as práticas começam. Cada turma tem o seu cronograma; só fale do que estiver registrado."
].join("\n");

// ---------------------------------------------------------------- the explanation of one course (built from the rule of the area, the rule of the course and the class)
export interface RuleView {
  mecImpacted: boolean | null;
  percentualPresencial: number | null;
  percentualSincrono: number | null;
  teoriaAoVivo: boolean | null;
  praticaPresencial: boolean | null;
  cronogramaPraticasDefinido: boolean | null;
  transitionStatus: string | null;
  currentDelivery: string | null;
  futureDelivery: string | null;
  transitionNote: string | null;
  commercialApprovedText: string | null;
}

export interface CohortView {
  id: number;
  label: string;
  intakeTerm: string | null;
  intakeDate: string | null;
  contractedModality: string | null;
  transitionRegime: string | null;
  transitionNote: string | null;
  expectedCalendar: string | null;
  presencialStart: string | null;
  syncRules: string | null;
  practiceSchedule: string | null;
  practiceDefined: boolean | null;
  assessmentsStatus: string | null;
  assessmentsNote: string | null;
  activityLocation: string | null;
}

export const REGIME_LABEL: Record<string, string> = {
  ead_pre_decreto: "Turma de EaD matriculada antes do novo marco: conclui no formato do contrato de matrícula",
  semipresencial_transicao: "Turma semipresencial que ingressa durante a transição: a estrutura curricular pode ser adaptada durante o curso",
  semipresencial_pleno: "Turma semipresencial já no novo marco, sem adaptação pendente",
  presencial: "Turma presencial",
  nao_definido: "Regime de transição ainda não definido"
};
const REGIME_NATIONAL: Record<string, string> = {
  ead_pre_decreto: "Pela Portaria MEC nº 381/2025 (art. 8º), quem já estava matriculado em curso a distância que passou a ser vedado nesse formato conclui no formato previsto no ato de matrícula.",
  semipresencial_transicao: "Pela Portaria MEC nº 381/2025 (art. 9º, § 4º), quem se matricula no formato semipresencial durante o período de transição fica sujeito à adaptação da estrutura curricular ao longo do curso."
};
export const ASSESSMENT_LABEL: Record<string, string> = { nao_definido: "ainda não definida", parcial: "parcialmente definida", definido: "definida" };
const MODALITY_LABEL: Record<string, string> = { EAD: "a distância (EaD)", SEMIPRESENCIAL: "semipresencial", PRESENCIAL: "presencial" };

const nationalOf = (area: AreaId, rule: RuleView | null): { regra: string; fonte: string } => {
  const p = rule && rule.percentualPresencial !== null ? rule.percentualPresencial : null;
  const s = rule && rule.percentualSincrono !== null ? rule.percentualSincrono : null;
  if (area === "presencial") {
    return { regra: "Este curso só pode ser ofertado no formato presencial, com pelo menos 70% da carga horária em atividades presenciais (Medicina, integralmente presencial).", fonte: "Decreto nº 12.456/2025, art. 8º; Portaria MEC nº 378/2025, art. 5º" };
  }
  if (area === "saude_eng_agro") {
    return {
      regra: `Cursos de bacharelado e tecnologia desta área podem ser semipresenciais, com pelo menos ${p ?? 40}% da carga horária em atividades presenciais e ${s ?? 20}% em atividades presenciais ou síncronas mediadas. Não podem ser ofertados totalmente a distância.`,
      fonte: "Portaria MEC nº 378/2025, arts. 8º e 9º; Decreto nº 12.456/2025, arts. 9º e 11"
    };
  }
  if (area === "educacao_ciencias") {
    return {
      regra: `Licenciaturas e cursos de Educação, Ciências Naturais, Matemática e Estatística podem ser semipresenciais, com pelo menos ${p ?? 30}% da carga horária em atividades presenciais e ${s ?? 20}% em atividades presenciais ou síncronas mediadas. Licenciaturas não podem ser ofertadas a distância (EaD).`,
      fonte: "Portaria MEC nº 378/2025, arts. 7º e 9º; Decreto nº 12.456/2025, arts. 9º e 11"
    };
  }
  return {
    regra: "Este curso não é citado na Portaria nº 378: pode ser ofertado em qualquer formato permitido pelo decreto. Presencial exige pelo menos 70% de atividades presenciais; semipresencial, 30% presenciais e 20% presenciais ou síncronas mediadas; a distância, 10% presenciais e 10% presenciais ou síncronas mediadas.",
    fonte: "Portaria MEC nº 378/2025, art. 10; Decreto nº 12.456/2025, arts. 10 a 12"
  };
};

export interface Explanation {
  formatoCadastrado: string | null;
  nacional: { regra: string; fonte: string; transicao: string; observacao: string; regimeDaTurma?: string };
  institucional: { confirmado: string[] };
  naoConfirmado: string[];
  turma: CohortView | null;
  comoExplicar: string;
}

// what is confirmed and what is not, for one course (and one class when there is one)
export const explainCourse = (input: { area: AreaId; catalogModality: string | null; rule: RuleView | null; cohort: CohortView | null }): Explanation => {
  const { area, rule, cohort } = input;
  const nat = nationalOf(area, rule);
  const confirmed: string[] = [];
  const unknown: string[] = [];
  const modality = cohort && cohort.contractedModality ? cohort.contractedModality : null;
  if (modality) confirmed.push(`Formato contratado nesta turma: ${MODALITY_LABEL[modality] || modality}.`);
  else if (input.catalogModality) confirmed.push(`No cadastro do curso a oferta consta como ${input.catalogModality.toLowerCase()}.`);
  if (rule) {
    if (rule.teoriaAoVivo === true) confirmed.push("A parte teórica tem aulas ao vivo, com professor e turma.");
    if (rule.praticaPresencial === true) confirmed.push("Há atividades práticas presenciais previstas.");
    if (rule.currentDelivery) confirmed.push(`Hoje o curso é ofertado como ${rule.currentDelivery}.`);
    if (rule.futureDelivery) confirmed.push(`Após a adaptação ao novo marco, o formato será ${rule.futureDelivery}.`);
    if (rule.transitionNote) confirmed.push(rule.transitionNote);
    if (rule.commercialApprovedText) confirmed.push(`Texto aprovado pela instituição: ${rule.commercialApprovedText}`);
  }
  if (cohort) {
    if (cohort.intakeTerm || cohort.intakeDate) confirmed.push(`Turma: ${cohort.label}${cohort.intakeDate ? `, ingresso em ${cohort.intakeDate.split("-").reverse().join("/")}` : ""}.`);
    if (cohort.transitionRegime && cohort.transitionRegime !== "nao_definido") confirmed.push(`Regime de transição: ${REGIME_LABEL[cohort.transitionRegime] || cohort.transitionRegime}.`);
    if (cohort.transitionNote) confirmed.push(cohort.transitionNote);
    if (cohort.expectedCalendar) confirmed.push(`Calendário previsto: ${cohort.expectedCalendar}`); else unknown.push("O calendário previsto da turma");
    if (cohort.presencialStart) confirmed.push(`Início das atividades presenciais: ${cohort.presencialStart.split("-").reverse().join("/")}.`); else unknown.push("A data de início das atividades presenciais");
    if (cohort.syncRules) confirmed.push(`Aulas síncronas: ${cohort.syncRules}`); else unknown.push("As regras das aulas síncronas");
    if (cohort.practiceSchedule && cohort.practiceDefined !== false) confirmed.push(`Cronograma das práticas: ${cohort.practiceSchedule}`); else unknown.push("O cronograma das práticas");
    if (cohort.assessmentsStatus === "definido" || cohort.assessmentsStatus === "parcial") confirmed.push(`Avaliações: ${ASSESSMENT_LABEL[cohort.assessmentsStatus]}${cohort.assessmentsNote ? `. ${cohort.assessmentsNote}` : "."}`); else unknown.push("A situação das avaliações");
    if (cohort.activityLocation) confirmed.push(`Local das atividades presenciais: ${cohort.activityLocation}`); else unknown.push("O local das atividades presenciais");
  } else {
    unknown.push("A quantidade de encontros presenciais e como serão distribuídos");
    unknown.push("O cronograma e o local das atividades presenciais e das práticas");
    if (rule && rule.cronogramaPraticasDefinido === false) unknown.push("O início das práticas desta turma");
  }
  return {
    formatoCadastrado: input.catalogModality,
    nacional: {
      ...nat,
      transicao: "O prazo de adaptação ao novo marco vai até 19/05/2027 (Decreto nº 12.456, art. 41; Portaria nº 381, art. 2º). É o limite das instituições: não significa que as práticas de todas as turmas só começam em maio de 2027, e cada turma tem o seu cronograma.",
      observacao: "Os percentuais são mínimos sobre a carga horária total. Nunca os converta em número de aulas por semana ou por mês.",
      ...(cohort && cohort.transitionRegime && REGIME_NATIONAL[cohort.transitionRegime] ? { regimeDaTurma: REGIME_NATIONAL[cohort.transitionRegime] } : {})
    },
    institucional: { confirmado: confirmed },
    naoConfirmado: [...new Set(unknown)],
    turma: cohort,
    comoExplicar: "Explique em até 3 frases e sem listas: (1) o que a regra nacional exige, (2) o que a instituição já confirmou para este curso, (3) o que ainda não foi divulgado e que o consultor confirma. Nunca diga só \"online\" ou \"semipresencial\", nunca converta percentuais em aulas por semana e nunca invente datas ou locais."
  };
};
