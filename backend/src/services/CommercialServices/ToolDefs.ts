import { CRM_OPTIONS } from "../CrmServices/crmOptions";
import { INTENTS, OBJECTION_TYPES } from "./Rules";

// The tools of the commercial agent, as the model sees them: short names, short descriptions, small schemas (every word of this is
// paid in every call that offers the tool).
const course = {
  courseId: { type: "number", description: "id do curso, se já souber" },
  courseName: { type: "string", description: "nome do curso, se não souber o id" }
};

export const COMMERCIAL_TOOL_DEFS: Record<string, { name: string; description: string; input_schema: any }> = {
  buscar_curso: {
    name: "buscar_curso",
    description: "Dados do curso: grau, duração, modalidade da oferta, área, se tem estágio e TCC. Nunca traz preço.",
    input_schema: { type: "object", properties: { ...course, intakePeriod: { type: "string", description: "período de ingresso, ex. 2026/2" } } }
  },
  buscar_regra_modalidade: {
    name: "buscar_regra_modalidade",
    description: "Regra da modalidade do curso (mudanças do MEC): se é impactado, aulas ao vivo, práticas presenciais, cronograma, texto aprovado. Use antes de explicar MEC ou práticas.",
    input_schema: { type: "object", properties: { ...course } }
  },
  buscar_grade: {
    name: "buscar_grade",
    description: "Grade curricular vigente do curso para o ingresso: versão, carga horária, estágios e TCC.",
    input_schema: { type: "object", properties: { ...course, intakePeriod: { type: "string" } } }
  },
  buscar_estagio: {
    name: "buscar_estagio",
    description: "Estágio obrigatório da matriz: semestres, disciplinas e horas. Só use os números devolvidos.",
    input_schema: { type: "object", properties: { ...course, gradeId: { type: "number" } } }
  },
  listar_polos: {
    name: "listar_polos",
    description: "Polos ativos (no máximo 5). Informe a cidade para filtrar.",
    input_schema: { type: "object", properties: { cidade: { type: "string" } } }
  },
  consultar_conhecimento: {
    name: "consultar_conhecimento",
    description: "Trechos da base aprovada sobre plataforma, tutoria, corpo docente, estágio remunerado, MEC, reconhecimento ou matrícula.",
    input_schema: { type: "object", required: ["pergunta"], properties: { pergunta: { type: "string" }, assunto: { type: "string", description: "plataforma, tutoria, docentes, estagio, mec, reconhecimento, matricula" } } }
  },
  enviar_material: {
    name: "enviar_material",
    description: "Envia o PDF da grade curricular para o lead no WhatsApp. Use buscar_grade antes para obter o gradeId.",
    input_schema: { type: "object", required: ["gradeId"], properties: { gradeId: { type: "number" } } }
  },
  agendar_contato: {
    name: "agendar_contato",
    description: "Combina o dia e o horário em que o consultor do polo vai falar com a pessoa. Use só depois de a pessoa dizer um dia/horário que serve (ou pedir o retorno). A confirmação sai pronta no resultado.",
    input_schema: { type: "object", required: ["dia"], properties: { dia: { type: "string", description: "AAAA-MM-DD" }, horario: { type: "string", description: "HH:MM, ou manha, tarde ou noite" }, observacao: { type: "string" } } }
  },
  iniciar_analise_curricular: {
    name: "iniciar_analise_curricular",
    description: "Inicia a análise curricular com o histórico em PDF que o lead enviou. Só para transferência ou segunda graduação.",
    input_schema: { type: "object", properties: {} }
  },
  consultar_analise_curricular: {
    name: "consultar_analise_curricular",
    description: "Resultado da análise curricular do lead: semestre de ingresso, disciplinas dispensadas e restantes, previsão (se houver).",
    input_schema: { type: "object", properties: {} }
  },
  registrar_turno: {
    name: "registrar_turno",
    description: "Registre o que você entendeu da mensagem da pessoa. Chame SEMPRE, junto com a sua resposta.",
    input_schema: {
      type: "object",
      required: ["intent"],
      properties: {
        intent: { type: "string", enum: [...INTENTS], description: "o que a pessoa quis dizer agora" },
        tipo_ingresso: { type: "string", enum: ["first_degree", "transfer", "second_degree"] },
        curso: { type: "string" },
        cidade: { type: "string" },
        estado: { type: "string", description: "a sigla ou o nome do estado, quando a pessoa disser (ex.: RO)" },
        nome: { type: "string" },
        email: { type: "string" },
        ja_graduado: { type: "boolean" },
        curso_anterior: { type: "string" },
        instituicao_anterior: { type: "string" },
        tem_historico: { type: "boolean", description: "a pessoa disse que tem (ou já enviou) o histórico" },
        entendeu_modalidade: { type: "boolean" },
        duvida_principal: { type: "string" },
        objecao: { type: "string" },
        tipo_objecao: { type: "string", enum: [...OBJECTION_TYPES], description: "o tipo da objeção, quando houver" },
        prazo_decisao: { type: "string", enum: CRM_OPTIONS.decisionTimelines, description: "para quando a pessoa pretende começar, se disse" },
        turno: { type: "string", enum: CRM_OPTIONS.shifts, description: "o turno preferido, se disse" },
        motivacao: { type: "string", enum: CRM_OPTIONS.motivations, description: "o que motiva a pessoa, se disse" },
        melhor_horario: { type: "string", description: "o melhor dia/horário para o consultor falar com a pessoa, nas palavras dela" },
        trabalha: { type: "boolean", description: "a pessoa trabalha enquanto estuda" },
        financiamento: { type: "string", enum: CRM_OPTIONS.financing, description: "como pretende pagar, se disse (não pergunte valores)" },
        pergunta_sem_resposta: { type: "string", description: "o fato que você não achou na base nem nas ferramentas" },
        retorno_em: { type: "string", description: "AAAA-MM-DD, se a pessoa disse quando volta" },
        motivo_retorno: { type: "string" }
      }
    }
  }
};
