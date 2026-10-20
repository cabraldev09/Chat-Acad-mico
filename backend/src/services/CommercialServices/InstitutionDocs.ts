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
    title: "Reconhecimento e avaliação do MEC",
    topic: "institutional/recognition",
    keywords: "mec, reconhecimento, nota, avaliação, conceito, autorizado, reconhecido, diploma válido",
    content:
      "A instituição tem nota máxima na avaliação do MEC. Pode dizer isso com segurança. Não cite o nome do indicador, ano, número de portaria ou o conceito de um curso específico se não estiver nesta base: para o ato oficial de reconhecimento de um curso, diga que o consultor confirma."
  }
];
