# Analytics comercial: Estatísticas da gestão × Meu desempenho do consultor

Dois ambientes, **uma única fonte**. Quem calcula é `backend/src/services/AnalyticsServices/AnalyticsService.ts`.
As definições de cada indicador estão em `definitions.ts` e saem em `GET /analytics/definitions` (as telas mostram a definição no ícone ⓘ).

| Ambiente | Tela | API | Quem acessa |
|---|---|---|---|
| Estatísticas (gestão) | `/estatisticas` com as abas Visão geral, Consultores, Polos e metas e Treinamento (`?aba=`), mais Captação, Atendimento e Tutoria | `GET /analytics/team`, `/analytics/commercial`, `/analytics/process`, `/analytics/consultant/:id`, `/analytics/team/export.csv`, `GET/PUT /analytics/config`, `GET /dashboard` e `GET /stats/overview` (o período de atendimento) | administração (todos) e coordenação (consultores dos seus polos; sem polo vinculado, todos) |
| Meu desempenho (consultor) | `/meu-desempenho` | `GET /analytics/me`, `/analytics/me/overview` | cada consultor, **somente os próprios números** (a rota ignora `userId` em URL, query ou cabeçalho) |
| Metas dos polos | Visão geral, Polos e metas e Meu desempenho | `GET /dashboard/polos-progress` | todos os logados: só meta, feito e ritmo de cada polo, sem pessoas; marca os polos de quem vê |

**Visão geral (gestão)** é a tela principal, de cima para baixo:
1. **Agora:** quem está trabalhando, WhatsApp desconectado, alertas e tarefas sem responsável.
2. **Progresso dos polos:** meta do semestre, ritmo esperado e previsão de cada polo.
3. **Período:** leitura do período, atendimentos, mensagens, matrículas, tempo até finalizar, fila agora, atendimentos e gráficos
   (o mesmo bloco de Atendimento, embutido como `ConversationsOverview`).
4. **Comercial:** pessoas contatadas, matrículas dos consultores, leads parados, onde os leads param, objeções, cidades e etapas
   puladas.

"Equipe agora" (`/gestao-comercial`, hoje um redirecionamento) e a "Visão do gestor" de Atendimento saíram, porque repetiam esses
números. A aba Consultores junta os números comerciais com o tempo de resposta e onde cada conversa parou (clique em Conversas). A
aba Polos e metas traz as metas do semestre, os números de cada polo e os horários e metas diárias da equipe.

Os dois leem o mesmo pacote por pessoa (`bundlesFor`): mesmos filtros de período (`resolvePeriod`: hoje, 7 dias, mês, intervalo), mesmos critérios.

## O que conta (e o que nunca conta)
- **Conversas atendidas** (`attendances`): conversas (tickets) de clientes com ao menos uma mensagem humana no período. Cada conversa conta uma vez, quantas mensagens tiver. É o número principal da produção.
- **Pessoas contatadas** (`peopleContacted`): contatos diferentes que receberam mensagem humana no período. Quem tem duas conversas conta uma vez.
- **Mensagens enviadas** (no período de atendimento e na exportação dos consultores): envios humanos feitos pelo sistema (tabela `OutboundMessages`, `status=sent`, `sentAt`, `userId` = autor real). Idempotente por `clientKey`: repetir o envio não conta de novo. Nunca contam mensagens da IA, de robôs/campanhas, nem **abrir uma conversa**. Envio recusado (conversa de outro) não gera registro.
- **Matrículas**: `Leads.wonAt` no período, `ownerId` = consultor (mesma regra das Metas).
- Limite conhecido: mensagens digitadas direto no celular e encaminhamentos/enquetes/cartões não passam pelo envio do sistema e não têm autoria registrada; não entram na contagem.

## Tempo real
Cada ação que altera números (envio concluído, atividade no lead, tarefa criada/concluída, proposta enviada, matrícula, atribuição de conversa) chama `touchAnalytics(userId)`, que emite o evento `analytics` (sem números). O servidor só entrega esse evento ao próprio consultor e a quem pode vê-lo; as telas então relêem pela API, que aplica as permissões.

## Configuração (administração)
`Setting analytics_config`: horário de trabalho por consultor e dia da semana, janela de inatividade, metas diárias de conversas (a principal, gera alerta abaixo da meta) e de mensagens (opcional). Vale para os dois ambientes.

## Teste de aceite
`npm run test:analytics` (`scripts/analytics-e2e.js`): mesma produção de João pelas duas portas em hoje/7 dias/mês/intervalo, João sem acesso aos números de Gabrielli e Laura, coordenação limitada ao polo, exportação, configuração e eventos em tempo real.

## Estatísticas do comercial (`GET /analytics/commercial`)
Serviço `AnalyticsServices/SalesInsights.ts`. A gestão vê os consultores que pode ver (`poloId` e `userId` filtram); qualquer outra pessoa vê só os próprios números, seja qual for a query.

| Bloco | De onde vem |
|---|---|
| Volume | conversas, pessoas contatadas e novos contatos (pessoa que nunca tinha recebido mensagem humana) |
| Onde para no funil | `LeadActivities type='stage'` (`meta.from`): tempo médio em cada coluna até sair dela; leads abertos parados há mais de 7 dias (`STALL_DAYS`) por coluna e por consultor |
| Objeções | a revisão diária da IA (`ConsultantReviews`), o que o agente de IA registrou (`LeadCommercials.slots.objectionType`) e os motivos de perda (`Leads.lostReason`) |
| Vendas | `Leads.wonAt` + `LeadEnrollments`, por consultor, por cidade (do polo; sem polo, a cidade do lead) e por curso, e os 5 maiores consultor × curso |
| Grades | grades enviadas (`grade_sent`), leads que passaram da etapa de grade sem grade enviada, análises curriculares por consultor |
| Áudio | áudios enviados e % das conversas da pessoa com áudio |
| Processo | progresso médio (`CopilotSnapshots`), etapas mais puladas (etapa obrigatória não feita com uma etapa posterior feita), matriculados sem proposta e sem grade, e o que faltava no momento da matrícula (`LeadActivities type='process_at_enroll'`, gravado por `EnrollLead` antes de a matrícula marcar ficha, taxa e comprovante como feitos) |

## Revisão diária pela IA e treinamento sugerido
- **Worker** `workers/ConsultantReview.ts`: uma vez por dia, depois de `consultant_review_hour` (19 h no fuso da empresa), lê as conversas com mensagem humana de consultor no dia (até `consultant_review_max_tickets`, 60). Desliga com `consultant_review_enabled = "false"`.
- **Precisa** de um agente ativo com provider `openai` e chave. Respeita os limites diários de gasto (`Budget`); o uso entra em Custos como "Resumos e leituras".
- **O que vai para a IA:** só o texto das últimas 40 mensagens, com CPF, RG, telefones, e-mails, CEP, números longos e os nomes do lead e do consultor trocados por marcadores (`scrub`).
- **O que fica gravado** (`ConsultantReviews`): só códigos (objeção e se foi respondida, etapas difíceis, etapas puladas) e uma nota curta sem dados pessoais. A limpeza noturna apaga depois de 400 dias.
- **`GET /analytics/coaching`** (gestão): o que se repete por consultor. Regra fixa: no mínimo 5 conversas lidas, 3 ocorrências e 30% das conversas (objeção: metade sem resposta). Também lista os pontos fortes.
- **`POST /analytics/coaching/text`** (gestão): uma frase de treinamento por pessoa, escrita pela IA só a partir desses códigos (sem nomes), com cache de 24 h.
- **`POST /analytics/coaching/run`** (administrador): faz a leitura do dia na hora.
- **Aviso:** os últimos 14 dias entram em "Alertas e oportunidades" (`training_needed`) e no e-mail diário de pendências ("Treinamento sugerido").

## Estatísticas da tutoria (`GET /analytics/tutoria`)
A gestão vê todos os tutores e o painel por tutor (`tutorPanel`); o tutor e o acadêmico veem só os próprios alunos. Inclui: alunos sem mensagem do tutor há 7 dias, em risco (15 dias sem conversa, e com taxa em aberto), rematrículas, NPS no período e onde a ambientação para (primeira etapa do checklist não marcada).
