# Analytics comercial: Centro de Gestão × Estatísticas do consultor

Dois ambientes, **uma única fonte**. Quem calcula é `backend/src/services/AnalyticsServices/AnalyticsService.ts`.
As definições de cada indicador estão em `definitions.ts` e saem em `GET /analytics/definitions` (as telas mostram a definição no ícone ⓘ).

| Ambiente | Tela | API | Quem acessa |
|---|---|---|---|
| Centro de Gestão Comercial | `/gestao-comercial` | `GET /analytics/team`, `/analytics/consultant/:id`, `/analytics/team/export.csv`, `GET/PUT /analytics/config` | administração (todos) e coordenação (consultores dos seus polos; sem polo vinculado, todos) |
| Estatísticas (consultor) | `/reports` | `GET /analytics/me` | cada consultor, **somente os próprios números** (a rota ignora `userId` em URL, query ou cabeçalho) |

Os dois leem o mesmo pacote por pessoa (`bundlesFor`): mesmos filtros de período (`resolvePeriod`: hoje, 7 dias, mês, intervalo), mesmos critérios.

## O que conta (e o que nunca conta)
- **Mensagens enviadas**: envios humanos feitos pelo sistema (tabela `OutboundMessages`, `status=sent`, `sentAt`, `userId` = autor real). Idempotente por `clientKey`: repetir o envio não conta de novo. Nunca contam mensagens da IA, de robôs/campanhas, nem **abrir uma conversa**. Envio recusado (conversa de outro) não gera registro.
- **Atendimentos válidos**: conversas de clientes (sem grupo, histórico, equipe e contatos pessoais) com ao menos uma mensagem humana no período.
- **Matrículas**: `Leads.wonAt` no período, `ownerId` = consultor (mesma regra das Metas).
- Limite conhecido: mensagens digitadas direto no celular e encaminhamentos/enquetes/cartões não passam pelo envio do sistema e não têm autoria registrada; não entram na contagem.

## Tempo real
Cada ação que altera números (envio concluído, atividade no lead, tarefa criada/concluída, proposta enviada, matrícula, atribuição de conversa) chama `touchAnalytics(userId)`, que emite o evento `analytics` (sem números). O servidor só entrega esse evento ao próprio consultor e a quem pode vê-lo; as telas então relêem pela API, que aplica as permissões.

## Configuração (administração)
`Setting analytics_config`: horário de trabalho por consultor e dia da semana, janela de inatividade, metas diárias de mensagens e atendimentos. Vale para os dois ambientes.

## Teste de aceite
`npm run test:analytics` (`scripts/analytics-e2e.js`): mesma produção de João pelas duas portas em hoje/7 dias/mês/intervalo, João sem acesso aos números de Gabrielli e Laura, coordenação limitada ao polo, exportação, configuração e eventos em tempo real.
