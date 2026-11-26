# Tarefas e avisos

## Tarefas (`LeadTasks`)
- **O que cada tarefa é** (`kind`): `manual`, `handoff` (lead encaminhado pela IA), `proposal`, `transcript` (pedir o histórico), `callback`,
  `billet` (enviar o boleto), `onboarding`, `onboarding_late`, `followup`, `nps`, `retention`, `referral`, `upsell`.
- **Prioridade** (`priority`: `high` ou `normal`); a conversa da tarefa (`ticketId`); quem criou (`createdById`); por que fechou (`closedReason`).
- **Fecham sozinhas** (`services/CrmServices/TaskLifecycle.ts`):

| Quando | Fecha | Motivo |
|---|---|---|
| Alguém da equipe responde o lead | `handoff` | `replied` |
| Chega um PDF do lead ou uma análise curricular é criada para ele | `transcript` (e o lead sai de "Aguardando histórico" para "Análise curricular") | `transcript_received` |
| A taxa de matrícula é paga | `billet` | `paid` |
| A ambientação é concluída | `onboarding`, `onboarding_late` | `onboarding_done` |
| O lead vira matriculado | tudo da venda (ficam as da ambientação, indicação, nova venda, NPS e retenção) | `lead_won` |
| O lead é perdido | tudo | `lead_lost` |

- **Telas e permissões:**
  - Concluir diz o que quer (`PUT /leads/:id/tasks/:taskId/done` com `done: true|false`): um clique numa tarefa que o sistema acabou de fechar não a reabre.
  - Só a gestão passa uma tarefa para outra pessoa. A pessoa só mexe nas tarefas dela, nas que criou e nas sem responsável. Apagar fica no histórico do lead.
  - A tela (`/crm/tarefas`) tem as abas Atrasadas, Hoje (só o que ainda vence hoje, sem repetir as atrasadas), Próximos, Todas abertas e Concluídas, com os números de `GET /lead-tasks/counts`. Urgentes vêm primeiro.
  - Cada linha tem: abrir a conversa, remarcar (1 hora, amanhã às 9h, escolher) e, para a gestão, passar para outra pessoa.
  - Quando uma tarefa muda de mãos (a varredura de 5 min ou a gestão), a nova pessoa recebe o aviso e o lembrete volta a valer para ela.

## Central de avisos (`Notifications`)
- **Onde aparece:** cada aviso fica para a pessoa até ser lido (o sino, aba "Avisos") e também chega na hora (`notification`, só para a própria pessoa).
- **Sem repetição:** a `dedupeKey` impede o mesmo aviso duas vezes. A limpeza noturna apaga os lidos depois de 30 dias e qualquer um depois de 90.
- **Rotas** (cada pessoa só vê e marca os seus): `GET /notifications`, `GET /notifications/count`, `PUT /notifications/:id/read`, `PUT /notifications/read-all`.
- **Serviço:** `services/NotificationServices/Notify.ts` (`notify`, `notifyManagers`).

| Aviso | Para quem |
|---|---|
| Tarefa nova ou passada para a pessoa (`task_assigned`) | quem recebe |
| Tarefa em 15 minutos (`task_soon`) | quem tem a tarefa |
| Lead encaminhado pela IA (`ai_handoff`) | quem atende (ou a gestão, quando ninguém pôde) |
| Prazo de resposta a 70% (`sla_soon`), excedido (`sla_breached`), escalado (`sla_escalated`) | quem atende; o escalado também para a gestão |
| Lead novo na fila comum (`queue_lead`, só com a fila ligada) | todos os consultores, uma vez cada; é marcado como lido quando alguém assume |
| Proposta aberta pelo lead (`proposal_viewed`) | o dono do lead e quem fez a proposta |
| Taxa paga (`payment_paid`) | o dono do lead e quem recebe a comissão |
| Ambientação atrasada (`onboarding_late`) | a gestão (e uma tarefa sem responsável, não uma por gestor) |
| Envios pausados pela proteção (`safety_paused`) | a gestão |
| Recomendação do OpenBot (`openbot`), gravada pela API (`POST /api/v1/insights`, sem dados de pessoas; título começa com "OpenBot:") | **só a administração** (não a coordenação): é da operação inteira, e a equipe não tem polo |
| Número fora do ar ou com o token vencendo (`connection_*`) | a gestão (o e-mail tem um controle de 6 h por motivo) |
| Orçamento a 80% e 100% (`budget`) | a gestão (o do mês não repete todo dia) |
| Trabalho sem responsável há 30 min (`unassigned`) | a gestão, no máximo uma vez por hora |
| Treinamento sugerido (`training`) | a gestão, uma vez por semana por consultor |
