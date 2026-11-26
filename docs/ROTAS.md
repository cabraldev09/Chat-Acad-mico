# Rotas da API (604)

Públicas: 40 · logado (qualquer perfil): 329 · gestão: 182 · admin: 44

## Quem vê quais leads no CRM (middleware/scope.ts)

| Perfil | Vê |
|---|---|
| admin | todos os leads, de todos os polos |
| coordenacao | só os leads dos polos em que está (Polos e equipes); sem polo, nenhum. Um lead ainda sem polo fica com a administração |
| consultor | só os leads em que é o responsável |
| tutor, academico | os leads em que é o responsável e os alunos dados a ele (Ambientação e Alunos da tutoria: também os do seu polo ainda sem tutor) |
| relacionamento | só os matriculados dos polos em que está; sem polo, nenhum |

A mesma regra vale nas telas do CRM de leads: lista, quadro, busca, ficha do lead e o que pende dela (atividades, tarefas, propostas,
cobranças, documentos), contagens do Painel do CRM, novos para conferir, tarefas da equipe, Relatório do CRM (CSV), Matrículas
realizadas, comissões, Alunos da tutoria e Avisos da tutoria, Retenção e os avisos em tempo real de lead, risco e satisfação.
A coordenação continua com os poderes da gestão (`isAdminReq`): o que muda é o que ela vê. Ela só muda a equipe e os dados (cidades
atendidas, nome, exclusão, importação) dos polos em que está.

## Conversas, contatos, metas e painéis por polo (helpers/TicketPoloScope.ts)

| Perfil | Conversas e contatos |
|---|---|
| admin | todos |
| coordenacao | as conversas dadas a ela e as dos seus polos: fila de um dos seus polos ou contato que é lead de um deles. Conversa sem polo (fila sem polo e contato que não é lead dos seus polos) fica com a administração. Sem polo, nenhuma |
| relacionamento | as conversas dadas a ele e as dos alunos matriculados dos seus polos (a fila do Relacionamento não tem polo) |
| consultor, tutor, academico | sem mudança: as próprias e as que esperam nas suas filas |

- A regra vale no backend em todas as portas:
  - lista, busca e contagens (`ListTicketsService`);
  - conversa, mensagens, alterar, excluir e marcar como lida (`assertTicketAccess`, `readAll`);
  - tempo real (`joinChatBox`, `ticket`, `appMessage`, `typing`, `aiHandoff`, `handoffAlert`);
  - contatos: lista, planilha, ficha, busca por número (`POST /contact`) e exclusão.
- **Conversa sem polo é da administração (triagem de entrada):** o primeiro contato no número compartilhado, antes de virar lead
  com polo, não aparece para nenhuma coordenação; a coordenação sem polo vinculado não vê nenhuma conversa nem contato. Antes de
  liberar a coordenação, confira os vínculos de polo (Polos e equipes).
- **Avisos com dados de pessoas** vão à administração e só à coordenação do polo envolvido (`managerIdsOfPolos`,
  `managerIdsOfUser`); lead ou análise sem polo, só à administração:
  - lead encaminhado pela IA, prazo escalado e treinamento sugerido (sino);
  - indicação de afiliado (e-mail com nome, telefone e curso; `ReferralNotice`);
  - ambientação atrasada (sino com o nome do aluno; `OnboardingSla`);
  - retorno da análise curricular sem resposta há dois dias úteis (e-mail e tempo real com os candidatos; `FollowUpAlert`).
- **Metas:** todos os logados leem as metas de todos os polos e consultores (`GET /goals`, `/goals/polos`,
  `/dashboard/polos-progress`; decisão do dono registrada em 2026-11-25). A coordenação muda só:
  - a linha dos seus polos (e não cria polo pela importação);
  - metas de equipe em que todas as pessoas estão nos seus polos.

  O ciclo inteiro (criar, datas, excluir, repetir, adiar, dias úteis) é da administração.
- **Painéis** (`/dashboard`, `/dashboard/management`, `/dashboard/manager`, `/dashboard/management/feedback`):
  - a coordenação vê os números dos seus polos;
  - em `/dashboard/manager`, as metas de todos os polos continuam visíveis;
  - estatísticas de consultores e "Equipe agora": coordenação sem polo não vê ninguém.

**Ainda NÃO isolado por polo para a coordenação (fica para um PR próprio):**
- agendamentos (`/schedules`: o texto da mensagem e o contato; evento em tempo real `schedule`);
- campanhas e listas de contatos (`/campaigns`, `/contact-lists`; eventos `campaign` e `contactList`): só o tutor é limitado
  ao que é dele; a gestão (administração e coordenação) vê todas.

Até lá, não crie usuários de coordenação nem de relacionamento para franquias diferentes.

## Públicas (sem login)

- POST /portal/login (analysisRoutes.ts)
- GET /portal/token/:token (analysisRoutes.ts)
- POST /portal/activate (analysisRoutes.ts)
- POST /portal/forgot (analysisRoutes.ts)
- GET /portal/me (analysisRoutes.ts)
- GET /portal/versions/:id (analysisRoutes.ts)
- POST /portal/upload (analysisRoutes.ts)
- PUT /portal/password (analysisRoutes.ts)
- POST /login (authRoutes.ts)
- POST /forgot (authRoutes.ts)
- GET /reset/:token (authRoutes.ts)
- POST /reset (authRoutes.ts)
- POST /refresh_token (authRoutes.ts)
- GET /:slug (courseLandingRoutes.ts)
- POST /:slug/lead (courseLandingRoutes.ts)
- POST /efi/:secret/pix (efiWebhookRoutes.ts)
- POST /efi/:secret/billet (efiWebhookRoutes.ts)
- POST /efi/:secret (efiWebhookRoutes.ts)
- GET /:token (enrollmentFormPublicRoutes.ts)
- PUT /:token (enrollmentFormPublicRoutes.ts)
- POST /:token/files/:kind (enrollmentFormPublicRoutes.ts)
- DELETE /:token/files/:kind (enrollmentFormPublicRoutes.ts)
- POST /:token/submit (enrollmentFormPublicRoutes.ts)
- GET /_aluna.webp (leadFormRoutes.ts)
- GET /:token (leadFormRoutes.ts)
- GET /:token/u/:slug (leadFormRoutes.ts)
- POST /:token/u/:slug/submit (leadFormRoutes.ts)
- POST /:token/submit (leadFormRoutes.ts)
- GET /meta (metaWebhookRoutes.ts)
- POST /meta (metaWebhookRoutes.ts)
- GET /meta/:whatsappId (metaWebhookRoutes.ts)
- POST /meta/:whatsappId (metaWebhookRoutes.ts)
- GET /:token (proposalPublicRoutes.ts)
- GET /:token/pdf (proposalPublicRoutes.ts)
- GET /widget.js (webchatRoutes.ts)
- GET /:token/config (webchatRoutes.ts)
- POST /:token/messages (webchatRoutes.ts)
- GET /:token/messages (webchatRoutes.ts)
- POST /:token/typing (webchatRoutes.ts)
- GET /:token/demo (webchatRoutes.ts)

## Para revisar: alteram dados e só pedem login, sem checagem de escopo

- POST /analysis/curricular (analysisRoutes.ts)
- PUT /analysis/curricular/:id/enrollment (analysisRoutes.ts)
- POST /analysis/curricular/:id/send-proposal (analysisRoutes.ts)
- PUT /analysis/curricular/:id (analysisRoutes.ts)
- PUT /analysis/curricular/:id/subject/:subjectId (analysisRoutes.ts)
- POST /analysis/curricular/:id/subject (analysisRoutes.ts)
- DELETE /analysis/curricular/:id/subject/:subjectId (analysisRoutes.ts)
- DELETE /analysis/curricular/:id (analysisRoutes.ts)
- POST /analysis/academic (analysisRoutes.ts)
- PUT /analysis/academic/:id (analysisRoutes.ts)
- DELETE /analysis/academic/:id (analysisRoutes.ts)
- POST /students (analysisRoutes.ts)
- PUT /students/:id (analysisRoutes.ts)
- POST /students/:id/invite (analysisRoutes.ts)
- POST /students/:id/upload (analysisRoutes.ts)
- POST /grades/import-defaults (analysisRoutes.ts)
- POST /grades/refresh (analysisRoutes.ts)
- POST /grades/:id/send (analysisRoutes.ts)
- DELETE /grades/:id (analysisRoutes.ts)
- DELETE /logout (authRoutes.ts)
- POST /contacts/import (contactRoutes.ts)
- POST /contacts (contactRoutes.ts)
- POST /contact (contactRoutes.ts)
- POST /uploads (extraRoutes.ts)
- PUT /me/phone (extraRoutes.ts)
- POST /analytics/insights/dismiss (extraRoutes.ts)
- POST /schedules (extraRoutes.ts)
- PUT /schedules/:id (extraRoutes.ts)
- POST /schedules/:id/cancel (extraRoutes.ts)
- DELETE /schedules/:id (extraRoutes.ts)
- PUT /me/preferences (extraRoutes.ts)
- POST /course-materials/:id/send (extraRoutes.ts)
- POST /leads (extraRoutes.ts)
- POST /leads/import (extraRoutes.ts)
- POST /leads/from-contact/:contactId (extraRoutes.ts)
- PUT /notifications/read-all (extraRoutes.ts)
- PUT /notifications/:id/read (extraRoutes.ts)
- POST /tutoria/issues (extraRoutes.ts)
- PUT /tutoria/issues/:id (extraRoutes.ts)
- PUT /tutoria/audit/settings (extraRoutes.ts)
- POST /tutoria/audit/run (extraRoutes.ts)
- POST /tutoria/protocols (extraRoutes.ts)
- POST /tutoria/protocols/:id/resolve (extraRoutes.ts)
- POST /tutoria/students/import (extraRoutes.ts)
- POST /tutoria/students/:leadId/conversation (extraRoutes.ts)
- POST /proposals/preview (extraRoutes.ts)
- POST /proposals (extraRoutes.ts)
- PUT /me/efi (extraRoutes.ts)
- DELETE /me/efi (extraRoutes.ts)
- PUT /commissions/:id/settle (extraRoutes.ts)
- POST /messages/forward-batch (messageRoutes.ts)
- POST /quickAnswers (quickAnswerRoutes.ts)
- PUT /quickAnswers/:quickAnswerId (quickAnswerRoutes.ts)
- DELETE /quickAnswers/:quickAnswerId (quickAnswerRoutes.ts)
- PUT /settings/:settingKey (settingRoutes.ts)
- PUT /tickets/read-all (ticketRoutes.ts)
- POST /tickets (ticketRoutes.ts)

## Alteram dados com checagem de escopo

- POST /grades → gradeBatchLimit
- PUT /contacts/:contactId → canAccessContact
- PUT /contacts/:contactId/no-reply → canAccessContact
- PUT /contacts/:contactId/staff → canAccessContact
- PUT /contacts/:contactId/relation → canAccessContact
- PUT /contacts/:contactId/community → canAccessContact
- POST /affiliates → affiliateStaff
- PUT /affiliates/:id → affiliateStaff, canAccessAffiliate
- POST /affiliates/:id/rotate-token → affiliateStaff, canAccessAffiliate
- POST /affiliates/:id/referrals → affiliateStaff, canAccessAffiliate
- POST /affiliates/:id/attach-lead → affiliateStaff, canAccessAffiliate
- POST /affiliates/:id/send-portal → affiliateStaff, canAccessAffiliate
- POST /affiliates/:id/send-access-email → affiliateStaff, canAccessAffiliate
- POST /affiliates/:id/send-proposal → affiliateStaff, canAccessAffiliate
- POST /affiliate-materials → affiliateStaff
- PUT /affiliate-materials/:id → affiliateStaff
- DELETE /affiliate-materials/:id → affiliateStaff
- POST /affiliate-materials/:id/release → affiliateStaff
- POST /affiliate-campaigns → affiliateStaff
- PUT /affiliate-campaigns/:id → affiliateStaff
- DELETE /affiliate-campaigns/:id → affiliateStaff
- POST /affiliate-campaigns/:id/release → affiliateStaff
- PUT /tickets/:ticketId/tags → canWriteTicket
- PUT /contacts/:contactId/tags → canAccessContact
- POST /campaigns → salesStaff
- POST /campaigns/preflight → salesStaff
- PUT /campaigns/:id → salesStaff, ownCampaign
- DELETE /campaigns/:id → salesStaff, ownCampaign
- POST /campaigns/:id/start → salesStaff, ownCampaign
- POST /campaigns/:id/pause → salesStaff, ownCampaign
- POST /campaigns/:id/cancel → salesStaff, ownCampaign
- POST /campaigns/:id/retry-failed → salesStaff, ownCampaign
- POST /campaigns/:id/duplicate → salesStaff, ownCampaign
- POST /campaigns/:id/test → salesStaff, ownCampaign
- POST /campaigns/:id/remove-no-consent → salesStaff, ownCampaign
- POST /contact-lists → salesStaff
- POST /contact-lists/from-leads → salesStaff
- PUT /contact-lists/:id → salesStaff, ownList
- DELETE /contact-lists/:id → salesStaff, ownList
- POST /contact-lists/:id/import → salesStaff, notTutor
- DELETE /contact-lists/:id/items/:itemId → salesStaff, ownList
- PUT /retention/config → loadCrmPolos, isRetentionOperator
- POST /retention/run → loadCrmPolos, isRetentionOperator
- POST /retention/contact/:leadId → loadCrmPolos
- POST /retention/preview → loadCrmPolos
- POST /retention/send → loadCrmPolos
- POST /retention/nps/send/:leadId → loadCrmPolos
- POST /retention/risk/:leadId/message → loadCrmPolos
- POST /retention/rematricula/:leadId → loadCrmPolos
- PUT /leads/:id/documents/:docId → canAccessLead
- POST /leads/:id/documents/remind → canAccessLead
- POST /leads/:id/enrollment-form → canAccessLead
- POST /leads/:id/enrollment-form/send → canAccessLead
- POST /tickets/:ticketId/enrollment-form → canWriteTicket
- PUT /leads/:id → canAccessLead
- PUT /leads/:id/stage → canAccessLead
- POST /leads/:id/relation → canAccessLead
- POST /leads/:id/activities → canAccessLead
- POST /leads/:id/tasks → canAccessLead
- POST /leads/:id/open-ticket → canAccessLead
- POST /tutoria/notices/preview → tutoriaStaff
- POST /tutoria/notices → tutoriaStaff
- POST /send-releases → campaignStaff
- PUT /leads/:id/onboarding/access → canAccessOnboarding
- POST /leads/:id/onboarding/access/send → canAccessOnboarding
- PUT /leads/:id/onboarding/checklist → canAccessOnboarding
- POST /leads/:id/enrollment-proof → canAccessLead
- POST /leads/:id/enroll → canAccessLead
- POST /leads/:id/onboarding → canAccessOnboarding
- PUT /leads/:id/onboarding → canAccessOnboarding
- PUT /leads/:id/tasks/:taskId → canAccessLead
- POST /leads/:id/tasks/:taskId/toggle → canAccessLead
- PUT /leads/:id/tasks/:taskId/done → canAccessLead
- DELETE /leads/:id/tasks/:taskId → canAccessLead
- PUT /proposals/:id → canAccessProposal
- DELETE /proposals/:id → canAccessProposal
- POST /proposals/:id/duplicate → canAccessProposal
- POST /proposals/:id/send → canAccessProposal
- POST /leads/:id/payments → canAccessLead
- POST /payments/:id/refresh → canAccessPayment
- POST /payments/:id/cancel → canAccessPayment
- POST /payments/:id/send → canAccessPayment
- POST /messages/:ticketId/contact → canSendTicket
- POST /messages/:ticketId/poll → canSendTicket
- POST /messages/:ticketId → canSendTicket
- DELETE /messages/:messageId → canWriteMessage
- PUT /messages/:messageId → canWriteMessage
- PUT /messages/:messageId/star → canWriteMessage
- POST /messages/:messageId/media → canWriteMessage
- POST /messages/:messageId/react → canWriteMessage
- POST /messages/:messageId/forward → canWriteMessage
- POST /tickets/:ticketId/phone → canSendTicket, phoneLimiter
- PUT /tickets/:ticketId/copilot/progress → canWriteTicket
- POST /tickets/:ticketId/suggest-reply → canSendTicket
- POST /tickets/:ticketId/handoff-team → canSendTicket
- POST /tickets/:ticketId/copilot/brief → canReadTicket
- PUT /tickets/:ticketId/copilot/requests/:requestId/feedback → canReadTicket
- PUT /tickets/:ticketId/copilot/requests/:requestId/take → canSendTicket
- PUT /tickets/:ticketId/pin → canReadTicket
- POST /tickets/:ticketId/claim → canWriteTicket
- POST /tickets/:ticketId/take → canReadTicket
- POST /tickets/:ticketId/ai → canWriteTicket
- POST /tickets/:ticketId/reply-dismiss → canWriteTicket
- PUT /tickets/:ticketId/archive → canWriteTicket
- PUT /tickets/:ticketId/unread → canWriteTicket
- POST /tickets/:ticketId/typing → canWriteTicket
- PUT /tickets/:ticketId → canWriteTicket
- PUT /users/:userId → canEditUser
- POST /whatsapp/mine → canConnectOwnQr
- PUT /whatsapp/:whatsappId → canManageWhatsapp
- POST /whatsapp/:whatsappId/import-history → canManageWhatsapp
- POST /whatsappsession/:whatsappId → canManageWhatsapp
- PUT /whatsappsession/:whatsappId → canManageWhatsapp
- DELETE /whatsappsession/:whatsappId → canManageWhatsapp

## Painel da gestão (admin e coordenação)

- GET /dashboard/management (extraRoutes.ts)
- POST /dashboard/management/feedback (extraRoutes.ts)
