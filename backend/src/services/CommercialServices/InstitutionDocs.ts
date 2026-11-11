// What the institution confirmed about itself, in words the commercial agent can use (pure data: used by the template and, once per
// agent, by the knowledge sync). Only what the team told: nothing here is invented, and the agent is told not to go beyond it.
export const INSTITUTION_DOCS: Array<{ title: string; topic: string; keywords: string; content: string }> = [
  {
    title: "Corpo docente",
    topic: "institutional/faculty",
    keywords: "professores, corpo docente, mestres, doutores, titulação, docentes",
    content:
      "O corpo docente é formado por mestres e doutores. Pode dizer isso com segurança. Não cite nomes de professores, quantidades, percentuais nem a titulação de um curso específico: para esse detalhe, diga que o consultor confirma."
  },
  {
    title: "Matrícula e documentos",
    topic: "institutional/enrollment",
    keywords: "matrícula, documentos, ficha de matrícula, rg, cnh, cpf, histórico, comprovante",
    content: [
      "Para fazer a matrícula a pessoa envia, por foto ou PDF legível, a ficha de matrícula com estes dados:",
      "- Nome completo",
      "- Data de nascimento",
      "- CPF",
      "- RG (número, órgão emissor e UF)",
      "- Nome completo da mãe",
      "- Endereço completo (rua, número, bairro, cidade e CEP)",
      "- Telefone celular atualizado",
      "- E-mail pessoal",
      "- Histórico do Ensino Médio (caso já tenha em mãos)",
      "Além da ficha, a pessoa envia a foto do RG ou da CNH, frente e verso.",
      "Quem confere os documentos e conclui a matrícula é o consultor do polo, junto com a secretaria. Cursos semipresenciais são matriculados nos polos de Porto Velho e Vilhena. Não peça documentos nem dados pessoais pela conversa do agente: explique a lista e diga que o consultor recebe os arquivos na hora da matrícula. Não prometa prazos nem outros documentos que não estejam aqui."
    ].join("\n")
  },
  {
    title: "Estágio supervisionado e tutoria",
    topic: "institutional/supervised-internship",
    keywords: "estágio supervisionado, estágio obrigatório, tutoria, tutores, acompanhamento, documentação do estágio",
    content:
      "Nos cursos com estágio supervisionado obrigatório, a carga e os semestres vêm da matriz do curso (a legenda da grade enviada já lista). Durante essa fase e em todo o curso, a tutoria acompanha o aluno: orienta sobre a documentação, os prazos e as atividades do estágio, além de plataforma, atividades e provas. Explique isso de forma curta, sem inventar horários de atendimento, nomes de tutores ou locais de estágio: para esses detalhes, o consultor ou a tutoria do polo confirmam."
  },
  {
    title: "O que a tutoria atende",
    topic: "institutional/support-tutoring",
    keywords: "tutoria, tutor, plataforma, ambiente virtual, atividade, prova, prazo, disciplina, nota, acesso, senha, primeiro acesso",
    content:
      "A tutoria acompanha o aluno durante o curso: primeiro acesso e uso da plataforma, disciplinas, organização da grade, atividades, provas, prazos, dúvidas de conteúdo e orientações acadêmicas do dia a dia. Quem já é aluno e tem uma dúvida de estudo ou de acesso é encaminhado para a tutoria do polo (o sistema faz o encaminhamento). Não resolva você mesmo problemas de acesso, nota ou prazo."
  },
  {
    title: "O que a secretaria atende",
    topic: "institutional/support-secretary",
    keywords: "secretaria, documento, declaração, histórico escolar, certificado, diploma, trancamento, cancelamento, rematrícula, segunda via",
    content:
      "A secretaria cuida da parte documental de quem já é aluno: declarações, histórico escolar, certificados, diploma, segunda via de documentos, rematrícula, trancamento e cancelamento. Quem precisa de um documento ou de uma solicitação formal é encaminhado para a secretaria do polo (o sistema faz o encaminhamento). Não prometa prazo nem resultado da solicitação."
  },
  {
    title: "Concurso público: colação especial e aproveitamento de estudos",
    topic: "institutional/public-exam",
    keywords: "concurso, concurso público, posse, nomeação, colação de grau especial, colação antecipada, antecipar, abreviar, extraordinário aproveitamento, art. 47, LDB, diploma antes",
    content: [
      "Quando a pessoa estuda para concurso e pergunta se dá para antecipar o diploma, explique que são DOIS processos diferentes, sem prometer resultado:",
      "- Extraordinário Aproveitamento de Estudos (art. 47, § 2º, da LDB): para tentar concluir o curso antes do prazo normal. A instituição faz uma análise acadêmica e pode aplicar provas ou outros instrumentos por banca específica; se a pessoa demonstrar domínio dos conteúdos, algumas disciplinas podem ser dispensadas e o tempo do curso pode ser abreviado. Não é automático nem garantido pela aprovação no concurso.",
      "- Colação de grau especial ou antecipada: só depois que todas as exigências acadêmicas estiverem concluídas e as notas lançadas, quando há necessidade comprovada (nomeação ou prazo de posse), apresentando o documento que comprova a urgência. Ela antecipa a colação, não encurta o curso.",
      "Resumo para a pessoa: a colação especial antecipa a colação depois que o curso termina; para concluir antes do prazo normal o caminho é o Extraordinário Aproveitamento de Estudos. Tudo passa por análise e aprovação acadêmica. Para concurso, o requisito de cada edital precisa ser conferido."
    ].join("\n")
  },
  {
    title: "Reajuste da mensalidade na proposta",
    topic: "institutional/tuition-adjustment",
    keywords: "reajuste, aumento, mensalidade vai subir, projeção, quadro final, valor final, ajuste anual",
    content:
      "A proposta traz, ao final, uma projeção de reajuste ao longo do curso com dois cenários: um mais próximo do mínimo e outro com um teto (os percentuais estão na própria proposta). É só uma estimativa para dar transparência e permitir que a pessoa se planeje; a mensalidade não sobe de imediato para aquele valor. Normalmente o reajuste fica mais próximo do cenário menor. Não invente valores: use os números da proposta da pessoa."
  },
  {
    title: "Taxa de matrícula e primeira mensalidade",
    topic: "institutional/enrollment-fee",
    keywords: "taxa de matrícula, matrícula, pix, boleto, comprovante, primeira mensalidade, isenta, isenção, quando pago",
    content:
      "Com as mudanças e adequações recentes às regras do MEC, a instituição atualizou condições de ingresso e hoje há taxa de matrícula. O valor, a data da primeira mensalidade e qualquer isenção constam da proposta: use apenas o que estiver nela e, se não souber, diga que o consultor confirma. O pagamento da taxa é por Pix ou boleto; depois do pagamento a pessoa envia o comprovante para o consultor dar baixa com o financeiro."
  },
  {
    title: "Início das aulas depois da matrícula",
    topic: "institutional/after-enrollment",
    keywords: "quando começa, início das aulas, primeiras disciplinas, disciplinas disponíveis, disciplinas regulares, ambientação, comunidade dos alunos, depois da matrícula",
    content:
      "Depois da matrícula a pessoa já recebe algumas disciplinas para começar imediatamente e, na data indicada pelo consultor, entram as disciplinas regulares do curso. A tutoria entra em contato no mesmo dia para fazer a ambientação, ajudar no primeiro acesso e orientar dentro da plataforma. O aluno também pode entrar na Comunidade dos Alunos, onde são enviados os principais avisos. Quantidade de disciplinas e datas dependem da turma: confirme com o consultor antes de afirmar."
  },
  {
    title: "Curso que a instituição não oferece",
    topic: "institutional/not-offered",
    keywords: "não oferece, não temos, enfermagem, técnico, curso técnico, radiologia, outra área, alternativa, não ofertamos",
    content:
      "Se a pessoa pede um curso que a instituição não oferece (por exemplo Enfermagem, que o MEC só permite no formato presencial), diga com clareza que não é ofertado e apresente as opções da mesma área que constam do catálogo, perguntando qual área interessa mais. Cursos superiores de tecnologia (CST) são graduações de nível superior, não cursos técnicos: explique a diferença quando a pessoa confundir. Nunca invente um curso que não está no catálogo."
  },
  {
    title: "Cancelamento antes do primeiro vencimento",
    topic: "institutional/cancellation",
    keywords: "cancelar, cancelamento, desistir, encerrar o curso, não começou, baixa, mensalidade, tutor",
    content:
      "Quem decidiu encerrar o curso deve falar com o tutor o quanto antes e pedir formalmente o cancelamento, antes do vencimento da próxima mensalidade, para não gerar novas cobranças. O consultor não dá baixa: oriente a pessoa a falar com o tutor no mesmo dia e informe o prazo que o consultor ou a secretaria confirmarem."
  },
  {
    title: "Indicação de alunos (afiliados)",
    topic: "institutional/affiliate",
    keywords: "indicar, indicação, afiliado, afiliada, comissão, bonificação, indicar um amigo, link de indicação",
    content:
      "Quem já é aluno ou conhece a instituição pode participar do programa de afiliados: ao indicar alguém que se matricula e paga a primeira mensalidade, recebe uma comissão, com limite por indicação. As condições e o link de indicação são enviados pelo consultor. Não prometa valores: diga que o consultor explica como funciona."
  },
  {
    title: "Reconhecimento e avaliação do MEC",
    topic: "institutional/recognition",
    keywords: "mec, reconhecimento, nota, avaliação, conceito, autorizado, reconhecido, diploma válido",
    content:
      "A instituição tem nota máxima na avaliação do MEC. Pode dizer isso com segurança. Não cite o nome do indicador, ano, número de portaria ou o conceito de um curso específico se não estiver nesta base: para o ato oficial de reconhecimento de um curso, diga que o consultor confirma."
  }
];
