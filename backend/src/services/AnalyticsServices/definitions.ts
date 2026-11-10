// The ONE list of what every indicator means. The management center and the consultant's own screen read these definitions
// (GET /analytics/definitions) and both are computed by AnalyticsService.computeMetrics: same period, same scope, same rules, same numbers.
export interface KpiDefinition {
  key: string;
  label: string;
  unit: "count" | "percent" | "minutes";
  // "period" = what happened inside the chosen period; "now" = the situation at this moment
  kind: "period" | "now";
  description: string;
}

export const KPI_DEFINITIONS: KpiDefinition[] = [
  { key: "messagesSent", label: "Mensagens enviadas", unit: "count", kind: "period", description: "Mensagens digitadas e enviadas por uma pessoa pelo sistema (autoria real, uma por envio). Mensagens da IA, de campanhas automáticas e de robôs nunca entram. Abrir uma conversa não conta." },
  { key: "attendances", label: "Atendimentos válidos", unit: "count", kind: "period", description: "Conversas distintas de clientes (sem grupos, histórico, equipe e contatos pessoais) em que a pessoa enviou ao menos uma mensagem no período." },
  { key: "reactivated", label: "Contatos reativados", unit: "count", kind: "period", description: "Conversas em que a pessoa escreveu depois de 7 dias ou mais sem nenhuma mensagem de ninguém." },
  { key: "leadsWorked", label: "Leads trabalhados", unit: "count", kind: "period", description: "Leads distintos em que a pessoa registrou uma atividade (anotação, etapa, contato) ou enviou mensagem pela conversa do lead. Atividades automáticas do sistema não contam." },
  { key: "pendingReply", label: "Conversas pendentes", unit: "count", kind: "now", description: "Conversas abertas da pessoa em que o cliente foi o último a escrever." },
  { key: "inProgress", label: "Atendimentos em andamento", unit: "count", kind: "now", description: "Conversas com status Atendendo atribuídas à pessoa." },
  { key: "tasksOpen", label: "Tarefas abertas", unit: "count", kind: "now", description: "Tarefas da pessoa ainda não concluídas." },
  { key: "tasksOverdue", label: "Tarefas atrasadas", unit: "count", kind: "now", description: "Tarefas abertas com prazo anterior a agora." },
  { key: "tasksDone", label: "Tarefas concluídas", unit: "count", kind: "period", description: "Tarefas concluídas pela pessoa no período." },
  { key: "followUpsDue", label: "Follow-ups para hoje", unit: "count", kind: "now", description: "Leads da pessoa com próximo contato marcado para hoje ou antes." },
  { key: "proposalsSent", label: "Propostas enviadas", unit: "count", kind: "period", description: "Propostas criadas pela pessoa e enviadas no período." },
  { key: "proposalsViewed", label: "Propostas vistas", unit: "count", kind: "period", description: "Propostas da pessoa abertas pelo lead no período." },
  { key: "enrollments", label: "Matrículas confirmadas", unit: "count", kind: "period", description: "Leads da pessoa que passaram para matriculado (wonAt) no período. É a mesma regra das Metas." },
  { key: "firstContactMinutes", label: "Tempo até o 1º contato", unit: "minutes", kind: "period", description: "Média, só em horário comercial, entre o cadastro do lead e o primeiro contato, dos leads do período que a pessoa atende. Ideal: até 15 minutos." },
  { key: "conversion", label: "Taxa de conversão", unit: "percent", kind: "period", description: "Matrículas confirmadas ÷ leads trabalhados no período." }
];

export const KPI_KEYS = KPI_DEFINITIONS.map(k => k.key);
